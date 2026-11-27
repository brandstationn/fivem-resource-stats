// Data helpers: the site reads static JSON files written by collector/collect.mjs.

export type Pair = [servers: number, players: number]
export type Summary = {
  updatedAt: string
  servers: number
  players: number
  resources: number
  covered: number
  top: [name: string, servers: number, players: number][]
  hourly: { t: number[]; v: Pair[] }
  daily: { d: string[]; v: Pair[] }
}
export type Top = { top: Summary["top"] }
export type Shard = { r: Record<string, [servers: number, players: number, rank: number]> }
export type HistoryShard = { t: number[]; d: string[]; h: Record<string, number[]>; dd: Record<string, number[]> }
export type ServerShard = { r: Record<string, string[]>; srv: Record<string, [name: string, players: number, max: number]> }
export type Point = { x: number; servers: number; players: number }
/** api/servers.json: every server, busiest first. resources = -1 when its list is unknown. */
export type ServerIndex = { s: [id: string, name: string, players: number, max: number, resources: number][] }
/** api/sv/{hhh}.json: server details by ID (cfx.re join code). */
export type ServerDetailShard = { srv: Record<string, [name: string, players: number, max: number, resources: string[] | null]> }

/** Accepts a join code or a pasted cfx.re/join/… or servers.fivem.net/servers/detail/… link. */
export function parseJoinCode(s: string) {
  const m = s.trim().match(/(?:cfx\.re\/join\/|servers\/detail\/)([a-z0-9]{4,8})\b/i)
  return m ? m[1].toLowerCase() : null
}

export const fmt = (n: number) => Number(n).toLocaleString("en-US")
const trim = (x: number) => String(+x.toFixed(2))
export const compact = (n: number) => (n >= 1e6 ? trim(n / 1e6) + "M" : n >= 1e3 ? trim(n / 1e3) + "k" : trim(n))
export const pct = (part: number, whole: number, digits = 1) => (whole ? ((part / whole) * 100).toFixed(digits) : "0") + "%"

export const shardKey = (name: string) => (name.slice(0, 2).replace(/[^a-z0-9]/g, "_") + "__").slice(0, 2)
export function histKey(name: string) {
  let h = 0x811c9dc5
  for (const b of new TextEncoder().encode(name)) {
    h ^= b
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return (h & 0xfff).toString(16).padStart(3, "0")
}

export function ago(iso: string) {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  return m < 1 ? "just now" : m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`
}

/** Absolute URL of the site root (where embed.js and api/ live). */
export const siteBase = () => location.href.split("#")[0].replace(/index\.html$/, "").replace(/\?.*$/, "")

// Every file is fetched once per data version (summary.json changes every hour).
const cache = new Map<string, Promise<unknown>>()
let dataVersion = ""
export const setDataVersion = (v: string) => (dataVersion = v)

export function getJson<T>(path: string): Promise<T | null> {
  const v = path === "api/summary.json" ? String(Math.floor(Date.now() / 3e5)) : dataVersion
  const url = `${path}?v=${encodeURIComponent(v)}`
  if (!cache.has(url)) {
    cache.set(
      url,
      fetch(url)
        .then((r) => {
          if (!r.ok) throw new Error(String(r.status))
          return r.json()
        })
        .catch((e: Error) => {
          cache.delete(url)
          if (e.message === "404") return null
          throw e
        }),
    )
  }
  return cache.get(url) as Promise<T | null>
}

export const fromPairs = (times: (number | string)[], vals: Pair[], isDay = false): Point[] =>
  times.map((t, i) => ({ x: isDay ? Date.parse(t + "T12:00:00Z") : (t as number) * 1000, servers: vals[i][0], players: vals[i][1] }))
export const fromFlat = (times: (number | string)[], flat: number[], isDay = false): Point[] =>
  times.map((t, i) => ({ x: isDay ? Date.parse(t + "T12:00:00Z") : (t as number) * 1000, servers: flat[i * 2], players: flat[i * 2 + 1] }))

export const embedSnippet = (name: string) =>
  `<span data-fivem-resource="${name}" data-show="servers"></span> servers · <span data-fivem-resource="${name}" data-show="players"></span> players\n<script src="${siteBase()}embed.js" async></script>`
