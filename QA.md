# iPhone redesign verification — 2026-10-22

The redesign uses calm outdoor layouts inspired by [AllTrails, Apple's 2023 iPhone App of the Year](https://www.apple.com/newsroom/2023/11/apple-unveils-app-store-award-winners-the-best-apps-and-games-of-2023/) and clear information hierarchy from [Flighty, an Apple Design Award winner](https://developer.apple.com/news/?id=970ncww4). Gesture and accessibility decisions follow Apple's [gestures](https://developer.apple.com/design/human-interface-guidelines/gestures) and [accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility) guidance.

## Local verification

| Change | Expected behavior | Verification |
|---|---|---|
| Map layout | Controls do not overlap; markers and controls have 44px targets | Chromium/WebKit, mobile sizes, screenshots |
| Camera and gestures | Focal pinch and pan, uniform scale, bounded movement, finger transitions/cancel, no accidental tap after movement | 9 math/state tests; Chromium native CDP two-touch input; mouse pan/zoom in both engines |
| Area details | Collapse/expand/close; selected point remains above/alongside sheet | Chromium/WebKit; an expansion/return-to-map occlusion was found and corrected |
| Area links/favourites | Correct fish/catch filter, clear filter, persistent favourites | Chromium/WebKit, storage/upgrade checks |
| Catalogue | Search/group/season/period; preserve search and scroll across tabs | Chromium/WebKit; initial period uses current month |
| Reports | Readable local-time collection timestamp, separate recent/monthly views | Chromium/WebKit; selected month drives monthly mode |
| Photos | 47/47 decode, licence credit, full-screen viewer and controls | Chromium/WebKit; only reviewed manifest images are used |
| Point creation | Temporary pin, name and confirm; cancel removes pin; drag does not save | Chromium/WebKit |
| GPS | Save-after-acquisition, accuracy, outside map bounds; denied/timeout recovery | Geolocation emulation and explicit error mocks in both engines; actual satellite reception not tested |
| Records | Draft preservation; photo save/reload/delete; JSON round-trip and CSV | Chromium/WebKit with isolated synthetic records |
| Storage/import failures | No false save or draft clearing; failed delete retains data; partial import rolls back | Quota/error injection in both engines |
| GEBCO | Failed image leaves usable map; retry restores image and zoom | Both engines; verified 1050×950 image fixture; SVG hidden-attribute defect found and fixed |
| Offline/update | Old v4 worker upgrades; all existing local-storage keys and unrelated caches survive | Actual workers in both engines; Chromium browser-offline reload and WebKit unreachable-origin reload |
| Responsive layout | No page overflow at 320/375/390/430px, landscape, tablet, desktop | Chromium/WebKit viewport checks and screenshot review |
| Accessibility | Contrast/labels, modal focus, 200% text, reduced motion, button gesture alternatives | Automated WCAG A/AA scans on five screens; focus checks in both engines |
| Packaging | Only public browser assets are published | Build allowlist includes modules/CSS, excludes tests/scripts/private source material |

Automated checks are grouped scenarios containing multiple assertions. They are not physical iPhone certification. The repeatable browser scripts and Node/Python tests are stored in this repository. Detailed local outputs are filed in Lewis's private vault, with only synthetic QA data.

## Physical device checks still required

- Safari and Home Screen launch on an actual iPhone, including an installed-v4 update.
- Two-finger map/photo gestures, edge/system gestures, orientation changes and browser toolbar movement.
- Keyboard visibility, photo picker, JSON/CSV save/share behavior and safe areas on the actual device.
- Real GPS permission denial/grant, positioning accuracy and return from Settings.
- VoiceOver reading order and gesture interaction.

WebKit's simulated network-offline navigation produced an engine-level internal error. WebKit's unreachable-origin fallback passed instead; Chromium's network-offline reload passed. On-device offline reopening remains part of the physical checklist.

## Production verification

Published source `296bdef` through [Actions run 39699440275](https://github.com/lewis-337/seabornia-fish-finder/actions/runs/39699440275), which completed successfully. The collector's published data refresh is `9da7e0d`.

- All 27 core browser scenarios also passed against the live HTTPS URL in isolated Chromium/WebKit contexts, including map/photo touch zoom, filters, forms and data round-trips.
- The actual production browser reports worker cache `seabornia-v5.0`, all 47 cached fish images, and cached `app.js`, `styles.css` and `map-gestures.js`, with no uncaught browser errors.
- The workflow verified 47/47 licensed images. Source data updated successfully; user records stayed inside isolated browser contexts and were never published.
- Physical iPhone checks listed above remain pending.


## Travel, tide and conditions release (v6), 2026-10-22

| Changed feature | Expected behavior | Actual local result |
|---|---|---|
| Cruising speed and ETA | Unset action; reject invalid values; NM/speed ×60 rounded up5; midnight arrival |10 pure trip tests and both engines; saved speed persists, ETA changes, next-day JST arrival correct |
| 海況 navigation | Five tabs retained; trip date/hour independent of catalogue; seabed guide retained | Both engines; drafts and filters preserved; compact map button avoids controls |
| Forecasts |11 public locations; wind m/s, direction from, gusts, rain, significant waves/period, daylight; timestamp/source/warnings | Actual provider collection succeeded for all11; UI checks and source links pass |
| Tide | Oil pc14/hc16; daily name/curve, rise/fall, next high/low across midnight |63 normalized dates including24:00 endpoints; curve slider/keyboard and JST event tests pass |
| Public catch context | No invented catch time or tide phase; day-level reference only | Date-only regression and both browser dialogs/comparisons pass; reported quantities unchanged |
| Personal conditions | Optional time; available predictions/forecasts saved with source, timestamp and nearby area; unknown history stays unknown | Snapshot/save/reload/v5 export checks pass; no private coordinates sent to providers |
| 条件別 | Public/private sections; fish/date filters, sample counts, underlying source/record links | Both engines; no success percentages, quantity totals or tide ranking |
| Return reminder | Countdown and foreground reminder within15 minutes; no background promise | Controlled-clock checks in both engines; overdue/resume math covered |
| Backup/storage | Existing keys; v5 round-trip and v4 import; preserve data on quota/partial failure | Both engines, including failed third settings write with complete rollback |
| Native date/time layout | Full-width mobile rows, wrapping labels, bounded native controls | Individual field rectangles and screenshots at320/375/390/430px,844×390 and200% text in both engines; inspected WebKit320px field images |
| Missing/stale/failure | Keep last success; distinguish missing, delayed, expired and cached | Python fault fixture and browser update-abort/delayed/expiry scenarios pass |
| Upgrade/offline | Installed v4 and v5 update to v6; new modules/data available offline; records/favourites survive | Both actual workers tested; versioned filenames and cache isolation fix reproduced v5 mixing defect; Chromium offline and WebKit unreachable-origin checks pass |
| Existing features | Pinch/pan/photo zoom, sheets,47 photos, filters, GPS mocks, JSON/CSV | All27 core scenarios pass after integration; all47 photos decode |
| Accessibility | Names/labels, focus, contrast,200% text and reduced motion | Existing focus/gesture alternatives and five-screen automated WCAG A/AA scan pass; native VoiceOver remains a device check |
| Public packaging | No private records/tests/repository files; no stale generated releases | Clean allowlisted dist build includes v6 assets and normalized JSON only |

Totals:10 Python tests,26 Node tests,77 grouped browser scenarios. Detailed receipts and reviewed screenshots are held privately in Lewis's vault. Repeatable commands: README.md; conditions checks use scripts/check_conditions.cjs.

Physical iPhone Safari/Home Screen, native date/time pickers, real keyboard/safe areas/GPS, and VoiceOver remain pending. Simulated browser checks above are reported separately. Hourly Actions scheduling is best effort; the UI shows the actual successful retrieval time rather than promising exact refresh delivery. Future fair catch comparisons would benefit from duration and zero-catch outings.


### Production v6 verification

- Source d89a338 published through successful [run39713073895](https://github.com/lewis-337/seabornia-fish-finder/actions/runs/39713073895). Collector time bounds/rebase hardening c72f6de passed [run39713251683](https://github.com/lewis-337/seabornia-fish-finder/actions/runs/39713251683). Both production collections succeeded for all11 locations and63 tide dates.
- All53 core/conditions browser scenarios passed again on the actual HTTPS app in Chromium/WebKit, including field/control bounds, ETA/snapshots/backups and unchanged map/photo gestures.
- An isolated production worker context confirms seabornia-v6.0,47 cached photos, release scripts/CSS, tide/forecast JSON, offline sea conditions and legacy records without runtime errors. Synthetic QA records were confined to temporary browser contexts.
- Updated release filenames and own-cache lookups fix the reproduced installed-v5 mixing problem. Queued hourly-job verification found another issue: the default event-SHA checkout could lag behind the preceding bot data commit. Both workflows now check out current main after the concurrency lock; provider collection also has an overall time budget and preserves successful datasets.
- Physical iPhone checks above remain pending.

- Final workflow verification: [main refresh39713502322](https://github.com/lewis-337/seabornia-fish-finder/actions/runs/39713502322) and [standalone hourly39713599922](https://github.com/lewis-337/seabornia-fish-finder/actions/runs/39713599922) both succeeded after the queued-checkout fix8d318db. The hourly job reported11 locations, zero forecast failures,63 tide dates and zero tide failures; public data commit bea8a59. Post-deployment smoke verified all22 provider/location parts healthy and no script errors. Last successful retrieval11:51 JST on2026-10-22.


## v7 depth/discovery/icon acceptance

Current expected/actual checklist, repeatable checks and separate physical-device baseline/pending results: [QA-v7.md](QA-v7.md). This supersedes v6 layout screenshots for the changed screens; historical v4–v6 release receipts above are retained.
