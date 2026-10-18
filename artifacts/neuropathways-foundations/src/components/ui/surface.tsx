import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "../../lib/utils"

/**
 * Three surface treatments from the Phase 1 brief:
 * - open: no container (headings and short descriptions)
 * - separated: light border for lists and related information
 * - floating: scarce elevation for support and the current focus only
 * `tone="urgent"` adds the urgent-red edge for immediate support.
 */
const surfaceVariants = cva("min-w-0 text-foreground", {
  variants: {
    variant: {
      open: "",
      separated: "rounded-lg border bg-card p-card sm:p-card-lg",
      floating: "rounded-xl border bg-card p-card shadow-floating sm:p-card-lg",
    },
    tone: {
      default: "",
      urgent: "border-destructive/40 border-l-4 border-l-destructive",
    },
  },
  defaultVariants: { variant: "separated", tone: "default" },
})

export interface SurfaceProps
  extends React.HTMLAttributes<HTMLElement>,
    VariantProps<typeof surfaceVariants> {
  as?: "div" | "section" | "article" | "aside"
}

const Surface = React.forwardRef<HTMLElement, SurfaceProps>(
  ({ as: Comp = "div", variant, tone, className, ...props }, ref) => (
    <Comp
      ref={ref as React.Ref<HTMLDivElement>}
      className={cn(surfaceVariants({ variant, tone }), className)}
      {...props}
    />
  ),
)
Surface.displayName = "Surface"

export { Surface, surfaceVariants }
