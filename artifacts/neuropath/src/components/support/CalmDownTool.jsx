import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, X, Wind, CheckCircle2 } from "lucide-react";

const GROUNDING_STEPS = [
  { num: "5", label: "Things you can SEE", icon: "👁️" },
  { num: "4", label: "Things you can TOUCH", icon: "✋" },
  { num: "3", label: "Things you can HEAR", icon: "👂" },
  { num: "2", label: "Things you can SMELL", icon: "👃" },
  { num: "1", label: "Thing you can TASTE", icon: "👅" },
];

const BREATHING_PHASES = [
  { label: "Breathe In", duration: 4000, scale: 1.4 },
  { label: "Hold", duration: 2000, scale: 1.4 },
  { label: "Breathe Out", duration: 6000, scale: 1 },
];

function BreathingAnimation({ active }) {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    if (!active) return;
    const timeout = setTimeout(() => {
      setPhase(p => (p + 1) % BREATHING_PHASES.length);
    }, BREATHING_PHASES[phase].duration);
    return () => clearTimeout(timeout);
  }, [phase, active]);

  const current = BREATHING_PHASES[phase];

  return (
    <div className="flex flex-col items-center py-6">
      <motion.div
        animate={{ scale: active ? current.scale : 1 }}
        transition={{ duration: current.duration / 1000, ease: "easeInOut" }}
        className="w-28 h-28 rounded-full bg-gradient-to-br from-teal-400 to-blue-400 flex items-center justify-center shadow-lg shadow-teal-200 mb-4"
      >
        <div className="w-20 h-20 rounded-full bg-white/30 flex items-center justify-center">
          <Wind className="w-8 h-8 text-white" />
        </div>
      </motion.div>
      {active && (
        <motion.div key={phase} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}>
          <p className="text-lg font-bold text-teal-700">{current.label}</p>
          <p className="text-sm text-teal-600 text-center mt-1">{current.duration / 1000} seconds</p>
        </motion.div>
      )}
    </div>
  );
}

export default function CalmDownTool({ child, profile, onBack, onDismiss, isIndividual }) {
  const [tab, setTab] = useState("breathing"); // "breathing" | "grounding" | "strategies"
  const [breathingActive, setBreathingActive] = useState(false);

  // Pull any calming strategies from the profile's behaviors or safety data
  const calmingStrategies = [];
  if (profile?.behaviors) {
    for (const b of profile.behaviors) {
      if (b.reinforcement_rewards) {
        for (const r of b.reinforcement_rewards) {
          if (!calmingStrategies.includes(r)) calmingStrategies.push(r);
        }
      }
    }
  }
  if (profile?.reinforcers) {
    for (const r of profile.reinforcers) {
      if (!calmingStrategies.includes(r)) calmingStrategies.push(r);
    }
  }

  const hasPersonalizedStrategies = calmingStrategies.length > 0;

  return (
    <div>
      <div className="sticky top-0 bg-teal-600 px-5 py-4 flex items-center gap-3 z-10">
        <button onClick={onBack} className="min-w-[40px] min-h-[40px] flex items-center justify-center text-white/80 hover:text-white rounded-xl hover:bg-white/10 transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2 flex-1">
          <Wind className="w-5 h-5 text-white" />
          <p className="font-bold text-white text-sm">Calm Down First</p>
        </div>
        <button onClick={onDismiss} className="min-w-[40px] min-h-[40px] flex items-center justify-center text-white/80 hover:text-white rounded-xl hover:bg-white/10 transition-colors">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="p-5">
        <p className="text-sm text-muted-foreground mb-4 text-center">Take a moment to settle before reading the plan. You've got this.</p>

        {/* Tab selector */}
        <div className="flex gap-2 mb-5 bg-muted rounded-xl p-1">
          {[
            { key: "breathing", label: "Breathing" },
            { key: "grounding", label: "Grounding" },
            ...(hasPersonalizedStrategies ? [{ key: "strategies", label: "Your Plan" }] : []),
          ].map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${tab === t.key ? "bg-background shadow-sm text-foreground" : "text-muted-foreground"}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <AnimatePresence mode="wait">
          {tab === "breathing" && (
            <motion.div key="breathing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <div className="bg-teal-50 border border-teal-200 rounded-2xl text-center overflow-hidden">
                <BreathingAnimation active={breathingActive} />
                <div className="px-5 pb-5">
                  <button
                    onClick={() => setBreathingActive(a => !a)}
                    className={`w-full py-3 rounded-xl font-semibold text-sm transition-colors ${breathingActive ? "bg-teal-600 text-white hover:bg-teal-700" : "bg-teal-100 text-teal-700 hover:bg-teal-200"}`}
                  >
                    {breathingActive ? "Pause Breathing Exercise" : "Start Breathing Exercise"}
                  </button>
                  <p className="text-xs text-teal-600 mt-2">4-2-6 breathing: in for 4, hold for 2, out for 6</p>
                </div>
              </div>
            </motion.div>
          )}

          {tab === "grounding" && (
            <motion.div key="grounding" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-3">
              <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4">
                <p className="text-sm font-semibold text-blue-800 mb-3 text-center">5-4-3-2-1 Grounding</p>
                <p className="text-xs text-blue-600 text-center mb-4">Name these things out loud or in your head</p>
                {GROUNDING_STEPS.map((step, i) => (
                  <div key={i} className="flex items-center gap-3 py-2.5 border-b border-blue-100 last:border-0">
                    <span className="text-2xl">{step.icon}</span>
                    <div>
                      <span className="font-bold text-blue-800 text-lg">{step.num}</span>
                      <span className="text-blue-700 text-sm ml-2">{step.label}</span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="bg-card border border-border rounded-xl p-4">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Co-Regulation Script</p>
                <p className="text-sm text-foreground leading-relaxed italic">
                  "I am safe right now. I can handle this moment. I have helped before and I will help again. I will take one small step at a time."
                </p>
              </div>
            </motion.div>
          )}

          {tab === "strategies" && (
            <motion.div key="strategies" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-3">
              <div className="bg-purple-50 border border-purple-200 rounded-2xl p-4">
                <p className="text-xs font-bold uppercase tracking-wider text-purple-700 mb-1">From {child?.child_name}'s Plan</p>
                <p className="text-xs text-purple-600 mb-3">These calming strategies come from the clinician's documents</p>
                {calmingStrategies.slice(0, 8).map((s, i) => (
                  <div key={i} className="flex items-start gap-2 py-1.5 border-b border-purple-100 last:border-0">
                    <CheckCircle2 className="w-4 h-4 text-purple-600 flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-purple-800">{s}</p>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}