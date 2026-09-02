import { useState } from "react";
import { base44 } from '@/api/entities';
import { ThumbsUp, ThumbsDown } from "lucide-react";
import { motion } from "framer-motion";

export default function HelpFeedback({ child, topic }) {
  const [sent, setSent] = useState(null);

  const send = (helpful) => {
    setSent(helpful);
    base44.entities.EngagementEvent.create({
      child_id: child?.id,
      clinician_id: child?.clinician_id,
      event_type: "feedback",
      topic,
      helpful,
    }).catch(() => {});
  };

  if (sent !== null) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mb-4 text-center text-sm text-muted-foreground bg-card border border-border rounded-2xl p-4">
        {sent ? "💙 Thanks! Your feedback was shared with your clinician." : "Thanks — your clinician will see this and can adjust the plan."}
      </motion.div>
    );
  }

  return (
    <div className="mb-4 bg-card border border-border rounded-2xl p-4 flex items-center justify-between gap-3">
      <p className="text-sm font-medium text-foreground">Was this guidance helpful?</p>
      <div className="flex gap-2 flex-shrink-0">
        <button onClick={() => send(true)} className="p-2.5 rounded-xl border border-border hover:bg-green-50 hover:border-green-300 text-green-600 transition-colors" aria-label="Helpful">
          <ThumbsUp className="w-4 h-4" />
        </button>
        <button onClick={() => send(false)} className="p-2.5 rounded-xl border border-border hover:bg-red-50 hover:border-red-300 text-red-600 transition-colors" aria-label="Not helpful">
          <ThumbsDown className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}