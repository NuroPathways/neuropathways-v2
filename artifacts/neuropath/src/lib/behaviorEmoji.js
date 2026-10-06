const BEHAVIOR_EMOJI_RULES = [
  [/\b(elopement|running|bolting|wandering|leaving)\b/i, "🏃"],
  [/\b(communication|communicating|speech|language|requesting)\b/i, "💬"],
  [/\b(self[- ]?injury|self[- ]?harm|safety|crisis)\b/i, "🛡️"],
  [/\b(aggression|hitting|biting|kicking|pushing)\b/i, "✋"],
  [/\b(transition|switching|changes|flexibility)\b/i, "🔄"],
  [/\b(sensory|overload|noise|sound)\b/i, "🎧"],
  [/\b(sleep|bedtime|night)\b/i, "🌙"],
  [/\b(anxiety|worry|fear|calm)\b/i, "🌿"],
  [/\b(attention|focus|waiting|work|task)\b/i, "🎯"],
  [/\b(social|sharing|peer|play|friends)\b/i, "🤝"],
  [/\b(refusal|refusing|noncompliance|cooperation)\b/i, "🧩"],
];

export function behaviorEmoji(behaviorKey, behaviorName) {
  const source = `${behaviorKey || ""} ${behaviorName || ""}`.replace(/[_-]+/g, " ");
  return BEHAVIOR_EMOJI_RULES.find(([pattern]) => pattern.test(source))?.[1] || "🧩";
}
