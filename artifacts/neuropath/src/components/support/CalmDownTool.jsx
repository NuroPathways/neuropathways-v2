import { useState, useEffect, useId } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowLeft, X, Wind } from "lucide-react";

const GROUNDING_STEPS = [
  { num: "5", label: "Things you can SEE" },
  { num: "4", label: "Things you can TOUCH" },
  { num: "3", label: "Things you can HEAR" },
  { num: "2", label: "Things you can SMELL" },
  { num: "1", label: "Thing you can TASTE" },
];

const BREATHING_PHASES = [
  { label: "Breathe In", duration: 4000, scale: 1.4 },
  { label: "Hold", duration: 2000, scale: 1.4 },
  { label: "Breathe Out", duration: 6000, scale: 1 },
];

function BreathingAnimation({ active }) {
  const [phase, setPhase] = useState(0);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (!active) return;
    const timeout = setTimeout(() => {
      setPhase(p => (p + 1) % BREATHING_PHASES.length);
    }, BREATHING_PHASES[phase].duration);
    return () => clearTimeout(timeout);
  }, [phase, active]);

  const current = BREATHING_PHASES[phase];

  return (
    <div className="np-help-breath">
      <motion.div
        animate={{ scale: active && !reduceMotion ? current.scale : 1 }}
        transition={reduceMotion ? { duration: 0 } : { duration: current.duration / 1000, ease: "easeInOut" }}
        className="np-help-breath-circle"
        aria-hidden="true"
      >
        <Wind />
      </motion.div>
      {active && (
        <div aria-live="polite" data-testid="text-breathing-phase">
          <p className="np-help-breath-phase">{current.label}</p>
          <p className="np-help-muted">{current.duration / 1000} seconds</p>
        </div>
      )}
    </div>
  );
}

export default function CalmDownTool({ child, profile, onBack, onDismiss, isIndividual }) {
  const [tab, setTab] = useState("breathing"); // "breathing" | "grounding" | "strategies"
  const [breathingActive, setBreathingActive] = useState(false);
  const tabsId = useId();

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

  const tabs = [
    { key: "breathing", label: "Breathing" },
    { key: "grounding", label: "Grounding" },
    ...(hasPersonalizedStrategies ? [{ key: "strategies", label: "Your Plan" }] : []),
  ];

  return (
    <div>
      <div className="np-help-bar">
        <button type="button" onClick={onBack} aria-label="Back to support options" data-testid="button-back-support" className="np-help-icon-btn">
          <ArrowLeft aria-hidden="true" />
        </button>
        <div className="np-help-bar-title">
          <h2>Calm Down First</h2>
        </div>
        <button type="button" onClick={onDismiss} aria-label="Close support" data-testid="button-close-support" className="np-help-icon-btn">
          <X aria-hidden="true" />
        </button>
      </div>

      <div className="np-help-body">
        <p className="np-help-text">Take a moment to settle before reading the plan. You've got this.</p>

        <div className="np-help-group">
          <div className="np-help-tabs" role="tablist" aria-label="Calming tools">
            {tabs.map(t => (
              <button
                key={t.key}
                type="button"
                role="tab"
                id={`${tabsId}-${t.key}`}
                aria-controls={`${tabsId}-panel`}
                tabIndex={tab === t.key ? 0 : -1}
                aria-selected={tab === t.key}
                data-testid={`tab-calm-${t.key}`}
                onClick={() => setTab(t.key)}
                onKeyDown={(event) => {
                  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
                  event.preventDefault();
                  const index = tabs.findIndex((item) => item.key === t.key);
                  const nextIndex = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1
                    : (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
                  const next = tabs[nextIndex].key;
                  setTab(next);
                  event.currentTarget.parentElement.querySelector(`[data-testid="tab-calm-${next}"]`)?.focus();
                }}
              >
                {t.label}
              </button>
            ))}
          </div>

          {tab === "breathing" && (
            <div role="tabpanel" id={`${tabsId}-panel`} aria-labelledby={`${tabsId}-${tab}`} className="np-help-group">
              <BreathingAnimation active={breathingActive} />
              <button
                type="button"
                onClick={() => setBreathingActive(a => !a)}
                data-testid="button-toggle-breathing"
                data-variant={breathingActive ? undefined : "primary"}
                data-block="true"
                className="np-help-btn"
              >
                {breathingActive ? "Pause Breathing Exercise" : "Start Breathing Exercise"}
              </button>
              <p className="np-help-muted" style={{ textAlign: "center" }}>4-2-6 breathing: in for 4, hold for 2, out for 6</p>
            </div>
          )}

          {tab === "grounding" && (
            <div role="tabpanel" id={`${tabsId}-panel`} aria-labelledby={`${tabsId}-${tab}`} className="np-help-body" style={{ padding: 0 }}>
              <section className="np-help-group">
                <h3 className="np-help-label">5-4-3-2-1 Grounding</h3>
                <p className="np-help-muted">Name these things out loud or in your head</p>
                <ul className="np-help-grounding">
                  {GROUNDING_STEPS.map((step, i) => (
                    <li key={i}><strong>{step.num}</strong><span>{step.label}</span></li>
                  ))}
                </ul>
              </section>
              <section className="np-help-group">
                <h3 className="np-help-label">Co-Regulation Script</h3>
                <p className="np-help-quote">
                  "I am safe right now. I can handle this moment. I have helped before and I will help again. I will take one small step at a time."
                </p>
              </section>
            </div>
          )}

          {tab === "strategies" && (
            <div role="tabpanel" id={`${tabsId}-panel`} aria-labelledby={`${tabsId}-${tab}`} className="np-help-group">
              <h3 className="np-help-label">From {child?.child_name}'s Plan</h3>
              <p className="np-help-muted">These calming strategies come from the clinician's documents</p>
              <ul className="np-help-bullets">
                {calmingStrategies.slice(0, 8).map((s, i) => <li key={i}>{s}</li>)}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
