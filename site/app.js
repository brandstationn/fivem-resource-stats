"use strict";
// ---------- helpers ----------
const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmt = (n) => Number(n).toLocaleString("en-US");
const trim = (x) => String(+x.toFixed(2));
const compact = (n) => n >= 1e6 ? trim(n / 1e6) + "M" : n >= 1e3 ? trim(n / 1e3) + "k" : trim(n);
const shardKey = (name) => (name.slice(0, 2).replace(/[^a-z0-9]/g, "_") + "__").slice(0, 2);
function histKey(name) {
  let h = 0x811c9dc5;
  for (const b of new TextEncoder().encode(name)) { h ^= b; h = Math.imul(h, 0x01000193) >>> 0; }
  return (h & 0xfff).toString(16).padStart(3, "0");
}
const cache = new Map();
let dataVersion = "";
function getJson(path) {
  const v = path === "api/summary.json" ? Math.floor(Date.now() / 3e5) : dataVersion;
  path += `?v=${encodeURIComponent(v)}`;
  if (!cache.has(path)) cache.set(path, fetch(path).then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); }).catch((e) => { cache.delete(path); if (String(e.message) === "404") return null; throw e; }));
  return cache.get(path);
}
const ago = (iso) => { const m = Math.round((Date.now() - new Date(iso)) / 60000); return m < 1 ? "just now" : m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`; };
const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();

// ---------- line chart (single series, crosshair + tooltip) ----------
function niceMax(v) { if (v <= 4) return 4; const p = 10 ** Math.floor(Math.log10(v)); const m = v / p; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p; }
function lineChart(el, pts, { color, label, daily }) {
  el.classList.add("chart");
  const draw = () => {
    const W = el.clientWidth || 600, H = 200, L = 44, R = 8, T = 10, B = 24;
    if (pts.length < 2) { el.innerHTML = `<div class="empty"><b>${pts.length ? fmt(pts[0].y) : "-"}</b><span>The chart fills in as data comes in, one point per ${daily ? "day" : "hour"}.</span></div>`; return; }
    const xs = pts.map((p) => p.x), x0 = xs[0], x1 = xs[xs.length - 1] === x0 ? x0 + 1 : xs[xs.length - 1];
    const ymax = niceMax(Math.max(...pts.map((p) => p.y)) || 1);
    const X = (x) => L + ((x - x0) / (x1 - x0)) * (W - L - R), Y = (y) => T + (1 - y / ymax) * (H - T - B);
    const grid = [0, .25, .5, .75, 1].map((f) => `<line x1="${L}" x2="${W - R}" y1="${Y(ymax * f)}" y2="${Y(ymax * f)}" stroke="${css("--grid")}" stroke-width="1"/><text class="axis" x="${L - 6}" y="${Y(ymax * f) + 4}" text-anchor="end">${compact(ymax * f)}</text>`).join("");
    const nLab = Math.max(2, Math.min(6, Math.floor((W - L) / 110)));
    const xl = Array.from({ length: nLab }, (_, i) => { const x = x0 + (x1 - x0) * (i / (nLab - 1)); const d = new Date(x);
      const t = daily || x1 - x0 > 3 * 864e5 ? d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) : d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
      return `<text class="axis" x="${X(x)}" y="${H - 6}" text-anchor="${i === 0 ? "start" : i === nLab - 1 ? "end" : "middle"}">${t}</text>`; }).join("");
    const path = pts.map((p, i) => `${i ? "L" : "M"}${X(p.x).toFixed(1)},${Y(p.y).toFixed(1)}`).join("");
    const area = `${path}L${X(x1)},${Y(0)}L${X(x0)},${Y(0)}Z`;
    el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)} over time">${grid}${xl}
      <path d="${area}" fill="${color}" opacity=".12"/><path d="${path}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round"/>
      <line class="cross" y1="${T}" y2="${H - B}" stroke="${css("--muted")}" stroke-width="1" visibility="hidden"/>
      <circle class="dot" r="4.5" fill="${color}" stroke="${css("--surface")}" stroke-width="2" visibility="hidden"/>
      <rect x="${L}" y="0" width="${W - L - R}" height="${H}" fill="transparent"/></svg><div class="tip" hidden></div>`;
    const svg = $("svg", el), cross = $(".cross", el), dot = $(".dot", el), tip = $(".tip", el);
    svg.addEventListener("pointermove", (e) => {
      const r = svg.getBoundingClientRect(), mx = ((e.clientX - r.left) / r.width) * W;
      let best = 0; for (let i = 1; i < pts.length; i++) if (Math.abs(X(pts[i].x) - mx) < Math.abs(X(pts[best].x) - mx)) best = i;
      const p = pts[best], px = X(p.x), py = Y(p.y);
      cross.setAttribute("x1", px); cross.setAttribute("x2", px); dot.setAttribute("cx", px); dot.setAttribute("cy", py);
      cross.setAttribute("visibility", "visible"); dot.setAttribute("visibility", "visible");
      const d = new Date(p.x);
      tip.innerHTML = `${daily ? d.toLocaleDateString(undefined, { dateStyle: "medium" }) + " (peak)" : d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}<br>${esc(label)}: <b>${fmt(p.y)}</b>`;
      tip.hidden = false; tip.style.left = (px / W) * r.width + "px"; tip.style.top = (py / H) * r.height + "px";
    });
    svg.addEventListener("pointerleave", () => { cross.setAttribute("visibility", "hidden"); dot.setAttribute("visibility", "hidden"); tip.hidden = true; });
  };
  draw();
  new ResizeObserver(() => { if (el.isConnected) draw(); }).observe(el);
}

// Two charts (servers, players) with a 7-day / 90-day switch.
function chartPair(container, series) {
  container.innerHTML = `<div class="row"><h2>History</h2><div class="seg"><button data-r="h" class="on">7 days (hourly)</button><button data-r="d">90 days (daily peak)</button></div></div>
    <div class="charts"><div class="card"><h3>Servers</h3><div class="c1"></div></div><div class="card"><h3>Players</h3><div class="c2"></div></div></div>`;
  const render = (mode) => {
    const s = series[mode];
    lineChart($(".c1", container), s.map((p) => ({ x: p.x, y: p.s })), { color: css("--accent"), label: "Servers", daily: mode === "d" });
    lineChart($(".c2", container), s.map((p) => ({ x: p.x, y: p.p })), { color: css("--accent-2"), label: "Players", daily: mode === "d" });
  };
  container.querySelectorAll(".seg button").forEach((b) => b.onclick = () => {
    container.querySelectorAll(".seg button").forEach((x) => x.classList.toggle("on", x === b)); render(b.dataset.r);
  });
  render("h");
}
const fromPairs = (times, vals, isDay) => times.map((t, i) => ({ x: isDay ? Date.parse(t + "T12:00:00Z") : t * 1000, s: vals[i][0], p: vals[i][1] }));
const fromFlat = (times, flat, isDay) => times.map((t, i) => ({ x: isDay ? Date.parse(t + "T12:00:00Z") : t * 1000, s: flat[i * 2], p: flat[i * 2 + 1] }));

// ---------- views ----------
const view = $("#view");
let summary;

function tiles(items) { return `<div class="tiles">${items.map(([l, v]) => `<div class="tile"><div class="label">${l}</div><div class="value">${v}</div></div>`).join("")}</div>`; }
const resLink = (n) => `<a href="#/r/${encodeURIComponent(n)}">${esc(n)}</a>`;

async function home() {
  document.title = "resourcestats - FiveM servers & players per resource";
  const s = summary;
  view.innerHTML = `${tiles([["Servers online", fmt(s.servers)], ["Players online", fmt(s.players)], ["Different resources", fmt(s.resources)], ["Last update", ago(s.updatedAt)]])}
    ${s.covered < s.servers * 0.97 ? `<p class="note">Still checking servers: resource lists are known for ${fmt(s.covered)} of ${fmt(s.servers)} servers so far (${(s.covered / s.servers * 100).toFixed(s.covered / s.servers < 0.1 ? 1 : 0)}%). Servers are checked busiest first, so the biggest servers are already counted. The numbers will rise over the next day or so until every server has been checked.</p>` : ""}
    <div id="hist"></div><h2>Most used resources</h2><div id="tbl"></div>`;
  chartPair($("#hist"), { h: fromPairs(s.hourly.t, s.hourly.v), d: fromPairs(s.daily.d, s.daily.v, true) });
  let rows = s.top, page = 0; const per = 50;
  const renderTable = () => {
    const slice = rows.slice(page * per, page * per + per), pages = Math.ceil(rows.length / per);
    $("#tbl").innerHTML = `<table><thead><tr><th>#</th><th>Resource</th><th class="num">Servers</th><th class="num">Players</th><th class="num">Share of servers</th></tr></thead><tbody>
      ${slice.map(([n, sv, p], i) => `<tr><td class="rank">${page * per + i + 1}</td><td>${resLink(n)}</td><td class="num">${fmt(sv)}</td><td class="num">${fmt(p)}</td><td class="num">${(sv / s.servers * 100).toFixed(1)}%</td></tr>`).join("")}</tbody></table>
      <div class="pager"><button ${page ? "" : "disabled"} data-d="-1">← Prev</button><span class="muted">Page ${page + 1} of ${pages}</span><button ${page < pages - 1 ? "" : "disabled"} data-d="1">Next →</button></div>`;
    $("#tbl").querySelectorAll(".pager button").forEach((b) => b.onclick = async () => {
      if (rows.length <= s.top.length) { const t = await getJson("api/top.json"); if (t) rows = t.top; }
      page += +b.dataset.d; renderTable(); $("#tbl").scrollIntoView({ block: "start" });
    });
  };
  renderTable();
  getJson("api/top.json").then((t) => { if (t && view.contains($("#tbl"))) { rows = t.top; renderTable(); } });
}

async function resource(name) {
  name = name.toLowerCase();
  document.title = `${name} - resourcestats`;
  view.innerHTML = `<h1>${esc(name)}</h1><p class="muted">Loading…</p>`;
  const k = shardKey(name);
  const [r, h] = await Promise.all([getJson(`api/r/${k}.json`), getJson(`api/h/${histKey(name)}.json`)]);
  const serverList = getJson(`api/s/${histKey(name)}.json`).catch(() => null); // loads while the page renders
  const cur = r?.r[name];
  if (!cur) {
    view.innerHTML = `<h1>${esc(name)}</h1><p class="note">No server is running a resource with this exact name right now. Resource names are the folder names servers use, so check the spelling or try the search.</p>`;
    return;
  }
  const [sv, p, rank] = cur;
  const site = location.href.split("#")[0].replace(/index\.html$/, "");
  view.innerHTML = `<h1>${esc(name)}</h1>
    ${tiles([["Servers running it", fmt(sv)], ["Players on those servers", fmt(p)], ["Rank", "#" + fmt(rank)], ["Share of all servers", (sv / summary.servers * 100).toFixed(2) + "%"]])}
    <div id="hist"></div>
    <div id="srvlist"></div>
    <h2>Use these numbers on your site</h2>
    <p class="note">Paste this where the numbers should appear. It updates by itself:</p>
    <pre><code>${esc(`<span data-fivem-resource="${name}" data-show="servers"></span> servers · <span data-fivem-resource="${name}" data-show="players"></span> players\n<script src="${site}embed.js" async></script>`)}</code></pre>
    <p class="note">Or read the JSON yourself: <a href="api/r/${k}.json">api/r/${k}.json</a> (current) and <a href="api/h/${histKey(name)}.json">api/h/${histKey(name)}.json</a> (history) - see the <a href="#/api">API docs</a>.</p>`;
  const hh = h?.h[name], dd = h?.dd[name];
  if (hh) chartPair($("#hist"), { h: fromFlat(h.t, hh), d: dd ? fromFlat(h.d, dd, true) : [] });
  else $("#hist").innerHTML = `<p class="note">History is kept for resources running on 3 or more servers.</p>`;
  serverList.then((sl) => { if (sl && view.contains($("#srvlist"))) renderServers($("#srvlist"), name, sv, sl); });
}

function renderServers(el, name, total, sl) {
  const eps = sl.r[name] || [];
  if (!eps.length) return;
  const per = 25; let shown = per;
  const draw = () => {
    const rows = eps.slice(0, shown).map((ep, i) => {
      const [hn, pl, mx] = sl.srv[ep] || ["(unknown)", 0, 0];
      return `<tr><td class="rank">${i + 1}</td><td><a href="https://servers.fivem.net/servers/detail/${encodeURIComponent(ep)}" target="_blank" rel="noopener nofollow">${esc(hn || "(no name)")}</a></td><td class="num">${fmt(pl)}${mx ? ` <span class="muted">/ ${fmt(mx)}</span>` : ""}</td></tr>`;
    }).join("");
    el.innerHTML = `<div class="row"><h2>Servers using ${esc(name)}</h2><span class="muted">${fmt(total)} server${total === 1 ? "" : "s"}</span></div>
      <table><thead><tr><th>#</th><th>Server</th><th class="num">Players</th></tr></thead><tbody>${rows}</tbody></table>
      <div class="pager">${shown < eps.length ? `<button data-more>Show more</button>` : ""}
      ${total > eps.length ? `<span class="muted">Showing the ${fmt(eps.length)} busiest of ${fmt(total)} servers.</span>` : ""}</div>`;
    const more = el.querySelector("[data-more]");
    if (more) more.onclick = () => { shown += 25; draw(); };
  };
  draw();
}

function apiDocs() {
  document.title = "API - resourcestats";
  const base = location.href.split("#")[0].replace(/index\.html$/, "");
  view.innerHTML = `<h1>Free JSON API</h1>
  <p class="note">Free for anyone, with no key or sign-up. The files are static JSON on a CDN, so you can call them straight from a browser (CORS is open). The data refreshes every hour, a few minutes past the hour, so there's no point fetching more often than that.</p>
  <h2>Endpoints</h2>
  <table><thead><tr><th>URL</th><th>What it contains</th></tr></thead><tbody>
  <tr><td><code>api/summary.json</code></td><td>Totals (servers, players, number of resources), top 100 resources, global history.</td></tr>
  <tr><td><code>api/top.json</code></td><td>Top 5,000 resources: <code>[name, servers, players]</code>, sorted by servers.</td></tr>
  <tr><td><code>api/r/{xx}.json</code></td><td>Current numbers for <b>every</b> resource whose name starts with <code>xx</code>: <code>{ r: { name: [servers, players, rank] } }</code></td></tr>
  <tr><td><code>api/h/{hhh}.json</code></td><td>History (resources on 3+ servers): <code>t</code> = hourly unix times, <code>h[name]</code> = flat <code>[servers, players, servers, players, …]</code> per hour (7 days); <code>d</code> = dates, <code>dd[name]</code> = same format, daily peak (90 days).</td></tr>
  <tr><td><code>api/s/{hhh}.json</code></td><td>Servers running each resource (up to 100, busiest first): <code>r[name]</code> = list of server IDs, <code>srv[id]</code> = <code>[name, players, maxPlayers]</code>. The ID is the cfx.re join code (<code>servers.fivem.net/servers/detail/{id}</code>).</td></tr>
  <tr><td><code>api/all.json.gz</code></td><td>Everything current in one gzip file.</td></tr>
  <tr><td><code>api/history.json.gz</code></td><td>The full history database in one gzip file.</td></tr>
  </tbody></table>
  <p class="note"><code>{xx}</code> = the first 2 characters of the resource name in lowercase, with anything other than a-z / 0-9 replaced by <code>_</code>. Names shorter than 2 characters are padded with <code>_</code>. Example: <code>ox_lib</code> → <code>ox</code>, <code>[core]</code> → <code>_c</code>.<br>
  <code>{hhh}</code> = FNV-1a 32-bit hash of the UTF-8 name, <code>&amp; 0xfff</code>, as 3 lowercase hex digits (see <code>histKey</code> in the example).</p>
  <h2>Example</h2>
  <pre><code>${esc(`const name = "ox_lib";
const key = (name.slice(0, 2).replace(/[^a-z0-9]/g, "_") + "__").slice(0, 2);
const { r } = await (await fetch("${base}api/r/" + key + ".json")).json();
const [servers, players, rank] = r[name];

function histKey(name) {
  let h = 0x811c9dc5;
  for (const b of new TextEncoder().encode(name)) { h ^= b; h = Math.imul(h, 0x01000193) >>> 0; }
  return (h & 0xfff).toString(16).padStart(3, "0");
}
const hist = await (await fetch("${base}api/h/" + histKey(name) + ".json")).json();
const hourly = hist.t.map((t, i) => ({ time: t, servers: hist.h[name][i * 2], players: hist.h[name][i * 2 + 1] }));`)}</code></pre>
  <h2>Embed widget</h2>
  <pre><code>${esc(`<span data-fivem-resource="ox_lib" data-show="servers"></span>
<span data-fivem-resource="ox_lib" data-show="players"></span>
<script src="${base}embed.js" async></script>`)}</code></pre>
  <p class="note">How it's counted: each server is counted once per resource, even if the name appears twice. Names are case-insensitive. "Players" is everyone online on servers running that resource. Servers that hide their resource list can't be counted.</p>`;
}

async function route() {
  $("#suggest").hidden = true;
  const h = location.hash.slice(1) || "/";
  try {
    if (h.startsWith("/r/")) await resource(decodeURIComponent(h.slice(3)));
    else if (h === "/api") apiDocs();
    else await home();
  } catch (e) { view.innerHTML = `<p class="note">Couldn't load data (${esc(e.message)}). Try again in a moment.</p>`; }
  window.scrollTo(0, 0);
}

// ---------- search ----------
const q = $("#q"), sug = $("#suggest");
let timer, active = -1, results = [];
async function search(term) {
  term = term.trim().toLowerCase();
  if (term.length < 2) { sug.hidden = true; return; }
  const map = new Map();
  const shard = await getJson(`api/r/${shardKey(term)}.json`).catch(() => null);
  if (shard) for (const [n, v] of Object.entries(shard.r)) if (n.startsWith(term)) map.set(n, v[0]);
  const top = (await getJson("api/top.json").catch(() => null))?.top || summary.top;
  for (const [n, s] of top) if (n.includes(term)) map.set(n, s);
  if (q.value.trim().toLowerCase() !== term) return;
  results = [...map].sort((a, b) => b[1] - a[1]).slice(0, 15);
  active = -1;
  sug.innerHTML = results.length ? results.map(([n, s]) => `<li><a href="#/r/${encodeURIComponent(n)}"><span>${esc(n)}</span><span class="n">${fmt(s)} servers</span></a></li>`).join("")
    : `<li><a href="#/r/${encodeURIComponent(term)}"><span class="muted">No matches - open “${esc(term)}” anyway</span></a></li>`;
  sug.hidden = false;
}
q.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(() => search(q.value), 120); });
q.addEventListener("keydown", (e) => {
  const links = sug.querySelectorAll("a");
  if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); active = (active + (e.key === "ArrowDown" ? 1 : -1) + links.length) % links.length; links.forEach((a, i) => a.classList.toggle("active", i === active)); }
  if (e.key === "Enter") { const t = links[active] || links[0]; location.hash = t ? t.getAttribute("href") : `#/r/${encodeURIComponent(q.value.trim().toLowerCase())}`; q.value = ""; sug.hidden = true; q.blur(); }
  if (e.key === "Escape") sug.hidden = true;
});
document.addEventListener("click", (e) => { if (!e.target.closest(".searchbar")) sug.hidden = true; });
sug.addEventListener("click", () => { sug.hidden = true; q.value = ""; });

// ---------- start ----------
(async () => {
  try { summary = await getJson("api/summary.json"); }
  catch { view.innerHTML = `<p class="note">The first data collection hasn't finished yet. Check back in a few minutes.</p>`; return; }
  dataVersion = summary.updatedAt;
  $("#updated").textContent = `Last update: ${new Date(summary.updatedAt).toLocaleString()}.`;
  window.addEventListener("hashchange", route);
  route();
})();
