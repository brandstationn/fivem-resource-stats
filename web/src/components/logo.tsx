import { cn } from "@/lib/utils"

/** One rising blue line: a simple "stats" mark. Same drawing as public/favicon.svg. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg className={cn("size-7 text-primary", className)} viewBox="0 0 32 32" aria-hidden="true">
      <path d="M4 23 12 15l5.5 5.5L28 10" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function Logo() {
  return (
    <span className="flex items-center gap-2">
      <LogoMark />
      <span className="text-[17px] font-semibold tracking-tight">
        <span className="text-muted-foreground">resource</span>stats
      </span>
    </span>
  )
}
