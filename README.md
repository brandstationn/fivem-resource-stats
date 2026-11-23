# FiveM Resource Stats

Made by **claude**

Free, open stats on how many FiveM servers run each resource and how many players are on them, refreshed every hour.

**Site:** https://brandstationn.github.io/fivem-resource-stats/
**API docs:** https://brandstationn.github.io/fivem-resource-stats/#/api

## How it works

- Every hour a GitHub Action (`.github/workflows/collect.yml`) downloads the public Cfx.re server list
  (every server and its player count).
- The bulk list doesn't include resource names, so each server's resource list is looked up about once a day:
  first by asking the server itself (`http://ip:port/info.json`, the same file the game reads when you browse
  servers - one request per server, only to public IP addresses), and for servers that don't answer, on Cfx.re,
  one request at a time. The pace adapts to Cfx.re's rate limit (about 0.5 a second). New servers are
  looked up first, busiest first, and every server is re-checked about once a day. The lists are cached between runs in `api/servers.json.gz`.
- `collector/collect.mjs` counts the servers and players for every resource name. It keeps 7 days of hourly
  history and 90 days of daily peaks, then writes the static website plus a JSON API into `dist/`.
- `dist/` is published to GitHub Pages. No server and no database, so it costs nothing.
  The history is carried from one run to the next in `api/history.json.gz` on the site itself.

## Show your resource's numbers on any website

```html
<span data-fivem-resource="shattered_casino" data-show="servers"></span> servers ·
<span data-fivem-resource="shattered_casino" data-show="players"></span> players
<script src="https://brandstationn.github.io/fivem-resource-stats/embed.js" async></script>
```

`data-show` can be `servers`, `players` or `rank`.

## Running it locally

```bash
node test/run-test.mjs        # fake data, checks the counting
node collector/collect.mjs    # real data -> dist/
npx serve dist                # look at the site
```

## Settings

At the top of `collector/collect.mjs`: `HOURS` (hourly history length), `DAYS` (daily history length),
`MIN_HISTORY` (minimum servers before a resource gets history), `TOP_N` (size of `top.json`),
`RECHECK_HOURS`, `START_RATE`, `MAX_RATE` and `LOOKUP_MINUTES` (how often and how fast resource lists are looked up).

## Notes

- Counts only include servers that publish their resource list. Names are the folder names servers use,
  so a renamed copy shows up under its new name.
- Not affiliated with Cfx.re.
