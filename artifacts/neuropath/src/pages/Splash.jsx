import { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, LockKeyhole, ShieldCheck, TimerReset, UserRoundCheck } from "lucide-react";
import { base44 } from '@/api/entities';
import BrandMark from "@/components/brand/BrandMark";
import { getPostLoginPath } from "@/lib/workspaceRouting";
import { Badge } from "@workspace/neuropathways-foundations/components/ui/badge";
import { Button } from "@workspace/neuropathways-foundations/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/neuropathways-foundations/components/ui/card";
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

const PREVIEW_STATUS = [
  ["Meltdowns", "Active"],
  ["Task Refusal", "Active"],
  ["Aggression", "Available to Add"],
];

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
      const destination = getPostLoginPath(user);
      if (destination) navigate(destination, { replace: true });
    }).catch(() => {});
  }, [navigate]);

  return (
    <div className="np-foundations np-previous-landing" data-testid="public-landing">
      <header className="np-nav-wrap">
        <nav aria-label="Primary navigation" className="np-nav">
          <Link
            to="/"
            aria-label="NeuroPathways home"
            className="np-brand"
            data-testid="link-home-brand"
          >
            <span className="np-mark"><BrandMark size={34} /></span>
            <span>NeuroPathways</span>
          </Link>
          <div className="np-navr">
            <a href="#access" className="np-textbtn" data-testid="link-nav-clinicians">Choose your workspace</a>
            <Button asChild size="sm">
              <Link to="/ParentLogin" data-testid="link-parent-login">Caregiver sign in</Link>
            </Button>
          </div>
        </nav>
      </header>

      <main>
        <section className="np-top" aria-labelledby="landing-title">
          <Badge variant="secondary" className="np-pill" data-testid="label-audience">
            <span className="np-pill-dot" aria-hidden="true" />
            Behavior support for parents
          </Badge>
          <h1 id="landing-title" className="np-hero-title">
            What to do in the moment, based on your child’s support needs.
          </h1>
          <p className="np-lead">
            NeuroPathways helps parents access simple behavior support steps, add goals, and upload plans when they are ready.
          </p>

          <section className="np-security" aria-labelledby="np-security-title" data-testid="section-security-at-a-glance">
            <h2 id="np-security-title">How we protect account and care information</h2>
            <div className="np-security-list">
              <Card className="np-security-item">
                <CardContent className="np-security-item-content">
                  <LockKeyhole size={18} aria-hidden="true" />
                  <span>Stored passwords are one-way hashed, not kept as readable text.</span>
                </CardContent>
              </Card>
              <Card className="np-security-item">
                <CardContent className="np-security-item-content">
                  <TimerReset size={18} aria-hidden="true" />
                  <span>Sign-in attempts are rate-limited.</span>
                </CardContent>
              </Card>
              <Card className="np-security-item">
                <CardContent className="np-security-item-content">
                  <UserRoundCheck size={18} aria-hidden="true" />
                  <span>Private records require an authenticated, role-checked account.</span>
                </CardContent>
              </Card>
            </div>
            <Link to="/privacy" className="np-security-link" data-testid="link-privacy-notice">Read our privacy notice</Link>
          </section>

          <div className="np-cta">
            <Button asChild>
              <Link to="/ParentSignup" data-testid="link-start-parent">Start Parent Account</Link>
            </Button>
            <Button asChild variant="outline">
              <a href="#explore" data-testid="link-explore">Explore Behavior Support</a>
            </Button>
            <Button asChild variant="ghost">
              <Link to="/ParentLogin" data-testid="link-top-login">Caregiver sign in</Link>
            </Button>
          </div>

          <section
            className="np-entry-grid"
            id="access"
            aria-label="Choose your NeuroPathways workspace"
            data-testid="section-workspace-entry"
          >
            <Card className="np-entry-card" data-testid="card-caregiver-entry">
              <CardHeader>
                <CardDescription className="np-entry-label">Family workspace</CardDescription>
                <CardTitle className="np-card-title">Caregivers and parents</CardTitle>
                <CardDescription>
                  Get to your child’s home, support, goals, practice, documents, and family tools.
                </CardDescription>
              </CardHeader>
              <CardContent className="np-entry-content">
                <div className="np-entry-actions">
                  <Button asChild>
                    <Link to="/ParentLogin" data-testid="link-caregiver-sign-in">Caregiver sign in</Link>
                  </Button>
                  <Button asChild variant="outline">
                    <Link to="/ParentSignup" data-testid="link-caregiver-create">Create a caregiver account</Link>
                  </Button>
                </div>
                <Link to="/UsernameLogin" className="np-entry-secondary" data-testid="link-family-access-code">
                  Use family username and access code
                </Link>
              </CardContent>
            </Card>

            <Card className="np-entry-card" data-testid="card-clinician-entry">
              <CardHeader>
                <CardDescription className="np-entry-label">Clinical workspace</CardDescription>
                <CardTitle className="np-card-title">Treating clinicians</CardTitle>
                <CardDescription>
                  Use clinical tools for clients you are explicitly assigned to support.
                </CardDescription>
              </CardHeader>
              <CardContent className="np-entry-content">
                <div className="np-entry-actions">
                  <Button asChild variant="outline">
                    <Link to="/ClinicianLogin?workspace=clinician" data-testid="link-clinician-entry">
                      Clinician sign in
                    </Link>
                  </Button>
                </div>
                <p className="np-entry-note">New clinician access remains locked until an authorized clinic approves it.</p>
              </CardContent>
            </Card>

            <Card className="np-entry-card" data-testid="card-clinic-admin-entry">
              <CardHeader>
                <CardDescription className="np-entry-label">Clinic workspace</CardDescription>
                <CardTitle className="np-card-title">Clinic administrators</CardTitle>
                <CardDescription>
                  Manage your clinic’s staff, invitations, and client assignments. Administration alone does not grant access to clinical records.
                </CardDescription>
              </CardHeader>
              <CardContent className="np-entry-content">
                <div className="np-entry-actions">
                  <Button asChild variant="outline">
                    <Link to="/ClinicianLogin?workspace=clinic-admin" data-testid="link-clinic-admin-entry">
                      Clinic administrator sign in
                    </Link>
                  </Button>
                </div>
                <p className="np-entry-note">Administrator access is issued through an authorized clinic invitation.</p>
              </CardContent>
            </Card>

            <Card className="np-entry-card" data-testid="card-clinic-request-entry">
              <CardHeader>
                <CardDescription className="np-entry-label">Clinic onboarding</CardDescription>
                <CardTitle className="np-card-title">Register your clinic</CardTitle>
                <CardDescription>
                  Request platform review and clinic setup. A request does not create a clinic, administrator account, or access to client records.
                </CardDescription>
              </CardHeader>
              <CardContent className="np-entry-content">
                <div className="np-entry-actions">
                  <Button asChild variant="outline">
                    <Link to="/ClinicRequest" data-testid="link-register-clinic">Request clinic setup</Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
            <p className="np-entry-note np-entry-permissions">
              These links open existing sign-in pages; access still follows each account’s approved permissions.
            </p>
          </section>

          <Card className="np-preview" aria-hidden="true" data-testid="preview-dashboard">
            <div className="np-pbar">
              <span className="np-pbar-dots"><i /><i /><i /></span>
              <span>Today’s Support</span>
            </div>
            <div className="np-pbody">
              <aside className="np-pside">
                <b>Today’s Support</b>
                <span>Support Steps</span>
                <span>Log What Happened</span>
                <span>Upload Plan</span>
                <span>Ask</span>
              </aside>
              <div className="np-pmain">
                <div className="np-pgrid">
                  <Card className="np-pcard warm">
                    <CardContent>
                      <small>Need help right now?</small>
                      <div className="np-pbtn">I Need Help Now</div>
                    </CardContent>
                  </Card>
                  <Card className="np-pcard blue">
                    <CardContent>
                      <small>Current Focus</small>
                      <strong>Meltdowns</strong>
                      <span>Goal: Use a calm-down break</span>
                    </CardContent>
                  </Card>
                </div>
                <div className="np-plib">
                  {PREVIEW_STATUS.map(([name, status]) => (
                    <Card className="np-pcard" key={name}>
                      <CardContent>
                        <strong>{name}</strong>
                        <Badge variant={status === "Active" ? "secondary" : "outline"}>{status}</Badge>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            </div>
          </Card>
        </section>

        <div className="np-wrap">
          <section className="np-sec" id="how">
            <h2 className="np-section-title">How it works</h2>
            <div className="np-grid three">
              {STEPS.map(([title, description], index) => (
                <Card key={title} data-testid={`card-step-${index + 1}`}>
                  <CardHeader>
                    <Badge variant="secondary" className="np-step-number">{index + 1}</Badge>
                    <CardTitle className="np-card-title">{title}</CardTitle>
                  </CardHeader>
                  <CardContent><p>{description}</p></CardContent>
                </Card>
              ))}
            </div>
          </section>

          <section className="np-sec" id="explore">
            <h2 className="np-section-title">The Behavior Support Library</h2>
            <p className="np-sub">
              Start with one behavior, or add several now or later. Short steps here, full support after you sign up.
            </p>
            <div className="np-grid six">
              {BEHAVIORS.map(([title, description], index) => (
                <Card key={title} data-testid={`card-behavior-${index}`}>
                  <CardHeader>
                    <CardTitle className="np-card-title">{title}</CardTitle>
                    <CardDescription>{description}</CardDescription>
                  </CardHeader>
                </Card>
              ))}
            </div>
          </section>

          <section className="np-sec">
            <div className="np-split">
              <Card>
                <CardHeader>
                  <CardDescription className="np-eyebrow">I Need Help Now</CardDescription>
                  <CardTitle className="np-card-title">One tap, then clear steps.</CardTitle>
                </CardHeader>
                <CardContent>
                  <p>With one active behavior, steps open right away. With several, you choose what you need help with first. No guessing for you.</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardDescription className="np-eyebrow">Parent dashboard</CardDescription>
                  <CardTitle className="np-card-title">Everything in one place.</CardTitle>
                </CardHeader>
                <CardContent>
                  <p>Progress and goals, your library, and quick actions to log what happened, upload a plan, add a behavior, add a goal, or edit your child’s profile.</p>
                </CardContent>
              </Card>
            </div>
          </section>

          <section className="np-sec">
            <Card className="np-panel blue" data-testid="section-upload-later">
              <CardHeader>
                <CardTitle className="np-section-title">Have a plan? Upload it later.</CardTitle>
                <CardDescription>
                  Start with starter support now. When you’re ready, upload a behavior plan, treatment plan, BIP, FBA, school support plan, or safety plan. Support based on your upload is labeled as such and is not clinician-reviewed unless a clinician reviews it.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button asChild>
                  <Link to="/ParentSignup" data-testid="link-upload-later">
                    Start Parent Account <ArrowRight aria-hidden="true" />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          </section>

          <section className="np-sec" id="clinicians">
            <Card className="np-clin" data-testid="section-clinicians">
              <div className="np-clin-copy">
                <CardTitle className="np-section-title">For clinics and clinicians</CardTitle>
                <CardDescription>
                  Clinical access is based on active clinic membership and explicit client assignments. Clinic administration and clinical care remain separate workspace permissions.
                </CardDescription>
              </div>
              <Button asChild variant="outline" className="np-clin-action">
                <Link to="/ClinicRequest" data-testid="link-clinic-request-lower">
                  Request clinic setup
                </Link>
              </Button>
            </Card>
          </section>

          <section className="np-sec np-privacy-section">
            <Card className="np-panel green" data-testid="section-privacy">
              <CardContent className="np-privacy-content">
                <ShieldCheck size={28} aria-hidden="true" />
                <p>Your notes are accessed through your account and authorized sharing. AI features may process information using service providers. Starter support is general guidance, not a clinician-approved treatment plan.</p>
              </CardContent>
            </Card>
          </section>

          <section className="np-final">
            <h2>Know what to do in the moment. Add plans, goals, and clinician support over time.</h2>
            <Button asChild>
              <Link to="/ParentSignup" data-testid="link-final-start">Start Parent Account</Link>
            </Button>
          </section>

          <footer className="np-foot">
            <span>NeuroPathways</span>
            <nav aria-label="Footer links">
              <Link to="/ClinicianLogin?workspace=clinician" className="np-link">Clinician login</Link>
              <Link to="/ClinicianLogin?workspace=clinic-admin" className="np-link">Clinic administrator login</Link>
              <Link to="/OperatorLogin" className="np-link" data-testid="link-operator-sign-in">NeuroPathways operator sign in</Link>
              <Link to="/ClinicRequest" className="np-link">Register your clinic</Link>
              <Link to="/UsernameLogin" className="np-link" data-testid="link-username-login">Username login</Link>
              <Link to="/privacy" className="np-link" data-testid="link-privacy">Privacy policy</Link>
              <Link to="/terms" className="np-link">Terms of use</Link>
              <Link to="/contact" className="np-link">Contact</Link>
              <Link to="/copyright" className="np-link">Copyright</Link>
              <Link to="/data-requests" className="np-link">Data requests</Link>
            </nav>
          </footer>
        </div>
      </main>
    </div>
  );
}
