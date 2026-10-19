import { useEffect, useMemo, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell } from "recharts";

const COLORS = ["#0B6E4F", "#2E86AB", "#F18F01", "#C73E1D", "#6C5B7B", "#7A9E9F", "#B8B8D1", "#8C6A5D", "#4C956C"];
const UNITS = { "£": [1, ""], "£ thousands": [1e3, "k"], "£ millions": [1e6, "m"] };
const GROUPS = { group: "Funder group", funderCode: "Funder", scheme: "Scheme type" };
const sum = (a, f) => a.reduce((s, x) => s + (f(x) || 0), 0);
const get = (u) => fetch(u).then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error || r.statusText); return j; });

function useData() {
  const [d, setD] = useState(null), [e, setE] = useState(null);
  useEffect(() => { get("/api/data").then(setD).catch(setE); }, []);
  return [d, e];
}
const Card = ({ title, children, h = 330 }) => (
  <div className="card"><h3>{title}</h3><div style={{ height: h }}>{children}</div></div>);
const Bars = ({ data, keys, x = "name", layout = "horizontal", stacked = true, fmt }) => (
  <ResponsiveContainer><BarChart data={data} layout={layout} margin={{ left: layout === "vertical" ? 90 : 0 }}>
    <CartesianGrid strokeOpacity={0.15} />
    {layout === "vertical" ? <><XAxis type="number" /><YAxis type="category" dataKey={x} width={170} tick={{ fontSize: 12 }} /></> : <><XAxis dataKey={x} /><YAxis /></>}
    <Tooltip formatter={fmt} />{keys.length > 1 && <Legend />}
    {keys.map((k, i) => <Bar key={k} dataKey={k} stackId={stacked ? "a" : undefined} fill={COLORS[i % COLORS.length]} />)}
  </BarChart></ResponsiveContainer>);
const Kpi = ({ v, l }) => <div className="card kpi"><b>{v}</b><span>{l}</span></div>;
const pivot = (rows, xk, gk, val) => {
  const m = {}, keys = new Set();
  rows.forEach((r) => { const x = r[xk], g = r[gk] || "Other"; keys.add(g); m[x] = m[x] || { name: x }; m[x][g] = (m[x][g] || 0) + val(r); });
  return [Object.values(m).sort((a, b) => String(a.name).localeCompare(String(b.name))), [...keys]];
};

export default function App() {
  const [d, err] = useData(), [tab, setTab] = useState(0);
  const [units, setUnits] = useState("£ thousands"), [basis, setBasis] = useState("FY"), [by, setBy] = useState("group");
  const [funder, setFunder] = useState(""), [group, setGroup] = useState(""), [from, setFrom] = useState(""), [liveOnly, setLiveOnly] = useState(true);
  const [div, sfx] = UNITS[units], money = (v) => `£${(v / div).toLocaleString(undefined, { maximumFractionDigits: 1 })}${sfx}`;

  const apps = useMemo(() => (d?.apps || []).filter((a) => (!funder || a.funder === funder) && (!group || a.group === group) && (!from || String(a[basis]) >= from)), [d, funder, group, from, basis]);
  if (err) return <div className="wrap err">Could not load data: {String(err)}</div>;
  if (!d) return <div className="wrap">Loading…</div>;
  const years = [...new Set(d.apps.map((a) => a[basis]).filter(Boolean))].sort(), uniq = (k) => [...new Set(d.apps.map((a) => a[k]).filter(Boolean))].sort();
  const won = apps.filter((a) => a.Outcome === "Successful"), decided = apps.filter((a) => ["Successful", "Unsuccessful"].includes(a.Outcome));
  const [awardRows, awardKeys] = pivot(won, basis, by, (a) => a.Awarded / div);
  const [appRows] = pivot(apps, basis, "Outcome", () => 1);
  const rate = Object.values(decided.reduce((m, a) => { const k = a[by] || "Other"; m[k] = m[k] || { name: k, n: 0, w: 0 }; m[k].n++; m[k].w += a.Outcome === "Successful"; return m; }, {}))
    .filter((r) => r.n >= 3).map((r) => ({ name: r.name, "Success rate %": Math.round((100 * r.w) / r.n), n: r.n })).sort((a, b) => a["Success rate %"] - b["Success rate %"]);
  const topF = Object.entries(won.reduce((m, a) => ((m[a.funder] = (m[a.funder] || 0) + a.Awarded / div), m), {})).map(([name, v]) => ({ name, "Awarded": +v.toFixed(1) })).sort((a, b) => b.Awarded - a.Awarded).slice(0, 10).reverse();
  const projs = d.projects.filter((p) => !liveOnly || p.live);

  return (<div className="wrap">
    <h1>Research Funding Dashboard</h1><div className="note">Smith School of Enterprise and the Environment · PI names are not included in this dataset.</div>
    <div className="tabs">{["💷 Funding awards", "✅ Application success", "📌 Live projects", "🔎 Research themes (UKRI GtR)"].map((t, i) =>
      <button key={t} className={"tab" + (tab === i ? " on" : "")} onClick={() => setTab(i)}>{t}</button>)}</div>

    {tab < 2 && <div className="bar">
      <label>Units<select value={units} onChange={(e) => setUnits(e.target.value)}>{Object.keys(UNITS).map((u) => <option key={u}>{u}</option>)}</select></label>
      <label>Year basis<select value={basis} onChange={(e) => { setBasis(e.target.value); setFrom(""); }}><option value="FY">Financial year</option><option value="DecisionYear">Decision year</option></select></label>
      <label>From<select value={from} onChange={(e) => setFrom(e.target.value)}><option value="">All</option>{years.map((y) => <option key={y}>{y}</option>)}</select></label>
      <label>Break down by<select value={by} onChange={(e) => setBy(e.target.value)}>{Object.entries(GROUPS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
      <label>Funder group<select value={group} onChange={(e) => setGroup(e.target.value)}><option value="">All</option>{uniq("group").map((x) => <option key={x}>{x}</option>)}</select></label>
      <label>Funder<select value={funder} onChange={(e) => setFunder(e.target.value)}><option value="">All</option>{uniq("funder").map((x) => <option key={x}>{x}</option>)}</select></label>
    </div>}

    {tab < 2 && <div className="kpis"><Kpi v={apps.length} l="Applications" /><Kpi v={won.length} l="Successful" />
      <Kpi v={decided.length ? Math.round((100 * won.length) / decided.length) + "%" : "–"} l="Success rate (decided)" /><Kpi v={money(sum(won, (a) => a.Awarded))} l="Funding awarded" /></div>}

    {tab === 0 && <div className="grid">
      <Card title={`Funding awarded per year (${units})`}><Bars data={awardRows} keys={awardKeys} fmt={(v) => v.toFixed(1)} /></Card>
      <Card title="Top funders"><Bars data={topF} keys={["Awarded"]} layout="vertical" /></Card></div>}
    {tab === 1 && <div className="grid">
      <Card title="Applications sent vs successful"><Bars data={appRows} keys={["Successful", "Unsuccessful", "Pending", "Unknown"].filter((k) => appRows.some((r) => r[k]))} stacked={false} /></Card>
      <Card title={`Success rate by ${GROUPS[by].toLowerCase()} (min. 3 decided)`} h={Math.max(330, rate.length * 34 + 60)}><Bars data={rate} keys={["Success rate %"]} layout="vertical" /></Card></div>}
    {tab === 2 && <><div className="bar"><label><span>Show</span><select value={liveOnly ? "live" : "all"} onChange={(e) => setLiveOnly(e.target.value === "live")}><option value="live">Still running</option><option value="all">All awarded</option></select></label></div>
      <div className="kpis"><Kpi v={projs.length} l="Projects" /><Kpi v={money(sum(projs, (p) => p.value))} l="Total value" /></div>
      <div className="card"><Table head={["Ref", "Title", "Funder", "Start", "End", "Value"]} rows={projs.map((p) => [p.ref, p.title, p.funder, p.start, p.end, money(p.value)])} /></div></>}
    {tab === 3 && <Themes />}
  </div>);
}

const Table = ({ head, rows }) => (<div style={{ overflowX: "auto", maxHeight: 520 }}><table><thead><tr>{head.map((h) => <th key={h}>{h}</th>)}</tr></thead>
  <tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}</tbody></table></div>);

function Themes() {
  const [mode, setMode] = useState("own"), [q, setQ] = useState(""), [res, setRes] = useState(null), [err, setErr] = useState(null), [busy, setBusy] = useState(false), [pick, setPick] = useState("");
  const run = (refresh) => { setBusy(true); setErr(null);
    get(mode === "own" ? `/api/themes/own${refresh ? "?refresh=1" : ""}` : `/api/themes/search?q=${encodeURIComponent(q || "nature recovery")}${refresh ? "&refresh=1" : ""}`)
      .then(setRes).catch((e) => { setErr(e.message); setRes(null); }).finally(() => setBusy(false)); };
  useEffect(() => { setRes(null); run(false); /* eslint-disable-next-line */ }, [mode]);
  const rows = (res?.rows || []).filter((r) => !pick || r.themes.includes(pick) || r.methods.includes(pick));
  return (<>
    <div className="bar">
      <label>Source<select value={mode} onChange={(e) => setMode(e.target.value)}><option value="own">Our awarded projects (matched on GtR)</option><option value="search">GtR search (any topic)</option></select></label>
      {mode === "search" && <label>Search term<input value={q} placeholder="e.g. biodiversity finance" onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && run(false)} /></label>}
      <button className="btn" onClick={() => run(true)} disabled={busy}>{busy ? "Fetching…" : "Refresh from GtR"}</button>
    </div>
    {err && <div className="card err">{err}. Check your internet connection and try again.</div>}
    {res && <><div className="note">{mode === "own" ? `Matched ${res.matched} of ${res.total} projects on GtR by exact title. ` : `${res.rows.length} projects for “${res.query}”. `}Live from the UKRI API · fetched {res.fetched}. Themes and methods are tagged by keywords in config.json. Click a bar to filter.</div>
      <div className="grid"><Card title="Research themes (projects)" h={Math.max(300, res.themes.length * 32 + 40)}><Click data={res.themes} onPick={setPick} /></Card>
        <Card title="Methods & approaches (projects)" h={Math.max(300, res.methods.length * 32 + 40)}><Click data={res.methods} onPick={setPick} /></Card></div>
      <div className="card" style={{ marginTop: 14 }}><h3>Projects {pick && <span className="pill" style={{ cursor: "pointer" }} onClick={() => setPick("")}>{pick} ✕</span>}</h3>
        <Table head={["Title", "Funder", "Themes", "Methods"]} rows={rows.map((r) => [<a href={r.link} target="_blank" rel="noreferrer">{r.title}</a>, r.funder, r.themes.map((t) => <span className="pill" key={t}>{t}</span>), r.methods.map((t) => <span className="pill" key={t}>{t}</span>)])} /></div></>}
  </>);
}
const Click = ({ data, onPick }) => (<ResponsiveContainer><BarChart data={data} layout="vertical" margin={{ left: 90 }}><CartesianGrid strokeOpacity={0.15} />
  <XAxis type="number" allowDecimals={false} /><YAxis type="category" dataKey="name" width={190} tick={{ fontSize: 12 }} /><Tooltip />
  <Bar dataKey="count" fill="#0B6E4F" cursor="pointer" onClick={(d) => onPick(d.name)} /></BarChart></ResponsiveContainer>);
