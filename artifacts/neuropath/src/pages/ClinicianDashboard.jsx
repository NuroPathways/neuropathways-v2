import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from '@/api/entities';
import { useAuth } from "@/lib/AuthContext";
import {
  Users, FileText, Plus, BarChart2, MessageCircle,
  Upload, ShieldAlert, ChevronRight, Brain, TrendingUp,
  Clock, Star, Activity, Settings, ArrowUpRight
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import FamilyCard from "../components/clinician/FamilyCard";
import AddClientModal from "../components/clinician/AddClientModal";
import AddChildToFamilyModal from "../components/clinician/AddChildToFamilyModal";

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export default function ClinicianDashboard() {
  const navigate = useNavigate();
  const { user, isLoadingAuth } = useAuth();
  const [families, setFamilies] = useState([]);
  const [children, setChildren] = useState([]);
  const [logs, setLogs] = useState([]);
  const [messages, setMessages] = useState([]);
  const [showAddFamily, setShowAddFamily] = useState(false);
  const [showAddChild, setShowAddChild] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  // Build a map of family_id → children for card subtitles
  const childrenByFamily = children.reduce((acc, c) => {
    if (c.family_id) {
      if (!acc[c.family_id]) acc[c.family_id] = [];
      acc[c.family_id].push(c);
    }
    return acc;
  }, {});

  useEffect(() => {
    if (isLoadingAuth) return;
    if (!user?.id) { navigate("/ClinicianLogin"); return; }
    if (user.app_role && user.app_role !== "clinician") { navigate("/ParentDashboard"); return; }
    const load = async () => {
      const res = await base44.functions.invoke('getClinicianData', {}).catch((e) => ({ data: { error: e?.message || "Failed to load" } }));
      if (res?.data?.error) setLoadError(res.data.error);
      const { families: fams = [], children: kids = [], logs: clientLogs = [], messages: msgs = [] } = res?.data || {};
      setFamilies(fams);
      setChildren(kids);
      setLogs(clientLogs);
      setMessages(msgs.filter(m => !m.is_read));
      setLoading(false);
    };
    load();
  }, [user?.id, isLoadingAuth]);

  const refresh = async () => {
    if (!user?.id) return;
    const res = await base44.functions.invoke('getClinicianData', {}).catch(() => null);
    setFamilies(res?.data?.families || []);
    setChildren(res?.data?.children || []);
  };

  const recentLogs = [...logs].sort((a, b) => new Date(b.created_date) - new Date(a.created_date)).slice(0, 3);

  return (
    <div className="min-h-screen bg-background font-inter">

      {/* Hero Header */}
      <div className="relative overflow-hidden" style={{ background: "linear-gradient(135deg, hsl(216,38%,47%) 0%, hsl(180,29%,55%) 100%)" }}>
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-4 right-10 w-40 h-40 rounded-full bg-white" />
          <div className="absolute -bottom-8 left-20 w-56 h-56 rounded-full bg-white" />
        </div>
        <div className="relative px-6 md:px-10 py-10 max-w-6xl mx-auto">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center">
                  <Brain className="w-4 h-4 text-white" />
                </div>
                <span className="text-white/80 text-sm font-medium">NeuroPathways</span>
              </div>
              <p className="text-white/70 text-sm mb-1">{getGreeting()},</p>
              <h1 className="text-2xl md:text-3xl font-bold text-white mb-1">
                {((user?.display_name || user?.full_name)?.trim()
                  ? (user.display_name || user.full_name).trim().split(" ")[0]
                  : user?.email
                    ? user.email.split("@")[0].split(/[._-]/)[0].replace(/^(.)/, c => c.toUpperCase())
                    : "there")} 👋
              </h1>
              <p className="text-white/60 text-sm">Here's your clinical overview for today</p>
            </div>
            <div className="hidden md:flex gap-2">
              <Button size="sm" variant="secondary" className="bg-white/20 hover:bg-white/30 text-white border-0 gap-1.5 rounded-xl" onClick={() => navigate("/Settings")}>
                <Settings className="w-3.5 h-3.5" /> Settings
              </Button>
            </div>
          </div>

          {/* Stat Pills */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-8">
            {[
              { label: "Active Clients", value: loading ? "—" : families.length, icon: Users, sub: "families/clients" },
              { label: "Behavior Logs", value: loading ? "—" : logs.length, icon: Activity, sub: "recorded" },
              { label: "Unread Messages", value: loading ? "—" : messages.length, icon: MessageCircle, sub: "waiting", link: "/Messages" },
            ].map((s, i) => (
              <motion.div
                key={s.label}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.08 }}
                onClick={() => s.link && navigate(s.link)}
                className={`bg-white/15 backdrop-blur-sm rounded-2xl p-4 border border-white/20 ${s.link ? "cursor-pointer hover:bg-white/25 transition-all" : ""}`}
              >
                <div className="flex items-center justify-between mb-2">
                  <s.icon className="w-4 h-4 text-white/70" />
                  {s.link && <ArrowUpRight className="w-3.5 h-3.5 text-white/50" />}
                </div>
                <p className="text-2xl font-bold text-white">{s.value}</p>
                <p className="text-xs text-white/60 mt-0.5">{s.label}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </div>

      <div className="px-6 md:px-10 py-8 max-w-6xl mx-auto space-y-8">

        {/* Quick Actions */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">Quick Actions</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {[
              { label: "Add Client", icon: Plus, color: "bg-primary text-primary-foreground", onClick: () => setShowAddFamily(true) },
              { label: "Intervention Plans", icon: ShieldAlert, color: "bg-secondary/10 text-secondary hover:bg-secondary/20", onClick: () => navigate("/InterventionBuilder") },
              { label: "Upload Docs", icon: Upload, color: "bg-accent/10 text-accent hover:bg-accent/20", onClick: () => navigate("/ClinicianDocuments") },
              { label: "Progress Reports", icon: BarChart2, color: "bg-purple-100 text-purple-700 hover:bg-purple-200", onClick: () => navigate("/ProgressReports") },
              { label: "Messages", icon: MessageCircle, color: "bg-green-100 text-green-700 hover:bg-green-200", onClick: () => navigate("/Messages") },
              { label: "Users", icon: Users, color: "bg-orange-100 text-orange-700 hover:bg-orange-200", onClick: () => navigate("/ClinicianUsers") },
            ].map((a, i) => (
              <motion.button
                key={a.label}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.25 + i * 0.05 }}
                onClick={a.onClick}
                className={`${a.color} rounded-2xl p-4 flex flex-col items-center gap-2 text-center transition-all cursor-pointer border border-transparent hover:shadow-md`}
              >
                <div className="w-9 h-9 rounded-xl bg-white/30 flex items-center justify-center">
                  <a.icon className="w-4 h-4" />
                </div>
                <span className="text-xs font-semibold leading-tight">{a.label}</span>
              </motion.button>
            ))}
          </div>
        </motion.div>

        {/* Clients + Recent Activity */}
        <div className="grid md:grid-cols-3 gap-6">

          {/* Client / Family List */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35 }}
            className="md:col-span-2"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-foreground">My Clients</h2>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="rounded-xl gap-1.5 text-xs h-8" onClick={() => setShowAddChild(true)}>
                  <Plus className="w-3 h-3" /> Add to Family
                </Button>
                <Button size="sm" className="rounded-xl bg-primary hover:bg-primary/90 gap-1.5 text-xs h-8" onClick={() => setShowAddFamily(true)}>
                  <Plus className="w-3 h-3" /> New Client
                </Button>
              </div>
            </div>

            {loadError && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-3 text-xs text-red-700">
                Couldn't load your clients: {loadError}
              </div>
            )}
            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => <div key={i} className="h-16 bg-muted rounded-xl animate-pulse" />)}
              </div>
            ) : families.length === 0 ? (
              <div className="bg-card rounded-2xl border-2 border-dashed border-border p-10 text-center">
                <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                  <Users className="w-7 h-7 text-primary" />
                </div>
                <p className="font-semibold text-foreground mb-1">No clients yet</p>
                <p className="text-sm text-muted-foreground mb-5">Add your first client to get started with care plans and AI support</p>
                <Button size="sm" className="rounded-xl bg-primary hover:bg-primary/90 gap-1.5" onClick={() => setShowAddFamily(true)}>
                  <Plus className="w-3.5 h-3.5" /> Add Client
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                {families.map(family => (
                  <FamilyCard
                    key={family.id}
                    family={family}
                    children={childrenByFamily[family.id] || []}
                  />
                ))}
              </div>
            )}
          </motion.div>

          {/* Side Panel */}
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.45 }} className="space-y-4">

            {/* Recent Behavior Activity */}
            <div className="bg-card border border-border rounded-2xl p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-foreground text-sm">Recent Activity</h3>
                <button onClick={() => navigate("/ProgressReports")} className="text-xs text-primary hover:underline flex items-center gap-1">
                  View all <ChevronRight className="w-3 h-3" />
                </button>
              </div>
              {loading ? (
                <div className="space-y-2">{[1, 2, 3].map(i => <div key={i} className="h-10 bg-muted rounded-lg animate-pulse" />)}</div>
              ) : recentLogs.length === 0 ? (
                <div className="text-center py-6">
                  <Activity className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-xs text-muted-foreground">No activity logged yet</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {recentLogs.map(log => {
                    const child = children.find(c => c.id === log.child_id);
                    return (
                      <div key={log.id} className="flex items-start gap-3 p-2.5 bg-background rounded-xl">
                        <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${log.intensity === "high" ? "bg-red-500" : log.intensity === "moderate" ? "bg-yellow-500" : "bg-green-500"}`} />
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-foreground truncate">{child?.child_name || "Unknown"}</p>
                          <p className="text-xs text-muted-foreground truncate">{log.behavior_type || "Behavior logged"}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Progress Summary */}
            <div className="bg-gradient-to-br from-primary/5 to-accent/10 border border-primary/20 rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp className="w-4 h-4 text-primary" />
                <h3 className="font-semibold text-foreground text-sm">Progress Summary</h3>
              </div>
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Total logs recorded</span>
                  <span className="font-semibold text-foreground">{loading ? "—" : logs.length}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Clients enrolled</span>
                  <span className="font-semibold text-foreground">{loading ? "—" : families.length}</span>
                </div>
              </div>
              <button
                onClick={() => navigate("/ProgressReports")}
                className="w-full mt-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-colors flex items-center justify-center gap-1.5"
              >
                <BarChart2 className="w-3.5 h-3.5" /> View Full Reports
              </button>
            </div>

            {/* Tip Card */}
            <div className="bg-card border border-border rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-2">
                <Star className="w-4 h-4 text-yellow-500" />
                <h3 className="font-semibold text-foreground text-sm">Clinical Tip</h3>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Upload behavior protocols and treatment plans so parents get instant, clinician-approved guidance through the AI chat.
              </p>
              <button onClick={() => navigate("/ClinicianDocuments")} className="mt-3 text-xs text-primary font-semibold hover:underline flex items-center gap-1">
                Upload documents <ChevronRight className="w-3 h-3" />
              </button>
            </div>
          </motion.div>
        </div>

        {/* Full-width nav strips */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">All Tools</h2>
          <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-3">
            {[
              { label: "Intervention Plans", sub: "Build & manage behavior support plans", icon: ShieldAlert, color: "bg-secondary/10", iconColor: "text-secondary", path: "/InterventionBuilder" },
              { label: "Documents", sub: "Upload PDFs, protocols, worksheets", icon: Upload, color: "bg-accent/10", iconColor: "text-accent", path: "/ClinicianDocuments" },
              { label: "Progress Reports", sub: "Behavior trends and outcome data", icon: BarChart2, color: "bg-purple-50", iconColor: "text-purple-600", path: "/ProgressReports" },
              { label: "Messages", sub: "Communicate with parents & clients", icon: MessageCircle, color: "bg-green-50", iconColor: "text-green-600", path: "/Messages" },
              { label: "Users", sub: "Manage clinician & client accounts", icon: Users, color: "bg-orange-50", iconColor: "text-orange-600", path: "/ClinicianUsers" },
              { label: "Settings", sub: "Account and app preferences", icon: Settings, color: "bg-muted", iconColor: "text-muted-foreground", path: "/Settings" },
            ].map((item, i) => (
              <motion.div
                key={item.label}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.55 + i * 0.05 }}
                onClick={() => navigate(item.path)}
                className="bg-card border border-border rounded-2xl p-4 flex items-center gap-4 cursor-pointer hover:border-primary/30 hover:shadow-sm transition-all group"
              >
                <div className={`w-11 h-11 rounded-xl ${item.color} flex items-center justify-center flex-shrink-0`}>
                  <item.icon className={`w-5 h-5 ${item.iconColor}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-foreground text-sm">{item.label}</p>
                  <p className="text-xs text-muted-foreground truncate">{item.sub}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors flex-shrink-0" />
              </motion.div>
            ))}
          </div>
        </motion.div>

      </div>

      <AddClientModal open={showAddFamily} onClose={() => setShowAddFamily(false)} onSuccess={refresh} clinicianId={user?.id} />
      <AddChildToFamilyModal open={showAddChild} onClose={() => setShowAddChild(false)} onSuccess={refresh} clinicianId={user?.id} />
    </div>
  );
}
