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
- Local collection succeeded from all five configured sources. Image caching is limited by Wikimedia rate limits on this Mac; verified photos retain source/license records and unavailable images remain explicitly marked.
- Deployment and final production checks are in progress. Update this section after the first successful GitHub Actions deployment.

## Local development

```sh
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python -m unittest discover -s tests -v
node --test tests/test_service_worker.cjs
python3 -m http.server 8765 --bind 127.0.0.1
```

Production URL: https://lewis-337.github.io/seabornia-fish-finder/
