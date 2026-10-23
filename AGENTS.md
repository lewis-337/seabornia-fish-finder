# Seabornia Fish Finder

This repository contains Lewis's iPhone-friendly fishing PWA recovered from the v4 app archive. Keep the existing Japanese UI and the distinction between sourced catches, historical records, and exploration candidates.

- Browser markup/public seed data are in `index.html`, behavior in `app-v8.1.js`, styles in `styles-v8.2.css`, and shared map/photo camera math in `map-gestures.js`. Published data is in `data/`; collection and packaging are in `scripts/`.
- Preserve existing localStorage keys and the user's saved waypoints/catches. Changes to storage require a migration.
- Never infer catch GPS coordinates from a departure port. Area markers are approximate representative locations, not navigation points.
- Keep each catch's source and date. Failed collection must retain the last successful data and accurate freshness state.
- Fish photographs require an identified source, reusable license metadata and successful image decoding. Do not substitute fabricated imagery for identification.
- Do not commit credentials, private chat exports, personal catch logs, `.venv`, or generated Python bytecode.
- Validate relevant changes with `python -m unittest discover -s tests -v`, `node --test tests/*.cjs`, and browser checks.
- `python scripts/build_site.py` creates `dist/` with only public browser assets. GitHub Actions publishes this directory.

See `PROGRESS.md` for setup status and continuing work.

- Installed workers normalize asset query strings. Give changed cache-first assets distinct release filenames, update the HTML/SHELL/build allowlist together, and test upgrades from the installed release. Queued data jobs check out current main after acquiring the shared deployment lock.

- Fish/area links use the shared `fish-areas.js` resolver and curated `data/fish_areas.json`; unknown areas stay unknown. Reference depths are pinned GEBCO2026 model cells near approximate markers, never area-wide soundings or navigation depths. See `FISH-AREA-AUDIT.md` and `QA-v7.md`.

- v8 marina geography/storage invariants are in `marina-core-v8.js`, destination UI in `marina-discovery-v8.2.js`, regional collection in `collect_marina_conditions.py`/`update_marina_reports.py`. Keep legacy JSON URLs and the original three personal keys Seabornia-only; non-home records use `seabornia-marina-records-v1` so older tabs cannot overwrite them.
- Audit statuses, evidence classes and boat-specific rules must stay explicit. See MARINA-AUDIT.md and QA-v8.md. New maps need matching GEBCO footprint metadata before offline packaging. Generated regional data paths must stay ignored by push-trigger filtering to avoid recursive deployment jobs.
