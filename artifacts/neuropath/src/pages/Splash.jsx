import { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { base44 } from '@/api/entities';

const STEPS = [
  ["Add your child", "Create a quick profile with just a name or nickname."],
  ["Choose one behavior", "Start with a common challenge like elopement, self-injury, aggression, meltdowns, task refusal, or transition difficulty."],
  ["Get support steps", "See simple steps for what to do right now, what to avoid, and what to track."],
];

export default function Splash() {
  const navigate = useNavigate();

  useEffect(() => {
    base44.auth.isAuthenticated().then(async (authed) => {
      if (!authed) return;
      const user = await base44.auth.me().catch(() => null);
      if (!user) return;
      if (user.app_role === "clinician") navigate("/ClinicianDashboard");
      else if (user.app_role === "parent") navigate("/ParentDashboard");
    }).catch(() => {});
  }, [navigate]);

  return (
    <div className="pf">
      <header className="pf-wrap" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px", flexWrap: "wrap", gap: 10 }}>
        <span className="pf-serif" style={{ fontWeight: 700, fontSize: "1.25rem" }}>Neuro<span style={{ color: "var(--pf-accent)" }}>Pathways</span></span>
        <Link to="/ParentLogin" className="pf-btn small" data-testid="link-parent-login">I Already Have an Account</Link>
      </header>

      <section className="pf-wrap" style={{ padding: "48px 20px 72px", display: "grid", gap: 28 }}>
        <h1 className="pf-rise" style={{ maxWidth: 860 }}>What to do in the moment, based on your child's plan.</h1>
        <p className="pf-rise" style={{ fontSize: "1.2rem", maxWidth: 600, color: "var(--pf-ink-soft)", animationDelay: ".1s" }}>
          NeuroPathways helps parents turn behavior goals and support plans into simple steps they can use during stressful moments.
        </p>
        <div className="pf-rise" style={{ display: "flex", gap: 12, flexWrap: "wrap", animationDelay: ".2s" }}>
          <Link to="/ParentSignup" className="pf-btn primary" data-testid="link-start-behavior">Start With One Behavior</Link>
          <Link to="/ParentSignup" className="pf-btn" data-testid="link-upload-later">Upload a Plan Later</Link>
          <Link to="/ParentLogin" className="pf-btn ghost" data-testid="link-hero-login">I Already Have an Account</Link>
        </div>
      </section>

      <section style={{ background: "var(--pf-ink)", color: "var(--pf-bg)", padding: "72px 0" }}>
        <div className="pf-wrap">
          <h2>How It Works</h2>
          <div style={{ marginTop: 20 }}>
            {STEPS.map(([t, d], i) => (
              <div key={t} style={{ display: "grid", gridTemplateColumns: "56px 1fr", gap: 16, padding: "24px 0", borderTop: "1px solid rgba(246,239,228,.2)" }}>
                <span className="pf-serif" style={{ fontSize: "2.4rem", color: "var(--pf-sun)", lineHeight: 1 }}>{i + 1}</span>
                <div>
                  <h3 style={{ marginBottom: 6, fontSize: "1.4rem" }}>{t}</h3>
                  <p style={{ maxWidth: 560, opacity: .85 }}>{d}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="pf-wrap" style={{ padding: "72px 20px 24px" }}>
        <div className="pf-card sun" style={{ display: "grid", gap: 12 }}>
          <h2>Have a treatment plan, behavior plan, or school support plan? Upload it later.</h2>
          <p style={{ maxWidth: 620 }}>You can start with starter support now. When you are ready, upload a plan so NeuroPathways can make the steps more personalized.</p>
        </div>
      </section>

      <section className="pf-wrap" style={{ padding: "24px 20px 72px" }}>
        <div className="pf-card sage" style={{ display: "grid", gap: 12 }}>
          <h2>Simple, private, and built for stressful moments.</h2>
          <p style={{ maxWidth: 620 }}>Your notes stay inside your private account. Starter support is general guidance until you upload a plan or connect with a clinician.</p>
        </div>
      </section>

      <footer className="pf-wrap" style={{ padding: "24px 20px 48px", display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 10, fontSize: ".85rem", color: "var(--pf-ink-soft)" }}>
        <span>NeuroPathways</span>
        <span style={{ display: "flex", gap: 16 }}>
          <Link to="/ClinicianLogin" className="pf-link" data-testid="link-clinician-login">Clinician login</Link>
          <Link to="/UsernameLogin" className="pf-link" data-testid="link-username-login">Username login</Link>
          <Link to="/privacy" className="pf-link" data-testid="link-privacy">Privacy policy</Link>
        </span>
      </footer>
    </div>
  );
}
