# Kanto and Okinawa v8 acceptance

Status: v8.3 published and critical live checks passed, 2026-10-23. Physical-device acceptance remains pending.

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

Initial v8 local baseline: 17 Python + 45 Node tests; 128 grouped browser checks (27 core, 26 conditions, 18 discovery/layout, 30 resilience/upgrades, 22 marina, 5 native touch). Screenshots and machine-readable results retained in the project's private vault QA folder.

Browser simulation is not physical-device acceptance. iPhone 13 Pro Safari/Home Screen native picker, keyboard, pinch, GPS, safe areas and VoiceOver must be checked on the device after v8. Older iOS/model support remains an API/layout target, not a claim of physical verification. WebKit offline uses an unreachable local origin because its browser-offline switch causes an engine internal error.

Public catch availability is incomplete while upstream article links fail. Official guides and personal recording remain usable; failed refreshes retain previous data. Forecast timestamps and expiry remain visible. No background return notifications or cloud sync.

## Reproduce

Run `python -m unittest discover -s tests -v`, `node --test tests/*.cjs`, and `python scripts/build_site.py`. Serve the checkout on port 8765. Set `SEABORNIA_PLAYWRIGHT` to an installed Playwright module, then run the check_browser, check_conditions, check_discovery, check_resilience, check_touch, check_marinas and check_marina_accessibility scripts. All browser checks use isolated contexts and synthetic data.

## v8.1 review correction

Choosing a fish explicitly now clears conflicting saved fish-group, squid, seasonal and area filters in the chosen workspace. This preserves normal per-marina filter restoration while ensuring an explicit target remains visible. The regression passed in Chromium and WebKit. App asset gets its own app-v8.1.js filename and worker v8.1 to avoid installed-cache mixing. Weather browser checks now use a clearly labelled fixed-date fixture so hourly collection cannot invalidate their historical test clock; real deployed data is checked separately.

## v8.2 native-select correction

Live WebKit inspection found native closed selects were 23px high despite author min-height; `appearance:none` restores the intended48px box. Semantics and the native option picker are retained, with an original chevron and responsive field columns. A new stylesheet filename and worker v8.2 prevent cached-style mixing. Destination selects now have explicit browser target-size assertions. Fixed-clock conditions tests stub the unrelated background-pack manifest; real offline assets are verified separately in the marina suite.

Regional map clustering now measures CSS pixels after SVG layout:48px hit targets stay separate at every tested width. Cluster taps zoom into their actual bases and a44px 全体 control resets the regional extent; synchronized list selection remains available. The revised discovery module has a distinct v8.2 asset filename.

## Physical-device acceptance (pending)

Primary device reported by Lewis: iPhone13Pro/iOS26.6.1. Record Safari and Home Screen separately; the earlier v6 device baseline does not verify the v8 release family.

| Device check | Expected | Safari actual | Home Screen actual |
|---|---|---|---|
| Native date/time picker | Open/close picker, change day/time; value and label fit in portrait/landscape | Pending | Pending |
| Japanese keyboard | Focus memo/coordinates, scroll to Save; keyboard and browser bars do not cover actions | Pending | Pending |
| Map two-finger gesture | Spread/contract while moving midpoint; lift/re-add finger; no marker activation or saves | Pending | Pending |
| Photo gesture | Pinch/pan, double-tap reset and Close | Pending | Pending |
| Marina isolation | Record a clearly labelled test entry, switch bases and return; draft and record stay with their marina | Pending | Pending |
| Offline | Finish all-base download, disconnect, reopen and choose another base; expired forecasts remain labelled | Pending | Pending |
| VoiceOver and large text | Meaningful names/focus, reachable close/save controls, no intersections at enlarged text | Pending | Pending |
| Safe areas and rotation | Respect notch/home indicator, Safari bars and landscape | Pending | Pending |

Other models and older iOS devices remain separately unverified. API target iOS15.5+ is based on required browser APIs, not physical-device coverage.

## v8.3 final comparison review

Destination cards now show provenance, newest evidence date, ground count and vessel cautions. Verified rental reports sort ahead of official guidance, followed by nearby references and unconfirmed candidates. Previewing a marina shows matching named grounds, reference GEBCO depths and distance/ETA before committing a workspace switch. Catch collection requires explicit rental-vessel wording before classifying a report as rental evidence, retains curated references, and compares Japanese catch dates in JST.

Actual local results: 19 Python tests and 46 JavaScript/service-worker tests pass; 22 marina scenarios pass in Chromium/WebKit, including preview grounds and independent records; 10 automated accessibility states report zero violations. Native iPhone checks remain pending. Installed-version upgrade and final live receipts follow.

## Final publication receipt, 2026-10-23

- Source `20f4ba6d29db08d32796a3e0c3957116f5327a76`, generated public data `10d3a00`, [Pages39935507298](https://github.com/lewis-337/seabornia-fish-finder/actions/runs/39935507298) completed successfully. Live HTML reports8.3; HTML, worker and current script/style bytes match the reviewed checkout.
- Current local:19 Python and46 JavaScript/service-worker tests;22 marina browser scenarios;24 installed-version upgrade/offline scenarios (v5 through v8.2 in both engines);5 native Chromium multi-touch scenarios;10 accessibility screens with zero automated violations. Prior v8 baseline additionally covers v4 upgrade, fault handling,27 core,26 conditions and18 discovery/layout scenarios.
- Final live:11 Chromium marina cases,9 WebKit smoke checks,2 explicit-fish-filter regressions and10 automated accessibility screens pass. WebKit verifies native closed selects/marker hit targets, correct Okinawa tides, date/time draft isolation/restoration and all100 cached offline pack assets. Chromium reopens a never-visited base offline. Live marina preview screenshots confirm named grounds and reference depth.
- Earlier v8.2 live regression:27 core and26 fixed-date conditions scenarios passed. The latter use a labelled historical fixture; current hosted data was checked separately:40 public forecast points,80 healthy provider parts, verified Okinawa stations都屋47-23/泡瀬47-32,100 offline assets. Forecast history is never claimed from the fixed test fixture.
- The first ad-hoc final WebKit smoke clicked discovery before its async data was ready; the app's loading guard kept the dialog closed. The harness now waits for loaded regional fish options, as the maintained marina suite already does; rerun passed with no runtime errors.
- Evidence and reviewed screenshots are retained in the private vault QA folder `2026-10-23-kanto-okinawa`. Upstream catch-article failures and physical iPhone/older-iOS checks remain explicitly unresolved; no invented catches or device results.
