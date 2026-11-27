import { useEffect, useMemo, useState } from "react"
import { ArrowLeftIcon, ExternalLinkIcon, GaugeIcon, PackageIcon, PlayIcon, SearchIcon, SearchXIcon, UsersIcon } from "lucide-react"

import { CopyButton } from "@/components/code-block"
import { SectionHeading, StatCard, StatGrid } from "@/components/stat-card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { useAsync } from "@/hooks/use-async"
import { resourceHref } from "@/hooks/use-hash-route"
import { fmt, getJson, histKey, pct, type ServerDetailShard, type Top } from "@/lib/data"

function ResourceGrid({ resources }: { resources: string[] }) {
  const { data: top } = useAsync(() => getJson<Top>("api/top.json").catch(() => null), [])
  const [filter, setFilter] = useState("")
  // servers per resource for the top 5,000; the rest are rare or server-specific
  const used = useMemo(() => new Map((top?.top ?? []).map(([n, s]) => [n, s])), [top])
  const sorted = useMemo(
    () => [...resources].sort((a, b) => (used.get(b) ?? 0) - (used.get(a) ?? 0) || a.localeCompare(b)),
    [resources, used],
  )
  const f = filter.trim().toLowerCase()
  const shown = f ? sorted.filter((n) => n.includes(f)) : sorted

  return (
    <section>
      <SectionHeading
        title="Resources on this server"
        description={`${fmt(resources.length)} resources, most widely used first.`}
        action={
          <div className="relative w-full sm:w-64">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter resources…" className="pl-8" />
          </div>
        }
      />
      {shown.length === 0 ? (
        <Card size="sm">
          <CardContent className="text-sm text-muted-foreground">No resources match “{filter}”.</CardContent>
        </Card>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((n) => {
            const s = used.get(n)
            return (
              <a
                key={n}
                href={resourceHref(n)}
                className="group flex items-center gap-2.5 rounded-lg border bg-card px-3 py-2 transition-colors hover:border-primary/40 hover:bg-muted/40"
              >
                <PackageIcon className="size-4 shrink-0 text-muted-foreground group-hover:text-primary" />
                <span className="truncate font-mono text-[13px]">{n}</span>
                <span className="ml-auto shrink-0 text-xs text-muted-foreground tabular-nums">{s ? `${fmt(s)} servers` : ""}</span>
              </a>
            )
          })}
        </div>
      )}
    </section>
  )
}

export function ServerPage({ id }: { id: string }) {
  const { data, loading } = useAsync(() => getJson<ServerDetailShard>(`api/sv/${histKey(id)}.json`), [id])
  const srv = data?.srv[id]
  useEffect(() => {
    document.title = `${srv?.[0] || id} - resourcestats`
  }, [id, srv])

  const back = (
    <a href="#/" className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
      <ArrowLeftIcon className="size-4" /> Overview
    </a>
  )

  if (loading)
    return (
      <div className="flex flex-col gap-8">
        {back}
        <Skeleton className="h-10 w-2/3" />
        <StatGrid>
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-26.5 rounded-xl" />
          ))}
        </StatGrid>
      </div>
    )

  if (!srv)
    return (
      <div className="flex flex-col gap-8">
        {back}
        <Card className="items-center py-16 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-muted">
            <SearchXIcon className="size-5 text-muted-foreground" />
          </div>
          <CardHeader className="w-full max-w-md">
            <CardTitle className="font-mono text-xl break-all">{id}</CardTitle>
            <CardDescription>This server isn&apos;t in the public server list right now. It may be offline, or the join code may be wrong.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    )

  const [name, players, max, resources] = srv
  const fivem = `https://servers.fivem.net/servers/detail/${encodeURIComponent(id)}`

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-col gap-4">
        {back}
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0 space-y-3">
            <h1 className="text-2xl font-semibold tracking-tight break-words sm:text-3xl">{name || "(no name)"}</h1>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="h-7 gap-1 pr-0.5 pl-2.5 font-mono">
                cfx.re/join/{id}
                <CopyButton text={`cfx.re/join/${id}`} className="size-6" />
              </Badge>
              {players > 0 && (
                <Badge variant="secondary" className="h-7 gap-1.5 px-2.5">
                  <span className="size-2 rounded-full bg-emerald-500" /> Online
                </Badge>
              )}
            </div>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button variant="outline" render={<a href={fivem} target="_blank" rel="noopener nofollow" />} nativeButton={false}>
              <ExternalLinkIcon /> View on FiveM
            </Button>
            <Button render={<a href={`fivem://connect/cfx.re/join/${encodeURIComponent(id)}`} />} nativeButton={false}>
              <PlayIcon /> Connect
            </Button>
          </div>
        </div>
      </div>

      <StatGrid>
        <StatCard label="Players online" value={fmt(players)} icon={UsersIcon} />
        <StatCard label="Max players" value={max ? fmt(max) : "–"} icon={UsersIcon} />
        <StatCard label="Server full" value={max ? pct(players, max, 0) : "–"} icon={GaugeIcon} />
        <StatCard label="Resources" value={resources ? fmt(resources.length) : "–"} icon={PackageIcon} />
      </StatGrid>

      {resources ? (
        <ResourceGrid resources={resources} />
      ) : (
        <Card size="sm">
          <CardContent className="text-sm text-muted-foreground">
            This server&apos;s resource list hasn&apos;t been checked yet, or the server hides it. Lists are checked about once a day.
          </CardContent>
        </Card>
      )}
    </div>
  )
}
