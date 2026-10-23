import { useEffect, useMemo, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, ZAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid, ScatterChart, Scatter } from "recharts";

const COLORS = ["#0B6E4F", "#2E86AB", "#F18F01", "#C73E1D", "#6C5B7B", "#7A9E9F", "#B8B8D1", "#8C6A5D", "#4C956C"];
const UNITS = { "£": [1, ""], "£ thousands": [1e3, "k"], "£ millions": [1e6, "m"] };
const GROUPS = { group: "Funder group", funderCode: "Funder", scheme: "Scheme type", dept: "Department and Centres" };
const yr = (x, basis) => (basis === "FY" ? `${x}/${String(x + 1).slice(2)}` : x);
const startYear = (v) => parseInt(String(v).slice(0, 4), 10);
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
  rows.forEach((r) => { const x = r[xk]; if (x == null) return; const g = r[gk] || "Other"; keys.add(g); m[x] = m[x] || { name: x }; m[x][g] = (m[x][g] || 0) + val(r); });
  return [Object.values(m).sort((a, b) => String(a.name).localeCompare(String(b.name))), [...keys]];
};

export default function App() {
  const [d, err] = useData(), [tab, setTab] = useState(0);
  const [units, setUnits] = useState("£ thousands"), [basis, setBasis] = useState("FY"), [by, setBy] = useState("group");
  const [funder, setFunder] = useState(""), [dept, setDept] = useState(""), [barDept, setBarDept] = useState("Geography - SoGE"), [group, setGroup] = useState(""), [from, setFrom] = useState(""), [liveOnly, setLiveOnly] = useState(true);
  const [div, sfx] = UNITS[units], money = (v) => `£${(v / div).toLocaleString(undefined, { maximumFractionDigits: 1 })}${sfx}`;

  const apps = useMemo(() => (d?.apps || []).filter((a) => (!funder || a.funder === funder) && (!dept || a.dept === dept) && (!group || a.group === group) && (!from || String(a[basis]) >= from)), [d, funder, dept, group, from, basis]);
  if (err) return <div className="wrap err">The dashboard could not load. Please refresh the page.</div>;
  if (!d) return <div className="wrap">Loading</div>;
  const years = [...new Set(d.apps.map((a) => a[basis]).filter(Boolean))].sort(), uniq = (k) => [...new Set(d.apps.map((a) => a[k]).filter(Boolean))].sort();
  const won = apps.filter((a) => a.Outcome === "Successful"), decided = apps.filter((a) => ["Successful", "Unsuccessful"].includes(a.Outcome));
  const [awardRows, awardKeys] = pivot(won, basis, by, (a) => a.Awarded / div);
  const [appRows] = pivot(apps, basis, "Outcome", () => 1);
  const rate = Object.values(decided.reduce((m, a) => { const k = a[by] || "Other"; m[k] = m[k] || { name: k, n: 0, w: 0 }; m[k].n++; m[k].w += a.Outcome === "Successful"; return m; }, {}))
    .filter((r) => r.n >= 3).map((r) => ({ name: r.name, "Success rate": Math.round((100 * r.w) / r.n), n: r.n })).sort((a, b) => a["Success rate"] - b["Success rate"]);
  const depts = uniq("dept"), tot = won.reduce((m, a) => ((m[a.funder] = (m[a.funder] || 0) + a.Awarded), m), {});
  const top10 = Object.keys(tot).sort((a, b) => tot[b] - tot[a]).slice(0, 10).reverse();
  const topF = top10.map((f) => ({ name: f, ...Object.fromEntries(depts.map((dp) => [dp, +(won.filter((a) => a.funder === f && a.dept === dp).reduce((t, a) => t + a.Awarded, 0) / div).toFixed(2)])) }));
  const gt = (d.gtr || []).filter((g) => (!dept || g.dept === dept) && (!funder || g.funder === funder) && (!from || basis !== "DecisionYear" || g.year >= +from));
  const gDepts = [...new Set((d.gtr || []).map((g) => g.dept))].sort();
  const bd = Object.entries((d.gtr || []).filter((g) => g.dept === barDept).reduce((m, g) => ((m[g.year] = (m[g.year] || 0) + (g.award || 0)), m), {})).map(([year, v]) => ({ name: year, "Total award": +(v / div).toFixed(2) }));
  const gb = Object.values(gt.reduce((m, g) => { const k = g.dept + g.year + g.funder; m[k] = m[k] || { dept: g.dept, funder: g.funder, x: g.year, y: 0, z: 0 }; m[k].y++; m[k].z += g.award || 0; return m; }, {}));
  const sb = Object.values(apps.filter((a) => a.Outcome !== "Unknown" && a[basis] != null).reduce((m, a) => { const x = basis === "FY" ? startYear(a.FY) : a.DecisionYear, k = a.dept + x;
    m[k] = m[k] || { dept: a.dept, x, sub: 0, dec: 0, won: 0, z: 0 }; m[k].sub++; m[k].dec += a.Outcome !== "Pending"; m[k].won += a.Outcome === "Successful"; m[k].z += a.Awarded; return m; }, {}))
    .filter((r) => r.dec > 0).map((r) => ({ ...r, y: Math.round((100 * r.won) / r.dec) }));

  return (<div className="wrap">
    <header><h1>Research Funding Dashboard</h1></header>
    <div className="tabs">{["Funding awards", "Application success", "Live projects", "Research themes"].map((t, i) =>
      <button key={t} className={"tab" + (tab === i ? " on" : "")} onClick={() => setTab(i)}>{t}</button>)}</div>

    {tab < 2 && <div className="bar">
      <label>Units<select value={units} onChange={(e) => setUnits(e.target.value)}>{Object.keys(UNITS).map((u) => <option key={u}>{u}</option>)}</select></label>
      <label>Year basis<select value={basis} onChange={(e) => { setBasis(e.target.value); setFrom(""); }}><option value="FY">Financial year</option><option value="DecisionYear">Decision year</option></select></label>
      <label>From<select value={from} onChange={(e) => setFrom(e.target.value)}><option value="">All</option>{years.map((y) => <option key={y}>{y}</option>)}</select></label>
      <label>Break down by<select value={by} onChange={(e) => setBy(e.target.value)}>{Object.entries(GROUPS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
      <label>Funder group<select value={group} onChange={(e) => setGroup(e.target.value)}><option value="">All</option>{uniq("group").map((x) => <option key={x}>{x}</option>)}</select></label>
      <label>Department and Centres<select value={dept} onChange={(e) => setDept(e.target.value)}><option value="">All</option>{uniq("dept").map((x) => <option key={x}>{x}</option>)}</select></label>
      <label>Funder<select value={funder} onChange={(e) => setFunder(e.target.value)}><option value="">All</option>{uniq("funder").map((x) => <option key={x}>{x}</option>)}</select></label>
      <button className="btn ghost" onClick={() => { setFunder(""); setDept(""); setGroup(""); setFrom(""); }}>Reset filters</button>
    </div>}

    {tab < 2 && !apps.length && <div className="card empty">No applications match the selected filters.</div>}
    {tab < 2 && <div className="kpis"><Kpi v={apps.length} l="Applications submitted" /><Kpi v={won.length} l="Funded" />
      <Kpi v={decided.length ? Math.round((100 * won.length) / decided.length) + "%" : "–"} l="Success rate" /><Kpi v={money(sum(won, (a) => a.Awarded))} l="Funding awarded" /></div>}

    {tab === 0 && <div className="grid">
      <Card title={`Funding awarded per year, ${units}`}><Bars data={awardRows} keys={awardKeys} fmt={(v) => v.toFixed(1)} /></Card>
      <Card title={`Top funders, ${units}`}><Bars data={topF} keys={depts} layout="vertical" fmt={(v) => v.toFixed(2)} /></Card>
      <div className="card"><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}><h3>{`Total award by year, ${barDept} (${units})`}</h3>
        <label><select value={barDept} onChange={(e) => setBarDept(e.target.value)}>{gDepts.map((x) => <option key={x}>{x}</option>)}</select></label></div>
        <div style={{ height: 330 }}>{bd.length ? <Bars data={bd} keys={["Total award"]} fmt={(v) => v.toFixed(2)} /> : <div className="empty">No awards recorded for this department.</div>}</div></div>
      <Card title="Awards by year and department (UKRI awards)" h={420}><Bubbles rows={gb} depts={[...new Set(gb.map((r) => r.dept))].sort()} xLabel="Year" yLabel="Number of awards" yFmt={(v) => v}
        tip={(p) => <><b>{p.dept}</b><br />Year: {p.x}<br />Number of awards: {p.y}<br />Total award: £{Math.round(p.z).toLocaleString()}<br />Funding organisation: {p.funder}</>} /></Card></div>}
    {tab === 1 && <SuccessGrid apps={(d.apps || []).filter((a) => (!funder || a.funder === funder) && (!group || a.group === group) && (!from || a[basis] == null || String(a[basis]) >= from))} gtr={d.gtr || []} basis={basis} depts={uniq("dept")} />}
    {tab === 1 && <div className="grid" style={{ marginTop: 14 }}>
      <Card title="Applications submitted and outcomes"><Bars data={appRows} keys={["Successful", "Unsuccessful", "Pending", "Unknown"].filter((k) => appRows.some((r) => r[k]))} stacked={false} /></Card>
      <Card title="Success rate by year and department" h={420}><Bubbles rows={sb} depts={[...new Set(sb.map((r) => r.dept))].sort()} xLabel="Year" yLabel="Success rate" xFmt={(v) => yr(v, basis)} yFmt={(v) => v + "%"}
        tip={(p) => <><b>{p.dept}</b><br />Year: {yr(p.x, basis)}<br />Success rate: {p.y}% (of decided)<br />Submitted: {p.sub}<br />Decided: {p.dec}<br />Successful: {p.won}<br />Funding awarded: £{Math.round(p.z).toLocaleString()}</>} /></Card>
      <Card title={`Success rate by ${GROUPS[by].toLowerCase()}`} h={Math.max(330, rate.length * 34 + 60)}><Bars data={rate} keys={["Success rate"]} layout="vertical" /></Card></div>}
    {tab === 2 && <Live d={d} money={money} />}
    {tab === 3 && <Themes />}
  </div>);
}

const Table = ({ head, rows }) => (<div style={{ overflowX: "auto", maxHeight: 520 }}><table><thead><tr>{head.map((h) => <th key={h}>{h}</th>)}</tr></thead>
  <tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}</tbody></table></div>);

const norm = (t) => String(t || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const useOxford = () => {
  const [o, setO] = useState(null), [err, setErr] = useState(false), [busy, setBusy] = useState(false);
  const load = (refresh) => { setBusy(true); get("/api/oxford" + (refresh ? "?refresh=1" : "")).then((r) => { setO(r); setErr(false); }).catch(() => setErr(true)).finally(() => setBusy(false)); };
  useEffect(() => { load(false); }, []);
  return [o, err, busy, load];
};
const Sel = ({ label, value, set, opts, all }) => (<label>{label}<select value={value} onChange={(e) => set(e.target.value)}><option value="">{all}</option>{opts.map((x) => <option key={x}>{x}</option>)}</select></label>);
const Pills = ({ items }) => items.map((t) => <span className="pill" key={t}>{t}</span>);
const count = (rows, k) => Object.entries(rows.reduce((m, r) => (r[k].forEach((x) => (m[x] = (m[x] || 0) + 1)), m), {})).map(([name, n]) => ({ name, Projects: n })).sort((a, b) => a.Projects - b.Projects);

function Live({ d, money }) {
  const [o, err, busy, load] = useOxford(), [liveOnly, setLiveOnly] = useState(true), [src, setSrc] = useState(""), [dp, setDp] = useState("");
  const seen = new Set(d.projects.map((p) => norm(p.title))), linked = Object.fromEntries((o?.rows || []).map((r) => [norm(r.title), r.link]));
  const all = [...d.projects.map((p) => ({ ...p, link: linked[norm(p.title)], source: linked[norm(p.title)] ? "Internal records and UKRI" : "Internal records" })),
    ...(o?.rows || []).filter((r) => !seen.has(norm(r.title))).map((r) => ({ ref: r.id, title: r.title, dept: r.dept, funder: r.funder, start: r.start, end: r.end, value: r.value, live: r.live, link: r.link, source: "UKRI Gateway" }))]
    .filter((p) => (!liveOnly || p.live) && (!src || p.source.includes(src)) && (!dp || p.dept === dp)).sort((a, b) => String(a.end).localeCompare(String(b.end)));
  return (<>
    <div className="bar">
      <label>Projects<select value={liveOnly ? "live" : "all"} onChange={(e) => setLiveOnly(e.target.value === "live")}><option value="live">Still running</option><option value="all">All awarded</option></select></label>
      <label>Source<select value={src} onChange={(e) => setSrc(e.target.value)}><option value="">All sources</option><option value="Internal">Internal records</option><option value="UKRI">UKRI Gateway</option></select></label>
      <Sel label="Department and Centres" value={dp} set={setDp} opts={[...new Set([...d.projects, ...(o?.rows || [])].map((p) => p.dept).filter(Boolean))].sort()} all="All" />
      <button className="btn" onClick={() => load(true)} disabled={busy}>{busy ? "Updating" : "Update from UKRI"}</button></div>
    {err && <div className="card err" style={{ marginBottom: 14 }}>UKRI project data is not available right now. Internal records are shown.</div>}
    <div className="kpis"><Kpi v={all.length} l="Projects" /><Kpi v={money(sum(all, (p) => p.value))} l="Total value" /><Kpi v={all.filter((p) => p.source === "UKRI Gateway").length} l="Added from UKRI" /></div>
    <div className="card"><Table head={["Title", "Department", "Funder", "Start", "End", "Value", "Source"]}
      rows={all.map((p) => [p.link ? <a href={p.link} target="_blank" rel="noreferrer">{p.title}</a> : p.title, p.dept, p.funder, p.start, p.end, money(p.value), p.source])} /></div></>);
}

function Themes() {
  const [o, err, busy, load] = useOxford(), [dp, setDp] = useState(""), [th, setTh] = useState(""), [me, setMe] = useState(""), [yv, setYv] = useState(""), [q, setQ] = useState("");
  const all = o?.rows || [], u = (k) => [...new Set(all.flatMap((r) => (Array.isArray(r[k]) ? r[k] : [r[k]])).filter(Boolean))].sort();
  const rows = all.filter((r) => (!dp || r.dept === dp) && (!th || r.themes.includes(th)) && (!me || r.methods.includes(me)) && (!yv || String(r.year) === yv) && (!q || norm(r.title).includes(norm(q))));
  const themes = count(rows, "themes"), methods = count(rows, "methods");
  return (<>
    <div className="bar"><Sel label="Department and Centres" value={dp} set={setDp} opts={u("dept")} all="All" /><Sel label="Theme" value={th} set={setTh} opts={u("themes")} all="All themes" />
      <Sel label="Method" value={me} set={setMe} opts={u("methods")} all="All methods" /><Sel label="Year granted" value={yv} set={setYv} opts={u("year").map(String).sort().reverse()} all="All years" />
      <label>Search<input value={q} placeholder="Project title" onChange={(e) => setQ(e.target.value)} /></label>
      <button className="btn ghost" onClick={() => { setDp(""); setTh(""); setMe(""); setYv(""); setQ(""); }}>Reset filters</button>
      <button className="btn" onClick={() => load(true)} disabled={busy}>{busy ? "Updating" : "Update"}</button></div>
    {err && <div className="card err" style={{ marginBottom: 14 }}>Research themes are not available right now. Please try again shortly.</div>}
    {o && <><div className="kpis"><Kpi v={rows.length} l="Projects" /><Kpi v={themes.filter((t) => t.name !== "Other").length} l="Research themes" /><Kpi v={methods.filter((t) => t.name !== "Other").length} l="Methods" /></div>
      {!rows.length ? <div className="card empty">No projects match the selected filters.</div> : <>
        <div className="grid"><Card title="Research themes" h={Math.max(300, themes.length * 32 + 40)}><Bars data={themes} keys={["Projects"]} layout="vertical" /></Card>
          <Card title="Methods and approaches" h={Math.max(300, methods.length * 32 + 40)}><Bars data={methods} keys={["Projects"]} layout="vertical" /></Card></div>
        <div className="card" style={{ marginTop: 14 }}><h3>Projects</h3>
          <Table head={["Title", "Department", "Funder", "Year granted", "Themes", "Methods"]} rows={[...rows].sort((a, b) => (b.year || 0) - (a.year || 0)).map((r) => [<a href={r.link} target="_blank" rel="noreferrer">{r.title}</a>, r.dept, r.funder, r.year, <Pills items={r.themes} />, <Pills items={r.methods} />])} /></div></>}</>}
  </>);
}

const Click = ({ data, onPick }) => (<ResponsiveContainer><BarChart data={data} layout="vertical" margin={{ left: 90 }}><CartesianGrid strokeOpacity={0.15} />
  <XAxis type="number" allowDecimals={false} /><YAxis type="category" dataKey="name" width={190} tick={{ fontSize: 12 }} /><Tooltip />
  <Bar dataKey="count" fill="#0B6E4F" cursor="pointer" onClick={(d) => onPick(d.name)} /></BarChart></ResponsiveContainer>);

const Bubbles = ({ rows, xLabel, yLabel, xFmt, yFmt, tip, depts }) => (
  <ResponsiveContainer><ScatterChart margin={{ left: 10, right: 20, top: 10 }}><CartesianGrid strokeOpacity={0.15} />
    <XAxis type="number" dataKey="x" name={xLabel} allowDecimals={false} domain={["dataMin - 1", "dataMax + 1"]} tickFormatter={xFmt} />
    <YAxis type="number" dataKey="y" name={yLabel} tickFormatter={yFmt} allowDecimals={false} />
    <ZAxis type="number" dataKey="z" range={[60, 1400]} />
    <Tooltip cursor={false} content={({ active, payload }) => active && payload?.length ? <div className="card" style={{ fontSize: 13 }}>{tip(payload[0].payload)}</div> : null} />
    <Legend />
    {depts.map((dp, i) => <Scatter key={dp} name={dp} data={rows.filter((r) => r.dept === dp)} fill={COLORS[i % COLORS.length]} fillOpacity={0.6} />)}
  </ScatterChart></ResponsiveContainer>);

const UKRI = ["ESRC", "NERC", "EPSRC", "AHRC", "BBSRC", "MRC", "STFC", "RCUK", "TSB"];
const shade = (r) => (r < 20 ? "#fde0e0" : r < 30 ? "#fff3c4" : r < 40 ? "#d9f0e1" : "#a7e0bf");
function SuccessGrid({ apps, gtr, basis, depts }) {
  const [dp, setDp] = useState(""), [all, setAll] = useState(false), [tip, setTip] = useState(null), [sel, setSel] = useState(null);
  const rows = apps.filter((a) => a.Outcome !== "Unknown" && a[basis] != null && (!dp || a.dept === dp));
  const xOf = (a) => (basis === "FY" ? startYear(a.FY) : a.DecisionYear);
  const years = [...new Set(rows.map(xOf))].sort(), cell = {}, tot = {}, name = {};
  rows.forEach((a) => { const k = a.funderCode + "|" + xOf(a); cell[k] = cell[k] || { n: 0, d: 0, w: 0 }; cell[k].n++; cell[k].d += a.Outcome !== "Pending"; cell[k].w += a.Outcome === "Successful";
    tot[a.funderCode] = (tot[a.funderCode] || 0) + 1; name[a.funderCode] = a.funder; });
  const funders = Object.keys(tot).sort((a, b) => tot[b] - tot[a]).slice(0, all ? 999 : 12);
  const go = (f, x) => { setSel({ f, x });
    if (!UKRI.includes(f)) return;
    const m = gtr.filter((g) => g.funder === f && (!dp || g.dept === dp) && (basis === "FY" ? g.year === x || g.year === x + 1 : g.year === x));
    const term = m.length === 1 ? null : `${name[f]} ${dp ? dp.replace(/ - SoGE| SoGE| of Enterprise and the Env/, "") : "Oxford"}`;
    window.open(term ? `https://gtr.ukri.org/search/project?term=${encodeURIComponent(term)}` : m[0].url, "_blank", "noopener"); };
  const open = sel && { won: rows.filter((a) => a.funderCode === sel.f && xOf(a) === sel.x && a.Outcome === "Successful"),
    gtr: gtr.filter((g) => g.funder === sel.f && (!dp || g.dept === dp) && (basis === "FY" ? g.year === sel.x || g.year === sel.x + 1 : g.year === sel.x)) };
  return (<div className="card"><div className="gridhead"><h3>Success rate by funder and year</h3>
    <div className="bar" style={{ border: 0, padding: 0, margin: 0, background: "none" }}>
      <label><select value={dp} onChange={(e) => { setDp(e.target.value); setSel(null); }}><option value="">All departments and centres</option>{depts.map((x) => <option key={x}>{x}</option>)}</select></label>
      <label><select value={all ? "all" : "top"} onChange={(e) => setAll(e.target.value === "all")}><option value="top">Top 12 funders</option><option value="all">All funders</option></select></label></div></div>
    {!funders.length ? <div className="empty">No decided applications for this selection.</div> : <div style={{ overflowX: "auto" }}>
      <div className="heat" style={{ gridTemplateColumns: `200px repeat(${years.length}, minmax(84px, 1fr))` }}>
        <div className="hl">Funder</div>{years.map((y) => <div key={y} className="hy">{yr(y, basis)}</div>)}
        {funders.map((f) => [<div key={f} className="hl" title={name[f]}>{name[f]}</div>, ...years.map((y) => { const c = cell[f + "|" + y];
          if (!c || !c.d) return <div key={f + y} className="hc none">–</div>; const r = Math.round((100 * c.w) / c.d), on = sel && sel.f === f && sel.x === y;
          return <div key={f + y} className={"hc" + (on ? " on" : "")} style={{ background: shade(r) }} onClick={() => go(f, y)}
            onMouseMove={(e) => setTip({ x: e.clientX, y: e.clientY, t: `${name[f]}, ${yr(y, basis)}`, a: `${c.d} decided, ${c.w} approved${c.n > c.d ? `, ${c.n - c.d} pending` : ""}${UKRI.includes(f) ? ". Click to open on UKRI Gateway" : ""}` })} onMouseLeave={() => setTip(null)}>{r}%</div>; })])}
      </div></div>}
    <div className="legend"><span>Lower success</span><span className="sw" style={{ background: shade(10) }} /><span className="sw" style={{ background: shade(25) }} /><span className="sw" style={{ background: shade(35) }} /><span className="sw" style={{ background: shade(50) }} /><span>Higher success</span></div>
    {tip && <div className="tip" style={{ left: tip.x + 14, top: tip.y + 14 }}><b>{tip.t}</b><br />{tip.a}</div>}
    {open && <div className="detail"><h3>{name[sel.f]}, {yr(sel.x, basis)}{dp ? `, ${dp}` : ""} <span className="pill" style={{ cursor: "pointer" }} onClick={() => setSel(null)}>Close</span></h3>
      {open.won.length ? <Table head={["Approved project", "Department", "Awarded"]} rows={open.won.map((a) => [a.title, a.dept, "£" + Math.round(a.Awarded).toLocaleString()])} /> : <div className="note">No approved projects in this cell.</div>}
      {open.gtr.length ? <><h3 style={{ marginTop: 14 }}>Matching projects on UKRI Gateway</h3><Table head={["Project", "Department", "Link"]} rows={open.gtr.map((g) => [g.title, g.dept, <a href={g.url} target="_blank" rel="noreferrer">View on UKRI Gateway</a>])} /></>
        : <div className="note">{UKRI.includes(sel.f) ? <a href={`https://gtr.ukri.org/search/project?term=${encodeURIComponent(name[sel.f] + " Oxford")}`} target="_blank" rel="noreferrer">Search UKRI Gateway for this funder</a> : "This funder is not listed on UKRI Gateway."}</div>}
    </div>}
  </div>);
}
