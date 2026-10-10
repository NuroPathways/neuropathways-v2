import { useEffect, useState } from "react";
import { ArrowLeft, Loader2, Eye, EyeOff, ShieldCheck, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { motion } from "framer-motion";
import BrandMark from "@/components/brand/BrandMark";
import { saveClientSession } from "@/lib/clientSession";
import SignupAuthorityFields from "@/components/signup/SignupAuthorityFields";

export default function ParentSignupUsername() {
  const [form, setForm] = useState({ parent_name: "", child_name: "", child_age: "", diagnosis: "", username: "", access_code: "" });
  const [showCode, setShowCode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [accountHolderAgeGroup, setAccountHolderAgeGroup] = useState("");
  const [adultOrGuardianConfirmed, setAdultOrGuardianConfirmed] = useState(false);
  const [parentGuardianAuthorityConfirmed, setParentGuardianAuthorityConfirmed] = useState(false);
  const [privacyConfig, setPrivacyConfig] = useState(null);
  const [consent, setConsent] = useState({
    privacy: false,
    security: false,
    authorizedUploader: false,
  });

  useEffect(() => {
    fetch("/api/privacy-config")
      .then(res => {
        if (!res.ok) throw new Error("Could not load privacy information.");
        return res.json();
      })
      .then(setPrivacyConfig)
      .catch(() => setError("Could not load the current privacy information. Please refresh and try again."));
  }, []);

  const set = (field) => (e) => setForm(f => ({ ...f, [field]: e.target.value }));

  const allConsentAccepted = consent.privacy && consent.security && consent.authorizedUploader;
  const allAuthorityAccepted = accountHolderAgeGroup && accountHolderAgeGroup !== "under_13" && adultOrGuardianConfirmed && parentGuardianAuthorityConfirmed;
  const valid = form.parent_name.trim() && form.child_name.trim() && form.username.trim().length >= 3 && form.access_code.trim().length >= 4 && privacyConfig && allConsentAccepted && allAuthorityAccepted;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!valid) return;
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/parent-signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          accountHolderType: "parent_guardian",
          accountHolderAgeGroup,
          adultOrGuardianConfirmed,
          parentGuardianAuthorityConfirmed,
          consent: {
            privacy_policy_accepted: consent.privacy,
            privacy_policy_version: privacyConfig.privacy_policy_version,
            health_information_accepted: consent.security,
            health_consent_version: privacyConfig.health_consent_version,
            authorized_uploader_accepted: consent.authorizedUploader,
            authorized_uploader_attestation_version: privacyConfig.authorized_uploader_attestation_version,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Something went wrong.");
        setLoading(false);
        return;
      }

      saveClientSession(data);
      window.location.href = "/ClientHome";
    } catch {
      setError("Could not connect. Please try again.");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4 font-inter">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md">
        <div className="flex items-center gap-3 mb-8">
          <BrandMark size={40} />
          <span className="font-semibold text-foreground">NeuroPathways</span>
        </div>

        <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
          <h1 className="text-xl font-semibold text-foreground mb-1">Create Your Account</h1>
          <p className="text-sm text-muted-foreground mb-6">
            Get started with NeuroPathways to track your child's behavioral goals, upload documents, and access personalized guidance.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <SignupAuthorityFields
              role="parent_guardian"
              ageGroup={accountHolderAgeGroup}
              setAgeGroup={setAccountHolderAgeGroup}
              adultConfirmed={adultOrGuardianConfirmed}
              setAdultConfirmed={setAdultOrGuardianConfirmed}
              parentConfirmed={parentGuardianAuthorityConfirmed}
              setParentConfirmed={setParentGuardianAuthorityConfirmed}
            />
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

            <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 space-y-4">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <ShieldCheck className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h2 className="font-semibold text-foreground">Your Privacy Matters</h2>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                    NeuroPathways may process private and sensitive health information that you choose to provide. Please review how your information will be handled before creating your account.
                  </p>
                  <a
                    href="/privacy"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-primary font-semibold hover:underline mt-2"
                  >
                    Read Privacy Policy <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>

              <ConsentCheckbox
                checked={consent.privacy}
                onChange={checked => setConsent(current => ({ ...current, privacy: checked }))}
                label="I have read and agree to the NeuroPathways Consumer Health Privacy Policy. I understand that I may voluntarily provide private and sensitive health information and authorize NeuroPathways to receive, store, and process it for the services I request."
              />
              <ConsentCheckbox
                checked={consent.security}
                onChange={checked => setConsent(current => ({ ...current, security: checked }))}
                label="I understand that electronic transmission and storage of information involves security risks and that no electronic system can guarantee absolute security."
              />
              <ConsentCheckbox
                checked={consent.authorizedUploader}
                onChange={checked => setConsent(current => ({ ...current, authorizedUploader: checked }))}
                label="I confirm that I am authorized to possess and provide the health information and documents I upload concerning my child or another person."
              />
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

function ConsentCheckbox({ checked, onChange, label }) {
  return (
    <label className="flex items-start gap-3 cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={event => onChange(event.target.checked)}
        className="mt-0.5 w-4 h-4 rounded border-border accent-primary flex-shrink-0"
      />
      <span className="text-xs text-foreground leading-relaxed">{label}</span>
    </label>
  );
}
