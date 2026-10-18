import { useState } from 'react';
import { BookOpen, Clock, Settings, ShieldAlert, Target } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { CompactCard } from '../../components/ui/compact-card';
import { Disclosure } from '../../components/ui/disclosure';
import { MenuRow } from '../../components/ui/menu-row';
import { PageHeader, SectionHeading } from '../../components/ui/page-header';
import { StatusBadge } from '../../components/ui/status-badge';
import { Surface } from '../../components/ui/surface';
import { Guidelines, Stack } from '../parts';

const SAMPLE = 'Illustrative sample content only.';

export function PageHeaderDemo() {
  return (
    <div className="space-y-section">
      <Stack label="Page header with context and action">
        <PageHeader
          as="h2"
          context="Sample child"
          title="Page title"
          description={`Concise subtitle. ${SAMPLE}`}
          actions={<Button variant="outline">Secondary action</Button>}
        />
      </Stack>
      <Stack label="Long title wraps without overflow">
        <PageHeader as="h2" title="A considerably longer page title that wraps on narrow screens" />
      </Stack>
      <Stack label="Section heading">
        <SectionHeading as="h3" title="Section title" description="Supporting text" action={<Button variant="ghost" size="sm">View all</Button>} />
      </Stack>
      <Guidelines
        items={[
          { kind: 'do', text: 'Use one page title with the selected child and a concise subtitle.' },
          { kind: 'dont', text: 'Repeat the same introduction in a tinted panel below the header.' },
        ]}
      />
    </div>
  );
}

export function StatusBadgeDemo() {
  return (
    <div className="space-y-section">
      <Stack label="Tones">
        <div className="flex flex-wrap gap-2">
          <StatusBadge tone="neutral">Neutral</StatusBadge>
          <StatusBadge tone="info">Info</StatusBadge>
          <StatusBadge tone="support">Support</StatusBadge>
          <StatusBadge tone="outline">Outline</StatusBadge>
          <StatusBadge tone="urgent" icon={<ShieldAlert />}>Urgent</StatusBadge>
        </div>
      </Stack>
      <Guidelines
        items={[
          { kind: 'do', text: 'Always state the status or source in words; color supports the text.' },
          { kind: 'dont', text: 'Use the urgent tone for anything other than immediate support or safety.' },
        ]}
      />
    </div>
  );
}

export function MenuRowDemo() {
  const [current, setCurrent] = useState('a');
  return (
    <div className="space-y-section">
      <Stack label="States (local preview state, not real destinations)">
        <div className="grid max-w-md gap-1 rounded-lg border bg-card p-2">
          <MenuRow icon={<BookOpen />} label="Default row" description="With description" current={current === 'a'} onClick={() => setCurrent('a')} />
          <MenuRow icon={<Target />} label="Another row" current={current === 'b'} onClick={() => setCurrent('b')} />
          <MenuRow icon={<Settings />} label="Without chevron" showChevron={false} current={current === 'c'} onClick={() => setCurrent('c')} />
          <MenuRow icon={<Settings />} label="Disabled row" disabled />
        </div>
      </Stack>
      <Guidelines
        items={[
          { kind: 'do', text: 'Use one meaningful icon per row and keep every existing destination.' },
          { kind: 'dont', text: 'Add icons beside every line of body text.' },
        ]}
      />
    </div>
  );
}

export function SurfaceDemo() {
  return (
    <div className="space-y-section">
      <Stack label="Open section">
        <Surface variant="open">
          <SectionHeading as="h3" title="Open section" description="Headings and short descriptions need no container." />
        </Surface>
      </Stack>
      <Stack label="Lightly separated group">
        <Surface variant="separated">Lists and related information.</Surface>
      </Stack>
      <Stack label="Floating (scarce: support and current focus)">
        <Surface variant="floating">Focused content.</Surface>
        <Surface variant="floating" tone="urgent">Urgent support surface.</Surface>
      </Stack>
      <Guidelines
        items={[
          { kind: 'do', text: 'Reserve floating elevation for Help Now, the current step or a featured activity.' },
          { kind: 'dont', text: 'Place cards inside cards or elevate every section.' },
        ]}
      />
    </div>
  );
}

export function CompactCardDemo() {
  const [current, setCurrent] = useState(false);
  return (
    <div className="space-y-section">
      <div className="grid gap-related md:grid-cols-2">
        <CompactCard
          title="Card title"
          badges={<StatusBadge tone="info">Source label</StatusBadge>}
          meta={<span className="inline-flex items-center gap-1"><Clock aria-hidden="true" className="size-3.5" /> Meta</span>}
          description={`Two-line clamped description. ${SAMPLE}`}
          current={current}
          actions={<Button aria-pressed={current} onClick={() => setCurrent((v) => !v)}>{current ? 'Clear focus' : 'Set as current focus'}</Button>}
        />
        <CompactCard title="Minimal card" description="Title and description only." />
      </div>
    </div>
  );
}

export function DisclosureDemo() {
  return (
    <div className="space-y-section">
      <Stack label="Collapsed, expanded and disabled">
        <div className="max-w-xl">
          <Disclosure title="Collapsed" hint="Optional explanation"><p>{SAMPLE}</p></Disclosure>
          <Disclosure title="Expanded" defaultOpen><p>{SAMPLE}</p></Disclosure>
          <Disclosure title="Disabled" disabled><p>Hidden.</p></Disclosure>
        </div>
      </Stack>
      <Guidelines
        items={[
          { kind: 'do', text: 'Collapse only optional explanations and secondary metadata.' },
          { kind: 'dont', text: 'Hide emergency, escalation or critical safety instructions in a disclosure.' },
        ]}
      />
    </div>
  );
}
