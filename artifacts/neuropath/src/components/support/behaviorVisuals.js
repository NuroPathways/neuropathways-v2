import { Activity, AlertTriangle, CloudLightning, Footprints, Hand, Home } from "lucide-react";

const PALETTE = [
  { color: "red", tone: "behavior-red", classes: "bg-red-50 border-red-200 text-red-800 dark:bg-red-950/30 dark:border-red-800 dark:text-red-100", iconClasses: "bg-red-100 text-red-700 dark:bg-red-900/60 dark:text-red-200", Icon: Activity },
  { color: "orange", tone: "behavior-orange", classes: "bg-orange-50 border-orange-200 text-orange-800 dark:bg-orange-950/30 dark:border-orange-800 dark:text-orange-100", iconClasses: "bg-orange-100 text-orange-700 dark:bg-orange-900/60 dark:text-orange-200", Icon: AlertTriangle },
  { color: "yellow", tone: "behavior-yellow", classes: "bg-yellow-50 border-yellow-200 text-yellow-900 dark:bg-yellow-950/30 dark:border-yellow-800 dark:text-yellow-100", iconClasses: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/60 dark:text-yellow-200", Icon: Activity },
  { color: "purple", tone: "behavior-purple", classes: "bg-purple-50 border-purple-200 text-purple-800 dark:bg-purple-950/30 dark:border-purple-800 dark:text-purple-100", iconClasses: "bg-purple-100 text-purple-700 dark:bg-purple-900/60 dark:text-purple-200", Icon: Home },
  { color: "blue", tone: "behavior-blue", classes: "bg-blue-50 border-blue-200 text-blue-800 dark:bg-blue-950/30 dark:border-blue-800 dark:text-blue-100", iconClasses: "bg-blue-100 text-blue-700 dark:bg-blue-900/60 dark:text-blue-200", Icon: CloudLightning },
  { color: "teal", tone: "behavior-teal", classes: "bg-teal-50 border-teal-200 text-teal-800 dark:bg-teal-950/30 dark:border-teal-800 dark:text-teal-100", iconClasses: "bg-teal-100 text-teal-700 dark:bg-teal-900/60 dark:text-teal-200", Icon: Activity },
  { color: "pink", tone: "behavior-pink", classes: "bg-pink-50 border-pink-200 text-pink-800 dark:bg-pink-950/30 dark:border-pink-800 dark:text-pink-100", iconClasses: "bg-pink-100 text-pink-700 dark:bg-pink-900/60 dark:text-pink-200", Icon: Activity },
  { color: "indigo", tone: "behavior-indigo", classes: "bg-indigo-50 border-indigo-200 text-indigo-800 dark:bg-indigo-950/30 dark:border-indigo-800 dark:text-indigo-100", iconClasses: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/60 dark:text-indigo-200", Icon: Activity },
];

function nameOf(behavior) {
  return String(behavior?.name || behavior?.behavior_name || behavior?.behaviorName || "").toLowerCase();
}

function configuredColorOf(behavior) {
  const configured = String(
    behavior?.visualColor
    ?? behavior?.visual_color
    ?? behavior?.colorTone
    ?? behavior?.color_tone
    ?? behavior?.colorKey
    ?? behavior?.color_key
    ?? behavior?.color
    ?? "",
  ).toLowerCase();
  return PALETTE.find(({ color }) => new RegExp(`\\b${color}\\b`).test(configured)) || null;
}

export function getBehaviorAppearance(behavior, index = 0) {
  const name = nameOf(behavior);
  if (/\bphysical aggression\b|\baggression\b/.test(name)) return { ...PALETTE[0], Icon: Hand };
  if (/\bself[- ]?injury\b|\bself[- ]?harm\b/.test(name)) return { ...PALETTE[1], Icon: AlertTriangle };
  if (/\belopement\b|\bwandering\b|\brunning away\b/.test(name)) return { ...PALETTE[2], Icon: Footprints };
  if (/\bproperty destruction\b|\bproperty damage\b/.test(name)) return { ...PALETTE[3], Icon: Home };
  if (/\btantrums?\b|\bmeltdowns?\b/.test(name)) return { ...PALETTE[4], Icon: CloudLightning };
  return configuredColorOf(behavior) || PALETTE[Math.abs(Number(index) || 0) % PALETTE.length];
}
