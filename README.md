# Smith School · Research Funding Dashboard

A minimal, configurable Streamlit dashboard with three tabs:

1. **Funding awards** – funding per year, broken down by funder group, funder or scheme type, with a units switch (£ / £ thousands / £ millions).
2. **Application success** – applications sent vs successful per year, and success rate by funder group, funder, scheme or year.
3. **Live projects & themes** – awarded projects still running, tagged by theme, with an optional lookup of abstracts on UKRI Gateway to Research (GtR).

PI names are **hidden by default** (toggle in the sidebar, or change `show_pi_names` in `app.py`).

## Project structure

```
smith-funding-dashboard/
├── app.py              # the whole dashboard (settings are in the CONFIG block at the top)
├── requirements.txt    # Python dependencies
├── README.md           # this file
└── data/
    ├── DeptProject_Full Data_data.csv   # applications and outcomes (from BI X5)
    ├── FunderScheme_Full Data_data.csv  # same data by funder/scheme (not used by the app)
    └── Project summary.xlsx             # all costings, used for live projects
```

## Run it on your computer

You need Python 3.10 or newer.

1. Unzip the folder and open a terminal inside it.
2. (Recommended) create a virtual environment:
   - Windows: `python -m venv .venv` then `.venv\Scripts\activate`
   - Mac/Linux: `python3 -m venv .venv` then `source .venv/bin/activate`
3. Install the dependencies: `pip install -r requirements.txt`
4. Start the app: `streamlit run app.py`
5. Your browser opens at http://localhost:8501. If it does not, open that address yourself.

Stop the app with `Ctrl + C` in the terminal.

## Update the data

- **Quick way:** upload a new applications CSV and/or Project summary XLSX in the sidebar. Nothing is saved.
- **Permanent way:** replace the files in `data/` with new exports that have the same names and columns, then restart the app.

## Customise

Open `app.py` and edit the `CONFIG` block at the top:

| Setting | What it does |
|---|---|
| `title` | Page title |
| `lead_dept` | Department used to filter the Project summary (e.g. `"Smith School"`) |
| `palette` | Chart colours |
| `default_units` | Starting units (`"£"`, `"£ thousands"` or `"£ millions"`) |
| `show_pi_names` | Whether PI names start visible |
| `themes` | Theme name → keywords used to tag project titles and abstracts. Add or edit freely |

## Put it online (Streamlit Community Cloud, free)

1. Create a **private** GitHub repository and push this folder to it. Keep it private, because the data is internal.
2. Go to https://share.streamlit.io, sign in with GitHub and choose **New app**.
3. Select the repository, branch `main` and main file `app.py`, then click **Deploy**.
4. Restrict who can view the app in the app's sharing settings.

## Notes and limits

- Each application is counted once (the latest costing version).
- Pending decisions are excluded from success rates.
- The abstract lookup in tab 3 needs internet access and only finds UKRI-funded projects whose titles match exactly, so expect partial matches.
- Theme tags are keyword-based, so treat them as a first pass.
