import { useEffect, useMemo, useState } from "react"
import {
  ArrowRightIcon,
  BadgeCheckIcon,
  BracesIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ClockIcon,
  CodeIcon,
  InfoIcon,
  PackageIcon,
  RefreshCwIcon,
  SearchIcon,
  ServerIcon,
  StoreIcon,
  UsersIcon,
} from "lucide-react"

import { CodeBlock } from "@/components/code-block"
import { HistoryCharts } from "@/components/history-charts"
import { SectionHeading, StatCard, StatGrid } from "@/components/stat-card"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { resourceHref } from "@/hooks/use-hash-route"
import { ago, embedSnippet, fmt, fromPairs, getJson, pct, type Summary, type Top } from "@/lib/data"

const features = [
  { icon: BadgeCheckIcon, title: "Free, no sign-up", text: "No account, no API key, no limits. Use the numbers anywhere, for anything." },
  { icon: StoreIcon, title: "Made for your store", text: "Show live server and player counts on your Tebex store, website, docs or Discord." },
  { icon: ServerIcon, title: "Every server, searchable", text: "Look up any public server and see every resource it runs, with live player counts." },
  { icon: RefreshCwIcon, title: "Updated every hour", text: "Every public FiveM server is checked, so the numbers stay current on their own." },
]

function Hero({ summary, onSearch }: { summary: Summary; onSearch: () => void }) {
  return (
    <section className="relative isolate overflow-hidden rounded-3xl border bg-card px-6 py-14 sm:px-12 sm:py-20">
      <div aria-hidden className="absolute inset-0 -z-10 bg-[radial-gradient(60%_80%_at_50%_0%,color-mix(in_oklch,var(--primary)_18%,transparent),transparent)]" />
      <div
        aria-hidden
        className="absolute inset-0 -z-10 [background-image:linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] [background-size:40px_40px] opacity-40 [mask-image:radial-gradient(70%_60%_at_50%_0%,#000,transparent)]"
      />
      <div className="mx-auto flex max-w-3xl flex-col items-center text-center">
        <Badge variant="outline" className="mb-5 h-7 gap-2 rounded-full bg-background/60 px-3 text-xs font-normal backdrop-blur">
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-500 opacity-60" />
            <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
          </span>
          Free &amp; open · tracking {fmt(summary.servers)} servers live
        </Badge>
        <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl md:text-6xl">
          See how many FiveM servers run <span className="text-primary">your resource</span>
        </h1>
        <p className="mt-5 max-w-2xl text-base text-pretty text-muted-foreground sm:text-lg">
          Live server and player counts for every FiveM resource, and the full resource list of every server, refreshed every hour.
          Completely free to use: put the numbers on your FiveM store, website or docs with one line of code, or build on the open API.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Button size="lg" className="h-10 gap-2 px-5" onClick={onSearch}>
            <SearchIcon />
            Search resources &amp; servers
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="h-10 gap-2 px-5"
            onClick={() => document.getElementById("embed")?.scrollIntoView({ behavior: "smooth", block: "start" })}
          >
            <CodeIcon />
            Add to your store
          </Button>
        </div>
      </div>
    </section>
  )
}

function Features() {
  return (
    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {features.map(({ icon: Icon, title, text }) => (
        <Card key={title} size="sm" className="transition-colors hover:bg-muted/40">
          <CardHeader className="gap-3">
            <div className="flex size-9 items-center justify-center rounded-lg border bg-background text-primary">
              <Icon className="size-4.5" />
            </div>
            <CardTitle>{title}</CardTitle>
            <CardDescription className="leading-relaxed">{text}</CardDescription>
          </CardHeader>
        </Card>
      ))}
    </section>
  )
}

function EmbedShowcase({ summary }: { summary: Summary }) {
  const example = summary.top.find(([n]) => n === "ox_lib") ?? summary.top[0]
  const [name, servers, players] = example ?? ["ox_lib", 0, 0]
  return (
    <section id="embed" className="scroll-mt-20">
      <Card className="gap-0 overflow-hidden p-0">
        <div className="grid lg:grid-cols-2">
          <div className="flex flex-col gap-5 p-6 sm:p-8">
            <div className="space-y-2">
              <Badge variant="secondary" className="gap-1.5">
                <StoreIcon /> For resource creators
              </Badge>
              <h2 className="text-2xl font-semibold tracking-tight">Show live numbers on your FiveM store</h2>
              <p className="text-sm leading-relaxed text-muted-foreground">
                Selling or sharing a script? Prove it&apos;s used. Paste this snippet into your Tebex package description, website or docs and it
                shows how many servers run your resource and how many players are on them. It updates by itself, free, forever.
              </p>
            </div>
            <CodeBlock code={embedSnippet(name)} />
            <p className="text-xs text-muted-foreground">
              Replace <span className="font-mono text-foreground">{name}</span> with your resource&apos;s folder name. <span className="font-mono">data-show</span> can
              be <span className="font-mono">servers</span>, <span className="font-mono">players</span> or <span className="font-mono">rank</span>.
            </p>
          </div>
          <div className="relative flex items-center justify-center border-t bg-muted/30 p-6 sm:p-10 lg:border-t-0 lg:border-l">
            <div aria-hidden className="absolute inset-0 [background-image:radial-gradient(var(--border)_1px,transparent_1px)] [background-size:16px_16px] opacity-70" />
            <div className="relative w-full max-w-xs">
              <p className="mb-3 text-center text-xs font-medium tracking-wider text-muted-foreground uppercase">Preview on a store page</p>
              <Card className="shadow-xl shadow-primary/5">
                <div className="mx-4 flex aspect-[16/9] items-center justify-center rounded-lg bg-gradient-to-br from-primary/80 to-primary/40">
                  <PackageIcon className="size-10 text-primary-foreground/90" />
                </div>
                <CardHeader>
                  <CardTitle className="font-mono">{name}</CardTitle>
                  <CardDescription>Your script&apos;s description goes here.</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  <div className="flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-sm">
                    <span className="size-2 rounded-full bg-emerald-500" />
                    <span>
                      <b className="tabular-nums">{fmt(servers)}</b> servers · <b className="tabular-nums">{fmt(players)}</b> players
                    </span>
                  </div>
                  <Button className="w-full" tabIndex={-1}>
                    Buy now
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </Card>
    </section>
  )
}

function TopTable({ summary }: { summary: Summary }) {
  const [rows, setRows] = useState(summary.top)
  const [page, setPage] = useState(0)
  const per = 25
  useEffect(() => {
    let live = true
    getJson<Top>("api/top.json").then((t) => live && t && setRows(t.top)).catch(() => {})
    return () => {
      live = false
    }
  }, [])
  const pages = Math.max(1, Math.ceil(rows.length / per))
  const slice = rows.slice(page * per, page * per + per)
  const turn = (d: number) => {
    setPage((p) => p + d)
    document.getElementById("top")?.scrollIntoView({ block: "start" })
  }

  return (
    <section id="top" className="scroll-mt-20">
      <SectionHeading title="Most used resources" description={`Ranked by the number of servers running them, out of ${fmt(summary.resources)} different resources.`} />
      <Card className="gap-0 p-0">
        <Table className="table-fixed">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-14 pl-5">#</TableHead>
              <TableHead>Resource</TableHead>
              <TableHead className="w-28 text-right">Servers</TableHead>
              <TableHead className="hidden w-28 text-right sm:table-cell">Players</TableHead>
              <TableHead className="hidden w-28 pr-5 text-right md:table-cell">Share</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {slice.map(([n, s, p], i) => (
              <TableRow key={n} className="group cursor-pointer" onClick={() => (location.hash = resourceHref(n))}>
                <TableCell className="pl-5 text-xs text-muted-foreground tabular-nums">{page * per + i + 1}</TableCell>
                <TableCell>
                  <a href={resourceHref(n)} className="block truncate font-medium transition-colors group-hover:text-primary" onClick={(e) => e.stopPropagation()}>
                    {n}
                  </a>
                </TableCell>
                <TableCell className="text-right font-medium tabular-nums">{fmt(s)}</TableCell>
                <TableCell className="hidden text-right text-muted-foreground tabular-nums sm:table-cell">{fmt(p)}</TableCell>
                <TableCell className="hidden pr-5 text-right text-muted-foreground tabular-nums md:table-cell">{pct(s, summary.servers)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <div className="flex items-center justify-between gap-2 border-t border-border/60 py-2.5 pr-2.5 pl-5">
          <span className="text-xs text-muted-foreground tabular-nums">
            {fmt(page * per + 1)}–{fmt(Math.min(rows.length, page * per + per))} of {fmt(rows.length)}
          </span>
          <div className="flex gap-1">
            <Button variant="ghost" size="icon-sm" disabled={page === 0} onClick={() => turn(-1)} aria-label="Previous page">
              <ChevronLeftIcon />
            </Button>
            <Button variant="ghost" size="icon-sm" disabled={page >= pages - 1} onClick={() => turn(1)} aria-label="Next page">
              <ChevronRightIcon />
            </Button>
          </div>
        </div>
      </Card>
    </section>
  )
}

export function HomePage({ summary, onSearch }: { summary: Summary; onSearch: () => void }) {
  useEffect(() => {
    document.title = "resourcestats - FiveM servers & players per resource"
  }, [])
  const hourly = useMemo(() => fromPairs(summary.hourly.t, summary.hourly.v), [summary])
  const daily = useMemo(() => fromPairs(summary.daily.d, summary.daily.v, true), [summary])
  const coverage = summary.covered / summary.servers

  return (
    <div className="flex flex-col gap-12">
      <Hero summary={summary} onSearch={onSearch} />
      <Features />

      <section className="flex flex-col gap-4">
        <SectionHeading title="Right now" description="Across every public FiveM server that lists its resources." />
        <StatGrid>
          <StatCard label="Servers online" value={fmt(summary.servers)} icon={ServerIcon} />
          <StatCard label="Players online" value={fmt(summary.players)} icon={UsersIcon} />
          <StatCard label="Different resources" value={fmt(summary.resources)} icon={PackageIcon} />
          <StatCard label="Last update" value={ago(summary.updatedAt)} icon={ClockIcon} />
        </StatGrid>
        {coverage < 0.97 && (
          <Alert>
            <InfoIcon />
            <AlertTitle>Still checking servers</AlertTitle>
            <AlertDescription>
              Resource lists are known for {fmt(summary.covered)} of {fmt(summary.servers)} servers so far ({pct(summary.covered, summary.servers, coverage < 0.1 ? 1 : 0)}).
              The busiest servers are checked first, so the numbers will rise over the next day or so.
            </AlertDescription>
          </Alert>
        )}
      </section>

      <HistoryCharts hourly={hourly} daily={daily} title="Servers & players over time" description="Hourly for the last 7 days, daily peaks for 90 days." />
      <TopTable summary={summary} />
      <EmbedShowcase summary={summary} />

      <section className="flex flex-col items-center gap-4 rounded-2xl border border-dashed px-6 py-10 text-center">
        <BracesIcon className="size-6 text-muted-foreground" />
        <div className="space-y-1">
          <h2 className="text-lg font-semibold tracking-tight">Building something?</h2>
          <p className="max-w-md text-sm text-muted-foreground">All of this data is available as free static JSON: no key, no sign-up, CORS open.</p>
        </div>
        <Button variant="outline" render={<a href="#/api" />} nativeButton={false}>
          Read the API docs <ArrowRightIcon />
        </Button>
      </section>
    </div>
  )
}
