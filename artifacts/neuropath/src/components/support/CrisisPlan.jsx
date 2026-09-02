import { ArrowLeft, X, ShieldAlert, Phone, AlertTriangle } from "lucide-react";

export default function CrisisPlan({ child, profile, loadingProfile, onBack, onDismiss, isIndividual }) {
  const crisisPlan = profile?.crisis_plan || [];
  const safetyProcedures = profile?.safety_procedures || [];
  const name = child?.child_name;

  return (
    <div>
      <div className="sticky top-0 bg-red-600 px-5 py-4 flex items-center gap-3 z-10">
        <button onClick={onBack} className="min-w-[40px] min-h-[40px] flex items-center justify-center text-white/80 hover:text-white rounded-xl hover:bg-white/10 transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2 flex-1">
          <ShieldAlert className="w-5 h-5 text-white" />
          <p className="font-bold text-white text-sm">Safety / Crisis Plan</p>
        </div>
        <button onClick={onDismiss} className="min-w-[40px] min-h-[40px] flex items-center justify-center text-white/80 hover:text-white rounded-xl hover:bg-white/10 transition-colors">
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
        ) : crisisPlan.length === 0 && safetyProcedures.length === 0 ? (
          <div className="py-6">
            <div className="bg-yellow-50 border border-yellow-200 rounded-2xl p-5 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-yellow-800">No safety or crisis plan on file.</p>
                <p className="text-sm text-yellow-700 mt-1">
                  No safety or crisis plan has been uploaded for {name || "this client"}. Please contact your clinician to have one added.
                </p>
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
                <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Crisis Protocol Steps</h4>
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