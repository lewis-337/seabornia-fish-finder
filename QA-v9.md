# v9 content, photos and tap-to-top acceptance

Local acceptance complete. Publication/live receipt follows.

| Changed feature | Expected | Actual locally |
|---|---|---|
| Every location | Individual information and traceable sources | 25 researched profiles,24 selectable; all24 opened and inspected in Chromium/WebKit |
| Fishing depth/context | Source-backed fish, place, tackle and historical dates | 63 added evidence rows; four additional named broad grounds; model cells stay separate from reported depths |
| Uncertainty | No invented catches/seasons/permissions | Member posts keep publishedAt, no catch date or month classification; three bases retain specific fish-permission gaps |
| Closed/inactive bases | No closed/suspended entries in any discovery list | Availability guard, secondary list filtering, no-fleet Oil-tsubo exclusion; archival records/storage retained |
| Photos | Every catalogue entry has a real photo | 57/57 decode;54 deduplicated assets; seven new regional photos, correctedカマス and OpenCage attribution; representative/growth-stage labels |
| Top action | Tap app header/↑; keyboard equivalent | App header button and discovery ↑ work; reduced motion honoured; drafts/filters retained |
| Native iPhone top gesture | One mobile reading root scroller | Document scroll verified; sticky marina context and independent tab/marina scroll restoration pass. Actual status-bar tap requires physical Safari/Home Screen check |
| Forms/layout | No clipped native fields/overlapping actions | 320–430px, landscape, desktop/tablet,200% text, keyboard-sized viewport checks pass |
| Offline/update | Complete offline packs and safe old-version update | 97 current public pack assets; all57 photos; actual v4 through v8.3 upgrades and offline/unreachable-origin reloads pass |
| Accessibility/gestures | Existing names/focus/contrast/zoom preserved | 10 axe screens with0 violations; map/photo multi-touch transitions, cancellation and marker safety pass |

Current units:23 Python +47 JavaScript/service-worker tests. Browser suites:27 core,26 conditions,18 discovery/layout,22 marinas,46 resilience/upgrade,5 native Chromium touch,12 content/root-scroll scenarios;10 additional automated accessibility states. Conditions use the labelled fixed-date fixture, with current normalized datasets checked separately.

Source link checks repaired Kachidoki and YBM links. Direct Yamaha503 failures are visibly labelled; not treated as business closures. Optional missing depth data no longer aborts destination loading. Upgrade fixtures now serve the actual historical photo manifest before upgrading; feeding the new shared-photo manifest to an old worker install was an inaccurate fixture and could hang before upgrade.

Photographs were visually reviewed on three contact sheets plus the correctedカマス file. Browser screenshots cover enriched profiles at320px and200% text/landscape. Data lineage: MARINA-CONTENT-AUDIT.md and PHOTO-AUDIT-v9.md. Private QA artifacts remain in the canonical vault; source remains in this repository.

Physical-device status: post-v9 iPhone13Pro/iOS26.6.1 Safari/Home Screen native date picker, keyboard, status-bar tap, pinch, safe areas, GPS and VoiceOver remain pending. Browser simulation does not verify those device interactions. Earlier iPhone reports do not establish v9 acceptance.

Native scroll-to-top reference: [Apple scrollsToTop](https://developer.apple.com/documentation/uikit/uiscrollview/scrollstotop). A website cannot register a handler for the system status bar; mobile reading pages now use the document scroller, plus the tested in-app header alternative. Dialog ↑ resets only the dialog, and map top taps do not reset camera or create records.
