import * as React from "react"

import { cn } from "../../lib/utils"

/**
 * Compact content card: badges, 17px title, optional meta line, a two-line
 * clamped description, optional body and actions. `current` applies the scarce
 * floating elevation reserved for the current focus. Product-agnostic.
 */
export interface CompactCardProps extends Omit<React.HTMLAttributes<HTMLElement>, "title"> {
  title: React.ReactNode
  badges?: React.ReactNode
  meta?: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
  leading?: React.ReactNode
  current?: boolean
  headingLevel?: "h3" | "h4"
}

function CompactCard({
  title,
  badges,
  meta,
  description,
  actions,
  leading,
  current,
  headingLevel: Heading = "h3",
  className,
  children,
  ...props
}: CompactCardProps) {
  return (
    <article
      data-current={current ? "true" : undefined}
      className={cn(
        "min-w-0 space-y-2 rounded-xl border bg-card p-card text-card-foreground shadow-raised transition-shadow data-[current=true]:shadow-floating data-[current=true]:ring-2 data-[current=true]:ring-primary",
        className,
      )}
      {...props}
    >
      {badges ? <div className="flex flex-wrap items-center gap-2">{badges}</div> : null}
      <div className="flex min-w-0 items-start gap-2">
        {leading ? <span aria-hidden="true" className="mt-0.5 shrink-0">{leading}</span> : null}
        <Heading className="min-w-0 text-card-title font-semibold [overflow-wrap:anywhere]">{title}</Heading>
      </div>
      {meta ? (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-support text-muted-foreground">{meta}</p>
      ) : null}
      {description ? <p className="line-clamp-2 text-body-sm">{description}</p> : null}
      {children}
      {actions ? <div className="flex flex-wrap gap-2 pt-1">{actions}</div> : null}
    </article>
  )
}

export { CompactCard }
