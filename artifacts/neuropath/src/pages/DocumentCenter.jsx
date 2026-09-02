import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from '@/api/entities';
import { useAuth } from "@/lib/AuthContext";
import { ArrowLeft, Search, FileText, Download, FolderOpen } from "lucide-react";
import { Input } from "@/components/ui/input";
import { motion } from "framer-motion";

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

export default function DocumentCenter() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState("all");
  const [children, setChildren] = useState([]);
  const [isIndividual, setIsIndividual] = useState(false);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const me = user;
      if (me.account_type === "individual") setIsIndividual(true);

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
        kids.map(c =>
          base44.functions.invoke('getClientPortalData', {
            child_id: c.id,
            account_id: me.id,
            invite_token: me.invite_token,
          }).then(r => r?.data?.documents || []).catch(() => [])
        )
      );
      const seenIds = new Set();
      setDocuments(docResults.flat().filter(d => { if (seenIds.has(d.id)) return false; seenIds.add(d.id); return true; }));
      setLoading(false);
    };
    load();
  }, [user]);

  const childMap = Object.fromEntries(children.map(c => [c.id, c.child_name]));

  const filtered = documents.filter(doc => {
    const matchSearch = search === "" || doc.title?.toLowerCase().includes(search.toLowerCase());
    const matchCat = filterCat === "all" || doc.category === filterCat;
    return matchSearch && matchCat;
  });
  const categories = [...new Set(documents.map(d => d.category).filter(Boolean))];

  return (
    <div className="min-h-screen bg-background font-inter">
      {/* Header */}
      <div className="relative overflow-hidden" style={{ background: "linear-gradient(135deg, hsl(216,38%,47%) 0%, hsl(180,29%,55%) 100%)" }}>
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-2 right-8 w-24 h-24 rounded-full bg-white" />
        </div>
        <div className="relative px-5 pt-5 pb-7 max-w-2xl mx-auto">
          <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-white/70 hover:text-white text-sm mb-5 transition-colors">
            <ArrowLeft className="w-4 h-4" /> Back
          </button>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
              <FolderOpen className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">Document Center</h1>
              <p className="text-white/60 text-xs">{documents.length} file{documents.length !== 1 ? "s" : ""} from your clinician</p>
            </div>
          </div>
        </div>
      </div>

      <div className="px-5 py-5 max-w-2xl mx-auto -mt-2">
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
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 border-2 border-dashed border-border rounded-2xl">
            <FileText className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="font-medium text-foreground mb-1">No documents yet</p>
            <p className="text-sm text-muted-foreground">Your clinician will upload treatment plans and resources here.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((doc, i) => (
              <motion.a
                key={doc.id}
                href={doc.file_url}
                target="_blank"
                rel="noreferrer"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
                className="flex items-center gap-4 p-4 bg-card border border-border rounded-2xl hover:border-primary/40 hover:shadow-sm transition-all group"
              >
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${CATEGORY_ICON_COLORS[doc.category] || "bg-muted text-muted-foreground"}`}>
                  <FileText className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">{doc.title}</p>
                  <div className="flex items-center gap-2 mt-1">
                    {doc.category && (
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${CATEGORY_COLORS[doc.category] || "bg-muted text-muted-foreground"}`}>
                        {CATEGORY_LABELS[doc.category] || doc.category}
                      </span>
                    )}
                    {!isIndividual && doc.child_id && childMap[doc.child_id] && (
                      <span className="text-xs text-muted-foreground">{childMap[doc.child_id]}</span>
                    )}
                  </div>
                </div>
                <Download className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors flex-shrink-0" />
              </motion.a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}