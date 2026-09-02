import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from '@/api/entities';
import { ArrowLeft, Upload, FileText, Trash2, Loader2, Sparkles, CheckCircle2, X, Plus, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { motion, AnimatePresence } from "framer-motion";

// Rebuilds the child's full ClientProfile from their documents (the reliable, single source of truth
// used by Help Now). Returns the backend result or throws on failure.
async function rebuildProfile(childId) {
  const res = await base44.functions.invoke('buildClientProfile', { child_id: childId });
  if (res.data?.error) throw new Error(res.data.error);
  return res.data;
}

const CATEGORIES = [
  { key: "treatment_plan", label: "Treatment Plan" },
  { key: "behavior_protocol", label: "Behavior Protocol" },
  { key: "worksheet", label: "Worksheet" },
  { key: "session_notes", label: "Session Notes" },
  { key: "visual_schedule", label: "Visual Schedule" },
  { key: "reinforcement_plan", label: "Reinforcement Plan" },
  { key: "coping_strategy", label: "Coping Strategy" },
  { key: "other", label: "Other" },
];

const AUTO_SYNC = ["treatment_plan", "behavior_protocol", "reinforcement_plan", "coping_strategy", "session_notes"];
const LABEL = "text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1";

function cleanTitle(fileName) {
  return fileName
    .replace(/\.[^/.]+$/, "")
    .replace(/[_\-]+/g, " ")
    .replace(/\b\w/g, l => l.toUpperCase())
    .trim();
}

export default function ClinicianDocuments() {
  const navigate = useNavigate();
  const [clinicianId, setClinicianId] = useState("");
  const fileInputRef = useRef(null);
  const [children, setChildren] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  const [queue, setQueue] = useState([]);
  const [childId, setChildId] = useState("");
  const [uploading, setUploading] = useState(false);
  const [scanStatus, setScanStatus] = useState({});

  useEffect(() => {
    const load = async () => {
      const me = await base44.auth.me().catch(() => null);
      if (!me) { navigate("/"); return; }
      setClinicianId(me.id);
      const kids = await base44.entities.Child.filter({ clinician_id: me.id }).catch(() => []);
      setChildren(kids);
      if (kids.length > 0) {
        const results = await Promise.all(
          kids.map(k => base44.entities.Document.filter({ child_id: k.id }).catch(() => []))
        );
        setDocuments(results.flat());
      }
      setLoading(false);
    };
    load();
  }, []);

  const addFiles = (fileList) => {
    const newItems = Array.from(fileList).map(f => ({
      id: Math.random().toString(36).slice(2),
      file: f,
      title: "",
      category: "treatment_plan",
      status: "idle",
    }));
    setQueue(q => [...q, ...newItems]);
  };

  const updateQueue = (id, patch) => setQueue(q => q.map(item => item.id === id ? { ...item, ...patch } : item));
  const removeFromQueue = (id) => setQueue(q => q.filter(item => item.id !== id));

  const handleDrop = (e) => {
    e.preventDefault();
    addFiles(e.dataTransfer.files);
  };

  const handleUploadAll = async () => {
    if (!childId || queue.length === 0 || !clinicianId) return;
    setUploading(true);

    await Promise.all(queue.map(async (item) => {
      updateQueue(item.id, { status: "uploading" });
      try {
        const { file_url } = await base44.integrations.Core.UploadFile({ file: item.file });
        const title = item.title.trim() || cleanTitle(item.file.name);
        const res = await base44.functions.invoke('manageClientRecord', {
          action: 'createDocument',
          data: {
            child_id: childId,
            title,
            category: item.category,
            file_url,
            file_name: item.file.name,
            scan_status: AUTO_SYNC.includes(item.category) ? "pending" : "done",
          },
        });
        if (res.data?.error) throw new Error(res.data.error);
        const doc = res.data.record;
        updateQueue(item.id, { status: "done", docId: doc.id });
        setDocuments(prev => [doc, ...prev]);

        if (AUTO_SYNC.includes(item.category)) {
          setScanStatus(s => ({ ...s, [doc.id]: "scanning" }));
          rebuildProfile(childId).then(() => {
            setScanStatus(s => ({ ...s, [doc.id]: "done" }));
            setDocuments(prev => prev.map(d => d.id === doc.id ? { ...d, scan_status: "done" } : d));
            base44.entities.Document.update(doc.id, { scan_status: "done" }).catch(() => {});
          }).catch(() => {
            setScanStatus(s => ({ ...s, [doc.id]: "error" }));
          });
        }
      } catch {
        updateQueue(item.id, { status: "error" });
      }
    }));

    setUploading(false);
    setTimeout(() => {
      setShowForm(false);
      setQueue([]);
      setChildId("");
    }, 1200);
  };

  const handleDelete = async (docId) => {
    await base44.entities.Document.delete(docId).catch(() => {});
    setDocuments(prev => prev.filter(d => d.id !== docId));
  };

  const manualScan = async (doc) => {
    if (!clinicianId) return;
    setScanStatus(s => ({ ...s, [doc.id]: "scanning" }));
    try {
      await rebuildProfile(doc.child_id);
      setScanStatus(s => ({ ...s, [doc.id]: "done" }));
      setDocuments(prev => prev.map(d => d.id === doc.id ? { ...d, scan_status: "done" } : d));
      base44.entities.Document.update(doc.id, { scan_status: "done" }).catch(() => {});
    } catch {
      setScanStatus(s => ({ ...s, [doc.id]: "error" }));
    }
  };

  const childMap = Object.fromEntries(children.map(c => [c.id, c.child_name]));
  const allDone = queue.length > 0 && queue.every(i => i.status === "done" || i.status === "error");

  const getDocScanStatus = (doc) => {
    if (scanStatus[doc.id]) return scanStatus[doc.id];
    return doc.scan_status || "pending";
  };

  return (
    <div className="min-h-screen bg-background font-inter">
      <div className="sticky top-0 z-10 bg-card border-b border-border px-4 py-4 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="font-bold text-foreground flex-1">Client Documents</h1>
        <Button size="sm" className="rounded-xl gap-1.5 h-8 text-xs" onClick={() => setShowForm(true)}>
          <Upload className="w-3.5 h-3.5" /> Upload
        </Button>
      </div>

      <div className="p-5 max-w-2xl mx-auto">
        <AnimatePresence>
          {showForm && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="bg-card border border-border rounded-2xl p-5 mb-5 space-y-4"
            >
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-foreground">Upload Documents</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">Select multiple files at once. AI scanning runs in the background after upload.</p>
                </div>
                <button onClick={() => { setShowForm(false); setQueue([]); setChildId(""); }} className="text-muted-foreground hover:text-foreground">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div>
                <p className={LABEL}>Client *</p>
                <Select value={childId} onValueChange={setChildId}>
                  <SelectTrigger className="rounded-xl"><SelectValue placeholder="Select client" /></SelectTrigger>
                  <SelectContent>
                    {children.map(c => <SelectItem key={c.id} value={c.id}>{c.child_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div
                onDrop={handleDrop}
                onDragOver={e => e.preventDefault()}
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-border hover:border-primary/60 rounded-xl p-6 text-center cursor-pointer transition-colors"
              >
                <Upload className="w-6 h-6 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm font-medium text-foreground">Drop files here or click to browse</p>
                <p className="text-xs text-muted-foreground mt-1">PDF, DOC, DOCX, PNG, JPG — select multiple</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
                  className="hidden"
                  onChange={e => { addFiles(e.target.files); e.target.value = ""; }}
                />
              </div>

              {queue.length > 0 && (
                <div className="space-y-2 max-h-72 overflow-y-auto">
                  {queue.map(item => (
                    <div key={item.id} className="bg-background border border-border rounded-xl p-3 space-y-2">
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-primary flex-shrink-0" />
                        <span className="text-xs font-medium text-foreground truncate flex-1">{item.file.name}</span>
                        {item.status === "idle" && (
                          <button onClick={() => removeFromQueue(item.id)} className="text-muted-foreground hover:text-destructive flex-shrink-0">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {item.status === "uploading" && <Loader2 className="w-3.5 h-3.5 animate-spin text-primary flex-shrink-0" />}
                        {item.status === "done" && <CheckCircle2 className="w-3.5 h-3.5 text-green-600 flex-shrink-0" />}
                        {item.status === "error" && <span className="text-xs text-destructive flex-shrink-0">Failed</span>}
                      </div>
                      {item.status === "idle" && (
                        <div className="flex gap-2">
                          <Input
                            value={item.title}
                            onChange={e => updateQueue(item.id, { title: e.target.value })}
                            placeholder={cleanTitle(item.file.name)}
                            className="rounded-lg text-xs h-7 flex-1"
                          />
                          <Select value={item.category} onValueChange={v => updateQueue(item.id, { category: v })}>
                            <SelectTrigger className="rounded-lg h-7 text-xs w-40 flex-shrink-0">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {CATEGORIES.map(c => <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                    </div>
                  ))}
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 font-medium py-1"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add more files
                  </button>
                </div>
              )}

              <div className="flex gap-2 pt-1">
                <Button
                  className="flex-1 rounded-xl gap-1.5"
                  onClick={handleUploadAll}
                  disabled={uploading || !childId || queue.length === 0 || allDone}
                >
                  {uploading
                    ? <><Loader2 className="w-4 h-4 animate-spin" /> Uploading {queue.filter(i => i.status === "uploading").length}/{queue.length}...</>
                    : allDone
                      ? <><CheckCircle2 className="w-4 h-4" /> All Uploaded!</>
                      : <><Upload className="w-4 h-4" /> Upload {queue.length > 0 ? queue.length + " File" + (queue.length > 1 ? "s" : "") : ""}</>
                  }
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {loading ? (
          <div className="space-y-3">{[1, 2, 3].map(i => <div key={i} className="h-16 bg-muted rounded-xl animate-pulse" />)}</div>
        ) : documents.length === 0 ? (
          <div className="text-center py-16 border-2 border-dashed border-border rounded-2xl">
            <FileText className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="font-medium text-foreground mb-1">No documents uploaded yet</p>
            <p className="text-sm text-muted-foreground">Upload care documents, treatment plans, and behavioral protocols for your clients.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {children
              .filter(child => documents.some(d => d.child_id === child.id))
              .map(child => {
                const childDocs = documents.filter(d => d.child_id === child.id);
                return (
                  <div key={child.id}>
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <span className="text-xs font-bold text-primary">{child.child_name?.[0]?.toUpperCase()}</span>
                      </div>
                      <h3 className="font-semibold text-foreground text-sm">{child.child_name}</h3>
                      <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{childDocs.length} doc{childDocs.length !== 1 ? "s" : ""}</span>
                    </div>
                    <div className="space-y-2">
                      {childDocs.map((doc) => {
                        const docStatus = getDocScanStatus(doc);
                        return (
                          <div
                            key={doc.id}
                            className="flex items-center gap-4 p-4 bg-card border border-border rounded-2xl"
                          >
                            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                              <FileText className="w-4 h-4 text-primary" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <a href={doc.file_url} target="_blank" rel="noreferrer" className="text-sm font-semibold text-foreground hover:text-primary truncate block">
                                {doc.title}
                              </a>
                              <p className="text-xs text-muted-foreground">{doc.category && doc.category.replace(/_/g, " ")}</p>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              {docStatus === "scanning" && (
                                <span className="flex items-center gap-1 text-xs text-primary font-medium">
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Scanning...
                                </span>
                              )}
                              {docStatus === "done" && (
                                <span className="flex items-center gap-1 text-xs text-green-600 font-medium">
                                  <CheckCircle2 className="w-3.5 h-3.5" /> Synced
                                </span>
                              )}
                              {docStatus === "error" && (
                                <span className="text-xs text-destructive font-medium">Scan failed</span>
                              )}
                              {docStatus !== "scanning" && (
                                <button
                                  onClick={() => manualScan(doc)}
                                  title={docStatus === "done" ? "Re-scan document" : "Scan document"}
                                  className="flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-lg border border-border hover:border-primary hover:text-primary text-muted-foreground transition-colors"
                                >
                                  {docStatus === "done" ? <RefreshCw className="w-3 h-3" /> : <Sparkles className="w-3 h-3" />}
                                  {docStatus === "done" ? "Re-scan" : "Scan"}
                                </button>
                              )}
                              <button onClick={() => handleDelete(doc.id)} className="text-muted-foreground hover:text-destructive">
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })
            }
          </div>
        )}
      </div>
    </div>
  );
}