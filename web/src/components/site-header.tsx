import { MoonIcon, SearchIcon, SunIcon } from "lucide-react"

import { Kbd } from "@/components/kbd"
import { Logo } from "@/components/logo"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import type { Route } from "@/hooks/use-hash-route"
import { useTheme } from "@/hooks/use-theme"
import { cn } from "@/lib/utils"

export const GITHUB = "https://github.com/brandstationn/fivem-resource-stats"

export function GithubIcon(props: React.ComponentProps<"svg">) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M12 .5a11.5 11.5 0 0 0-3.64 22.41c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.37-3.88-1.37-.52-1.33-1.28-1.69-1.28-1.69-1.05-.71.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.56-.29-5.25-1.28-5.25-5.68 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.78 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.83 1.19 3.09 0 4.41-2.7 5.38-5.26 5.67.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .5Z" />
    </svg>
  )
}

export function SiteHeader({ route, onSearch }: { route: Route; onSearch: () => void }) {
  const { theme, toggle } = useTheme()
  const link = (href: string, label: string, active: boolean) => (
    <a
      href={href}
      className={cn(
        "rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors hover:text-foreground",
        active ? "text-foreground" : "text-muted-foreground",
      )}
    >
      {label}
    </a>
  )
  return (
    <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4 sm:px-6">
        <a href="#/" className="flex items-center gap-2.5" aria-label="resourcestats home">
          <Logo />
          <Badge variant="secondary" className="hidden text-[10px] font-semibold tracking-wider uppercase sm:inline-flex">
            FiveM
          </Badge>
        </a>
        <nav className="ml-2 hidden items-center md:flex">
          {link("#/", "Overview", route.page !== "api")}
          {link("#/api", "API", route.page === "api")}
        </nav>
        <div className="ml-auto flex items-center gap-1">
          <Button
            variant="outline"
            onClick={onSearch}
            className="mr-1 w-9 justify-start gap-2 px-2.5 text-muted-foreground sm:w-60"
            aria-label="Search resources and servers"
          >
            <SearchIcon />
            <span className="hidden flex-1 text-left font-normal sm:inline">Resources or servers…</span>
            <Kbd className="hidden sm:inline-flex">Ctrl K</Kbd>
          </Button>
          <Button variant="ghost" size="sm" className="md:hidden" render={<a href="#/api" />} nativeButton={false}>
            API
          </Button>
          <Button variant="ghost" size="icon" render={<a href={GITHUB} target="_blank" rel="noopener" />} nativeButton={false} aria-label="GitHub">
            <GithubIcon className="size-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={toggle} aria-label="Toggle theme">
            {theme === "dark" ? <SunIcon /> : <MoonIcon />}
          </Button>
        </div>
      </div>
    </header>
  )
}
