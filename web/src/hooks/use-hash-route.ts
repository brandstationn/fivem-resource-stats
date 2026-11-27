import { useEffect, useState } from "react"

export type Route = { page: "home" } | { page: "api" } | { page: "resource"; name: string } | { page: "server"; id: string }

function parse(): Route {
  const h = location.hash.slice(1) || "/"
  if (h.startsWith("/r/")) return { page: "resource", name: decodeURIComponent(h.slice(3)).toLowerCase() }
  if (h.startsWith("/s/")) return { page: "server", id: decodeURIComponent(h.slice(3)) }
  if (h === "/api") return { page: "api" }
  return { page: "home" }
}

export const resourceHref = (name: string) => `#/r/${encodeURIComponent(name)}`
export const serverHref = (id: string) => `#/s/${encodeURIComponent(id)}`

/** Hash routes (#/, #/r/name, #/s/id, #/api) so links keep working on GitHub Pages. */
export function useHashRoute() {
  const [route, setRoute] = useState(parse)
  useEffect(() => {
    const on = () => {
      if (location.hash.startsWith("#/") || !location.hash) {
        setRoute(parse())
        window.scrollTo(0, 0)
      }
    }
    window.addEventListener("hashchange", on)
    return () => window.removeEventListener("hashchange", on)
  }, [])
  return route
}
