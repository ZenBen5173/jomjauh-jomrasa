"""Assemble the dashboard deliverable exactly as the DOSM Datathon 2026 booklet asks:

    AnakSunway_Datathon2026_Dashboard.zip
      Dashboard.pdf      static pictures of every view (from submission/shots/*.png)
      Dashboard.xlsx     interactive Excel companion (pipeline.make_excel_dashboard)
      Data/              the clean tables as CSV + the data dictionary
      Source/            the full source code (git archive of HEAD)
      README.txt         link, how to open and navigate, software versions, limitations

    python -m pipeline.make_submission
"""
from __future__ import annotations

import shutil
import subprocess
import zipfile
from datetime import date
from pathlib import Path

import pandas as pd
import pymupdf

from pipeline import make_excel_dashboard

ROOT = Path(__file__).resolve().parents[1]
SUB, SHOTS, CLEAN = ROOT / "submission", ROOT / "submission" / "shots", ROOT / "data" / "clean"
TEAM = "AnakSunway"
URL, REPO = "https://jomjauh.vercel.app", "https://github.com/ZenBen5173/jomjauh-jomrasa"
PRIVATE = {"text_items"}          # third-party writing: never redistributed

CAPTIONS = {
    "01": ("Planner dashboard - first view", "The question, three headline numbers, the story in four steps (problem, opportunity, obstacle, payoff), then the ranking, the map and the selected state."),
    "02": ("Planner dashboard - whole page", "Below the explorer: the evidence. How unequal visits are (Lorenz curve), concentration over time (Gini), and how travellers rate each state."),
    "03": ("Map view: where the crowds are", "Clicking the red Problem card recolours the map and ranking by visitors."),
    "04": ("Map view: what holds each state back", "Clicking the amber Obstacle card shows each state's weakest pillar: access, awareness or amenities."),
    "05": ("Map view: where hotels still have room", "Average hotel occupancy by state (Tourism Malaysia)."),
    "06": ("State profile", "Slide-in profile: visitor trend, quiet season, where its tourists come from, and what travellers wrote."),
    "07": ("Weights and robustness", "Adjust what counts towards the Opportunity score and see how stable the ranking is under 800 random re-weightings."),
    "08": ("Jojo, the on-screen guide", "Resting the pointer on anything explains it in plain words. Scripted from the data - not generated."),
    "09": ("Simulator", "Move a share of a crowded state's visitors elsewhere: spending gained and lost, hotel capacity, and whether tourism ends up more evenly spread."),
    "15": ("Pipeline", "Where the numbers come from, step by step in everyday words: collect, clean, check, combine, measure, the AI parts, publish - and which models are used and how we know they work."),
    "10": ("Methodology", "Every formula, source, assumption and limitation."),
    "11": ("JomRasa, the traveller side", "A chat that acts like a local friend."),
    "12": ("Traveller: a town guide", "What not to miss, what to eat, the best and worst months with the reason, festivals, and what a trip costs."),
    "13": ("Traveller: a day-by-day plan", "Breakfast to supper on a street map, with a place to sleep. AI chooses and orders real listed places only; limits such as 'no pork' are enforced in code."),
    "14": ("Traveller: where should I go?", "Describing a feeling returns three less-crowded states that fit, with towns to base yourself in."),
}

README = """JomJauh + JomRasa - Team ANAK SUNWAY - DOSM Datathon 2026
Dashboard deliverable, prepared {today}

1. THE DASHBOARD
   Main product (interactive, no login, any modern browser):   {url}
     Planner dashboard ........ {url}/
     Simulator ................ {url}/simulator
     Pipeline ................. {url}/pipeline
     Methodology .............. {url}/methodology
     Traveller trip planner ... {url}/trip
   It will stay online, unchanged, until the evaluation is complete.

2. WHAT IS IN THIS ZIP
   Dashboard.pdf    Static pictures of every view, with a caption each.
   Dashboard.xlsx   Interactive Excel companion. Works offline, no macros. Open the "Dashboard" sheet and change
                    the two yellow cells (year, state); open "Simulator" and change its yellow cells.
                    Its figures are the same as the website's (checked: 33% top-3 share, Gini 0.294, 13 of 16
                    states held back, Johor opportunity +28, simulator Selangor->Terengganu 5% = 1.82M visitors).
   Data/            Every clean table behind the dashboard as CSV, plus data_dictionary.md (table, columns,
                    source, years, access date).
   Source/          Full source code: the Python data pipeline, the metric library with tests, and the website.
   README.txt       This file.

3. HOW TO NAVIGATE THE WEBSITE
   - The top row tells the story in four coloured steps. Click a step and the map below switches to it:
     red = the problem (crowding), blue = the opportunity, amber = the obstacle, green = the payoff (opens the simulator).
   - Click any state on the map, in the ranking or in a chip to focus it everywhere. "Full profile" opens its details.
   - "Weights" lets you change what counts and shows how stable the ranking is.
   - The year switch is at the top right. Rest the pointer on anything and Jojo (bottom right) explains it; click Jojo to mute.
   - "For travellers" opens JomRasa: type a town ("plan 2 days in Ipoh"), or what you feel like ("quiet beach, good seafood").

4. SOFTWARE
   Website: Next.js 15, React 19, TypeScript, Tailwind CSS 4, d3-geo, Leaflet 1.9 - hosted on Vercel.
   Pipeline: Python 3.12, pandas, openpyxl, shapely, PyMuPDF; tests with pytest and vitest.
   Excel companion: made with openpyxl 3.1; tested in Microsoft Excel (Microsoft 365). No add-ins or macros needed.
   AI: Google Gemini 2.5 Flash Lite through OpenRouter (tagging travel text, understanding traveller requests, choosing
       and ordering real places for a trip plan). Reference labels for validation by Anthropic Claude.
   To run the website yourself:  cd Source/web && npm install && npm run dev   (Node.js 20+), then open http://localhost:3000
   To rerun the pipeline: see Source/README.md.

5. DATA SOURCES (all open and public; raw data is about Malaysia only)
   DOSM Domestic Tourism Survey 2023-2025 (OpenDOSM); data.gov.my (population, income, poverty, amenities, GDP);
   Tourism Malaysia Paid Accommodation Survey; OpenStreetMap (ODbL); geoBoundaries; public travel text found with Exa
   search and the YouTube Data API (de-identified, no usernames); Wikivoyage (CC BY-SA 4.0); Open-Meteo / ERA5 (CC BY 4.0).

6. LIMITATIONS AND ASSUMPTIONS
   - DOSM publishes state-level spending up to 2023. For 2024 and 2025, spend per visitor and length of stay are carried
     forward from 2023, so later spending figures are estimates and are labelled as such. DOSM's national figures are official.
   - The simulator shows what-if scenarios computed from real data; it does not create data. Hotels are treated as full at
     75% average occupancy and rooms hold 2 guests - both are assumptions the user can change.
   - Moving visitors redistributes spending; it does not add to the national total.
   - JomRasa scores come from public online text, not a representative survey: an indicator, never an official statistic.
     Its validation figures are agreement between two AI models, not human-labelled accuracy.
   - Access is measured with proxies (population within reach, airports, rail stations); no open road or flight data exist.
   - The traveller guide covers towns that travellers have documented; coverage is uneven, and opening hours change.
   - If the AI service is unreachable, the traveller side falls back to keyword rules and a rule-based plan, and says so.

Source code: {repo}
"""


def dashboard_pdf(out: Path) -> int:
    shots = sorted(SHOTS.glob("*.png"))
    doc = pymupdf.open()
    W, H, M = 842, 595, 28                                  # A4 landscape, points
    cover = doc.new_page(width=W, height=H)
    cover.insert_text((M, 90), "JomJauh + JomRasa", fontsize=30, fontname="hebo")
    cover.insert_text((M, 120), "Dashboard - static views", fontsize=16, fontname="helv", color=(0.35, 0.38, 0.42))
    cover.insert_textbox(pymupdf.Rect(M, 150, W - M, 300), f"Team ANAK SUNWAY - DOSM Datathon 2026\n\nThese pages are pictures of the working dashboard for documentation. "
                         f"The dashboard itself is interactive and online, with no login:\n{URL}\n\nAn interactive Excel companion (Dashboard.xlsx) is included in the same ZIP.", fontsize=12, fontname="helv", lineheight=1.5)
    for shot in shots:
        title, text = CAPTIONS.get(shot.name[:2], (shot.stem, ""))
        pix = pymupdf.Pixmap(str(shot))
        tall = pix.height / pix.width > 0.72
        pw, ph = (H, W) if tall else (W, H)                 # long pages go portrait
        page = doc.new_page(width=pw, height=ph)
        page.insert_text((M, 34), title, fontsize=14, fontname="hebo")
        page.insert_textbox(pymupdf.Rect(M, 42, pw - M, 78), text, fontsize=9.5, fontname="helv", color=(0.35, 0.38, 0.42))
        box = pymupdf.Rect(M, 84, pw - M, ph - M)
        scale = min(box.width / pix.width, box.height / pix.height)
        w, h = pix.width * scale, pix.height * scale
        page.insert_image(pymupdf.Rect(box.x0 + (box.width - w) / 2, box.y0, box.x0 + (box.width + w) / 2, box.y0 + h), filename=str(shot))
    doc.save(out, deflate=True, garbage=3)
    return len(doc)


def main() -> None:
    pack = SUB / f"{TEAM}_Datathon2026_Dashboard"
    if pack.exists():
        shutil.rmtree(pack)
    (pack / "Data").mkdir(parents=True)
    make_excel_dashboard.main()
    shutil.copy(SUB / "Dashboard.xlsx", pack / "Dashboard.xlsx")
    pages = dashboard_pdf(pack / "Dashboard.pdf")
    for f in sorted(CLEAN.glob("*.parquet")):
        if f.stem in PRIVATE:
            continue
        pd.read_parquet(f).to_csv(pack / "Data" / f"{f.stem}.csv", index=False, encoding="utf-8-sig")
    shutil.copy(ROOT / "docs" / "data_dictionary.md", pack / "Data" / "data_dictionary.md")
    shutil.copy(CLEAN / "states.geojson", pack / "Data" / "states.geojson")
    (pack / "README.txt").write_text(README.format(today=date.today().isoformat(), url=URL, repo=REPO), encoding="utf-8")
    src = pack / "Source.zip"
    subprocess.run(["git", "archive", "--format=zip", "-o", str(src), "HEAD"], cwd=ROOT, check=True)
    with zipfile.ZipFile(src) as z:
        z.extractall(pack / "Source")
    src.unlink()

    out = SUB / f"{TEAM}_Datathon2026_Dashboard.zip"
    out.unlink(missing_ok=True)
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for f in sorted(pack.rglob("*")):
            if f.is_file():
                z.write(f, f.relative_to(pack))
    n = sum(1 for _ in pack.rglob("*") if _.is_file())
    print(f"Dashboard.pdf: {pages} pages | Data: {len(list((pack / 'Data').glob('*.csv')))} CSV tables | {n} files | {out.name}: {out.stat().st_size / 1e6:.1f} MB")


if __name__ == "__main__":
    main()
