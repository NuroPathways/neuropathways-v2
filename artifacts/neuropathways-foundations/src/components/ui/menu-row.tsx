import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { ChevronRight } from "lucide-react"

import { cn } from "../../lib/utils"

/**
 * A navigation/menu row: icon, label, optional description and chevron.
 * Renders a <button> by default; pass `asChild` to wrap a consumer's link so
 * destinations stay owned by the app. `current` sets aria-current="page".
 */
export interface MenuRowProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon?: React.ReactNode
  label: React.ReactNode
  description?: React.ReactNode
  current?: boolean
  showChevron?: boolean
  asChild?: boolean
}

const MenuRow = React.forwardRef<HTMLButtonElement, MenuRowProps>(
  (
    { icon, label, description, current, showChevron = true, asChild, className, children, ...props },
    ref,
  ) => {
    const Comp = asChild ? Slot : "button"
    const content = (
      <>
        {icon ? (
          <span
            aria-hidden="true"
            className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-foreground group-aria-[current=page]:bg-primary-foreground/15 group-aria-[current=page]:text-primary-foreground [&_svg]:size-[18px]"
          >
            {icon}
          </span>
        ) : null}
        <span className="min-w-0 flex-1">
          <span className="block text-body-sm font-semibold [overflow-wrap:anywhere]">{label}</span>
          {description ? (
            <span className="block text-support-sm text-muted-foreground group-aria-[current=page]:text-primary-foreground/90">
              {description}
            </span>
          ) : null}
        </span>
        {showChevron ? (
          <ChevronRight aria-hidden="true" className="size-4 shrink-0 opacity-60" />
        ) : null}
      </>
    )
    return (
      <Comp
        ref={ref}
        type={asChild ? undefined : "button"}
        aria-current={current ? "page" : undefined}
        className={cn(
          "group flex min-h-control w-full min-w-0 items-center gap-3 rounded-md px-3 py-2 text-left text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 aria-[current=page]:bg-primary aria-[current=page]:text-primary-foreground",
          className,
        )}
        {...props}
      >
        {asChild ? children : content}
      </Comp>
    )
  },
)
MenuRow.displayName = "MenuRow"

export { MenuRow }
