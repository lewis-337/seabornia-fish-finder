# Project continuation

## Intended app

An iPhone PWA for fishing trips from Seabornia Marina, with a November planning focus:

- Month/year filters, 47 fish and squid entries, searchable catalogue and reference photos.
- Ten approximate area markers, marina distances, squid information and clearly identified source reports.
- Latest published catches refreshed by a scheduled collector.
- GPS, saved waypoints, personal catch logs, optional compressed photos, JSON backup/import and CSV export.
- GEBCO bathymetric imagery, explanatory seabed layers, and readable numbered map markers.

Personal records stay in the device browser. Public-source catch data is stored in the repository. This is not a marine navigation chart.

## 2026-10-22 setup

- Recovered the original v4 ZIP and full original conversation. Private conversation exports and unmodified source archive are kept outside this public repository in Lewis's canonical vault.
- GitHub connector access verified. Lewis explicitly approved changing this repository to public to use GitHub Pages.
- Imported v4 source, installed isolated local Python dependencies, enabled Pages, and configured six-hour collection/deployment.
- Fixed cached-photo manifest initialization, stale app-shell caching, timestamped offline JSON caching, unrelated-cache deletion, catch parsing of multiple species and separate quantities, stable automatic record IDs, and duplicate source/date/fish rows.
- Added regression tests and an allowlist-based static-site packaging script.
- First GitHub Actions run `39667307643` completed successfully and published the HTTPS app. Hosted catch collection succeeded from all five sources, with 107 retained records.
- Production checks passed for the mobile layout, month filter, service worker activation, offline app reload and offline catch JSON under a new timestamp. Local waypoint and catch-log persistence passed after reload; synthetic QA records were removed.
- All 47 catalogue entries have decoded, attributed local reference images. Commons HTML and canonical asset URLs handle API rate limits. Visual review replaced a squid food photo and a related-species fish photo using reviewed CC BY iNaturalist references, selected a live-animal spear-squid image, and replaced the remaining four fish illustrations with licensed whole-fish photographs.
- Ten focused regression tests cover parsing, source license metadata, and offline caching. GEBCO returned a valid 1050×950 JPEG.
- Final deployment `39668842547` succeeded for source commit `58cd2ec`; published manifest and browser audit both confirm 47/47 images, with no missing images or browser errors. Workflow state is active. Physical iPhone Home Screen installation and on-device GPS permission remain user actions.

## Local development

```sh
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python -m unittest discover -s tests -v
node --test tests/test_service_worker.cjs
python3 -m http.server 8765 --bind 127.0.0.1
```

Production URL: https://lewis-337.github.io/seabornia-fish-finder/
