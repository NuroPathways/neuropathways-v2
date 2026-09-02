import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from '@/api/entities';
import { useAuth } from "@/lib/AuthContext";
import { ArrowLeft, AlertCircle, FileText, Target, ClipboardList, MessageCircle, AlertTriangle, Stethoscope, Calendar, ChevronRight, ShieldAlert, Brain, Download, ChevronDown, ChevronUp, Zap, XCircle } from "lucide-react";
import { motion } from "framer-motion";

const SEVERITY_STYLES = {
  low: "bg-green-100 text-green-700",
  moderate: "bg-yellow-100 text-yellow-700",
  high: "bg-orange-100 text-orange-700",
  crisis: "bg-red-100 text-red-700",
};

const CATEGORY_EMOJIS = {
  tantrum_meltdown: "🌊", aggression: "⚡", anxiety_episode: "😰",
  task_refusal: "🚫", bedtime_refusal: "🌙", school_refusal: "🏫",
  transition_difficulty: "🔄", emotional_dysregulation: "💭", other: "📋",
};

export default function ChildProfile() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [child, setChild] = useState(null);
  const [plans, setPlans] = useState([]);
  const [interventionPlans, setInterventionPlans] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedPlan, setExpandedPlan] = useState(null);

  const childId = new URLSearchParams(window.location.search).get("child_id");

  useEffect(() => {
    if (!childId) { navigate("/ParentDashboard"); return; }
    if (!user) return;
    const load = async () => {
      // Server verifies access for both regular logins and username+code client sessions
      const res = await base44.functions.invoke('getClientPortalData', {
        child_id: childId,
        account_id: user.id,
        invite_token: user.invite_token,
      }).catch(() => null);
      const d = res?.data || {};
      setChild(d.child || null);
      setPlans(d.plans || []);
      setInterventionPlans(d.interventionPlans || []);
      setDocuments(d.documents || []);
      setLoading(false);
    };
    load();
  }, [childId, navigate, user]);

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (!child) return (
    <div className="flex items-center justify-center min-h-screen">
      <p className="text-muted-foreground">Child not found.</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-background font-inter">
      {/* Hero */}
      <div className="relative overflow-hidden" style={{ background: "linear-gradient(135deg, hsl(216,38%,47%) 0%, hsl(180,29%,55%) 100%)" }}>
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-2 right-8 w-28 h-28 rounded-full bg-white" />
          <div className="absolute -bottom-4 left-10 w-40 h-40 rounded-full bg-white" />
        </div>
        <div className="relative px-5 pt-5 pb-8 max-w-2xl mx-auto">
          <button onClick={() => navigate("/ParentDashboard")} className="flex items-center gap-2 text-white/70 hover:text-white text-sm mb-6 transition-colors">
            <ArrowLeft className="w-4 h-4" /> Dashboard
          </button>
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-white/20 flex items-center justify-center flex-shrink-0">
              <span className="text-white text-2xl font-bold">{child.child_name?.[0]?.toUpperCase() || "?"}</span>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">{child.child_name}</h1>
              <div className="flex flex-wrap gap-3 mt-1">
                {child.age && <p className="text-white/70 text-xs flex items-center gap-1"><Calendar className="w-3 h-3" /> Age {child.age}</p>}
                {child.diagnosis && <p className="text-white/70 text-xs flex items-center gap-1"><Stethoscope className="w-3 h-3" /> {child.diagnosis}</p>}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="px-5 max-w-2xl mx-auto -mt-4 space-y-4 pb-8">

        {/* Help Now */}
        <motion.button
          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => navigate(`/HelpNow?child_id=${childId}`)}
          className="w-full bg-red-600 hover:bg-red-700 rounded-2xl p-5 flex items-center justify-between text-left transition-colors shadow-lg shadow-red-200"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
              <AlertCircle className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-white font-bold">I Need Help Now</p>
              <p className="text-white/70 text-xs">Get step-by-step intervention guidance</p>
            </div>
          </div>
          <ChevronRight className="w-5 h-5 text-white/70" />
        </motion.button>

        {/* Quick Actions */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
          className="grid grid-cols-3 gap-3">
          {[
            { icon: ClipboardList, label: "Log Behavior", color: "bg-purple-50 text-purple-600", onClick: () => navigate(`/LogBehavior?child_id=${childId}`) },
            { icon: Target, label: "Goals", color: "bg-yellow-50 text-yellow-600", onClick: () => navigate(`/GoalsMilestones?child_id=${childId}`) },
            { icon: MessageCircle, label: "Message", color: "bg-green-50 text-green-600", onClick: () => navigate("/Messages") },
          ].map((item, i) => (
            <button key={item.label} onClick={item.onClick}
              className="bg-card border border-border rounded-2xl p-4 flex flex-col items-center gap-2 hover:border-primary/30 hover:shadow-sm transition-all">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${item.color}`}>
                <item.icon className="w-5 h-5" />
              </div>
              <span className="text-xs font-semibold text-foreground text-center leading-tight">{item.label}</span>
            </button>
          ))}
        </motion.div>

        {/* Known Triggers */}
        {child.triggers && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
            className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-1.5">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              <span className="text-xs font-semibold text-amber-700 uppercase tracking-wide">Known Triggers</span>
            </div>
            <p className="text-sm text-amber-800">{child.triggers}</p>
          </motion.div>
        )}

        {/* Intervention Plans */}
        {interventionPlans.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
            className="bg-card border border-border rounded-2xl p-5">
            <h2 className="font-semibold text-foreground flex items-center gap-2 mb-3 text-sm">
              <ShieldAlert className="w-4 h-4 text-primary" /> Support Plans ({interventionPlans.length})
            </h2>
            <div className="space-y-2">
              {interventionPlans.map(ip => (
                <button key={ip.id} onClick={() => navigate(`/HelpNow?child_id=${childId}`)}
                  className="w-full flex items-center gap-3 p-3 bg-background border border-border rounded-xl hover:border-primary/40 transition-all text-left">
                  <span className="text-xl flex-shrink-0">{CATEGORY_EMOJIS[ip.behavior_category] || "📋"}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">{ip.title}</p>
                    <p className="text-xs text-muted-foreground capitalize">{ip.behavior_category?.replace(/_/g, " ")}</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                </button>
              ))}
            </div>
          </motion.div>
        )}

        {/* Aspire AI */}
        <motion.button
          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
          onClick={() => navigate("/AIChat")}
          className="w-full bg-gradient-to-br from-primary/5 to-accent/10 border border-primary/20 rounded-2xl p-5 flex items-center justify-between text-left hover:border-primary/40 transition-all"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Brain className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="font-semibold text-foreground text-sm">Ask NeuroPath AI</p>
              <p className="text-xs text-muted-foreground">Questions about {child.child_name}'s support plan</p>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        </motion.button>

        {/* Behavior Plans */}
        {plans.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}
            className="bg-card border border-border rounded-2xl p-5">
            <h2 className="font-semibold text-foreground flex items-center gap-2 mb-3 text-sm">
              <FileText className="w-4 h-4 text-primary" /> Behavior Plans ({plans.length})
            </h2>
            <div className="space-y-2">
              {plans.map(plan => {
                const isOpen = expandedPlan === plan.id;
                const triggers = plan.common_triggers
                  ? plan.common_triggers.split(/[,;\n]+/).map(s => s.trim()).filter(Boolean)
                  : [];
                const steps = plan.strategy_steps
                  ? plan.strategy_steps.split(/\n+/).map(s => s.trim()).filter(Boolean)
                  : [];
                const avoid = plan.avoid_actions
                  ? plan.avoid_actions.split(/\n+/).map(s => s.trim()).filter(Boolean)
                  : [];
                const hasDetail = plan.behavior_description || triggers.length > 0 || steps.length > 0 || avoid.length > 0;
                return (
                  <div key={plan.id} className="bg-background border border-border rounded-xl overflow-hidden">
                    <button
                      onClick={() => setExpandedPlan(isOpen ? null : plan.id)}
                      className="w-full flex items-center justify-between p-3 text-left hover:bg-muted/40 transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <FileText className="w-4 h-4 text-primary flex-shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground">{plan.behavior_name}</p>
                          {plan.severity_level && (
                            <span className={`text-xs px-1.5 py-0.5 rounded-full ${SEVERITY_STYLES[plan.severity_level] || SEVERITY_STYLES.moderate}`}>
                              {plan.severity_level}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                        {plan.file_url && (
                          <a href={plan.file_url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}
                            className="text-xs text-primary hover:underline">View PDF</a>
                        )}
                        {hasDetail && (
                          isOpen
                            ? <ChevronUp className="w-4 h-4 text-muted-foreground" />
                            : <ChevronDown className="w-4 h-4 text-muted-foreground" />
                        )}
                      </div>
                    </button>

                    {isOpen && hasDetail && (
                      <div className="px-4 pb-4 space-y-3 border-t border-border pt-3">
                        {plan.behavior_description && (
                          <div>
                            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">About This Behavior</p>
                            <p className="text-sm text-foreground leading-relaxed">{plan.behavior_description}</p>
                          </div>
                        )}
                        {triggers.length > 0 && (
                          <div>
                            <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-1.5 flex items-center gap-1">
                              <AlertTriangle className="w-3.5 h-3.5" /> Common Triggers
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                              {triggers.map((t, i) => (
                                <span key={i} className="text-xs bg-amber-50 border border-amber-200 text-amber-800 px-2 py-0.5 rounded-full">{t}</span>
                              ))}
                            </div>
                          </div>
                        )}
                        {steps.length > 0 && (
                          <div>
                            <p className="text-xs font-semibold text-green-700 uppercase tracking-wide mb-1.5 flex items-center gap-1">
                              <Zap className="w-3.5 h-3.5" /> What To Do
                            </p>
                            <div className="space-y-1.5">
                              {steps.map((s, i) => (
                                <div key={i} className="flex items-start gap-2">
                                  <span className="text-xs font-bold text-green-600 bg-green-50 rounded-full w-5 h-5 flex items-center justify-center flex-shrink-0 mt-0.5">{i + 1}</span>
                                  <p className="text-sm text-foreground leading-snug">{s}</p>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        {avoid.length > 0 && (
                          <div>
                            <p className="text-xs font-semibold text-red-700 uppercase tracking-wide mb-1.5 flex items-center gap-1">
                              <XCircle className="w-3.5 h-3.5" /> What To Avoid
                            </p>
                            <div className="space-y-1.5">
                              {avoid.map((a, i) => (
                                <div key={i} className="flex items-start gap-2">
                                  <span className="text-red-400 flex-shrink-0 mt-0.5">•</span>
                                  <p className="text-sm text-foreground leading-snug">{a}</p>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}

        {/* Documents from clinician */}
        {documents.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
            className="bg-card border border-border rounded-2xl p-5">
            <h2 className="font-semibold text-foreground flex items-center gap-2 mb-3 text-sm">
              <Download className="w-4 h-4 text-primary" /> Documents ({documents.length})
            </h2>
            <div className="space-y-2">
              {documents.map(doc => (
                <a key={doc.id} href={doc.file_url} target="_blank" rel="noreferrer"
                  className="flex items-center gap-3 p-3 bg-background border border-border rounded-xl hover:border-primary/40 transition-all group">
                  <FileText className="w-4 h-4 text-primary flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{doc.title}</p>
                    <p className="text-xs text-muted-foreground capitalize">{doc.category?.replace(/_/g, " ")}</p>
                  </div>
                  <Download className="w-3.5 h-3.5 text-muted-foreground group-hover:text-primary transition-colors flex-shrink-0" />
                </a>
              ))}
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}