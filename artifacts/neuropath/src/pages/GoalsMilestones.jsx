import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from '@/api/entities';
import { ArrowLeft, Plus, Trophy, Target, CheckCircle2, Circle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/lib/AuthContext";
import { readableGoalTitle } from "@/lib/goalTitle";

const isDocumentGoal = (goal) => ["document", "parent_document"].includes(goal.source);
const milestoneLines = (value) => String(value || "")
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter((line) => line && !line.toLowerCase().startsWith("plan milestones"))
  .map((line) => line.replace(/^[•\-\d.)\s]+/, "").trim())
  .filter(Boolean);

export default function GoalsMilestones({ embedded = false }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [children, setChildren] = useState([]);
  const [selectedChildId, setSelectedChildId] = useState("");
  const [goals, setGoals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ goal_title: "", goal_description: "", progress: 0, target: 10, milestone_notes: "" });
  const [saving, setSaving] = useState(false);
  const childIdParam = new URLSearchParams(window.location.search).get("child_id");

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      // Support client session (no Base44 auth)
      let kids = user.children || [];
      if (kids.length === 0) {
        const [byId, byEmail] = await Promise.all([
          base44.entities.Child.filter({ parent_id: user.id }).catch(() => []),
          user.email ? base44.entities.Child.filter({ parent_email: user.email }).catch(() => []) : Promise.resolve([]),
        ]);
        const seen = new Set();
        kids = [...byId, ...byEmail].filter(c => { if (seen.has(c.id)) return false; seen.add(c.id); return true; });
      }
      setChildren(kids);
      let savedId = null;
      try { savedId = localStorage.getItem(`np-family-child:${user.id}`); } catch { /* Storage may be unavailable. */ }
      const cid = kids.find((child) => String(child.id) === String(childIdParam))?.id
        || kids.find((child) => String(child.id) === String(savedId))?.id
        || kids[0]?.id || "";
      setSelectedChildId(cid);
    };
    load();
  }, [user, childIdParam]);

  const loadGoals = async (cid) => {
    // Direct read works for logged-in users; client sessions (username+code) are
    // blocked by RLS, so fall back to the authorized backend.
    let r = await base44.entities.RewardToken.filter({ child_id: cid }).catch(() => null);
    if (!r || r.length === 0) {
      r = await base44.functions.invoke("getClientPortalData", {
        child_id: cid,
        account_id: user?.id,
        invite_token: user?.invite_token,
      }).then(res => res?.data?.goals || []).catch(() => []);
    }
    return r;
  };

  useEffect(() => {
    if (!selectedChildId) { setLoading(false); return; }
    setLoading(true);
    loadGoals(selectedChildId).then(r => { setGoals(r); setLoading(false); });
  }, [selectedChildId]);

  const handleAdd = async () => {
    if (!selectedChildId) return;
    setSaving(true);
    try {
      const goalData = {
        ...form,
        progress: Number(form.progress),
        target: Number(form.target),
        source: "manual",
      };
      await base44.entities.RewardToken.create({ ...goalData, child_id: selectedChildId, parent_id: user?.id })
        .catch(() => base44.functions.invoke("manageClientGoal", {
          action: "create",
          child_id: selectedChildId,
          data: goalData,
          account_id: user?.id,
          invite_token: user?.invite_token,
        }));
      const updated = await loadGoals(selectedChildId);
      setGoals(updated);
      setShowForm(false);
      setForm({ goal_title: "", goal_description: "", progress: 0, target: 10, milestone_notes: "" });
    } catch { /* goal may have saved — reload on next visit */ }
    setSaving(false);
  };

  const incrementProgress = async (goal) => {
    const current = goal.progress ?? goal.tokens_earned ?? 0;
    const max = goal.target ?? goal.tokens_goal ?? 10;
    if (current >= max) return;
    const newProgress = current + 1;
    const data = { progress: newProgress, tokens_earned: newProgress };
    // Direct update is blocked by RLS for client sessions — fall back to backend.
    await base44.entities.RewardToken.update(goal.id, data)
      .catch(() => base44.functions.invoke("manageClientGoal", {
        action: "update",
        goal_id: goal.id,
        child_id: goal.child_id || selectedChildId,
        data,
        account_id: user?.id,
        invite_token: user?.invite_token,
      }));
    setGoals(prev => prev.map(g => g.id === goal.id ? { ...g, ...data } : g));
  };

  const selectedChild = children.find(c => c.id === selectedChildId);
  const changeChild = (childId) => {
    setSelectedChildId(childId);
    try { localStorage.setItem(`np-family-child:${user?.id}`, childId); } catch { /* Storage may be unavailable. */ }
    const params = new URLSearchParams(window.location.search);
    params.set("child_id", childId);
    navigate(`/GoalsMilestones?${params.toString()}`, { replace: true });
  };

  // Normalize old vs new field names
  const normalizeGoal = (g) => ({
    ...g,
    goal_title: readableGoalTitle(g),
    goal_description: g.goal_description || "",
    progress: g.progress ?? g.tokens_earned ?? 0,
    target: g.target ?? g.tokens_goal ?? 10,
  });

  return (
    <div className="legacy-goals min-h-[100dvh] bg-background font-inter text-foreground">
      <div className="bg-primary text-primary-foreground">
        <div className="px-5 pt-5 pb-6 max-w-3xl mx-auto">
          {!embedded && <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-primary-foreground/75 hover:text-primary-foreground text-sm mb-4 transition-colors">
            <ArrowLeft className="w-4 h-4" /> Back
          </button>}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-primary-foreground/15 flex items-center justify-center">
                <Target className="w-4 h-4 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-primary-foreground">Goals & Milestones</h1>
                <p className="text-primary-foreground/75 text-xs">{selectedChild ? `${selectedChild.child_name}'s progress` : "Track goals and milestones"}</p>
              </div>
            </div>
            <Button
              size="sm"
              className="bg-primary-foreground/15 hover:bg-primary-foreground/25 text-primary-foreground border border-primary-foreground/20 rounded-lg gap-1.5"
              onClick={() => setShowForm(true)}
            >
              <Plus className="w-3.5 h-3.5" /> Add Goal
            </Button>
          </div>
        </div>
      </div>

      <div className="px-4 py-4 sm:px-5 sm:py-5 max-w-3xl mx-auto space-y-3">
        {!embedded && children.length > 1 && (
          <div className="legacy-goals-child-select">
            <span className="text-xs font-semibold text-muted-foreground">Viewing progress for</span>
            <Select value={selectedChildId} onValueChange={changeChild}>
              <SelectTrigger className="rounded-lg bg-card"><SelectValue placeholder="Select profile" /></SelectTrigger>
              <SelectContent>{children.map(c => <SelectItem key={c.id} value={c.id}>{c.child_name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        )}

        {/* Add Form */}
        <AnimatePresence>
          {showForm && (
            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
              className="legacy-goals-form bg-card border border-border rounded-xl p-4 sm:p-5 space-y-3">
              <h3 className="font-semibold text-foreground flex items-center gap-2">
                <Target className="w-4 h-4 text-primary" /> New Goal
              </h3>
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Goal Title</p>
                <Input value={form.goal_title} onChange={e => setForm(f => ({ ...f, goal_title: e.target.value }))} placeholder="e.g. Morning routine independence" className="rounded-xl" />
              </div>
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Description (optional)</p>
                <Textarea value={form.goal_description} onChange={e => setForm(f => ({ ...f, goal_description: e.target.value }))} placeholder="Details about this goal..." className="rounded-xl" rows={2} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Starting Progress</p>
                  <Input type="number" value={form.progress} onChange={e => setForm(f => ({ ...f, progress: e.target.value }))} className="rounded-xl" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Target</p>
                  <Input type="number" value={form.target} onChange={e => setForm(f => ({ ...f, target: e.target.value }))} className="rounded-xl" />
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Notes (optional)</p>
                <Input value={form.milestone_notes} onChange={e => setForm(f => ({ ...f, milestone_notes: e.target.value }))} placeholder="Any additional notes" className="rounded-xl" />
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1 rounded-xl" onClick={() => setShowForm(false)}>Cancel</Button>
                <Button className="flex-1 rounded-xl" onClick={handleAdd} disabled={saving || !form.goal_title.trim()}>{saving ? "Saving..." : "Create Goal"}</Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {loading ? (
          <div className="space-y-3">{[1, 2].map(i => <div key={i} className="h-32 bg-muted rounded-xl animate-pulse" />)}</div>
        ) : goals.length === 0 ? (
          <div className="text-center py-10 px-5 border border-dashed border-border bg-card rounded-xl">
            <Target className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
            <p className="font-medium text-foreground mb-1">No goals yet</p>
            <p className="text-sm text-muted-foreground mb-4">No goals yet. Create one below or ask your clinician to set one up.</p>
            <Button className="rounded-xl gap-2" onClick={() => setShowForm(true)}><Plus className="w-4 h-4" /> Add a Goal</Button>
          </div>
        ) : (
          <div className="space-y-4">
            {goals.map((rawGoal, i) => {
              const g = normalizeGoal(rawGoal);
              const documentGoal = isDocumentGoal(rawGoal);
              const milestones = milestoneLines(rawGoal.milestone_notes);
              const pct = documentGoal ? 0 : Math.min(100, Math.round((g.progress / (g.target || 1)) * 100));
              const achieved = !documentGoal && g.progress >= g.target;
              return (
                <motion.div key={g.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}
                 className={`legacy-goal-card bg-card border rounded-xl p-4 transition-colors ${achieved ? "border-accent bg-accent/10" : "border-border"}`}>
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1 min-w-0 pr-3">
                      <div className="flex items-center gap-2 mb-0.5">
                         {achieved ? <CheckCircle2 className="w-5 h-5 text-accent-foreground flex-shrink-0" /> : <Circle className="w-5 h-5 text-primary flex-shrink-0" />}
                        <p className="font-bold text-foreground break-words">{g.goal_title}</p>
                      </div>
                      {g.goal_description && (
                        <details className="legacy-goal-description ml-7">
                          <summary className="text-xs text-primary">Read goal description</summary>
                          <p className="text-xs text-muted-foreground mt-1">{g.goal_description}</p>
                        </details>
                      )}
                      {!documentGoal && <p className="text-xs text-muted-foreground ml-7 mt-0.5">{g.progress} of {g.target} steps completed</p>}
                      {documentGoal && (
                        <span className="ml-7 mt-1 inline-block text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                           {rawGoal.source === "parent_document" ? "Uploaded plan · not clinician-reviewed" : "Clinician-uploaded plan"}
                        </span>
                      )}
                      {rawGoal.created_by_clinician && (
                        <span className="ml-1 mt-1 inline-block text-xs bg-accent/20 text-accent-foreground px-2 py-0.5 rounded-full">Clinician goal</span>
                      )}
                    </div>
                    {!documentGoal && !rawGoal.created_by_clinician && !achieved && (
                      <button onClick={() => incrementProgress(rawGoal)}
                        className="w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center hover:bg-primary/90 transition-colors shadow-md shadow-primary/20 flex-shrink-0">
                        <Plus className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  {!documentGoal && (
                    <div className="mb-2">
                      <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
                        <span>{pct}% complete</span>
                          <span>{achieved ? "Milestone reached" : `${g.target - g.progress} to go`}</span>
                      </div>
                      <div className="h-2.5 bg-muted rounded-full overflow-hidden">
                        <div
                           className={`h-full rounded-full transition-all duration-500 ${achieved ? "bg-accent" : "bg-primary"}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {documentGoal ? (
                    <div className="mt-3 ml-7">
                      <details className="legacy-goal-description">
                        <summary className="text-xs text-primary">View milestones from the plan</summary>
                        <div className="text-xs text-muted-foreground mt-2">
                          {milestones.length ? (
                            <ul className="list-disc pl-4 space-y-1">
                              {milestones.map((milestone, index) => <li key={`${g.id}-milestone-${index}`}>{milestone}</li>)}
                            </ul>
                          ) : <p>{g.milestone_notes || "No explicit milestones were listed in the source document."}</p>}
                          <p className="mt-2">Report practice outcomes in Today; these are caregiver reports, not a measure of treatment progress.</p>
                        </div>
                      </details>
                    </div>
                  ) : g.milestone_notes && (
                    <details className="legacy-goal-description ml-7 mt-2">
                      <summary className="text-xs text-primary">View milestone notes</summary>
                      <p className="text-xs text-muted-foreground mt-1">{g.milestone_notes}</p>
                    </details>
                  )}
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}