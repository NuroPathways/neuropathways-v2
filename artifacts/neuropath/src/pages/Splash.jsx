import { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { base44 } from '@/api/entities';
import "./splash-landing.css";

const STEPS = [
  ["Add your child", "Create a quick profile with just a name or nickname."],
  ["Choose one behavior", "Start with a common challenge like elopement, meltdowns, aggression, task refusal, or transition difficulty."],
  ["Get support steps", "See what to do right now, what to avoid, and what to track."],
];

const BEHAVIORS = [
  ["Elopement / Running Away", "Leaving the area, bolting, or moving toward unsafe places."],
  ["Self-Injury", "Head hitting, biting, scratching, or other unsafe self-directed behavior."],
  ["Aggression", "Hitting, kicking, biting, throwing, or unsafe physical behavior."],
  ["Meltdowns", "Crying, screaming, shutting down, or becoming overwhelmed."],
  ["Task Refusal", "Refusing homework, chores, hygiene, or other non-preferred tasks."],
  ["Transition Difficulty", "Struggling to stop one activity and move to the next."],
];

export default function Splash() {
  const navigate = useNavigate();

  useEffect(() => {
    document.title = "NeuroPathways | What to do in the moment, for parents";
    let meta = document.querySelector('meta[name="description"]');
    if (!meta) { meta = document.createElement("meta"); meta.name = "description"; document.head.appendChild(meta); }
    meta.content = "Start with one behavior and get simple support steps for stressful moments. Upload your child's plan later when you're ready.";
  }, []);

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
    <div className="np">
      <div className="np-wrap">
        <header className="np-head">
          <span className="np-logo">Neuro<span>Pathways</span></span>
          <Link to="/ParentLogin" className="np-btn small" data-testid="link-parent-login">I Already Have an Account</Link>
        </header>

        <section className="np-hero">
          <h1 className="np-rise">What to do in the moment, based on your child’s plan.</h1>
          <p className="np-rise" style={{ animationDelay: ".1s" }}>Start with one behavior, get simple support steps, and upload your child’s plan later when you’re ready.</p>
          <div className="np-cta np-rise" style={{ animationDelay: ".2s" }}>
            <Link to="/ParentSignup" className="np-btn primary" data-testid="link-start-behavior">Start With One Behavior</Link>
            <Link to="/ParentLogin" className="np-btn" data-testid="link-hero-login">I Already Have an Account</Link>
          </div>
        </section>

        <section className="np-sec">
          <h2>How it works</h2>
          <div className="np-grid three">
            {STEPS.map(([t, d], i) => (
              <div key={t} className="np-card" data-testid={`card-step-${i + 1}`}>
                <div className="np-num">{i + 1}</div>
                <h3>{t}</h3>
                <p>{d}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="np-sec">
          <h2>Start with one common behavior</h2>
          <div className="np-grid six">
            {BEHAVIORS.map(([t, d], i) => (
              <div key={t} className="np-card" data-testid={`card-behavior-${i}`}>
                <h3>{t}</h3>
                <p>{d}</p>
              </div>
            ))}
          </div>
          <div className="np-center">
            <Link to="/ParentSignup" className="np-btn primary" data-testid="link-start-behavior-2">Start With One Behavior</Link>
          </div>
        </section>

        <section className="np-sec">
          <div className="np-panel blue">
            <h2 style={{ marginBottom: 0 }}>Have a plan? Upload it later.</h2>
            <p>You can start with starter support now. When you’re ready, upload a behavior plan, treatment plan, school support plan, BIP, FBA, or safety plan so NeuroPathways can make the steps more personalized.</p>
            <Link to="/ParentSignup" className="np-btn" data-testid="link-upload-later">Upload a Plan Later</Link>
          </div>
        </section>

        <section className="np-sec" style={{ paddingTop: 0 }}>
          <div className="np-panel green" data-testid="section-privacy">
            <p>Your notes stay inside your private account. Starter support is general guidance until you upload a plan or connect with a clinician.</p>
          </div>
        </section>

        <footer className="np-foot">
          <span>NeuroPathways</span>
          <div>
            <Link to="/ClinicianLogin" className="np-link" data-testid="link-clinician-login">Clinician login</Link>
            <Link to="/UsernameLogin" className="np-link" data-testid="link-username-login">Username login</Link>
            <Link to="/privacy" className="np-link" data-testid="link-privacy">Privacy policy</Link>
          </div>
        </footer>
      </div>
    </div>
  );
}
