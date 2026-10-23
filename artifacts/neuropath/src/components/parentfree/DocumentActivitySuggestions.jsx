import { Disclosure } from "@workspace/neuropathways-foundations/components/ui/disclosure";

export default function DocumentActivitySuggestions({ suggestions = [] }) {
  if (!Array.isArray(suggestions) || suggestions.length === 0) return null;
  const hasDocumentMatches = suggestions.some((suggestion) => suggestion.matchSource === "documents" || suggestion.matchSource === "documents_and_preferences");
  const hasPreferenceMatches = suggestions.some((suggestion) => suggestion.matchSource === "family_preferences" || suggestion.matchSource === "documents_and_preferences");
  const matchSources = [
    hasDocumentMatches ? "verified details in current documents" : null,
    hasPreferenceMatches ? "preferences saved by your family" : null,
  ].filter(Boolean).join(" and ");
  const matchLabel = (source) => source === "documents_and_preferences"
    ? "Matched to verified document details and family preferences"
    : source === "family_preferences"
      ? "Matched to family-saved preferences"
      : "Matched to verified details in uploaded documents";

  return (
    <section
      className="np-practice-section"
      aria-labelledby="document-activity-suggestions-heading"
      data-testid="section-document-activity-suggestions"
    >
      <h3 id="document-activity-suggestions-heading">Activity ideas matched to your child</h3>
      <p className="np-section-sub">
        These are low-risk activity ideas matched only to {matchSources}.
        They are general suggestions, not individualized treatment or clinician-approved assignments.
        Check that each activity still feels familiar, welcome, and safe.
      </p>
      <div className="np-activity-grid">
        {suggestions.map((suggestion) => (
          <article key={suggestion.id} data-testid={`document-activity-suggestion-${suggestion.id}`}>
            <Disclosure title={suggestion.title} className="np-practice-row">
              <div className="np-practice-suggestion-content">
                <p><strong>{matchLabel(suggestion.matchSource)}</strong></p>
                {suggestion.skill && <p><strong>Skill:</strong> {suggestion.skill}</p>}
                {suggestion.estimatedMinutes && <p><strong>About:</strong> {suggestion.estimatedMinutes} minutes</p>}
                {suggestion.description && <p>{suggestion.description}</p>}
                {suggestion.relatedGoal && (
                  <p><strong>Related goal (not an activity assignment):</strong> {suggestion.relatedGoal}</p>
                )}
                {suggestion.matchedPreferences?.length > 0 && (
                  <p><strong>Family preferences used:</strong> {suggestion.matchedPreferences.join(", ")}</p>
                )}
                {suggestion.relatedSupportAreas?.length > 0 && (
                  <p><strong>Related support areas:</strong> {suggestion.relatedSupportAreas.join(", ")}</p>
                )}
                {suggestion.matchReasons?.length > 0 && (
                  <div>
                    <strong>Why this matched</strong>
                    <ul>{suggestion.matchReasons.map((reason, index) => <li key={index}>{reason}</li>)}</ul>
                  </div>
                )}
                {suggestion.materials?.length > 0 && (
                  <p><strong>Materials:</strong> {suggestion.materials.join(", ")}</p>
                )}
                {suggestion.startAction && <p><strong>Before you begin:</strong> {suggestion.startAction}</p>}
                {suggestion.steps?.length > 0 && (
                  <div>
                    <strong>Activity steps</strong>
                    <ol>{suggestion.steps.map((step, index) => <li key={index}>{step}</li>)}</ol>
                  </div>
                )}
                {suggestion.ending && <p><strong>Finish:</strong> {suggestion.ending}</p>}
                {(suggestion.ifDifficult || suggestion.pauseConditions?.length > 0) && (
                  <div role="note">
                    <strong>Pause or stop if:</strong>
                    <ul>{[suggestion.ifDifficult, ...(suggestion.pauseConditions || [])]
                      .filter((condition, index, all) => condition && all.indexOf(condition) === index)
                      .map((condition, index) => <li key={index}>{condition}</li>)}</ul>
                  </div>
                )}
                {suggestion.riskClassification && <p>{suggestion.riskClassification}</p>}
                {suggestion.sourceEvidence?.length > 0 && (
                  <div>
                    <strong>Matched source details</strong>
                    {suggestion.sourceEvidence.map((evidence) => (
                      <blockquote key={`${evidence.recordId}:${evidence.documentId}`}>
                        <span>{evidence.documentTitle}</span>
                        {evidence.sourceSection && <span> · {evidence.sourceSection}</span>}
                        {evidence.sourcePage && <span> · Page {evidence.sourcePage}</span>}
                        <p>{evidence.sourceExcerpt}</p>
                      </blockquote>
                    ))}
                  </div>
                )}
                {(suggestion.researchReferences?.length > 0 || suggestion.researchLimitations?.length > 0) && (
                  <div>
                    {suggestion.researchReferences?.length > 0 && (
                      <>
                        <strong>Research background</strong>
                        <ul>{suggestion.researchReferences.map((reference) => (
                          <li key={reference.key}>
                            <a href={reference.url} target="_blank" rel="noreferrer">{reference.title} ({reference.publishedYear})</a>
                          </li>
                        ))}</ul>
                      </>
                    )}
                    <strong>Evidence limits</strong>
                    <ul>{suggestion.researchLimitations.map((limitation, index) => <li key={index}>{limitation}</li>)}</ul>
                  </div>
                )}
              </div>
            </Disclosure>
          </article>
        ))}
      </div>
    </section>
  );
}
