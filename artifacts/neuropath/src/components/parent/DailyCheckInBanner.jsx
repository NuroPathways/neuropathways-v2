import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Bell, X, ClipboardList, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { format, isToday } from "date-fns";

export default function DailyCheckInBanner({ logs, childId, onLogClick, onDismiss }) {
  const [dismissed, setDismissed] = useState(() => {
    const stored = localStorage.getItem("checkin_dismissed");
    if (!stored) return false;
    return stored === format(new Date(), "yyyy-MM-dd");
  });

  const hasLoggedToday = logs.some(log => log.created_date && isToday(new Date(log.created_date)));

  const dismiss = () => {
    localStorage.setItem("checkin_dismissed", format(new Date(), "yyyy-MM-dd"));
    setDismissed(true);
    onDismiss?.();
  };

  if (hasLoggedToday || dismissed) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -8, height: 0 }}
        animate={{ opacity: 1, y: 0, height: "auto" }}
        exit={{ opacity: 0, y: -8, height: 0 }}
        className="mb-4"
      >
        <div className="bg-primary/10 border border-primary/30 rounded-2xl p-4 flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary/20 flex items-center justify-center flex-shrink-0 mt-0.5">
            <Bell className="w-4 h-4 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-foreground text-sm">Daily Check-In</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              You haven't logged any behaviors today. A quick check-in helps track progress over time.
            </p>
            <div className="flex gap-2 mt-3">
              <Button
                size="sm"
                className="h-8 text-xs rounded-xl gap-1.5"
                onClick={() => { onLogClick(); dismiss(); }}
              >
                <ClipboardList className="w-3.5 h-3.5" />
                Log Now
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-8 text-xs rounded-xl gap-1.5 text-muted-foreground"
                onClick={dismiss}
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                All good today
              </Button>
            </div>
          </div>
          <button onClick={dismiss} className="text-muted-foreground hover:text-foreground mt-0.5 flex-shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}