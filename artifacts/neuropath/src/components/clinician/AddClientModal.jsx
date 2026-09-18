import { useState } from "react";
import { base44 } from '@/api/entities';
import { X, Plus, Trash2, ChevronRight, ChevronLeft, User, Baby, Mail, CheckCircle2, AlertCircle, RefreshCw, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { motion } from "framer-motion";

const ACCOUNT_TYPES = [
  { key: "parent_family", label: "Parent / Family", desc: "A parent or guardian managing care for a child", icon: "👨‍👩‍👧" },
  { key: "individual", label: "Individual Client", desc: "The client will use the app directly for their own care", icon: "🧑" },
  { key: "caregiver", label: "Caregiver / Guardian", desc: "A non-parent caregiver managing care for a child", icon: "🤝" },
];

const emptyChild = () => ({ child_name: "", age: "", diagnosis: "", triggers: "", notes: "", is_patient: true });

function generateUsername(firstName, lastName) {
  const f = firstName.toLowerCase().replace(/[^a-z]/g, '').charAt(0) || 'x';
  const l = lastName.toLowerCase().replace(/[^a-z]/g, '').substring(0, 9) || 'user';
  const n = Math.floor(1000 + Math.random() * 8999);
  return `${f}${l}-${n}`;
}


function generateToken() {
  return Math.random().toString(36).substring(2, 10).toUpperCase() +
    Math.random().toString(36).substring(2, 6).toUpperCase();
}

function generateAccessCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

function CopyField({ label, value }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="flex items-center justify-between bg-background rounded-xl px-4 py-3 border border-border">
      <div>
        <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mb-0.5">{label}</p>
        <p className="text-sm font-mono font-bold text-foreground tracking-wide">{value}</p>
      </div>
      <button
        onClick={copy}
        className="flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80 px-3 py-1.5 rounded-lg border border-primary/20 hover:bg-primary/5 transition-colors flex-shrink-0 ml-3 min-h-[36px]"
      >
        {copied ? <><Check className="w-3.5 h-3.5" /> Copied</> : <><Copy className="w-3.5 h-3.5" /> Copy</>}
      </button>
    </div>
  );
}

export default function AddClientModal({ open, onClose, onSuccess, clinicianId }) {
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [emailSent, setEmailSent] = useState(false);
  const [emailError, setEmailError] = useState(false);
  const [resending, setResending] = useState(false);
  const [accountType, setAccountType] = useState(null);

  const [holder, setHolder] = useState({ firstName: "", lastName: "", email: "", phone: "" });
  const [clientName, setClientName] = useState("");
  const [clientNotes, setClientNotes] = useState("");
  const [children, setChildren] = useState([emptyChild()]);
  const [individual, setIndividual] = useState({ age: "", diagnosis: "", goals: "", notes: "" });
  const [credentials, setCredentials] = useState({ username: "", accessCode: "", inviteLink: "", accountEmail: "", isGeneratedEmail: false });

  const setHld = (k, v) => setHolder(p => ({ ...p, [k]: v }));
  const updateChild = (i, k, v) => setChildren(c => c.map((x, idx) => idx === i ? { ...x, [k]: v } : x));
  const addChild = () => setChildren(c => [...c, emptyChild()]);
  const removeChild = (i) => setChildren(c => c.filter((_, idx) => idx !== i));

  const isFamily = accountType === "parent_family" || accountType === "caregiver";
  const fullName = `${holder.firstName.trim()} ${holder.lastName.trim()}`.trim();

  const getSteps = () => isFamily ? ["Account Type", "Account Holder", "Client Profile"] : ["Account Type", "Client Details"];
  const totalSteps = getSteps().length;
  const doneStep = isFamily ? 3 : 2;

  const sendInviteEmail = async (email, name, link, username, accessCode) => {
    const response = await base44.functions.invoke('sendInviteEmail', {
      to: email,
      name,
      link,
      type: accountType,
      username,
      access_code: accessCode,
    });
    if (response.data?.error) throw new Error(response.data.error);
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveError("");
    setEmailError(false);
    setEmailSent(false);

    const token = generateToken();
    const username = generateUsername(holder.firstName, holder.lastName);
    const accessCode = generateAccessCode();
    const baseUrl = window.location.origin;
    // Primary login path is always UsernameLogin — no OAuth required
    const link = `${baseUrl}/UsernameLogin`;

    // Use real email if provided, otherwise generate a placeholder
    const realEmail = holder.email?.trim() || null;
    const generatedEmail = `${username}@clients.neuropathways.app`;
    const accountEmail = realEmail || generatedEmail;
    const isGeneratedEmail = !realEmail;

    try {
      const childPayload = isFamily
        ? children.filter(c => c.child_name.trim()).map(c => ({
            child_name: c.child_name.trim(),
            age: c.age ? Number(c.age) : undefined,
            diagnosis: c.diagnosis || undefined,
            triggers: c.triggers || undefined,
            notes: c.notes || undefined,
            is_patient: c.is_patient || false,
          }))
        : [{
            child_name: fullName,
            age: individual.age ? Number(individual.age) : undefined,
            diagnosis: individual.diagnosis || undefined,
            notes: individual.goals ? `Goals: ${individual.goals}\n${individual.notes || ""}`.trim() : (individual.notes || undefined),
            is_patient: true,
          }];

      const res = await base44.functions.invoke('createClientAccount', {
        accountType: isFamily ? accountType : "individual",
        familyName: isFamily ? (clientName.trim() || `${fullName}'s Family`) : (fullName || "Individual Client"),
        notes: isFamily ? (clientNotes || undefined) : (individual.notes || undefined),
        parentName: fullName || undefined,
        token,
        accountEmail,
        children: childPayload,
        clientAccount: {
          username,
          first_name: holder.firstName.trim(),
          last_name: holder.lastName.trim(),
          phone: holder.phone || undefined,
          access_code: accessCode,
          account_type: accountType || "individual",
        },
      });
      if (res.data?.error) throw new Error(res.data.error);

      setCredentials({ username, accessCode, inviteLink: link, accountEmail, isGeneratedEmail });

      // Send invite email with credentials if a real email was provided
      if (realEmail) {
        try {
          await sendInviteEmail(realEmail, fullName, link, username, accessCode);
          setEmailSent(true);
        } catch {
          setEmailError(true);
        }
      }

      setSaving(false);
      setStep(doneStep);
      onSuccess();
    } catch (err) {
      setSaveError(err?.message || "Something went wrong. Please try again.");
      setSaving(false);
    }
  };

  const handleResend = async () => {
    if (!holder.email || !credentials.inviteLink) return;
    setResending(true);
    setEmailError(false);
    try {
      await sendInviteEmail(holder.email, fullName, credentials.inviteLink, credentials.username, credentials.accessCode);
      setEmailSent(true);
    } catch {
      setEmailError(true);
    }
    setResending(false);
  };

  const handleClose = () => {
    setStep(0);
    setSaveError("");
    setAccountType(null);
    setHolder({ firstName: "", lastName: "", email: "", phone: "" });
    setClientName("");
    setClientNotes("");
    setChildren([emptyChild()]);
    setIndividual({ age: "", diagnosis: "", goals: "", notes: "" });
    setCredentials({ username: "", inviteLink: "", accountEmail: "", isGeneratedEmail: false });
    setEmailSent(false);
    setEmailError(false);
    onClose();
  };

  const canProceedStep1 = accountType !== null;
  const canProceedStep2 = holder.firstName.trim().length > 0 && holder.lastName.trim().length > 0;
  const canSaveFamily = children.some(c => c.child_name.trim()) && holder.firstName.trim() && holder.lastName.trim();
  const canSaveIndividual = holder.firstName.trim().length > 0 && holder.lastName.trim().length > 0;

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-card rounded-2xl shadow-2xl w-full max-w-lg border border-border max-h-[90vh] flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border flex-shrink-0">
          <div>
            <h2 className="font-semibold text-foreground text-base">Add New Client</h2>
            {step > 0 && step < doneStep && <p className="text-xs text-muted-foreground mt-0.5">Step {step} of {totalSteps - 1}</p>}
          </div>
          <button onClick={handleClose} className="text-muted-foreground hover:text-foreground min-w-[44px] min-h-[44px] flex items-center justify-center">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Step indicator */}
        {step < doneStep && (
          <div className="px-6 pt-4 flex gap-2 flex-shrink-0">
            {getSteps().map((s, i) => (
              <div key={s} className={`flex-1 h-1.5 rounded-full transition-colors ${i <= step ? "bg-primary" : "bg-muted"}`} />
            ))}
          </div>
        )}

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-1">

          {/* Step 0: Account Type */}
          {step === 0 && (
            <div className="space-y-4">
              <div>
                <p className="text-sm font-semibold text-foreground mb-1">Who will primarily use this account?</p>
                <p className="text-xs text-muted-foreground mb-4">Choose the account type that best fits this client's situation.</p>
              </div>
              <div className="space-y-3">
                {ACCOUNT_TYPES.map((type) => (
                  <button
                    key={type.key}
                    onClick={() => setAccountType(type.key)}
                    className={`w-full text-left rounded-xl border-2 p-4 flex items-start gap-3 transition-all ${accountType === type.key ? "border-primary bg-primary/5" : "border-border hover:border-primary/40 bg-card"}`}
                  >
                    <span className="text-2xl mt-0.5">{type.icon}</span>
                    <div>
                      <p className="font-semibold text-sm text-foreground">{type.label}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{type.desc}</p>
                    </div>
                    {accountType === type.key && <CheckCircle2 className="w-5 h-5 text-primary ml-auto flex-shrink-0" />}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 1: Account Holder Info */}
          {step === 1 && (
            <div className="space-y-4">
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-2">
                <User className="w-6 h-6 text-primary" />
              </div>
              <p className="text-xs text-muted-foreground -mt-1 mb-2">
                Enter the client's details. A username and access code will be generated automatically — no email required.
              </p>

              {isFamily && (
                <div>
                  <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Client / Family Name</Label>
                  <Input value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="e.g. The Johnson Family" className="mt-1.5 rounded-xl border-border" />
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">First Name *</Label>
                  <Input value={holder.firstName} onChange={(e) => setHld("firstName", e.target.value)} placeholder="First name" className="mt-1.5 rounded-xl border-border" />
                </div>
                <div>
                  <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Last Name *</Label>
                  <Input value={holder.lastName} onChange={(e) => setHld("lastName", e.target.value)} placeholder="Last name" className="mt-1.5 rounded-xl border-border" />
                </div>
              </div>

              <div>
                <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Phone Number</Label>
                <Input type="tel" value={holder.phone} onChange={(e) => setHld("phone", e.target.value)} placeholder="(optional)" className="mt-1.5 rounded-xl border-border" />
              </div>

              <div>
                <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Email <span className="normal-case font-normal text-muted-foreground">(optional)</span>
                </Label>
                <Input type="email" value={holder.email} onChange={(e) => setHld("email", e.target.value)} placeholder="email@example.com" className="mt-1.5 rounded-xl border-border" />
                <p className="text-xs text-muted-foreground mt-1">If provided, an invite email will be sent. Otherwise clients log in with their username + access code.</p>
              </div>

              {!isFamily && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs text-muted-foreground">Age</Label>
                      <Input type="number" value={individual.age} onChange={(e) => setIndividual(p => ({ ...p, age: e.target.value }))} placeholder="e.g. 24" className="mt-1 rounded-xl border-border text-sm" />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Diagnosis</Label>
                      <Input value={individual.diagnosis} onChange={(e) => setIndividual(p => ({ ...p, diagnosis: e.target.value }))} placeholder="e.g. Anxiety" className="mt-1 rounded-xl border-border text-sm" />
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Treatment Goals</Label>
                    <Textarea value={individual.goals} onChange={(e) => setIndividual(p => ({ ...p, goals: e.target.value }))} placeholder="List primary behavioral or therapeutic goals..." rows={2} className="mt-1 rounded-xl border-border resize-none text-sm" />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Notes (optional)</Label>
                    <Textarea value={individual.notes} onChange={(e) => setIndividual(p => ({ ...p, notes: e.target.value }))} placeholder="Any general notes..." rows={2} className="mt-1 rounded-xl border-border resize-none text-sm" />
                  </div>
                </>
              )}
            </div>
          )}

          {/* Step 2 (Family only): Children */}
          {step === 2 && isFamily && (
            <div className="space-y-5">
              <div className="w-12 h-12 rounded-xl bg-secondary/10 flex items-center justify-center mb-2">
                <Baby className="w-6 h-6 text-secondary" />
              </div>
              <p className="text-xs text-muted-foreground -mt-2">Add the child or children receiving services. Check "Is the patient/client" for the primary client.</p>
              {children.map((c, i) => (
                <div key={i} className="bg-background border border-border rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-foreground">Child {i + 1}</p>
                    {children.length > 1 && (
                      <button onClick={() => removeChild(i)} className="text-muted-foreground hover:text-destructive">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Child's Name *</Label>
                    <Input value={c.child_name} onChange={(e) => updateChild(i, "child_name", e.target.value)} placeholder="First name or nickname" className="mt-1 rounded-xl border-border text-sm" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs text-muted-foreground">Age</Label>
                      <Input type="number" value={c.age} onChange={(e) => updateChild(i, "age", e.target.value)} placeholder="e.g. 8" className="mt-1 rounded-xl border-border text-sm" />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Diagnosis</Label>
                      <Input value={c.diagnosis} onChange={(e) => updateChild(i, "diagnosis", e.target.value)} placeholder="e.g. ASD" className="mt-1 rounded-xl border-border text-sm" />
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Known Triggers</Label>
                    <Textarea value={c.triggers} onChange={(e) => updateChild(i, "triggers", e.target.value)} placeholder="What commonly triggers difficult behaviors?" rows={2} className="mt-1 rounded-xl border-border resize-none text-sm" />
                  </div>
                  <label className="flex items-center gap-3 cursor-pointer group">
                    <div
                      onClick={() => updateChild(i, "is_patient", !c.is_patient)}
                      className={`w-5 h-5 rounded flex items-center justify-center border-2 transition-colors flex-shrink-0 ${c.is_patient ? "bg-primary border-primary" : "border-border bg-background"}`}
                    >
                      {c.is_patient && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 12 12"><path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                    </div>
                    <span className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">This is the patient / client</span>
                  </label>
                </div>
              ))}
              <button onClick={addChild} className="flex items-center gap-2 text-sm text-primary hover:text-primary/80 font-medium">
                <Plus className="w-4 h-4" /> Add Another Child
              </button>
            </div>
          )}

          {/* Done: Credentials */}
          {step === doneStep && (
            <div className="space-y-5">
              <div className="text-center">
                <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-3">
                  <CheckCircle2 className="w-8 h-8 text-green-600" />
                </div>
                <h3 className="font-bold text-foreground text-lg">Client Added!</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  {!credentials.isGeneratedEmail && emailSent
                    ? `Invite email sent to ${credentials.accountEmail}.`
                    : !credentials.isGeneratedEmail && emailError
                      ? "Email failed — share the login info below manually."
                      : "Share the login info below with your client."}
                </p>
              </div>

              {/* Login Credentials Card */}
              <div className="bg-primary/5 border border-primary/20 rounded-2xl p-4 space-y-3">
                <p className="text-xs font-semibold text-primary uppercase tracking-wider">🔐 Client Login Info</p>
                <CopyField label="Username" value={credentials.username} />
                <CopyField label="Access Code" value={credentials.accessCode} />
                <div className="bg-background rounded-xl px-4 py-3 border border-border">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mb-0.5">Login URL</p>
                  <p className="text-xs text-primary font-mono">{window.location.origin}/UsernameLogin</p>
                </div>
                <p className="text-xs text-muted-foreground">
                  Share the username and access code with your client. They sign in at the URL above — no email needed.
                </p>
              </div>

              {emailError && !credentials.isGeneratedEmail && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800 space-y-2">
                  <p className="font-semibold">⚠️ Email delivery failed</p>
                  <p>Share the setup link below with your client directly.</p>
                  <Button variant="outline" size="sm" className="w-full rounded-xl gap-1.5" onClick={handleResend} disabled={resending}>
                    {resending ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Resending...</> : <><RefreshCw className="w-3.5 h-3.5" /> Retry Email</>}
                  </Button>
                </div>
              )}

              {/* Share Summary */}
              <div className="bg-muted rounded-xl p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <Mail className="w-4 h-4 text-primary" />
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">What to Share With Your Client</p>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Send them the <strong>username</strong>, <strong>access code</strong>, and the login URL below. They can sign in immediately — no email required.
                </p>
                <div className="bg-background rounded-lg px-3 py-2 border border-border">
                  <p className="text-xs font-mono text-primary break-all">{credentials.inviteLink}</p>
                </div>
                <Button variant="outline" size="sm" className="w-full rounded-xl" onClick={() => {
                  const text = `NeuroPathways Login\nURL: ${credentials.inviteLink}\nUsername: ${credentials.username}\nAccess Code: ${credentials.accessCode}`;
                  navigator.clipboard.writeText(text);
                }}>
                  <Copy className="w-3.5 h-3.5 mr-1.5" /> Copy All Login Info
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 pb-6 flex gap-3 flex-shrink-0 border-t border-border pt-4">
          {step === 0 && (
            <Button className="flex-1 rounded-xl gap-1.5 bg-primary hover:bg-primary/90" disabled={!canProceedStep1} onClick={() => setStep(1)}>
              Next <ChevronRight className="w-4 h-4" />
            </Button>
          )}
          {step === 1 && (
            <>
              <Button variant="outline" className="flex-1 rounded-xl gap-1.5" onClick={() => setStep(0)}>
                <ChevronLeft className="w-4 h-4" /> Back
              </Button>
              {isFamily ? (
                <Button className="flex-1 rounded-xl bg-primary hover:bg-primary/90" disabled={!canProceedStep2} onClick={() => setStep(2)}>
                  Next <ChevronRight className="w-4 h-4" />
                </Button>
              ) : (
                <div className="flex flex-col gap-2 flex-1">
                  {saveError && (
                    <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-xs text-red-700 flex items-start gap-2">
                      <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" /> {saveError}
                    </div>
                  )}
                  <Button className="w-full rounded-xl bg-primary hover:bg-primary/90" onClick={handleSave} disabled={saving || !canSaveIndividual}>
                    {saving ? "Creating Account..." : "Create Account"}
                  </Button>
                </div>
              )}
            </>
          )}
          {step === 2 && isFamily && (
            <div className="flex flex-col gap-2 w-full">
              {saveError && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-xs text-red-700 flex items-start gap-2">
                  <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" /> {saveError}
                </div>
              )}
              <div className="flex gap-3">
                <Button variant="outline" className="flex-1 rounded-xl gap-1.5" onClick={() => setStep(1)}>
                  <ChevronLeft className="w-4 h-4" /> Back
                </Button>
                <Button className="flex-1 rounded-xl bg-primary hover:bg-primary/90" onClick={handleSave} disabled={saving || !canSaveFamily}>
                  {saving ? "Creating Account..." : "Create Account"}
                </Button>
              </div>
            </div>
          )}
          {step === doneStep && (
            <Button className="flex-1 rounded-xl bg-primary hover:bg-primary/90" onClick={handleClose}>
              Done
            </Button>
          )}
        </div>
      </motion.div>
    </div>
  );
}