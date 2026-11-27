import { useState } from "react"
import { CheckIcon, CopyIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export function CopyButton({ text, className }: { text: string; className?: string }) {
  const [done, setDone] = useState(false)
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      className={cn("text-muted-foreground", className)}
      aria-label={done ? "Copied" : "Copy to clipboard"}
      onClick={() =>
        navigator.clipboard.writeText(text).then(() => {
          setDone(true)
          setTimeout(() => setDone(false), 1500)
        })
      }
    >
      {done ? <CheckIcon className="text-emerald-500" /> : <CopyIcon />}
    </Button>
  )
}

export function CodeBlock({ code, title = "HTML", className }: { code: string; title?: string; className?: string }) {
  return (
    <div className={cn("overflow-hidden rounded-xl border bg-muted/30", className)}>
      <div className="flex h-10 items-center justify-between border-b bg-muted/40 pr-1.5 pl-4">
        <span className="text-xs font-medium text-muted-foreground">{title}</span>
        <CopyButton text={code} />
      </div>
      <pre className="overflow-x-auto p-4 font-mono text-[12.5px] leading-relaxed">
        <code>{code}</code>
      </pre>
    </div>
  )
}

export function InlineCode({ className, ...props }: React.ComponentProps<"code">) {
  return <code className={cn("rounded-md bg-muted px-1.5 py-0.5 font-mono text-[0.85em]", className)} {...props} />
}
