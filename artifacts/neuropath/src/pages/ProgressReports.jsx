import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from '@/api/entities';
import { getClientSession } from '@/lib/clientSession';
import {
  ArrowLeft, TrendingUp, BarChart2, AlertTriangle, CheckCircle2,
  Trophy, Star, Printer, Heart, Smile, Frown, Meh, Activity,
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, CartesianGrid,
} from "recharts";
import { motion } from "framer-motion";
import { format, subDays, isAfter } from "date-fns";
import EngagementPanel from "@/components/clinician/EngagementPanel";

// ─── helpers ────────────────────────────────────────────────────────────────

const intensityToNum = (v) => v === "high" ? 3 : v === "moderate" ? 2 : v === "low" ? 1 : 0;

function moodToNum(m) {
  const map = { great: 5, good: 4, okay: 3, rough: 2, bad: 1, happy: 5, sad: 1 };
  return map[String(m).toLowerCase()] ?? 3;
}

function moodIcon(m) {
  const s = String(m).toLowerCase();
  if (["great", "good", "happy"].includes(s)) return <Smile className="w-4 h-4 text-green-500 inline mr-1" />;
  if (["bad", "rough", "sad"].includes(s)) return <Frown className="w-4 h-4 text-red-400 inline mr-1" />;
  return <Meh className="w-4 h-4 text-yellow-500 inline mr-1" />;
}

function normaliseOutcome(feedback) {
  const f = String(feedback || "").toLowerCase().trim();
  if (["yes", "resolved", "better", "improved", "helpful"].includes(f)) return "resolved";
  if (["no", "escalated", "worse", "escalation"].includes(f)) return "escalated";
  return "other";
}

function within30Days(dateStr) {
  if (!dateStr) return false;
  return isAfter(new Date(dateStr), subDays(new Date(), 30));
}

function computeCheckInStreak(checkIns) {
  if (!checkIns || checkIns.length === 0) return 0;
  const unique = [...new Set(
    checkIns
      .filter(c => c.created_date)
      .map(c => new Date(c.created_date).toISOString().slice(0, 10))
  )].sort().reverse();
  let streak = 0;
  let cursor = new Date().toISOString().slice(0, 10);
  for (const d of unique) {
    const diff = Math.round((new Date(cursor) - new Date(d)) / 86400000);
    if (diff === 0 || diff === 1) { streak++; cursor = d; }
    else break;
  }
  return streak;
}

// ─── sub-components ─────────────────────────────────────────────────────────

function EmptyState({ message }) {
  return (
    <div className="text-center py-8 border border-dashed border-border rounded-xl">
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

function BehaviorFrequencyChart({ logs }) {
  const cutoff = subDays(new Date(), 30);
  const recent = logs.filter(l => l.created_date && isAfter(new Date(l.created_date), cutoff));
  const counts = recent.reduce((acc, l) => {
    const t = l.behavior_type || "Unspecified";
    acc[t] = (acc[t] || 0) + 1;
    return acc;
  }, {});
  const data = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 8)
    .map(([type, count]) => ({ type: type.length > 18 ? type.slice(0, 17) + "…" : type, count }));

  if (data.length === 0) return <EmptyState message="No behavior logs in the last 30 days — frequency breakdown will appear here." />;

  return (
    <ResponsiveContainer width="100%" height={180}>
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 12, top: 0, bottom: 0 }}>
        <XAxis type="number" tick={{ fontSize: 10 }} allowDecimals={false} />
        <YAxis type="category" dataKey="type" tick={{ fontSize: 10 }} width={110} />
        <Tooltip contentStyle={{ fontSize: 11 }} />
        <Bar dataKey="count" fill="hsl(var(--primary) / 0.7)" radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function StrategyEffectivenessTable({ logs }) {
  const relevant = logs.filter(l => l.strategy_used && l.parent_feedback);
  if (relevant.length === 0) return <EmptyState message="No strategy outcome data yet — results will appear as behavior logs include feedback." />;

  const table = {};
  relevant.forEach(l => {
    const s = l.strategy_used;
    if (!table[s]) table[s] = { resolved: 0, escalated: 0, other: 0, total: 0 };
    table[s][normaliseOutcome(l.parent_feedback)]++;
    table[s].total++;
  });

  const rows = Object.entries(table).sort((a, b) => b[1].total - a[1].total).slice(0, 8);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left">
            <th className="pb-2 text-xs font-semibold text-muted-foreground">Strategy</th>
            <th className="pb-2 text-xs font-semibold text-green-600 text-center">Resolved</th>
            <th className="pb-2 text-xs font-semibold text-red-500 text-center">Escalated</th>
            <th className="pb-2 text-xs font-semibold text-muted-foreground text-center">Partial/Other</th>
            <th className="pb-2 text-xs font-semibold text-muted-foreground text-center">Total</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map(([strategy, counts]) => (
            <tr key={strategy}>
              <td className="py-2 pr-3 text-foreground text-xs max-w-[180px] truncate">{strategy}</td>
              <td className="py-2 text-center font-medium text-green-600">{counts.resolved || 0}</td>
              <td className="py-2 text-center font-medium text-red-500">{counts.escalated || 0}</td>
              <td className="py-2 text-center text-muted-foreground">{counts.other || 0}</td>
              <td className="py-2 text-center text-muted-foreground">{counts.total}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PositiveMomentumSection({ wins, checkIns, rewardGoals, winsRef, moodSectionRef, goalsRef, highlighted }) {
  const recent30Wins = wins.filter(w => within30Days(w.created_date));
  const last5Wins = [...recent30Wins].sort((a, b) => new Date(b.created_date) - new Date(a.created_date)).slice(0, 5);

  const moodData = [...checkIns]
    .filter(c => c.created_date && c.mood)
    .sort((a, b) => new Date(a.created_date) - new Date(b.created_date))
    .slice(-14)
    .map((c, i) => ({
      day: format(new Date(c.created_date), "MMM d"),
      mood: moodToNum(c.mood),
      label: c.mood,
    }));

  const activeGoals = rewardGoals.filter(g => {
    const earned = g.tokens_earned ?? g.progress ?? 0;
    const goal = g.tokens_goal ?? g.target ?? 10;
    return earned < goal;
  });

  const hasWins = recent30Wins.length > 0;
  const hasMood = moodData.length >= 3;
  const hasGoals = activeGoals.length > 0;

  if (!hasWins && !hasMood && !hasGoals) {
    return (
      <EmptyState message="No wins, check-ins, or active goals recorded yet — your positive momentum will show here as data comes in." />
    );
  }

  return (
    <div className="space-y-4">
      {/* Wins */}
      <div ref={winsRef} className={`bg-card border border-border rounded-2xl p-5 print-section transition-shadow${highlighted === "wins" ? " section-highlight-active" : ""}`}>
        <div className="flex items-center gap-2 mb-3">
          <Star className="w-4 h-4 text-yellow-500" />
          <h3 className="font-semibold text-foreground text-sm">Wins — Last 30 Days</h3>
          {hasWins && <span className="ml-auto text-2xl font-bold text-foreground">{recent30Wins.length}</span>}
        </div>
        {!hasWins ? (
          <EmptyState message="No wins logged in the last 30 days — wins logged by parents will appear here." />
        ) : (
          <ul className="space-y-2">
            {last5Wins.map((w, i) => (
              <li key={w.id || i} className="flex items-start gap-2 text-sm">
                <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-foreground">{w.description || w.win_type || "Win logged"}</p>
                  {w.created_date && (
                    <p className="text-xs text-muted-foreground">{format(new Date(w.created_date), "MMM d")}</p>
                  )}
                </div>
              </li>
            ))}
            {recent30Wins.length > 5 && (
              <p className="text-xs text-muted-foreground pt-1">+{recent30Wins.length - 5} more wins this month</p>
            )}
          </ul>
        )}
      </div>

      {/* Mood sparkline */}
      <div ref={moodSectionRef} className={`bg-card border border-border rounded-2xl p-5 print-section transition-shadow${highlighted === "mood" ? " section-highlight-active" : ""}`}>
        <div className="flex items-center gap-2 mb-3">
          <Heart className="w-4 h-4 text-pink-500" />
          <h3 className="font-semibold text-foreground text-sm">Mood Trend — Last 14 Check-ins</h3>
        </div>
        {!hasMood ? (
          <EmptyState message={`${checkIns.length < 3 ? "Fewer than 3 check-ins recorded yet" : "No mood data available"} — check-in streaks will appear here.`} />
        ) : (
          <>
            <ResponsiveContainer width="100%" height={120}>
              <LineChart data={moodData} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="day" tick={{ fontSize: 9 }} />
                <YAxis domain={[1, 5]} ticks={[1, 2, 3, 4, 5]}
                  tickFormatter={v => v === 5 ? "😊" : v === 3 ? "😐" : v === 1 ? "😢" : ""}
                  tick={{ fontSize: 10 }} />
                <Tooltip
                  contentStyle={{ fontSize: 11 }}
                  formatter={(v, _, p) => [p.payload.label, "Mood"]}
                />
                <Line type="monotone" dataKey="mood" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
            <div className="flex gap-3 mt-2 flex-wrap">
              {moodData.slice(-3).map((d, i) => (
                <span key={i} className="text-xs text-muted-foreground flex items-center">
                  {moodIcon(d.label)}{d.label}
                </span>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Reward goals */}
      {hasGoals && (
        <div ref={goalsRef} className={`bg-card border border-border rounded-2xl p-5 print-section transition-shadow${highlighted === "goals" ? " section-highlight-active" : ""}`}>
          <div className="flex items-center gap-2 mb-3">
            <Trophy className="w-4 h-4 text-yellow-500" />
            <h3 className="font-semibold text-foreground text-sm">Active Reward Goals</h3>
          </div>
          <div className="space-y-4">
            {activeGoals.slice(0, 5).map((g, i) => {
              const earned = g.tokens_earned ?? g.progress ?? 0;
              const goalTotal = g.tokens_goal ?? g.target ?? 10;
              const pct = Math.min(100, Math.round((earned / goalTotal) * 100));
              return (
                <div key={g.id || i}>
                  <div className="flex justify-between items-baseline mb-1">
                    <p className="text-sm font-medium text-foreground truncate pr-2">{g.goal_title || g.goal_name || "Goal"}</p>
                    <span className="text-xs text-muted-foreground flex-shrink-0">{earned} / {goalTotal}</span>
                  </div>
                  {g.reward && <p className="text-xs text-muted-foreground mb-1">Reward: {g.reward}</p>}
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── main page ───────────────────────────────────────────────────────────────

export default function ProgressReports() {
  const navigate = useNavigate();
  const [children, setChildren] = useState([]);
  const [selectedChildId, setSelectedChildId] = useState("");
  const [logs, setLogs] = useState([]);
  const [wins, setWins] = useState([]);
  const [checkIns, setCheckIns] = useState([]);
  const [rewardGoals, setRewardGoals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isClinician, setIsClinician] = useState(false);
  const [isClientSession, setIsClientSession] = useState(false);
  const [portalError, setPortalError] = useState(null);
  const [clinicalNotes, setClinicalNotes] = useState("");
  const [showNotesPanel, setShowNotesPanel] = useState(false);
  const [clientInviteToken, setClientInviteToken] = useState(null);
  // Tracks whether the initial client-session portal load has completed.
  // The sibling re-fetch effect skips while this is false to avoid a
  // double-fetch on mount, but runs for ALL subsequent child selections
  // (including switching back to the originally authenticated child).
  const clientPortalInitialized = useRef(false);

  // Section refs for the summary card scroll-to feature
  const sectionRefs = {
    engagement: useRef(null),
    behavioral: useRef(null),
    frequency: useRef(null),
    strategy: useRef(null),
    wins: useRef(null),
    mood: useRef(null),
    goals: useRef(null),
  };
  const [highlighted, setHighlighted] = useState(null);

  // ── helpers ──
  function applyPortalData(d) {
    setLogs(d?.behavior_logs || []);
    setWins(d?.win_logs || []);
    setCheckIns(d?.daily_check_ins || []);
    setRewardGoals(d?.goals || []);
  }

  // ── initial load: detect session type, load children + all behavior logs ──
  useEffect(() => {
    const load = async () => {
      const cs = getClientSession();
      if (cs) {
        // Client session (username+code) — use the portal route
        setIsClientSession(true);
        setIsClinician(false);
        setClientInviteToken(cs.invite_token);
        try {
          const result = await base44.functions.invoke("getClientPortalData", {
            child_id: cs.id,
            invite_token: cs.invite_token,
          });
          const d = result.data;
          const siblings = d?.siblings;
          if (siblings && siblings.length > 0) {
            setChildren(siblings);
          } else if (d?.child) {
            setChildren([d.child]);
          }
          setSelectedChildId(cs.id);
          applyPortalData(d);
        } catch {
          setPortalError("Could not load your progress data. Your session may have expired — try signing out and back in.");
        }
        // Mark initialization done so the sibling re-fetch effect is
        // free to run on any subsequent selectedChildId change.
        clientPortalInitialized.current = true;
        setLoading(false);
        return;
      }

      // OIDC user (clinician or parent)
      const me = await base44.auth.me().catch(() => null);
      if (!me) { setLoading(false); return; }
      const isParent = me.app_role === "parent";
      setIsClinician(!isParent);

      const kids = isParent
        ? await base44.entities.Child.filter({ parent_id: me.id }).catch(() => [])
        : await base44.entities.Child.filter({ clinician_id: me.id }).catch(() => []);
      setChildren(kids);

      if (kids.length > 0) {
        setSelectedChildId(kids[0].id);
        const allLogs = await Promise.all(
          kids.map(k => base44.entities.BehaviorLog.filter({ child_id: k.id }).catch(() => []))
        );
        setLogs(allLogs.flat());
      }
      setLoading(false);
    };
    load();
  }, []);

  // ── per-child load: wins, check-ins, reward goals (OIDC users) ──
  useEffect(() => {
    if (!selectedChildId || isClientSession) return;
    Promise.all([
      base44.entities.WinLog.filter({ child_id: selectedChildId }).catch(() => []),
      base44.entities.DailyCheckIn.filter({ child_id: selectedChildId }).catch(() => []),
      base44.entities.RewardToken.filter({ child_id: selectedChildId }).catch(() => []),
    ]).then(([w, c, g]) => {
      setWins(w);
      setCheckIns(c);
      setRewardGoals(g);
    });
  }, [selectedChildId, isClientSession]);

  // ── per-child re-fetch for client-session users when sibling is selected ──
  const [clientChildLoading, setClientChildLoading] = useState(false);
  useEffect(() => {
    if (!isClientSession || !selectedChildId || !clientInviteToken) return;
    // Skip during the initial mount load — the main useEffect already fetched
    // the first child's data.  After that, run for every child selection,
    // including switching back to the originally authenticated child.
    if (!clientPortalInitialized.current) return;

    setClientChildLoading(true);
    base44.functions.invoke("getClientPortalData", {
      child_id: selectedChildId,
      invite_token: clientInviteToken,
    }).then(result => {
      applyPortalData(result.data);
    }).catch(() => {
      // leave existing data
    }).finally(() => {
      setClientChildLoading(false);
    });
  }, [selectedChildId, isClientSession, clientInviteToken]);

  const childLogs = logs.filter(l => l.child_id === selectedChildId);

  const avgIntensity = childLogs.length
    ? (childLogs.reduce((a, b) => a + intensityToNum(b.intensity), 0) / childLogs.length).toFixed(1)
    : 0;

  const strategyBreakdown = childLogs.reduce((acc, log) => {
    if (log.strategy_used) acc[log.strategy_used] = (acc[log.strategy_used] || 0) + 1;
    return acc;
  }, {});

  const intensityChartData = childLogs.slice(-14).map((log, i) => ({
    day: log.created_date ? format(new Date(log.created_date), "MMM d") : `Day ${i + 1}`,
    intensity: intensityToNum(log.intensity),
  }));

  // Derived metrics for summary cards (clinician view only)
  const logs30d = childLogs.filter(l => within30Days(l.created_date)).length;
  const wins30d = wins.filter(w => within30Days(w.created_date)).length;
  const lastMood = [...checkIns]
    .filter(c => c.mood && c.created_date)
    .sort((a, b) => new Date(b.created_date) - new Date(a.created_date))[0]?.mood ?? null;
  const checkInStreak = computeCheckInStreak(checkIns);
  const activeGoalCount = rewardGoals.filter(
    g => (g.tokens_earned ?? g.progress ?? 0) < (g.tokens_goal ?? g.target ?? 10)
  ).length;
  const topStrategy = Object.entries(strategyBreakdown).sort((a, b) => b[1] - a[1])[0] ?? null;

  const scrollTo = (key) => {
    const el = sectionRefs[key]?.current;
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY - 72;
    window.scrollTo({ top, behavior: "smooth" });
    setHighlighted(key);
    setTimeout(() => setHighlighted(null), 1300);
  };

  const handlePrint = () => window.print();

  return (
    <>
      <style>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 16mm 14mm;
          }

          /* ── Hide interactive chrome ── */
          .no-print { display: none !important; }

          /* ── Reset layout for print ── */
          body { background: white !important; color: black !important; }
          .min-h-screen { min-height: unset !important; }
          .max-w-2xl { max-width: 100% !important; }
          .sticky { position: static !important; }

          /* ── Preserve chart / badge colours ── */
          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }

          /* ── Keep each card together ── */
          .print-section { break-inside: avoid !important; }

          /* ── Keep section headings (h2) with their first card ── */
          section > h2 { break-after: avoid !important; }

          /* ── Keep card headings (h3) with the card body ── */
          .bg-card h3 { break-after: avoid !important; }

          /* ── Prevent table rows from splitting mid-row ── */
          tbody tr { break-inside: avoid !important; }

          /* ── Give charts a fixed height so they render fully ── */
          .recharts-responsive-container { overflow: visible !important; }

          /* ── Reduce outer padding slightly to gain space ── */
          .p-5 { padding: 10px !important; }
          .p-4 { padding: 8px !important; }
          .space-y-5 > * + * { margin-top: 10px !important; }
          .space-y-4 > * + * { margin-top: 8px !important; }

          /* ── Clinical summary block: show only when printing ── */
          .clinical-summary-print { display: block !important; }
          .clinical-notes-panel { display: none !important; }
        }

        /* ── Clinical summary block: hidden in normal web view ── */
        .clinical-summary-print { display: none; }

        /* ── Section highlight animation (summary card click) ── */
        @keyframes section-highlight {
          0%   { box-shadow: 0 0 0 0px hsl(var(--primary) / 0.5); }
          40%  { box-shadow: 0 0 0 6px hsl(var(--primary) / 0.25); }
          100% { box-shadow: 0 0 0 0px hsl(var(--primary) / 0); }
        }
        .section-highlight-active {
          animation: section-highlight 1.3s ease-out;
        }
      `}</style>

      <div className="min-h-screen bg-background font-inter">
        <div className="sticky top-0 z-10 bg-card border-b border-border px-4 py-4 flex items-center gap-3 no-print">
          <button onClick={() => navigate(-1)} className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="font-bold text-foreground flex-1">Progress Reports</h1>
          {isClinician && (
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground border border-border rounded-lg px-3 py-1.5"
            >
              <Printer className="w-4 h-4" />
              Save as PDF
            </button>
          )}
        </div>

        <div className="p-5 max-w-2xl mx-auto space-y-5">
          {/* ── Print-only clinician summary block ── */}
          {isClinician && (
            <div className="clinical-summary-print print-section" style={{ marginBottom: 16 }}>
              <div style={{ borderBottom: "2px solid #1e293b", paddingBottom: 6, marginBottom: 8 }}>
                <p style={{ fontWeight: 700, fontSize: 13, color: "#1e293b", letterSpacing: "0.05em", textTransform: "uppercase" }}>
                  Clinician Summary
                </p>
              </div>
              <p style={{ fontSize: 12, color: "#1e293b", whiteSpace: "pre-wrap", lineHeight: 1.6, minHeight: 20 }}>
                {clinicalNotes || ""}
              </p>
            </div>
          )}

          {children.length > 1 && (
            <Select value={selectedChildId} onValueChange={setSelectedChildId}>
              <SelectTrigger className="rounded-xl no-print">
                <SelectValue placeholder="Select client" />
              </SelectTrigger>
              <SelectContent>
                {children.map(c => (
                  <SelectItem key={c.id} value={c.id}>{c.child_name || c.first_name || "Client"}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {/* ── Clinical notes panel (clinicians only, hidden in print) ── */}
          {isClinician && (
            <div className="clinical-notes-panel no-print">
              <button
                onClick={() => setShowNotesPanel(v => !v)}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground border border-border rounded-lg px-3 py-1.5 bg-card w-full justify-between"
              >
                <span className="font-medium">Clinical notes for this report</span>
                <span className="text-muted-foreground">{showNotesPanel ? "▲ Hide" : "▼ Add notes"}</span>
              </button>
              {showNotesPanel && (
                <div className="mt-2 bg-card border border-border rounded-xl p-4">
                  <p className="text-xs text-muted-foreground mb-2">
                    These notes appear at the top of the printed report under "Clinician Summary" and are not saved.
                  </p>
                  <textarea
                    value={clinicalNotes}
                    onChange={e => setClinicalNotes(e.target.value)}
                    placeholder="Add clinical observations, narrative summary, or recommendations…"
                    rows={5}
                    className="w-full text-sm bg-background border border-border rounded-lg px-3 py-2 resize-y text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                  />
                </div>
              )}
            </div>
          )}

          {portalError && (
            <div className="bg-destructive/10 border border-destructive/20 text-destructive rounded-xl px-4 py-3 text-sm">
              {portalError}
            </div>
          )}

          {(loading || clientChildLoading) ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => <div key={i} className="h-32 bg-muted rounded-2xl animate-pulse" />)}
            </div>
          ) : (
            <>
              {/* ── Summary cards (clinician only, hidden in print) ── */}
              {isClinician ? (
                <div className="no-print">
                  <div className="flex gap-2.5 overflow-x-auto pb-1 md:grid md:grid-cols-4 md:overflow-visible md:pb-0 snap-x snap-mandatory md:snap-none">
                    {[
                      { key: "engagement", icon: Activity,     color: "text-primary",    label: "App Engagement",   metric: checkInStreak > 0 ? `${checkInStreak} day streak` : "No streak yet" },
                      { key: "frequency",  icon: BarChart2,    color: "text-primary",    label: "Behavior Logs",    metric: `${logs30d} in 30 days` },
                      { key: "behavioral", icon: TrendingUp,   color: "text-orange-500", label: "Intensity Trend",  metric: Number(avgIntensity) > 0 ? `Avg ${avgIntensity}` : "No data" },
                      { key: "strategy",   icon: CheckCircle2, color: "text-green-500",  label: "Strategies",       metric: `${Object.keys(strategyBreakdown).length} types used` },
                      { key: "wins",       icon: Star,         color: "text-yellow-500", label: "Wins",             metric: `${wins30d} this month` },
                      { key: "mood",       icon: Heart,        color: "text-pink-500",   label: "Mood Trend",       metric: lastMood ? `Last: ${lastMood}` : "No check-ins" },
                      { key: "goals",      icon: Trophy,       color: "text-yellow-600", label: "Active Goals",     metric: `${activeGoalCount} active` },
                    ].map(({ key, icon: Icon, color, label, metric }, i) => (
                      <motion.button
                        key={key}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.04 }}
                        onClick={() => scrollTo(key)}
                        className="min-w-[130px] flex-shrink-0 md:min-w-0 snap-start flex flex-col items-center text-center bg-card border border-border rounded-2xl p-3.5 hover:border-primary/50 hover:shadow-sm cursor-pointer transition-all focus:outline-none focus:ring-2 focus:ring-primary/40"
                      >
                        <Icon className={`w-4 h-4 ${color} mb-1.5`} />
                        <p className="text-[11px] font-medium text-muted-foreground leading-tight mb-1">{label}</p>
                        <p className="text-sm font-bold text-foreground leading-tight">{metric}</p>
                      </motion.button>
                    ))}
                  </div>
                </div>
              ) : (
                /* ── Non-clinician stat row: wins / streak / goals ── */
                <div className="grid grid-cols-3 gap-3 print-section">
                  <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="bg-card border border-border rounded-2xl p-4 text-center">
                    <Star className="w-5 h-5 text-yellow-500 mx-auto mb-1" />
                    <p className="text-2xl font-bold text-foreground">{wins30d}</p>
                    <p className="text-xs text-muted-foreground">Wins This Month</p>
                  </motion.div>
                  <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="bg-card border border-border rounded-2xl p-4 text-center">
                    <Heart className="w-5 h-5 text-pink-500 mx-auto mb-1" />
                    <p className="text-2xl font-bold text-foreground">{checkInStreak}</p>
                    <p className="text-xs text-muted-foreground">Day Check-in Streak</p>
                  </motion.div>
                  <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="bg-card border border-border rounded-2xl p-4 text-center">
                    <Trophy className="w-5 h-5 text-yellow-600 mx-auto mb-1" />
                    <p className="text-2xl font-bold text-foreground">{activeGoalCount}</p>
                    <p className="text-xs text-muted-foreground">Active Goals</p>
                  </motion.div>
                </div>
              )}

              {/* ── App Engagement (clinician only) ── */}
              {isClinician && selectedChildId && (
                <section ref={sectionRefs.engagement} className={highlighted === "engagement" ? "section-highlight-active rounded-2xl" : ""}>
                  <h2 className="text-sm font-bold text-foreground mb-2 flex items-center gap-2">
                    <Activity className="w-4 h-4 text-primary" /> App Engagement
                  </h2>
                  <EngagementPanel
                    childId={selectedChildId}
                    behaviorLogCount={childLogs.filter(l => l.created_date && Date.now() - new Date(l.created_date).getTime() < 7 * 24 * 60 * 60 * 1000).length}
                    dailyCheckIns={checkIns}
                  />
                </section>
              )}

              {/* ── Positive Momentum (non-clinicians see this first) ── */}
              {!isClinician && (
                <section>
                  <h2 className="text-sm font-bold text-foreground mb-2 flex items-center gap-2">
                    <Star className="w-4 h-4 text-yellow-500" /> Positive Momentum
                  </h2>
                  <PositiveMomentumSection
                    wins={wins}
                    checkIns={checkIns}
                    rewardGoals={rewardGoals}
                    winsRef={sectionRefs.wins}
                    moodSectionRef={sectionRefs.mood}
                    goalsRef={sectionRefs.goals}
                    highlighted={highlighted}
                  />
                </section>
              )}

              {/* ── Behavioral Trends ── */}
              <section ref={sectionRefs.behavioral} className={highlighted === "behavioral" ? "section-highlight-active rounded-2xl" : ""}>
                <h2 className="text-sm font-bold text-foreground mb-2 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-orange-500" /> Behavioral Trends
                </h2>
                <div className="space-y-4">
                  {intensityChartData.length > 0 ? (
                    <div className="bg-card border border-border rounded-2xl p-5 print-section">
                      <h3 className="font-semibold text-foreground text-sm mb-4">Intensity Over Time (Last 14 Logs)</h3>
                      <ResponsiveContainer width="100%" height={180}>
                        <BarChart data={intensityChartData}>
                          <XAxis dataKey="day" tick={{ fontSize: 10 }} />
                          <YAxis domain={[0, 3]} ticks={[1, 2, 3]}
                            tickFormatter={v => v === 3 ? "High" : v === 2 ? "Med" : v === 1 ? "Low" : ""}
                            tick={{ fontSize: 10 }} />
                          <Tooltip />
                          <Bar dataKey="intensity" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <div className="bg-card border border-border rounded-2xl p-5">
                      <h3 className="font-semibold text-foreground text-sm mb-2">Intensity Over Time</h3>
                      <EmptyState message="No behavior logs yet — intensity trends will appear here as logs are recorded." />
                    </div>
                  )}

                  <div ref={sectionRefs.frequency} className={`bg-card border border-border rounded-2xl p-5 print-section transition-shadow${highlighted === "frequency" ? " section-highlight-active" : ""}`}>
                    <h3 className="font-semibold text-foreground text-sm mb-4">Behavior Frequency by Type (Last 30 Days)</h3>
                    <BehaviorFrequencyChart logs={childLogs} />
                  </div>

                  <div ref={sectionRefs.strategy} className={`bg-card border border-border rounded-2xl p-5 print-section transition-shadow${highlighted === "strategy" ? " section-highlight-active" : ""}`}>
                    <h3 className="font-semibold text-foreground text-sm mb-4">Strategy Effectiveness</h3>
                    <StrategyEffectivenessTable logs={childLogs} />
                  </div>

                  {Object.keys(strategyBreakdown).length > 0 && (
                    <div className="bg-card border border-border rounded-2xl p-5 print-section">
                      <h3 className="font-semibold text-foreground text-sm mb-3">Strategy Usage</h3>
                      <div className="space-y-2">
                        {Object.entries(strategyBreakdown).sort((a, b) => b[1] - a[1]).map(([strategy, count]) => (
                          <div key={strategy} className="flex items-center gap-3">
                            <p className="text-sm text-foreground flex-1 truncate">{strategy}</p>
                            <div className="flex items-center gap-2">
                              <div className="h-2 bg-primary rounded-full" style={{ width: `${(count / childLogs.length) * 100}px` }} />
                              <span className="text-xs text-muted-foreground w-6 text-right">{count}x</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </section>

              {/* ── Positive Momentum (clinicians see this after Behavioral Trends) ── */}
              {isClinician && (
                <section>
                  <h2 className="text-sm font-bold text-foreground mb-2 flex items-center gap-2">
                    <Star className="w-4 h-4 text-yellow-500" /> Positive Momentum
                  </h2>
                  <PositiveMomentumSection
                    wins={wins}
                    checkIns={checkIns}
                    rewardGoals={rewardGoals}
                    winsRef={sectionRefs.wins}
                    moodSectionRef={sectionRefs.mood}
                    goalsRef={sectionRefs.goals}
                    highlighted={highlighted}
                  />
                </section>
              )}

              {childLogs.length === 0 && wins.length === 0 && checkIns.length === 0 && (
                <div className="text-center py-14 border-2 border-dashed border-border rounded-2xl">
                  <AlertTriangle className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                  <p className="font-medium text-foreground mb-1">No data recorded yet</p>
                  <p className="text-sm text-muted-foreground">{isClinician ? "Behavior logs, check-ins, and wins will appear here as parents engage with the app." : "Your wins, check-ins, and goals will show up here once you start using the app."}</p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
