import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "../../lib/utils"

/**
 * Text-first status indicator. Meaning is always carried by the text label
 * (and optional icon), never by color alone.
 */
const statusBadgeVariants = cva(
  "inline-flex max-w-full min-w-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-support-sm font-semibold [overflow-wrap:anywhere] [&_svg]:size-3.5 [&_svg]:shrink-0",
  {
    variants: {
      tone: {
        neutral: "border-border bg-muted text-foreground",
        info: "border-primary/25 bg-primary/10 text-foreground",
        support: "border-chart-2/30 bg-accent text-accent-foreground",
        urgent: "border-destructive/30 bg-destructive/10 text-foreground",
        outline: "border-border bg-transparent text-muted-foreground",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
)

export interface StatusBadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof statusBadgeVariants> {
  icon?: React.ReactNode
}

function StatusBadge({ tone, icon, className, children, ...props }: StatusBadgeProps) {
  return (
    <span className={cn(statusBadgeVariants({ tone }), className)} {...props}>
      {icon ? <span aria-hidden="true" className="inline-flex">{icon}</span> : null}
      <span className="min-w-0">{children}</span>
    </span>
  )
}

export { StatusBadge, statusBadgeVariants }
