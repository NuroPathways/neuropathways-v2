import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from '@/api/entities';
import { ArrowLeft, User, FileText, Trash2, Edit2, Save, X, Upload, Download, Plus, Key, Eye, EyeOff, ClipboardList } from "lucide-react";
import ClientGoalsSection from "@/components/clinician/ClientGoalsSection";
import DocScanButton from "@/components/clinician/DocScanButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { motion } from "framer-motion";

export default function ClientDetail() {
  const navigate = useNavigate();
  const childId = new URLSearchParams(window.location.search).get("child_id");
  const [child, setChild] = useState(null);
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [documents, setDocuments] = useState([]);
  const [behaviorLogs, setBehaviorLogs] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [clinicianId, setClinicianId] = useState("");
  const [clientAccount, setClientAccount] = useState(null);
  const [showCode, setShowCode] = useState(false);

  useEffect(() => {
    if (!childId) { navigate("/ClinicianDashboard"); return; }

    const load = async () => {
      const me = await base44.auth.me().catch(() => null);
      if (!me) { navigate("/"); return; }
      setClinicianId(me.id);
      const res = await base44.functions.invoke('getClientDetail', { child_id: childId }).catch(() => null);
      const d = res?.data || {};
      setChild(d.child || null);
      setEditForm(d.child || {});
      setPlans(d.plans || []);
      setDocuments(d.documents || []);
      setBehaviorLogs(d.behavior_logs || d.behaviorLogs || []);
      setClientAccount(d.clientAccount || null);
      setLoading(false);
    };
    load();
  }, [childId]);

  const handleSave = async () => {
    setSaving(true);
    await base44.functions.invoke('manageClientRecord', {
      action: 'updateChild',
      entity_id: childId,
      data: {
        child_name: editForm.child_name,
        age: editForm.age,
        diagnosis: editForm.diagnosis,
        notes: editForm.notes,
        triggers: editForm.triggers,
      },
    });
    setChild(prev => ({ ...prev, ...editForm }));
    setEditing(false);
    setSaving(false);
  };

  const handleUploadDocument = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setUploading(true);
    try {
      const records = await Promise.all(files.map(async (file) => {
        const { file_url } = await base44.integrations.Core.UploadFile({ file });
        const res = await base44.functions.invoke('manageClientRecord', {
          action: 'createDocument',
          data: {
            child_id: childId,
            title: file.name.replace(/\.[^/.]+$/, ""),
            file_url,
            file_name: file.name,
            category: "other",
          },
        });
        return res.data.record;
      }));
      setDocuments(prev => [...prev, ...records]);
    } catch (err) {
      alert(err?.message || "Upload failed. Only PDF, Word, and image files are allowed.");
    }
    setUploading(false);
    e.target.value = "";
  };

  const handleDeleteDoc = async (docId) => {
    await base44.functions.invoke('manageClientRecord', { action: 'deleteDocument', entity_id: docId });
    setDocuments(prev => prev.filter(d => d.id !== docId));
  };

  const handleDelete = async () => {
    if (!window.confirm("Delete this client? This cannot be undone.")) return;
    setDeleting(true);
    await base44.functions.invoke('manageClientRecord', { action: 'deleteChild', entity_id: childId });
    navigate("/ClinicianDashboard");
  };

  if (loading) return <div className="min-h-screen bg-background flex items-center justify-center"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>;
  if (!child) return <div className="min-h-screen bg-background flex items-center justify-center"><p className="text-muted-foreground">Client not found.</p></div>;

  return (
    <div className="min-h-screen bg-background font-inter">
      <div className="sticky top-0 z-10 bg-card border-b border-border px-4 py-4 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="text-muted-foreground hover:text-foreground"><ArrowLeft className="w-5 h-5" /></button>
        <h1 className="font-bold text-foreground flex-1">{child.child_name}</h1>
        <div className="flex items-center gap-2">
          {editing ? (
            <>
              <Button size="sm" variant="outline" className="rounded-xl h-8" onClick={() => setEditing(false)}><X className="w-3.5 h-3.5" /></Button>
              <Button size="sm" className="rounded-xl h-8" onClick={handleSave} disabled={saving}><Save className="w-3.5 h-3.5 mr-1" />{saving ? "Saving..." : "Save"}</Button>
            </>
          ) : (
            <>
              <Button size="sm" variant="outline" className="rounded-xl h-8" onClick={() => setEditing(true)}><Edit2 className="w-3.5 h-3.5" /></Button>
              <Button size="sm" variant="destructive" className="rounded-xl h-8" onClick={handleDelete} disabled={deleting}><Trash2 className="w-3.5 h-3.5" /></Button>
            </>
          )}
        </div>
      </div>

      <div className="p-5 max-w-2xl mx-auto space-y-5">
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="bg-card border border-border rounded-2xl p-5 space-y-4">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
              <User className="w-6 h-6 text-primary" />
            </div>
            <div>
              <p className="font-bold text-foreground">{child.child_name}</p>
              <p className="text-xs text-muted-foreground">Age {child.age}{child.diagnosis ? ` · ${child.diagnosis}` : ""}</p>
            </div>
          </div>

          {editing ? (
            <div className="space-y-3">
              <div><p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Name</p><Input value={editForm.child_name || ""} onChange={e => setEditForm(f => ({ ...f, child_name: e.target.value }))} className="rounded-xl" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Age</p><Input value={editForm.age || ""} onChange={e => setEditForm(f => ({ ...f, age: e.target.value }))} className="rounded-xl" /></div>
                <div><p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Diagnosis</p><Input value={editForm.diagnosis || ""} onChange={e => setEditForm(f => ({ ...f, diagnosis: e.target.value }))} className="rounded-xl" /></div>
              </div>
              <div><p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Triggers</p><Textarea value={editForm.triggers || ""} onChange={e => setEditForm(f => ({ ...f, triggers: e.target.value }))} className="rounded-xl" rows={2} /></div>
              <div><p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Notes</p><Textarea value={editForm.notes || ""} onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))} className="rounded-xl" rows={3} /></div>
            </div>
          ) : (
            <div className="space-y-3">
              {child.diagnosis && <div><p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Diagnosis</p><p className="text-sm text-foreground mt-0.5">{child.diagnosis}</p></div>}
              {child.triggers && <div><p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Triggers</p><p className="text-sm text-foreground mt-0.5">{child.triggers}</p></div>}
              {child.notes && <div><p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Notes</p><p className="text-sm text-foreground mt-0.5">{child.notes}</p></div>}
            </div>
          )}
        </motion.div>

        {/* Documents */}
        <div>
          <div className="flex items-center justify-between mb-3 px-1">
            <h2 className="font-semibold text-foreground text-sm">Documents ({documents.length})</h2>
            <label className="cursor-pointer">
              <input type="file" multiple className="hidden" onChange={handleUploadDocument} disabled={uploading} />
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80 transition-colors">
                {uploading ? <div className="w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                {uploading ? "Uploading..." : "Upload"}
              </span>
            </label>
          </div>
          {documents.length === 0 ? (
            <div className="text-center py-8 border-2 border-dashed border-border rounded-2xl">
              <FileText className="w-7 h-7 text-muted-foreground mx-auto mb-2" />
              <p className="text-xs text-muted-foreground">No documents yet.</p>
              <label className="cursor-pointer mt-3 inline-block">
                <input type="file" multiple className="hidden" onChange={handleUploadDocument} disabled={uploading} />
                <span className="inline-flex items-center gap-1.5 text-xs font-medium bg-primary text-primary-foreground px-3 py-1.5 rounded-lg hover:bg-primary/90 transition-colors">
                  <Upload className="w-3.5 h-3.5" /> Upload Document
                </span>
              </label>
            </div>
          ) : (
            <div className="space-y-2">
              {documents.map((doc) => (
                <div key={doc.id} className="bg-card border border-border rounded-xl p-3 flex items-center gap-3">
                  <FileText className="w-4 h-4 text-primary flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{doc.title}</p>
                    {doc.file_name && <p className="text-xs text-muted-foreground truncate">{doc.file_name}</p>}
                  </div>
                  <DocScanButton doc={doc} clinicianId={clinicianId} />
                  <a href={doc.file_url} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-primary transition-colors"><Download className="w-4 h-4" /></a>
                  <button onClick={() => handleDeleteDoc(doc.id)} className="text-muted-foreground hover:text-destructive transition-colors"><Trash2 className="w-4 h-4" /></button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Credentials */}
        {clientAccount?.username && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="bg-card border border-border rounded-2xl p-4">
            <h2 className="font-semibold text-foreground text-sm flex items-center gap-2 mb-3">
              <Key className="w-4 h-4 text-primary" /> Login Credentials
            </h2>
            <div className="space-y-2">
              <div className="flex items-center justify-between bg-muted/50 rounded-xl px-3 py-2">
                <span className="text-xs text-muted-foreground">Username</span>
                <span className="text-sm font-mono font-semibold text-foreground">{clientAccount.username}</span>
              </div>
              {clientAccount.access_code && (
                <div className="flex items-center justify-between bg-muted/50 rounded-xl px-3 py-2">
                  <span className="text-xs text-muted-foreground">Access Code</span>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-mono font-semibold text-foreground">
                      {showCode ? clientAccount.access_code : "••••••"}
                    </span>
                    <button onClick={() => setShowCode(!showCode)} className="text-muted-foreground hover:text-foreground transition-colors">
                      {showCode ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              )}
              {clientAccount.email && !clientAccount.email.includes("@noemail.") && (
                <div className="flex items-center justify-between bg-muted/50 rounded-xl px-3 py-2">
                  <span className="text-xs text-muted-foreground">Email</span>
                  <span className="text-sm text-foreground">{clientAccount.email}</span>
                </div>
              )}
            </div>
          </motion.div>
        )}

        {/* Goals & Milestones */}
        <ClientGoalsSection childId={childId} clinicianId={clinicianId} />

        {/* Behavior Logs */}
        <div>
          <div className="flex items-center justify-between mb-3 px-1">
            <h2 className="font-semibold text-foreground text-sm">Behavior Logs ({behaviorLogs.length})</h2>
            <Button size="sm" variant="outline" className="rounded-xl gap-1.5 text-xs h-8" onClick={() => navigate(`/LogBehavior?child_id=${childId}`)}>
              <ClipboardList className="w-3.5 h-3.5" /> Log Behavior
            </Button>
          </div>
          {behaviorLogs.length === 0 ? (
            <div className="text-center py-6 border-2 border-dashed border-border rounded-2xl">
              <ClipboardList className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No behavior logs yet.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {behaviorLogs.slice(0, 10).map((log, i) => (
                <motion.div key={log.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }} className="bg-card border border-border rounded-xl p-3 flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-foreground text-sm">{log.behavior_type || "Behavior"}</p>
                      {log.intensity && <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${log.intensity === "high" || log.intensity === "severe" ? "bg-red-100 text-red-700" : log.intensity === "moderate" ? "bg-yellow-100 text-yellow-700" : "bg-green-100 text-green-700"}`}>{log.intensity}</span>}
                    </div>
                    {log.notes && <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{log.notes}</p>}
                  </div>
                  <span className="text-[10px] text-muted-foreground flex-shrink-0">{log.created_at ? new Date(log.created_at).toLocaleDateString() : ""}</span>
                </motion.div>
              ))}
              {behaviorLogs.length > 10 && <p className="text-xs text-muted-foreground text-center py-1">+ {behaviorLogs.length - 10} more</p>}
            </div>
          )}
        </div>

        <div>
          <h2 className="font-semibold text-foreground text-sm mb-3 px-1">Behavior Plans ({plans.length})</h2>
          {plans.length === 0 ? (
            <div className="text-center py-10 border-2 border-dashed border-border rounded-2xl">
              <FileText className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No behavior plans yet.</p>
              <Button size="sm" className="mt-3 rounded-xl" onClick={() => navigate(`/BehaviorPlanBuilder?child_id=${childId}`)}>Create Plan</Button>
            </div>
          ) : (
            <div className="space-y-3">
              {plans.map((plan, i) => (
                <motion.div key={plan.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className="bg-card border border-border rounded-2xl p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-semibold text-foreground text-sm">{plan.behavior_name}</p>
                      {plan.severity_level && <span className={`inline-block mt-1 text-xs px-2 py-0.5 rounded-full font-medium ${plan.severity_level === "crisis" ? "bg-red-100 text-red-700" : plan.severity_level === "high" ? "bg-orange-100 text-orange-700" : plan.severity_level === "moderate" ? "bg-yellow-100 text-yellow-700" : "bg-green-100 text-green-700"}`}>{plan.severity_level}</span>}
                    </div>
                  </div>
                  {plan.behavior_description && <p className="text-xs text-muted-foreground mt-2 line-clamp-2">{plan.behavior_description}</p>}
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}