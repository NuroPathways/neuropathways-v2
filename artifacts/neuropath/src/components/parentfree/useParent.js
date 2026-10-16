import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/AuthContext";
import { getParentBehaviors } from "@workspace/api-client-react";

const KEY = "np_parent_selected_child";

// Selected child, scoped to the signed-in parent so switching accounts never leaks.
export function useSelectedChild() {
  const { user } = useAuth();
  const children = user?.parent_children || [];
  const [stored, setStored] = useState({ userId: user?.id, id: null });
  useEffect(() => {
    if (!user?.id) return;
    let id = null;
    try { id = localStorage.getItem(`${KEY}:${user.id}`); } catch { /* Storage may be unavailable. */ }
    setStored({ userId: user.id, id });
  }, [user?.id]);
  const savedId = stored.userId === user?.id ? stored.id : null;
  const selected = children.find((c) => c.id === savedId) || children[0] || null;
  const select = useCallback((id) => {
    try { localStorage.setItem(`${KEY}:${user?.id}`, id); } catch { /* ignore */ }
    setStored({ userId: user?.id, id });
  }, [user?.id]);
  return { children, selected, select };
}

export function isSetupComplete(child) {
  if (!child?.name) return false;
  const behaviors = getParentBehaviors(child);
  return behaviors.length > 0 && behaviors.every((behavior) => !!behavior.goal?.trim());
}
