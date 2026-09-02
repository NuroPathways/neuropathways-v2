import { useState, useEffect } from "react";
import { base44 } from '@/api/entities';
import { motion, AnimatePresence } from "framer-motion";
import { Target, ChevronRight, RefreshCw } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function GoalWidget({ childIds = [], prefetchedGoals }) {
  const navigate = useNavigate();
  const [goals, setGoals] = useState([]);
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(true);

  // When portal data is pre-fetched (client-session), use it directly.
  useEffect(() => {
    if (prefetchedGoals === undefined) return;
    const all = prefetchedGoals.filter(g => g.goal_title || g.reward_description);
    const dayIdx = new Date().getDate() % Math.max(all.length, 1);
    setIndex(dayIdx);
    setGoals(all);
    setLoading(false);
  }, [prefetchedGoals]);

  // For OIDC users, fall back to direct entity queries.
  useEffect(() => {
    if (prefetchedGoals !== undefined) return;
    if (childIds.length === 0) { setLoading(false); return; }
    const load = async () => {
      const results = await Promise.all(
        childIds.map(id => base44.entities.RewardToken.filter({ child_id: id }).catch(() => []))
      );
      const all = results.flat().filter(g => g.goal_title || g.reward_description);
      // Rotate based on day so it's different each login
      const dayIdx = new Date().getDate() % Math.max(all.length, 1);
      setIndex(dayIdx);
      setGoals(all);
      setLoading(false);
    };
    load();
  }, [childIds.join(","), prefetchedGoals]);

  const rotate = () => setIndex(i => (i + 1) % goals.length);

  if (loading || goals.length === 0) return null;

  const goal = goals[index];
  const title = goal.goal_title || goal.reward_description || "Current Goal";
  const desc = goal.goal_description || goal.milestone_notes || "";
  const progress = goal.progress || goal.tokens_earned || 0;
  const target = goal.target || goal.tokens_goal || 10;
  const pct = Math.min(Math.round((progress / Math.max(target, 1)) * 100), 100);

  const FREQ_LABELS = { daily: "Daily", weekly: "Weekly", biweekly: "Bi-Weekly", monthly: "Monthly", every_3_months: "Every 3 Months", every_6_months: "Every 6 Months", yearly: "Yearly" };
  const freqLabel = FREQ_LABELS[goal.frequency];

  const daysLabel = goal.next_review_days
    ? `Next review: ${goal.next_review_days} days`
    : goal.created_by_clinician
      ? "Clinician assigned"
      : "Self-tracked";

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.12 }}
      className="bg-gradient-to-br from-primary/5 to-accent/5 border border-primary/15 rounded-2xl p-5"
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Target className="w-4 h-4 text-primary" />
          <span className="text-xs font-semibold text-primary uppercase tracking-wide">Current Focus</span>
        </div>
        <div className="flex items-center gap-1">
          {goals.length > 1 && (
            <button
              onClick={rotate}
              className="p-1 rounded-lg hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors"
              title="See next goal"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            onClick={() => navigate("/GoalsMilestones")}
            className="p-1 rounded-lg hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={index}
          initial={{ opacity: 0, x: 12 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -12 }}
          transition={{ duration: 0.2 }}
        >
          <p className="font-semibold text-foreground text-base mb-1 leading-snug">{title}</p>
          {desc && <p className="text-xs text-muted-foreground mb-3 leading-relaxed line-clamp-2">{desc}</p>}

          {/* Progress bar */}
          <div className="mb-2">
            <div className="flex justify-between items-center mb-1">
              <span className="text-xs text-muted-foreground">Progress</span>
              <span className="text-xs font-bold text-primary">{pct}%</span>
            </div>
            <div className="h-2.5 bg-muted rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${pct}%` }}
                transition={{ duration: 0.8, ease: "easeOut" }}
                className="h-full bg-gradient-to-r from-primary to-accent rounded-full"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <p className="text-xs text-muted-foreground">{daysLabel}</p>
            {freqLabel && <span className="text-[10px] font-semibold bg-primary/10 text-primary px-2 py-0.5 rounded-full">{freqLabel}</span>}
          </div>
        </motion.div>
      </AnimatePresence>

      {goals.length > 1 && (
        <div className="flex justify-center gap-1 mt-3">
          {goals.map((_, i) => (
            <button
              key={i}
              onClick={() => setIndex(i)}
              className={`w-1.5 h-1.5 rounded-full transition-all ${i === index ? "bg-primary w-3" : "bg-muted-foreground/30"}`}
            />
          ))}
        </div>
      )}
    </motion.div>
  );
}