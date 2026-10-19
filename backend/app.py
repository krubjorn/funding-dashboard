"""Flask API + static React build.  Run: python backend/app.py"""
import json, re, time, datetime as dt
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import pandas as pd, numpy as np, requests
from flask import Flask, jsonify, request, send_from_directory

ROOT = Path(__file__).resolve().parent.parent
CFG = json.loads((Path(__file__).parent / "config.json").read_text())
DIST = ROOT / "frontend" / "dist"
app = Flask(__name__, static_folder=None)
GTR = "https://gtr.ukri.org/gtr/api/projects"
_cache = {}   # key -> (timestamp, value)

def fy_label(v):
    d = re.findall(r"\d{4}", str(v))
    return f"20{d[0][:2]}/{d[0][2:]}" if d else None

def load():
    a = pd.read_csv(ROOT / "data" / "applications.csv").drop_duplicates("Project Ref", keep="last")
    a["Awarded"] = pd.to_numeric(a["Amount Awarded"].astype(str).str.replace(r"[£,]", "", regex=True), errors="coerce").fillna(0)
    a["Outcome"] = np.select([a["Approved"] == 1, a["Fund Deci Status Desc"].eq("Rejected by funder"), a["Fund Deci Status Desc"].eq("Submitted to funder")],
                             ["Successful", "Unsuccessful", "Pending"], "Unknown")
    a["DecisionYear"] = pd.to_datetime(a["Funder Decision Date *"], dayfirst=True, errors="coerce").dt.year
    a["FY"] = a["Financial Year"].map(fy_label)
    apps = a.rename(columns={"Project Ref": "ref", "Short Title": "title", "funder_name": "funder", "funder_code": "funderCode", "Award Type Group": "group",
                             "Scheme Type": "scheme", "department_name": "dept", "Lead Department?": "role"})
    apps = apps[["ref", "title", "funder", "funderCode", "group", "scheme", "dept", "role", "FY", "DecisionYear", "Awarded", "Outcome"]]
    s = pd.read_csv(ROOT / "data" / "project_summary.csv", parse_dates=["Awarded Start Date", "Awarded End Date"])
    s = s[(s["Lead Department (T)"] == CFG["lead_dept"]) & s["Costing Type (T)"].eq("Award") & s["Costing Status (T)"].eq("Approved")]
    s = s.dropna(subset=["Awarded Start Date"]).drop_duplicates("X5 Ref", keep="last")
    s["live"] = s["Awarded End Date"] >= pd.Timestamp(dt.date.today())
    proj = pd.DataFrame({"ref": s["X5 Ref"], "title": s["Project Title"], "funder": s["Funder Name"], "start": s["Awarded Start Date"].dt.strftime("%Y-%m-%d"),
                         "end": s["Awarded End Date"].dt.strftime("%Y-%m-%d"), "value": s["Total Price"], "live": s["live"]})
    return apps, proj

def tag(text, key):
    t = f" {str(text).lower()} "
    return [k for k, kws in CFG[key].items() if any(w in t for w in kws)] or ["Other"]

def gtr_fetch(q, pages=1, size=100):
    out = []
    for p in range(1, pages + 1):
        r = requests.get(GTR, params={"q": q, "s": size, "p": p}, headers={"Accept": "application/json"}, timeout=25)
        r.raise_for_status(); out += r.json().get("project", [])
    return out

def shape(p):
    ids = (p.get("identifiers") or {}).get("identifier", [])
    ref = next((i["value"] for i in ids if i.get("value")), "")
    text = f'{p.get("title","")} {p.get("abstractText","")}'
    f = p.get("fund") or {}
    return {"title": p.get("title"), "status": p.get("status"), "category": p.get("grantCategory"), "funder": p.get("leadFunder"),
            "dept": p.get("leadOrganisationDepartment"), "value": f.get("valuePounds"), "start": (f.get("start") or "")[:10],
            "link": f"https://gtr.ukri.org/projects?ref={ref}" if ref else p.get("href"), "abstract": p.get("abstractText") or "",
            "themes": tag(text, "themes"), "methods": tag(text, "methods")}

def cached(key, fn):
    ttl = CFG["gtr_cache_hours"] * 3600
    if key in _cache and time.time() - _cache[key][0] < ttl and not request.args.get("refresh"): return _cache[key][1]
    v = fn(); _cache[key] = (time.time(), v); return v

def summarise(rows):
    def count(k): 
        c = {}
        for r in rows:
            for x in r[k]: c[x] = c.get(x, 0) + 1
        return [{"name": n, "count": v} for n, v in sorted(c.items(), key=lambda z: -z[1])]
    return {"themes": count("themes"), "methods": count("methods")}

@app.get("/api/config")
def config(): return jsonify({"title": CFG["title"], "defaultSearch": CFG["gtr_default_search"]})

@app.get("/api/data")
def data():
    apps, proj = load()
    return jsonify({"apps": apps.replace({np.nan: None}).to_dict("records"), "projects": proj.replace({np.nan: None}).to_dict("records")})

@app.get("/api/themes/own")
def themes_own():
    """Live GtR lookup (exact title match) for our own awarded projects."""
    def run():
        _, proj = load()
        def one(title):
            try: return next((p for p in gtr_fetch(title, size=10) if p.get("title", "").strip().lower() == title.strip().lower()), None)
            except Exception: return None
        with ThreadPoolExecutor(6) as ex: hits = list(ex.map(one, proj["title"].dropna().tolist()))
        rows = [shape(h) for h in hits if h]
        return {"matched": len(rows), "total": len(proj), "rows": rows, **summarise(rows), "fetched": dt.datetime.now().isoformat(timespec="minutes")}
    try: return jsonify(cached("own", run))
    except Exception as e: return jsonify({"error": f"GtR unavailable: {e}"}), 502

@app.get("/api/themes/search")
def themes_search():
    """Landscape view: what topics/methods appear for any GtR search term."""
    q = request.args.get("q", CFG["gtr_default_search"]).strip()
    def run():
        rows = [shape(p) for p in gtr_fetch(q, pages=2)]
        return {"query": q, "rows": rows, **summarise(rows), "fetched": dt.datetime.now().isoformat(timespec="minutes")}
    try: return jsonify(cached("q:" + q.lower(), run))
    except Exception as e: return jsonify({"error": f"GtR unavailable: {e}"}), 502

@app.get("/", defaults={"path": ""})
@app.get("/<path:path>")
def spa(path):
    if path and (DIST / path).exists(): return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html") if DIST.exists() else ("Frontend not built. Run: cd frontend && npm install && npm run build", 200)

if __name__ == "__main__": app.run(port=5000, debug=False)
