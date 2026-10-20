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

## Research themes tab (live GtR)
- **Our awarded projects:** looks up every project title in `project_summary.csv` on the GtR API, keeps exact-title matches, and tags themes and methods from the abstract.
- **GtR search:** type any topic to see which themes and methods appear in funded projects.
- Results are cached for 6 hours. "Refresh from GtR" fetches new data. Click a bar to filter the project list.
- Change the theme and method keywords in `backend/config.json`. No code changes needed.

## Update data
Replace the CSVs in `data/` (same columns) and restart. Remove name columns (PI/Co-I, Lead PI, Partner PI, user names) first.

## Limits
- GtR only covers UKRI and Innovate UK funding. Other funders will not match.
- Title matching is exact, so projects with different internal titles are missed.
- Keyword tagging is a first pass. For deeper theme analysis use an LLM on the abstracts.
- Data is Smith School only. Add other departments' exports to include them.
