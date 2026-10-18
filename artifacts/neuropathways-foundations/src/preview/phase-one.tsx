import { useState, type ReactNode } from 'react';
import {
  BookOpen,
  CalendarCheck,
  Clock,
  FileText,
  LifeBuoy,
  ShieldAlert,
  Sparkles,
  Target,
  UserRound,
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { CompactCard } from '../components/ui/compact-card';
import { Disclosure } from '../components/ui/disclosure';
import { MenuRow } from '../components/ui/menu-row';
import { PageHeader } from '../components/ui/page-header';
import { Spinner } from '../components/ui/spinner';
import { StatusBadge } from '../components/ui/status-badge';
import { Surface } from '../components/ui/surface';

function Example({
  n,
  title,
  note,
  children,
}: {
  n: number;
  title: string;
  note: string;
  children: ReactNode;
}) {
  return (
    <section
      aria-labelledby={`example-${n}`}
      className="min-w-0 space-y-related"
      data-testid={`example-${n}`}
    >
      <div className="min-w-0">
        <h3 id={`example-${n}`} className="text-card-title font-semibold">
          {n}. {title}
        </h3>
        <p className="text-support text-muted-foreground">{note}</p>
      </div>
      {children}
    </section>
  );
}

function PageHeaderExample() {
  return (
    <Surface variant="separated">
      <PageHeader
        as="h2"
        context={
          <span className="inline-flex items-center gap-1.5">
            <UserRound aria-hidden="true" className="size-4" /> Sample child
          </span>
        }
        title="Practice"
        description="Short activities to try together. Sample text for layout only."
        actions={<Button variant="outline">Change child</Button>}
      />
    </Surface>
  );
}

function PrimaryActionExample() {
  const [loading, setLoading] = useState(false);
  return (
    <Surface variant="open" className="space-y-related">
      <div className="flex flex-wrap gap-2">
        <Button
          onClick={() => setLoading((v) => !v)}
          aria-busy={loading}
          data-testid="button-primary-example"
        >
          {loading ? <Spinner aria-hidden="true" /> : null}
          {loading ? 'Loading (preview)' : 'Start activity'}
        </Button>
        <Button variant="outline">Save for later</Button>
        <Button variant="ghost">Not now</Button>
        <Button disabled>Unavailable</Button>
      </div>
      <p className="text-support text-muted-foreground">
        One filled brand-blue action per region. Pressing the first button
        toggles its loading state locally; nothing is sent anywhere.
      </p>
    </Surface>
  );
}

function ActivityCardExample() {
  const [current, setCurrent] = useState(false);
  const [saved, setSaved] = useState(false);
  return (
    <CompactCard
      headingLevel="h4"
      current={current}
      data-testid="card-activity-example"
      badges={
        <>
          <StatusBadge tone="info">Sample source label</StatusBadge>
          {current ? <StatusBadge tone="support">Current focus</StatusBadge> : null}
        </>
      }
      title="Example activity title"
      meta={
        <>
          <span className="inline-flex items-center gap-1">
            <Sparkles aria-hidden="true" className="size-3.5" /> Skill area
          </span>
          <span className="inline-flex items-center gap-1">
            <Clock aria-hidden="true" className="size-3.5" /> About 10 min
          </span>
        </>
      }
      description="A one or two line description previews the activity. Placeholder copy, not activity guidance."
      actions={
        <>
          <Button onClick={() => setCurrent((v) => !v)} aria-pressed={current}>
            {current ? 'Leave focus' : 'Start'}
          </Button>
          <Button variant="outline" onClick={() => setSaved((v) => !v)} aria-pressed={saved}>
            {saved ? 'Marked (preview)' : 'Save for later'}
          </Button>
        </>
      }
    />
  );
}

function GoalCardExample() {
  return (
    <CompactCard
      headingLevel="h4"
      data-testid="card-goal-example"
      leading={<Target className="size-5 text-chart-2" />}
      badges={<StatusBadge tone="outline">Sample source: care team</StatusBadge>}
      title="Example goal title"
    >
      <dl className="grid gap-list sm:grid-cols-2">
        <div className="min-w-0 rounded-md bg-muted p-3">
          <dt className="text-support-sm font-semibold text-muted-foreground">
            Participation (your observations)
          </dt>
          <dd className="text-body-sm">Practised on 3 days this week (sample)</dd>
        </div>
        <div className="min-w-0 rounded-md border p-3">
          <dt className="text-support-sm font-semibold text-muted-foreground">Clinical progress</dt>
          <dd className="text-body-sm">Not yet reviewed by a clinician (sample)</dd>
        </div>
      </dl>
      <p className="text-support text-muted-foreground">
        Logged practice is not clinical progress. Progress is only shown when a
        clinician records it; no percentage is calculated.
      </p>
      <Disclosure title="Milestones and details" hint="Optional">
        <p>Secondary details, milestones and authorised actions appear here.</p>
      </Disclosure>
    </CompactCard>
  );
}

const MENU = [
  { id: 'practice', label: 'Practice', icon: <BookOpen />, description: 'Activities' },
  { id: 'goals', label: 'Goals', icon: <Target />, description: 'Goals and milestones' },
  { id: 'routines', label: 'Routines', icon: <CalendarCheck /> },
  { id: 'documents', label: 'Documents', icon: <FileText />, disabled: true, description: 'Disabled state' },
];

function MenuRowExample() {
  const [current, setCurrent] = useState('practice');
  return (
    <Surface variant="separated" className="p-2 sm:p-2">
      <nav aria-label="Menu row example (not real navigation)" className="grid gap-1">
        {MENU.map((row) => (
          <MenuRow
            key={row.id}
            icon={row.icon}
            label={row.label}
            description={row.description}
            current={current === row.id}
            disabled={row.disabled}
            onClick={() => setCurrent(row.id)}
            data-testid={`row-menu-${row.id}`}
          />
        ))}
      </nav>
    </Surface>
  );
}

function SupportCardExample() {
  const [pressed, setPressed] = useState(false);
  return (
    <Surface
      as="aside"
      variant="floating"
      tone="urgent"
      aria-labelledby="support-example-title"
      className="space-y-related"
      data-testid="card-support-example"
    >
      <div className="flex items-start gap-3">
        <LifeBuoy aria-hidden="true" className="mt-0.5 size-6 shrink-0 text-destructive" />
        <div className="min-w-0">
          <h4 id="support-example-title" className="text-card-title font-semibold">
            Need help right now?
          </h4>
          <p className="text-body-sm text-muted-foreground">
            Sample wording. The real flow and safety content are unchanged.
          </p>
        </div>
      </div>
      <p className="flex items-start gap-2 rounded-md bg-destructive/10 p-3 text-body-sm font-semibold">
        <ShieldAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-destructive" />
        Safety information always stays visible here, never inside an expandable section.
      </p>
      <Button
        variant="destructive"
        className="w-full sm:w-auto"
        onClick={() => setPressed(true)}
      >
        Help Now
      </Button>
      {pressed ? (
        <p role="status" className="text-support text-muted-foreground">
          Preview only: in the app this button opens the existing Help Now flow.
        </p>
      ) : null}
    </Surface>
  );
}

function StatusBadgeExample() {
  return (
    <Surface variant="open" className="flex flex-wrap gap-2">
      <StatusBadge tone="neutral">Draft</StatusBadge>
      <StatusBadge tone="info">Family added</StatusBadge>
      <StatusBadge tone="support">Reviewed</StatusBadge>
      <StatusBadge tone="outline">Not yet reviewed</StatusBadge>
      <StatusBadge tone="urgent" icon={<ShieldAlert />}>
        Needs attention
      </StatusBadge>
    </Surface>
  );
}

function DisclosureExample() {
  return (
    <Surface variant="open" className="space-y-related">
      <Disclosure title="Why this helps" hint="Optional background">
        <p>
          Optional explanation text. Only non-urgent explanations and secondary
          metadata may be collapsed.
        </p>
      </Disclosure>
      <Disclosure title="Sources" hint="Collapsed by default" defaultOpen>
        <p>Expanded state example with secondary reference information.</p>
      </Disclosure>
      <Disclosure title="Unavailable details" hint="Disabled state" disabled>
        <p>Not shown.</p>
      </Disclosure>
    </Surface>
  );
}

export function PhaseOneExamples() {
  return (
    <div className="space-y-section">
      <p
        role="note"
        className="flex items-start gap-2 rounded-md bg-accent p-3 text-support text-accent-foreground"
      >
        All sample content is illustrative. It is not clinical advice, real
        records or guidance for any child, and no action here reaches a server.
      </p>
      <div className="grid gap-section lg:grid-cols-2">
        <Example n={1} title="Page header" note="One 26px title, child context and a concise subtitle.">
          <PageHeaderExample />
        </Example>
        <Example n={2} title="Primary action" note="44px controls; primary, secondary, quiet, loading and disabled.">
          <PrimaryActionExample />
        </Example>
        <Example n={3} title="Compact activity card" note="Title, skill, duration, two-line preview. Start shows current-focus elevation.">
          <ActivityCardExample />
        </Example>
        <Example n={4} title="Goal card" note="Participation is kept separate from clinical progress.">
          <GoalCardExample />
        </Example>
        <Example n={5} title="Menu row" note="Icon, label, current and disabled states. Local state only.">
          <MenuRowExample />
        </Example>
        <Example n={6} title="Floating support card" note="The one elevated surface, with urgent red reserved for support.">
          <SupportCardExample />
        </Example>
        <Example n={7} title="Status badge" note="Text-first labels; color never carries meaning alone.">
          <StatusBadgeExample />
        </Example>
        <Example n={8} title="Expandable non-urgent section" note="Collapsed, expanded and disabled. Never for safety content.">
          <DisclosureExample />
        </Example>
      </div>
    </div>
  );
}
