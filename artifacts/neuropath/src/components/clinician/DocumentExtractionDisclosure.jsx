import "@workspace/neuropathways-foundations/scoped.css";

const CATEGORY_LABELS = {
  profile_information: "Profile information",
  behavior: "Behavior",
  goal: "Goal",
  support_strategy: "Support strategy",
  safety_instruction: "Safety instruction",
  potential_home_activity: "Potential home activity",
};

function displayValue(value) {
  if (Array.isArray(value)) return value.map(displayValue).filter(Boolean).join("; ");
  if (value === null || value === undefined || typeof value === "object") return "";
  return String(value);
}

export default function DocumentExtractionDisclosure({ records = [], defaultOpen = false }) {
  if (!records.length) return null;

  return (
    <div className="np-foundations" style={{ marginInlineStart: "var(--np-space-card)" }}>
      <details
        open={defaultOpen || undefined}
        className="np-surface-separated"
        data-testid="document-extraction-disclosure"
        style={{ padding: "var(--np-space-related-lg)" }}
      >
        <summary
          className="np-control"
          style={{
            alignItems: "center",
            cursor: "pointer",
            display: "flex",
            flexWrap: "wrap",
            gap: "var(--np-space-list)",
            justifyContent: "space-between",
            listStylePosition: "inside",
          }}
        >
          <span className="np-card-title">Source-linked extractions</span>
          <span className="np-muted np-text-support">
            {records.length} item{records.length === 1 ? "" : "s"}
          </span>
        </summary>

        <div style={{ display: "grid", gap: "var(--np-space-list-lg)", marginTop: "var(--np-space-related)" }}>
          {records.map((record, index) => {
            const interpretation = record.interpretation && typeof record.interpretation === "object"
              ? Object.entries(record.interpretation)
              : [];
            const status = record.review_status === "approved"
              ? "Clinician-approved"
              : record.review_status === "rejected"
                ? "Rejected"
                : record.review_status === "needs_review" || record.source_excerpt_verified === false
                  ? "Needs review"
                  : "Not yet reviewed";

            return (
              <article
                key={record.id || `${record.document_id}-${index}`}
                style={{
                  border: "1px solid var(--np-color-border)",
                  borderRadius: "var(--np-radius)",
                  padding: "var(--np-space-related)",
                  overflowWrap: "anywhere",
                }}
              >
                <div style={{ alignItems: "baseline", display: "flex", flexWrap: "wrap", gap: "var(--np-space-list)", justifyContent: "space-between" }}>
                  <strong className="np-text-body-sm">
                    {CATEGORY_LABELS[record.category] || "Document information"}
                  </strong>
                  <span className="np-muted np-text-support-sm">{status}</span>
                </div>

                <p className="np-muted np-text-support-sm" style={{ marginBlock: "var(--np-space-list)" }}>
                  {[
                    record.source_section,
                    record.source_page ? `Page ${record.source_page}` : "",
                    record.source_excerpt_verified === false ? "Excerpt not verified against searchable text" : "Source excerpt verified",
                  ].filter(Boolean).join(" · ")}
                </p>

                {record.source_excerpt ? (
                  <blockquote
                    className="np-text-support"
                    style={{
                      background: "var(--np-color-muted)",
                      borderInlineStart: "3px solid var(--np-color-primary)",
                      borderRadius: "var(--np-radius)",
                      margin: 0,
                      padding: "var(--np-space-related)",
                      whiteSpace: "pre-wrap",
                    }}
                  >
                    {record.source_excerpt}
                  </blockquote>
                ) : null}

                {interpretation.length > 0 ? (
                  <dl style={{ display: "grid", gap: "var(--np-space-list)", marginBlock: "var(--np-space-related)" }}>
                    {interpretation.map(([key, value]) => {
                      const text = displayValue(value);
                      if (!text) return null;
                      return (
                        <div key={key}>
                          <dt className="np-muted np-text-support-sm" style={{ textTransform: "capitalize" }}>
                            {key.replace(/_/g, " ")}
                          </dt>
                          <dd className="np-text-body-sm" style={{ margin: 0, whiteSpace: "pre-wrap" }}>{text}</dd>
                        </div>
                      );
                    })}
                  </dl>
                ) : null}

                {record.ambiguity_reason ? (
                  <p className="np-text-support-sm" style={{ color: "var(--np-color-destructive)", marginBlock: "var(--np-space-list)" }}>
                    {record.ambiguity_reason}
                  </p>
                ) : null}
              </article>
            );
          })}
        </div>
      </details>
    </div>
  );
}
