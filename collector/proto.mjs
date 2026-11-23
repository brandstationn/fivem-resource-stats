// Minimal reader for the Cfx.re server-list stream (protobuf, no dependencies).
// Stream = repeated frames: uint32 little-endian length + `Server` message.
//   Server     { string EndPoint = 1; ServerData Data = 2; }
//   ServerData { int32 svMaxclients = 1; int32 clients = 2; string hostname = 4; repeated string resources = 8; ... }

function varint(buf, pos) {
  let result = 0, mul = 1, b;
  do { b = buf[pos++]; result += (b & 0x7f) * mul; mul *= 128; } while (b & 0x80);
  return [result, pos];
}

function skip(wire, buf, pos) {
  if (wire === 0) return varint(buf, pos)[1];
  if (wire === 1) return pos + 8;
  if (wire === 5) return pos + 4;
  if (wire === 2) { const [len, p] = varint(buf, pos); return p + len; }
  throw new Error(`Unsupported protobuf wire type ${wire}`);
}

function parseData(buf, pos, end, out) {
  while (pos < end) {
    let key; [key, pos] = varint(buf, pos);
    const field = Math.floor(key / 8), wire = key & 7;
    if (field === 2 && wire === 0) { [out.clients, pos] = varint(buf, pos); }
    else if (field === 8 && wire === 2) {
      let len; [len, pos] = varint(buf, pos);
      out.resources.push(buf.toString("utf8", pos, pos + len)); pos += len;
    } else pos = skip(wire, buf, pos);
  }
}

function parseServer(buf, pos, end) {
  const s = { endpoint: "", clients: 0, resources: [] };
  while (pos < end) {
    let key; [key, pos] = varint(buf, pos);
    const field = Math.floor(key / 8), wire = key & 7;
    if (wire === 2 && (field === 1 || field === 2)) {
      let len; [len, pos] = varint(buf, pos);
      if (field === 1) s.endpoint = buf.toString("utf8", pos, pos + len);
      else parseData(buf, pos, pos + len, s);
      pos += len;
    } else pos = skip(wire, buf, pos);
  }
  return s;
}

/** Calls onServer({endpoint, clients, resources}) for every server in the stream buffer. */
export function parseStream(buf, onServer) {
  let pos = 0, count = 0, bad = 0;
  while (pos + 4 <= buf.length) {
    const len = buf.readUInt32LE(pos); pos += 4;
    if (pos + len > buf.length) break;
    try { onServer(parseServer(buf, pos, pos + len)); count++; } catch { bad++; }
    pos += len;
  }
  return { count, bad };
}

// ---- encoder, used only by the tests to build a fake stream ----
const enc = {
  v(n) { const o = []; while (n > 127) { o.push((n & 127) | 128); n = Math.floor(n / 128); } o.push(n); return Buffer.from(o); },
  str(f, s) { const b = Buffer.from(s); return Buffer.concat([enc.v(f * 8 + 2), enc.v(b.length), b]); },
  int(f, n) { return Buffer.concat([enc.v(f * 8), enc.v(n)]); },
};
export function encodeServer(endpoint, clients, resources) {
  const data = Buffer.concat([enc.int(1, 128), enc.int(2, clients), enc.str(4, "Test server"), ...resources.map((r) => enc.str(8, r))]);
  const msg = Buffer.concat([enc.str(1, endpoint), enc.v(2 * 8 + 2), enc.v(data.length), data]);
  const head = Buffer.alloc(4); head.writeUInt32LE(msg.length);
  return Buffer.concat([head, msg]);
}
