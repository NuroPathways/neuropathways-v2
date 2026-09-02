import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from '@/api/entities';
import { ChevronLeft, Save, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { motion } from "framer-motion";

const SECTION = ({ title, subtitle, children }) => (
  <div className="bg-card rounded-2xl border border-border p-6 space-y-4">
    <div>
      <h3 className="font-semibold text-foreground text-sm">{title}</h3>
      {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
    </div>
    {children}
  </div>
);

const Field = ({ label, children }) => (
  <div>
    <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</Label>
    <div className="mt-1.5">{children}</div>
  </div>
);

export default function BehaviorPlanBuilder() {
  const navigate = useNavigate();
  const urlParams = new URLSearchParams(window.location.search);
  const preselectedChildId = urlParams.get("child_id") || "";

  const [user, setUser] = useState(null);
  const [children, setChildren] = useState([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [form, setForm] = useState({
    child_id: preselectedChildId,
    behavior_name: "",
    behavior_description: "",
    behavior_function: "",
    common_triggers: "",
    severity_level: "",
    strategy_title: "",
    strategy_steps: "",
    when_to_use: "",
    reinforcement_method: "",
    escalation_signs: "",
    deescalation_steps: "",
    avoid_actions: "",
    safe_space_method: "",
  });

  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  useEffect(() => {
    const load = async () => {
      const me = await base44.auth.me().catch(() => null);
      if (!me) { navigate("/"); return; }
      setUser(me);
      base44.entities.Child.filter({ clinician_id: me.id }).then(setChildren).catch(() => setChildren([]));
    };
    load();
  }, []);

  const handleSave = async () => {
    if (!form.child_id || !form.behavior_name.trim()) return;
    setSaving(true);
    try {
      await base44.entities.BehaviorPlan.create({
        ...form,
        created_by: user?.id,
        clinician_id: user?.id,
      });
      setSaved(true);
      setTimeout(() => navigate("/ClinicianDashboard"), 1500);
    } catch (e) {
      console.error("Failed to save plan:", e);
    }
    setSaving(false);
  };

  if (saved) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-center">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-8 h-8 text-primary" />
          </div>
          <p className="font-semibold text-foreground">Plan saved!</p>
          <p className="text-sm text-muted-foreground mt-1">Redirecting to dashboard…</p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 max-w-3xl mx-auto font-inter pb-20">
      <div className="flex items-center gap-3 mb-8">
        <button onClick={() => navigate("/ClinicianDashboard")} className="text-muted-foreground hover:text-foreground transition-colors">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-xl font-bold text-foreground">Behavior Plan Builder</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Create a comprehensive plan for your client</p>
        </div>
      </div>

      <div className="space-y-6">
        <SECTION title="Client" subtitle="Select the child this plan is for">
          <Field label="Select Client *">
            <Select value={form.child_id} onValueChange={(v) => set("child_id", v)}>
              <SelectTrigger className="rounded-xl border-border">
                <SelectValue placeholder="Choose a client..." />
              </SelectTrigger>
              <SelectContent>
                {children.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.child_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </SECTION>

        <SECTION title="Behavior Details" subtitle="Describe the specific behavior being addressed">
          <Field label="Behavior Name *">
            <Input value={form.behavior_name} onChange={(e) => set("behavior_name", e.target.value)} placeholder="e.g. Homework refusal" className="rounded-xl border-border" />
          </Field>
          <Field label="Description">
            <Textarea value={form.behavior_description} onChange={(e) => set("behavior_description", e.target.value)} placeholder="Describe what the behavior looks like..." rows={3} className="rounded-xl border-border resize-none" />
          </Field>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Behavior Function">
              <Input value={form.behavior_function} onChange={(e) => set("behavior_function", e.target.value)} placeholder="e.g. Escape, Attention" className="rounded-xl border-border" />
            </Field>
            <Field label="Severity Level">
              <Select value={form.severity_level} onValueChange={(v) => set("severity_level", v)}>
                <SelectTrigger className="rounded-xl border-border"><SelectValue placeholder="Select level..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="moderate">Moderate</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="crisis">Crisis</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>
          <Field label="Common Triggers">
            <Textarea value={form.common_triggers} onChange={(e) => set("common_triggers", e.target.value)} placeholder="What typically triggers this behavior?" rows={2} className="rounded-xl border-border resize-none" />
          </Field>
        </SECTION>

        <SECTION title="Intervention Strategy" subtitle="What the caregiver should do">
          <Field label="Strategy Title">
            <Input value={form.strategy_title} onChange={(e) => set("strategy_title", e.target.value)} placeholder="e.g. Calm Down Corner" className="rounded-xl border-border" />
          </Field>
          <Field label="Step-by-Step Instructions">
            <Textarea value={form.strategy_steps} onChange={(e) => set("strategy_steps", e.target.value)} placeholder="1. First, do this... 2. Then..." rows={4} className="rounded-xl border-border resize-none" />
          </Field>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="When to Use">
              <Textarea value={form.when_to_use} onChange={(e) => set("when_to_use", e.target.value)} placeholder="Use this strategy when..." rows={2} className="rounded-xl border-border resize-none" />
            </Field>
            <Field label="Reinforcement Method">
              <Textarea value={form.reinforcement_method} onChange={(e) => set("reinforcement_method", e.target.value)} placeholder="Reward or praise approach..." rows={2} className="rounded-xl border-border resize-none" />
            </Field>
          </div>
        </SECTION>

        <SECTION title="Crisis Protocol" subtitle="Steps for escalated situations">
          <Field label="Signs of Escalation">
            <Textarea value={form.escalation_signs} onChange={(e) => set("escalation_signs", e.target.value)} placeholder="Warning signs to watch for..." rows={2} className="rounded-xl border-border resize-none" />
          </Field>
          <Field label="De-escalation Steps">
            <Textarea value={form.deescalation_steps} onChange={(e) => set("deescalation_steps", e.target.value)} placeholder="Steps to reduce intensity..." rows={3} className="rounded-xl border-border resize-none" />
          </Field>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Actions to Avoid">
              <Textarea value={form.avoid_actions} onChange={(e) => set("avoid_actions", e.target.value)} placeholder="Do NOT do these things..." rows={2} className="rounded-xl border-border resize-none" />
            </Field>
            <Field label="Safe Space Method">
              <Textarea value={form.safe_space_method} onChange={(e) => set("safe_space_method", e.target.value)} placeholder="How to create a calm environment..." rows={2} className="rounded-xl border-border resize-none" />
            </Field>
          </div>
        </SECTION>

        <Button onClick={handleSave} disabled={saving || !form.child_id || !form.behavior_name.trim()} className="w-full rounded-xl" size="lg">
          <Save className="w-4 h-4 mr-2" />
          {saving ? "Saving..." : "Save Behavior Plan"}
        </Button>
      </div>
    </div>
  );
}