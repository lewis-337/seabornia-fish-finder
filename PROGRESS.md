# Project continuation

## Intended app

An iPhone PWA for fishing trips from Seabornia Marina, with month-selectable planning:

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

## 2026-10-22 iPhone UI/UX redesign

- Lewis approved the researched calm outdoor design with map/control priority and explicitly requested implementation and publication.
- Replaced the crowded map toolbar with area/layer panels, larger fixed-screen-size numbered markers, GPS/zoom controls, responsive camera fitting and collapsible area sheets that keep selected points visible.
- Added shared/testable camera and pointer handling: anchored two-finger zoom/pan, single-finger pan, double-tap, wheel and button controls, cancellation/finger transitions, and no accidental activation after gestures. Photographs use the same controller in a full-screen viewer.
- Added temporary point confirmation and accessible in-app save/delete/import flows. Improved GPS errors and save-after-acquisition; preserve unsaved forms, searches and scroll across tabs. Storage failures retain drafts and records; partial import rollback is tested.
- Fixed area catch links, dynamic seasonal filtering, mobile group filtering and remembered period. Recent/monthly report modes are explicit; collection timestamps display in Japanese local time.
- Separated behavior/styles into app.js/styles.css/map-gestures.js, retaining public data formats and all three existing personal-data keys. The v5.0 worker precaches the new modules, data and all 47 licensed reference images and marks offline JSON responses explicitly. Packaging excludes scripts/tests/private material.
- Found and repaired two visual defects during testing: expanded sheets could obscure selected markers after tab changes, and GEBCO's SVG hidden attribute could prevent successfully loaded imagery from appearing. GEBCO now retries and falls back gracefully.
- Local verification: 7 Python +15 Node tests,27 Chromium/WebKit browser scenarios,18 failure/worker-upgrade scenarios passed. Automated WCAG A/AA scans found no violations on five main screens. Verified320–430px,landscape,tablet/desktop,200% text,photo credits/decoding,JSON/CSV,persistence,quota errors and GPS emulation. Chromium native two-touch tests cover map and photo zoom.
- Existing v4 worker/data upgrade passed in both engines. Chromium browser-offline reload passed. WebKit's network-offline navigation hit an engine internal error; an unreachable-origin reload passed instead. Physical iPhone Safari/Home Screen/GPS/VoiceOver/safe-area/keyboard checks are still required.
- Detailed checklist and repeatable commands: QA.md. Deployment verification is recorded there after publication.

- Production release complete: source296bdef, successful Pages run39699440275 and collector data commit9da7e0d. All27 core scenarios also passed on the actual HTTPS app in Chromium/WebKit. Production cache is seabornia-v5.0 with all47 photos and the three new modules/styles. Only physical iPhone acceptance remains; see QA.md.


## 2026-10-22 travel time, tides and conditions (v6)

- Implemented the approved plan: initially unset cruising speed, five-minute straight-line ETA and optional JST arrival across midnight; area/list/private-point estimates; independent trip date/hour; sea conditions tab with weather, marine waves, daylight, Oil/Aburatsubo tide predictions, interactive curve, official warnings and foreground-only return countdown/reminder.
- Public reports retain unknown catch time and use day-level Oil reference only. Conditions comparison separates public/private samples, fish/date filters and source/record links, without summing inconsistent quantities or claiming success rates. Optional personal time can capture available predicted tide and recent regional forecasts with provenance; missing history stays unknown.
- Preserved all three existing data keys; optional fields and backup v5 retain v4 import. Third-write settings import failure rolls back both records and preferences. Private coordinates are only compared locally against public locations.
- Added standard-library collector, normalized public conditions/tides JSON, hourly conditions Actions workflow, and six-hour catch workflow integration. Verified11 public locations and63 tide dates; failed updates retain last successful values/timestamps, with delayed/expired/missing UI states.
- Date/time controls own mobile rows with bounded native inputs, wrapping labels and16px minimum text. WebKit and Chromium screenshots inspected at320–430px, landscape,200% text. No actual iPhone keyboard/native picker/VoiceOver certification is implied.
- Found an installed-v5 upgrade race: its worker could pair new HTML with cached old JS and recreate a retired cache during activation. Release files are now app-v6.js/styles-v6.css, and the v6 worker reads only its own cache. Actual v4 and v5 worker upgrades and offline/unreachable-origin reopening pass with records/favourites intact.
- Local verification:10 Python +26 Node tests;27 core +26 conditions +24 failure/upgrade browser scenarios passed across Chromium/WebKit. Automated WCAG A/AA scan: no violations on five screens. Source remains in this repository; private receipts/screenshots are filed in the vault. Live verification is added below after publishing.

- Production UI source d89a338 passed Pages run39713073895; collector hardening69fff7a/c72f6de passed run39713251683. All53 core/conditions scenarios passed on the live URL in Chromium/WebKit. Live worker is seabornia-v6.0 with47 cached photos, new modules/JSON, offline conditions and a legacy personal record verified. A queued hourly refresh initially conflicted on generated JSON because checkout used the event SHA;8d318db makes both workflows check out current main after the shared lock. Standalone hourly verification follows.

- Final queue fix8d318db passed full Pages run39713502322. Standalone hourly collection/deployment39713599922 also succeeded after starting from current main; its data commit is bea8a59. Final live smoke confirms11 locations,22 successful forecast parts,63 tide dates, Oil station14/16 and no runtime errors (retrieval11:51 JST). Release is complete; only physical iPhone acceptance remains.


## 2026-10-22 depth and fish-area discovery (v7)

- Lewis approved named-area map filtering, a boat-and-compass icon and sourced area research, then requested implementation. Numerical GEBCO2026 reference cells collected for all10 public markers; sample/release/source/time and raw elevation preserved. Never substitute general fish habitat depth or claim these are soundings/whole-area depth ranges.
- Shared association resolver supports fish detail area lists and reverse catalogue filtering. Reviewed all47 entries;30 now have one or more area associations,17 remain海域未確認. Individual source evidence distinguishes reports, guides and unknown trip dates. No port-to-catch-location inference. See FISH-AREA-AUDIT.md.
- Map picker temporarily previews a named area with explicit confirm/cancel; restores the previous map/sheet/filters and keeps draft records. Photos and gesture module retained. Flowing map bottom actions, text-responsive toolbar, measured sheet limits and landscape layout repair enlarged-text collisions. Native date/time inner clipping at320px/200% repaired, with full-width mobile rows and keyboard-sized checks.
- New vector boat/compass icon plus180/192/512,32px favicon and separate safe-zone maskable512; Apple-touch icon/manifest/header updated. Release-versioned app-v7.js/styles-v7.css and SW7.0 prevent old-worker asset mixing. Storage keys and v5/v4 backups unchanged.
- Local unit/browser/worker checks and publication receipts are maintained in QA-v7.md. User-reported v6 Safari/Home Screen date/time/keyboard and map/photo pinch baseline passed; post-v7 physical acceptance/model/iOS remain separate pending steps. Source remains in the original repo.
