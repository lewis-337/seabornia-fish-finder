# SFF fishing assistant backend

Prepared 2026-11-20. Not deployed or activated. No real AI request has been made.

The public GitHub Pages app has a new 相談 screen. Its free 資料検索 mode searches the
saved fish catalogue, selected marina's public catch reports, source-linked guides
and a short JMA-based tide glossary. It is explicitly labelled as reference search.
AI相談 adds follow-up conversation, multilingual answers and optional live web search.
The real AI mode needs a separately hosted backend and an authorized API account.
Eligible subscription API credits can cover that usage; separate paid credit
purchases are not required while those credits are available.

## Subscription route checked 2026-11-20

Lewis reports ChatGPT Pro. Official documentation supports two distinct routes:

- Eligible Pro/Business subscriptions can claim API-credit benefits against an
  owned API organization. These cover Responses and hosted web search, so they
  fit this hosted iPhone PWA without replacing its inference integration.
- Sign in with ChatGPT can authorize plan usage in supported open-source/local
  tools. This requires a separate OAuth integration and is not a generic token
  export from the Codex app. Its preview requires streaming and rejects fields
  such as `max_output_tokens` and `max_tool_calls`; do not simply replace the
  prepared API key with a subscription login token. Remotely hosted offerings
  have separate access requirements; personally hosted VMs have specific guidance.

The live Personal Organization billing page offered $57 prorated Pro credit now
and $100 on December 7, 2026. Auto-reload was OFF. At the final claim step, OpenAI
warned that claiming disables Codex through **all API keys in that organization**,
including usage paid with purchased credits. Subscription-signed-in Codex and
regular API usage remain available. Lewis was asked to approve this material
account-wide side effect. At this entry the final acknowledgment and Link & claim
have not been submitted; the benefit is not claimed or connected to SFF.

There is an existing API balance in this organization. Regular API billing can
fall back to purchased credits after the free grant is exhausted. Therefore
auto-reload OFF alone is not a guarantee of subscription-only usage. Do not
activate unattended SFF requests or claim a zero-extra-spend cap until a suitable
guard/billing configuration and real account evidence have been verified.

References:
- [Subscription API credits](https://developers.openai.com/api/docs/guides/chatgpt-api-credits)
- [Sign in with ChatGPT plan usage](https://developers.openai.com/siwc/token-sharing-open-source)
- [Preview requirements](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations)

## Prepared integration

- Node 22+ service, no npm dependencies. `api/chat.js` is a Vercel adapter;
  `server/start.cjs` is a localhost development entry point.
- The API reads only allowlisted public SFF data paths, refreshed from the fixed
  public Pages origin with a five-minute in-process cache. Network failure retains
  the last data or the bundled public snapshot, preserving its original timestamps.
- Shared retrieval selects evidence for the chosen marina, with all 141 catalogue
  entries available. No phone storage, private catch records, photographs or GPS is read.
- Requests contain only `question`, `marinaId`, `web` and at most eight recent
  conversation messages. Questions themselves are user-entered and may contain
  personal information if the user types it.
- OpenAI Responses, `store:false`, configurable model (default `gpt-6-luna`), low
  reasoning, 2,200 output-token ceiling. Web-enabled answers request one hosted
  `web_search` call maximum. Live-search labels require an actual completed search
  output, never just a checkbox. Output is plain text with clickable inline
  provider citations and source IDs mapped to the retrieved documents.
- Origin check, constant-time owner-token check, bounded body/history, timeout,
  one concurrent request and six requests/minute **per running instance**. These
  are not a durable global quota or a hard spending cap. Serverless cold starts
  and multiple instances reset/multiply the instance limits. Do not describe them
  as a monthly budget. Provider/hosting billing controls must be agreed before activation.
- The owner access token is separate from the AI key and held only in page memory.
  The token must be at least 32 random characters; it is not committed or placed in
  public configuration. The AI key lives only in the backend's secret environment.
- Cancellation stops the browser's wait. The server's bounded upstream request may
  still finish and incur a charge; cancellation is not promised as a billing stop.

## Activation steps after Lewis's backend/spending decision

1. Build a clean bundle into a new folder:
   `python3 scripts/build_chat_backend.py /tmp/sff-chat-backend-RELEASE`.
   This includes only the API, shared retrieval and selected public JSON, never
   `.env`, the vault, chat exports, photos, other projects or phone records.
2. Deploy that bundle to the agreed Node host. For Vercel, use the generated
   `vercel.json` (60-second function duration and explicit JSON inclusion).
   Do not deploy the entire business vault or an unrelated existing project.
3. Set these secrets/configuration through the host's protected environment:

   | Name | Value / purpose |
   | --- | --- |
   | `OPENAI_API_KEY` | User-approved project API key, server only |
   | `OPENAI_MODEL` | `gpt-6-luna`, or an explicitly reviewed supported model |
   | `SFF_CHAT_TOKEN` | Separate random owner access token, at least 32 characters |
   | `SFF_ALLOWED_ORIGIN` | `https://lewis-337.github.io` |
   | `SFF_CHAT_ENABLED` | `true` only after activation approval |

4. Confirm the production route rejects missing/wrong tokens and origins without
   making provider requests. Run a bounded real 大潮 question and a follow-up,
   then a current-information question with live web search; inspect actual cited
   evidence and model behavior. Existing unit/browser fixtures do not prove real
   AI quality, account availability, deployed bundling, CORS or API compatibility.
5. Put the approved HTTPS `/api/chat` endpoint and `enabled:true` into
   `data/chat-config-v11.json`. That JSON contains no secret. Publish the reviewed
   app release; verify actual installed-worker upgrade and a real owner session.
6. Check actual iPhone Safari/Home Screen input, keyboard, scrolling and source
   links separately. Record the deployment, budget decision and actual receipts.

## Cost estimate, not a cap

Official rates checked 2026-11-20: GPT-6 Luna standard token rates are US$0.10/1M
input and US$0.50/1M output tokens; hosted web search is US$10/1,000 calls plus
search-content token charges. An illustrative 100 short answers, each with one
lookup, roughly 6,000 prompt tokens and 1,000 output tokens, would be around
US$1–$2 in API usage, depending on retrieved search context and reasoning. Hosting,
taxes, exchange rates and any plan changes are additional. This is not a quote or
an authorized budget. No subscription purchase, billing activation or spending
has been performed.

Sources:
- [OpenAI quickstart](https://developers.openai.com/api/docs/quickstart)
- [GPT-6 Luna](https://developers.openai.com/api/docs/models/gpt-6-luna)
- [Web search and citation requirements](https://developers.openai.com/api/docs/guides/tools-web-search)
- [API pricing](https://developers.openai.com/api/docs/pricing)
- [Vercel static function configuration](https://vercel.com/docs/project-configuration/vercel-json)

## Local verification

`node --test tests/*.cjs` includes backend validation, selected-marina retrieval,
Unicode citations, no-paid-call activation/auth gates and provider-error cases.
`scripts/check_chat.cjs` uses synthetic AI responses in isolated Chromium/WebKit
contexts; it never calls a paid model. See `QA-v11.md` for the completed scope.
