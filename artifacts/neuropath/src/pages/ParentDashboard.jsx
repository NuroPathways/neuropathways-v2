import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from '@/api/entities';
import { useAuth } from "@/lib/AuthContext";
import { getClientSession } from "@/lib/clientSession";
import {
  MessageSquare, Baby, ChevronRight, AlertCircle, FileText,
  Brain, ClipboardList, TrendingUp, Bell, Activity,
  Shield, BookOpen, Zap, ArrowUpRight, Heart, User, Target
} from "lucide-react";
import { motion } from "framer-motion";
import WinTodayButton from "@/components/parent/WinTodayButton";
import GoalWidget from "@/components/parent/GoalWidget";
import StreakBadge from "@/components/parent/StreakBadge";
import MomentumCard from "@/components/parent/MomentumCard";
import SupportNowOverlay from "@/components/support/SupportNowOverlay";

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

// ─── Individual / Self-managed client dashboard ───────────────────────────────
function SelfClientDashboard({ user, profile, unreadMessages, documents, loading }) {
  const navigate = useNavigate();
  const firstName =
    (user?.display_name || user?.full_name)?.split(" ")[0] ||
    (user?.child_name || profile?.child_name)?.split(" ")[0] ||
    user?.email?.split("@")[0] ||
    "there";
  const childIds = profile ? [profile.id] : [];

  const tools = [
    { label: "NeuroPath AI", sub: "Get support right now", icon: Brain, color: "bg-primary/10", iconColor: "text-primary", path: "/AIChat" },
    { label: "My Documents", sub: "Plans and materials", icon: FileText, color: "bg-blue-50", iconColor: "text-blue-600", path: "/DocumentCenter" },
    { label: "Messages", sub: "Chat with your clinician", icon: MessageSquare, color: "bg-green-50", iconColor: "text-green-600", path: "/Messages" },
    { label: "My Progress", sub: "Trends over time", icon: TrendingUp, color: "bg-purple-50", iconColor: "text-purple-600", path: "/ProgressReports" },
  ];

  return (
    <div className="min-h-screen bg-background font-inter">
      <WinTodayButton userId={user?.id} inviteToken={user?.invite_token} children={profile ? [profile] : []} />

      {/* Hero */}
      <div className="relative overflow-hidden" style={{ background: "linear-gradient(135deg, hsl(216,38%,42%) 0%, hsl(180,29%,50%) 100%)" }}>
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-4 right-10 w-40 h-40 rounded-full bg-white" />
          <div className="absolute -bottom-8 left-20 w-56 h-56 rounded-full bg-white" />
        </div>
        <div className="relative px-6 md:px-10 py-10 max-w-5xl mx-auto">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center">
                  <Brain className="w-4 h-4 text-white" />
                </div>
                <span className="text-white/80 text-sm font-medium">NeuroPathways</span>
                <StreakBadge userId={user?.id} />
              </div>
              <p className="text-white/70 text-sm">{getGreeting()},</p>
              <h1 className="text-2xl md:text-3xl font-bold text-white mt-0.5 mb-1">
                {firstName} 👋
              </h1>
              <p className="text-white/60 text-sm">Your personal behavioral support hub</p>
            </div>
            {unreadMessages > 0 && (
              <button
                onClick={() => navigate("/Messages")}
                className="flex items-center gap-2 bg-white/20 hover:bg-white/30 transition-colors rounded-xl px-3 py-2 text-white text-xs font-medium"
              >
                <Bell className="w-3.5 h-3.5" />
                {unreadMessages} new
              </button>
            )}
          </div>

          <div className="grid grid-cols-3 gap-3 mt-8">
            {[
              { label: "My Plans", value: profile ? "Active" : "—", icon: BookOpen },
              { label: "Documents", value: loading ? "—" : (documents?.length || 0), icon: FileText },
              { label: "Messages", value: loading ? "—" : unreadMessages, icon: MessageSquare },
            ].map((s, i) => (
              <motion.div
                key={s.label}
                initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07 }}
                className="bg-white/15 backdrop-blur-sm rounded-2xl p-3 border border-white/20 text-center"
              >
                <s.icon className="w-4 h-4 text-white/70 mx-auto mb-1" />
                <p className="text-xl font-bold text-white">{s.value}</p>
                <p className="text-xs text-white/60">{s.label}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </div>

      <div className="px-5 md:px-10 py-7 max-w-5xl mx-auto space-y-7">

        {/* Quick actions — Log and Help are the two most frequent needs */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="grid grid-cols-2 gap-3">
          <button
            onClick={() => navigate(profile ? `/LogBehavior?child_id=${profile.id}` : "/LogBehavior")}
            className="bg-primary hover:bg-primary/90 rounded-2xl p-5 flex items-center gap-4 text-left transition-colors shadow-md"
          >
            <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
              <ClipboardList className="w-6 h-6 text-white" />
            </div>
            <div>
              <p className="text-white font-bold text-base">Quick Log</p>
              <p className="text-white/70 text-xs">Record a behavior</p>
            </div>
          </button>
          <button
            onClick={() => navigate(profile ? `/HelpNow?child_id=${profile.id}` : "/HelpNow")}
            className="bg-red-600 hover:bg-red-700 rounded-2xl p-5 flex items-center gap-4 text-left transition-colors shadow-md"
          >
            <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
              <AlertCircle className="w-6 h-6 text-white" />
            </div>
            <div>
              <p className="text-white font-bold text-base">Help Now</p>
              <p className="text-white/70 text-xs">Get instant guidance</p>
            </div>
          </button>
        </motion.div>

        {/* Goal Widget */}
        <GoalWidget childIds={childIds} />

        {/* Momentum Card */}
        <MomentumCard childIds={childIds} />

        {/* My Profile / Treatment */}
        {profile && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
            <h2 className="font-semibold text-foreground flex items-center gap-2 mb-4">
              <User className="w-4 h-4 text-primary" /> My Treatment Profile
            </h2>
            <div
              onClick={() => navigate(`/ChildProfile?child_id=${profile.id}`)}
              className="bg-card border border-border rounded-2xl p-5 cursor-pointer hover:border-primary/40 hover:shadow-md transition-all group"
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center flex-shrink-0">
                  <span className="text-primary text-lg font-bold">{profile.child_name?.[0]?.toUpperCase() || "?"}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-foreground truncate">{profile.child_name}</p>
                  <div className="flex gap-2 mt-0.5 flex-wrap">
                    {profile.age && <span className="text-xs text-muted-foreground">Age {profile.age}</span>}
                    {profile.diagnosis && <span className="text-xs text-muted-foreground truncate">{profile.diagnosis}</span>}
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors flex-shrink-0" />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={e => { e.stopPropagation(); navigate(profile ? `/HelpNow?child_id=${profile.id}` : "/HelpNow"); }}
                  className="py-2 rounded-xl bg-red-50 text-red-600 text-xs font-semibold hover:bg-red-100 transition-colors flex flex-col items-center gap-1"
                >
                  <Zap className="w-3.5 h-3.5" /> Help Now
                </button>
                <button
                  onClick={e => { e.stopPropagation(); navigate(`/LogBehavior?child_id=${profile.id}`); }}
                  className="py-2 rounded-xl bg-purple-50 text-purple-600 text-xs font-semibold hover:bg-purple-100 transition-colors flex flex-col items-center gap-1"
                >
                  <ClipboardList className="w-3.5 h-3.5" /> Log
                </button>
                <button
                  onClick={e => { e.stopPropagation(); navigate(`/ChildProfile?child_id=${profile.id}`); }}
                  className="py-2 rounded-xl bg-primary/5 text-primary text-xs font-semibold hover:bg-primary/10 transition-colors flex flex-col items-center gap-1"
                >
                  <BookOpen className="w-3.5 h-3.5" /> My Plans
                </button>
              </div>
            </div>
          </motion.div>
        )}

        {!profile && !loading && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
            <div className="bg-card rounded-2xl border-2 border-dashed border-border p-10 text-center">
              <User className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm font-medium text-foreground mb-1">No profile linked yet</p>
              <p className="text-xs text-muted-foreground">Ask your clinician to connect your account.</p>
            </div>
          </motion.div>
        )}

        {/* Tools */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.18 }}>
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">My Tools & Resources</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {tools.map((item, i) => (
              <motion.div
                key={item.label}
                initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.22 + i * 0.05 }}
                onClick={() => navigate(item.path)}
                className="bg-card border border-border rounded-2xl p-4 flex items-center gap-3 cursor-pointer hover:border-primary/30 hover:shadow-sm transition-all group"
              >
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${item.color}`}>
                  <item.icon className={`w-5 h-5 ${item.iconColor}`} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-foreground truncate">{item.label}</p>
                  <p className="text-xs text-muted-foreground truncate">{item.sub}</p>
                </div>
                <ArrowUpRight className="w-3.5 h-3.5 text-muted-foreground group-hover:text-primary transition-colors flex-shrink-0" />
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* Wellbeing tip */}
        <motion.div
          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}
          className="bg-gradient-to-br from-accent/10 to-primary/5 border border-accent/20 rounded-2xl p-5 flex items-start gap-4"
        >
          <div className="w-10 h-10 rounded-xl bg-accent/20 flex items-center justify-center flex-shrink-0">
            <Heart className="w-5 h-5 text-accent" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground mb-1">You're doing great</p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Your progress matters. Use NeuroPath AI anytime you need support, and reach out to your clinician through Messages whenever you need to talk.
            </p>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

// ─── Parent / Family dashboard ───────────────────────────────────────────────
function FamilyDashboard({ user, children, recentLogs, unreadMessages, loading, selectedChildId, setSelectedChildId, clientPortalCache }) {
  const navigate = useNavigate();
  const realEmail = user?.email && !user.email.endsWith("@clients.neuropathways.app") ? user.email : null;
  const firstName =
    (user?.display_name || user?.full_name)?.trim().split(" ")[0] ||
    user?.primary_contact?.trim().split(" ")[0] ||
    realEmail?.split("@")[0] ||
    user?.family_name?.trim() ||
    user?.child_name?.trim() ||
    "there";
  const childIds = children.map(c => c.id);
  const isClientSession = !!user?.invite_token;
  const showSelector = isClientSession && children.length > 1;
  const activeChildIds = isClientSession && selectedChildId ? [selectedChildId] : childIds;
  // For client-session, pass portal-fetched data to avoid entity queries that lack invite_token
  const portalWins = isClientSession ? (clientPortalCache?.winLogs ?? undefined) : undefined;
  const portalCheckIns = isClientSession ? (clientPortalCache?.dailyCheckIns ?? undefined) : undefined;
  const portalGoals = isClientSession ? (clientPortalCache?.goals ?? undefined) : undefined;

  const tools = [
    { label: "NeuroPath AI", sub: "Ask about your child's plan", icon: Brain, color: "bg-primary/10", iconColor: "text-primary", path: "/AIChat" },
    { label: "Documents", sub: "Plans and materials", icon: FileText, color: "bg-blue-50", iconColor: "text-blue-600", path: "/DocumentCenter" },
    { label: "Messages", sub: "Chat with your clinician", icon: MessageSquare, color: "bg-green-50", iconColor: "text-green-600", path: "/Messages" },
    { label: "Progress", sub: "Trends over time", icon: TrendingUp, color: "bg-purple-50", iconColor: "text-purple-600", path: "/ProgressReports" },
  ];

  return (
    <div className="min-h-screen bg-background font-inter">
      <WinTodayButton userId={user?.id} inviteToken={user?.invite_token} children={children} defaultChildId={isClientSession ? selectedChildId : undefined} />

      <div className="relative overflow-hidden" style={{ background: "linear-gradient(135deg, hsl(216,38%,42%) 0%, hsl(180,29%,50%) 100%)" }}>
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-4 right-10 w-40 h-40 rounded-full bg-white" />
          <div className="absolute -bottom-8 left-20 w-56 h-56 rounded-full bg-white" />
        </div>
        <div className="relative px-6 md:px-10 py-10 max-w-5xl mx-auto">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center">
                  <Brain className="w-4 h-4 text-white" />
                </div>
                <span className="text-white/80 text-sm font-medium">NeuroPathways</span>
                <StreakBadge userId={user?.id} />
              </div>
              <p className="text-white/70 text-sm">{getGreeting()},</p>
              <h1 className="text-2xl md:text-3xl font-bold text-white mt-0.5 mb-1">
                {loading ? "..." : firstName} 👋
              </h1>
              <p className="text-white/60 text-sm">Your family's behavioral support hub</p>
            </div>
            {unreadMessages > 0 && (
              <button
                onClick={() => navigate("/Messages")}
                className="flex items-center gap-2 bg-white/20 hover:bg-white/30 transition-colors rounded-xl px-3 py-2 text-white text-xs font-medium"
              >
                <Bell className="w-3.5 h-3.5" />
                {unreadMessages} new
              </button>
            )}
          </div>

          <div className="grid grid-cols-3 gap-3 mt-8">
            {[
              { label: "Children", value: loading ? "—" : children.length, icon: Baby },
              { label: "Logs This Week", value: loading ? "—" : recentLogs.length, icon: Activity },
              { label: "Messages", value: loading ? "—" : unreadMessages, icon: MessageSquare },
            ].map((s, i) => (
              <motion.div
                key={s.label}
                initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07 }}
                className="bg-white/15 backdrop-blur-sm rounded-2xl p-3 border border-white/20 text-center"
              >
                <s.icon className="w-4 h-4 text-white/70 mx-auto mb-1" />
                <p className="text-xl font-bold text-white">{s.value}</p>
                <p className="text-xs text-white/60">{s.label}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </div>

      <div className="px-5 md:px-10 py-7 max-w-5xl mx-auto space-y-7">

        {/* Sibling selector — shown for client-session users with multiple children */}
        {showSelector && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Viewing</p>
            <div className="flex gap-2 flex-wrap">
              {children.map(child => (
                <button
                  key={child.id}
                  onClick={() => setSelectedChildId(child.id)}
                  className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors border ${
                    selectedChildId === child.id
                      ? "bg-primary text-primary-foreground border-primary shadow-sm"
                      : "bg-card text-muted-foreground border-border hover:border-primary/40 hover:text-foreground"
                  }`}
                >
                  {child.child_name || "Child"}
                </button>
              ))}
            </div>
          </motion.div>
        )}

        {/* Quick actions — Log and Help are the two most frequent parent needs */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="grid grid-cols-2 gap-3">
          <button
            onClick={() => navigate("/LogBehavior")}
            className="bg-primary hover:bg-primary/90 rounded-2xl p-5 flex items-center gap-4 text-left transition-colors shadow-md"
          >
            <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
              <ClipboardList className="w-6 h-6 text-white" />
            </div>
            <div>
              <p className="text-white font-bold text-base">Quick Log</p>
              <p className="text-white/70 text-xs">Record a behavior</p>
            </div>
          </button>
          <button
            onClick={() => navigate("/HelpNow")}
            className="bg-red-600 hover:bg-red-700 rounded-2xl p-5 flex items-center gap-4 text-left transition-colors shadow-md"
          >
            <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
              <AlertCircle className="w-6 h-6 text-white" />
            </div>
            <div>
              <p className="text-white font-bold text-base">Help Now</p>
              <p className="text-white/70 text-xs">Get instant guidance</p>
            </div>
          </button>
        </motion.div>

        {/* Goal Widget */}
        <GoalWidget childIds={activeChildIds} prefetchedGoals={portalGoals} />

        {/* Momentum Card */}
        <MomentumCard childIds={activeChildIds} prefetchedWins={portalWins} prefetchedCheckIns={portalCheckIns} />

        {/* My Children */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-foreground flex items-center gap-2">
              <Baby className="w-4 h-4 text-primary" /> My Children
            </h2>
          </div>

          {loading ? (
            <div className="space-y-3">
              {[1, 2].map(i => <div key={i} className="h-24 bg-muted rounded-2xl animate-pulse" />)}
            </div>
          ) : children.length === 0 ? (
            <div className="bg-card rounded-2xl border-2 border-dashed border-border p-10 text-center">
              <Baby className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm font-medium text-foreground mb-1">No children linked yet</p>
              <p className="text-xs text-muted-foreground">Ask your clinician to connect your account.</p>
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 gap-3">
              {children.map((child, i) => (
                <motion.div
                  key={child.id}
                  initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 + i * 0.07 }}
                  className="bg-card border border-border rounded-2xl p-5 cursor-pointer hover:border-primary/40 hover:shadow-md transition-all group"
                  onClick={() => navigate(`/ChildProfile?child_id=${child.id}`)}
                >
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center flex-shrink-0">
                      <span className="text-primary text-lg font-bold">{child.child_name?.[0]?.toUpperCase() || "?"}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-foreground truncate">{child.child_name}</p>
                      <div className="flex gap-2 mt-0.5 flex-wrap">
                        {child.age && <span className="text-xs text-muted-foreground">Age {child.age}</span>}
                        {child.diagnosis && <span className="text-xs text-muted-foreground truncate">{child.diagnosis}</span>}
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors flex-shrink-0" />
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      onClick={e => { e.stopPropagation(); navigate(`/HelpNow?child_id=${child.id}`); }}
                      className="py-2 rounded-xl bg-red-50 text-red-600 text-xs font-semibold hover:bg-red-100 transition-colors flex flex-col items-center gap-1"
                    >
                      <Zap className="w-3.5 h-3.5" /> Help Now
                    </button>
                    <button
                      onClick={e => { e.stopPropagation(); navigate(`/LogBehavior?child_id=${child.id}`); }}
                      className="py-2 rounded-xl bg-purple-50 text-purple-600 text-xs font-semibold hover:bg-purple-100 transition-colors flex flex-col items-center gap-1"
                    >
                      <ClipboardList className="w-3.5 h-3.5" /> Log
                    </button>
                    <button
                      onClick={e => { e.stopPropagation(); navigate(`/ChildProfile?child_id=${child.id}`); }}
                      className="py-2 rounded-xl bg-primary/5 text-primary text-xs font-semibold hover:bg-primary/10 transition-colors flex flex-col items-center gap-1"
                    >
                      <BookOpen className="w-3.5 h-3.5" /> Plans
                    </button>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </motion.div>

        {/* Tools */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.18 }}>
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">Tools & Resources</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {tools.map((item, i) => (
              <motion.div
                key={item.label}
                initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.22 + i * 0.05 }}
                onClick={() => navigate(item.path)}
                className="bg-card border border-border rounded-2xl p-4 flex items-center gap-3 cursor-pointer hover:border-primary/30 hover:shadow-sm transition-all group"
              >
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${item.color}`}>
                  <item.icon className={`w-5 h-5 ${item.iconColor}`} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-foreground truncate">{item.label}</p>
                  <p className="text-xs text-muted-foreground truncate">{item.sub}</p>
                </div>
                <ArrowUpRight className="w-3.5 h-3.5 text-muted-foreground group-hover:text-primary transition-colors flex-shrink-0" />
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* Recent Activity */}
        {recentLogs.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Recent Activity</h2>
              <button onClick={() => navigate("/LogBehavior")} className="text-xs text-primary font-medium hover:underline flex items-center gap-1">
                Log new <ChevronRight className="w-3 h-3" />
              </button>
            </div>
            <div className="bg-card border border-border rounded-2xl divide-y divide-border">
              {recentLogs.map((log) => {
                const child = children.find(c => c.id === log.child_id);
                const intensityColor = log.intensity === "high" ? "bg-red-500" : log.intensity === "moderate" ? "bg-yellow-500" : "bg-green-500";
                return (
                  <div key={log.id} className="flex items-center gap-3 p-4">
                    <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${intensityColor}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{log.behavior_type || "Behavior logged"}</p>
                      <p className="text-xs text-muted-foreground">{child?.child_name || "Unknown"} · {log.intensity || "—"} intensity</p>
                    </div>
                    <span className="text-xs text-muted-foreground flex-shrink-0">
                      {new Date(log.created_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </span>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}

        <motion.div
          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}
          className="bg-gradient-to-br from-accent/10 to-primary/5 border border-accent/20 rounded-2xl p-5 flex items-start gap-4"
        >
          <div className="w-10 h-10 rounded-xl bg-accent/20 flex items-center justify-center flex-shrink-0">
            <Heart className="w-5 h-5 text-accent" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground mb-1">You're doing great</p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Consistent tracking and communication with your clinician makes a real difference. Use the AI chat anytime you need support between sessions.
            </p>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

// ─── Main router component ────────────────────────────────────────────────────
export default function ParentDashboard() {
  const { user } = useAuth();
  const [children, setChildren] = useState([]);
  const [recentLogs, setRecentLogs] = useState([]);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [accountType, setAccountType] = useState(null);
  const [selectedChildId, setSelectedChildId] = useState(null);
  const [clientPortalCache, setClientPortalCache] = useState(null);

  useEffect(() => {
    if (!user) return;

    const load = async () => {
      // Determine account type — prefer what's stored on the user record first
      let resolvedType = user.account_type || null;

      // Client session users (no-email) have pre-loaded children
      const cs = getClientSession();
      let allKids = [];
      if (user.children && user.children.length > 0) {
        // Call the portal route to get the full same-clinician sibling list and
        // pre-fetch wins/checkIns/goals so MomentumCard and GoalWidget don't need
        // to make separate entity queries (which wouldn't include invite_token).
        try {
          const result = await base44.functions.invoke("getClientPortalData", {
            child_id: cs?.id,
            invite_token: cs?.invite_token,
          });
          const d = result.data;
          allKids = d?.siblings || user.children;
          setClientPortalCache({
            winLogs: d?.winLogs || [],
            dailyCheckIns: d?.dailyCheckIns || [],
            goals: d?.goals || [],
            behaviorLogs: d?.behaviorLogs || [],
          });
        } catch {
          allKids = user.children;
        }
      } else {
        const [kidsByParentId, kidsByEmail] = await Promise.all([
          base44.entities.Child.filter({ parent_id: user.id }).catch(() => []),
          user.email ? base44.entities.Child.filter({ parent_email: user.email }).catch(() => []) : Promise.resolve([]),
        ]);
        const allKidsMap = new Map();
        for (const k of [...kidsByParentId, ...kidsByEmail]) allKidsMap.set(k.id, k);
        allKids = Array.from(allKidsMap.values());
        // Back-fill parent_id on children found only by email
        for (const k of allKids) {
          if (!k.parent_id && user.id) {
            base44.entities.Child.update(k.id, { parent_id: user.id }).catch(() => {});
          }
        }
      }

      const msgs = await base44.entities.Message.filter({ to_user_id: user.id }).catch(() => []);

      setChildren(allKids);
      setUnreadMessages(msgs.filter(m => !m.is_read).length);

      // If account_type not on user record yet, look it up from family
      const isClientSession = !!user.children; // client session users have children array
      if (isClientSession && allKids.length > 0) {
        // Restore last selection from sessionStorage so navigation back to the dashboard
        // lands on the same sibling the caregiver was viewing.
        const storageKey = cs?.invite_token ? `np_sibling_sel_${cs.invite_token}` : null;
        const stored = storageKey ? sessionStorage.getItem(storageKey) : null;
        const restored = stored && allKids.some(k => k.id === stored) ? stored : null;
        setSelectedChildId(restored || cs?.id || allKids[0].id);
      }
      if (!resolvedType) {
        const familyId = user.linked_family_id || user.family_id || allKids[0]?.family_id;
        if (familyId) {
          const fams = await base44.entities.Family.filter({ id: familyId }).catch(() => []);
          resolvedType = fams[0]?.account_type || "parent_family";
          if (!isClientSession) base44.auth.updateMe({ account_type: resolvedType }).catch(() => {});
        } else if (allKids.length === 1 && allKids[0]?.is_patient) {
          resolvedType = "individual";
          if (!isClientSession) base44.auth.updateMe({ account_type: "individual" }).catch(() => {});
        } else if (allKids.length > 0) {
          resolvedType = "parent_family";
        } else {
          resolvedType = "parent_family";
        }
      }

      setAccountType(resolvedType);

      // Fire one app_open engagement event per calendar day (client-portal logins).
      // Use cs.id (the auth child) so the event appears under the correct child even
      // when the family has multiple siblings. Falls back to allKids[0] for OIDC parents.
      const appOpenKey = `app_open_${user.id}_${new Date().toISOString().slice(0, 10)}`;
      if (!localStorage.getItem(appOpenKey) && allKids.length > 0) {
        const primaryKid = cs ? (allKids.find(k => k.id === cs.id) || allKids[0]) : allKids[0];
        base44.entities.EngagementEvent.create({
          child_id: primaryKid.id,
          clinician_id: primaryKid.clinician_id,
          parent_id: user.id,
          event_type: "app_open",
          topic: "daily_login",
        }).then(() => {
          localStorage.setItem(appOpenKey, "1");
        }).catch(() => {});
      }

      if (allKids.length > 0) {
        // For client-session, behavior logs are already in clientPortalCache set above.
        // Use them for recentLogs rather than making a separate entity query.
        const logQuery = isClientSession
          ? Promise.resolve([]) // will be populated from clientPortalCache below
          : base44.entities.BehaviorLog.filter({ parent_id: user.id }, "-created_date", 5).catch(() => []);
        // Fetch docs by parent_id (RLS-compliant) — works for both oauth and username-code users
        const [logs, docs] = await Promise.all([
          logQuery,
          base44.entities.Document.filter({ parent_id: user.id }).catch(() => []),
        ]);
        if (!isClientSession) setRecentLogs(logs);
        setDocuments(docs);
      }

      setLoading(false);
    };
    load();
  }, [user]);

  // Persist selection so navigating away and back restores the same sibling.
  useEffect(() => {
    if (!user?.children || !selectedChildId) return;
    const cs = getClientSession();
    if (!cs?.invite_token) return;
    sessionStorage.setItem(`np_sibling_sel_${cs.invite_token}`, selectedChildId);
  }, [selectedChildId]);

  // When a client-session user switches siblings, re-fetch portal data for the new child.
  // This keeps wins/checkIns/goals/recentLogs in sync without relying on entity queries
  // that don't carry the invite_token.
  useEffect(() => {
    if (!user?.children || !selectedChildId) return;
    const cs = getClientSession();
    if (!cs) return;
    base44.functions.invoke("getClientPortalData", {
      child_id: selectedChildId,
      invite_token: cs.invite_token,
    }).then(result => {
      const d = result.data;
      setClientPortalCache({
        winLogs: d?.winLogs || [],
        dailyCheckIns: d?.dailyCheckIns || [],
        goals: d?.goals || [],
        behaviorLogs: d?.behaviorLogs || [],
      });
      const sorted = (d?.behaviorLogs || [])
        .filter(l => l.created_date)
        .sort((a, b) => new Date(b.created_date) - new Date(a.created_date))
        .slice(0, 5);
      setRecentLogs(sorted);
    }).catch(() => {});
  }, [selectedChildId]);

  // Show loading spinner while resolving account type
  if (loading || accountType === null) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-border border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  const isIndividual = accountType === "individual";

  if (isIndividual) {
    const profile = children[0] || null;
    return (
      <>
        <SupportNowOverlay user={user} children={children} isIndividual={true} />
        <SelfClientDashboard user={user} profile={profile} unreadMessages={unreadMessages} documents={documents} loading={false}
          siblings={children} selectedChildId={selectedChildId} setSelectedChildId={setSelectedChildId} />
      </>
    );
  }

  return (
    <>
      <SupportNowOverlay user={user} children={children} isIndividual={false} />
      <FamilyDashboard user={user} children={children} recentLogs={recentLogs} unreadMessages={unreadMessages} loading={false}
        selectedChildId={selectedChildId} setSelectedChildId={setSelectedChildId} clientPortalCache={clientPortalCache} />
    </>
  );
}