# Research Funding Dashboard (Flask + React)

Flask serves a JSON API; React (Vite + Recharts) is the interface. Four tabs: Funding awards, Application success, Live projects, and Research themes from UKRI Gateway to Research (GtR).
PI / Co-PI and user names have been removed from the data files.

## Data
- `data/applications.csv`: merged applications from the BI X5 export (Smith School, full history) and the earlier success-rate file (Geography, ECI, TSU, Smith School, FY2020/21 onward). Where a project is in both, the BI X5 row is used. The source is in the `src` column.
- Department codes in the success-rate file are mapped as AC = Geography - SoGE, AF = Environmental Change Institute SoGE, JQ = Transport Studies Unit SoGE, LD = Smith School. **AC, AF and JQ are inferred, please confirm them.**
- `data/gtr_awards.csv`: UKRI (GtR) awards for the departments and centres, used for the awards bubble chart. Oxford Martin School and Social Sciences Division appear only here.
- Applications from the success-rate file have no decision date, so they are left out when Year basis is set to Decision year.
- `data/project_summary.csv`: costings used for the Live projects tab.

## Structure
```
backend/   app.py (API), config.json (themes, methods, settings), requirements.txt
frontend/  React app (src/App.jsx)
data/      applications.csv, project_summary.csv  (anonymised)
```

## Run (needs Python 3.10+ and Node 18+)
```
pip install -r backend/requirements.txt
cd frontend && npm install && npm run build && cd ..
python backend/app.py
```
Open http://localhost:5000.

Development with hot reload: run `python backend/app.py` in one terminal and `cd frontend && npm run dev` in another, then open http://localhost:5173.

## Research themes and live projects (UKRI)
- Both tabs use projects from the University of Oxford in the departments listed under `oxford_depts` in `backend/config.json` (Geography - SoGE, Smith School, Oxford Martin School, Environmental Change Institute, Transport Studies Unit).
- The starting list is `data/gtr_awards.csv`. The backend then asks the UKRI Gateway API for abstracts and for any new projects in those departments. Results are cached for 6 hours. The Update button fetches fresh data.
- If the UKRI API cannot be reached, themes are tagged from project titles only and no new projects are added.
- Live projects keeps all internal records, links them to UKRI where the title matches, and adds extra live projects found on UKRI (marked "UKRI Gateway").
- Change the theme and method keywords in `backend/config.json`. No code changes needed.

## Update data
Replace the CSVs in `data/` (same columns) and restart. Remove name columns (PI/Co-I, Lead PI, Partner PI, user names) first.

## Limits
- GtR only covers UKRI and Innovate UK funding. Other funders will not match.
- Linking internal projects to UKRI uses exact title matching, so differently named projects are shown as separate rows.
- Keyword tagging is a first pass. For deeper theme analysis use an LLM on the abstracts.
- Data is Smith School only. Add other departments' exports to include them.
