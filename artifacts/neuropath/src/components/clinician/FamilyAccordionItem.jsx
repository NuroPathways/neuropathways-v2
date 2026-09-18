import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronRight, Key, Eye, EyeOff } from "lucide-react";

function memberLabel(accountType, count) {
  if (accountType === "caregiver") return `${count} patient${count !== 1 ? "s" : ""}`;
  return `${count} child${count !== 1 ? "ren" : ""}`;
}

export default function FamilyAccordionItem({ family, children, parentUsers, clientAccount }) {
  const navigate = useNavigate();
  const [showCode, setShowCode] = useState(false);

  const childCount = children.length;
  const parentCount = parentUsers.length;
  const hasCredentials = clientAccount?.username;
  const hasAccessCode = clientAccount?.access_code;
  const hasRealEmail = clientAccount?.email && !clientAccount.email.includes("@noemail.");

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <button
        className="w-full flex items-center gap-3 p-4 hover:bg-muted/50 transition-colors text-left"
        onClick={() => navigate(`/FamilyDetail?family_id=${family.id}`)}
      >
        <div className="w-10 h-10 rounded-full bg-accent flex items-center justify-center flex-shrink-0">
          <span className="text-accent-foreground text-sm font-semibold">
            {family.family_name?.[0]?.toUpperCase() || "F"}
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground">
            {family.account_type === "individual"
              ? family.family_name
              : (family.family_name?.toLowerCase().endsWith("family") ? family.family_name : `${family.family_name} Family`)}
          </p>
          <p className="text-xs text-muted-foreground">
            {family.account_type === "individual"
              ? "Individual client"
              : `${memberLabel(family.account_type, childCount)}${parentCount > 0 ? ` · ${parentCount} guardian${parentCount !== 1 ? "s" : ""}` : ""}`}
          </p>
        </div>
        <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
      </button>

      {hasCredentials && (
        <div className="border-t border-border px-4 py-3 bg-muted/20 flex items-center gap-3 flex-wrap">
          <Key className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
          <span className="text-xs text-muted-foreground">Login:</span>
          <span className="text-xs font-mono font-semibold text-foreground">{clientAccount.username}</span>
          {hasAccessCode && (
            <>
              <span className="text-xs text-muted-foreground">·</span>
              <span className="text-xs text-muted-foreground">Code:</span>
              <span className="text-xs font-mono font-semibold text-foreground">
                {showCode ? clientAccount.access_code : "••••••"}
              </span>
              <button
                onClick={(e) => { e.stopPropagation(); setShowCode(!showCode); }}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                {showCode ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
              </button>
            </>
          )}
          {hasRealEmail && (
            <>
              <span className="text-xs text-muted-foreground">·</span>
              <span className="text-xs text-muted-foreground truncate max-w-[140px]">{clientAccount.email}</span>
            </>
          )}
        </div>
      )}
    </div>
  );
}
