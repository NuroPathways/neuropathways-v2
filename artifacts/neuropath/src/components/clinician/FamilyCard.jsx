import { ChevronRight, Users, User } from "lucide-react";
import { Link } from "react-router-dom";

function sanitize(v) {
  if (!v || v === "undefined" || v === "null") return null;
  return String(v).trim() || null;
}

function memberLabel(accountType, count) {
  if (accountType === "caregiver") return `${count} patient${count !== 1 ? "s" : ""}`;
  return `${count} child${count !== 1 ? "ren" : ""}`;
}

export default function FamilyCard({ family, children = [] }) {
  const accountType = family.account_type || "individual";
  const isIndividual = accountType === "individual";

  const displayName = sanitize(family.family_name)
    || sanitize(family.parent_name)
    || sanitize(children[0]?.child_name)
    || "Unnamed Client";

  let subtitle = "";
  if (isIndividual) {
    const parts = [];
    if (children[0]?.age) parts.push(`Age ${children[0].age}`);
    if (children[0]?.diagnosis) parts.push(children[0].diagnosis);
    subtitle = parts.length > 0 ? parts.join(" · ") : "Individual Client";
  } else {
    const parentLabel = sanitize(family.parent_name) ? `${sanitize(family.parent_name)} · ` : "";
    const count = children.length;
    subtitle = `${parentLabel}${memberLabel(accountType, count)}`;
  }

  const initial = displayName[0]?.toUpperCase() || "?";

  const statusDot = family.invite_status === "accepted"
    ? <span className="w-2 h-2 rounded-full bg-green-400 flex-shrink-0" title="Connected" />
    : <span className="w-2 h-2 rounded-full bg-amber-400 flex-shrink-0" title="Pending" />;

  return (
    <Link
      to={`/FamilyDetail?family_id=${family.id}`}
      className="flex items-center gap-4 p-4 bg-card rounded-xl border border-border hover:border-primary/40 hover:shadow-sm transition-all group"
    >
      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
        {isIndividual
          ? <User className="w-5 h-5 text-primary" />
          : <span className="text-primary font-semibold text-sm">{initial}</span>}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="font-medium text-foreground text-sm truncate">{displayName}</p>
          {statusDot}
        </div>
        <p className="text-xs text-muted-foreground mt-0.5 truncate">{subtitle}</p>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        {!isIndividual && children.length > 0 && (
          <div className="flex -space-x-1">
            {children.slice(0, 3).map((c, i) => (
              <div key={c.id || i} className="w-5 h-5 rounded-full bg-secondary/20 border border-background flex items-center justify-center">
                <span className="text-[9px] font-bold text-secondary">
                  {sanitize(c.child_name)?.[0]?.toUpperCase() || "?"}
                </span>
              </div>
            ))}
            {children.length > 3 && (
              <div className="w-5 h-5 rounded-full bg-muted border border-background flex items-center justify-center">
                <span className="text-[9px] font-bold text-muted-foreground">+{children.length - 3}</span>
              </div>
            )}
          </div>
        )}
        <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
      </div>
    </Link>
  );
}
