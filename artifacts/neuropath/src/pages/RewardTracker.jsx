import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from '@/api/entities';
import { ArrowLeft, Star, Plus, Trophy, Target, Gift } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { motion, AnimatePresence } from "framer-motion";

export default function RewardTracker() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [children, setChildren] = useState([]);
  const [selectedChildId, setSelectedChildId] = useState("");
  const [tokens, setTokens] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ token_name: "Star", tokens_earned: 0, tokens_goal: 10, reward_description: "", milestone_notes: "" });
  const [saving, setSaving] = useState(false);
  const childIdParam = new URLSearchParams(window.location.search).get("child_id");

  useEffect(() => {
    const load = async () => {
      const me = await base44.auth.me().catch(() => null);
      if (!me) { navigate("/"); return; }
      setUser(me);
      const [byId, byEmail] = await Promise.all([
        base44.entities.Child.filter({ parent_id: me.id }).catch(() => []),
        base44.entities.Child.filter({ parent_email: me.email }).catch(() => []),
      ]);
      const seen = new Set();
      const merged = [...byId, ...byEmail].filter(c => { if (seen.has(c.id)) return false; seen.add(c.id); return true; });
      setChildren(merged);
      const cid = childIdParam || merged[0]?.id || "";
      setSelectedChildId(cid);
    };
    load();
  }, [childIdParam]);

  useEffect(() => {
    if (!selectedChildId) return;
    setLoading(true);
    base44.entities.RewardToken.filter({ child_id: selectedChildId }).then(r => { setTokens(r); setLoading(false); });
  }, [selectedChildId]);

  const handleAdd = async () => {
    if (!selectedChildId) return;
    setSaving(true);
    await base44.entities.RewardToken.create({ ...form, child_id: selectedChildId, parent_id: user?.id, tokens_earned: Number(form.tokens_earned), tokens_goal: Number(form.tokens_goal) });
    const updated = await base44.entities.RewardToken.filter({ child_id: selectedChildId });
    setTokens(updated);
    setShowForm(false);
    setSaving(false);
    setForm({ token_name: "Star", tokens_earned: 0, tokens_goal: 10, reward_description: "", milestone_notes: "" });
  };

  const addToken = async (tokenRecord) => {
    if (tokenRecord.tokens_earned >= tokenRecord.tokens_goal) return;
    const newEarned = tokenRecord.tokens_earned + 1;
    await base44.entities.RewardToken.update(tokenRecord.id, { tokens_earned: newEarned });
    setTokens(prev => prev.map(t => t.id === tokenRecord.id ? { ...t, tokens_earned: newEarned } : t));
    if (newEarned >= tokenRecord.tokens_goal) {
      const child = children.find(c => c.id === selectedChildId);
      base44.entities.EngagementEvent.create({
        child_id: selectedChildId,
        clinician_id: child?.clinician_id,
        parent_id: user?.id,
        event_type: "goal_reached",
        topic: tokenRecord.reward_description || tokenRecord.token_name || "Reward Goal",
      }).catch(() => {});
    }
  };

  const selectedChild = children.find(c => c.id === selectedChildId);

  return (
    <div className="min-h-screen bg-background font-inter">
      {/* Hero Header */}
      <div className="relative overflow-hidden" style={{ background: "linear-gradient(135deg, hsl(43,96%,56%) 0%, hsl(36,100%,60%) 100%)" }}>
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
                <Trophy className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-white">Reward Tracker</h1>
                <p className="text-white/70 text-xs">{selectedChild ? `${selectedChild.child_name}'s progress` : "Track token goals"}</p>
              </div>
            </div>
            <Button
              size="sm"
              className="bg-white/20 hover:bg-white/30 text-white border-0 rounded-xl gap-1.5"
              onClick={() => setShowForm(true)}
            >
              <Plus className="w-3.5 h-3.5" /> New Goal
            </Button>
          </div>
        </div>
      </div>

      <div className="px-5 py-5 max-w-xl mx-auto space-y-4">
        {children.length > 1 && (
          <Select value={selectedChildId} onValueChange={setSelectedChildId}>
            <SelectTrigger className="rounded-xl"><SelectValue placeholder="Select child" /></SelectTrigger>
            <SelectContent>{children.map(c => <SelectItem key={c.id} value={c.id}>{c.child_name}</SelectItem>)}</SelectContent>
          </Select>
        )}

        {/* Add Form */}
        <AnimatePresence>
          {showForm && (
            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
              className="bg-card border border-border rounded-2xl p-5 space-y-3">
              <h3 className="font-semibold text-foreground flex items-center gap-2">
                <Gift className="w-4 h-4 text-primary" /> New Reward Goal
              </h3>
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Token Name</p>
                <Input value={form.token_name} onChange={e => setForm(f => ({ ...f, token_name: e.target.value }))} placeholder="e.g. Star, Point" className="rounded-xl" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Starting</p>
                  <Input type="number" value={form.tokens_earned} onChange={e => setForm(f => ({ ...f, tokens_earned: e.target.value }))} className="rounded-xl" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Goal</p>
                  <Input type="number" value={form.tokens_goal} onChange={e => setForm(f => ({ ...f, tokens_goal: e.target.value }))} className="rounded-xl" />
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Reward</p>
                <Input value={form.reward_description} onChange={e => setForm(f => ({ ...f, reward_description: e.target.value }))} placeholder="e.g. 30 mins extra screen time" className="rounded-xl" />
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1 rounded-xl" onClick={() => setShowForm(false)}>Cancel</Button>
                <Button className="flex-1 rounded-xl" onClick={handleAdd} disabled={saving}>{saving ? "Saving..." : "Create"}</Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {loading ? (
          <div className="space-y-3">{[1, 2].map(i => <div key={i} className="h-36 bg-muted rounded-2xl animate-pulse" />)}</div>
        ) : tokens.length === 0 ? (
          <div className="text-center py-14 border-2 border-dashed border-border rounded-2xl">
            <Trophy className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="font-medium text-foreground mb-1">No reward goals yet</p>
            <p className="text-sm text-muted-foreground mb-4">Create a reward goal to start celebrating progress!</p>
            <Button className="rounded-xl gap-2" onClick={() => setShowForm(true)}><Plus className="w-4 h-4" /> Create First Goal</Button>
          </div>
        ) : (
          <div className="space-y-4">
            {tokens.map((t, i) => {
              const pct = Math.min(100, Math.round((t.tokens_earned / (t.tokens_goal || 1)) * 100));
              const achieved = t.tokens_earned >= t.tokens_goal;
              return (
                <motion.div key={t.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}
                  className={`bg-card border-2 rounded-2xl p-5 transition-all ${achieved ? "border-yellow-400 bg-yellow-50/30" : "border-border"}`}>
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <div className="flex items-center gap-2 mb-0.5">
                        {achieved ? <Trophy className="w-5 h-5 text-yellow-500" /> : <Target className="w-5 h-5 text-primary" />}
                        <p className="font-bold text-foreground">{t.reward_description || `${t.token_name} Reward`}</p>
                      </div>
                      <p className="text-xs text-muted-foreground ml-7">{t.tokens_earned} of {t.tokens_goal} {t.token_name}s earned</p>
                    </div>
                    {!achieved && (
                      <button onClick={() => addToken(t)}
                        className="w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center hover:bg-primary/90 transition-colors shadow-md shadow-primary/20">
                        <Plus className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  {/* Progress bar */}
                  <div className="mb-3">
                    <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
                      <span>{pct}% complete</span>
                      <span>{t.tokens_goal - t.tokens_earned > 0 ? `${t.tokens_goal - t.tokens_earned} to go` : "🎉 Done!"}</span>
                    </div>
                    <div className="h-3 bg-muted rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${achieved ? "bg-yellow-400" : "bg-primary"}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>

                  {/* Star tokens */}
                  <div className="flex flex-wrap gap-1">
                    {[...Array(Math.min(t.tokens_goal, 20))].map((_, idx) => (
                      <Star key={idx} className={`w-4 h-4 transition-colors ${idx < t.tokens_earned ? "text-yellow-400 fill-yellow-400" : "text-muted-foreground/30"}`} />
                    ))}
                    {t.tokens_goal > 20 && <span className="text-xs text-muted-foreground self-center">+{t.tokens_goal - 20} more</span>}
                  </div>

                  {achieved && (
                    <div className="mt-3 flex items-center gap-2 text-yellow-700 bg-yellow-100 rounded-xl px-3 py-2">
                      <Trophy className="w-4 h-4 text-yellow-500" />
                      <p className="text-xs font-semibold">Goal achieved! Time to celebrate 🎉</p>
                    </div>
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