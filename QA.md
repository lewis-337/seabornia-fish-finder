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
