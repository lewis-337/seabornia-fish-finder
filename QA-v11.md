# v11 fishing chat candidate, 2026-11-20

Status: implemented locally, not published. AI/backend activation awaits Lewis's
backend and spending choice. The public app remains the last deployed release.
No real API inference, API billing change, server deployment or phone acceptance
has been performed.

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
  memory; private points/catches/photos are never automatically read or submitted.
- Public data can refresh only from fixed allowlisted SFF Pages paths. Fallback
  keeps original data timestamps. Backend request/output/search limits are not a
  global or monthly spending cap. See `server/README.md`.
- New release asset names/SHELL/build allowlist are aligned. The old v10.1 runtime
  remains in source history. No personal storage format/key migration.

## Verified locally

- 36 existing Python tests passed.
- 63 Node tests passed, including 10 new chat/backend cases: tide retrieval,
  marina isolation, specific fish names, missing catch dates, request validation,
  actual public data for all 24 selectable bases, allowlisted remote-data failure,
  bounded provider request and actual-search evidence, Unicode inline citations,
  activation/origin/auth/body gates and sanitized provider failures.
- Existing 28 Chromium/WebKit app checks passed: map/gestures, all 141 photos,
  record save/import/export, GPS simulations, responsive layouts and runtime errors.
- 16 grouped new chat scenarios passed across Chromium and WebKit: 大潮/English
  answers and sources; no-match/text injection; A–B–A marina drafts/history;
  320/390/844/1280px and enlarged text; automated WCAG A/AA checks; loaded offline
  references; synthetic AI follow-ups with private sentinel exclusion; errors,
  cancellation and reload clearing token/history. Automated accessibility scans
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

## Still required

1. Lewis's backend/API-spending decision and approved account setup.
2. Actual deployed backend, authentication/CORS, account/model availability and
   bounded real AI + web-search acceptance, with factual/source review.
3. Approved endpoint in `data/chat-config-v11.json`, app publication and hosted
   upgrade verification. It currently contains `enabled:false` and no endpoint.
4. Physical iPhone Safari/Home Screen keyboard, scrolling, source links and voice
   accessibility checks. Browser simulation is not physical-device proof.

Earlier v10.1 device/source gaps remain outstanding, not replaced by these tests.
