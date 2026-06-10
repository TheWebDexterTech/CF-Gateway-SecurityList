# CF Gateway SecurityList

Sync DNS allow/block lists to **Cloudflare Zero Trust Gateway**, getting a
Pi-hole-like ad/malware/tracker blocking experience without running any
servers - and without spending Cloudflare Workers compute. The whole sync
job runs on free GitHub Actions minutes.

This project is based on
[`mrrfv/cloudflare-gateway-pihole-scripts`](https://github.com/mrrfv/cloudflare-gateway-pihole-scripts).

## Recent improvements

- **No `node-fetch`** - relies on Node's native `fetch`/streams (Node >= 20).
- **`dotenv` bumped to v17** - a single runtime dependency.
- **Fixed Cloudflare API pagination** - list/rule lookups now follow
  `result_info.total_pages`, so accounts with 100+ chunked lists (e.g. the
  300,000-domain free-plan limit / 1,000 per list = up to 300 lists) are
  fully read, deleted and referenced by the gateway rule. Previously only
  the first page was returned.
- **Retries with backoff** - `429` (rate limit) and `5xx` responses are
  retried automatically, honoring `Retry-After`.
- **Bounded concurrency in `FAST_MODE`** - instead of firing every list
  create/delete request at once, up to `CONCURRENCY` requests run in
  parallel (default 5), staying well under Cloudflare's 1,200
  requests/5 minutes API limit.
- **Fixed a silent download bug** - list downloads are now fully streamed
  to disk and awaited before processing starts, instead of returning before
  the write finished.
- **Dropped legacy filename fallbacks** (`whitelist.csv` / `input.csv`) for
  a smaller, single code path.

## About the individual scripts

- `download_lists.js` - downloads and merges allow/block list sources.
- `cf_list_create.js` - reads `allowlist.txt`/`blocklist.txt`, dedupes and
  normalizes domains, and creates Zero Trust lists in chunks of 1,000.
- `cf_list_delete.js` - deletes all lists previously created by this project.
- `cf_gateway_rule_create.js` - creates a Gateway DNS rule blocking every
  domain across all `CFGSL List - Chunk N` lists.
- `cf_gateway_rule_delete.js` - deletes the Gateway rule created above.

## Setup (GitHub Actions)

1. Add these **repository secrets** (Settings -> Secrets and variables ->
   Actions -> Secrets):
   - `CLOUDFLARE_API_KEY` - your Cloudflare Global API Key.
   - `CLOUDFLARE_ACCOUNT_ID` - your Cloudflare account ID.
   - `CLOUDFLARE_ACCOUNT_EMAIL` - the email address for the API key above.
2. Optionally add these **repository variables** (same page, "Variables" tab):
   - `CLOUDFLARE_LIST_ITEM_LIMIT` - max domains to push (default `300000`,
     i.e. the Zero Trust free plan limit).
   - `FAST_MODE` - set to `1` to create/delete lists with bounded
     concurrency instead of one at a time.
   - `CONCURRENCY` - max parallel Cloudflare API requests when `FAST_MODE=1`
     (default `5`).
   - `ALLOWLIST_URLS` / `BLOCKLIST_URLS` - your own list sources, one URL
     per line. The recommended lists are used if these are not set.
   - `PING_URL` - an HTTP(S) URL to `curl` after a successful sync, for
     uptime monitoring.
3. Enable GitHub Actions for the repository. The `Sync Cloudflare Gateway Lists`
   workflow runs daily at 21:00 UTC, on every push to `main`, and can be run
   on demand from the Actions tab.

## DNS setup for Cloudflare Gateway

1. Go to your Cloudflare Zero Trust dashboard, then **Gateway -> DNS Locations**.
2. Click on the default location, or create one.
3. Point your router/device at the provided DNS addresses, or install the
   Cloudflare WARP client and log in to Zero Trust.

## Local development

```bash
cp .env.example .env
# fill in your Cloudflare credentials
npm install
npm run download   # fetch allowlist.txt / blocklist.txt
npm run dry        # process the lists without calling the Cloudflare API
```

## Dry runs

Set `DRY_RUN=1` to see what `cf_list_create.js` would do (e.g. how many
lists would be created and how many duplicate/allowed domains were
filtered out) without calling the Cloudflare API.

## License

MIT License. See `LICENSE` for more information.
