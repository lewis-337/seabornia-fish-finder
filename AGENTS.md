# Seabornia Fish Finder

This repository contains Lewis's iPhone-friendly fishing PWA recovered from the v4 app archive. Keep the existing Japanese UI and the distinction between sourced catches, historical records, and exploration candidates.

- Browser markup/public seed data are in `index.html`, behavior in `app-v10.1.js`, styles in `styles-v10.css`, and shared map/photo camera math in `map-gestures.js`. Published data is in `data/`; collection and packaging are in `scripts/`.
- Preserve existing localStorage keys and the user's saved waypoints/catches. Changes to storage require a migration.
- Never infer catch GPS coordinates from a departure port. Area markers are approximate representative locations, not navigation points.
- Keep each catch's source and date. Failed collection must retain the last successful data and accurate freshness state.
- Fish photographs require an identified source, reusable license metadata and successful image decoding. Do not substitute fabricated imagery for identification.
- Do not commit credentials, private chat exports, personal catch logs, `.venv`, or generated Python bytecode.
- Validate relevant changes with `python -m unittest discover -s tests -v`, `node --test tests/*.cjs`, and browser checks.
- `python scripts/build_site.py` creates `dist/` with only public browser assets. GitHub Actions publishes this directory.

See `PROGRESS.md` for setup status and continuing work.

- Installed workers normalize asset query strings. Give changed cache-first assets distinct release filenames, update the HTML/SHELL/build allowlist together, and test upgrades from the installed release. Queued data jobs check out current main after acquiring the shared deployment lock.

- Fish/area links use the shared `fish-areas-v10.js` resolver and curated `data/fish_areas.json`; unknown areas stay unknown. Reference depths are pinned GEBCO2026 model cells near approximate markers, never area-wide soundings or navigation depths. See `FISH-AREA-AUDIT.md` and `QA-v7.md`.

- v8 marina geography/storage invariants are in `marina-core-v10.js`, destination UI in `marina-discovery-v10.1.js`, regional collection in `collect_marina_conditions.py`/`update_marina_reports.py`. Keep legacy JSON URLs and the original three personal keys Seabornia-only; non-home records use `seabornia-marina-records-v1` so older tabs cannot overwrite them.
- Audit statuses, evidence classes and boat-specific rules must stay explicit. See MARINA-AUDIT.md and QA-v8.md. New maps need matching GEBCO footprint metadata before offline packaging. Generated regional data paths must stay ignored by push-trigger filtering to avoid recursive deployment jobs.

- v9 reviewed content is canonical in `data/marina-enrichment.json`; `apply_marina_enrichment.py` reapplies profiles, evidence and availability after collection. Do not turn review posting dates into catch dates/seasons or infer fish names with substring matching. Hide unavailable bases from every visible discovery list, retain archival/private records and distinguish a failed page fetch from business closure. Group/growth-stage photos require explicit example labels. Keep mobile reading screens on the document scroller, sticky base context and separate per-tab/per-marina positions; status-bar gestures need physical verification. See MARINA-CONTENT-AUDIT.md, PHOTO-AUDIT-v9.md and QA-v9.md.

- v10 adds locally bundled Leaflet 1.9.4 tiled underlays in `basemap-v10.js`; `map-gestures.js` remains the single gesture owner. GSI standard/pale/aerial tiles are requested only for online viewports and must never enter bulk offline packs. Keep geographic/SVG cameras aligned, selected marker labels above sheets and independently saved background/overlay/opacity settings. Preserve fallback markers and controls when tiles fail.
- Public source adapters are in `scripts/fishing_reports.py` and `collect_fishing_sources.py`, configured by `data/fishing-sources.json`. Reviewed guide/audit facts live in `data/fishing-research.json`; apply after collection and v9 enrichment. Preserve successful backfills, stable event links and unknown fish-name review queues. Publication dates, catches, rental permissions and generic/owner/charter context are separate facts. See `FISHING-RESEARCH-v10.md`, `PHOTO-AUDIT-v10.md` and `QA-v10.md`.
- Current scope is personal/non-commercial. Three explicitly reviewed `noncommercial_only` photo overrides carry CC BY-NC 4.0 and visible credits; do not reuse them commercially. Automatic Commons imports still reject unreviewed NC licences. Every catalogue entry must decode and have an identified real photograph, with examples/growth stages labelled.
