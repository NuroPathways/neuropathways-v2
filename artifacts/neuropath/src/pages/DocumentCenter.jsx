import { useState, useEffect, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { base44 } from '@/api/entities';
import { useAuth } from "@/lib/AuthContext";
import { ArrowLeft, Search, FileText, Download, FolderOpen, Upload } from "lucide-react";
import { Input } from "@/components/ui/input";
import { motion } from "framer-motion";
import DocScanButton from "@/components/clinician/DocScanButton";
import { openAuthenticatedFile } from "@/lib/authenticatedFile";

const CATEGORY_LABELS = {
  treatment_plan: "Treatment Plan",
  behavior_protocol: "Behavior Protocol",
  worksheet: "Worksheet",
  session_notes: "Session Notes",
  visual_schedule: "Visual Schedule",
  reinforcement_plan: "Reinforcement Plan",
  coping_strategy: "Coping Strategy",
  other: "Other",
};

const CATEGORY_COLORS = {
  treatment_plan: "bg-blue-100 text-blue-700",
  behavior_protocol: "bg-purple-100 text-purple-700",
  worksheet: "bg-green-100 text-green-700",
  session_notes: "bg-yellow-100 text-yellow-700",
  visual_schedule: "bg-orange-100 text-orange-700",
  reinforcement_plan: "bg-teal-100 text-teal-700",
  coping_strategy: "bg-pink-100 text-pink-700",
  other: "bg-gray-100 text-gray-700",
};

const CATEGORY_ICON_COLORS = {
  treatment_plan: "bg-blue-50 text-blue-500",
  behavior_protocol: "bg-purple-50 text-purple-500",
  worksheet: "bg-green-50 text-green-500",
  session_notes: "bg-yellow-50 text-yellow-600",
  visual_schedule: "bg-orange-50 text-orange-500",
  reinforcement_plan: "bg-teal-50 text-teal-500",
  coping_strategy: "bg-pink-50 text-pink-500",
  other: "bg-gray-50 text-gray-500",
};

function scanDetails(doc) {
  const status = String(doc.scan_status ?? doc.scanStatus ?? "pending").toLowerCase();
  if (["done", "scanned", "complete", "completed", "ready"].includes(status)) {
    const notice = doc.scan_error || doc.scanError || "";
    return notice
      ? { label: "Read with safety note", className: "bg-amber-100 text-amber-800", error: notice, errorClass: "text-amber-800" }
      : { label: "Read by NeuroPath AI", className: "bg-green-100 text-green-700", error: "", errorClass: "text-red-700" };
  }
  if (["error", "failed"].includes(status)) {
    return { label: "Could not be read", className: "bg-red-100 text-red-700", error: doc.scan_error || doc.scanError || "Try scanning this document again.", errorClass: "text-red-700" };
  }
  if (["scanning", "processing"].includes(status)) {
    return { label: "Reading now", className: "bg-amber-100 text-amber-800", error: "" };
  }
  return { label: "Not read yet", className: "bg-amber-100 text-amber-800", error: "" };
}

export default function DocumentCenter({ embedded = false }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState("all");
  const [children, setChildren] = useState([]);
  const [isIndividual, setIsIndividual] = useState(false);
  const [fileError, setFileError] = useState("");
  const requestedChildId = searchParams.get("child_id");

  const loadDocuments = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setFileError("");
    try {
      const me = user;
      setIsIndividual(me.account_type === "individual");

      // Resolve children the same way the Layout does, so username+code client
      // sessions (which carry their children on the session) also work.
      let kids = [];
      if (me.children && me.children.length > 0) {
        kids = me.children;
      } else {
        const [byId, byEmail] = await Promise.all([
          base44.entities.Child.filter({ parent_id: me.id }).catch(() => []),
          me.email ? base44.entities.Child.filter({ parent_email: me.email }).catch(() => []) : Promise.resolve([]),
        ]);
        const seen = new Set();
        kids = [...byId, ...byEmail].filter(c => { if (seen.has(c.id)) return false; seen.add(c.id); return true; });
      }
      if (me.invite_token && kids.length === 0 && me.id) {
        kids = [{ id: me.id, child_name: me.child_name }];
      }

      if (!me.account_type && kids.length > 0) {
        const familyId = me.linked_family_id || kids[0]?.family_id;
        if (familyId) {
          const fams = await base44.entities.Family.filter({ id: familyId }).catch(() => []);
          if (fams[0]?.account_type === "individual") setIsIndividual(true);
        } else if (kids.length === 1 && kids[0]?.is_patient) {
          setIsIndividual(true);
        }
      }

      setChildren(kids);

      // Fetch docs through the same authorized backend ChildProfile uses, so the
      // documents always match what's shown there (service-role, RLS-safe).
      const docResults = await Promise.all(
        kids.map(async c => {
          const result = await base44.functions.invoke('getClientPortalData', {
            child_id: c.id,
            account_id: me.id,
            invite_token: me.invite_token,
          });
          if (!result?.data) throw new Error("The document list could not be loaded.");
          return result.data.documents || [];
        })
      );
      const seenIds = new Set();
      setDocuments(docResults.flat().filter(d => { if (seenIds.has(d.id)) return false; seenIds.add(d.id); return true; }));
    } catch (error) {
      setDocuments([]);
      setFileError(error?.message || "Documents could not be loaded. Please sign in again and retry.");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { void loadDocuments(); }, [loadDocuments]);

  const childMap = Object.fromEntries(children.map(c => [c.id, c.child_name]));
  const visibleDocuments = requestedChildId
    ? documents.filter((doc) => !doc.child_id || String(doc.child_id) === String(requestedChildId))
    : documents;

  const filtered = visibleDocuments.filter(doc => {
    const matchSearch = search === "" || doc.title?.toLowerCase().includes(search.toLowerCase());
    const matchCat = filterCat === "all" || doc.category === filterCat;
    return matchSearch && matchCat;
  });
  const categories = [...new Set(visibleDocuments.map(d => d.category).filter(Boolean))];

  return (
    <div className="min-h-screen bg-background font-inter">
      {/* Header */}
      <div className="relative overflow-hidden" style={{ background: "linear-gradient(135deg, hsl(216,38%,40%) 0%, hsl(180,34%,32%) 100%)" }}>
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-2 right-8 w-24 h-24 rounded-full bg-white" />
        </div>
        <div className="relative px-5 pt-5 pb-7 max-w-2xl mx-auto">
          {!embedded && <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-white/90 hover:text-white text-sm mb-5 transition-colors">
            <ArrowLeft className="w-4 h-4" /> Back
          </button>}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
                <FolderOpen className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-white">Document Center</h1>
                <p className="text-white/80 text-xs">Keep your child's plans and important documents organized in one place. {visibleDocuments.length} file{visibleDocuments.length !== 1 ? "s" : ""}.</p>
              </div>
            </div>
            <button onClick={() => navigate("/ParentUpload")} className="flex items-center gap-2 px-4 py-2.5 bg-white/20 hover:bg-white/30 text-white rounded-xl text-sm font-medium transition-colors">
              <Upload className="w-4 h-4" /> Upload
            </button>
          </div>
        </div>
      </div>

      <div className="px-5 py-5 max-w-2xl mx-auto -mt-2">
        {fileError && documents.length > 0 && (
          <p role="alert" className="mb-4 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {fileError}
          </p>
        )}
        {/* Search */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search documents..." className="pl-9 rounded-xl" />
        </div>

        {/* Category Filters */}
        {categories.length > 1 && (
          <div className="flex gap-2 overflow-x-auto pb-2 mb-4 scrollbar-hide">
            <button onClick={() => setFilterCat("all")}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${filterCat === "all" ? "bg-primary text-white" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}>
              All
            </button>
            {categories.map(cat => (
              <button key={cat} onClick={() => setFilterCat(cat)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${filterCat === cat ? "bg-primary text-white" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}>
                {CATEGORY_LABELS[cat] || cat}
              </button>
            ))}
          </div>
        )}

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => <div key={i} className="h-20 bg-muted rounded-2xl animate-pulse" />)}
          </div>
        ) : fileError && documents.length === 0 ? (
          <div role="alert" className="text-center py-12 border border-destructive/30 bg-destructive/5 rounded-2xl">
            <p className="font-medium text-foreground mb-1">Documents could not be loaded</p>
            <p className="text-sm text-muted-foreground">{fileError}</p>
            <button onClick={loadDocuments} className="mt-4 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold">Try again</button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 border-2 border-dashed border-border rounded-2xl">
            <FileText className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="font-medium text-foreground mb-1">No documents yet</p>
            <p className="text-sm text-muted-foreground">Documents you upload or that your care team shares will appear here.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((doc, i) => (
              <motion.div
                key={doc.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
                className="flex items-center gap-3 p-4 bg-card border border-border rounded-2xl hover:border-primary/40 hover:shadow-sm transition-all"
              >
                <a
                  href={doc.file_url}
                  target="_blank"
                  rel="noreferrer"
                  onClick={event => openAuthenticatedFile(event, doc.file_url, setFileError)}
                  className="flex items-center gap-3 flex-1 min-w-0 group"
                >
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${CATEGORY_ICON_COLORS[doc.category] || "bg-muted text-muted-foreground"}`}>
                    <FileText className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">{doc.title}</p>
                    <div className="flex flex-wrap items-center gap-2 mt-1">
                      {doc.category && (
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${CATEGORY_COLORS[doc.category] || "bg-muted text-muted-foreground"}`}>
                          {CATEGORY_LABELS[doc.category] || doc.category}
                        </span>
                      )}
                      <span className="text-xs text-muted-foreground">
                        {doc.parent_id === user?.id || doc.uploaded_by_parent
                          ? "Uploaded by Parent"
                          : doc.clinician_id || doc.clinician_name || doc.shared_by_clinician
                            ? "Shared by Clinician"
                            : "In your account"}
                      </span>
                      {!isIndividual && doc.child_id && childMap[doc.child_id] && (
                        <span className="text-xs text-muted-foreground">{childMap[doc.child_id]}</span>
                      )}
                      {(() => {
                        const scan = scanDetails(doc);
                        return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${scan.className}`}>{scan.label}</span>;
                      })()}
                    </div>
                    {(() => {
                      const scan = scanDetails(doc);
                      return scan.error && !user?.invite_token
                        ? <p className={`text-xs ${scan.errorClass || "text-amber-800"} mt-1 line-clamp-2`}>{scan.error}</p>
                        : null;
                    })()}
                  </div>
                  <Download className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors flex-shrink-0" />
                </a>
                {user?.invite_token && (
                  <DocScanButton
                    doc={doc}
                    inviteToken={user?.invite_token}
                    onScanned={loadDocuments}
                  />
                )}
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}