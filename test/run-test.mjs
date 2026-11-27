// Builds fake server lists and runs the collector over several "hours".
import { writeFileSync, readFileSync, copyFileSync } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createServer } from "node:http";
import { gunzipSync } from "node:zlib";
import { encodeServer } from "../collector/proto.mjs";
import { histKey } from "../collector/keys.mjs";

const common = ["mapmanager", "chat", "spawnmanager", "oxmysql", "ox_lib", "es_extended", "qb-core"];
// a fake game server answering info.json directly; requests to it are counted
let directHits = 0;
const srv = createServer((req, res) => { directHits++; res.setHeader("content-type", "application/json"); res.end(JSON.stringify({ resources: ["direct_only", "Chat"] })); });
await new Promise((r) => srv.listen(0, "127.0.0.1", r));
const PORT = srv.address().port;
function fakeStream(seed) {
  const frames = [];
  for (let i = 0; i < 5; i++) frames.push(encodeServer("direct" + i, 10, ["cfx_only"], [`127.0.0.1:${PORT}`]));
  frames.push(encodeServer("private1", 10, ["cfx_only"], ["10.0.0.5:30120"]));
  frames.push(encodeServer("private2", 10, ["cfx_only"], ["169.254.169.254:80"]));
  for (let i = 0; i < 3000; i++) {
    const res = common.filter((_, j) => (i + j + seed) % (j + 2) === 0);
    if (i % 10 === 0) res.push("casino", "Casino");          // duplicate + case test
    if (i % 997 === 0) res.push("rare_script_" + i);
    frames.push(encodeServer("srv" + (i % 2990), (i * 7 + seed) % 64, res)); // 10 duplicate endpoints
  }
  return Buffer.concat(frames);
}
const times = ["2026-11-23T22:05:00Z", "2026-11-23T22:40:00Z", "2026-11-23T23:05:00Z", "2026-11-24T00:05:00Z"];
for (const [k, t] of times.entries()) {
  writeFileSync("/tmp/stream.bin", fakeStream(k));
  const env = { ...process.env, STREAM_FILE: "/tmp/stream.bin", NOW: t };
  if (k) { env.STATE_FILE = "/tmp/state.json.gz"; env.CACHE_FILE = "/tmp/cache.json.gz"; }
  const { stdout } = await promisify(execFile)("node", ["collector/collect.mjs"], { env });
  process.stdout.write(stdout);
  copyFileSync("dist/api/history.json.gz", "/tmp/state.json.gz");
  copyFileSync("dist/api/servers.json.gz", "/tmp/cache.json.gz");
}
srv.close();
const st = JSON.parse(gunzipSync(readFileSync("/tmp/state.json.gz")));
const sum = JSON.parse(readFileSync("dist/api/summary.json"));
const shard = JSON.parse(readFileSync("dist/api/r/ca.json"));
const h = JSON.parse(readFileSync("dist/api/h/" + histKey("casino") + ".json"));
const assert = (c, m) => { if (!c) { console.error("FAIL:", m); process.exit(1); } console.log("ok:", m); };
assert(st.hours.length === 3, "3 distinct hours (22:05 and 22:40 merged)");
assert(st.days.length === 2, "2 days");
assert(sum.servers === 2997, "duplicate endpoints removed");
assert(shard.r.casino[0] === 299, "casino counted once per server, case-insensitive");
assert(h.h.casino.length === 6, "casino has 3 hourly points");
assert(!("rare_script_997" in st.res), "1-server resources get no history");
assert(JSON.parse(readFileSync("dist/api/r/ra.json")).r.rare_script_997[0] === 1, "but still appear in current data");
assert(sum.top[0][1] >= sum.top[1][1], "top sorted");
assert(sum.covered === 2997, "every server has a known resource list");
assert(JSON.parse(readFileSync("dist/api/r/di.json")).r.direct_only[0] === 5, "public servers answered directly (info.json)");
assert(directHits === 5, "each direct server asked once, private addresses never contacted");
assert(JSON.parse(readFileSync("dist/api/r/cf.json")).r.cfx_only[0] === 2, "private-address servers fell back to Cfx.re");
const cache = JSON.parse(gunzipSync(readFileSync("/tmp/cache.json.gz")));
const sl = JSON.parse(readFileSync("dist/api/s/" + histKey("casino") + ".json"));
assert(sl.r.casino.length === 100 && sl.srv[sl.r.casino[0]][0] === "Test server", "server list capped at 100, with names");
assert(sl.srv[sl.r.casino[0]][1] >= sl.srv[sl.r.casino[99]][1], "server list sorted busiest first");
assert(Object.keys(cache.s).length === 2997 && cache.names.length < 20, "cache stores each name once");
const idx = JSON.parse(readFileSync("dist/api/servers.json")).s;
assert(idx.length === 2997 && idx[0][2] >= idx[idx.length - 1][2], "server index lists every server, busiest first");
const [ep0, , , , n0] = idx.find((s) => s[0] === "srv10");
const sv = JSON.parse(readFileSync("dist/api/sv/" + histKey(ep0) + ".json")).srv[ep0];
assert(sv[3].includes("casino") && sv[3].length === n0, "server details include its resource list");
