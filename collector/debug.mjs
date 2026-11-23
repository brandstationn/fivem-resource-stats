// One-off diagnostics: which protobuf fields does the live stream contain?
const url = "https://frontend.cfx-services.net/api/servers/streamRedir/";
const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
const varint = (b, p) => { let r = 0, m = 1, x; do { x = b[p++]; r += (x & 127) * m; m *= 128; } while (x & 128); return [r, p]; };
function fields(b, s, e) { const out = []; let p = s; while (p < e) { let k; [k, p] = varint(b, p); const f = Math.floor(k / 8), w = k & 7;
  if (w === 0) { let v; [v, p] = varint(b, p); out.push([f, w, v]); } else if (w === 2) { let l; [l, p] = varint(b, p); out.push([f, w, [p, p + l]]); p += l; }
  else if (w === 1) p += 8; else if (w === 5) p += 4; else break; } return out; }
const stats = {}; let pos = 0, n = 0, sample = null;
while (pos + 4 <= buf.length && n < 3000) { const len = buf.readUInt32LE(pos); pos += 4;
  for (const [f, w, v] of fields(buf, pos, pos + len)) if (f === 2 && w === 2) {
    for (const [df, dw, dv] of fields(buf, v[0], v[1])) { const k = `${df}/${dw}`; stats[k] = (stats[k] || 0) + 1;
      if (dw === 2 && !sample?.[k]) { sample ??= {}; sample[k] = buf.toString("utf8", dv[0], Math.min(dv[1], dv[0] + 80)).replace(/[^\x20-\x7e]/g, "."); } } }
  else if (f === 1 && n < 3) console.log("endpoint", buf.toString("utf8", v[0], v[1]));
  pos += len; n++; }
console.log("ServerData field/wire counts over", n, "servers:", JSON.stringify(stats));
console.log("samples:", JSON.stringify(sample, null, 1));
const first = (() => { const len = buf.readUInt32LE(0); for (const [f, w, v] of fields(buf, 4, 4 + len)) if (f === 1) return buf.toString("utf8", v[0], v[1]); })();
const single = await fetch(`https://frontend.cfx-services.net/api/servers/single/${first}`, { headers: { "User-Agent": "Mozilla/5.0" } });
console.log("single:", single.status);
if (single.ok) { const j = await single.json(); console.log("single Data keys:", Object.keys(j.Data || {}).join(","), "resources:", (j.Data?.resources || []).length); }
