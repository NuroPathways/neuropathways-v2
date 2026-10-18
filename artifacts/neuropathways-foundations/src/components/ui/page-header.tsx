import * as React from "react"

import { cn } from "../../lib/utils"

/**
 * One page title (26px), optional context line and concise description, plus
 * optional contextual actions. Product-agnostic: pass the content in.
 */
export interface PageHeaderProps extends Omit<React.HTMLAttributes<HTMLElement>, "title"> {
  title: React.ReactNode
  context?: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
  /** Heading element; use h2 when the page already has an h1. */
  as?: "h1" | "h2"
}

function PageHeader({
  title,
  context,
  description,
  actions,
  as: Heading = "h1",
  className,
  ...props
}: PageHeaderProps) {
  return (
    <header
      className={cn(
        "flex min-w-0 flex-col gap-related sm:flex-row sm:items-end sm:justify-between",
        className,
      )}
      {...props}
    >
      <div className="min-w-0 space-y-1">
        {context ? (
          <p className="text-support font-medium text-muted-foreground [overflow-wrap:anywhere]">
            {context}
          </p>
        ) : null}
        <Heading className="text-page-title font-bold tracking-tight text-foreground [overflow-wrap:anywhere]">
          {title}
        </Heading>
        {description ? (
          <p className="max-w-prose text-body-sm text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex min-w-0 flex-wrap gap-2 sm:shrink-0">{actions}</div>
      ) : null}
    </header>
  )
}

/** Section title (20px) with optional supporting text and secondary action. */
export interface SectionHeadingProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  title: React.ReactNode
  description?: React.ReactNode
  action?: React.ReactNode
  as?: "h2" | "h3"
}

function SectionHeading({
  title,
  description,
  action,
  as: Heading = "h2",
  className,
  ...props
}: SectionHeadingProps) {
  return (
    <div
      className={cn("flex min-w-0 flex-wrap items-end justify-between gap-2", className)}
      {...props}
    >
      <div className="min-w-0">
        <Heading className="text-section-title font-semibold text-foreground">
          {title}
        </Heading>
        {description ? (
          <p className="text-support text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {action}
    </div>
  )
}

export { PageHeader, SectionHeading }
