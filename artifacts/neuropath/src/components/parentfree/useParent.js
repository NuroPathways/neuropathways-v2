import { useCallback, useState } from "react";
import { useAuth } from "@/lib/AuthContext";
import { getParentBehaviors } from "@workspace/api-client-react";

const KEY = "np_parent_selected_child";

// Selected child, scoped to the signed-in parent so switching accounts never leaks.
export function useSelectedChild() {
  const { user } = useAuth();
  const children = user?.parent_children || [];
  const [stored, setStored] = useState(() => { try { return localStorage.getItem(KEY); } catch { return null; } });
  const selected = children.find((c) => c.id === stored) || children[0] || null;
  const select = useCallback((id) => {
    try { localStorage.setItem(KEY, id); } catch { /* ignore */ }
    setStored(id);
  }, []);
  return { children, selected, select };
}

export function isSetupComplete(child) {
  if (!child?.name) return false;
  const behaviors = getParentBehaviors(child);
  return behaviors.length > 0 && behaviors.every((behavior) => !!behavior.goal?.trim());
}
