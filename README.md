# JomJauh + JomRasa

DOSM Datathon 2026 · *ML & AI for sustainable tourism in Malaysia*

A decision tool that shows which under-visited Malaysian states to steer tourists toward, why those
states are skipped, what shifting visitors would do (capped by real hotel capacity), and how travellers
feel about going there.

```
data/raw/        untouched downloads + _manifest.json (URL, access date, sha256)
data/clean/      parquet tables (see docs/data_dictionary.md)
pipeline/        extract -> transform -> panel -> export; pipeline/text = JomRasa
core/metrics.py  reference implementation of every metric (Python)
web/             Next.js dashboard; src/lib/metrics.ts is tested against the Python results
tests/           data checks + metric tests (pytest)
docs/            prior work review, data dictionary, validation files
```

## Run the pipeline

```bash
uv venv --python 3.12 .venv && uv pip install --python .venv/Scripts/python.exe -r requirements-dev.txt
python -m pipeline.extract                # DOSM, data.gov.my, geoBoundaries
python -m pipeline.extract_powerbi        # Tourism Malaysia Paid Accommodation Survey
python -m pipeline.extract_osm            # OpenStreetMap layers
python -m pipeline.transform_structured   # clean tables
python -m pipeline.build_panel            # one row per state per year
python -m pytest tests -q                 # data checks + metric tests
python -m pipeline.export_web             # JSON for the dashboard + Python reference results
python -m pipeline.data_dictionary
python -m pipeline.audit                  # replays the cleaning with counters: duplicates removed, rows filtered, posts dropped -> pipeline_audit.json
python -m pipeline.export_pipeline        # counts for the website's Pipeline page (run last: it reads the other outputs and the test reports)
```

JomRasa (needs `.env`, see `.env.example`; everything is cached, nothing is fetched or labelled twice):

```bash
python -m pipeline.text.collect exa --state TRG     # trial run: check quality and cost first
python -m pipeline.text.collect exa --all
python -m pipeline.text.collect youtube --all
python -m pipeline.text.prepare                     # clean, de-identify, deduplicate
python -m pipeline.text.tag --limit 200             # trial batch, then without --limit
python -m pipeline.text.score build
python -m pipeline.text.score sample                # 200 items to hand-label -> then `validate`
python -m pipeline.build_panel && python -m pipeline.export_web
```

Traveller guide (no keys needed; pages, rainfall and geocoding are cached):

```bash
python -m pipeline.guide.collect          # Wikivoyage destination pages -> see / do / eat listings (raw pages kept with revision ids)
python -m pipeline.guide.build            # locate, assign meals, rainfall 2015-2024, best months -> web/public/data/guide.json
```

Submission package (Dashboard.pdf, interactive Dashboard.xlsx, Data/, Source/, README.txt in one ZIP):

```bash
python -m pipeline.make_excel_dashboard   # offline Excel companion: state / year picker and a what-if simulator on live formulas
python -m pipeline.make_submission        # needs screenshots in submission/shots/; writes submission/AnakSunway_Datathon2026_Dashboard.zip
```

## Run the dashboard

```bash
cd web && npm install && npm run dev      # http://localhost:3000
npm test                                  # TypeScript metrics must reproduce the Python reference
```

## Data notes

- `data/raw/` holds the untouched official downloads (DOSM, data.gov.my, Tourism Malaysia, geoBoundaries, OpenStreetMap) with access dates in `_manifest.json`.
- The collected travel text corpus (`data/clean/text_items.parquet`, `data/raw/text/`) is **not** in this repository: it is third-party writing.
  Only derived, aggregated tables and short attributed quotes are published. Re-create it with the JomRasa commands above.
- Place descriptions in the traveller guide are from English Wikivoyage (CC BY-SA 4.0), trimmed and otherwise unchanged, and are published under the same licence;
  rainfall is from the Open-Meteo archive (ERA5, CC BY 4.0); missing coordinates are from OpenStreetMap (ODbL).
- JomRasa validation figures are agreement with blind reference labels from a stronger model, not human-labelled accuracy (see `docs/validation_*.`).

Live dashboard: https://jomjauh.vercel.app · Team ANAK SUNWAY · DOSM Datathon 2026

Deployment: every push to `main` is built and published automatically by Vercel (project root `web/`).
