import { useEffect, useState } from "react";
import { base44 } from '@/api/entities';

export default function StreakBadge({ userId }) {
  const [streak, setStreak] = useState(null);

  useEffect(() => {
    if (!userId) return;
    base44.entities.DailyCheckIn.filter({ parent_id: userId }, "-created_date", 60)
      .then(checkIns => {
        if (!checkIns || checkIns.length === 0) return;
        const sorted = [...checkIns].map(c => c.date).sort().reverse();
        let s = 0;
        let current = new Date(new Date().toISOString().slice(0, 10));
        for (const dateStr of sorted) {
          const d = new Date(dateStr);
          const diff = Math.round((current - d) / 86400000);
          if (diff === 0 || diff === 1) { s++; current = d; }
          else break;
        }
        if (s > 1) setStreak(s);
      })
      .catch(() => {});
  }, [userId]);

  if (!streak) return null;

  return (
    <div className="inline-flex items-center gap-1 bg-white/20 rounded-full px-2.5 py-1 text-white text-xs font-bold">
      🔥 {streak} day streak
    </div>
  );
}