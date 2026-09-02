import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/entities";
import { motion } from "framer-motion";
import { Star, Flame, ChevronRight, Smile, Frown, Meh } from "lucide-react";
import { format, subDays, isAfter } from "date-fns";

function moodLabel(m) {
  const s = String(m || "").toLowerCase();
  if (!s) return null;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function MoodIcon({ mood }) {
  const s = String(mood || "").toLowerCase();
  if (["great", "good", "happy"].includes(s)) return <Smile className="w-4 h-4 text-green-500" />;
  if (["bad", "rough", "sad"].includes(s)) return <Frown className="w-4 h-4 text-red-400" />;
  return <Meh className="w-4 h-4 text-yellow-500" />;
}

function calcStreak(checkIns) {
  const days = new Set(
    checkIns
      .filter(c => c.created_date)
      .map(c => format(new Date(c.created_date), "yyyy-MM-dd"))
  );
  let streak = 0;
  let d = new Date();
  if (!days.has(format(d, "yyyy-MM-dd"))) {
    d = subDays(d, 1);
  }
  while (days.has(format(d, "yyyy-MM-dd"))) {
    streak++;
    d = subDays(d, 1);
  }
  return streak;
}

export default function MomentumCard({ childIds, prefetchedWins, prefetchedCheckIns }) {
  const navigate = useNavigate();
  const [winsThisWeek, setWinsThisWeek] = useState(null);
  const [streak, setStreak] = useState(null);
  const [lastMood, setLastMood] = useState(null);
  const [loading, setLoading] = useState(true);

  const idsKey = (childIds || []).join(",");
  const hasPrefetch = prefetchedWins !== undefined && prefetchedCheckIns !== undefined;

  // When portal data is pre-fetched (client-session), compute stats directly.
  useEffect(() => {
    if (!hasPrefetch) return;
    const weekAgo = subDays(new Date(), 7);
    const wins = prefetchedWins.filter(w => w.created_date && isAfter(new Date(w.created_date), weekAgo));
    setWinsThisWeek(wins.length);
    const sorted = [...prefetchedCheckIns]
      .filter(c => c.mood && c.created_date)
      .sort((a, b) => new Date(b.created_date) - new Date(a.created_date));
    setLastMood(sorted[0]?.mood || null);
    setStreak(calcStreak(prefetchedCheckIns));
    setLoading(false);
  }, [prefetchedWins, prefetchedCheckIns, hasPrefetch]);

  // For OIDC users, fall back to direct entity queries.
  useEffect(() => {
    if (hasPrefetch) return;
    if (!childIds || childIds.length === 0) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const load = async () => {
      try {
        const [allWinsArrays, allCheckInArrays] = await Promise.all([
          Promise.all(childIds.map(id => base44.entities.WinLog.filter({ child_id: id }).catch(() => []))),
          Promise.all(childIds.map(id => base44.entities.DailyCheckIn.filter({ child_id: id }).catch(() => []))),
        ]);

        const allWins = allWinsArrays.flat();
        const allCheckIns = allCheckInArrays.flat();

        const weekAgo = subDays(new Date(), 7);
        const wins = allWins.filter(
          w => w.created_date && isAfter(new Date(w.created_date), weekAgo)
        );
        setWinsThisWeek(wins.length);

        const sorted = [...allCheckIns]
          .filter(c => c.mood && c.created_date)
          .sort((a, b) => new Date(b.created_date) - new Date(a.created_date));
        setLastMood(sorted[0]?.mood || null);

        setStreak(calcStreak(allCheckIns));
      } catch {
        setWinsThisWeek(0);
        setStreak(0);
        setLastMood(null);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [idsKey, hasPrefetch]);

  const hasData = winsThisWeek > 0 || streak > 0 || lastMood;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.08 }}
    >
      <button
        onClick={() => navigate("/ProgressReports")}
        className="w-full text-left bg-card border border-border rounded-2xl p-5 hover:border-primary/40 hover:shadow-md transition-all group"
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-yellow-50 flex items-center justify-center flex-shrink-0">
              <Star className="w-4 h-4 text-yellow-500" />
            </div>
            <h2 className="font-semibold text-foreground text-sm">Positive Momentum</h2>
          </div>
          <div className="flex items-center gap-1 text-xs text-primary font-medium group-hover:underline">
            Full view <ChevronRight className="w-3.5 h-3.5" />
          </div>
        </div>

        {loading ? (
          <div className="grid grid-cols-3 gap-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-16 bg-muted rounded-xl animate-pulse" />
            ))}
          </div>
        ) : !hasData ? (
          <div className="text-center py-5 border border-dashed border-border rounded-xl">
            <Star className="w-6 h-6 text-muted-foreground mx-auto mb-2" />
            <p className="text-xs font-medium text-foreground mb-0.5">No momentum data yet</p>
            <p className="text-xs text-muted-foreground">Wins and check-ins will appear here as they're logged.</p>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-yellow-50 rounded-xl p-3 text-center">
              <Star className="w-4 h-4 text-yellow-500 mx-auto mb-1" />
              <p className="text-xl font-bold text-foreground">{winsThisWeek}</p>
              <p className="text-xs text-muted-foreground leading-tight">Wins this week</p>
            </div>
            <div className="bg-orange-50 rounded-xl p-3 text-center">
              <Flame className="w-4 h-4 text-orange-500 mx-auto mb-1" />
              <p className="text-xl font-bold text-foreground">{streak}</p>
              <p className="text-xs text-muted-foreground leading-tight">Day streak</p>
            </div>
            <div className="bg-green-50 rounded-xl p-3 text-center flex flex-col items-center justify-center">
              {lastMood ? (
                <>
                  <MoodIcon mood={lastMood} />
                  <p className="text-sm font-bold text-foreground mt-1">{moodLabel(lastMood)}</p>
                  <p className="text-xs text-muted-foreground leading-tight">Last mood</p>
                </>
              ) : (
                <>
                  <Meh className="w-4 h-4 text-muted-foreground mx-auto mb-1" />
                  <p className="text-xs text-muted-foreground leading-tight">No mood yet</p>
                </>
              )}
            </div>
          </div>
        )}
      </button>
    </motion.div>
  );
}
