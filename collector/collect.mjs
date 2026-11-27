// Hourly collector for FiveM resource stats.
//
// 1. Download the Cfx.re bulk server list (every server + its player count).
//    The bulk list no longer contains resource names, so:
// 2. Look up each server's resource list, about once a day per server:
//    a) ask the server itself (http://ip:port/info.json, what the game client reads) - fast, spread over all servers;
//    b) servers that don't answer directly are looked up on Cfx.re, slowly, within its rate limit.
//    Results are cached between runs (api/servers.json.gz).
// 3. Count servers + players per resource, update history, write site + API to ./dist.
//
// Env:
//   SITE_URL     public URL of the live site (previous history + cache are read from it)
//   STREAM_FILE  tests: read the bulk list from a file; its embedded resource lists stand in for Cfx.re lookups
//   STATE_FILE / CACHE_FILE  tests: previous history / cache from local .json.gz files
//   NOW          tests: override the current time (ISO string)

import { readFile, writeFile, mkdir, cp, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { isIP } from "node:net";
import { gzipSync, gunzipSync } from "node:zlib";
import { parseStream } from "./proto.mjs";
import { shardKey, histKey } from "./keys.mjs";

const HOURS = 168;            // hourly points kept (7 days)
const DAYS = 90;              // daily peak points kept
const MIN_HISTORY = 3;        // a resource gets history once it runs on this many servers
const TOP_N = 5000;           // size of api/top.json
const RECHECK_HOURS = 24;     // each server's resource list is re-checked about this often
const START_RATE = 0.5;       // lookups per second to Cfx.re; adapts: slower on rate limits, a bit faster while all is fine
const MAX_RATE = 1;
const LOOKUP_MINUTES = +process.env.LOOKUP_MINUTES || 50; // total lookup time per run; the rest continue next hour
const DIRECT_CONCURRENCY = 150; // parallel direct requests (each to a different server IP)
const DIRECT_TIMEOUT_MS = 4000;
const DIRECT_MINUTES = 15;    // time budget for direct requests per run
const SERVERS_PER_RESOURCE = 100; // servers listed on a resource page (busiest first)
const OUT = "dist";
const SITE = "web/dist";      // the website, built beforehand from web/ (cd web && npm ci && npm run build)
const API = "https://frontend.cfx-services.net/api/servers";
const STREAM_URLS = [`${API}/streamRedir/`, "https://servers-frontend.fivem.net/api/servers/streamRedir/"];
const UA = "fivem-resource-stats (+https://github.com/brandstationn/fivem-resource-stats)";
const TEST = !!process.env.STREAM_FILE;

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// FiveM hostnames contain colour codes (^1, ~r~) and padding; keep plain text, max 80 characters
const cleanHostname = (h) => String(h || "").replace(/\^\d/g, "").replace(/~[a-zA-Z]~/g, "").replace(/[\u0000-\u001f]/g, "").replace(/\s+/g, " ").trim().slice(0, 80);
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
    servers.set(s.endpoint, { clients: s.clients, max: s.max, name: cleanHostname(s.hostname), testResources: s.resources, connect: s.connect });
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
// nd = { endpoint: time a direct request last failed } - those go straight to Cfx.re for a while
function unpackCache(c) {
  const m = new Map();
  if (c) for (const [ep, [at, ...idx]] of Object.entries(c.s)) m.set(ep, { at, res: idx.map((i) => c.names[i]) });
  return { m, nd: new Map(Object.entries(c?.nd || {})) };
}
function packCache({ m, nd }) {
  const names = [], index = new Map(), s = {};
  for (const [ep, { at, res }] of m) s[ep] = [at, ...res.map((n) => { if (!index.has(n)) { index.set(n, names.length); names.push(n); } return index.get(n); })];
  return { names, s, nd: Object.fromEntries(nd) };
}

// ---------- direct requests to the servers themselves ----------
// Only literal, public IPv4 addresses are contacted: server owners choose these
// addresses, so private/internal ranges are refused (no requests into the runner's network).
function publicIPv4(host) {
  if (isIP(host) !== 4) return false;
  const [a, b] = host.split(".").map(Number);
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;   // carrier NAT
  if (a === 169 && b === 254) return false;             // link-local / cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 198 && (b === 18 || b === 19)) return false;
  return true;
}
function directTarget(server) {
  for (const c of server.connect || []) {
    const m = /^(\d{1,3}(?:\.\d{1,3}){3}):(\d{1,5})$/.exec(c.trim());
    if (m && (publicIPv4(m[1]) || (TEST && m[1] === "127.0.0.1")) && +m[2] > 0 && +m[2] < 65536) return { ip: m[1], url: `http://${m[1]}:${m[2]}/info.json` };
  }
  return null;
}
async function readLimited(res, max) {
  const reader = res.body.getReader(); const chunks = []; let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > max) { await reader.cancel(); throw new Error("too large"); }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}
async function directOne(url) {
  const res = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(DIRECT_TIMEOUT_MS), headers: { "User-Agent": UA } });
  if (res.status !== 200) { await res.body?.cancel(); return null; }
  const j = JSON.parse(await readLimited(res, 2_000_000));
  if (!Array.isArray(j?.resources)) return null;
  return cleanNames(j.resources.filter((r) => typeof r === "string"));
}

async function directPhase(due, servers, cache, nowSec, runDeadline) {
  // group by IP so each machine only ever gets one request at a time
  const byIp = new Map();
  for (const ep of due) {
    if (nowSec - (cache.nd.get(ep) ?? -1e12) < RECHECK_HOURS * 3600 * 3) continue; // failed recently: Cfx.re handles it
    const t = directTarget(servers.get(ep));
    if (!t) continue;
    if (!byIp.has(t.ip)) byIp.set(t.ip, []);
    byIp.get(t.ip).push([ep, t.url]);
  }
  const groups = [...byIp.values()], deadline = Math.min(Date.now() + DIRECT_MINUTES * 60e3, runDeadline), started = Date.now();
  let g = 0, ok = 0, failed = 0, tried = 0;
  await Promise.all(Array.from({ length: DIRECT_CONCURRENCY }, async () => {
    while (g < groups.length && Date.now() < deadline) {
      for (const [ep, url] of groups[g++]) {
        if (Date.now() >= deadline) break;
        tried++;
        let res = null;
        try { res = await directOne(url); } catch {}
        if (res) { cache.m.set(ep, { at: nowSec, res }); cache.nd.delete(ep); ok++; }
        else { cache.nd.set(ep, nowSec); failed++; }
      }
    }
  }));
  log(`direct: ${tried} tried on ${groups.length} IPs, ${ok} answered, ${failed} didn't, ${((Date.now() - started) / 1000).toFixed(0)}s`);
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
  const runDeadline = Date.now() + LOOKUP_MINUTES * 60e3; // total lookup time (direct + Cfx.re)
  for (const ep of cache.m.keys()) if (!servers.has(ep)) cache.m.delete(ep); // server left the list
  for (const ep of cache.nd.keys()) if (!servers.has(ep)) cache.nd.delete(ep);
  const isDue = (ep) => !cache.m.has(ep) || nowSec - cache.m.get(ep).at >= RECHECK_HOURS * 3600 - 1800;
  // Never-checked servers first (busiest first), then the ones checked longest ago.
  const order = (a, b) => (cache.m.get(a)?.at ?? -1) - (cache.m.get(b)?.at ?? -1) || servers.get(b).clients - servers.get(a).clients;
  await directPhase([...servers.keys()].filter(isDue).sort(order), servers, cache, nowSec, runDeadline);
  const due = [...servers.keys()].filter(isDue).sort(order);
  const deadline = runDeadline, started = Date.now();
  let i = 0, ok = 0, failed = 0, limited = 0, rate = START_RATE, streak = 0;
  // One request at a time. On a 429: wait as told and slow down. After 50 clean lookups: speed up a little.
  while (i < due.length && Date.now() < deadline) {
    const ep = due[i], t0 = Date.now();
    let r;
    try { r = await lookupOne(ep, servers.get(ep)); } catch { r = { error: "network" }; }
    if (r.limited) {
      limited++; streak = 0; rate = Math.max(0.1, rate * 0.7);
      if (limited <= 3 || limited % 20 === 0) console.warn(`rate limited (${limited}x), waiting ${r.wait / 1000}s, rate now ${rate.toFixed(2)}/s`);
      await sleep(r.wait);
      continue; // retry the same server
    }
    i++;
    if (r.ok) { cache.m.set(ep, { at: nowSec, res: r.res }); ok++; if (++streak % 50 === 0) rate = Math.min(MAX_RATE, rate * 1.1); }
    else failed++;
    if (!TEST) await sleep(Math.max(0, 1000 / rate - (Date.now() - t0)));
  }
  const secs = (Date.now() - started) / 1000;
  log(`cfx.re lookups: ${due.length} due, ${ok} updated, ${failed} failed, ${limited} rate-limited, ${due.length - i} left for next run, ` +
      `${secs.toFixed(0)}s (${(ok / Math.max(secs, 1)).toFixed(2)}/s), final rate ${rate.toFixed(2)}/s`);
}

// ---------- 3. aggregate ----------
function aggregate(servers, players, cache) {
  const byName = new Map(); // name -> [servers, players, [endpoints]]
  const serverRes = new Map(); // endpoint -> resource names (servers with a known list only)
  let covered = 0;
  for (const [ep, { clients }] of servers) {
    const c = cache.m.get(ep);
    if (!c) continue;
    covered++;
    serverRes.set(ep, c.res);
    for (const n of c.res) {
      const e = byName.get(n);
      if (e) { e[0]++; e[1] += clients; e[2].push(ep); } else byName.set(n, [1, clients, [ep]]);
    }
  }
  log(`${covered}/${servers.size} servers with known resources, ${byName.size} different resources`);
  return { byName, servers: servers.size, players, covered, serverInfo: servers, serverRes };
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
  // which servers run each resource (busiest first), bucketed like history; server details stored once per file
  const sshards = new Map();
  for (const [n, [, , eps]] of agg.byName) {
    const k = histKey(n);
    if (!sshards.has(k)) sshards.set(k, { srv: {}, r: {} });
    const b = sshards.get(k);
    const top = eps.length > SERVERS_PER_RESOURCE
      ? [...eps].sort((a, b2) => agg.serverInfo.get(b2).clients - agg.serverInfo.get(a).clients).slice(0, SERVERS_PER_RESOURCE)
      : [...eps].sort((a, b2) => agg.serverInfo.get(b2).clients - agg.serverInfo.get(a).clients);
    b.r[n] = top;
    for (const ep of top) if (!b.srv[ep]) { const i = agg.serverInfo.get(ep); b.srv[ep] = [i.name, i.clients, i.max]; }
  }
  await mkdir(`${OUT}/api/s`, { recursive: true });
  let sBytes = 0;
  for (const [k, b] of sshards) { const j = JSON.stringify({ updatedAt, ...b }); sBytes += j.length; await writeFile(`${OUT}/api/s/${k}.json`, j); }
  log(`server lists: ${sshards.size} files, ${(sBytes / 1e6).toFixed(1)} MB total`);

  // every server (for server search), busiest first: [id, name, players, maxPlayers, resources (-1 = unknown)]
  const byPlayers = [...agg.serverInfo].sort((a, b) => b[1].clients - a[1].clients);
  await writeJson("api/servers.json", {
    updatedAt,
    s: byPlayers.map(([ep, i]) => [ep, i.name, i.clients, i.max, agg.serverRes.get(ep)?.length ?? -1]),
  });
  // each server's details + resource list, bucketed by hash of the server ID
  const vshards = new Map();
  for (const [ep, i] of byPlayers) {
    const k = histKey(ep);
    if (!vshards.has(k)) vshards.set(k, {});
    vshards.get(k)[ep] = [i.name, i.clients, i.max, agg.serverRes.get(ep) ?? null];
  }
  await mkdir(`${OUT}/api/sv`, { recursive: true });
  let vBytes = 0;
  for (const [k, srv] of vshards) { const j = JSON.stringify({ updatedAt, srv }); vBytes += j.length; await writeFile(`${OUT}/api/sv/${k}.json`, j); }
  log(`server details: ${vshards.size} files, ${(vBytes / 1e6).toFixed(1)} MB total`);
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
if (existsSync(SITE)) await cp(SITE, OUT, { recursive: true }); // asset names are content-hashed by Vite
else if (TEST) await mkdir(OUT, { recursive: true });
else throw new Error(`${SITE} not found: build the website first (cd web && npm ci && npm run build)`);
await writeFile(`${OUT}/.nojekyll`, "");
await writeApi(agg, st, now);
const cacheGz = gzipSync(JSON.stringify(packCache(cache)), { level: 9 });
await writeFile(`${OUT}/api/servers.json.gz`, cacheGz);
log(`servers.json.gz ${(cacheGz.length / 1e6).toFixed(2)} MB - done`);
