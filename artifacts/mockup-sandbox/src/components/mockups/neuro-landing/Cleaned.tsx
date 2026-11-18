import "./_group.css";
import "../../../../../neuropathways-foundations/src/index.css";
import { ArrowRight, Check, LockKeyhole, ShieldCheck, TimerReset, UserRoundCheck } from "lucide-react";
import { Badge } from "../../../../../neuropathways-foundations/src/components/ui/badge";
import { Button } from "../../../../../neuropathways-foundations/src/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../../../../neuropathways-foundations/src/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../../../../../neuropathways-foundations/src/components/ui/dropdown-menu";

const behaviors = [
  {
    title: "Elopement / Running Away",
    description: "Leaving the area, bolting, or moving toward unsafe places.",
  },
  {
    title: "Self-Injury",
    description: "Head hitting, biting, scratching, or other unsafe self-directed behavior.",
  },
  {
    title: "Aggression",
    description: "Hitting, kicking, biting, throwing, or unsafe physical behavior.",
  },
  {
    title: "Meltdowns",
    description: "Crying, screaming, shutting down, or becoming overwhelmed.",
  },
  {
    title: "Task Refusal",
    description: "Refusing homework, chores, hygiene, or other non-preferred tasks.",
  },
  {
    title: "Transition Difficulty",
    description: "Struggling to stop one activity and move to the next.",
  },
  {
    title: "Other / Custom Behavior",
    description: "Name something specific to your child and set your own goal.",
  },
];

const steps = [
  {
    number: "01",
    title: "Add your child",
    description: "Create a quick profile with just a name or nickname.",
  },
  {
    number: "02",
    title: "Choose behaviors and goals",
    description: "Start with one, or add several. Each behavior keeps its own goal.",
  },
  {
    number: "03",
    title: "Get support steps",
    description: "See what to do right now, what to avoid, and what to track.",
  },
];

function Brand() {
  return (
    <a
      href="/"
      className="flex min-w-0 items-center gap-3 rounded-md text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      aria-label="NeuroPathways home"
    >
      <img
        src="/__mockup/neuro-pathways-mark.png"
        alt=""
        aria-hidden="true"
        className="size-10 shrink-0"
      />
      <span className="font-semibold tracking-tight">NeuroPathways</span>
    </a>
  );
}

function SignInMenu() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="default" className="shrink-0">
          Sign in
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72 sm:w-80">
        <DropdownMenuLabel>Choose where to sign in</DropdownMenuLabel>
        <DropdownMenuItem asChild>
          <a href="/ParentLogin" className="flex min-h-control flex-col items-start gap-1">
            <span className="font-semibold">Caregiver workspace</span>
            <span className="text-support-sm text-muted-foreground">Parents and family caregivers</span>
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a href="/UsernameLogin" className="flex min-h-control flex-col items-start gap-1">
            <span className="font-semibold">Family username and access code</span>
            <span className="text-support-sm text-muted-foreground">For families using a shared access code</span>
          </a>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <a href="/ClinicianLogin?workspace=clinician" className="flex min-h-control flex-col items-start gap-1">
            <span className="font-semibold">Clinician workspace</span>
            <span className="text-support-sm text-muted-foreground">For invited, clinic-approved clinicians</span>
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a href="/ClinicianLogin?workspace=clinic-admin" className="flex min-h-control flex-col items-start gap-1">
            <span className="font-semibold">Clinic administrator workspace</span>
            <span className="text-support-sm text-muted-foreground">For authorized clinic administrators</span>
          </a>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <p className="px-2 py-1.5 text-support-sm leading-relaxed text-muted-foreground">
          Choosing an option opens that sign-in page. It does not assign a role or grant access.
        </p>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function Cleaned() {
  return (
    <div className="np-foundations min-h-[100dvh] bg-background text-foreground">
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <Brand />
          <SignInMenu />
        </div>
      </header>

      <main>
        <section className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-12 sm:px-6 sm:py-16 lg:grid-cols-[minmax(0,1.2fr)_minmax(18rem,0.8fr)] lg:items-center lg:gap-12 lg:py-20">
          <div className="min-w-0 space-y-6">
            <Badge variant="secondary" className="w-fit">Behavior support for parents</Badge>
            <div className="space-y-4">
              <h1 className="max-w-3xl text-4xl font-semibold leading-tight tracking-tight text-foreground sm:text-5xl">
                What to do in the moment, based on your child’s support needs.
              </h1>
              <p className="max-w-2xl text-body text-muted-foreground">
                NeuroPathways helps parents access simple behavior support steps, add goals, and upload plans when they are ready.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button asChild size="lg">
                <a href="/ParentSignup">
                  Create a caregiver account
                  <ArrowRight aria-hidden="true" />
                </a>
              </Button>
              <p className="text-support text-muted-foreground">
                Already have an account? Use <span className="font-semibold text-foreground">Sign in</span> above.
              </p>
            </div>
          </div>

          <Card className="min-w-0">
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
                <p className="text-body-sm text-muted-foreground">Find what to do right now, what to avoid, and what to track.</p>
              </div>
              <div className="flex items-start gap-3">
                <Check aria-hidden="true" className="mt-1 size-4 shrink-0 text-primary" />
                <p className="text-body-sm text-muted-foreground">Upload a behavior or safety plan whenever you are ready.</p>
              </div>
            </CardContent>
          </Card>
        </section>

        <section aria-labelledby="access-security-title" className="border-y border-border bg-muted/50">
          <div className="mx-auto w-full max-w-6xl space-y-5 px-4 py-8 sm:px-6">
            <div className="flex items-start gap-3">
              <ShieldCheck aria-hidden="true" className="mt-1 size-5 shrink-0 text-primary" />
              <div className="min-w-0">
                <h2 id="access-security-title" className="text-card-title font-semibold">
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
            <a href="/privacy" className="inline-flex min-h-9 items-center text-support font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
              Read our privacy notice
            </a>
          </div>
        </section>

        <section aria-labelledby="how-it-works-title" className="mx-auto w-full max-w-6xl space-y-6 px-4 py-12 sm:px-6 sm:py-16">
          <div className="max-w-2xl space-y-2">
            <h2 id="how-it-works-title" className="text-section-title font-semibold">How it works</h2>
            <p className="text-body-sm text-muted-foreground">Start with a small, useful step. Add more when it fits your family.</p>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {steps.map((step) => (
              <Card key={step.number}>
                <CardHeader>
                  <Badge variant="outline" className="w-fit">{step.number}</Badge>
                  <CardTitle className="pt-2 text-card-title">{step.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-body-sm text-muted-foreground">{step.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <section aria-labelledby="library-title" className="border-y border-border bg-muted/50">
          <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-12 sm:px-6 sm:py-16">
            <div className="max-w-2xl space-y-2">
              <h2 id="library-title" className="text-section-title font-semibold">The Behavior Support Library</h2>
              <p className="text-body-sm text-muted-foreground">
                Start with one behavior, or add several now or later. Short steps here, full support after you sign up.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {behaviors.map((behavior) => (
                <Card key={behavior.title}>
                  <CardHeader>
                    <CardTitle className="text-card-title">{behavior.title}</CardTitle>
                    <CardDescription>{behavior.description}</CardDescription>
                  </CardHeader>
                </Card>
              ))}
            </div>
            <Card>
              <CardContent className="flex flex-col gap-3 pt-6 sm:flex-row sm:items-start">
                <div className="min-w-0 flex-1">
                  <h3 className="text-card-title font-semibold">Clear steps for the moment you need them.</h3>
                  <p className="mt-2 max-w-3xl text-body-sm text-muted-foreground">
                    With one active behavior, steps open right away. With several, you choose what you need help with first. Starter support is general guidance, not a clinician-approved treatment plan.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        <section aria-labelledby="clinical-access-title" className="mx-auto w-full max-w-6xl space-y-2 px-4 py-12 sm:px-6 sm:py-16">
          <h2 id="clinical-access-title" className="text-section-title font-semibold">Separate clinical and clinic administration workspaces</h2>
          <p className="mb-6 max-w-2xl text-body-sm text-muted-foreground">
            Sign-in choices only open the selected workspace. Access follows each approved account’s permissions.
          </p>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardDescription>Clinical workspace</CardDescription>
                <CardTitle className="text-card-title">For treating clinicians</CardTitle>
                <CardDescription>
                  Use clinical tools for clients you are explicitly assigned to support. New clinician access is invitation- and clinic-approved; it is not self-granted.
                </CardDescription>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader>
                <CardDescription>Clinic workspace</CardDescription>
                <CardTitle className="text-card-title">For clinic administrators</CardTitle>
                <CardDescription>
                  Manage your clinic’s staff, invitations, and client assignments. Administration alone does not grant access to clinical records.
                </CardDescription>
              </CardHeader>
            </Card>
          </div>
        </section>

        <section aria-labelledby="clinic-request-title" className="border-y border-border bg-muted/50">
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-8 sm:px-6 md:flex-row md:items-center md:justify-between">
            <div className="min-w-0 space-y-1">
              <h2 id="clinic-request-title" className="text-card-title font-semibold">Interested in NeuroPathways for your clinic?</h2>
              <p className="max-w-2xl text-support text-muted-foreground">
                Request platform review and clinic setup. This is a request only; it does not create a clinic or administrator account.
              </p>
            </div>
            <Button asChild variant="outline" className="shrink-0">
              <a href="/ClinicRequest">Register your clinic <ArrowRight aria-hidden="true" /></a>
            </Button>
          </div>
        </section>
      </main>

      <footer className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-8 text-support text-muted-foreground sm:px-6 md:flex-row md:items-center md:justify-between">
        <p>NeuroPathways</p>
        <nav aria-label="Footer links" className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <a href="/privacy" className="underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Privacy notice</a>
          <a href="/terms" className="underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Terms of use</a>
          <a href="/contact" className="underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Contact</a>
          <a href="/OperatorLogin" className="underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Operator sign in</a>
        </nav>
      </footer>
    </div>
  );
}
