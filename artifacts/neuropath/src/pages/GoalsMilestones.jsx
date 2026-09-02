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

export default function GoalsMilestones() {
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
      const cid = childIdParam || kids[0]?.id || "";
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
    const goalData = {
      ...form,
      progress: Number(form.progress),
      target: Number(form.target),
      source: "manual",
    };
    // Direct create works for logged-in users; client sessions fall back to backend.
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
    setSaving(false);
    setForm({ goal_title: "", goal_description: "", progress: 0, target: 10, milestone_notes: "" });
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

  // Normalize old vs new field names
  const normalizeGoal = (g) => ({
    ...g,
    goal_title: g.goal_title || g.reward_description || g.token_name || "Goal",
    goal_description: g.goal_description || "",
    progress: g.progress ?? g.tokens_earned ?? 0,
    target: g.target ?? g.tokens_goal ?? 10,
  });

  return (
    <div className="min-h-screen bg-background font-inter">
      {/* Hero Header */}
      <div className="relative overflow-hidden" style={{ background: "linear-gradient(135deg, hsl(216,38%,42%) 0%, hsl(180,29%,50%) 100%)" }}>
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-2 right-8 w-28 h-28 rounded-full bg-white" />
          <div className="absolute -bottom-4 left-10 w-36 h-36 rounded-full bg-white" />
        </div>
        <div className="relative px-5 pt-5 pb-8 max-w-xl mx-auto">
          <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-white/70 hover:text-white text-sm mb-5 transition-colors">
            <ArrowLeft className="w-4 h-4" /> Back
          </button>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/25 flex items-center justify-center">
                <Target className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-white">Goals & Milestones</h1>
                <p className="text-white/70 text-xs">{selectedChild ? `${selectedChild.child_name}'s progress` : "Track goals and milestones"}</p>
              </div>
            </div>
            <Button
              size="sm"
              className="bg-white/20 hover:bg-white/30 text-white border-0 rounded-xl gap-1.5"
              onClick={() => setShowForm(true)}
            >
              <Plus className="w-3.5 h-3.5" /> Add Goal
            </Button>
          </div>
        </div>
      </div>

      <div className="px-5 py-5 max-w-xl mx-auto space-y-4">
        {children.length > 1 && (
          <Select value={selectedChildId} onValueChange={setSelectedChildId}>
            <SelectTrigger className="rounded-xl"><SelectValue placeholder="Select profile" /></SelectTrigger>
            <SelectContent>{children.map(c => <SelectItem key={c.id} value={c.id}>{c.child_name}</SelectItem>)}</SelectContent>
          </Select>
        )}

        {/* Add Form */}
        <AnimatePresence>
          {showForm && (
            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
              className="bg-card border border-border rounded-2xl p-5 space-y-3">
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
          <div className="space-y-3">{[1, 2].map(i => <div key={i} className="h-36 bg-muted rounded-2xl animate-pulse" />)}</div>
        ) : goals.length === 0 ? (
          <div className="text-center py-14 border-2 border-dashed border-border rounded-2xl">
            <Target className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="font-medium text-foreground mb-1">No goals yet</p>
            <p className="text-sm text-muted-foreground mb-4">Goals are set by your clinician and will appear here.</p>
            <Button className="rounded-xl gap-2" onClick={() => setShowForm(true)}><Plus className="w-4 h-4" /> Add a Goal</Button>
          </div>
        ) : (
          <div className="space-y-4">
            {goals.map((rawGoal, i) => {
              const g = normalizeGoal(rawGoal);
              const pct = Math.min(100, Math.round((g.progress / (g.target || 1)) * 100));
              const achieved = g.progress >= g.target;
              return (
                <motion.div key={g.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}
                  className={`bg-card border-2 rounded-2xl p-5 transition-all ${achieved ? "border-green-400 bg-green-50/20" : "border-border"}`}>
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1 min-w-0 pr-3">
                      <div className="flex items-center gap-2 mb-0.5">
                        {achieved ? <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0" /> : <Circle className="w-5 h-5 text-primary flex-shrink-0" />}
                        <p className="font-bold text-foreground truncate">{g.goal_title}</p>
                      </div>
                      {g.goal_description && <p className="text-xs text-muted-foreground ml-7 line-clamp-2">{g.goal_description}</p>}
                      <p className="text-xs text-muted-foreground ml-7 mt-0.5">{g.progress} of {g.target} steps completed</p>
                      {rawGoal.source === "document" && (
                        <span className="ml-7 mt-1 inline-block text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">From documents</span>
                      )}
                      {rawGoal.created_by_clinician && (
                        <span className="ml-1 mt-1 inline-block text-xs bg-accent/20 text-accent-foreground px-2 py-0.5 rounded-full">Clinician goal</span>
                      )}
                    </div>
                    {!achieved && (
                      <button onClick={() => incrementProgress(rawGoal)}
                        className="w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center hover:bg-primary/90 transition-colors shadow-md shadow-primary/20 flex-shrink-0">
                        <Plus className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  {/* Progress bar */}
                  <div className="mb-2">
                    <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
                      <span>{pct}% complete</span>
                      <span>{achieved ? "✓ Milestone reached!" : `${g.target - g.progress} to go`}</span>
                    </div>
                    <div className="h-2.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${achieved ? "bg-green-500" : "bg-primary"}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>

                  {g.milestone_notes && (
                    <p className="text-xs text-muted-foreground mt-2 italic">{g.milestone_notes}</p>
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