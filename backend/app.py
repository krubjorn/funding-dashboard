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
    a = pd.read_csv(ROOT / "data" / "applications.csv").drop_duplicates("ref", keep="last")
    a["Awarded"] = pd.to_numeric(a["Amount Awarded"], errors="coerce").fillna(0)
    a["Outcome"] = np.select([a["Approved"] == 1, a["Fund Deci Status Desc"].eq("Rejected by funder"), a["Fund Deci Status Desc"].eq("Submitted to funder")],
                             ["Successful", "Unsuccessful", "Pending"], "Unknown")
    a["DecisionYear"] = pd.to_datetime(a["Decision Date"], dayfirst=True, errors="coerce").dt.year
    a["FY"] = a["Financial Year"].map(fy_label)
    a["group"] = a["Award Type Group"].replace(CFG["group_rename"])
    apps = a[["ref", "title", "funder", "funderCode", "group", "scheme", "dept", "role", "FY", "DecisionYear", "Awarded", "Outcome"]]
    s = pd.read_csv(ROOT / "data" / "project_summary.csv", parse_dates=["Awarded Start Date", "Awarded End Date"])
    s = s[s["Lead Department (T)"].isin(CFG["project_depts"]) & s["Costing Type (T)"].eq("Award") & s["Costing Status (T)"].eq("Approved")]
    s = s.dropna(subset=["Awarded Start Date"]).drop_duplicates("X5 Ref", keep="last")
    s["live"] = s["Awarded End Date"] >= pd.Timestamp(dt.date.today())
    proj = pd.DataFrame({"ref": s["X5 Ref"], "title": s["Project Title"], "dept": s["Lead Department (T)"], "funder": s["Funder Name"], "start": s["Awarded Start Date"].dt.strftime("%Y-%m-%d"),
                         "end": s["Awarded End Date"].dt.strftime("%Y-%m-%d"), "value": s["Total Price"], "live": s["live"]})
    return apps, proj

def load_gtr():
    g = pd.read_csv(ROOT / "data" / "gtr_awards.csv")
    return g.dropna(subset=["year"]).astype({"year": int})

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
    return jsonify({"apps": apps.replace({np.nan: None}).to_dict("records"), "projects": proj.replace({np.nan: None}).to_dict("records"),
                    "gtr": load_gtr().replace({np.nan: None}).to_dict("records")})

def detail(i):
    try:
        r = requests.get(f"{GTR}/{i}", headers={"Accept": "application/json"}, timeout=25); r.raise_for_status(); return r.json()
    except Exception: return {}

def discover(known):
    """Best effort: find further Oxford projects in the chosen departments straight from the UKRI API."""
    out = []
    try:
        base = "https://gtr.ukri.org/gtr/api/organisations"
        orgs = requests.get(base, params={"q": "University of Oxford", "s": 10}, headers={"Accept": "application/json"}, timeout=25).json().get("organisation", [])
        oid = next(o["id"] for o in orgs if o.get("name", "").strip().lower() == "university of oxford")
        first = requests.get(f"{base}/{oid}/projects", params={"s": 100, "p": 1}, headers={"Accept": "application/json"}, timeout=40).json()
        def page(p): return requests.get(f"{base}/{oid}/projects", params={"s": 100, "p": p}, headers={"Accept": "application/json"}, timeout=40).json().get("project", [])
        with ThreadPoolExecutor(6) as ex: pages = list(ex.map(page, range(2, int(first.get("totalPages", 1)) + 1)))
        for p in first.get("project", []) + [x for pg in pages for x in pg]:
            if p.get("leadOrganisationDepartment") in CFG["oxford_depts"] and p.get("id") not in known: out.append(p)
    except Exception: pass
    return out

@app.get("/api/oxford")
def oxford():
    """Oxford projects for the chosen departments: our UKRI file plus anything new found on the UKRI API."""
    def run():
        g = pd.read_csv(ROOT / "data" / "gtr_awards.csv"); g = g[g["dept"].isin(CFG["oxford_depts"])]
        seeds = g.replace({np.nan: None}).to_dict("records"); known = {r["id"] for r in seeds}
        extra = discover(known)
        ids = [r["id"] for r in seeds] + [p["id"] for p in extra]
        with ThreadPoolExecutor(6) as ex: det = dict(zip(ids, ex.map(detail, ids)))
        today = dt.date.today().isoformat(); rows = []
        for r in seeds:
            p = det.get(r["id"]) or {}; text = f'{r["title"]} {p.get("abstractText", "")}'
            rows.append({"id": r["id"], "title": r["title"], "dept": r["dept"], "funder": r["funder"], "year": r["year"], "start": r["start"], "end": r["end"], "value": r["award"],
                         "live": r["Status"] == "Active" or (r["end"] or "") >= today, "link": r["url"], "themes": tag(text, "themes"), "methods": tag(text, "methods")})
        for p in extra:
            f = p.get("fund") or {}; full = det.get(p["id"]) or p; text = f'{p.get("title", "")} {full.get("abstractText", "")}'
            ids_ = (p.get("identifiers") or {}).get("identifier", []); ref = next((i["value"] for i in ids_ if i.get("value")), "")
            rows.append({"id": p["id"], "title": p.get("title"), "dept": p.get("leadOrganisationDepartment"), "funder": p.get("leadFunder"), "year": int((f.get("start") or "0000")[:4]) or None,
                         "start": (f.get("start") or "")[:10], "end": (f.get("end") or "")[:10], "value": f.get("valuePounds"), "live": p.get("status") == "Active",
                         "link": f"https://gtr.ukri.org/projects?ref={ref}" if ref else p.get("href"), "themes": tag(text, "themes"), "methods": tag(text, "methods")})
        return {"rows": rows, "fetched": dt.datetime.now().isoformat(timespec="minutes")}
    return jsonify(cached("oxford", run))

@app.get("/", defaults={"path": ""})
@app.get("/<path:path>")
def spa(path):
    if path and (DIST / path).exists(): return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html") if DIST.exists() else ("Frontend not built. Run: cd frontend && npm install && npm run build", 200)

if __name__ == "__main__": app.run(port=5000, debug=False)
