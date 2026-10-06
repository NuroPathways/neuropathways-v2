import { ArrowLeft, X, ShieldAlert, Phone, AlertTriangle } from "lucide-react";

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function textValue(value) {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value);
  if (isRecord(value)) {
    return textValue(value.text ?? value.step ?? value.procedure ?? value.description ?? value.title ?? "");
  }
  return "";
}

function listSteps(value) {
  if (Array.isArray(value)) return value.map(textValue).filter(Boolean);
  if (typeof value === "string") {
    return value
      .split(/\r?\n/)
      .map((step) => step.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim())
      .filter(Boolean);
  }
  if (isRecord(value)) {
    const nested = value.steps ?? value.items ?? value.procedures ?? value.guidance ?? value.protocol;
    return nested === undefined ? [] : listSteps(nested);
  }
  return [];
}

export default function CrisisPlan({ child, profile, loadingProfile, profileLoadError, onBack, onDismiss, isIndividual }) {
  const crisisPlan = listSteps(profile?.crisis_plan);
  const safetyProcedures = listSteps(profile?.safety_procedures);
  const name = child?.child_name;

  return (
    <div>
      <div className="sticky top-0 bg-red-600 px-5 py-4 flex items-center gap-3 z-10">
        <button type="button" onClick={onBack} className="min-w-[40px] min-h-[40px] flex items-center justify-center text-white/80 hover:text-white rounded-xl hover:bg-white/10 transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2 flex-1">
          <ShieldAlert className="w-5 h-5 text-white" />
          <p className="font-bold text-white text-sm">Safety / Crisis Plan</p>
        </div>
        <button type="button" onClick={onDismiss} className="min-w-[40px] min-h-[40px] flex items-center justify-center text-white/80 hover:text-white rounded-xl hover:bg-white/10 transition-colors">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="bg-red-50 border-b border-red-200 px-5 py-3 flex items-center gap-2">
        <Phone className="w-4 h-4 text-red-600 flex-shrink-0" />
        <p className="text-sm font-bold text-red-700">If there is immediate danger, call 911 or emergency services.</p>
      </div>

      <div className="p-5 space-y-4">
        {loadingProfile ? (
          <div className="py-12 text-center">
            <div className="w-10 h-10 border-4 border-border border-t-red-500 rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">Loading safety plan...</p>
          </div>
        ) : profileLoadError ? (
          <div role="alert" className="bg-red-50 border border-red-200 rounded-2xl p-5">
            <p className="text-sm font-semibold text-red-800 mb-1">Could not load safety information.</p>
            <p className="text-sm text-red-700">Return to the support menu and try again.</p>
          </div>
        ) : crisisPlan.length === 0 && safetyProcedures.length === 0 ? (
          <div className="py-6">
            <div className="bg-sky-50 border border-sky-200 rounded-2xl p-5 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-sky-700 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-sky-900">General safety guidance</p>
                <p className="text-sm text-sky-800 mt-1">
                  This is general information, not an individualized crisis plan for {name || "this client"}. No clinician crisis guidance is on file.
                </p>
                <ol className="mt-3 list-decimal pl-5 space-y-2 text-sm text-sky-900">
                  <li>If anyone is in immediate danger, injured, or needs urgent medical care, call 911 or your local emergency number.</li>
                  <li>If it is safe, move away from hazards and give everyone space. Do not use physical restraint or untrained holds.</li>
                  <li>Use a calm, brief voice and reduce noise or other demands when it is safe to do so.</li>
                  <li>When the immediate risk has passed, contact the treating clinician or local crisis service for guidance tailored to this child.</li>
                </ol>
              </div>
            </div>
          </div>
        ) : (
          <>
            {name && !isIndividual && (
              <div className="bg-card border border-border rounded-xl px-4 py-3">
                <p className="text-xs text-muted-foreground">Crisis plan for:</p>
                <p className="font-semibold text-foreground">{name}</p>
              </div>
            )}

            {crisisPlan.length > 0 && (
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Crisis plan steps on file</h4>
                <div className="bg-red-600 rounded-2xl p-4 space-y-2">
                  {crisisPlan.map((step, i) => (
                    <div key={i} className="flex items-start gap-3">
                      <span className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center text-white font-bold text-xs flex-shrink-0 mt-0.5">{i + 1}</span>
                      <p className="text-white text-sm leading-snug">{step}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {safetyProcedures.length > 0 && (
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Safety Procedures</h4>
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 space-y-2">
                  {safetyProcedures.map((s, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <ShieldAlert className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                      <p className="text-sm text-emerald-800 leading-snug">{s}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <p className="text-xs font-bold uppercase tracking-wider text-amber-700 mb-1">When To Contact Your Clinician</p>
              <p className="text-sm text-amber-800">
                Contact your clinician if the situation does not de-escalate, if safety cannot be maintained, or if the crisis plan steps are not working.
              </p>
            </div>
          </>
        )}

        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl p-3">
          <Phone className="w-4 h-4 text-red-600 flex-shrink-0" />
          <p className="text-xs text-red-700 font-medium">If there is immediate danger, call 911 or emergency services.</p>
        </div>
      </div>
    </div>
  );
}