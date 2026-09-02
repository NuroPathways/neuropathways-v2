import { FileText, ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";

const severityColor = {
  low: "bg-green-100 text-green-700",
  moderate: "bg-yellow-100 text-yellow-700",
  high: "bg-orange-100 text-orange-700",
  crisis: "bg-red-100 text-red-700",
};

export default function BehaviorPlanSummary({ plan }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="bg-card rounded-2xl border border-border overflow-hidden">
      <button
        className="w-full flex items-center justify-between p-5 text-left"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
            <FileText className="w-4 h-4 text-primary" />
          </div>
          <div>
            <p className="font-medium text-foreground text-sm">{plan.behavior_name}</p>
            {plan.severity_level && (
              <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full mt-1 ${severityColor[plan.severity_level] || "bg-muted text-muted-foreground"}`}>
                {plan.severity_level.charAt(0).toUpperCase() + plan.severity_level.slice(1)}
              </span>
            )}
          </div>
        </div>
        {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
      </button>

      {expanded && (
        <div className="px-5 pb-5 space-y-4 border-t border-border pt-4">
          {plan.behavior_description && (
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Description</p>
              <p className="text-sm text-foreground">{plan.behavior_description}</p>
            </div>
          )}
          {plan.strategy_steps && (
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">What to Do</p>
              <p className="text-sm text-foreground whitespace-pre-line">{plan.strategy_steps}</p>
            </div>
          )}
          {plan.reinforcement_method && (
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Reinforcement</p>
              <p className="text-sm text-foreground">{plan.reinforcement_method}</p>
            </div>
          )}
          {plan.escalation_signs && (
            <div className="p-3 bg-red-50 rounded-xl">
              <p className="text-xs font-medium text-red-700 uppercase tracking-wide mb-1">⚠ Escalation Signs</p>
              <p className="text-sm text-red-800">{plan.escalation_signs}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}