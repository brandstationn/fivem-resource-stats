import { useEffect } from "react"
import { BadgeCheckIcon, GlobeIcon, RefreshCwIcon } from "lucide-react"

import { CodeBlock, InlineCode as C } from "@/components/code-block"
import { SectionHeading } from "@/components/stat-card"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { siteBase } from "@/lib/data"

const endpoints: [string, React.ReactNode][] = [
  ["api/summary.json", "Totals (servers, players, number of resources), top 100 resources, global history."],
  ["api/top.json", <>Top 5,000 resources: <C>[name, servers, players]</C>, sorted by servers.</>],
  [
    "api/r/{xx}.json",
    <>
      Current numbers for <b>every</b> resource whose name starts with <C>xx</C>: <C>{"{ r: { name: [servers, players, rank] } }"}</C>
    </>,
  ],
  [
    "api/h/{hhh}.json",
    <>
      History (resources on 3+ servers): <C>t</C> = hourly unix times, <C>h[name]</C> = flat <C>[servers, players, servers, players, …]</C> per hour (7
      days); <C>d</C> = dates, <C>dd[name]</C> = same format, daily peak (90 days).
    </>,
  ],
  [
    "api/s/{hhh}.json",
    <>
      Servers running each resource (up to 100, busiest first): <C>r[name]</C> = list of server IDs, <C>srv[id]</C> = <C>[name, players, maxPlayers]</C>.
      The ID is the cfx.re join code (<C>servers.fivem.net/servers/detail/{"{id}"}</C>).
    </>,
  ],
  [
    "api/servers.json",
    <>
      Every server in the list, busiest first: <C>s</C> = <C>[[id, name, players, maxPlayers, resourceCount], …]</C>. <C>resourceCount</C> is{" "}
      <C>-1</C> when the server&apos;s resource list isn&apos;t known.
    </>,
  ],
  [
    "api/sv/{hhh}.json",
    <>
      Server details, bucketed by <C>{"{hhh}"}</C> of the server ID: <C>srv[id]</C> = <C>[name, players, maxPlayers, [resource names] | null]</C>.
    </>,
  ],
  ["api/all.json.gz", "Everything current in one gzip file."],
  ["api/history.json.gz", "The full history database in one gzip file."],
]

export function ApiDocsPage() {
  useEffect(() => {
    document.title = "API - resourcestats"
  }, [])
  const base = siteBase()
  const example = `const name = "ox_lib";
const key = (name.slice(0, 2).replace(/[^a-z0-9]/g, "_") + "__").slice(0, 2);
const { r } = await (await fetch("${base}api/r/" + key + ".json")).json();
const [servers, players, rank] = r[name];

function histKey(name) {
  let h = 0x811c9dc5;
  for (const b of new TextEncoder().encode(name)) { h ^= b; h = Math.imul(h, 0x01000193) >>> 0; }
  return (h & 0xfff).toString(16).padStart(3, "0");
}
const hist = await (await fetch("${base}api/h/" + histKey(name) + ".json")).json();
const hourly = hist.t.map((t, i) => ({ time: t, servers: hist.h[name][i * 2], players: hist.h[name][i * 2 + 1] }));`
  const embed = `<span data-fivem-resource="ox_lib" data-show="servers"></span>
<span data-fivem-resource="ox_lib" data-show="players"></span>
<script src="${base}embed.js" async></script>`

  return (
    <div className="flex flex-col gap-12">
      <header className="flex flex-col gap-4">
        <Badge variant="secondary" className="w-fit">Developers</Badge>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Free JSON API</h1>
        <p className="max-w-2xl text-muted-foreground">
          Free for anyone, with no key or sign-up. The files are static JSON on a CDN, so you can call them straight from a browser. The data refreshes
          every hour, a few minutes past the hour, so there&apos;s no point fetching more often than that.
        </p>
        <div className="flex flex-wrap gap-2 pt-1">
          {(
            [
              [BadgeCheckIcon, "No API key"],
              [GlobeIcon, "CORS open"],
              [RefreshCwIcon, "Hourly updates"],
            ] as const
          ).map(([Icon, label]) => (
            <Badge key={label} variant="outline" className="h-7 gap-1.5 px-3">
              <Icon /> {label}
            </Badge>
          ))}
        </div>
      </header>

      <section>
        <SectionHeading title="Endpoints" description={<>All paths are relative to <C>{base}</C></>} />
        <Card className="gap-0 p-0">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-5">URL</TableHead>
                <TableHead className="pr-5">What it contains</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {endpoints.map(([url, text]) => (
                <TableRow key={url} className="hover:bg-transparent">
                  <TableCell className="pl-5 align-top">
                    <span className="font-mono text-[13px] font-medium">{url}</span>
                  </TableCell>
                  <TableCell className="pr-5 leading-relaxed whitespace-normal text-muted-foreground">{text}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
        <Card size="sm" className="mt-3">
          <CardContent className="space-y-2 text-sm leading-relaxed text-muted-foreground">
            <p>
              <C>{"{xx}"}</C> = the first 2 characters of the resource name in lowercase, with anything other than a-z / 0-9 replaced by <C>_</C>. Names
              shorter than 2 characters are padded with <C>_</C>. Example: <C>ox_lib</C> → <C>ox</C>, <C>[core]</C> → <C>_c</C>.
            </p>
            <p>
              <C>{"{hhh}"}</C> = FNV-1a 32-bit hash of the UTF-8 resource name (or server ID), <C>&amp; 0xfff</C>, as 3 lowercase hex digits (see <C>histKey</C> in the example).
            </p>
          </CardContent>
        </Card>
      </section>

      <section>
        <SectionHeading title="Example" />
        <CodeBlock code={example} title="JavaScript" />
      </section>

      <section>
        <SectionHeading title="Embed widget" description="Live numbers on any page, such as a FiveM store or Tebex package. data-show can be servers, players or rank." />
        <CodeBlock code={embed} />
      </section>

      <Card size="sm">
        <CardContent className="text-sm leading-relaxed text-muted-foreground">
          <b className="text-foreground">How it&apos;s counted:</b> each server is counted once per resource, even if the name appears twice. Names are
          case-insensitive. &ldquo;Players&rdquo; is everyone online on servers running that resource. Servers that hide their resource list can&apos;t be
          counted.
        </CardContent>
      </Card>
    </div>
  )
}
