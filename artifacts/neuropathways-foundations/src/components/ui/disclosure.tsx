import * as React from "react"
import { ChevronDown } from "lucide-react"

import { cn } from "../../lib/utils"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "./collapsible"

/**
 * Non-critical disclosure for optional explanations and secondary metadata.
 * NEVER place emergency, escalation, or critical safety instructions inside;
 * those must always remain visible outside this component.
 */
export interface DisclosureProps
  extends Omit<React.ComponentPropsWithoutRef<typeof Collapsible>, "title"> {
  title: React.ReactNode
  hint?: React.ReactNode
}

function Disclosure({ title, hint, className, children, ...props }: DisclosureProps) {
  return (
    <Collapsible className={cn("min-w-0 border-y", className)} {...props}>
      <CollapsibleTrigger className="group flex min-h-control w-full min-w-0 items-center justify-between gap-3 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50">
        <span className="min-w-0">
          <span className="block text-body-sm font-semibold text-foreground">{title}</span>
          {hint ? (
            <span className="block text-support-sm text-muted-foreground">{hint}</span>
          ) : null}
        </span>
        <ChevronDown
          aria-hidden="true"
          className="size-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180"
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="pb-3 text-body-sm text-foreground">
        {children}
      </CollapsibleContent>
    </Collapsible>
  )
}

export { Disclosure }
