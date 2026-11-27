import { useEffect, useState } from "react"
import { AlertCircleIcon } from "lucide-react"

import { LogoMark } from "@/components/logo"
import { SearchDialog } from "@/components/search-dialog"
import { GITHUB, SiteHeader } from "@/components/site-header"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Skeleton } from "@/components/ui/skeleton"
import { TooltipProvider } from "@/components/ui/tooltip"
import { useHashRoute } from "@/hooks/use-hash-route"
import { getJson, setDataVersion, type Summary } from "@/lib/data"
import { ApiDocsPage } from "@/pages/api-docs"
import { HomePage } from "@/pages/home"
import { ResourcePage } from "@/pages/resource"
import { ServerPage } from "@/pages/server"

function Loading() {
  return (
    <div className="flex flex-col gap-8">
      <Skeleton className="h-80 rounded-3xl" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-26.5 rounded-xl" />
        ))}
      </div>
    </div>
  )
}

function Footer({ summary }: { summary?: Summary }) {
  return (
    <footer className="border-t">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 text-sm text-muted-foreground sm:px-6 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-2.5">
          <LogoMark className="size-5" />
          <span>
            Free FiveM resource stats. Data from the public Cfx.re server list. Not affiliated with Cfx.re.
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          {summary && <span>Updated {new Date(summary.updatedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</span>}
          <a href="#/api" className="hover:text-foreground">API</a>
          <a href={GITHUB} target="_blank" rel="noopener" className="hover:text-foreground">GitHub</a>
        </div>
      </div>
    </footer>
  )
}

export default function App() {
  const route = useHashRoute()
  const [summary, setSummary] = useState<Summary>()
  const [error, setError] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)

  useEffect(() => {
    getJson<Summary>("api/summary.json")
      .then((s) => {
        if (!s) throw new Error("missing")
        setDataVersion(s.updatedAt)
        setSummary(s)
      })
      .catch(() => setError(true))
  }, [])

  let page: React.ReactNode
  if (error)
    page = (
      <Alert>
        <AlertCircleIcon />
        <AlertTitle>No data yet</AlertTitle>
        <AlertDescription>The first data collection hasn&apos;t finished yet, or the data couldn&apos;t be loaded. Check back in a few minutes.</AlertDescription>
      </Alert>
    )
  else if (route.page === "api") page = <ApiDocsPage />
  else if (route.page === "server") page = <ServerPage key={route.id} id={route.id} />
  else if (!summary) page = <Loading />
  else if (route.page === "resource") page = <ResourcePage key={route.name} name={route.name} summary={summary} />
  else page = <HomePage summary={summary} onSearch={() => setSearchOpen(true)} />

  return (
    <TooltipProvider>
      <div className="flex min-h-svh flex-col">
        <SiteHeader route={route} onSearch={() => setSearchOpen(true)} />
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 sm:py-10">{page}</main>
        <Footer summary={summary} />
      </div>
      <SearchDialog open={searchOpen} onOpenChange={setSearchOpen} summary={summary} />
    </TooltipProvider>
  )
}
