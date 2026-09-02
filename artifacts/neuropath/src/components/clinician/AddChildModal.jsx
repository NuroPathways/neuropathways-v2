import { useState } from "react";
import { base44 } from '@/api/entities';
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { motion, AnimatePresence } from "framer-motion";

export default function AddChildModal({ open, onClose, onSuccess, clinicianId }) {
  const [form, setForm] = useState({ child_name: "", age: "", diagnosis: "", triggers: "", notes: "", parent_email: "" });
  const [saving, setSaving] = useState(false);

  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const handleSave = async () => {
    if (!form.child_name.trim()) return;
    setSaving(true);
    await base44.entities.Child.create({
      child_name: form.child_name,
      age: form.age ? Number(form.age) : undefined,
      diagnosis: form.diagnosis || undefined,
      triggers: form.triggers || undefined,
      notes: form.notes || undefined,
      parent_email: form.parent_email || undefined,
      // parent_id will be linked when the parent signs up via RoleSetup invite flow
      clinician_id: clinicianId,
    });
    setSaving(false);
    setForm({ child_name: "", age: "", diagnosis: "", triggers: "", notes: "", parent_email: "" });
    onSuccess();
    onClose();
  };

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="bg-card rounded-2xl shadow-2xl w-full max-w-md border border-border"
          >
            <div className="flex items-center justify-between p-6 border-b border-border">
              <h2 className="font-semibold text-foreground text-base">Add New Client</h2>
              <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Child's Name *</Label>
                <Input
                  value={form.child_name}
                  onChange={(e) => set("child_name", e.target.value)}
                  placeholder="Full name"
                  className="mt-1.5 rounded-xl border-border"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Age</Label>
                  <Input
                    type="number"
                    value={form.age}
                    onChange={(e) => set("age", e.target.value)}
                    placeholder="e.g. 8"
                    className="mt-1.5 rounded-xl border-border"
                  />
                </div>
                <div>
                  <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Diagnosis</Label>
                  <Input
                    value={form.diagnosis}
                    onChange={(e) => set("diagnosis", e.target.value)}
                    placeholder="e.g. ASD"
                    className="mt-1.5 rounded-xl border-border"
                  />
                </div>
              </div>
              <div>
                <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Known Triggers</Label>
                <Textarea
                  value={form.triggers}
                  onChange={(e) => set("triggers", e.target.value)}
                  placeholder="What commonly triggers difficult behaviors?"
                  rows={2}
                  className="mt-1.5 rounded-xl border-border resize-none"
                />
              </div>
              <div>
                <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Additional Notes</Label>
                <Textarea
                  value={form.notes}
                  onChange={(e) => set("notes", e.target.value)}
                  placeholder="Any other relevant information..."
                  rows={2}
                  className="mt-1.5 rounded-xl border-border resize-none"
                />
              </div>
              <div>
                <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Parent Email (to link account)</Label>
                <Input
                  type="email"
                  value={form.parent_email}
                  onChange={(e) => set("parent_email", e.target.value)}
                  placeholder="parent@email.com"
                  className="mt-1.5 rounded-xl border-border"
                />
              </div>
            </div>

            <div className="px-6 pb-6 flex gap-3">
              <Button variant="outline" className="flex-1 rounded-xl" onClick={onClose}>Cancel</Button>
              <Button
                className="flex-1 rounded-xl bg-primary hover:bg-primary/90"
                onClick={handleSave}
                disabled={saving || !form.child_name.trim()}
              >
                {saving ? "Saving..." : "Add Client"}
              </Button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
