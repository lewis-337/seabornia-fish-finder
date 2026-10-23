# Kanto and Okinawa v8 acceptance

Status: local checks complete; production receipt appended after deployment.

| Changed feature | Expected | Local actual |
|---|---|---|
| Directory | Audit 34 entries and distinguish eligibility | 19 fishing-use sources, 6 要確認, 9 exclusions; source URLs and checked dates retained |
| Discovery | Region + fish/month/method filters; preview before committing | Kanto 22 / Okinawa 3 selectable workspaces; excluded Jet-only Ishigaki remains in audit; map clusters and list alternatives pass |
| Evidence | Regional names, source dates and uncertainty | 47 original entries + 10 sourced species/groups; 47 licensed photos retained; groups use explicit no-photo states |
| Separate workspaces | A–B–A restores maps, drafts, records, speed and favourites | Chromium/WebKit passes, including date/time drafts and last-active import |
| Legacy safety | Keep original three keys and avoid old-tab overwrites | Original keys remain Seabornia-only; other records use `seabornia-marina-records-v1`; workspace metadata uses `seabornia-workspaces-v1` |
| Backups | v6 all-base round trip; v4/v5 only replace Seabornia | Validated imports and quota rollback pass; other marinas retained; v6 restores active base/reminder |
| Conditions | Correct marina ETA and regional tide/forecast coverage | 40 deduplicated forecast samples; 16 verified tide stations; outside coverage unknown; no private provider requests |
| Maps/depth | Broad approximate grounds, matching offline GEBCO images | 25 map backgrounds, 18 reference model cells; sources/footprints retained; no inferred catch GPS |
| Offline | Automatic resumable all-base saving | All 100 public pack assets cached; a never-visited base opens without origin access |
| Upgrade | Preserve records from installed versions | Actual v4/v5/v6/v7 worker upgrades pass in Chromium and WebKit |
| Layout | No control intersections or clipped native fields | 320–430 portrait, landscape, tablet, desktop, 200% text and keyboard-sized viewport checks pass; coordinates stack when text grows; status messages occupy a separate row |
| Gestures | Existing pinch/pan/zoom, no accidental saves | Native Chromium multi-touch, map/photo transitions/cancellation, marker safety and button alternatives pass |
| Accessibility | Automated names/focus/contrast checks | 10 axe WCAG A/AA states, 0 automated violations; reduced motion and focus checks pass |

Local verification: 17 Python + 45 Node tests; 128 grouped browser checks (27 core, 26 conditions, 18 discovery/layout, 30 resilience/upgrades, 22 marina, 5 native touch). Screenshots and machine-readable results retained in the project's private vault QA folder.

Browser simulation is not physical-device acceptance. iPhone 13 Pro Safari/Home Screen native picker, keyboard, pinch, GPS, safe areas and VoiceOver must be checked on the device after v8. Older iOS/model support remains an API/layout target, not a claim of physical verification. WebKit offline uses an unreachable local origin because its browser-offline switch causes an engine internal error.

Public catch availability is incomplete while upstream article links fail. Official guides and personal recording remain usable; failed refreshes retain previous data. Forecast timestamps and expiry remain visible. No background return notifications or cloud sync.

## Reproduce

Run `python -m unittest discover -s tests -v`, `node --test tests/*.cjs`, and `python scripts/build_site.py`. Serve the checkout on port 8765. Set `SEABORNIA_PLAYWRIGHT` to an installed Playwright module, then run the check_browser, check_conditions, check_discovery, check_resilience, check_touch, check_marinas and check_marina_accessibility scripts. All browser checks use isolated contexts and synthetic data.
