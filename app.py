"""Smith School funding dashboard - configurable, minimal, PI names hidden by default.
Run: streamlit run app.py   (data lives in ./data, or upload your own in the sidebar)"""
import io, re, datetime as dt
from pathlib import Path
import numpy as np, pandas as pd, plotly.express as px, plotly.graph_objects as go
import requests, streamlit as st

# ----------------------------- CONFIG (edit me) -----------------------------
CONFIG = {
    "title": "Smith School · Research Funding",
    "lead_dept": "Smith School",                 # filters the Project summary export
    "data_dir": "data",
    "apps_file": "DeptProject_Full Data_data.csv",
    "summary_file": "Project summary.xlsx",
    "palette": ["#0B6E4F", "#2E86AB", "#F18F01", "#C73E1D", "#6C5B7B", "#7A9E9F", "#B8B8D1"],
    "default_units": "£ thousands",
    "show_pi_names": False,                      # sidebar toggle starts from this
    # keyword -> theme (used on titles / GtR abstracts). Extend freely.
    "themes": {
        "Nature & biodiversity": ["nature", "biodiversity", "ecosystem", "conservation", "forest", "species"],
        "Climate & net zero": ["climate", "carbon", "net zero", "emission", "transition", "adaptation"],
        "Sustainable finance": ["finance", "investor", "bank", "insurance", "capital", "esg", "pension"],
        "Water, flood & risk": ["flood", "water", "risk", "resilience", "disaster"],
        "Energy & infrastructure": ["energy", "infrastructure", "power", "grid", "renewable"],
        "Food, land & agriculture": ["agricultur", "food", "land use", "farm"],
        "Policy & governance": ["policy", "governance", "regulation", "government", "law"],
        "Data, AI & methods": ["data", "model", "machine learning", "ai ", "satellite", "remote sensing"],
    },
}
UNITS = {"£": 1, "£ thousands": 1e3, "£ millions": 1e6}
st.set_page_config(page_title=CONFIG["title"], page_icon="📊", layout="wide")
st.markdown("""<style>
.block-container{padding-top:1.6rem;max-width:1300px}
[data-testid="stMetric"]{background:var(--secondary-background-color);border-radius:12px;padding:14px 18px}
[data-testid="stMetricLabel"]{opacity:.7} h1{font-weight:700;letter-spacing:-.02em}
.stTabs [data-baseweb="tab"]{font-size:1rem;padding:8px 18px}
</style>""", unsafe_allow_html=True)

# ------------------------------- data loading -------------------------------
def fy_label(v):
    d = re.findall(r"\d{4}", str(v))
    if not d: return None
    a, b = d[0][:2], d[0][2:]
    return f"20{a}/{b}"

@st.cache_data(show_spinner="Loading data…")
def load(apps_bytes=None, summ_bytes=None):
    base = Path(CONFIG["data_dir"])
    a = pd.read_csv(io.BytesIO(apps_bytes) if apps_bytes else base / CONFIG["apps_file"], encoding="utf-8-sig")
    s = pd.read_excel(io.BytesIO(summ_bytes) if summ_bytes else base / CONFIG["summary_file"], sheet_name="Project summary")
    a = a.drop_duplicates("Project Ref", keep="last")                 # one row per application
    a["FY"] = a["Financial Year"].map(fy_label)
    a["DecisionDate"] = pd.to_datetime(a["Funder Decision Date *"], dayfirst=True, errors="coerce")
    a["DecisionYear"] = a["DecisionDate"].dt.year
    a["Awarded"] = pd.to_numeric(a["Amount Awarded"].astype(str).str.replace(r"[£,]", "", regex=True), errors="coerce").fillna(0)
    a["Outcome"] = np.select([a["Approved"] == 1, a["Fund Deci Status Desc"].eq("Rejected by funder"),
                              a["Fund Deci Status Desc"].eq("Submitted to funder")], ["Successful", "Unsuccessful", "Pending"], "Unknown")
    a["PI"] = a["PI/Co-I"].astype(str)
    s = s[(s["Lead Department (T)"] == CONFIG["lead_dept"]) & s["Costing Type (T)"].eq("Award") & s["Costing Status (T)"].eq("Approved")].copy()
    for c in ("Awarded Start Date", "Awarded End Date"): s[c] = pd.to_datetime(s[c], errors="coerce")
    s = s.dropna(subset=["Awarded Start Date"]).drop_duplicates("X5 Ref", keep="last")
    s["Live"] = s["Awarded End Date"] >= pd.Timestamp(dt.date.today())
    return a, s

def theme_of(text):
    t = f" {str(text).lower()} "
    hits = [k for k, kws in CONFIG["themes"].items() if any(w in t for w in kws)]
    return hits or ["Other"]

def money(x, u): return f"£{x/UNITS[u]:,.1f}{'' if u=='£' else 'k' if 'thou' in u else 'm'}"
def style(fig, h=420):
    fig.update_layout(height=h, margin=dict(l=0, r=0, t=40, b=0), colorway=CONFIG["palette"],
                      legend=dict(orientation="h", y=-0.2), font=dict(size=13), hovermode="x unified" if fig.data and fig.data[0].type in("bar","scatter") else "closest")
    return fig

# --------------------------------- sidebar ----------------------------------
st.title(CONFIG["title"])
with st.sidebar:
    st.header("Settings")
    up_a = st.file_uploader("Applications CSV (optional)", type="csv")
    up_s = st.file_uploader("Project summary XLSX (optional)", type="xlsx")
    try: apps, summ = load(up_a.getvalue() if up_a else None, up_s.getvalue() if up_s else None)
    except Exception as e: st.error(f"Could not load data: {e}"); st.stop()
    units = st.selectbox("Units", list(UNITS), index=list(UNITS).index(CONFIG["default_units"]))
    basis = st.radio("Year basis", ["Financial year", "Decision year"], horizontal=True)
    show_pi = st.toggle("Show PI names", CONFIG["show_pi_names"], help="Off by default - names are removed from every table and chart.")
    st.divider(); st.subheader("Filters")
    ycol = "FY" if basis == "Financial year" else "DecisionYear"
    years = sorted(apps[ycol].dropna().unique())
    yr = st.select_slider("Years", years, value=(years[0], years[-1])) if len(years) > 1 else (years[0], years[0])
    groups = st.multiselect("Funder group", sorted(apps["Award Type Group"].dropna().unique()))
    funders = st.multiselect("Funder", sorted(apps["funder_name"].dropna().unique()))
    lead = st.radio("Costing role", ["All", "Lead dept costings", "Collaborating dept costings"])
    st.caption("Empty filter = all.")

f = apps[(apps[ycol] >= yr[0]) & (apps[ycol] <= yr[1])]
if groups: f = f[f["Award Type Group"].isin(groups)]
if funders: f = f[f["funder_name"].isin(funders)]
if lead != "All": f = f[f["Lead Department?"] == lead]
win, dec = f[f.Outcome == "Successful"], f[f.Outcome.isin(["Successful", "Unsuccessful"])]
if f.empty: st.warning("No data for these filters."); st.stop()

c = st.columns(4)
c[0].metric("Applications", f"{len(f):,}")
c[1].metric("Successful", f"{len(win):,}")
c[2].metric("Success rate (decided)", f"{len(win)/len(dec):.0%}" if len(dec) else "–")
c[3].metric("Funding awarded", money(win.Awarded.sum(), units))
t1, t2, t3 = st.tabs(["💷 Funding awards", "✅ Application success", "🔎 Live projects & themes"])

# ------------------------------- tab 1: awards ------------------------------
with t1:
    by = st.radio("Break down by", ["Award Type Group", "funder_code", "Scheme Type"], horizontal=True,
                  format_func=lambda x: {"Award Type Group": "Funder group", "funder_code": "Funder", "Scheme Type": "Scheme type"}[x])
    g = win.groupby([ycol, by]).Awarded.sum().div(UNITS[units]).reset_index()
    fig = px.bar(g, x=ycol, y="Awarded", color=by, title=f"Funding awarded per year ({units})", labels={"Awarded": units, ycol: ""})
    st.plotly_chart(style(fig), width="stretch")
    l, r = st.columns(2)
    top = win.groupby("funder_name").Awarded.sum().div(UNITS[units]).nlargest(10).sort_values().reset_index()
    l.plotly_chart(style(px.bar(top, x="Awarded", y="funder_name", orientation="h", title="Top funders", labels={"Awarded": units, "funder_name": ""}), 380), width="stretch")
    sh = win.groupby("Award Type Group").Awarded.sum().reset_index()
    r.plotly_chart(style(px.pie(sh, names="Award Type Group", values="Awarded", hole=.55, title="Share by funder group"), 380), width="stretch")
    with st.expander("Data table"):
        cols = ["Project Ref", "Short Title", "funder_name", "Scheme Name", ycol, "Awarded"] + (["PI"] if show_pi else [])
        st.dataframe(win[cols].sort_values("Awarded", ascending=False), width="stretch", hide_index=True)

# ----------------------------- tab 2: success -------------------------------
with t2:
    y = f.groupby([ycol, "Outcome"]).size().reset_index(name="n")
    y["Outcome"] = pd.Categorical(y.Outcome, ["Successful", "Unsuccessful", "Pending", "Unknown"])
    fig = px.bar(y.sort_values("Outcome"), x=ycol, y="n", color="Outcome", barmode="group", title="Applications sent vs successful",
                 color_discrete_map={"Successful": CONFIG["palette"][0], "Unsuccessful": "#B0B0B0", "Pending": CONFIG["palette"][2], "Unknown": "#DDD"}, labels={"n": "Applications", ycol: ""})
    st.plotly_chart(style(fig), width="stretch")
    dim = st.selectbox("Success rate by", ["Award Type Group", "funder_code", "Scheme Type", ycol], format_func=lambda x: {"Award Type Group": "Funder group", "funder_code": "Funder", "Scheme Type": "Scheme type"}.get(x, "Year"))
    minn = st.slider("Minimum decided applications", 1, 20, 3)
    r = dec.groupby(dim).agg(Decided=("Outcome", "size"), Successful=("Approved", "sum")).reset_index()
    r["Rate"] = r.Successful / r.Decided
    r = r[r.Decided >= minn].sort_values("Rate")
    fig = px.bar(r, x="Rate", y=dim, orientation="h", text=r.apply(lambda x: f"{x.Rate:.0%}  ({int(x.Successful)}/{int(x.Decided)})", axis=1), title="Success rate (decided applications only)")
    fig.update_xaxes(tickformat=".0%").update_yaxes(title=""); fig.update_traces(marker_color=CONFIG["palette"][1], textposition="outside")
    st.plotly_chart(style(fig, max(300, 40 * len(r) + 120)), width="stretch")
    st.caption("Pending decisions are excluded from the rate. Each application counted once (latest costing version).")

# ------------------------- tab 3: live projects & themes --------------------
with t3:
    live = summ[summ.Live] if st.toggle("Only projects still running", True) else summ
    live = live.assign(Themes=live["Project Title"].map(theme_of))
    a1, a2, a3 = st.columns(3)
    a1.metric("Projects", len(live)); a2.metric("Total value", money(live["Total Price"].sum(), units)); a3.metric("Earliest end", f"{live['Awarded End Date'].min():%b %Y}" if len(live) else "–")
    tt = live.explode("Themes").groupby("Themes").agg(Projects=("X5 Ref", "nunique"), Value=("Total Price", "sum")).reset_index().sort_values("Value")
    tt["Value"] /= UNITS[units]
    l, r = st.columns(2)
    l.plotly_chart(style(px.bar(tt, x="Value", y="Themes", orientation="h", title=f"Value by theme ({units})", labels={"Themes": ""}), 400), width="stretch")
    live["Start"] = live["Awarded Start Date"].dt.year
    r.plotly_chart(style(px.bar(live.explode("Themes").groupby(["Start", "Themes"]).size().reset_index(name="n"), x="Start", y="n", color="Themes", title="Themes by award start year", labels={"n": "Projects", "Start": ""}), 400), width="stretch")
    show = live[["X5 Ref", "Project Title", "Funder Name", "Awarded Start Date", "Awarded End Date", "Total Price"]].copy()
    show["Themes"] = live["Themes"].map(", ".join)
    st.dataframe(show.sort_values("Awarded End Date"), width="stretch", hide_index=True)

    st.subheader("Abstracts from UKRI Gateway to Research")
    st.caption("Looks up each title on the public GtR API and re-tags themes from the abstract. Needs internet; UKRI-funded projects only.")
    if st.button("Fetch abstracts for these projects"):
        out, bar, titles = [], st.progress(0.0), live["Project Title"].dropna().astype(str).tolist()
        for i, title in enumerate(titles):
            try:
                rs = requests.get("https://gtr.ukri.org/gtr/api/projects", params={"q": title, "s": 5},
                                  headers={"Accept": "application/json"}, timeout=20).json().get("project", [])
                hit = next((p for p in rs if p.get("title", "").lower().strip() == title.lower().strip()), None)
                if hit:
                    ab = hit.get("abstractText", "")
                    out.append({"Project": title, "Link": f"https://gtr.ukri.org/projects?ref={hit.get('grantReference', '')}",
                                "Abstract": ab, "Themes": ", ".join(theme_of(ab))})
            except Exception: pass
            bar.progress((i + 1) / len(titles))
        st.session_state["gtr"] = pd.DataFrame(out)
    if "gtr" in st.session_state:
        g = st.session_state["gtr"]; st.success(f"Matched {len(g)} projects on GtR.")
        if len(g): st.dataframe(g, width="stretch", hide_index=True, column_config={"Link": st.column_config.LinkColumn()})
