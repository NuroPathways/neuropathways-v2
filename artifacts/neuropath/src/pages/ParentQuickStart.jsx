import { useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useGetStarterLibrary, useCreateParentChild, useUpdateParentChild } from "@workspace/api-client-react";
import { useAuth } from "@/lib/AuthContext";
import { parentRequest, rememberInvite } from "@/lib/parentSession";
import { Shell, Field, ErrorBox, Skeleton, errMsg } from "@/components/parentfree/common";
import UploadBox from "@/components/parentfree/UploadBox";
import { isSetupComplete, useSelectedChild } from "@/components/parentfree/useParent";

const CUSTOM = "__custom";

export default function ParentQuickStart() {
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const invite = sp.get("invite");
  if (invite) rememberInvite(invite);
  const addingNew = sp.get("new") === "1";
  const { user, isAuthenticated, refreshParent, logout } = useAuth();
  const { children, select } = useSelectedChild();
  const qc = useQueryClient();
  const library = useGetStarterLibrary({ request: parentRequest() });
  const create = useCreateParentChild({ request: parentRequest() });
  const update = useUpdateParentChild({ request: parentRequest() });

  const [step, setStep] = useState(1);
  const [childId, setChildId] = useState(null);
  const [profile, setProfile] = useState({ name: "", age: "", notes: "" });
  const [behavior, setBehavior] = useState("");
  const [custom, setCustom] = useState("");
  const [goal, setGoal] = useState("");
  const [error, setError] = useState("");
  const [showUpload, setShowUpload] = useState(false);
  const resumed = useRef(false);

  useEffect(() => {
    if (resumed.current || addingNew) return;
    const open = children.find((c) => !isSetupComplete(c));
    resumed.current = true;
    if (!open) return;
    setChildId(open.id);
    setProfile({ name: open.name || "", age: open.age ?? "", notes: open.notes || "" });
    if (open.behaviorKey === "custom") { setBehavior(CUSTOM); setCustom(open.behaviorName || ""); }
    else if (open.behaviorKey) setBehavior(open.behaviorKey);
    setStep(!open.behaviorKey && !open.behaviorName ? 2 : 3);
  }, [children, addingNew]);

  const templates = library.data || [];
  const tpl = useMemo(() => templates.find((t) => t.key === behavior), [templates, behavior]);

  if (!isAuthenticated) return <Navigate to={`/ParentSignup${invite ? `?invite=${encodeURIComponent(invite)}` : ""}`} replace />;
  if (user?.account_type !== "parent_free") return <Navigate to="/" replace />;

  const fail = (er) => setError(errMsg(er));
  const stepProfile = (e) => {
    e.preventDefault();
    setError("");
    const body = { name: profile.name.trim(), age: profile.age === "" ? undefined : Number(profile.age), notes: profile.notes.trim() || undefined };
    const ok = (c) => { setChildId(c.id); select(c.id); refreshParent(); setStep(2); };
    if (childId) update.mutate({ childId, data: body }, { onSuccess: ok, onError: fail });
    else create.mutate({ data: body }, { onSuccess: ok, onError: fail });
  };
  const stepBehavior = () => {
    setError("");
    const data = behavior === CUSTOM ? { behaviorKey: "custom", customBehavior: custom.trim() } : { behaviorKey: behavior };
    update.mutate({ childId, data }, { onSuccess: () => { refreshParent(); setStep(3); }, onError: fail });
  };
  const stepGoal = () => {
    setError("");
    update.mutate({ childId, data: { goal: goal.trim() } }, {
      onSuccess: async () => { await refreshParent(); qc.invalidateQueries(); setStep(4); },
      onError: fail,
    });
  };
  const busy = create.isPending || update.isPending;
  const ageOk = profile.age === "" || (Number(profile.age) >= 0 && Number(profile.age) <= 25);

  return (
    <Shell right={<>{children.some(isSetupComplete) && <Link to="/ParentHome" className="pf-btn small ghost" data-testid="link-skip-home">Skip to dashboard</Link>}<button className="pf-btn small ghost" onClick={logout} data-testid="button-logout">Sign out</button></>}>
      <main className="pf-narrow pf-rise" style={{ paddingBottom: 60 }}>
        <div className="pf-steps" aria-label={`Step ${step} of 4`}>{[1, 2, 3, 4].map((n) => <span key={n} className={n <= step ? "on" : ""} />)}</div>

        {step === 1 && (
          <form onSubmit={stepProfile} style={{ marginTop: 28, display: "grid", gap: 16 }}>
            <p className="pf-eyebrow">Step 1 of 3</p>
            <h1 style={{ fontSize: "clamp(1.9rem,6vw,2.6rem)" }}>Add Your Child</h1>
            <p style={{ color: "var(--pf-ink-soft)" }}>Who are you creating support for?</p>
            <Field label="Child first name or nickname"><input className="pf-input" value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} data-testid="input-child-name" /></Field>
            <Field label="Child age (optional)"><input className="pf-input" type="number" min="0" max="25" value={profile.age} onChange={(e) => setProfile({ ...profile, age: e.target.value })} data-testid="input-child-age" /></Field>
            <Field label="Notes (optional)"><textarea className="pf-area" placeholder="Example: transitions are hard, homework is stressful, or runs away in parking lots." value={profile.notes} onChange={(e) => setProfile({ ...profile, notes: e.target.value })} data-testid="input-child-notes" /></Field>
            <ErrorBox error={error} />
            <button className="pf-btn primary" disabled={!profile.name.trim() || !ageOk || busy} data-testid="button-next-profile">{busy ? "Saving..." : "Continue"}</button>
          </form>
        )}

        {step === 2 && (
          <section style={{ marginTop: 28, display: "grid", gap: 16 }}>
            <p className="pf-eyebrow">Step 2 of 3</p>
            <h1 style={{ fontSize: "clamp(1.9rem,6vw,2.6rem)" }}>Choose One Behavior</h1>
            <p style={{ color: "var(--pf-ink-soft)" }}>What do you need help with most often?</p>
            <p className="pf-tag sun" style={{ justifySelf: "start" }} data-testid="text-starter-label">Starter behavior support — not yet based on an uploaded clinician plan.</p>
            {library.isLoading && <Skeleton h={200} />}
            {library.isError && <ErrorBox error={library.error} onRetry={() => library.refetch()} />}
            <div style={{ display: "grid", gap: 10 }}>
              {templates.map((t) => (
                <button key={t.key} type="button" aria-pressed={behavior === t.key} onClick={() => setBehavior(t.key)} className="pf-card" style={{ textAlign: "left", cursor: "pointer", padding: 16, borderColor: behavior === t.key ? "var(--pf-accent)" : undefined, borderWidth: behavior === t.key ? 2 : 1 }} data-testid={`button-behavior-${t.key}`}>
                  <strong>{t.name}</strong>
                  <p style={{ fontSize: ".88rem", color: "var(--pf-ink-soft)" }}>{t.description}</p>
                </button>
              ))}
              {!library.isLoading && (
                <button type="button" aria-pressed={behavior === CUSTOM} onClick={() => setBehavior(CUSTOM)} className="pf-card" style={{ textAlign: "left", cursor: "pointer", padding: 16, borderColor: behavior === CUSTOM ? "var(--pf-accent)" : undefined }} data-testid="button-behavior-custom">
                  <strong>Other / I'll type my own</strong>
                </button>
              )}
            </div>
            {behavior === CUSTOM && <Field label="Describe it"><input className="pf-input" value={custom} onChange={(e) => setCustom(e.target.value)} data-testid="input-custom-behavior" /></Field>}
            <ErrorBox error={error} />
            <div style={{ display: "flex", gap: 10 }}>
              <button className="pf-btn" onClick={() => setStep(1)} data-testid="button-back-behavior">Back</button>
              <button className="pf-btn primary" style={{ flex: 1 }} disabled={busy || !behavior || (behavior === CUSTOM && !custom.trim())} onClick={stepBehavior} data-testid="button-next-behavior">{busy ? "Saving..." : "Continue"}</button>
            </div>
          </section>
        )}

        {step === 3 && (
          <section style={{ marginTop: 28, display: "grid", gap: 16 }}>
            <p className="pf-eyebrow">Step 3 of 3</p>
            <h1 style={{ fontSize: "clamp(1.9rem,6vw,2.6rem)" }}>Choose One Goal</h1>
            <p style={{ color: "var(--pf-ink-soft)" }}>What would you like to work on first?</p>
            {tpl?.relatedGoals?.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {tpl.relatedGoals.map((g) => <button key={g} type="button" className="pf-chip" aria-pressed={goal === g} onClick={() => setGoal(g)} data-testid={`chip-goal-${g.slice(0, 16)}`}>{g}</button>)}
              </div>
            )}
            <Field label="Custom goal"><textarea className="pf-area" value={goal} onChange={(e) => setGoal(e.target.value)} data-testid="input-goal" /></Field>
            <ErrorBox error={error} />
            <div style={{ display: "flex", gap: 10 }}>
              <button className="pf-btn" onClick={() => setStep(2)} data-testid="button-back-goal">Back</button>
              <button className="pf-btn primary" style={{ flex: 1 }} disabled={busy || !goal.trim()} onClick={stepGoal} data-testid="button-next-goal">{busy ? "Saving..." : "Create my support card"}</button>
            </div>
          </section>
        )}

        {step === 4 && (
          <section style={{ marginTop: 28, display: "grid", gap: 16 }}>
            <h1 style={{ fontSize: "clamp(1.9rem,6vw,2.6rem)" }}>Your first support card is ready.</h1>
            <p style={{ fontWeight: 600 }}>Have a behavior plan, school plan, or treatment plan?</p>
            {showUpload ? (
              <div className="pf-card"><UploadBox key={childId} childId={childId} /></div>
            ) : (
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button className="pf-btn primary" onClick={() => setShowUpload(true)} data-testid="button-upload-now">Upload Now</button>
                <button className="pf-btn" onClick={() => nav("/ParentHome")} data-testid="button-skip-upload">Skip for Now</button>
              </div>
            )}
            {showUpload && <button className="pf-btn ink" onClick={() => nav("/ParentHome")} data-testid="button-go-dashboard">Go to Today's Support</button>}
          </section>
        )}
      </main>
    </Shell>
  );
}
