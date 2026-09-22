import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { base44 } from "@/api/entities";
import { Brain, CheckCircle2, Loader2, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";

export default function ResetAccessCode() {
  const navigate = useNavigate();
  const token = new URLSearchParams(window.location.search).get("token") || "";
  const [newCode, setNewCode] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(null);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    if (!token) return setError("This reset link is missing its token.");
    if (newCode.length < 6 || newCode.length > 64) return setError("Your new access code must be 6–64 characters.");
    if (newCode !== confirmation) return setError("The access codes do not match.");
    setLoading(true);
    try {
      const res = await base44.functions.invoke("completeClientAccessCodeReset", { token, new_access_code: newCode });
      if (!res?.data?.ok) throw new Error("This reset link is invalid or has expired.");
      setSuccess(res.data.username);
      setNewCode("");
      setConfirmation("");
    } catch (err) {
      setError(err?.message || "Could not reset the access code. Please request a new link.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4 font-inter">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center"><Brain className="w-5 h-5 text-primary-foreground" /></div>
          <span className="font-semibold text-foreground">NeuroPathways</span>
        </div>
        <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
          {success ? (
            <div className="text-center space-y-4" role="status">
              <CheckCircle2 className="w-12 h-12 text-primary mx-auto" />
              <div><h1 className="text-xl font-semibold text-foreground">Access code updated</h1><p className="text-sm text-muted-foreground mt-2">Your new access code is ready. Sign in with username <strong>{success}</strong>.</p></div>
              <Button data-testid="button-go-to-client-sign-in" type="button" className="w-full rounded-xl" onClick={() => navigate("/UsernameLogin")}>Go to client sign in</Button>
            </div>
          ) : (
            <>
              <h1 className="text-xl font-semibold text-foreground mb-1">Create a new access code</h1>
              <p className="text-sm text-muted-foreground mb-6">Choose a secure code between 6 and 64 characters for your client sign in.</p>
              <form onSubmit={handleSubmit} className="space-y-4">
                <input type="text" name="username" autoComplete="username" className="sr-only" tabIndex={-1} aria-hidden="true" readOnly value="" />
                <div><label htmlFor="new-access-code" className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">New access code</label><input data-testid="input-new-access-code" id="new-access-code" type="password" value={newCode} onChange={e => setNewCode(e.target.value)} minLength={6} maxLength={64} autoComplete="new-password" className="w-full min-h-[44px] border border-border rounded-xl px-4 py-2.5 text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40" /></div>
                <div><label htmlFor="confirm-access-code" className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">Confirm access code</label><input data-testid="input-confirm-access-code" id="confirm-access-code" type="password" value={confirmation} onChange={e => setConfirmation(e.target.value)} minLength={6} maxLength={64} autoComplete="new-password" className="w-full min-h-[44px] border border-border rounded-xl px-4 py-2.5 text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40" /></div>
                {error && <p role="alert" className="bg-destructive/10 text-destructive text-sm rounded-xl px-4 py-3">{error}</p>}
                <Button data-testid="button-update-access-code" type="submit" className="w-full min-h-[44px] rounded-xl" disabled={loading}>{loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Updating...</> : "Update access code"}</Button>
              </form>
            </>
          )}
        </div>
        <Link to="/UsernameLogin" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mx-auto mt-6 w-fit"><ArrowLeft className="w-3.5 h-3.5" /> Back to client sign in</Link>
      </motion.div>
    </div>
  );
}