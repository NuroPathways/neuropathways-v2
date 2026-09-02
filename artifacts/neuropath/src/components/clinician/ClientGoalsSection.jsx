import { useState, useEffect } from "react";
import { base44 } from '@/api/entities';
import { Target, Plus, CheckCircle2, Circle, Trash2, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { motion, AnimatePresence } from "framer-motion";

export default function ClientGoalsSection({ childId, clinicianId }) {
  const [goals, setGoals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ goal_title: "", goal_description: "", target: 10, milestone_notes: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!childId) return;
    base44.entities.RewardToken.filter({ child_id: childId })
      .then(r => { setGoals(r); setLoading(false); })
      .catch(() => setLoading(false));
  }, [childId]);

  const handleAdd = async () => {
    if (!form.goal_title.trim()) return;
    setSaving(true);
    const created = await base44.entities.RewardToken.create({
      child_id: childId,
      clinician_id: clinicianId,
      goal_title: form.goal_title,
      goal_description: form.goal_description,
      milestone_notes: form.milestone_notes,
      progress: 0,
      target: Number(form.target) || 10,
      source: "manual",
      created_by_clinician: true,
    });
    setGoals(prev => [...prev, created]);
    setForm({ goal_title: "", goal_description: "", target: 10, milestone_notes: "" });
    setShowForm(false);
    setSaving(false);
  };

  const handleDelete = async (goalId) => {
    await base44.entities.RewardToken.delete(goalId);
    setGoals(prev => prev.filter(g => g.id !== goalId));
  };

  // Normalize old vs new field names
  const normalizeGoal = (g) => ({
    ...g,
    goal_title: g.goal_title || g.reward_description || g.token_name || "Goal",
    goal_description: g.goal_description || "",
    progress: g.progress ?? g.tokens_earned ?? 0,
    target: g.target ?? g.tokens_goal ?? 10,
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-3 px-1">
        <h2 className="font-semibold text-foreground text-sm flex items-center gap-2">
          <Target className="w-4 h-4 text-primary" /> Goals & Milestones ({goals.length})
        </h2>
        <Button size="sm" variant="outline" className="rounded-xl h-7 text-xs gap-1.5" onClick={() => setShowForm(!showForm)}>
          <Plus className="w-3 h-3" /> Add Goal
        </Button>
      </div>

      <AnimatePresence>
        {showForm && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
            className="bg-card border border-border rounded-2xl p-4 mb-3 space-y-3">
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Goal Title *</p>
              <Input value={form.goal_title} onChange={e => setForm(f => ({ ...f, goal_title: e.target.value }))} placeholder="e.g. Reduce hitting incidents to 0 per week" className="rounded-xl" />
            </div>
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Description</p>
              <Textarea value={form.goal_description} onChange={e => setForm(f => ({ ...f, goal_description: e.target.value }))} placeholder="Describe the goal..." className="rounded-xl" rows={2} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Target Steps</p>
                <Input type="number" value={form.target} onChange={e => setForm(f => ({ ...f, target: e.target.value }))} className="rounded-xl" />
              </div>
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Notes</p>
                <Input value={form.milestone_notes} onChange={e => setForm(f => ({ ...f, milestone_notes: e.target.value }))} placeholder="Optional" className="rounded-xl" />
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1 rounded-xl" onClick={() => setShowForm(false)}>Cancel</Button>
              <Button className="flex-1 rounded-xl" onClick={handleAdd} disabled={saving || !form.goal_title.trim()}>
                {saving ? "Saving..." : "Create Goal"}
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {loading ? (
        <div className="space-y-2">{[1, 2].map(i => <div key={i} className="h-16 bg-muted rounded-xl animate-pulse" />)}</div>
      ) : goals.length === 0 ? (
        <div className="text-center py-8 border-2 border-dashed border-border rounded-2xl">
          <Target className="w-7 h-7 text-muted-foreground mx-auto mb-2" />
          <p className="text-xs text-muted-foreground">No goals yet. Add manually or upload documents — goals are extracted automatically.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {goals.map((rawGoal) => {
            const g = normalizeGoal(rawGoal);
            const pct = Math.min(100, Math.round((g.progress / (g.target || 1)) * 100));
            const achieved = g.progress >= g.target;
            return (
              <div key={g.id} className={`bg-card border rounded-xl p-4 ${achieved ? "border-green-300" : "border-border"}`}>
                <div className="flex items-start gap-2">
                  {achieved ? <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" /> : <Circle className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-foreground truncate">{g.goal_title}</p>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {rawGoal.source === "document" && (
                          <FileText className="w-3 h-3 text-muted-foreground" title="From documents" />
                        )}
                        <button onClick={() => handleDelete(g.id)} className="text-muted-foreground hover:text-destructive transition-colors">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    {g.goal_description && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{g.goal_description}</p>}
                    <div className="mt-2">
                      <div className="flex justify-between text-xs text-muted-foreground mb-1">
                        <span>{g.progress}/{g.target} steps</span>
                        <span>{pct}%</span>
                      </div>
                      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                        <div className={`h-full rounded-full transition-all ${achieved ? "bg-green-500" : "bg-primary"}`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}