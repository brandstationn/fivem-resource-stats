import { useState } from "react"
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts"

import { SectionHeading } from "@/components/stat-card"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { compact, fmt, type Point } from "@/lib/data"

const config = {
  servers: { label: "Servers", color: "var(--chart-1)" },
  players: { label: "Players", color: "var(--chart-2)" },
} satisfies ChartConfig

type Mode = "h" | "d"

function SeriesChart({ data, field, daily }: { data: Point[]; field: "servers" | "players"; daily: boolean }) {
  const label = config[field].label
  const latest = data.at(-1)?.[field]
  const span = data.length > 1 ? data[data.length - 1].x - data[0].x : 0
  const tick = (x: number) =>
    daily || span > 3 * 864e5
      ? new Date(x).toLocaleDateString(undefined, { month: "short", day: "numeric" })
      : new Date(x).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
  const id = `fill-${field}`
  // Date labels go on local midnights (at most ~6), so the same day never shows twice.
  let ticks: number[] | undefined
  if (data.length > 1 && (daily || span > 3 * 864e5)) {
    const days: number[] = []
    const d = new Date(data[0].x)
    d.setHours(24, 0, 0, 0)
    for (; d.getTime() <= data[data.length - 1].x; d.setDate(d.getDate() + 1)) days.push(d.getTime())
    const step = Math.ceil(days.length / 6)
    ticks = days.filter((_, i) => i % step === 0)
  }

  return (
    <Card size="sm">
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-xl font-semibold tabular-nums">
          {latest === undefined ? "–" : fmt(latest)}
          <span className="ml-2 text-xs font-normal text-muted-foreground">{daily ? "latest daily peak" : "now"}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="px-2">
        {data.length < 2 ? (
          <div className="flex h-52 items-center justify-center px-6 text-center text-sm text-muted-foreground">
            The chart fills in as data comes in, one point per {daily ? "day" : "hour"}.
          </div>
        ) : (
          <ChartContainer config={config} className="aspect-auto h-52 w-full">
            <AreaChart data={data} margin={{ left: 4, right: 12, top: 8 }}>
              <defs>
                <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={`var(--color-${field})`} stopOpacity={0.35} />
                  <stop offset="95%" stopColor={`var(--color-${field})`} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="x" type="number" scale="time" domain={["dataMin", "dataMax"]} ticks={ticks} tickFormatter={tick} tickLine={false} axisLine={false} tickMargin={8} minTickGap={40} />
              <YAxis tickFormatter={compact} tickLine={false} axisLine={false} width={44} tickMargin={4} />
              <ChartTooltip
                cursor={{ strokeDasharray: "3 3" }}
                content={
                  <ChartTooltipContent
                    indicator="line"
                    labelFormatter={(_, p) => {
                      const x = (p?.[0]?.payload as Point | undefined)?.x
                      if (x === undefined) return ""
                      const d = new Date(x)
                      return daily
                        ? d.toLocaleDateString(undefined, { dateStyle: "medium" }) + " (peak)"
                        : d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
                    }}
                    formatter={(v) => (
                      <div className="flex w-full items-center justify-between gap-4">
                        <span className="text-muted-foreground">{label}</span>
                        <span className="font-mono font-medium text-foreground tabular-nums">{fmt(Number(v))}</span>
                      </div>
                    )}
                  />
                }
              />
              <Area dataKey={field} type="monotone" stroke={`var(--color-${field})`} strokeWidth={2} fill={`url(#${id})`} isAnimationActive={false} />
            </AreaChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  )
}

/** Servers + players charts with a 7-day (hourly) / 90-day (daily peak) switch. */
export function HistoryCharts({ hourly, daily, title = "History", description }: { hourly: Point[]; daily: Point[]; title?: string; description?: string }) {
  const [mode, setMode] = useState<Mode>("h")
  const data = mode === "h" ? hourly : daily
  return (
    <section>
      <SectionHeading
        title={title}
        description={description}
        action={
          <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)}>
            <TabsList>
              <TabsTrigger value="h" className="px-3">7 days</TabsTrigger>
              <TabsTrigger value="d" className="px-3">90 days</TabsTrigger>
            </TabsList>
          </Tabs>
        }
      />
      <div className="grid gap-3 md:grid-cols-2">
        <SeriesChart data={data} field="servers" daily={mode === "d"} />
        <SeriesChart data={data} field="players" daily={mode === "d"} />
      </div>
    </section>
  )
}
