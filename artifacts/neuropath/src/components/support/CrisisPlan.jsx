import { ArrowLeft, X, ShieldAlert, Phone } from "lucide-react";
import { Button } from "@workspace/neuropathways-foundations/components/ui/button";

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function textValue(value) {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value);
  if (isRecord(value)) {
    return textValue(value.text ?? value.step ?? value.procedure ?? value.description ?? value.title ?? "");
  }
  return "";
}

function listSteps(value) {
  if (Array.isArray(value)) return value.map(textValue).filter(Boolean);
  if (typeof value === "string") {
    return value
      .split(/\r?\n/)
      .map((step) => step.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim())
      .filter(Boolean);
  }
  if (isRecord(value)) {
    const nested = value.steps ?? value.items ?? value.procedures ?? value.guidance ?? value.protocol;
    return nested === undefined ? [] : listSteps(nested);
  }
  return [];
}

function parentHomePath(tab, childId) {
  const params = new URLSearchParams({ tab });
  if (childId) params.set("child_id", String(childId));
  return `/ParentHome?${params.toString()}`;
}

function ParentSafetyActions({ child }) {
  return (
    <div className="flex flex-wrap gap-2" data-testid="section-parent-safety-actions">
      <Button asChild variant="outline" size="sm">
        <a href={parentHomePath("docs", child?.id)}>Upload or review a plan</a>
      </Button>
      <Button asChild variant="outline" size="sm">
        <a href={parentHomePath("clinic", child?.id)}>Open care team</a>
      </Button>
    </div>
  );
}

export default function CrisisPlan({ child, profile, loadingProfile, profileLoadError, onBack, onDismiss, isIndividual, parentDirect }) {
  const crisisPlan = listSteps(profile?.crisis_plan);
  const safetyProcedures = listSteps(profile?.safety_procedures);
  const safetyPlan = profile?.safetyPlan;
  const safetyPlanInstructions = Array.isArray(safetyPlan?.instructions) ? safetyPlan.instructions : [];
  const safetyPlanDocuments = Array.isArray(safetyPlan?.documents) ? safetyPlan.documents : [];
  const safetyPlanUploaded = safetyPlan?.hasSafetyPlan === true || profile?.safety_plan_uploaded === true;
  const hasSafetyInstructions = safetyPlanInstructions.length > 0;
  const hasLegacyInstructions = crisisPlan.length > 0 || safetyProcedures.length > 0;
  const name = child?.child_name;

  return (
    <div>
      <div className="np-help-bar">
        <button type="button" onClick={onBack} aria-label="Back to support options" data-testid="button-back-support" className="np-help-icon-btn">
          <ArrowLeft aria-hidden="true" />
        </button>
        <div className="np-help-bar-title">
          <h2><ShieldAlert aria-hidden="true" style={{ width: 20, height: 20, color: "var(--np-color-destructive)" }} />Safety / Crisis Plan</h2>
        </div>
        <button type="button" onClick={onDismiss} aria-label="Close support" data-testid="button-close-support" className="np-help-icon-btn">
          <X aria-hidden="true" />
        </button>
      </div>

      <div className="np-help-body">
        <p className="np-help-emergency" role="note" data-testid="text-emergency-top">
          <Phone aria-hidden="true" />
          <span>If there is immediate danger, call 911 or emergency services.</span>
        </p>

        {loadingProfile ? (
          <p role="status" aria-busy="true" className="np-help-muted">Loading safety plan...</p>
        ) : profileLoadError ? (
          <div role="alert" className="np-help-notice" data-tone="urgent">
            <p className="np-help-text np-help-strong">Could not load safety information.</p>
            <p className="np-help-text">Return to the support menu and try again.</p>
            {parentDirect && <ParentSafetyActions child={child} />}
          </div>
        ) : profile?.safetyPlanLoadError ? (
          <div role="alert" className="np-help-notice" data-tone="urgent" data-testid="alert-safety-plan-load">
            <p className="np-help-text np-help-strong">Could not load this child’s safety-plan sources.</p>
            <p className="np-help-text">The app could not confirm whether a current plan is available. Try again or open the child’s documents.</p>
            {parentDirect && <ParentSafetyActions child={child} />}
          </div>
        ) : !hasSafetyInstructions && !hasLegacyInstructions ? (
          <div className="np-help-notice" data-tone="caution">
            <p className="np-help-text np-help-strong">
              {safetyPlanUploaded
                ? "A safety plan was uploaded, but its steps are not available in this screen."
                : "No safety plan has been uploaded for this child."}
            </p>
            <p className="np-help-text">
              {safetyPlanUploaded
                ? "Review the uploaded document for its instructions. Contact a qualified professional if you need individualized guidance."
                : parentDirect
                  ? `This screen does not contain an individualized crisis plan for ${name || "this child"}. Upload a safety plan or contact the care team for individualized guidance.`
                  : `This screen does not contain an individualized crisis plan for ${name || "this child"}. Contact a qualified professional for individualized guidance.`}
            </p>
            {safetyPlanDocuments.map((document) => {
              const uploadSource = document.uploadedBy === "parent" ? "Parent-uploaded" : "Clinician-uploaded";
              const reviewStatus = document.clinicalReviewStatus === "reviewed"
                ? "document reviewed; no instruction-level approval was found"
                : document.clinicalReviewStatus === "needs_review"
                  ? "needs clinical review"
                  : "not clinician-approved";
              const readStatus = ["failed", "error"].includes(document.extractionStatus) ||
                ["failed", "error"].includes(document.scanStatus)
                ? "reading failed; review the original document"
                : "instructions are not available here";
              return (
                <p className="np-help-text" key={document.id}>
                  {document.title} — {uploadSource} · {reviewStatus} · {readStatus}
                </p>
              );
            })}
            {parentDirect && <ParentSafetyActions child={child} />}
            <p className="np-help-text np-help-strong">If there is immediate danger, call 911 or emergency services.</p>
          </div>
        ) : (
          <>
            {name && !isIndividual && (
              <p className="np-help-muted">Crisis plan for: <strong className="np-help-strong" style={{ color: "var(--np-color-foreground)" }}>{name}</strong></p>
            )}

            {hasSafetyInstructions && (
              <section className="np-help-group" data-testid="section-source-safety-plan">
                <h3 className="np-help-label">Safety information from current documents</h3>
                <p className="np-help-muted">Current document versions are shown newest first. Source excerpts are shown as written; older clinician-profile notes are labeled separately and need source verification.</p>
                {safetyPlanInstructions.map((item) => {
                  const sourceStatus = item.contentKind === "profile_extraction"
                    ? "Clinician profile extraction · needs source verification"
                    : item.clinicianApproved
                      ? "Clinician-approved"
                      : item.sourceReviewRequired
                        ? `${item.uploadedBy === "parent" ? "Parent-uploaded" : "Clinician-uploaded"} · needs source review`
                        : `${item.uploadedBy === "parent" ? "Parent-uploaded" : "Clinician-uploaded"} · not clinician-approved`;
                  return (
                    <div className="np-help-notice" data-tone={item.sourceReviewRequired ? "caution" : "urgent"} key={item.id}>
                      <p className="np-help-text np-help-strong">{sourceStatus}</p>
                      {item.contentKind === "profile_extraction" ? (
                        <p className="np-help-text"><strong>Clinician profile note (not an exact source excerpt):</strong> {item.profileNote}</p>
                      ) : (
                        <p className="np-help-text"><strong>Source excerpt:</strong> {item.sourceExcerpt}</p>
                      )}
                      <p className="np-help-muted">
                        {item.documentTitle}
                        {item.sourceSection ? ` · ${item.sourceSection}` : ""}
                        {item.sourcePage ? ` · page ${item.sourcePage}` : ""}
                      </p>
                      {item.sourceReviewRequired && (
                        <p className="np-help-text np-help-strong">
                          {item.contentKind === "profile_extraction"
                            ? "Check this note against the linked original document before relying on it."
                            : "Verify this excerpt in the original document before relying on it."}
                        </p>
                      )}
                    </div>
                  );
                })}
              </section>
            )}

            {crisisPlan.length > 0 && (
              <section className="np-help-active" data-testid="section-crisis-steps">
                <h3 className="np-help-label">Crisis plan steps on file</h3>
                <ol className="np-help-steps" data-tone="urgent">
                  {crisisPlan.map((step, i) => <li key={i}><span>{step}</span></li>)}
                </ol>
              </section>
            )}

            {safetyProcedures.length > 0 && (
              <section className="np-help-group" data-testid="section-safety-procedures">
                <h3 className="np-help-label">Safety Procedures</h3>
                <ol className="np-help-steps">
                  {safetyProcedures.map((s, i) => <li key={i}><span>{s}</span></li>)}
                </ol>
              </section>
            )}

            {parentDirect && <ParentSafetyActions child={child} />}

            <section className="np-help-group np-help-urgent-section">
              <h3 className="np-help-label">When To Contact Your Clinician</h3>
              <p className="np-help-text">
                Contact your clinician if the situation does not de-escalate, if safety cannot be maintained, or if the crisis plan steps are not working.
              </p>
            </section>
          </>
        )}

        <p className="np-help-emergency" role="note">
          <Phone aria-hidden="true" />
          <span>If there is immediate danger, call 911 or emergency services.</span>
        </p>
      </div>
    </div>
  );
}
