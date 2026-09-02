import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from '@/api/entities';
import { ArrowLeft, Save, Plus, Trash2, CheckCircle2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { motion } from "framer-motion";

const BEHAVIOR_CATEGORIES = [
  { key: "tantrum_meltdown", label: "Tantrum / Meltdown" },
  { key: "aggression", label: "Aggression" },
  { key: "anxiety_episode", label: "Anxiety Episode" },
  { key: "task_refusal", label: "Task Refusal" },
  { key: "bedtime_refusal", label: "Bedtime Refusal" },
  { key: "school_refusal", label: "School Refusal" },
  { key: "transition_difficulty", label: "Transition Difficulty" },
  { key: "emotional_dysregulation", label: "Emotional Dysregulation" },
  { key: "other", label: "Other" },
];

const LABEL = "text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1.5";

function PhaseEditor({ label, placeholder, value, onChange, color = "bg-green-50 border-green-200" }) {
  const lines = value ? value.split("\n") : [""];
  const updateLine = (idx, val) => { const arr = [...lines]; arr[idx] = val; onChange(arr.join("\n")); };
  const addLine = () => onChange(value ? value + "\n" : "");
  const removeLine = (idx) => { const arr = lines.filter((_, i) => i !== idx); onChange(arr.join("\n")); };

  return (
    <div className={`border rounded-2xl p-4 ${color}`}>
      <p className="text-xs font-bold uppercase tracking-wider mb-3 opacity-70">{label}</p>
      <div className="space-y-2">
        {lines.map((line, i) => (
          <div key={i} className="flex gap-2 items-start">
            <span className="text-xs font-bold opacity-50 mt-2.5 w-5 text-center flex-shrink-0">{i + 1}</span>
            <Input value={line} onChange={e => updateLine(i, e.target.value)} placeholder={i === 0 ? placeholder : `Step ${i + 1}...`} className="flex-1 rounded-xl bg-white/80 border-0 shadow-none" />
            {lines.length > 1 && (
              <button onClick={() => removeLine(i)} className="text-muted-foreground hover:text-destructive mt-2 flex-shrink-0">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        ))}
      </div>
      <button onClick={addLine} className="mt-2 text-xs opacity-60 hover:opacity-100 flex items-center gap-1">
        <Plus className="w-3 h-3" /> Add step
      </button>
    </div>
  );
}

export default function InterventionBuilder() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [children, setChildren] = useState([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const planIdParam = new URLSearchParams(window.location.search).get("plan_id");
  const childIdParam = new URLSearchParams(window.location.search).get("child_id");

  const [form, setForm] = useState({
    child_id: childIdParam || "",
    behavior_category: "",
    title: "",
    description: "",
    immediate_steps: "",
    deescalation_steps: "",
    reinforcement_steps: "",
    prevention_tips: "",
    things_to_avoid: "",
    emergency_instructions: "",
    is_active: true,
  });

  useEffect(() => {
    let cancelled = false;

    const loadChildren = async (me) => {
      const kids = await base44.entities.Child.filter({ clinician_id: me.id }, "-created_date", 200).catch(() => []);
      if (cancelled) return kids;
      setChildren(kids);
      return kids;
    };

    const load = async () => {
      const me = await base44.auth.me().catch(() => null);
      if (!me) { setLoading(false); navigate("/"); return; }
      if (cancelled) return;
      setUser(me);
      const kids = await loadChildren(me);

      if (!childIdParam && !planIdParam && kids[0]) {
        setForm(f => ({ ...f, child_id: kids[0].id }));
      }

      if (planIdParam) {
        const plans = await base44.entities.InterventionPlan.filter({ id: planIdParam }).catch(() => []);
        if (plans[0] && !cancelled) setForm({ ...plans[0] });
      }

      if (!cancelled) setLoading(false);

      // Refresh the client list when the user returns to this tab, so a
      // newly created client always appears in the dropdown.
      const onFocus = () => { base44.auth.me().then(u => u && loadChildren(u)).catch(() => {}); };
      window.addEventListener("focus", onFocus);
      cleanup = () => window.removeEventListener("focus", onFocus);
    };

    let cleanup = () => {};
    load();
    return () => { cancelled = true; cleanup(); };
  }, [planIdParam, childIdParam]);

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }));

  const handleSave = async () => {
    if (!form.child_id || !form.behavior_category || !form.title) return;
    setSaving(true);
    if (planIdParam) {
      await base44.entities.InterventionPlan.update(planIdParam, form);
    } else {
      await base44.entities.InterventionPlan.create({ ...form, clinician_id: user?.id });
    }
    setSaved(true);
    setTimeout(() => navigate(-1), 1500);
    setSaving(false);
  };

  if (saved) return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="text-center">
        <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto mb-3" />
        <p className="font-semibold text-foreground text-lg">Intervention Plan Saved!</p>
        <p className="text-sm text-muted-foreground">Parents can now access this plan in the Help Now feature.</p>
      </motion.div>
    </div>
  );

  if (!loading && children.length === 0) return (
    <div className="min-h-screen bg-background font-inter">
      <div className="sticky top-0 z-10 bg-card border-b border-border px-4 py-4 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="text-muted-foreground hover:text-foreground"><ArrowLeft className="w-5 h-5" /></button>
        <h1 className="font-bold text-foreground flex-1">Create Intervention Plan</h1>
      </div>
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-8 text-center">
        <Users className="w-12 h-12 text-muted-foreground mb-4" />
        <p className="font-semibold text-foreground mb-1">No clients yet</p>
        <p className="text-sm text-muted-foreground mb-4">Add a client first before creating an intervention plan.</p>
        <Button onClick={() => navigate("/ClinicianDashboard")} className="rounded-xl">Go to Dashboard</Button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background font-inter">
      <div className="sticky top-0 z-10 bg-card border-b border-border px-4 py-4 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="text-muted-foreground hover:text-foreground"><ArrowLeft className="w-5 h-5" /></button>
        <h1 className="font-bold text-foreground flex-1">{planIdParam ? "Edit" : "Create"} Intervention Plan</h1>
        <Button onClick={handleSave} disabled={saving || !form.child_id || !form.behavior_category || !form.title} size="sm" className="rounded-xl gap-1.5 h-9">
          <Save className="w-3.5 h-3.5" />
          {saving ? "Saving..." : "Save"}
        </Button>
      </div>

      <div className="p-5 max-w-2xl mx-auto space-y-5">
        <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-foreground text-sm">Plan Details</h2>
            <button onClick={() => set("is_active", !form.is_active)} className={`text-xs px-3 py-1 rounded-full font-medium transition-colors ${form.is_active ? "bg-green-100 text-green-700 hover:bg-green-200" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}>
              {form.is_active ? "Active" : "Inactive"}
            </button>
          </div>
          <div>
            <p className={LABEL}>Client *</p>
            <Select value={form.child_id} onValueChange={v => set("child_id", v)}>
              <SelectTrigger className="rounded-xl"><SelectValue placeholder="Select client" /></SelectTrigger>
              <SelectContent>{children.map(c => <SelectItem key={c.id} value={c.id}>{c.child_name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <p className={LABEL}>Behavior Category *</p>
            <Select value={form.behavior_category} onValueChange={v => set("behavior_category", v)}>
              <SelectTrigger className="rounded-xl"><SelectValue placeholder="Select category" /></SelectTrigger>
              <SelectContent>{BEHAVIOR_CATEGORIES.map(c => <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <p className={LABEL}>Plan Title *</p>
            <Input value={form.title} onChange={e => set("title", e.target.value)} placeholder="e.g. Homework Refusal — Demand Reduction" className="rounded-xl" />
          </div>
          <div>
            <p className={LABEL}>Overview / Context</p>
            <Textarea value={form.description} onChange={e => set("description", e.target.value)} placeholder="Describe the behavior and when this plan applies..." className="rounded-xl" rows={3} />
          </div>
        </div>

        <div className="space-y-3">
          <h2 className="font-semibold text-foreground text-sm px-1">Intervention Steps</h2>
          <PhaseEditor label="Phase 1 — Do This Right Now" placeholder="e.g. Speak calmly and reduce demands immediately" value={form.immediate_steps} onChange={v => set("immediate_steps", v)} color="bg-blue-50 border-blue-200" />
          <PhaseEditor label="Phase 2 — De-escalation" placeholder="e.g. Offer a choice of two calming activities" value={form.deescalation_steps} onChange={v => set("deescalation_steps", v)} color="bg-yellow-50 border-yellow-200" />
          <PhaseEditor label="Phase 3 — Reinforcement" placeholder="e.g. Praise the child for calm behavior" value={form.reinforcement_steps} onChange={v => set("reinforcement_steps", v)} color="bg-green-50 border-green-200" />
          <PhaseEditor label="Prevention Tips" placeholder="e.g. Give 5-minute warnings before transitions" value={form.prevention_tips} onChange={v => set("prevention_tips", v)} color="bg-purple-50 border-purple-200" />
          <PhaseEditor label="Things to Avoid" placeholder="e.g. Do not raise your voice" value={form.things_to_avoid} onChange={v => set("things_to_avoid", v)} color="bg-red-50 border-red-200" />
          <PhaseEditor label="Emergency Instructions" placeholder="e.g. Call the clinic if behavior lasts more than 20 minutes" value={form.emergency_instructions} onChange={v => set("emergency_instructions", v)} color="bg-orange-50 border-orange-200" />
        </div>
      </div>
    </div>
  );
}