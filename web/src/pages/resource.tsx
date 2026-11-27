import { useEffect, useState } from "react"
import { ArrowLeftIcon, ChevronRightIcon, HashIcon, PercentIcon, SearchXIcon, ServerIcon, UsersIcon } from "lucide-react"

import { CodeBlock, CopyButton, InlineCode } from "@/components/code-block"
import { HistoryCharts } from "@/components/history-charts"
import { SectionHeading, StatCard, StatGrid } from "@/components/stat-card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useAsync } from "@/hooks/use-async"
import { serverHref } from "@/hooks/use-hash-route"
import {
  embedSnippet,
  fmt,
  fromFlat,
  getJson,
  histKey,
  pct,
  shardKey,
  type HistoryShard,
  type ServerShard,
  type Shard,
  type Summary,
} from "@/lib/data"

function ServerList({ name, total }: { name: string; total: number }) {
  const { data } = useAsync(() => getJson<ServerShard>(`api/s/${histKey(name)}.json`).catch(() => null), [name])
  const [shown, setShown] = useState(25)
  const eps = data?.r[name] ?? []
  if (!eps.length) return null
  return (
    <section>
      <SectionHeading
        title={<>Servers using {name}</>}
        description={total > eps.length ? `The ${fmt(eps.length)} busiest of ${fmt(total)} servers.` : `${fmt(total)} server${total === 1 ? "" : "s"}, busiest first.`}
      />
      <Card className="gap-0 p-0">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-12 pl-5">#</TableHead>
              <TableHead>Server</TableHead>
              <TableHead className="pr-5 text-right">Players</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {eps.slice(0, shown).map((ep, i) => {
              const [hn, pl, mx] = data!.srv[ep] ?? ["(unknown)", 0, 0]
              return (
                <TableRow key={ep}>
                  <TableCell className="pl-5 text-xs text-muted-foreground tabular-nums">{i + 1}</TableCell>
                  <TableCell className="w-full max-w-0">
                    <a href={serverHref(ep)} className="group inline-flex max-w-full items-center gap-1.5 hover:text-primary">
                      <span className="truncate">{hn || "(no name)"}</span>
                      <ChevronRightIcon className="size-3.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-60" />
                    </a>
                  </TableCell>
                  <TableCell className="pr-5 text-right whitespace-nowrap tabular-nums">
                    {fmt(pl)}
                    {mx > 0 && <span className="text-muted-foreground"> / {fmt(mx)}</span>}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
        {shown < eps.length && (
          <div className="flex justify-center border-t p-3">
            <Button variant="ghost" size="sm" onClick={() => setShown((s) => s + 25)}>
              Show more
            </Button>
          </div>
        )}
      </Card>
    </section>
  )
}

export function ResourcePage({ name, summary }: { name: string; summary: Summary }) {
  useEffect(() => {
    document.title = `${name} - resourcestats`
  }, [name])
  const k = shardKey(name)
  const hk = histKey(name)
  const { data, loading } = useAsync(() => Promise.all([getJson<Shard>(`api/r/${k}.json`), getJson<HistoryShard>(`api/h/${hk}.json`)]), [name])
  const cur = data?.[0]?.r[name]
  const h = data?.[1]

  const back = (
    <a href="#/" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
      <ArrowLeftIcon className="size-4" /> All resources
    </a>
  )
  const title = (
    <div className="flex flex-wrap items-center gap-3">
      <h1 className="font-mono text-3xl font-semibold tracking-tight break-all sm:text-4xl">{name}</h1>
      {cur && <Badge variant="secondary" className="h-6 px-2.5 tabular-nums">Rank #{fmt(cur[2])}</Badge>}
    </div>
  )

  if (loading)
    return (
      <div className="flex flex-col gap-8">
        {back}
        {title}
        <StatGrid>
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-26.5 rounded-xl" />
          ))}
        </StatGrid>
        <Skeleton className="h-80 rounded-xl" />
      </div>
    )

  if (!cur)
    return (
      <div className="flex flex-col gap-8">
        {back}
        <Card className="items-center py-16 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-muted">
            <SearchXIcon className="size-5 text-muted-foreground" />
          </div>
          <CardHeader className="w-full max-w-md">
            <CardTitle className="font-mono text-xl break-all">{name}</CardTitle>
            <CardDescription>
              No server is running a resource with this exact name right now. Resource names are the folder names servers use, so check the
              spelling or try the search.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    )

  const [sv, p, rank] = cur
  const hh = h?.h[name]
  const dd = h?.dd[name]
  const snippet = embedSnippet(name)

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-col gap-4">
        {back}
        {title}
      </div>

      <StatGrid>
        <StatCard label="Servers running it" value={fmt(sv)} icon={ServerIcon} />
        <StatCard label="Players on those servers" value={fmt(p)} icon={UsersIcon} />
        <StatCard label="Rank" value={"#" + fmt(rank)} icon={HashIcon} hint={`of ${fmt(summary.resources)} resources`} />
        <StatCard label="Share of all servers" value={pct(sv, summary.servers, 2)} icon={PercentIcon} />
      </StatGrid>

      {hh && h ? (
        <HistoryCharts hourly={fromFlat(h.t, hh)} daily={dd ? fromFlat(h.d, dd, true) : []} />
      ) : (
        <Card size="sm">
          <CardContent className="text-sm text-muted-foreground">History is kept for resources running on 3 or more servers.</CardContent>
        </Card>
      )}

      <ServerList name={name} total={sv} />

      <section>
        <SectionHeading title="Use these numbers on your site" description="Paste this into your store page, website or docs. It updates by itself." />
        <div className="grid gap-3 lg:grid-cols-[1fr_320px]">
          <CodeBlock code={snippet} />
          <Card size="sm">
            <CardHeader>
              <CardTitle>Raw JSON</CardTitle>
              <CardDescription>Or read the data yourself:</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 text-sm">
              {[
                [`api/r/${k}.json`, "current"],
                [`api/h/${hk}.json`, "history"],
              ].map(([path, label]) => (
                <div key={path} className="flex items-center justify-between gap-2 rounded-lg border px-3 py-1.5">
                  <a href={path} target="_blank" rel="noopener" className="truncate font-mono text-xs hover:text-primary">
                    {path}
                  </a>
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    {label}
                    <CopyButton text={new URL(path, location.href.split("#")[0]).href} className="-mr-2" />
                  </span>
                </div>
              ))}
              <p className="pt-1 text-xs text-muted-foreground">
                See the <a href="#/api" className="text-primary hover:underline">API docs</a> for the format of <InlineCode>r</InlineCode> and{" "}
                <InlineCode>h</InlineCode>.
              </p>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  )
}
