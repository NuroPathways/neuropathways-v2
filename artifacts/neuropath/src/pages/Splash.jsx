import { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Brain, ShieldCheck, ArrowRight } from "lucide-react";
import { base44 } from '@/api/entities';
import "./splash-landing.css";

const STEPS = [
  ["Add your child", "Create a quick profile with just a name or nickname."],
  ["Choose behaviors and goals", "Start with one, or add several. Each behavior keeps its own goal."],
  ["Get support steps", "See what to do right now, what to avoid, and what to track."],
];

const BEHAVIORS = [
  ["Elopement / Running Away", "Leaving the area, bolting, or moving toward unsafe places."],
  ["Self-Injury", "Head hitting, biting, scratching, or other unsafe self-directed behavior."],
  ["Aggression", "Hitting, kicking, biting, throwing, or unsafe physical behavior."],
  ["Meltdowns", "Crying, screaming, shutting down, or becoming overwhelmed."],
  ["Task Refusal", "Refusing homework, chores, hygiene, or other non-preferred tasks."],
  ["Transition Difficulty", "Struggling to stop one activity and move to the next."],
  ["Other / Custom Behavior", "Name something specific to your child and set your own goal."],
];

const PREVIEW_STATUS = [["Meltdowns", "Active"], ["Task Refusal", "Active"], ["Aggression", "Available to Add"]];

export default function Splash() {
  const navigate = useNavigate();

  useEffect(() => {
    document.title = "NeuroPathways | What to do in the moment, for parents";
    let meta = document.querySelector('meta[name="description"]');
    if (!meta) { meta = document.createElement("meta"); meta.name = "description"; document.head.appendChild(meta); }
    meta.content = "NeuroPathways helps parents access simple behavior support steps, add goals, and upload plans when they are ready.";
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
      <nav className="np-nav">
        <span className="np-brand"><span className="np-mark"><Brain size={20} color="#fff" /></span>NeuroPathways</span>
        <div className="np-navr">
          <a href="#clinicians" className="np-textbtn" data-testid="link-nav-clinicians">For clinics</a>
          <Link to="/ParentLogin" className="np-btn small primary" data-testid="link-parent-login">I Already Have an Account</Link>
        </div>
      </nav>

      <section className="np-top">
        <div className="np-pill"><i />Behavior support for parents</div>
        <h1 className="np-rise">What to do in the moment, based on your child’s support needs.</h1>
        <p className="np-rise np-lead" style={{ animationDelay: ".1s" }}>NeuroPathways helps parents access simple behavior support steps, add goals, and upload plans when they are ready.</p>
        <div className="np-cta np-rise" style={{ animationDelay: ".2s" }}>
          <Link to="/ParentSignup" className="np-btn primary" data-testid="link-start-parent">Start Parent Account</Link>
          <a href="#explore" className="np-btn" data-testid="link-explore">Explore Behavior Support</a>
          <Link to="/ParentLogin" className="np-btn ghost" data-testid="link-top-login">I Already Have an Account</Link>
        </div>

        <div className="np-preview np-rise" style={{ animationDelay: ".3s" }} aria-hidden="true" data-testid="preview-dashboard">
          <div className="np-pbar"><i /><i /><i /><span>Today’s Support</span></div>
          <div className="np-pbody">
            <div className="np-pside"><b>Today’s Support</b><span>Support Steps</span><span>Log What Happened</span><span>Upload Plan</span><span>Ask</span></div>
            <div className="np-pmain">
              <div className="np-pgrid">
                <div className="np-pcard warm"><small>Need help right now?</small><div className="np-pbtn">I Need Help Now</div></div>
                <div className="np-pcard blue"><small>Current Focus</small><strong>Meltdowns</strong><span>Goal: Use a calm-down break</span></div>
              </div>
              <div className="np-plib">
                {PREVIEW_STATUS.map(([n, s]) => <div key={n} className="np-pcard"><strong>{n}</strong><em className={s === "Active" ? "on" : ""}>{s}</em></div>)}
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="np-wrap">
        <section className="np-sec" id="how">
          <h2>How it works</h2>
          <div className="np-grid three">
            {STEPS.map(([t, d], i) => (
              <div key={t} className="np-card" data-testid={`card-step-${i + 1}`}>
                <div className="np-num">{i + 1}</div>
                <h3>{t}</h3><p>{d}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="np-sec" id="explore">
          <h2>The Behavior Support Library</h2>
          <p className="np-sub">Start with one behavior, or add several now or later. Short steps here, full support after you sign up.</p>
          <div className="np-grid six">
            {BEHAVIORS.map(([t, d], i) => (
              <div key={t} className="np-card" data-testid={`card-behavior-${i}`}><h3>{t}</h3><p>{d}</p></div>
            ))}
          </div>
        </section>

        <section className="np-sec">
          <div className="np-split">
            <div className="np-card"><p className="np-eyebrow">I Need Help Now</p><h3>One tap, then clear steps.</h3>
              <p>With one active behavior, steps open right away. With several, you choose what you need help with first. No guessing for you.</p></div>
            <div className="np-card"><p className="np-eyebrow">Parent dashboard</p><h3>Everything in one place.</h3>
              <p>Progress and goals, your library, and quick actions to log what happened, upload a plan, add a behavior, add a goal, or edit your child’s profile.</p></div>
          </div>
        </section>

        <section className="np-sec">
          <div className="np-panel blue" data-testid="section-upload-later">
            <h2 style={{ marginBottom: 0 }}>Have a plan? Upload it later.</h2>
            <p>Start with starter support now. When you’re ready, upload a behavior plan, treatment plan, BIP, FBA, school support plan, or safety plan. Support based on your upload is labeled as such and is not clinician-reviewed unless a clinician reviews it.</p>
            <Link to="/ParentSignup" className="np-btn primary" data-testid="link-upload-later">Start Parent Account <ArrowRight size={18} style={{ marginLeft: 8 }} /></Link>
          </div>
        </section>

        <section className="np-sec" id="clinicians">
          <div className="np-card np-clin" data-testid="section-clinicians">
            <div><h2 style={{ marginBottom: 8 }}>For clinics and clinicians</h2>
              <p>Clinicians can upload plans, organize client documents, and help families access support steps between sessions.</p></div>
            <Link to="/ClinicianLogin" className="np-btn" data-testid="link-clinician-login">Clinician Login</Link>
          </div>
        </section>

        <section className="np-sec" style={{ paddingTop: 0 }}>
          <div className="np-panel green" data-testid="section-privacy">
            <ShieldCheck size={28} />
            <p>Your notes are accessed through your account and authorized sharing. AI features may process information using service providers. Starter support is general guidance, not a clinician-approved treatment plan.</p>
          </div>
        </section>

        <section className="np-final">
          <h2>Know what to do in the moment. Add plans, goals, and clinician support over time.</h2>
          <Link to="/ParentSignup" className="np-btn primary" data-testid="link-final-start">Start Parent Account</Link>
        </section>

        <footer className="np-foot">
          <span>NeuroPathways</span>
          <div>
            <Link to="/ClinicianLogin" className="np-link">Clinician login</Link>
            <Link to="/UsernameLogin" className="np-link" data-testid="link-username-login">Username login</Link>
            <Link to="/privacy" className="np-link" data-testid="link-privacy">Privacy policy</Link>
            <Link to="/terms" className="np-link">Terms of use</Link>
            <Link to="/contact" className="np-link">Contact</Link>
            <Link to="/copyright" className="np-link">Copyright</Link>
            <Link to="/data-requests" className="np-link">Data requests</Link>
          </div>
        </footer>
      </div>
    </div>
  );
}
