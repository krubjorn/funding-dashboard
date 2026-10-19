# Research Funding Dashboard (Flask + React)

Flask serves a JSON API; React (Vite + Recharts) is the interface. Four tabs: Funding awards, Application success, Live projects, and Research themes from UKRI Gateway to Research (GtR).
PI / Co-PI and user names have been removed from the data files.

## Structure
````
backend/   app.py (API), config.json (themes, methods, settings)
requirements.txt   Python dependencies
frontend/  React app (src/App.jsx)
data/      applications.csv, project_summary.csv  (anonymised)
````

## Run (needs Python 3.10+ and Node 18+)
````
pip install -r requirements.txt
cd frontend && npm install && npm run build && cd ..
python backend/app.py
````
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
````
````

Copy everything between the outer fence into a file named `README.md` in the project root. It is also already in `funding-dashboard-flask-react.zip`.