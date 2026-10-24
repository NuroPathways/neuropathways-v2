type SupportField = {
  field: string;
  labels: string;
};

const SUPPORT_FIELDS: SupportField[] = [
  { field: "do_this_right_now", labels: "try now|do this right now|first step|immediate steps?" },
  { field: "interventions", labels: "strategies|strategy steps?|support steps?" },
  { field: "if_it_escalates", labels: "if it escalates|if the voice rises|de-escalation steps?|deescalation steps?" },
  { field: "avoid", labels: "things to avoid|avoid" },
  { field: "prevention_tips", labels: "prevention ideas|prevention tips?|prevention" },
  { field: "reinforcement_rewards", labels: "encouragement|reinforcement|praise" },
  { field: "practice_a_helpful_skill", labels: "practice a helpful skill|practice skill|helpful skill" },
  { field: "practice_skill_steps", labels: "practice steps|steps" },
  { field: "what_to_notice", labels: "what to notice|notice|monitor" },
  { field: "what_may_be_happening", labels: "what may be happening|possible explanation" },
];

type Marker = { start: number; end: number; field: string };

function markersFor(source: string): Marker[] {
  const markers: Marker[] = [];
  for (const { field, labels } of SUPPORT_FIELDS) {
    const expression = new RegExp(`\\b(${labels})\\s*:\\s*`, "gi");
    for (const match of source.matchAll(expression)) {
      const index = match.index ?? -1;
      if (index >= 0) markers.push({ start: index, end: index + match[0].length, field });
    }
  }

  // "Avoid ..." is also commonly written as a sentence heading without a colon.
  const avoidSentence = /(?:^|[\n.!?]\s*)(things to avoid|avoid)\b\s+(?!:)/gi;
  for (const match of source.matchAll(avoidSentence)) {
    const index = match.index ?? -1;
    if (index >= 0) markers.push({ start: index, end: index + match[0].length, field: "avoid" });
  }

  // Some sources write the escalation condition as prose rather than a heading.
  const conditional = /\bif\s+(?:it|the voice|the behavior|things)\s+(?:rises|escalates|gets worse)\s*,\s*/gi;
  for (const match of source.matchAll(conditional)) {
    const index = match.index ?? -1;
    if (index >= 0) markers.push({ start: index, end: index + match[0].length, field: "if_it_escalates" });
  }

  return markers.sort((a, b) => a.start - b.start || a.end - b.end);
}

function cleanExcerpt(value: string): string {
  return value
    .replace(/^[\s:;,.–—-]+|[\s;]+$/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 1200);
}

/**
 * Backfills only missing support fields from explicit, labeled source sections.
 * It is intentionally limited to a single identified behavior so that content
 * from one behavior cannot be assigned to another.
 */
export function fillExplicitlyLabeledSupportFields<T extends Record<string, unknown>>(
  behavior: T,
  sourceTexts: string[],
): T {
  const source = sourceTexts.filter((text) => typeof text === "string" && text.trim()).join("\n");
  if (!source) return behavior;

  const markers = markersFor(source);
  const recovered: Record<string, string[]> = {};
  for (let index = 0; index < markers.length; index += 1) {
    const marker = markers[index];
    const next = markers[index + 1];
    const rawExcerpt = source.slice(marker.end, next?.start ?? source.length);
    const precedingSentenceEnd = next && /[.!?]/.test(source[next.start] || "") && !/[.!?]\s*$/.test(rawExcerpt)
      ? source[next.start]
      : "";
    const excerpt = cleanExcerpt(rawExcerpt + precedingSentenceEnd);
    if (!excerpt) continue;
    (recovered[marker.field] ??= []).push(excerpt);
  }

  const result: Record<string, unknown> = { ...behavior };
  for (const [field, excerpts] of Object.entries(recovered)) {
    const current = result[field];
    const hasCurrent = Array.isArray(current)
      ? current.some((item) => typeof item === "string" && item.trim())
      : typeof current === "string" && current.trim().length > 0;
    if (hasCurrent) continue;
    if (field === "practice_a_helpful_skill") {
      result[field] = excerpts[0];
    } else {
      result[field] = excerpts;
    }
  }
  return result as T;
}
