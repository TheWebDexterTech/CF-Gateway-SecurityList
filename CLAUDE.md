# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 1. Overview

Automation that syncs DNS allow/block lists to Cloudflare Zero Trust Gateway
(Pi-hole-like blocking, no servers to run), designed to run entirely on free
GitHub Actions compute. A from-scratch rewrite of
`mrrfv/cloudflare-gateway-pihole-scripts` using native `fetch` instead of
`node-fetch`. Plain Node.js (ESM, `type: module`), no TypeScript, no test
suite, no linter, no build step — verification is via `npm run dry` and
manual review.

## 2. File Index

| File | Role | Key exports |
| --- | --- | --- |
| `download_lists.js` | CLI entry. Downloads allow/block source URLs and streams them into `allowlist.txt` / `blocklist.txt`. Arg `allowlist`\|`blocklist` limits to one; no arg does both. | — (script) |
| `cf_list_create.js` | CLI entry. Reads the two `.txt` files, normalizes/dedupes/validates domains, chunks into 1,000-domain lists, creates them via the Cloudflare API. | — (script) |
| `cf_list_delete.js` | CLI entry. Finds all `CFGSL List` lists on the account and deletes them (sequential or batched per `FAST_MODE`). | — (script) |
| `cf_gateway_rule_create.js` | CLI entry. Builds a wirefilter expression referencing every managed list and creates the `CFGSL Filter Lists` Gateway rule. | — (script) |
| `cf_gateway_rule_delete.js` | CLI entry. Finds the `CFGSL Filter Lists` rule by name and deletes it. | — (script) |
| `get_recommended_filters.sh` | Convenience wrapper: `node download_lists.js blocklist`. | — |
| `get_recommended_whitelist.sh` | Convenience wrapper: `node download_lists.js allowlist`. | — |
| `lib/constants.js` | All env-driven config (via `dotenv`) plus recommended default source URLs and API/limit constants. Read first when tracing a config value. | `API_TOKEN`, `ACCOUNT_ID`, `ACCOUNT_EMAIL`, `LIST_ITEM_LIMIT`, `LIST_ITEM_SIZE`, `API_HOST`, `API_PAGE_SIZE`, `MAX_RETRIES`, `REQUEST_TIMEOUT_MS`, `DRY_RUN`, `FAST_MODE`, `CONCURRENCY`, `PROCESSING_FILENAME`, `LIST_TYPE`, `LIST_NAME_PREFIX`, `RULE_NAME`, `USER_DEFINED_*_URLS`, `RECOMMENDED_*_URLS` |
| `lib/helpers.js` | Low-level HTTP: auth headers, timeout, retry/backoff, pagination, domain normalization. | `requestGateway`, `requestGatewayAllPages`, `normalizeDomain` |
| `lib/api.js` | Cloudflare Zero Trust list/rule CRUD, built on `lib/helpers.js`. | `getZeroTrustLists`, `getManagedLists`, `createZeroTrustListsSequential`, `createZeroTrustListsBatched`, `deleteZeroTrustListsSequential`, `deleteZeroTrustListsBatched`, `getZeroTrustRules`, `createZeroTrustRule`, `deleteZeroTrustRule` |
| `lib/utils.js` | Domain/comment validation, file streaming I/O, bounded concurrency runner. | `sleep`, `isValidDomain`, `isValidResourceId`, `extractDomain`, `isComment`, `downloadFiles`, `readFile`, `runWithConcurrency` |

## 3. API Endpoint Table

All calls go through `lib/helpers.js#requestGateway` to
`https://api.cloudflare.com/client/v4/accounts/{ACCOUNT_ID}/gateway`. This
project is a client of the Cloudflare API, not a server — there are no
inbound endpoints.

| Method | Path | Called from | Purpose |
| --- | --- | --- | --- |
| GET | `/lists` (paginated) | `lib/api.js#getZeroTrustLists` → `getManagedLists` | List all / managed (`CFGSL List*`) Zero Trust lists |
| POST | `/lists` | `lib/api.js#createZeroTrustList` (used by `cf_list_create.js`) | Create one 1,000-domain chunk list |
| DELETE | `/lists/{id}` | `lib/api.js#deleteZeroTrustList` (used by `cf_list_delete.js`) | Delete a managed list |
| GET | `/rules` (paginated) | `lib/api.js#getZeroTrustRules` (used by `cf_gateway_rule_create.js`, `cf_gateway_rule_delete.js`) | List all Gateway rules |
| POST | `/rules` | `lib/api.js#createZeroTrustRule` (used by `cf_gateway_rule_create.js`) | Create the `CFGSL Filter Lists` DNS block rule |
| DELETE | `/rules/{id}` | `lib/api.js#deleteZeroTrustRule` (used by `cf_gateway_rule_delete.js`) | Delete the Gateway rule |

## 4. Database Schema Reference

N/A — this project has no database. State lives entirely in the Cloudflare
Zero Trust account (lists/rule identified by the `CFGSL List` /
`CFGSL Filter Lists` name convention in `lib/constants.js`) plus two local
scratch files regenerated on every run: `allowlist.txt`, `blocklist.txt`
(gitignored).

## 5. Common Task → File Map

| Task | File(s) to edit |
| --- | --- |
| Change default block/allow sources | `lib/constants.js` (`RECOMMENDED_BLOCKLIST_URLS` / `RECOMMENDED_ALLOWLIST_URLS`) |
| Change domain normalization/parsing rules (new hosts-file/adblock syntax) | `lib/helpers.js#normalizeDomain` |
| Change what counts as a valid domain | `lib/utils.js#isValidDomain` |
| Change dedupe/subdomain-collapse logic | `cf_list_create.js` (uses `lib/utils.js#extractDomain`) |
| Change list chunk size / item cap | `lib/constants.js` (`LIST_ITEM_SIZE`, `LIST_ITEM_LIMIT`) |
| Change retry/backoff or timeout behavior | `lib/helpers.js#request` (via `lib/constants.js` `MAX_RETRIES`, `REQUEST_TIMEOUT_MS`) |
| Change concurrency behavior for bulk create/delete | `lib/utils.js#runWithConcurrency`, `lib/api.js` (`*Batched` functions), `lib/constants.js` (`CONCURRENCY`) |
| Change the Gateway rule's naming/expression/action | `cf_gateway_rule_create.js`, `lib/api.js#createZeroTrustRule` |
| Change CI schedule/env wiring | `.github/workflows/sync.yml`, `package.json` scripts |
| Add/rename an npm script | `package.json` |
| Change list/rule ID validation | `lib/utils.js#isValidResourceId` |

## 6. Architecture Diagram

```
                 ┌─────────────────────┐
                 │  download_lists.js  │
                 │  (fetch source URLs)│
                 └─────────┬───────────┘
                           │ writes
                           ▼
           allowlist.txt        blocklist.txt
                           │
   ┌───────────────────────────────────────────┐
   │        npm run cloudflare-delete           │
   │  cf_gateway_rule_delete.js → cf_list_delete.js │
   │  (rule must go before the lists it refs)   │
   └───────────────────────────────────────────┘
                           │
   ┌───────────────────────────────────────────┐
   │        npm run cloudflare-create           │
   │  cf_list_create.js  →  cf_gateway_rule_create.js │
   │  (lists must exist before the rule refs them)   │
   └───────────────────────────────────────────┘
                           │
                           ▼
              Cloudflare Zero Trust Gateway
        (CFGSL List - Chunk N  +  CFGSL Filter Lists rule)

All five entry scripts sit on lib/:
  cf_list_create.js ─┐
  cf_list_delete.js ─┼──▶ lib/api.js ──▶ lib/helpers.js ──▶ Cloudflare API
  cf_gateway_rule_*  ─┘        │                │
                                ▼                ▼
                          lib/constants.js  lib/utils.js
  download_lists.js ──▶ lib/utils.js (downloadFiles) + lib/constants.js
```

GitHub Actions (`.github/workflows/sync.yml`) runs this whole chain daily
(21:00 UTC cron), on every push to `main`, and on manual dispatch.

## 7. Environment Variables / Bindings Table

No Cloudflare Workers bindings — this runs as a plain Node.js/GitHub Actions
job. Env vars (see `.env.example`), loaded via `dotenv` in `lib/constants.js`:

| Var | Required | Default | Purpose |
| --- | --- | --- | --- |
| `CLOUDFLARE_API_KEY` | Yes | — | Global API Key; sent as both `Authorization: Bearer` and `X-Auth-Key` |
| `CLOUDFLARE_ACCOUNT_ID` | Yes | — | Target Cloudflare account |
| `CLOUDFLARE_ACCOUNT_EMAIL` | Yes | — | Sent as `X-Auth-Email`, paired with the Global API Key |
| `CLOUDFLARE_LIST_ITEM_LIMIT` | No | `300000` | Max domains pushed (Zero Trust free-plan cap) |
| `DRY_RUN` | No | `0` | `1` = process lists without calling the Cloudflare API |
| `FAST_MODE` | No | `0` | `1` = bounded-concurrency batched create/delete instead of sequential |
| `CONCURRENCY` | No | `5` | Max parallel Cloudflare API requests when `FAST_MODE=1` |
| `ALLOWLIST_URLS` | No | recommended list | Newline-separated override source URLs |
| `BLOCKLIST_URLS` | No | recommended list | Newline-separated override source URLs |
| `PING_URL` | No | — | Curled by CI after a successful sync, for uptime monitoring |

## 8. Dependency Graph (what breaks what)

- `lib/constants.js` has no internal deps — everything else depends on it.
  Breaking an export here breaks every script and both other `lib/` files.
- `lib/utils.js` depends only on `lib/constants.js` (`REQUEST_TIMEOUT_MS`).
  Breaking `isValidDomain`/`extractDomain` breaks `cf_list_create.js`'s
  dedupe logic silently (bad domains slip through or good ones get dropped).
- `lib/helpers.js` depends on `lib/constants.js` and `lib/utils.js#sleep`.
  All five entry scripts transitively depend on `request()` here — a change
  to auth headers, retry, or pagination affects every Cloudflare API call.
- `lib/api.js` depends on `lib/constants.js`, `lib/helpers.js`,
  `lib/utils.js#runWithConcurrency`/`sleep`. Consumed by all four
  `cf_*.js` scripts. Renaming/removing an export here is a breaking change
  across the whole CLI surface.
- `download_lists.js` depends only on `lib/constants.js` and
  `lib/utils.js#downloadFiles` — independent of `lib/api.js`/`lib/helpers.js`.
- Script-level ordering dependency (not an import, but load-bearing):
  `cf_gateway_rule_create.js` calls `getManagedLists()` and assumes
  `cf_list_create.js` already ran; `cf_gateway_rule_delete.js` must run
  before `cf_list_delete.js` or the rule is left referencing deleted lists.
  This order is encoded in `package.json`'s `cloudflare-create`/
  `cloudflare-delete` scripts and must stay in sync with any script rename.

## 9. Known Issues Log

| Date | Issue | Root cause | Fix | File |
| --- | --- | --- | --- | --- |
| pre-6641435 | Only the first page of lists/rules was read back | List/rule GET calls didn't follow Cloudflare's `result_info.total_pages` | Added `requestGatewayAllPages`, used for accounts with 100+ chunked lists | `lib/helpers.js` |
| pre-6641435 | Downloaded list files could be truncated | `download_lists.js` returned before the write stream finished flushing to disk | Fully stream + `await` each download before processing starts | `lib/utils.js#downloadFiles` |
| pre-6641435 | `node-fetch` dependency | N/A (design choice) | Replaced with native Node `fetch`/streams (requires Node >= 20) | all `lib/*.js` |
| pre-004d301 | No bound on request duration | Missing timeout on fetch calls | `AbortSignal.timeout(REQUEST_TIMEOUT_MS)` on every API/download call | `lib/helpers.js`, `lib/utils.js` |
| pre-004d301 | Unvalidated IDs interpolated into wirefilter expression | List/rule IDs from API responses trusted as-is | `isValidResourceId` UUID check before interpolation | `lib/utils.js`, `cf_gateway_rule_create.js` |

No open/unresolved issues currently tracked. Add new rows here (with the
fixing commit or PR) whenever a bug is found and fixed.

## 10. Security-sensitive spots

- List/rule IDs returned by the Cloudflare API are validated as UUIDs
  (`isValidResourceId`) before being interpolated into the wirefilter
  expression string in `cf_gateway_rule_create.js` — don't remove this
  check when touching that path.
- All outbound requests (Cloudflare API calls and list downloads) use
  `AbortSignal.timeout(REQUEST_TIMEOUT_MS)` — keep new fetch calls bounded
  the same way.
- `CLOUDFLARE_API_KEY` is a Global API Key sent as both `Authorization:
  Bearer` and `X-Auth-Key`/`X-Auth-Email` — this is intentional
  compatibility with older Cloudflare accounts, not a bug.

## 11. Commands

```bash
cp .env.example .env    # fill in CLOUDFLARE_API_KEY / ACCOUNT_ID / ACCOUNT_EMAIL
npm install

npm run download             # fetch allowlist.txt + blocklist.txt from sources
npm run download:allowlist   # fetch only the allowlist
npm run download:blocklist   # fetch only the blocklist

npm run dry     # download + process lists WITHOUT calling the Cloudflare API
                # (sets DRY_RUN=1; prints dedupe/skip/list-count stats)

npm run start   # full production run: download -> cloudflare-delete -> cloudflare-create

npm run cloudflare-delete   # delete existing Gateway rule + all "CFGSL List" lists
npm run cloudflare-create   # create lists from blocklist.txt, then the Gateway rule
```

There's no per-script test runner; to exercise a single stage, run the
underlying `node <file>.js` directly (e.g. `node cf_list_create.js`) with a
`.env` in place — `DRY_RUN=1` avoids touching the live Cloudflare account.

## TWDxMCP

- **On start:** call `load_context(topic="CF-Gateway-SecurityList")` before
  responding to the first message.
- **After any meaningful checkpoint** — a bug fixed, a decision made, a
  file/dependency added or removed, an architecture change — call
  `session_learn`, then update only the CLAUDE.md sections that actually
  changed (typically section 6 Architecture Diagram, section 8 Dependency
  Graph, section 9 Known Issues Log, or section 2 File Index). Skip the
  call during routine back-and-forth that produced no new outcome.
- **On end:** call `session_learn` one final time, covering the whole
  session.

Follow this protocol every session in this repo without being asked again.
