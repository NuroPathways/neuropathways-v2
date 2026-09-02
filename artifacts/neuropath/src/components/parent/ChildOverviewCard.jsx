import { AlertCircle } from "lucide-react";

export default function ChildOverviewCard({ child }) {
  if (!child) return null;
  return (
    <div className="bg-card rounded-2xl border border-border p-5">
      <div className="flex items-center gap-4">
        <div className="w-14 h-14 rounded-2xl bg-accent/10 flex items-center justify-center flex-shrink-0">
          <span className="text-accent font-bold text-xl">
            {child.child_name?.[0]?.toUpperCase() || "?"}
          </span>
        </div>
        <div>
          <p className="font-semibold text-foreground">{child.child_name || "Unknown"}</p>
          <p className="text-sm text-muted-foreground mt-0.5">
            {child.age ? `Age ${child.age}` : "Age unknown"}
            {child.diagnosis ? ` · ${child.diagnosis}` : ""}
          </p>
        </div>
      </div>
      {child.triggers && (
        <div className="mt-4 p-3 bg-muted/60 rounded-xl flex gap-2.5">
          <AlertCircle className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-0.5">Known Triggers</p>
            <p className="text-sm text-foreground">{child.triggers}</p>
          </div>
        </div>
      )}
    </div>
  );
}
