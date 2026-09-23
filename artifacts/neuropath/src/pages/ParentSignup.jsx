import { useState } from "react";
import { Brain, ArrowLeft, Loader2, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { motion } from "framer-motion";
import { saveClientSession } from "@/lib/clientSession";

export default function ParentSignup() {
  const [form, setForm] = useState({ parent_name: "", child_name: "", child_age: "", diagnosis: "", username: "", access_code: "" });
  const [showCode, setShowCode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const set = (field) => (e) => setForm(f => ({ ...f, [field]: e.target.value }));

  const valid = form.parent_name.trim() && form.child_name.trim() && form.username.trim().length >= 3 && form.access_code.trim().length >= 4;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!valid) return;
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/parent-signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Something went wrong.");
        setLoading(false);
        return;
      }

      saveClientSession(data);
      window.location.href = "/ParentDashboard";
    } catch {
      setError("Could not connect. Please try again.");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4 font-inter">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
            <Brain className="w-5 h-5 text-primary-foreground" />
          </div>
          <span className="font-semibold text-foreground">NeuroPathways</span>
        </div>

        <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
          <h1 className="text-xl font-semibold text-foreground mb-1">Create Your Account</h1>
          <p className="text-sm text-muted-foreground mb-6">
            Get started with NeuroPathways to track your child's behavioral goals, upload documents, and access personalized guidance.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">
                Your Name
              </label>
              <Input value={form.parent_name} onChange={set("parent_name")} placeholder="e.g. Maria Rivera" className="rounded-xl min-h-[44px]" />
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">
                Child's Name
              </label>
              <Input value={form.child_name} onChange={set("child_name")} placeholder="e.g. Sofia Rivera" className="rounded-xl min-h-[44px]" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">
                  Child's Age
                </label>
                <Input type="number" min="1" max="25" value={form.child_age} onChange={set("child_age")} placeholder="e.g. 7" className="rounded-xl min-h-[44px]" />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">
                  Diagnosis (optional)
                </label>
                <Input value={form.diagnosis} onChange={set("diagnosis")} placeholder="e.g. ADHD" className="rounded-xl min-h-[44px]" />
              </div>
            </div>

            <hr className="border-border" />

            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">
                Choose a Username
              </label>
              <Input value={form.username} onChange={set("username")} placeholder="e.g. maria.rivera" autoCapitalize="none" autoCorrect="off" spellCheck={false} className="rounded-xl min-h-[44px]" />
              <p className="text-xs text-muted-foreground mt-1">At least 3 characters. You'll use this to sign in.</p>
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">
                Create an Access Code
              </label>
              <div className="relative">
                <input
                  type={showCode ? "text" : "password"}
                  value={form.access_code}
                  onChange={set("access_code")}
                  placeholder="e.g. MyCode123"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  className="w-full min-h-[44px] border border-border rounded-xl px-4 py-2.5 pr-12 text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 font-mono tracking-widest"
                />
                <button type="button" onClick={() => setShowCode(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1">
                  {showCode ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-xs text-muted-foreground mt-1">At least 4 characters. This is your password.</p>
            </div>

            {error && (
              <div className="bg-destructive/10 text-destructive text-sm rounded-xl px-4 py-3">
                {error}
              </div>
            )}

            <Button type="submit" className="w-full min-h-[44px] rounded-xl" disabled={loading || !valid}>
              {loading ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Creating account...
                </span>
              ) : "Create Account"}
            </Button>
          </form>
        </div>

        <div className="mt-6 text-center space-y-3">
          <p className="text-xs text-muted-foreground">
            Already have an account?{" "}
            <a href="/UsernameLogin" className="text-primary hover:underline font-medium">Sign in</a>
          </p>
          <button onClick={() => window.history.back()} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mx-auto">
            <ArrowLeft className="w-3.5 h-3.5" /> Back
          </button>
        </div>
      </motion.div>
    </div>
  );
}
