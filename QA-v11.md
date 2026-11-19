# v11 fishing chat candidate, 2026-11-20

Status: frontend published at https://sff-fishing-app.vercel.app/ with the protected backend connected. Physical phone acceptance is separate. Latest online-search acceptance is recorded below.

## Behavior

- Sixth navigation item, 相談, in the existing Japanese UI. Mobile reading layout,
  source links, example questions, per-marina in-memory conversations and drafts.
- Free reference search reads the app's public catalogue, current selected marina's
  reports and reviewed guides, plus JMA-sourced 大潮/小潮 and tide explanations.
  Japanese and English tide explanations are separated by the question's language.
  The UI explicitly distinguishes reference search from conversational AI.
- Prepared optional private AI backend: short follow-up conversation, optional
  hosted web search, inline citations, selected-marina public evidence and dated
  source information. Provider key stays server-side. Owner token stays in page
  memory unless the owner explicitly chooses this-device storage; private points/catches/photos are never automatically read or submitted.
- Public data can refresh only from fixed allowlisted SFF Pages paths. Fallback
  keeps original data timestamps. Backend request/output/search limits are not a
  global or monthly spending cap. See `server/README.md`.
- New release asset names/SHELL/build allowlist are aligned. The old v10.1 runtime
  remains in source history. No personal storage format/key migration.

## Verified locally

- 36 existing Python tests passed.
- 64 Node tests passed, including 10 new chat/backend cases: tide retrieval,
  marina isolation, specific fish names, missing catch dates, request validation,
  actual public data for all 24 selectable bases, allowlisted remote-data failure,
  bounded provider request and actual-search evidence, Unicode inline citations,
  activation/origin/auth/body gates and sanitized provider failures.
- Existing 28 Chromium/WebKit app checks passed: map/gestures, all 141 photos,
  record save/import/export, GPS simulations, responsive layouts and runtime errors.
- 18 grouped new chat scenarios passed across Chromium and WebKit: 大潮/English
  answers and sources; no-match/text injection; A–B–A marina drafts/history;
  320/390/844/1280px and enlarged text; automated WCAG A/AA checks; loaded offline
  references; synthetic AI follow-ups with private sentinel exclusion; errors,
  cancellation, reload clearing history and unsaved codes, optional code storage/removal,
  and safe bold/link rendering without HTML injection. Automated accessibility scans
  found no violations within the chat screen.
- 8 actual installed-worker checks passed: v10.1 and v9 to v11 in both engines,
  retaining saved points/catches/favourites and unrelated caches, plus offline
  reload (Chromium) / unreachable-origin fallback (WebKit) and offline chat lookup.
  Repaired the old test's assumption that today's tide exists in October fixtures;
  it now selects a date actually present in the saved dataset.
- Static bundle references resolve. Backend/API directories are excluded from
  `dist/`. Separate 33-file public-source backend bundle loaded its Node handler
  and selected-marina retrieval successfully; deployment was not attempted.

Browser receipts/screenshots are in the private vault QA directory linked from
the SFF project note. `scripts/check_chat.cjs` uses synthetic AI fixtures only.

## Real activation and hosting checks, 2026-11-20

- Linked Lewis’s Pro credit grant: $57 available until December 7; next grant
  offered $100 on December 7. Auto-reload remains OFF, no new credit purchase.
- Dedicated API project with $5 monthly hard spend limit; provider enforcement
  may lag. Existing purchased credit can be used after grants are exhausted.
- Actual Japanese tide answer, English conversational follow-up and web search
  passed through the standard Responses API with `gpt-6-luna`.
- Public-only Node 22 backend deployed at
  `https://sff-fishing-chat-api.vercel.app/api/chat`, Vercel deployment
  `dpl_ALMhDXGtL7gNS5txJQPKWdNQEcpi` on Lewis’s existing active Pro team.
- Hosted preflight 204, missing/wrong token 401, wrong origin 403, GET 405.
  Real 大潮 answer and real web-search tip-run answer both returned 200;
  cited JMA and Shimano sources inspected. No private device data submitted.
- Playwright fixtures now wait for public offline-pack downloads before reloads:
  rapid reloads during cache writes cause WebKit access-control cancellation errors.
  This avoids conflating intentionally interrupted background downloads with chat failures.

## Remaining device follow-up

Physical iPhone Safari/Home Screen keyboard, scrolling, source links and voice
accessibility checks. Browser simulation is not physical-device proof. Earlier
v10.1 device/source gaps remain separate.

- Release hardening: worker network requests now time out after eight seconds so cached public JSON can load when a connection stalls. A stalled-network cache fallback regression test passes.


## Direct Vercel release, 2026-11-20

- Standard Vercel CLI device authorization completed; `whoami` verifies lewis-337 on the existing team. No plan upgrade or GitHub integration is required for this deployment.
- Public-only frontend deployed as `sff-fishing-app`, production https://sff-fishing-app.vercel.app/, deployment `dpl_E2rFC8psRT2FZYgCkfancg3e2pgm`. Anonymous index/config requests return200.
- API redeployed as `dpl_A4gsGcRZHrfxzL45a8mK2ng3KRsh`; exact comma-separated origin allowance retains GitHub Pages alongside the new Vercel address. Both preflights return204, missing owner codes401, lookalike origin403 with no allowance. Unit coverage confirms rejected origins make no paid call.
- 36 Python and65 Node tests passed. All18 chat browser groups passed against the published site in Chromium/WebKit, using fixture AI responses in isolated contexts; chat WCAG A/AA scans found no violations.
- Separate owner-browser requests used the actual production API: 大潮 answer200 with JMA links, plus fishing-tip answers200. Search calls completed, but three browser answers explicitly reported no usable online results. This does not establish fresh online-source retrieval; prior successful web acceptance remains historical evidence.
- Owner code filled privately in the Mac browser, device-storage checkbox left unchecked. No provider key in the public package. Personal browser records remain under their original origin; backup/import is required to transfer them.
- GitHub account restriction/support review remains independent. Direct hosting does not resume blocked Actions collectors; public timestamps remain authoritative.
