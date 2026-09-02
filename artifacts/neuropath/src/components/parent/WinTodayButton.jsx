import { useState } from "react";
import { base44 } from '@/api/entities';
import { motion, AnimatePresence } from "framer-motion";
import { X, Heart, Sparkles } from "lucide-react";
import confetti from "canvas-confetti";

const PRESET_WINS = [
  "Used words instead of yelling",
  "Completed homework without issues",
  "Successfully transitioned between activities",
  "Used a communication device",
  "Practiced a coping strategy",
  "Had a calm morning routine",
  "Made it through a difficult moment",
  "Asked for help appropriately",
];

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export default function WinTodayButton({ userId, inviteToken, children = [], defaultChildId }) {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState("");
  const [selectedChild, setSelectedChild] = useState(defaultChildId || children[0]?.id || "");
  const [saving, setSaving] = useState(false);
  const [celebrated, setCelebrated] = useState(false);

  const fireConfetti = () => {
    confetti({ particleCount: 90, spread: 70, origin: { y: 0.65 }, colors: ["#4A7AB5", "6BAEAD", "#E8F4FD", "#ffffff"] });
    setTimeout(() => confetti({ particleCount: 50, spread: 55, origin: { y: 0.6 }, colors: ["#FFD700", "#FF69B4", "#7CFC00"] }), 350);
  };

  const handleSubmit = async (winText) => {
    if (!winText.trim() || saving) return;
    setSaving(true);
    const child = children.find(c => c.id === selectedChild);
    try {
      await base44.entities.WinLog.create({
        parent_id: userId,
        child_id: selectedChild || "",
        child_name: child?.child_name || "",
        win_text: winText.trim(),
        date: todayStr(),
        ...(inviteToken ? { invite_token: inviteToken } : {}),
      });
      base44.entities.EngagementEvent.create({
        child_id: selectedChild || "",
        parent_id: userId,
        event_type: "win_logged",
        topic: winText.trim(),
      }).catch(() => {});
      fireConfetti();
      setCelebrated(true);
      setTimeout(() => {
        setCelebrated(false);
        setOpen(false);
        setCustom("");
      }, 3000);
    } catch (_) {}
    setSaving(false);
  };

  return (
    <>
      {/* Floating button */}
      <motion.button
        whileTap={{ scale: 0.93 }}
        whileHover={{ scale: 1.05 }}
        onClick={() => { setSelectedChild(defaultChildId || children[0]?.id || ""); setOpen(true); }}
        className="fixed bottom-24 right-5 z-40 flex items-center gap-2 bg-primary text-white rounded-full px-4 py-3 shadow-xl shadow-primary/30 font-semibold text-sm"
        style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom, 0px))" }}
      >
        <Heart className="w-4 h-4 fill-white" />
        <span>We had a win!</span>
      </motion.button>

      {/* Modal */}
      <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
              onClick={() => !celebrated && setOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.92, y: 30 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.94, y: 20 }}
              transition={{ type: "spring", stiffness: 340, damping: 28 }}
              className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 sm:p-5"
            >
              <div className="bg-card rounded-3xl shadow-2xl w-full max-w-md p-6 relative max-h-[85vh] overflow-y-auto">
                {!celebrated && (
                  <button onClick={() => setOpen(false)} className="absolute top-4 right-4 text-muted-foreground hover:text-foreground">
                    <X className="w-4 h-4" />
                  </button>
                )}

                <AnimatePresence mode="wait">
                  {celebrated ? (
                    <motion.div
                      key="celebrate"
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="text-center py-8"
                    >
                      <div className="text-6xl mb-4">🎉</div>
                      <h2 className="text-2xl font-bold text-foreground mb-2">Amazing!</h2>
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        That win has been shared with your clinician. Every positive moment matters — keep building on it!
                      </p>
                      <div className="mt-4 flex justify-center gap-2">
                        <span className="text-2xl">🌟</span>
                        <span className="text-2xl">💙</span>
                        <span className="text-2xl">🌟</span>
                      </div>
                    </motion.div>
                  ) : (
                    <motion.div key="form" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                      <div className="flex items-center gap-3 mb-5">
                        <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <Heart className="w-5 h-5 text-primary" />
                        </div>
                        <div>
                          <h2 className="font-bold text-foreground text-base">We had a win today 💙</h2>
                          <p className="text-xs text-muted-foreground">Celebrate a positive moment</p>
                        </div>
                      </div>

                      {/* Child selector */}
                      {children.length > 1 && (
                        <div className="mb-4">
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Who had a win?</p>
                          <div className="flex gap-2 flex-wrap">
                            {children.map(c => (
                              <button
                                key={c.id}
                                onClick={() => setSelectedChild(c.id)}
                                className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                                  selectedChild === c.id
                                    ? "bg-primary text-white border-primary"
                                    : "border-border text-muted-foreground hover:border-primary/40"
                                }`}
                              >
                                {c.child_name}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Preset wins */}
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Choose a win</p>
                      <div className="space-y-2 mb-4">
                        {PRESET_WINS.map((w) => (
                          <button
                            key={w}
                            onClick={() => handleSubmit(w)}
                            disabled={saving}
                            className="w-full text-left px-4 py-3 rounded-xl border border-border hover:border-primary/40 hover:bg-primary/5 text-sm text-foreground transition-all flex items-center gap-2 group"
                          >
                            <Sparkles className="w-3.5 h-3.5 text-primary opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                            {w}
                          </button>
                        ))}
                      </div>

                      {/* Custom win */}
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Or describe your own</p>
                      <div className="flex gap-2">
                        <input
                          value={custom}
                          onChange={e => setCustom(e.target.value)}
                          onKeyDown={e => e.key === "Enter" && handleSubmit(custom)}
                          placeholder="What went well today?"
                          className="flex-1 px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                        />
                        <button
                          onClick={() => handleSubmit(custom)}
                          disabled={!custom.trim() || saving}
                          className="px-4 py-2.5 rounded-xl bg-primary text-white text-sm font-semibold disabled:opacity-40 hover:bg-primary/90 transition-colors"
                        >
                          Share
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}