export default function HomeWeekSummary({ focusedCard, focusedSource, week, onLog }) {
  return (
    <section className="pf-daily-section np-home-week" aria-labelledby="this-week-heading">
      <div className="pf-daily-section-heading">
        <div>
          <p className="pf-eyebrow">From your recent notes</p>
          <h2 id="this-week-heading">This Week</h2>
        </div>
        <span className="pf-daily-count">{week.entries} logged</span>
      </div>
      {focusedCard ? (
        <>
          <div className="pf-daily-source">
            <span className={`pf-tag ${focusedSource.kind}`}>{focusedSource.text}</span>
          </div>
          <p>This week, try one small support step for <strong>{focusedCard.behaviorName}</strong> during a calm moment.</p>
          {focusedCard.source === "starter" && (
            <p className="pf-hint">This is starter support based on the behavior you selected. Upload a plan later for more personalized support.</p>
          )}
        </>
      ) : <p>No support area selected yet. Add a behavior to see starter support here.</p>}
      <p className="pf-hint">
        {week.entries
          ? `${week.entries} parent ${week.entries === 1 ? "note was" : "notes were"} logged in the last 7 days (${week.happened} marked as happened).`
          : "No parent notes logged in the last 7 days. Your notes are optional observations, not clinical findings."}
      </p>
      <button type="button" className="pf-btn small" onClick={onLog}>Quick Log</button>
    </section>
  );
}
