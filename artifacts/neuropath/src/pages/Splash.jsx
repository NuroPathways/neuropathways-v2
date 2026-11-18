import { Fragment, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, Check, ChevronDown, LockKeyhole, ShieldCheck, TimerReset, UserRoundCheck } from "lucide-react";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@workspace/neuropathways-foundations/components/ui/dropdown-menu";

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

const SIGN_IN_CHOICES = [
  {
    to: "/ParentLogin",
    label: "Caregiver workspace",
    description: "Parents and family caregivers",
    testId: "link-sign-in-caregiver",
  },
  {
    to: "/UsernameLogin",
    label: "Family username and access code",
    description: "For families using a shared access code",
    testId: "link-sign-in-family-code",
  },
  {
    to: "/ClinicianLogin?workspace=clinician",
    label: "Clinician workspace",
    description: "For clinicians activated through a clinic invitation",
    testId: "link-sign-in-clinician",
  },
  {
    to: "/ClinicianLogin?workspace=clinic-admin",
    label: "Clinic administrator workspace",
    description: "For authorized clinic administrators",
    testId: "link-sign-in-clinic-admin",
  },
];

function SignInMenu() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" className="shrink-0" data-testid="button-sign-in">
          Sign in
          <ChevronDown aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8} className="w-[min(22rem,calc(100vw-2rem))]">
        <DropdownMenuLabel>Choose a sign-in option</DropdownMenuLabel>
        {SIGN_IN_CHOICES.map((choice, index) => (
          <Fragment key={choice.testId}>
            {index === 2 && <DropdownMenuSeparator />}
            <DropdownMenuItem asChild className="min-h-control py-2.5">
              <Link
                to={choice.to}
                data-testid={choice.testId}
                className="flex min-h-control flex-col items-start gap-1 whitespace-normal"
              >
                <span className="font-semibold">{choice.label}</span>
                <span className="text-support-sm text-muted-foreground">{choice.description}</span>
              </Link>
            </DropdownMenuItem>
          </Fragment>
        ))}
        <DropdownMenuSeparator />
        <p className="px-2 py-1.5 text-support-sm leading-relaxed text-muted-foreground">
          Choosing an option opens its existing sign-in page. It does not assign a role or grant access.
        </p>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

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
    <div className="np-foundations np-public-landing min-h-screen bg-background text-foreground" data-testid="public-landing">
      <header className="border-b border-border bg-background">
        <nav
          aria-label="Primary navigation"
          className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6"
        >
          <Link
            to="/"
            aria-label="NeuroPathways home"
            className="flex min-w-0 items-center gap-3 rounded-md text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            data-testid="link-home-brand"
          >
            <BrandMark size={40} />
            <span className="font-semibold tracking-tight">NeuroPathways</span>
          </Link>
          <SignInMenu />
        </nav>
      </header>

      <main>
        <section className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-12 sm:px-6 sm:py-16 lg:grid-cols-[minmax(0,1.2fr)_minmax(18rem,0.8fr)] lg:items-center lg:gap-12 lg:py-20">
          <div className="min-w-0 space-y-6">
            <Badge variant="secondary" className="w-fit" data-testid="label-audience">
              Behavior support for parents
            </Badge>
            <div className="space-y-4">
              <h1 className="max-w-3xl text-4xl font-semibold leading-tight tracking-tight text-foreground sm:text-5xl">
                What to do in the moment, based on your child’s support needs.
              </h1>
              <p className="max-w-2xl text-body text-muted-foreground">
                NeuroPathways helps caregivers find practical support, set goals, and build on their family’s plan over time.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button asChild size="lg">
                <Link to="/ParentSignup" data-testid="link-create-caregiver">
                  Create a caregiver account
                  <ArrowRight aria-hidden="true" />
                </Link>
              </Button>
              <p className="text-support text-muted-foreground">
                Already have an account? Use <span className="font-semibold text-foreground">Sign in</span> above.
              </p>
            </div>
          </div>

          <Card className="min-w-0" data-testid="card-family-intro">
            <CardHeader>
              <CardDescription>For families</CardDescription>
              <CardTitle className="text-section-title">A steady place to start</CardTitle>
              <p className="text-body-sm text-muted-foreground">
                Practical guidance for everyday moments, with room to build on your family’s plan over time.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-start gap-3">
                <Check aria-hidden="true" className="mt-1 size-4 shrink-0 text-primary" />
                <p className="text-body-sm text-muted-foreground">Choose one behavior or add several, each with its own goal.</p>
              </div>
              <div className="flex items-start gap-3">
                <Check aria-hidden="true" className="mt-1 size-4 shrink-0 text-primary" />
                <p className="text-body-sm text-muted-foreground">Find what to do now, what to avoid, and what to notice.</p>
              </div>
              <div className="flex items-start gap-3">
                <Check aria-hidden="true" className="mt-1 size-4 shrink-0 text-primary" />
                <p className="text-body-sm text-muted-foreground">Add a care plan or other documents when you are ready.</p>
              </div>
            </CardContent>
          </Card>
        </section>

        <section
          aria-labelledby="security-title"
          className="border-y border-border bg-muted/50"
          data-testid="section-security"
        >
          <div className="mx-auto w-full max-w-6xl space-y-5 px-4 py-8 sm:px-6">
            <div className="flex items-start gap-3">
              <ShieldCheck aria-hidden="true" className="mt-1 size-5 shrink-0 text-primary" />
              <div className="min-w-0">
                <h2 id="security-title" className="text-card-title font-semibold">
                  How we protect account and care information
                </h2>
                <p className="mt-1 text-support text-muted-foreground">
                  Clinical access depends on approved account permissions and explicit client assignments.
                </p>
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <Card>
                <CardContent className="flex items-start gap-3 pt-6">
                  <LockKeyhole aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
                  <p className="text-support text-muted-foreground">Stored passwords are one-way hashed, not kept as readable text.</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="flex items-start gap-3 pt-6">
                  <TimerReset aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
                  <p className="text-support text-muted-foreground">Sign-in attempts are rate-limited.</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="flex items-start gap-3 pt-6">
                  <UserRoundCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
                  <p className="text-support text-muted-foreground">Private records require an authenticated, role-checked account.</p>
                </CardContent>
              </Card>
            </div>
            <Link
              to="/privacy"
              className="inline-flex min-h-9 items-center text-support font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              data-testid="link-privacy-notice"
            >
              Read our privacy notice
            </Link>
          </div>
        </section>

        <section
          aria-labelledby="how-it-works-title"
          className="mx-auto w-full max-w-6xl space-y-6 px-4 py-12 sm:px-6 sm:py-16"
          data-testid="section-how-it-works"
        >
          <div className="max-w-2xl space-y-2">
            <h2 id="how-it-works-title" className="text-section-title font-semibold">How it works</h2>
            <p className="text-body-sm text-muted-foreground">Start with a small, useful step. Add more when it fits your family.</p>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {STEPS.map(([title, description], index) => (
              <Card key={title} data-testid={`card-step-${index + 1}`}>
                <CardHeader>
                  <Badge variant="outline" className="w-fit">{String(index + 1).padStart(2, "0")}</Badge>
                  <CardTitle className="pt-2 text-card-title">{title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-body-sm text-muted-foreground">{description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <section
          aria-labelledby="library-title"
          className="border-y border-border bg-muted/50"
          data-testid="section-behavior-library"
        >
          <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-12 sm:px-6 sm:py-16">
            <div className="max-w-2xl space-y-2">
              <h2 id="library-title" className="text-section-title font-semibold">The Behavior Support Library</h2>
              <p className="text-body-sm text-muted-foreground">
                Explore support topics. Full support is available after you sign in.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {BEHAVIORS.map(([title, description], index) => (
                <Card key={title} data-testid={`card-behavior-${index}`}>
                  <CardHeader>
                    <CardTitle className="text-card-title">{title}</CardTitle>
                    <CardDescription>{description}</CardDescription>
                  </CardHeader>
                </Card>
              ))}
            </div>
            <Card>
              <CardContent className="flex flex-col gap-3 pt-6">
                <h3 className="text-card-title font-semibold">Clear steps for the moment you need them.</h3>
                <p className="max-w-3xl text-body-sm text-muted-foreground">
                  With one active behavior, steps open right away. With several, you choose what you need help with first.
                  Starter support is general guidance, not a clinician-approved treatment plan.
                </p>
              </CardContent>
            </Card>
          </div>
        </section>

        <section
          aria-labelledby="workspaces-title"
          className="mx-auto w-full max-w-6xl space-y-6 px-4 py-12 sm:px-6 sm:py-16"
          data-testid="section-role-workspaces"
        >
          <div className="max-w-2xl space-y-2">
            <h2 id="workspaces-title" className="text-section-title font-semibold">
              Clinical and clinic administration are separate workspaces
            </h2>
            <p className="text-body-sm text-muted-foreground">
              Sign-in choices only open a page. Access follows each account’s approved permissions.
            </p>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardDescription>Clinical workspace</CardDescription>
                <CardTitle className="text-card-title">For treating clinicians</CardTitle>
                <CardDescription>
                  Use clinical tools only for clients you are explicitly assigned to support. New clinician access is activated through a clinic invitation.
                </CardDescription>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader>
                <CardDescription>Clinic workspace</CardDescription>
                <CardTitle className="text-card-title">For clinic administrators</CardTitle>
                <CardDescription>
                  Manage staff, invitations, and assignments for your clinic. Administration alone does not grant access to clinical records.
                </CardDescription>
              </CardHeader>
            </Card>
          </div>
        </section>

        <section
          aria-labelledby="clinic-request-title"
          className="border-y border-border bg-muted/50"
          data-testid="section-clinic-request"
        >
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-8 sm:px-6 md:flex-row md:items-center md:justify-between">
            <div className="min-w-0 space-y-1">
              <h2 id="clinic-request-title" className="text-card-title font-semibold">Register your clinic</h2>
              <p className="max-w-2xl text-support text-muted-foreground">
                Request platform review and clinic setup. A request does not create a clinic, administrator account, or access to client records.
              </p>
            </div>
            <Button asChild variant="outline" className="shrink-0">
              <Link to="/ClinicRequest" data-testid="link-register-clinic">
                Submit a clinic request <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
          </div>
        </section>
      </main>

      <footer className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-8 text-support text-muted-foreground sm:px-6 md:flex-row md:items-center md:justify-between">
        <span>NeuroPathways</span>
        <nav aria-label="Footer links" className="flex flex-wrap items-center gap-x-5 gap-y-3">
          <Link to="/privacy" className="underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" data-testid="link-footer-privacy">Privacy notice</Link>
          <Link to="/terms" className="underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" data-testid="link-footer-terms">Terms of use</Link>
          <Link to="/contact" className="underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" data-testid="link-footer-contact">Contact</Link>
          <Link to="/copyright" className="underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" data-testid="link-footer-copyright">Copyright</Link>
          <Link to="/data-requests" className="underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" data-testid="link-footer-data-requests">Data requests</Link>
          <Link to="/OperatorLogin" className="underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" data-testid="link-operator-sign-in">
            NeuroPathways operator sign in
          </Link>
        </nav>
      </footer>
    </div>
  );
}
