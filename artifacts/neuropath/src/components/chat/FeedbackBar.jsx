import { motion } from "framer-motion";
import { ThumbsUp, Minus, ThumbsDown } from "lucide-react";

export default function FeedbackBar({ onFeedback }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-wrap items-center gap-2 bg-muted/40 rounded-2xl px-4 py-3 border border-border max-w-2xl"
    >
      <p className="text-xs text-muted-foreground flex-1 min-w-[120px]">Did this strategy help?</p>
      <div className="flex gap-2">
        <button
          onClick={() => onFeedback("yes")}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-100 text-green-700 text-xs font-medium hover:bg-green-200 transition-colors"
        >
          <ThumbsUp className="w-3 h-3" />
          Yes
        </button>
        <button
          onClick={() => onFeedback("partially")}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-yellow-100 text-yellow-700 text-xs font-medium hover:bg-yellow-200 transition-colors"
        >
          <Minus className="w-3 h-3" />
          Partially
        </button>
        <button
          onClick={() => onFeedback("no")}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-100 text-red-700 text-xs font-medium hover:bg-red-200 transition-colors"
        >
          <ThumbsDown className="w-3 h-3" />
          No
        </button>
      </div>
    </motion.div>
  );
}