import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from '@/api/entities';
import { ArrowLeft, CheckCircle2, ClipboardList, ChevronDown, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/lib/AuthContext";
import { toast } from "sonner";

const LABEL = "text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5";

// Dropdown + optional "Other" free-text field
function SmartSelect({ label, options, value, onValueChange, placeholder, textPlaceholder, required }) {
  const isOther = value === "__other__";
  const [customText, setCustomText] = useState("");

  // If switching away from "other", clear custom text
  const handleChange = (v) => {
    if (v !== "__other__") setCustomText("");
    onValueChange(v === "__other__" ? "__other__" : v, v === "__other__" ? "" : v);
  };

  const handleCustom = (t) => {
    setCustomText(t);
    onValueChange("__other__", t);
  };

  // If no options, render plain text input
  if (!options || options.length === 0) {
    return (
      <Textarea
        value={isOther ? customText : value}
        onChange={e => onValueChange("__other__", e.target.value)}
        placeholder={textPlaceholder || placeholder}
        className="rounded-xl"
        rows={2}
      />
    );
  }

  return (
    <div className="space-y-2">
      <Select value={value} onValueChange={handleChange}>
        <SelectTrigger className="rounded-xl">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map((opt, i) => (
            <SelectItem key={i} value={opt}>
              {opt}
            </SelectItem>
          ))}
          <SelectItem value="__other__">✏️ Other — type below</SelectItem>
        </SelectContent>
      </Select>
      <AnimatePresence>
        {isOther && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <Textarea
              value={customText}
              onChange={e => handleCustom(e.target.value)}
              placeholder={textPlaceholder || "Type here..."}
              className="rounded-xl mt-1"
              rows={2}
              autoFocus
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function LogBehavior() {
  const navigate = useNavigate();
  const { user: authUser, isLoadingAuth } = useAuth();
  const [children, setChildren] = useState([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [behaviorOptions, setBehaviorOptions] = useState([]);
  const [interventionOptions, setInterventionOptions] = useState([]);
  const [loadingOptions, setLoadingOptions] = useState(false);

  const childIdParam = new URLSearchParams(window.location.search).get("child_id");
  const behaviorParam = new URLSearchParams(window.location.search).get("behavior") || "";

  const [form, setForm] = useState({
    child_id: childIdParam || "",
    behavior_type: behaviorParam,
    behavior_type_raw: behaviorParam, // actual string to save
    trigger: "",
    duration: "",
    intensity: "",
    intervention_used: "__none__",
    intervention_used_raw: "", // actual string to save
    outcome: "",
    notes: "",
  });

  const user = authUser;

  // Load children
  useEffect(() => {
    if (isLoadingAuth) return;
    const load = async () => {
      const me = authUser;
      if (!me) return;
      let kids = [];
      if (me.children && me.children.length > 0) {
        kids = me.children;
      } else {
        const byId = await base44.entities.Child.filter({ parent_id: me.id }).catch(() => []);
        const byEmail = me.email ? await base44.entities.Child.filter({ parent_email: me.email }).catch(() => []) : [];
        const seen = new Set();
        kids = [...byId, ...byEmail].filter(c => { if (seen.has(c.id)) return false; seen.add(c.id); return true; });
      }
      setChildren(kids);
      if (!form.child_id && kids[0]) setForm(f => ({ ...f, child_id: kids[0].id }));
    };
    load();
  }, [isLoadingAuth, authUser?.id]);

  // Load behavior + intervention options whenever child changes
  useEffect(() => {
    if (!form.child_id || !user) return;
    const loadOptions = async () => {
      setLoadingOptions(true);
      try {
        const isClientSession = !user.role && !user.app_role;
        let plans = [], interventionPlans = [], profile = null;

        if (isClientSession) {
          const res = await base44.functions.invoke("getClientPortalData", {
            child_id: form.child_id,
            account_id: user.id,
            invite_token: user.invite_token,
          }).catch(() => null);
          const data = res?.data || {};
          plans = data.plans || [];
          interventionPlans = data.interventionPlans || [];
          profile = data.profile || null;
        } else {
          [plans, interventionPlans] = await Promise.all([
            base44.entities.BehaviorPlan.filter({ child_id: form.child_id }).catch(() => []),
            base44.entities.InterventionPlan.filter({ child_id: form.child_id }).catch(() => []),
          ]);
        }

        // ── Behavior options ────────────────────────────────
        const seen = new Set();
        const behaviors = [];
        // From AI profile behaviors
        for (const b of (profile?.behaviors || [])) {
          const n = (b.name || "").trim();
          if (n && !seen.has(n.toLowerCase())) { seen.add(n.toLowerCase()); behaviors.push(n); }
        }
        // From behavior plan records
        for (const p of plans) {
          const n = (p.behavior_name || "").trim();
          if (n && !seen.has(n.toLowerCase())) { seen.add(n.toLowerCase()); behaviors.push(n); }
        }
        setBehaviorOptions(behaviors);

        // ── Intervention options ────────────────────────────
        const iseen = new Set();
        const interventions = [];
        // From AI profile behavior interventions
        for (const b of (profile?.behaviors || [])) {
          for (const iv of (b.interventions || [])) {
            const n = (iv || "").trim();
            if (n && !iseen.has(n.toLowerCase())) { iseen.add(n.toLowerCase()); interventions.push(n); }
          }
        }
        // From behavior plan strategy steps (one per line)
        for (const p of plans) {
          const raw = (p.strategy_steps || "").split(/\n+/).map(s => s.trim()).filter(Boolean);
          for (const s of raw) {
            if (!iseen.has(s.toLowerCase())) { iseen.add(s.toLowerCase()); interventions.push(s); }
          }
        }
        // From intervention plan titles
        for (const ip of interventionPlans) {
          const n = (ip.title || "").trim();
          if (n && !iseen.has(n.toLowerCase())) { iseen.add(n.toLowerCase()); interventions.push(n); }
        }
        setInterventionOptions(interventions);
      } finally {
        setLoadingOptions(false);
      }
    };
    loadOptions();
  }, [form.child_id, user?.id]);

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }));

  // Handle SmartSelect changes — stores both the dropdown value and the raw string
  const handleBehaviorChange = (dropdownVal, rawVal) => {
    setForm(f => ({
      ...f,
      behavior_type: dropdownVal,
      behavior_type_raw: dropdownVal === "__other__" ? rawVal : dropdownVal,
    }));
  };

  const handleInterventionChange = (dropdownVal, rawVal) => {
    setForm(f => ({
      ...f,
      intervention_used: dropdownVal,
      intervention_used_raw: dropdownVal === "__other__" ? rawVal : (dropdownVal === "__none__" ? "" : dropdownVal),
    }));
  };

  const handleSave = async () => {
    const behaviorRaw = form.behavior_type_raw.trim();
    if (!form.child_id || !behaviorRaw) {
      toast.error("Please select or enter a behavior type before saving.");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        child_id: form.child_id,
        parent_id: user?.id,
        behavior_type: behaviorRaw,
        context: form.trigger,
        intensity: form.intensity || undefined,
        strategy_used: form.intervention_used_raw || undefined,
        parent_feedback: form.outcome === "resolved" ? "yes" : form.outcome === "partially" ? "partially" : form.outcome === "escalated" ? "no" : undefined,
      };
      // Client session users need to pass invite_token so the server can authorize
      const inviteToken = user?.invite_token;
      if (inviteToken) payload.invite_token = inviteToken;
      await base44.entities.BehaviorLog.create(payload);
      base44.entities.EngagementEvent.create({
        child_id: form.child_id,
        parent_id: user?.id,
        event_type: "behavior_logged",
        topic: behaviorRaw,
        metadata: { outcome: form.outcome, intensity: form.intensity },
      }).catch(() => {});
      setSaveError("");
      setSaved(true);
      setTimeout(() => navigate(-1), 1800);
    } catch {
      setSaveError("Couldn't save — please check your connection and try again.");
    } finally {
      setSaving(false);
    }
  };

  const behaviorReady = form.behavior_type_raw.trim().length > 0;

  if (saved) return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="text-center px-6">
        <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
          <CheckCircle2 className="w-10 h-10 text-green-500" />
        </div>
        <p className="font-bold text-foreground text-xl mb-1">Behavior Logged!</p>
        <p className="text-sm text-muted-foreground">Your clinician can now review this entry.</p>
      </motion.div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background font-inter">
      {/* Header */}
      <div className="relative overflow-hidden" style={{ background: "linear-gradient(135deg, hsl(270,50%,55%) 0%, hsl(250,45%,60%) 100%)" }}>
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-2 right-8 w-24 h-24 rounded-full bg-white" />
        </div>
        <div className="relative px-5 pt-5 pb-7 max-w-xl mx-auto">
          <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-white/70 hover:text-white text-sm mb-5 transition-colors">
            <ArrowLeft className="w-4 h-4" /> Back
          </button>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
              <ClipboardList className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">Log Behavior</h1>
              <p className="text-white/60 text-xs">Document what happened for your clinician</p>
            </div>
          </div>
        </div>
      </div>

      <div className="p-5 max-w-xl mx-auto space-y-4 -mt-1">
        {/* Child selector */}
        {children.length > 0 && (
          <div className="bg-card border border-border rounded-2xl p-4">
            <p className={LABEL}>Child *</p>
            <Select value={form.child_id} onValueChange={v => set("child_id", v)}>
              <SelectTrigger className="rounded-xl"><SelectValue placeholder="Select child" /></SelectTrigger>
              <SelectContent>
                {children.map(c => <SelectItem key={c.id} value={c.id}>{c.child_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}

        {!isLoadingAuth && children.length === 0 && (
          <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-2xl px-4 py-3">
            No child profile is linked to your account, so this log can't be saved. Please ask your clinician to set up a child profile for you.
          </div>
        )}

        {/* What happened */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="bg-card border border-border rounded-2xl p-5 space-y-4">
          <h2 className="font-semibold text-foreground text-sm">What Happened?</h2>

          <div>
            <p className={LABEL}>Behavior Type *</p>
            {loadingOptions ? (
              <div className="h-10 bg-muted rounded-xl animate-pulse" />
            ) : (
              <SmartSelect
                options={behaviorOptions}
                value={form.behavior_type}
                onValueChange={handleBehaviorChange}
                placeholder="Select behavior..."
                textPlaceholder="Describe the behavior (e.g. Meltdown, Aggression, Refusal)"
              />
            )}
          </div>

          <div>
            <p className={LABEL}>What happened before? (Trigger)</p>
            <Textarea
              value={form.trigger}
              onChange={e => set("trigger", e.target.value)}
              placeholder="Describe what seemed to trigger the behavior..."
              className="rounded-xl"
              rows={2}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className={LABEL}>Duration</p>
              <Input value={form.duration} onChange={e => set("duration", e.target.value)} placeholder="e.g. 10 mins" className="rounded-xl" />
            </div>
            <div>
              <p className={LABEL}>Severity</p>
              <Select value={form.intensity} onValueChange={v => set("intensity", v)}>
                <SelectTrigger className="rounded-xl"><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">🟢 Low</SelectItem>
                  <SelectItem value="moderate">🟡 Moderate</SelectItem>
                  <SelectItem value="high">🔴 High</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </motion.div>

        {/* What did you do */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="bg-card border border-border rounded-2xl p-5 space-y-4">
          <h2 className="font-semibold text-foreground text-sm">What Did You Do?</h2>

          <div>
            <p className={LABEL}>Strategy / Intervention Used</p>
            {loadingOptions ? (
              <div className="h-10 bg-muted rounded-xl animate-pulse" />
            ) : (
              <SmartSelect
                options={interventionOptions}
                value={form.intervention_used}
                onValueChange={handleInterventionChange}
                placeholder="Select strategy used..."
                textPlaceholder="Describe what you tried..."
              />
            )}
          </div>

          <div>
            <p className={LABEL}>How Did It Go?</p>
            <Select value={form.outcome} onValueChange={v => set("outcome", v)}>
              <SelectTrigger className="rounded-xl"><SelectValue placeholder="Select outcome" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="resolved">✅ Resolved — Worked well</SelectItem>
                <SelectItem value="partially">🔄 Partially — Some improvement</SelectItem>
                <SelectItem value="escalated">⚠️ Escalated — Got worse</SelectItem>
                <SelectItem value="ongoing">⏳ Ongoing — Still happening</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <p className={LABEL}>Additional Notes</p>
            <Textarea
              value={form.notes}
              onChange={e => set("notes", e.target.value)}
              placeholder="Anything else your clinician should know..."
              className="rounded-xl"
              rows={3}
            />
          </div>
        </motion.div>

        {saveError && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {saveError}
          </div>
        )}

        <Button
          onClick={handleSave}
          disabled={saving || !form.child_id || !behaviorReady}
          className="w-full rounded-xl h-12 text-base font-semibold"
        >
          {saving ? "Saving..." : "Save Behavior Log"}
        </Button>
      </div>
    </div>
  );
}
