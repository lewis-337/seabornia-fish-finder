# Seabornia Fish Finder

This repository contains Lewis's iPhone-friendly fishing PWA recovered from the v4 app archive. Keep the existing Japanese UI and the distinction between sourced catches, historical records, and exploration candidates.

- Browser code is in `index.html`; published data is in `data/`; collection and packaging are in `scripts/`.
- Preserve existing localStorage keys and the user's saved waypoints/catches. Changes to storage require a migration.
- Never infer catch GPS coordinates from a departure port. Area markers are approximate representative locations, not navigation points.
- Keep each catch's source and date. Failed collection must retain the last successful data and accurate freshness state.
- Fish photographs require an identified source, reusable license metadata and successful image decoding. Do not substitute fabricated imagery for identification.
- Do not commit credentials, private chat exports, personal catch logs, `.venv`, or generated Python bytecode.
- Validate relevant changes with `python -m unittest discover -s tests -v`, `node --test tests/test_service_worker.cjs`, and browser checks.
- `python scripts/build_site.py` creates `dist/` with only public browser assets. GitHub Actions publishes this directory.

See `PROGRESS.md` for setup status and continuing work.
