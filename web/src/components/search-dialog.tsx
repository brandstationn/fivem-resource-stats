import { useEffect, useState } from "react"
import { ArrowRightIcon, PackageIcon, ServerIcon } from "lucide-react"

import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { resourceHref, serverHref } from "@/hooks/use-hash-route"
import { fmt, getJson, parseJoinCode, shardKey, type ServerIndex, type Shard, type Summary, type Top } from "@/lib/data"

type Props = { open: boolean; onOpenChange: (open: boolean) => void; summary?: Summary }
type ServerHit = ServerIndex["s"][number]

/**
 * Ctrl/Cmd+K search over resources and servers.
 * Resources: prefix matches from the name's shard + substring matches in the top 5,000.
 * Servers: substring match on the name, or a join code / cfx.re link, in api/servers.json (loaded when the dialog opens).
 */
export function SearchDialog({ open, onOpenChange, summary }: Props) {
  const [q, setQ] = useState("")
  const [resources, setResources] = useState<[string, number][]>([])
  const [servers, setServers] = useState<ServerHit[]>([])

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const typing = /input|textarea|select/i.test((e.target as HTMLElement).tagName)
      if ((e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !typing)) {
        e.preventDefault()
        onOpenChange(true)
      }
    }
    document.addEventListener("keydown", down)
    return () => document.removeEventListener("keydown", down)
  }, [onOpenChange])

  useEffect(() => {
    if (open) getJson<ServerIndex>("api/servers.json").catch(() => null) // warm up for server search
    else setQ("")
  }, [open])

  const term = q.trim().toLowerCase()
  useEffect(() => {
    if (term.length < 2) {
      setResources([])
      setServers([])
      return
    }
    let live = true
    const t = setTimeout(async () => {
      const code = parseJoinCode(term)
      const [shard, top, index] = await Promise.all([
        code ? null : getJson<Shard>(`api/r/${shardKey(term)}.json`).catch(() => null),
        code ? null : getJson<Top>("api/top.json").catch(() => null),
        getJson<ServerIndex>("api/servers.json").catch(() => null),
      ])
      if (!live) return
      const map = new Map<string, number>()
      if (shard) for (const [n, v] of Object.entries(shard.r)) if (n.startsWith(term)) map.set(n, v[0])
      if (!code) for (const [n, s] of top?.top ?? summary?.top ?? []) if (n.includes(term)) map.set(n, s)
      setResources([...map].sort((a, b) => b[1] - a[1]).slice(0, code ? 0 : 8))

      const hits: ServerHit[] = []
      for (const s of index?.s ?? []) {
        // index is sorted busiest first, so the first matches are the most relevant
        if (code ? s[0] === code : s[0] === term || s[1].toLowerCase().includes(term)) hits.push(s)
        if (hits.length >= 8) break
      }
      setServers(hits)
    }, 120)
    return () => {
      live = false
      clearTimeout(t)
    }
  }, [term, summary])

  const go = (href: string) => {
    location.hash = href
    onOpenChange(false)
  }
  const resourceItem = ([n, s]: [string, number]) => (
    <CommandItem key={"r:" + n} value={"r:" + n} onSelect={() => go(resourceHref(n))}>
      <PackageIcon className="text-muted-foreground" />
      <span className="truncate font-mono text-[13px]">{n}</span>
      <span className="ml-auto shrink-0 text-xs text-muted-foreground tabular-nums">{fmt(s)} servers</span>
    </CommandItem>
  )

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Search"
      description="Find a FiveM resource or server by name"
      className="sm:max-w-xl"
    >
      <Command shouldFilter={false}>
        <CommandInput placeholder="Search resources or servers, e.g. ox_lib, roleplay…" value={q} onValueChange={setQ} />
        <CommandList className="max-h-[min(28rem,60vh)]">
          {term.length < 2 ? (
            <CommandGroup heading="Most used resources">{(summary?.top ?? []).slice(0, 6).map(([n, s]) => resourceItem([n, s]))}</CommandGroup>
          ) : (
            <>
              <CommandEmpty>Nothing found.</CommandEmpty>
              {resources.length > 0 && <CommandGroup heading="Resources">{resources.map(resourceItem)}</CommandGroup>}
              {servers.length > 0 && (
                <CommandGroup heading="Servers">
                  {servers.map(([id, name, players, max]) => (
                    <CommandItem key={"s:" + id} value={"s:" + id} onSelect={() => go(serverHref(id))}>
                      <ServerIcon className="text-muted-foreground" />
                      <span className="truncate">{name || "(no name)"}</span>
                      <span className="ml-auto shrink-0 text-xs text-muted-foreground tabular-nums">
                        {fmt(players)}
                        {max > 0 && ` / ${fmt(max)}`} players
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
              {!parseJoinCode(term) && !resources.some(([n]) => n === term) && (
                <CommandGroup heading="Exact resource name">
                  <CommandItem value={"open:" + term} onSelect={() => go(resourceHref(term))}>
                    <ArrowRightIcon className="text-muted-foreground" />
                    <span className="truncate">
                      Open <span className="font-mono">{term}</span>
                    </span>
                  </CommandItem>
                </CommandGroup>
              )}
            </>
          )}
        </CommandList>
      </Command>
    </CommandDialog>
  )
}
