import { useState } from "react";
import { base44 } from '@/api/entities';
import { X, Plus, Trash2, ChevronRight, ChevronLeft, Users, User, Baby, Mail, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { motion } from "framer-motion";

const emptyChild = () => ({ child_name: "", age: "", diagnosis: "", triggers: "", notes: "", is_patient: false });

function generateToken() {
  return Math.random().toString(36).substring(2, 10).toUpperCase();
}

export default function AddFamilyModal({ open, onClose, onSuccess, clinicianId }) {
  const [step, setStep] = useState(0); // 0=Family+Guardian, 1=Children, 2=Done
  const [saving, setSaving] = useState(false);
  const [inviteLink, setInviteLink] = useState("");
  const [family, setFamily] = useState({ family_name: "", notes: "" });
  const [guardian, setGuardian] = useState({ name: "", email: "" });
  const [children, setChildren] = useState([emptyChild()]);

  const setFam = (k, v) => setFamily(p => ({ ...p, [k]: v }));
  const setGrd = (k, v) => setGuardian(p => ({ ...p, [k]: v }));
  const updateChild = (i, k, v) => setChildren(c => c.map((x, idx) => idx === i ? { ...x, [k]: v } : x));
  const addChild = () => setChildren(c => [...c, emptyChild()]);
  const removeChild = (i) => setChildren(c => c.filter((_, idx) => idx !== i));

  const handleSave = async () => {
    setSaving(true);
    const token = generateToken();

    // Create family with invite token
    const fam = await base44.entities.Family.create({
      family_name: family.family_name.trim(),
      notes: family.notes || undefined,
      clinician_id: clinicianId,
      invite_token: token,
      invite_email: guardian.email || undefined,
      invite_status: "pending",
      parent_name: guardian.name || undefined,
    });

    // Create children linked to family
    for (const child of children) {
      if (!child.child_name.trim()) continue;
      await base44.entities.Child.create({
        child_name: child.child_name.trim(),
        age: child.age ? Number(child.age) : undefined,
        diagnosis: child.diagnosis || undefined,
        triggers: child.triggers || undefined,
        notes: child.notes || undefined,
        is_patient: child.is_patient || false,
        family_id: fam.id,
        clinician_id: clinicianId,
        parent_email: guardian.email || undefined,
      });
    }

    // Build invite link
    const baseUrl = window.location.origin;
    const link = `${baseUrl}/RoleSetup?invite=${token}`;
    setInviteLink(link);

    // Send invite email if we have an address
    if (guardian.email) {
      await base44.functions.invoke('sendInviteEmail', {
        to: guardian.email,
        name: guardian.name,
        link,
        type: 'family',
      }).catch(() => {});
    }

    setSaving(false);
    setStep(2);
    onSuccess();
  };

  const handleClose = () => {
    setStep(0);
    setFamily({ family_name: "", notes: "" });
    setGuardian({ name: "", email: "" });
    setChildren([emptyChild()]);
    setInviteLink("");
    onClose();
  };

  const copyLink = () => {
    navigator.clipboard.writeText(inviteLink);
  };

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
            <h2 className="font-semibold text-foreground text-base">Add New Family</h2>
            {step < 2 && <p className="text-xs text-muted-foreground mt-0.5">Step {step + 1} of 2</p>}
          </div>
          <button onClick={handleClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Step indicator */}
        {step < 2 && (
          <div className="px-6 pt-4 flex gap-2 flex-shrink-0">
            {["Family & Guardian", "Children"].map((s, i) => (
              <div key={s} className={`flex-1 h-1.5 rounded-full transition-colors ${i <= step ? "bg-primary" : "bg-muted"}`} />
            ))}
          </div>
        )}

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-1">
          {/* Step 0: Family + Guardian */}
          {step === 0 && (
            <div className="space-y-4">
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                <Users className="w-6 h-6 text-primary" />
              </div>
              <div>
                <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Family Name *</Label>
                <Input
                  value={family.family_name}
                  onChange={(e) => setFam("family_name", e.target.value)}
                  placeholder="e.g. The Johnson Family"
                  className="mt-1.5 rounded-xl border-border"
                />
              </div>
              <div>
                <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Notes (optional)</Label>
                <Textarea
                  value={family.notes}
                  onChange={(e) => setFam("notes", e.target.value)}
                  placeholder="Any general notes about this family..."
                  rows={2}
                  className="mt-1.5 rounded-xl border-border resize-none"
                />
              </div>

              <div className="border-t border-border pt-4">
                <div className="flex items-center gap-2 mb-3">
                  <User className="w-4 h-4 text-accent" />
                  <p className="text-sm font-semibold text-foreground">Primary Guardian</p>
                </div>
                <div className="space-y-3">
                  <div>
                    <Label className="text-xs text-muted-foreground">Guardian Name</Label>
                    <Input value={guardian.name} onChange={e => setGrd("name", e.target.value)} placeholder="Full name" className="mt-1 rounded-xl border-border text-sm" />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Email (for invite)</Label>
                    <Input type="email" value={guardian.email} onChange={e => setGrd("email", e.target.value)} placeholder="parent@email.com" className="mt-1 rounded-xl border-border text-sm" />
                    <p className="text-xs text-muted-foreground mt-1">An invite link will be sent to this email.</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Step 1: Children */}
          {step === 1 && (
            <div className="space-y-5">
              <div className="w-12 h-12 rounded-xl bg-secondary/10 flex items-center justify-center mb-4">
                <Baby className="w-6 h-6 text-secondary" />
              </div>
              <p className="text-xs text-muted-foreground -mt-2">Add the children receiving services. Check "Is the patient/client" for the primary client.</p>
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
                      {c.is_patient && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 12 12"><path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
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

          {/* Step 2: Done / Invite */}
          {step === 2 && (
            <div className="text-center py-4 space-y-5">
              <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-8 h-8 text-green-600" />
              </div>
              <div>
                <h3 className="font-bold text-foreground text-lg">Family Added!</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  {guardian.email ? `An invite email was sent to ${guardian.email}.` : "Share the invite link below with the family."}
                </p>
              </div>
              {inviteLink && (
                <div className="bg-muted rounded-xl p-4 text-left space-y-2">
                  <div className="flex items-center gap-2 mb-1">
                    <Mail className="w-4 h-4 text-primary" />
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Invite Link</p>
                  </div>
                  <p className="text-xs font-mono text-foreground break-all">{inviteLink}</p>
                  <Button variant="outline" size="sm" className="w-full rounded-xl mt-2" onClick={copyLink}>
                    Copy Link
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 pb-6 flex gap-3 flex-shrink-0 border-t border-border pt-4">
          {step === 0 && (
            <Button
              className="flex-1 rounded-xl gap-1.5 bg-primary hover:bg-primary/90"
              disabled={!family.family_name.trim()}
              onClick={() => setStep(1)}
            >
              Next <ChevronRight className="w-4 h-4" />
            </Button>
          )}
          {step === 1 && (
            <>
              <Button variant="outline" className="flex-1 rounded-xl gap-1.5" onClick={() => setStep(0)}>
                <ChevronLeft className="w-4 h-4" /> Back
              </Button>
              <Button
                className="flex-1 rounded-xl bg-primary hover:bg-primary/90"
                onClick={handleSave}
                disabled={saving || !children.some(c => c.child_name.trim())}
              >
                {saving ? "Saving..." : "Save & Send Invite"}
              </Button>
            </>
          )}
          {step === 2 && (
            <Button className="flex-1 rounded-xl bg-primary hover:bg-primary/90" onClick={handleClose}>
              Done
            </Button>
          )}
        </div>
      </motion.div>
    </div>
  );
}