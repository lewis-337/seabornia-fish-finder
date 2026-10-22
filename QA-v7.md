# v7 depth, discovery and iPhone layout acceptance · 2026-10-22

Local tests use disposable browser contexts and synthetic records. They do not access Lewis's browser data or an attached iPhone. Public release target: https://lewis-337.github.io/seabornia-fish-finder/ .

| Feature | Expected behavior | Actual local result / evidence |
|---|---|---|
| Reference depth | Numerical GEBCO2026 cell at each approximate public marker; nearest5m, under5m and unknown handled; source/release/sample/collection time |10/10 live WMS samples; collector and rounding tests pass. Area list, sheet and fish-area rows inspected. Raw elevations retained, not fish habitat depths or tidal corrections. |
| Source fishing depth | Keep report/guide depths separate, with provenance | Separate evidence disclosures; exact named areas checked in primary pages. Mixed unnamed locations, ports and ambiguous サバ not assigned. FISH-AREA-AUDIT.md reviews all47 entries;30 have area associations,17 remain unknown. |
| Fish → areas → map | Shared association rules, near-marina first, evidence badge, specific map action | Both engines open the correct existing area sheet. Longer species names do not create substring matches; シロアマダイ/アマダイ, ツムブリ/ブリ and ショゴ stage rules covered. |
| Catalogue location filter | Named-area dropdown and map picker; explicit confirm/cancel, stable ID | Both engines: same fish resolver both directions. Preview/confirm/cancel work; camera/layer/sheet nodes and handlers restore, search/group/season/drafts retained; point creation disabled in picker. |
| Layout | No unintended control/sheet intersections, selected marker visible, scrolling close button reachable | Both engines:320/375/390/430px portrait,844×390 landscape,768px tablet,1280px desktop at100/200% text. Actual rectangles/intersections checked for collapsed/expanded sheets, markers, toolbar, GPS, zoom and bottom actions. Screenshots reviewed. |
| Native form controls | Full-width date/time; values inside control, labels wrap, actions reachable | Both engines check outer AND inner boundaries, including nested departure/return controls. WebKit320px/200% exposed value clipping; repaired native padding/weight and nested margins. Keyboard-sized420px viewport confirms scrolling to fields/memo/save. Real keyboard/picker acceptance remains separate. |
| Gestures | Map/photo pinch in/out and pan; safe finger changes/cancel; never save/activate from drag | Existing9 pure camera/gesture tests and core native Chromium two-touch map/photo checks pass. Additional native touch checks documented in touch-results.json. Device observations listed separately below. |
| Icon | Boat/compass legible small, no pre-rounded exterior, maskable safe circle, correct iOS touch icon | Reviewed24/32/60/180px preview.192/512 and separate maskable512 decode.180px Apple icon and32px favicon use new filenames; manifest start URL/identity unchanged. Existing installed icon refresh is iOS-controlled. |
| Records/photos | Legacy keys/formats;47 licensed photos; GPS, photos, save/reload/delete, JSON v5/v4/CSV, failed storage | Core and resilience suites pass, including denial/timeout, quota and import rollback. No private data sent or published. |
| Conditions | Existing ETA/tides/forecasts, date-only public records, historical unknowns and stale/offline labels | All26 conditions browser scenarios pass. Trip date remains separate from catalogue month; no invented catch times/tide phases. |
| Missing/failure/offline | Reference files may fail without losing usable guide; source collection retains last success | Failed-reference browser checks and collector fault tests pass. Actual v4/v5/v6 workers upgrade to v7, preserve all three keys and unrelated caches; new reference JSON cached offline. Chromium offline and WebKit unreachable-origin checked separately. |
| Accessibility | Labels, focus, Escape,44px controls, reduced motion, readable contrast | Eight-screen/state automated WCAG A/AA scan reports zero violations; keyboard/focus/reduced-motion core checks pass. VoiceOver is a separate physical-device check. |
| Packaging/update | Dist contains only public browser files; distinct changed asset names; no stale cache mix | Allowlisted build passes; app-v7.js/styles-v7.css/fish-areas.js/new icon names and SW7.0 updated together. Shared gesture/trip files unchanged. |

## Repeatable checks

```sh
.venv/bin/python -m unittest discover -s tests -v
node --test tests/*.cjs
python scripts/build_site.py
# Set SEABORNIA_PLAYWRIGHT to an installed Playwright module; run a server on8765.
node scripts/check_browser.cjs
node scripts/check_conditions.cjs
node scripts/check_discovery.cjs
node scripts/check_touch.cjs
SEABORNIA_GEBCO_FIXTURE=/path/to/verified-1050x950-gebco.jpg node scripts/check_resilience.cjs
```

Reference depths refresh with `python scripts/collect_depths.py` or manual main-workflow dispatch; hourly forecasts do not repeatedly download a static depth grid. Primary source URLs and individual-cell metadata live in data/area_depths.json and data/fish_areas.json. Regenerate icons with scripts/render_icons.cjs.

## Physical iPhone evidence

Before v7, Lewis reported that date/time fields and memo keyboard worked in BOTH Safari and Home Screen mode, and map/photo two-finger zoom were smooth without accidental activation/save. These are user-reported baseline results, without supplied screenshots/model/iOS version. They are not direct tool observations or post-v7 acceptance.

Post-v7 device results are pending. Confirm the 魚種 tab shows 地図で選ぶ (and 海況 information shows v7.0), then in EACH mode:

1. 記録: open date/time pickers; edit date/time; type a multi-line memo with keyboard open; scroll to save. Check values, labels, actions and safe areas in portrait and landscape. Use a clearly named test record only if saving is desired.
2. 海況 → 巡航速度設定: open departure/return dates and times; check their boundaries with the keyboard/pickers and larger text.
3. Map: pinch apart/together, move both fingers together, lift one finger and continue, interrupt/cancel; tap a named area afterward. Check sheet, selected marker, GPS/zoom and close control remain usable, with no accidental point/save form.
4. Fish photo: pinch/pan, finger transitions, reset and close. 魚種 → 地図で選ぶ: preview/confirm/cancel an area and check the original filters survive.
5. Confirm boat-and-compass icon in Safari/new install. iOS may retain an existing Home Screen icon. Keep the original installed app/data intact; export/verify a JSON backup before any reinstallation or icon replacement. Never clear Safari website data for an icon update.

Record iPhone model, iOS version, mode, expected/actual result and screenshots for failures. Real GPS/VoiceOver/offline device behavior remains separately pending unless explicitly tested/reported. No claim that simulation is physical-device proof.

## Publication

Local checks complete:13 Python +32 Node tests,104 grouped browser scenarios (27 core,26 conditions,28 resilience/upgrade,18 discovery/layout,5 additional native Chromium touch), and8 automated accessibility states with zero WCAG A/AA violations. GEBCO reference data:10/10 cells. Local screenshots and detailed JSON receipts are retained privately in the canonical vault. Publication succeeded through [Pages run39766332886](https://github.com/lewis-337/seabornia-fish-finder/actions/runs/39766332886), sourcec20b09c. All76 core/conditions/discovery/touch scenarios passed again on the actual HTTPS app in Chromium/WebKit (native additional touch input in Chromium). Both production workers report SW7.0,47 cached photos,10 depth cells and new modules/icons; Chromium offline reload shows fish-area depth and cached sea conditions. WebKit unreachable-origin reopening was verified locally, separately from its problematic network-offline emulation. No uncaught script errors. Post-v7 physical iPhone results remain pending.
