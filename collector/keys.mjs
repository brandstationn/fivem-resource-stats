// File-name keys used by the API (the site and embed.js use the same formulas).
export const shardKey = (name) => (name.slice(0, 2).replace(/[^a-z0-9]/g, "_") + "__").slice(0, 2);
// History is bucketed by hash (FNV-1a 32-bit, low 12 bits -> 3 hex chars, 4096 files) so no file gets big.
export function histKey(name) {
  let h = 0x811c9dc5;
  for (const b of Buffer.from(name, "utf8")) { h ^= b; h = Math.imul(h, 0x01000193) >>> 0; }
  return (h & 0xfff).toString(16).padStart(3, "0");
}
