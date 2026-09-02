import { useState, useEffect } from "react";
import { base44 } from '@/api/entities';
import { Activity, ThumbsUp, ThumbsDown, Bot, Eye, ClipboardList, Heart, CheckCircle2, Trophy, LayoutGrid, Flame } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { format, subDays, startOfDay, isSameDay } from "date-fns";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function computeStreak(checkIns) {
  if (!checkIns || checkIns.length === 0) return 0;
  const sorted = [...checkIns]
    .filter(c => c.created_date)
    .map(c => startOfDay(new Date(c.created_date)).getTime())
    .sort((a, b) => b - a);
  if (sorted.length === 0) return 0;
  const unique = [...new Set(sorted)];
  let streak = 0;
  let cursor = startOfDay(new Date()).getTime();
  for (const dayTs of unique) {
    if (dayTs === cursor || dayTs === cursor - 86400000) {
      streak++;
      cursor = dayTs - 86400000;
    } else {
      break;
    }
  }
  return streak;
}

function buildWeeklyLoginData(events) {
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = subDays(new Date(), 6 - i);
    return { label: format(d, "EEE"), date: startOfDay(d), count: 0 };
  });
  events
    .filter(e => e.event_type === "app_open" && e.created_date)
    .forEach(e => {
      const eDay = startOfDay(new Date(e.created_date));
      const slot = days.find(d => isSameDay(d.date, eDay));
      if (slot) slot.count++;
    });
  return days.map(d => ({ day: d.label, logins: d.count }));
}

export default function EngagementPanel({ childId, behaviorLogCount = 0, dailyCheckIns = [] }) {
  const [events, setEvents] = useState([]);

  useEffect(() => {
    if (!childId) return;
    base44.entities.EngagementEvent.filter({ child_id: childId }, "-created_date", 500)
      .then(setEvents)
      .catch(() => setEvents([]));
  }, [childId]);

  const weekEvents = events.filter(e => e.created_date && Date.now() - new Date(e.created_date).getTime() < WEEK_MS);
  const count = (t) => weekEvents.filter(e => e.event_type === t).length;

  const topicCounts = {};
  weekEvents.filter(e => e.event_type === "behavior_viewed" && e.topic).forEach(e => {
    topicCounts[e.topic] = (topicCounts[e.topic] || 0) + 1;
  });
  const topTopics = Object.entries(topicCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);

  const helpful = weekEvents.filter(e => e.event_type === "feedback" && e.helpful === true).length;
  const notHelpful = weekEvents.filter(e => e.event_type === "feedback" && e.helpful === false).length;

  const aiTopics = [...new Set(weekEvents.filter(e => e.event_type === "ai_question" && e.topic).map(e => e.topic))].slice(0, 4);

  const streak = computeStreak(dailyCheckIns);
  const weeklyLoginData = buildWeeklyLoginData(events);
  const totalLoginsThisWeek = weeklyLoginData.reduce((s, d) => s + d.logins, 0);

  const stats = [
    { icon: Eye, color: "text-primary", label: "App Opens", value: count("app_open") },
    { icon: CheckCircle2, color: "text-green-500", label: "Check-ins", value: count("checkin_completed") },
    { icon: Heart, color: "text-pink-500", label: "Wins Logged", value: count("win_logged") },
    { icon: ClipboardList, color: "text-orange-500", label: "Behavior Logs", value: count("behavior_logged") || behaviorLogCount },
    { icon: LayoutGrid, color: "text-teal-500", label: "Support Sections", value: count("support_section_opened") },
    { icon: Trophy, color: "text-yellow-500", label: "Goals Reached", value: count("goal_reached") },
    { icon: Bot, color: "text-purple-500", label: "AI Questions", value: count("ai_question") },
    { icon: Eye, color: "text-blue-400", label: "Help Button", value: count("help_opened") },
  ];

  return (
    <div className="bg-card border border-border rounded-2xl p-5 print-section">
      <div className="flex items-center gap-2 mb-4">
        <Activity className="w-4 h-4 text-primary" />
        <h2 className="font-semibold text-foreground text-sm">Client Engagement — This Week</h2>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="bg-background border border-border rounded-xl p-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Logins Per Day</p>
          {totalLoginsThisWeek === 0 ? (
            <p className="text-xs text-muted-foreground py-2">No app opens recorded this week.</p>
          ) : (
            <ResponsiveContainer width="100%" height={80}>
              <BarChart data={weeklyLoginData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <XAxis dataKey="day" tick={{ fontSize: 9 }} />
                <YAxis tick={{ fontSize: 9 }} allowDecimals={false} />
                <Tooltip contentStyle={{ fontSize: 11 }} />
                <Bar dataKey="logins" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="bg-background border border-border rounded-xl p-3 flex flex-col justify-center items-center text-center">
          <Flame className={`w-6 h-6 mb-1 ${streak > 0 ? "text-orange-500" : "text-muted-foreground"}`} />
          <p className="text-3xl font-bold text-foreground">{streak}</p>
          <p className="text-xs text-muted-foreground">Check-in Streak</p>
          {streak === 0 && <p className="text-[10px] text-muted-foreground mt-1">No consecutive days yet</p>}
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2 mb-4">
        {stats.map(({ icon: Icon, color, label, value }) => (
          <div key={label} className="bg-background border border-border rounded-xl p-2.5 text-center">
            <Icon className={`w-3.5 h-3.5 ${color} mx-auto mb-1`} />
            <p className="text-lg font-bold text-foreground">{value}</p>
            <p className="text-[10px] text-muted-foreground leading-tight">{label}</p>
          </div>
        ))}
      </div>

      {topTopics.length > 0 && (
        <div className="mb-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Most Viewed Topics</p>
          <div className="space-y-1.5">
            {topTopics.map(([topic, n]) => (
              <div key={topic} className="flex items-center justify-between">
                <p className="text-sm text-foreground truncate">{topic}</p>
                <span className="text-xs text-muted-foreground flex-shrink-0">{n}x</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {aiTopics.length > 0 && (
        <div className="mb-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Recent AI Topics</p>
          <div className="flex flex-wrap gap-1.5">
            {aiTopics.map((t, i) => (
              <span key={i} className="text-xs bg-muted text-muted-foreground px-2.5 py-1 rounded-full truncate max-w-[200px]">{t}</span>
            ))}
          </div>
        </div>
      )}

      {(helpful > 0 || notHelpful > 0) && (
        <div className="flex items-center gap-4 pt-3 border-t border-border">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Guidance Feedback</p>
          <span className="flex items-center gap-1 text-sm text-green-600 font-medium"><ThumbsUp className="w-3.5 h-3.5" /> {helpful}</span>
          <span className="flex items-center gap-1 text-sm text-red-500 font-medium"><ThumbsDown className="w-3.5 h-3.5" /> {notHelpful}</span>
        </div>
      )}

      <p className="text-[11px] text-muted-foreground mt-3">
        Engagement events are information views — they do not count as behavior occurrences.
      </p>
    </div>
  );
}
