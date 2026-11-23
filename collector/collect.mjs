// Hourly collector for FiveM resource stats.
//
// 1. Download the Cfx.re bulk server list (every server + its player count).
//    The bulk list no longer contains resource names, so:
// 2. Look up resource lists per server on Cfx.re, politely: new servers first,
//    then the ones checked longest ago, so every server is re-checked about once
//    a day. Results are cached between runs (api/servers.json.gz).
// 3. Count servers + players per resource, update history, write site + API to ./dist.
//
// Env:
//   SITE_URL     public URL of the live site (previous history + cache are read from it)
//   STREAM_FILE  tests: read the bulk list from a file; its embedded resource lists stand in for Cfx.re lookups
//   STATE_FILE / CACHE_FILE  tests: previous history / cache from local .json.gz files
//   NOW          tests: override the current time (ISO string)

import { readFile, writeFile, mkdir, cp, rm } from "node:fs/promises";
import { gzipSync, gunzipSync } from "node:zlib";
import { parseStream } from "./proto.mjs";
import { shardKey, histKey } from "./keys.mjs";

const HOURS = 168;            // hourly points kept (7 days)
const DAYS = 90;              // daily peak points kept
const MIN_HISTORY = 3;        // a resource gets history once it runs on this many servers
const TOP_N = 5000;           // size of api/top.json
const RECHECK_HOURS = 24;     // each server's resource list is re-checked about this often
const MAX_RATE = 5;           // max lookups per second to Cfx.re
const LOOKUP_MINUTES = +process.env.LOOKUP_MINUTES || 30; // stop looking up after this long; the rest continue next hour
const OUT = "dist";
const API = "https://frontend.cfx-services.net/api/servers";
const STREAM_URLS = [`${API}/streamRedir/`, "https://servers-frontend.fivem.net/api/servers/streamRedir/"];
const UA = "fivem-resource-stats (+https://github.com/brandstationn/fivem-resource-stats)";
const TEST = !!process.env.STREAM_FILE;

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const cleanNames = (list) => [...new Set(list.map((r) => String(r).trim().toLowerCase()).filter((n) => n && n.length <= 64))];

// ---------- 1. bulk list ----------
async function downloadStream() {
  if (TEST) return readFile(process.env.STREAM_FILE);
  let lastErr;
  for (const url of STREAM_URLS) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "*/*" } });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const buf = Buffer.from(await res.arrayBuffer());
        log(`downloaded ${(buf.length / 1e6).toFixed(1)} MB from ${url}`);
        return buf;
      } catch (e) {
        lastErr = new Error(`${url} attempt ${attempt}: ${e.message}`);
        console.warn(lastErr.message);
        await sleep(5000 * attempt);
      }
    }
  }
  throw lastErr;
}

function readServers(buf) {
  const servers = new Map(); // endpoint -> { clients, testResources }
  let players = 0;
  const { count, bad } = parseStream(buf, (s) => {
    if (!s.endpoint || servers.has(s.endpoint)) return;
    servers.set(s.endpoint, { clients: s.clients, testResources: s.resources });
    players += s.clients;
  });
  log(`bulk list: ${count} entries (${bad} unreadable), ${servers.size} unique servers, ${players} players`);
  if (servers.size < 1000 && !TEST) throw new Error(`Only ${servers.size} servers parsed - refusing to publish`);
  return { servers, players };
}

// ---------- previous state (history + cache) from the live site ----------
async function loadGz(file, envFile, what) {
  try {
    let gz;
    if (process.env[envFile]) gz = await readFile(process.env[envFile]);
    else if (process.env.SITE_URL && !TEST) {
      const res = await fetch(`${process.env.SITE_URL.replace(/\/$/, "")}/api/${file}?t=${Date.now()}`, { headers: { "User-Agent": UA } });
      if (res.status === 404) { log(`no previous ${what} (first run)`); return null; }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      gz = Buffer.from(await res.arrayBuffer());
    } else return null;
    return JSON.parse(gunzipSync(gz));
  } catch (e) {
    if (e.code === "ENOENT") return null;
    // Never wipe data because of a temporary error: fail the run, the old site stays up.
    throw new Error(`Could not load previous ${what}: ${e.message}`);
  }
}

// cache file format: { names: [resource names], s: { endpoint: [checkedAtSec, nameIndex, nameIndex, ...] } }
function unpackCache(c) {
  const m = new Map();
  if (c) for (const [ep, [at, ...idx]] of Object.entries(c.s)) m.set(ep, { at, res: idx.map((i) => c.names[i]) });
  return m;
}
function packCache(m) {
  const names = [], index = new Map(), s = {};
  for (const [ep, { at, res }] of m) s[ep] = [at, ...res.map((n) => { if (!index.has(n)) { index.set(n, names.length); names.push(n); } return index.get(n); })];
  return { names, s };
}

// ---------- 2. per-server resource lookups ----------
async function lookupOne(endpoint, server) {
  if (TEST) return { ok: true, res: cleanNames(server.testResources) };
  const r = await fetch(`${API}/single/${encodeURIComponent(endpoint)}`, { headers: { "User-Agent": UA } });
  if (r.status === 429) return { limited: true, wait: (+r.headers.get("retry-after") || 30) * 1000 };
  if (r.status === 404) return { gone: true };
  if (!r.ok) { await r.arrayBuffer().catch(() => {}); return { error: r.status }; }
  const j = await r.json();
  return { ok: true, res: cleanNames(j.Data?.resources || []) };
}

async function refreshCache(cache, servers, nowSec) {
  for (const ep of cache.keys()) if (!servers.has(ep)) cache.delete(ep); // server left the list
  const due = [...servers.keys()]
    .filter((ep) => !cache.has(ep) || nowSec - cache.get(ep).at >= RECHECK_HOURS * 3600 - 1800)
    .sort((a, b) => (cache.get(a)?.at ?? -1) - (cache.get(b)?.at ?? -1)); // never-checked first, then oldest
  const deadline = Date.now() + LOOKUP_MINUTES * 60e3;
  let i = 0, ok = 0, failed = 0, rate = MAX_RATE, pausedUntil = 0, limitedCount = 0;
  const started = Date.now();
  const worker = async () => {
    while (i < due.length && Date.now() < deadline && limitedCount < 20) {
      if (Date.now() < pausedUntil) { await sleep(pausedUntil - Date.now()); continue; }
      const ep = due[i++];
      const t0 = Date.now();
      try {
        const r = await lookupOne(ep, servers.get(ep));
        if (r.ok) { cache.set(ep, { at: nowSec, res: r.res }); ok++; }
        else if (r.limited) { // slow down and pause on rate limiting
          limitedCount++; rate = Math.max(1, rate / 2); pausedUntil = Date.now() + r.wait; i--;
          console.warn(`rate limited by Cfx.re, pausing ${r.wait / 1000}s, rate now ${rate}/s`);
        } else failed++;
      } catch { failed++; }
      if (!TEST) await sleep(Math.max(0, 1000 * WORKERS / rate - (Date.now() - t0)));
    }
  };
  const WORKERS = TEST ? 1 : 4;
  await Promise.all(Array.from({ length: WORKERS }, worker));
  log(`lookups: ${due.length} due, ${ok} updated, ${failed} failed, ${due.length - i} left for next run, ${((Date.now() - started) / 1000).toFixed(0)}s`);
}

// ---------- 3. aggregate ----------
function aggregate(servers, players, cache) {
  const byName = new Map(); // name -> [servers, players]
  let covered = 0;
  for (const [ep, { clients }] of servers) {
    const c = cache.get(ep);
    if (!c) continue;
    covered++;
    for (const n of c.res) {
      const e = byName.get(n);
      if (e) { e[0]++; e[1] += clients; } else byName.set(n, [1, clients]);
    }
  }
  log(`${covered}/${servers.size} servers with known resources, ${byName.size} different resources`);
  return { byName, servers: servers.size, players, covered };
}

function updateState(st, agg, nowSec) {
  st ??= { v: 1, hours: [], totals: [], res: {}, days: [], dtotals: [], dres: {} };
  const hour = Math.floor(nowSec / 3600) * 3600;
  const day = new Date(hour * 1000).toISOString().slice(0, 10);

  // --- hourly ---
  const H = st.hours.length;
  const sameHour = H && st.hours[H - 1] === hour;
  if (!sameHour) {
    st.hours.push(hour); st.totals.push([0, 0]);
    for (const a of Object.values(st.res)) a.push(0, 0);
  }
  for (const [n, [s]] of agg.byName) if (s >= MIN_HISTORY && !st.res[n]) st.res[n] = new Array(st.hours.length * 2).fill(0);
  const hi = st.hours.length - 1;
  st.totals[hi] = [agg.servers, agg.players];
  for (const [n, a] of Object.entries(st.res)) {
    const cur = agg.byName.get(n) || [0, 0];
    a[hi * 2] = cur[0]; a[hi * 2 + 1] = cur[1];
  }
  while (st.hours.length > HOURS) {
    st.hours.shift(); st.totals.shift();
    for (const a of Object.values(st.res)) a.splice(0, 2);
  }
  for (const [n, a] of Object.entries(st.res)) if (a.every((x) => x === 0)) delete st.res[n];

  // --- daily (peak of the day) ---
  if (st.days[st.days.length - 1] !== day) {
    st.days.push(day); st.dtotals.push([0, 0]);
    for (const a of Object.values(st.dres)) a.push(0, 0);
  }
  for (const n of Object.keys(st.res)) if (!st.dres[n]) st.dres[n] = new Array(st.days.length * 2).fill(0);
  const di = st.days.length - 1;
  st.dtotals[di] = [Math.max(st.dtotals[di][0], agg.servers), Math.max(st.dtotals[di][1], agg.players)];
  for (const [n, a] of Object.entries(st.dres)) {
    const cur = agg.byName.get(n) || [0, 0];
    a[di * 2] = Math.max(a[di * 2], cur[0]); a[di * 2 + 1] = Math.max(a[di * 2 + 1], cur[1]);
  }
  while (st.days.length > DAYS) {
    st.days.shift(); st.dtotals.shift();
    for (const a of Object.values(st.dres)) a.splice(0, 2);
  }
  for (const [n, a] of Object.entries(st.dres)) if (a.every((x) => x === 0)) delete st.dres[n];
  return st;
}

// ---------- 4. write the API ----------
async function writeJson(path, obj) { await writeFile(`${OUT}/${path}`, JSON.stringify(obj)); }

async function writeApi(agg, st, now) {
  const updatedAt = now.toISOString();
  const ranked = [...agg.byName].sort((a, b) => b[1][0] - a[1][0] || b[1][1] - a[1][1] || (a[0] < b[0] ? -1 : 1));
  const rank = new Map(ranked.map(([n], i) => [n, i + 1]));

  await mkdir(`${OUT}/api/r`, { recursive: true });
  await mkdir(`${OUT}/api/h`, { recursive: true });

  await writeJson("api/summary.json", {
    updatedAt, servers: agg.servers, players: agg.players, resources: agg.byName.size, covered: agg.covered,
    top: ranked.slice(0, 100).map(([n, [s, p]]) => [n, s, p]),
    hourly: { t: st.hours, v: st.totals },
    daily: { d: st.days, v: st.dtotals },
  });
  await writeJson("api/top.json", { updatedAt, top: ranked.slice(0, TOP_N).map(([n, [s, p]]) => [n, s, p]) });

  // current numbers for EVERY resource, sharded by the first 2 characters of the name
  const shards = new Map();
  for (const [n, [s, p]] of ranked) {
    const k = shardKey(n);
    if (!shards.has(k)) shards.set(k, {});
    shards.get(k)[n] = [s, p, rank.get(n)];
  }
  for (const [k, r] of shards) await writeJson(`api/r/${k}.json`, { updatedAt, r });

  // history, bucketed by hash
  const hshards = new Map();
  const hs = (k) => { if (!hshards.has(k)) hshards.set(k, { t: st.hours, d: st.days, h: {}, dd: {} }); return hshards.get(k); };
  for (const [n, a] of Object.entries(st.res)) hs(histKey(n)).h[n] = a;
  for (const [n, a] of Object.entries(st.dres)) hs(histKey(n)).dd[n] = a;
  for (const [k, h] of hshards) await writeJson(`api/h/${k}.json`, h);

  // bulk downloads (+ the history file the next run reads back)
  const all = {}; for (const [n, [s, p]] of ranked) all[n] = [s, p];
  await writeFile(`${OUT}/api/all.json.gz`, gzipSync(JSON.stringify({ updatedAt, r: all }), { level: 9 }));
  const stateGz = gzipSync(JSON.stringify(st), { level: 9 });
  await writeFile(`${OUT}/api/history.json.gz`, stateGz);
  log(`wrote ${shards.size} shards, ${hshards.size} history files, ${Object.keys(st.res).length} resources with history, history.json.gz ${(stateGz.length / 1e6).toFixed(2)} MB`);
}

// ---------- main ----------
const now = process.env.NOW ? new Date(process.env.NOW) : new Date();
const nowSec = Math.floor(now / 1000);
const [buf, prev, prevCache] = await Promise.all([
  downloadStream(),
  loadGz("history.json.gz", "STATE_FILE", "history"),
  loadGz("servers.json.gz", "CACHE_FILE", "server cache"),
]);
const { servers, players } = readServers(buf);
const cache = unpackCache(prevCache);
await refreshCache(cache, servers, nowSec);
const agg = aggregate(servers, players, cache);
const st = updateState(prev, agg, nowSec);
await rm(OUT, { recursive: true, force: true });
await cp("site", OUT, { recursive: true });
await writeFile(`${OUT}/.nojekyll`, "");
await writeApi(agg, st, now);
const cacheGz = gzipSync(JSON.stringify(packCache(cache)), { level: 9 });
await writeFile(`${OUT}/api/servers.json.gz`, cacheGz);
log(`servers.json.gz ${(cacheGz.length / 1e6).toFixed(2)} MB - done`);
