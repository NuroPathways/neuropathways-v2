import { motion } from "framer-motion";
import { Search, BookOpen, Lightbulb, Heart } from "lucide-react";

const STEPS = [
  { label: "Analyzing behavior", icon: Search },
  { label: "Reviewing behavior plan", icon: BookOpen },
  { label: "Selecting strategies", icon: Lightbulb },
  { label: "Generating guidance", icon: Heart },
];

export default function ProcessingSteps({ currentStep }) {
  return (
    <div className="flex flex-col gap-2 py-1 min-w-[200px]">
      {STEPS.map((step, i) => {
        const stepNum = i + 1;
        const isActive = stepNum === currentStep;
        const isDone = stepNum < currentStep;
        const Icon = step.icon;

        return (
          <div
            key={i}
            className={`flex items-center gap-2 text-xs transition-all duration-300 ${
              isActive
                ? "text-primary font-medium"
                : isDone
                ? "text-muted-foreground/50"
                : "text-muted-foreground/20"
            }`}
          >
            {isActive ? (
              <motion.div
                className="w-3 h-3 rounded-full border border-primary border-t-transparent flex-shrink-0"
                animate={{ rotate: 360 }}
                transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}
              />
            ) : isDone ? (
              <div className="w-3 h-3 rounded-full bg-muted-foreground/30 flex-shrink-0" />
            ) : (
              <Icon className="w-3 h-3 flex-shrink-0" />
            )}
            <span className={isDone ? "line-through" : ""}>{step.label}</span>
            {isActive && (
              <motion.span
                animate={{ opacity: [0, 1, 0] }}
                transition={{ duration: 1.2, repeat: Infinity }}
              >
                ...
              </motion.span>
            )}
          </div>
        );
      })}
    </div>
  );
}