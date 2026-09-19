import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import { Camera, Image, FileText, CheckCircle2, Loader2, ArrowLeft, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";

const CATEGORIES = [
  { key: "treatment_plan", label: "Treatment Plan / IEP" },
  { key: "behavior_protocol", label: "Behavior Plan" },
  { key: "session_notes", label: "Progress Report" },
  { key: "worksheet", label: "School Document" },
  { key: "other", label: "Other" },
];

function getInviteToken() {
  try {
    const raw = localStorage.getItem("np_client_session");
    if (!raw) return null;
    return JSON.parse(raw)?.invite_token || null;
  } catch { return null; }
}

function getChildren() {
  try {
    const raw = localStorage.getItem("np_client_session");
    if (!raw) return [];
    const session = JSON.parse(raw);
    return session?.children || [];
  } catch { return []; }
}

export default function ParentUpload() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const cameraRef = useRef(null);
  const galleryRef = useRef(null);
  const fileRef = useRef(null);

  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [category, setCategory] = useState("other");
  const [childId, setChildId] = useState("");
  const [uploading, setUploading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  const children = user?.children || getChildren();
  const inviteToken = user?.invite_token || getInviteToken();

  const handleFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setError("");
    if (f.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = (ev) => setPreview(ev.target.result);
      reader.readAsDataURL(f);
    } else {
      setPreview(null);
    }
    // Auto-select child if only one
    if (children.length === 1 && !childId) {
      setChildId(children[0].id);
    }
  };

  const clearFile = () => {
    setFile(null);
    setPreview(null);
    setError("");
  };

  const handleUpload = async () => {
    if (!file || !inviteToken) return;
    const targetChildId = childId || (children.length === 1 ? children[0].id : null);
    if (!targetChildId) {
      setError("Please select which child this document is for.");
      return;
    }

    setUploading(true);
    setError("");

    try {
      // Step 1: Upload the file
      const formData = new FormData();
      formData.append("file", file);
      formData.append("invite_token", inviteToken);
      formData.append("child_id", targetChildId);

      const uploadRes = await fetch("/api/client-upload", {
        method: "POST",
        body: formData,
      });
      if (!uploadRes.ok) {
        const err = await uploadRes.json().catch(() => ({}));
        throw new Error(err.error || "Upload failed");
      }
      const { file_url, file_name } = await uploadRes.json();

      // Step 2: Create the document record
      const title = file.name
        .replace(/\.[^/.]+$/, "")
        .replace(/[_\-]+/g, " ")
        .replace(/\b\w/g, l => l.toUpperCase())
        .trim();

      const docRes = await fetch("/api/client-upload-document", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invite_token: inviteToken,
          child_id: targetChildId,
          file_url,
          file_name,
          title,
          category,
        }),
      });
      if (!docRes.ok) {
        const err = await docRes.json().catch(() => ({}));
        throw new Error(err.error || "Could not save document record");
      }

      setDone(true);
    } catch (e) {
      setError(e.message || "Something went wrong. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="text-center">
          <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-10 h-10 text-green-500" />
          </div>
          <h2 className="text-xl font-bold text-foreground mb-1">Uploaded!</h2>
          <p className="text-sm text-muted-foreground mb-6">Your clinician can now see this document.</p>
          <div className="flex gap-3 justify-center">
            <Button variant="outline" className="rounded-xl" onClick={() => { setDone(false); clearFile(); }}>
              Upload Another
            </Button>
            <Button className="rounded-xl" onClick={() => navigate(-1)}>
              Done
            </Button>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background font-inter">
      {/* Header */}
      <div className="relative overflow-hidden" style={{ background: "linear-gradient(135deg, hsl(216,38%,47%) 0%, hsl(180,29%,55%) 100%)" }}>
        <div className="relative px-5 pt-4 pb-5 max-w-xl mx-auto">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate(-1)} className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center text-white hover:bg-white/30 transition-colors flex-shrink-0">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-lg font-bold text-white">Upload Document</h1>
              <p className="text-white/60 text-xs">Share a document with your clinician</p>
            </div>
          </div>
        </div>
      </div>

      <div className="p-5 max-w-xl mx-auto space-y-4 -mt-1">
        {/* Capture buttons — big, thumb-friendly */}
        <AnimatePresence mode="wait">
          {!file ? (
            <motion.div key="pick" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-3">
              <button
                onClick={() => cameraRef.current?.click()}
                className="w-full flex items-center gap-4 p-5 bg-card border border-border rounded-2xl hover:border-primary/40 hover:shadow-sm transition-all active:scale-[0.98]"
              >
                <div className="w-14 h-14 rounded-xl bg-blue-50 flex items-center justify-center flex-shrink-0">
                  <Camera className="w-7 h-7 text-blue-600" />
                </div>
                <div className="text-left">
                  <p className="font-semibold text-foreground">Take a Photo</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Use your camera to snap a document</p>
                </div>
              </button>

              <button
                onClick={() => galleryRef.current?.click()}
                className="w-full flex items-center gap-4 p-5 bg-card border border-border rounded-2xl hover:border-primary/40 hover:shadow-sm transition-all active:scale-[0.98]"
              >
                <div className="w-14 h-14 rounded-xl bg-purple-50 flex items-center justify-center flex-shrink-0">
                  <Image className="w-7 h-7 text-purple-600" />
                </div>
                <div className="text-left">
                  <p className="font-semibold text-foreground">Choose from Photos</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Pick an image from your library</p>
                </div>
              </button>

              <button
                onClick={() => fileRef.current?.click()}
                className="w-full flex items-center gap-4 p-5 bg-card border border-border rounded-2xl hover:border-primary/40 hover:shadow-sm transition-all active:scale-[0.98]"
              >
                <div className="w-14 h-14 rounded-xl bg-green-50 flex items-center justify-center flex-shrink-0">
                  <FileText className="w-7 h-7 text-green-600" />
                </div>
                <div className="text-left">
                  <p className="font-semibold text-foreground">Choose a File</p>
                  <p className="text-xs text-muted-foreground mt-0.5">PDF, Word document, or image</p>
                </div>
              </button>

              {/* Hidden file inputs */}
              <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFile} />
              <input ref={galleryRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
              <input ref={fileRef} type="file" accept=".pdf,.doc,.docx,image/*" className="hidden" onChange={handleFile} />
            </motion.div>
          ) : (
            <motion.div key="review" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-4">
              {/* Preview */}
              <div className="bg-card border border-border rounded-2xl p-4">
                <div className="flex items-start gap-3">
                  {preview ? (
                    <img src={preview} alt="Preview" className="w-20 h-20 object-cover rounded-xl flex-shrink-0" />
                  ) : (
                    <div className="w-20 h-20 rounded-xl bg-muted flex items-center justify-center flex-shrink-0">
                      <FileText className="w-8 h-8 text-muted-foreground" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">{file.name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{(file.size / 1024 / 1024).toFixed(1)} MB</p>
                    <button onClick={clearFile} className="flex items-center gap-1 text-xs text-destructive mt-2 font-medium">
                      <X className="w-3 h-3" /> Remove
                    </button>
                  </div>
                </div>
              </div>

              {/* Child selector — only if multiple children */}
              {children.length > 1 && (
                <div className="bg-card border border-border rounded-2xl p-4">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Which child is this for?</p>
                  <div className="space-y-2">
                    {children.map(c => (
                      <button
                        key={c.id}
                        onClick={() => setChildId(c.id)}
                        className={`w-full text-left px-4 py-3 rounded-xl border transition-all ${
                          childId === c.id
                            ? "border-primary bg-primary/5 text-foreground"
                            : "border-border text-muted-foreground hover:border-primary/40"
                        }`}
                      >
                        <span className="font-medium">{c.child_name || c.first_name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Category */}
              <div className="bg-card border border-border rounded-2xl p-4">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">What type of document?</p>
                <div className="flex flex-wrap gap-2">
                  {CATEGORIES.map(cat => (
                    <button
                      key={cat.key}
                      onClick={() => setCategory(cat.key)}
                      className={`px-3 py-2 rounded-xl text-xs font-medium border transition-all ${
                        category === cat.key
                          ? "border-primary bg-primary/5 text-primary"
                          : "border-border text-muted-foreground hover:border-primary/40"
                      }`}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              )}

              <Button
                onClick={handleUpload}
                disabled={uploading}
                className="w-full rounded-xl h-14 text-base font-semibold"
              >
                {uploading ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="w-5 h-5 animate-spin" /> Uploading...
                  </span>
                ) : "Upload to Clinician"}
              </Button>
            </motion.div>
          )}
        </AnimatePresence>

        <p className="text-center text-xs text-muted-foreground px-4">
          Documents are stored securely and shared only with your clinician.
        </p>
      </div>
    </div>
  );
}
