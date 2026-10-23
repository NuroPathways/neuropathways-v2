import { Disclosure } from "@workspace/neuropathways-foundations/components/ui/disclosure";

export default function DocumentActivitySuggestions({ suggestions = [] }) {
  if (!Array.isArray(suggestions) || suggestions.length === 0) return null;

  return (
    <section
      className="np-practice-section"
      aria-labelledby="document-activity-suggestions-heading"
      data-testid="section-document-activity-suggestions"
    >
      <h3 id="document-activity-suggestions-heading">Activity ideas matched to your documents</h3>
      <p className="np-section-sub">
        These are existing, low-risk educational activities matched to verified details in your uploaded documents.
        They are suggestions, not individualized treatment or clinician-approved assignments. Choose only what feels
        familiar and safe for your child.
      </p>
      <div className="np-activity-grid">
        {suggestions.map((suggestion) => (
          <article key={suggestion.id} data-testid={`document-activity-suggestion-${suggestion.id}`}>
            <Disclosure title={suggestion.title} className="np-practice-row">
              <div className="np-practice-suggestion-content">
                {suggestion.skill && <p><strong>Skill:</strong> {suggestion.skill}</p>}
                {suggestion.estimatedMinutes && <p><strong>About:</strong> {suggestion.estimatedMinutes} minutes</p>}
                {suggestion.description && <p>{suggestion.description}</p>}
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
                {suggestion.steps?.length > 0 && (
                  <div>
                    <strong>Activity steps</strong>
                    <ol>{suggestion.steps.map((step, index) => <li key={index}>{step}</li>)}</ol>
                  </div>
                )}
                {suggestion.pauseConditions?.length > 0 && (
                  <div role="note">
                    <strong>Pause or stop if:</strong>
                    <ul>{suggestion.pauseConditions.map((condition, index) => <li key={index}>{condition}</li>)}</ul>
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
                {suggestion.researchLimitations?.length > 0 && (
                  <div>
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
