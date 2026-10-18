import logoUrl from '../../docs/references/logos/neuro-pathways-mark.png';
import { PhaseOneExamples } from './phase-one';

const CORE_SWATCHES = [
  { name: 'Primary (brand blue #496fa4)', className: 'bg-primary' },
  { name: 'Secondary', className: 'border bg-secondary' },
  { name: 'Accent (sea-glass)', className: 'border bg-accent' },
  { name: 'Teal (chart-2)', className: 'bg-chart-2' },
] as const;

const SUPPORTING_SWATCHES = [
  { name: 'Background', className: 'border bg-background' },
  { name: 'Foreground', className: 'bg-foreground' },
  { name: 'Muted', className: 'bg-muted' },
  { name: 'Urgent (destructive)', className: 'bg-destructive' },
  { name: 'Muted text', className: 'bg-muted-foreground' },
  { name: 'Border', className: 'bg-border' },
] as const;

const TYPE_SCALE = [
  { label: 'Page title 26px', className: 'font-display text-page-title font-bold' },
  { label: 'Section 20px', className: 'font-display text-section-title font-semibold' },
  { label: 'Card title 17px', className: 'font-display text-card-title font-semibold' },
  { label: 'Body 16px', className: 'text-body' },
  { label: 'Body 15px', className: 'text-body-sm' },
  { label: 'Support 14px', className: 'text-support text-muted-foreground' },
  { label: 'Support 13px', className: 'text-support-sm text-muted-foreground' },
] as const;

const SPACING_SCALE = [
  { label: 'List 8px', className: 'w-list' },
  { label: 'Related 12px', className: 'w-related' },
  { label: 'Related 16px', className: 'w-related-lg' },
  { label: 'Card 16px', className: 'w-card' },
  { label: 'Gutter 20px', className: 'w-gutter' },
  { label: 'Section 32px', className: 'w-section' },
  { label: 'Control 44px', className: 'w-control' },
] as const;

function Swatch({
  name,
  className,
}: {
  name: string;
  className: string;
}) {
  return (
    <div className="space-y-2">
      <div className={`h-16 rounded-lg ${className}`} />
      <p className="text-sm font-medium">{name}</p>
    </div>
  );
}

export function OverviewPage() {
  return (
    <div className="space-y-section">
      <PhaseOneExamples />
      <section className="space-y-related border-t pt-section">
        <h2 className="text-section-title font-semibold">Palette in use</h2>
        <p className="text-support text-muted-foreground">
          Existing NeuroPathways colors only: brand blue for primary actions,
          teal and sea-glass neutrals for support surfaces, red reserved for
          urgent help.
        </p>
        <div className="grid grid-cols-2 gap-related sm:grid-cols-4">
          <Swatch name="Brand blue (primary)" className="bg-primary" />
          <Swatch name="Teal (chart-2)" className="bg-chart-2" />
          <Swatch name="Sea-glass (accent)" className="border bg-accent" />
          <Swatch name="Urgent red (destructive)" className="bg-destructive" />
        </div>
      </section>
    </div>
  );
}

export function BrandPage() {
  return (
    <div className="space-y-section">
      <section className="flex flex-col items-start gap-related sm:flex-row sm:items-center">
        <img
          src={logoUrl}
          alt="NeuroPathways logo mark"
          width={160}
          height={160}
          className="size-40 rounded-xl border bg-card p-3"
        />
        <div className="min-w-0 space-y-1">
          <h2 className="text-section-title font-semibold">Logo mark</h2>
          <p className="text-body-sm text-muted-foreground">
            The genuine NeuroPathways PNG (512 x 512), copied unchanged from the
            current web app. Never redraw, recolor or crop it.
          </p>
        </div>
      </section>
      <section className="grid gap-related sm:grid-cols-2">
        <div className="flex items-center justify-center rounded-xl border bg-background p-card-lg">
          <img src={logoUrl} alt="" className="size-16" />
        </div>
        <div className="flex items-center justify-center rounded-xl border bg-card p-card-lg">
          <img src={logoUrl} alt="" className="size-16" />
        </div>
      </section>
    </div>
  );
}

export function ColorsPage() {
  return (
    <div className="space-y-8 rounded-xl border bg-card p-6 text-card-foreground">
      <section className="space-y-4">
        <div>
          <h2 className="font-semibold">Brand colors</h2>
          <p className="text-sm text-muted-foreground">
            The core roles used for emphasis, supporting actions, and accents.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {CORE_SWATCHES.map((swatch) => (
            <Swatch key={swatch.name} {...swatch} />
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="font-semibold">Semantic and surface colors</h2>
          <p className="text-sm text-muted-foreground">
            Roles for text, backgrounds, borders, muted content, and danger.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {SUPPORTING_SWATCHES.map((swatch) => (
            <Swatch key={swatch.name} {...swatch} />
          ))}
        </div>
      </section>
    </div>
  );
}

export function FontsPage() {
  return (
    <div className="space-y-8 rounded-xl border bg-card p-6 text-card-foreground">
      <section>
        <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Font family
        </h2>
        <p className="mt-4 font-display text-page-title font-bold">Manrope headings</p>
        <p className="mt-2 text-body">DM Sans body and interface text, with Inter as legacy fallback.</p>
        <p className="mt-2 text-sm text-muted-foreground">
          The token font family is applied across this entire preview.
        </p>
      </section>

      <section className="space-y-4 border-t pt-6">
        <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Type scale
        </h2>
        {TYPE_SCALE.map((entry) => (
          <div key={entry.label} className="grid gap-2 sm:grid-cols-[140px_1fr]">
            <span className="pt-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {entry.label}
            </span>
            <p className={entry.className}>Build products people understand.</p>
          </div>
        ))}
      </section>
    </div>
  );
}

export function LayoutPage() {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="rounded-xl border bg-card p-6 text-card-foreground">
        <h2 className="font-semibold">Spacing</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          The spacing scale, derived from the base spacing token.
        </p>
        <div className="mt-6 space-y-4">
          {SPACING_SCALE.map((space) => (
            <div key={space.label} className="flex items-center gap-4">
              <span className="w-28 shrink-0 text-support-sm text-muted-foreground">
                {space.label}
              </span>
              <div className={`h-3 rounded-full bg-primary ${space.className}`} />
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-xl border bg-card p-6 text-card-foreground">
        <h2 className="font-semibold">Radius</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Corner treatments derive from the base radius token.
        </p>
        <div className="mt-6 grid grid-cols-2 gap-4">
          {[
            { label: 'Small', className: 'rounded-sm' },
            { label: 'Medium', className: 'rounded-md' },
            { label: 'Large', className: 'rounded-lg' },
            { label: 'Extra large', className: 'rounded-xl' },
          ].map((radius) => (
            <div
              key={radius.label}
              className={`flex h-24 items-end border bg-muted p-3 ${radius.className}`}
            >
              <span className="text-xs font-medium">{radius.label}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
