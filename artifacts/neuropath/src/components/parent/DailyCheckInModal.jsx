import { useState, useEffect } from "react";
import { base44 } from '@/api/entities';
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";

const MOODS = [
  { key: "great",          emoji: "😊", label: "Great" },
  { key: "okay",           emoji: "😐", label: "Okay" },
  { key: "difficult",      emoji: "😔", label: "Difficult" },
  { key: "very_difficult", emoji: "😫", label: "Very difficult" },
];

const WINS = [
  "You showed up for your family today.",
  "Using the app is a step forward.",
  "Every small effort matters.",
  "You're building healthy habits.",
  "Support starts with awareness.",
];

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function computeStreak(checkIns) {
  if (!checkIns || checkIns.length === 0) return 1;
  const sorted = [...checkIns]
    .map(c => c.date)
    .sort()
    .reverse();

  let streak = 1;
  let current = new Date(todayStr());
  for (const dateStr of sorted) {
    const d = new Date(dateStr);
    const diff = Math.round((current - d) / 86400000);
    if (diff === 0) continue;
    if (diff === 1) { streak++; current = d; }
    else break;
  }
  return streak;
}

export default function DailyCheckInModal({ userId, childId, onComplete }) {
  const [show, setShow] = useState(false);
  const [selected, setSelected] = useState(null);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [streak, setStreak] = useState(1);
  const [tip] = useState(WINS[Math.floor(Math.random() * WINS.length)]);

  useEffect(() => {
    if (!userId) return;
    const storageKey = `checkin_${userId}_${todayStr()}`;
    if (localStorage.getItem(storageKey)) return; // already checked in today
    // Small delay so dashboard loads first
    const t = setTimeout(() => setShow(true), 800);
    return () => clearTimeout(t);
  }, [userId]);

  const handleMood = async (moodKey) => {
    setSelected(moodKey);
    setSaving(true);
    const today = todayStr();

    try {
      const past = await base44.entities.DailyCheckIn.filter({ parent_id: userId }).catch(() => []);
      const newStreak = computeStreak(past);
      setStreak(newStreak);

      await base44.entities.DailyCheckIn.create({
        parent_id: userId,
        child_id: childId || "",
        date: today,
        mood: moodKey,
        streak: newStreak,
      });

      base44.entities.EngagementEvent.create({
        child_id: childId || "",
        parent_id: userId,
        event_type: "checkin_completed",
        topic: "daily_checkin",
        metadata: { mood: moodKey, streak: newStreak },
      }).catch(() => {});

      localStorage.setItem(`checkin_${userId}_${today}`, "1");
    } catch (_) {}

    setSaving(false);
    setDone(true);
    setTimeout(() => {
      setShow(false);
      if (onComplete) onComplete();
    }, 2200);
  };

  return (
    <AnimatePresence>
      {show && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
          />
          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 24 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 16 }}
            transition={{ type: "spring", stiffness: 340, damping: 28 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-5"
          >
            <div className="bg-card rounded-3xl shadow-2xl w-full max-w-sm p-7 relative">
              <button
                onClick={() => setShow(false)}
                className="absolute top-4 right-4 text-muted-foreground hover:text-foreground"
              >
                <X className="w-4 h-4" />
              </button>

              <AnimatePresence mode="wait">
                {!done ? (
                  <motion.div key="prompt" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    <p className="text-xs font-semibold text-primary uppercase tracking-widest mb-2">Daily Check-In</p>
                    <h2 className="text-xl font-bold text-foreground mb-1">How are things going today?</h2>
                    <p className="text-xs text-muted-foreground mb-7">Takes just a second. We're here for you.</p>
                    <div className="grid grid-cols-2 gap-3">
                      {MOODS.map((m) => (
                        <button
                          key={m.key}
                          disabled={saving}
                          onClick={() => handleMood(m.key)}
                          className={`flex flex-col items-center gap-2 p-4 rounded-2xl border-2 transition-all font-medium text-sm
                            ${selected === m.key
                              ? "border-primary bg-primary/5 text-primary"
                              : "border-border hover:border-primary/40 hover:bg-muted text-foreground"
                            }`}
                        >
                          <span className="text-3xl">{m.emoji}</span>
                          <span>{m.label}</span>
                        </button>
                      ))}
                    </div>
                  </motion.div>
                ) : (
                  <motion.div
                    key="done"
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="text-center py-4"
                  >
                    <div className="text-5xl mb-4">
                      {MOODS.find(m => m.key === selected)?.emoji}
                    </div>
                    {streak > 1 && (
                      <div className="inline-flex items-center gap-1.5 bg-orange-50 text-orange-600 text-xs font-bold px-3 py-1.5 rounded-full mb-3">
                        🔥 {streak} Day Streak!
                      </div>
                    )}
                    <p className="text-base font-bold text-foreground mb-1">Thanks for checking in</p>
                    <p className="text-xs text-muted-foreground leading-relaxed">{tip}</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}