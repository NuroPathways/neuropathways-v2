import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import DocumentActivitySuggestions from "./DocumentActivitySuggestions";

afterEach(cleanup);

const suggestion = {
  id: "library:what-happens-next",
  title: "What Happens Next?",
  description: "Use a familiar visual sequence to explore what comes next.",
  category: "Transitions",
  skill: "Following familiar routines",
  estimatedMinutes: 5,
  materials: ["A familiar picture sequence"],
  startAction: "Choose one real next step and a cue your child already accepts.",
  steps: ["Choose a familiar routine.", "Look at one picture together.", "Stop or pause if your child is finished."],
  ending: "Finish after the preview.",
  ifDifficult: "Put the cue away if it increases stress.",
  relatedGoal: null,
  matchSource: "documents",
  matchedPreferences: [],
  pauseConditions: ["Your child asks to stop or shows discomfort."],
  matchReasons: ["A current document describes an already-familiar visual schedule."],
  riskClassification: "General educational idea; check that it is familiar, welcome, and safe for your child.",
  relatedSupportAreas: ["Difficulty with directions"],
  sourceEvidence: [{
    recordId: "record-1",
    category: "profile_information",
    documentId: "doc-1",
    documentTitle: "Current intake",
    sourceSection: "Communication supports",
    sourcePage: 3,
    sourceExcerpt: "The child already uses a familiar visual schedule.",
    reviewStatus: "unreviewed",
  }],
  researchReferences: [],
  researchLimitations: ["A general activity template does not establish treatment effectiveness."],
};

describe("DocumentActivitySuggestions", () => {
  it("shows a distinct general suggestion with its steps, limits, and source citation", () => {
    render(<DocumentActivitySuggestions suggestions={[suggestion]} />);

    expect(screen.getByTestId("section-document-activity-suggestions")).toBeTruthy();
    expect(screen.getAllByText(/not individualized treatment or clinician-approved assignments/i).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "What Happens Next?" }));

    expect(screen.getByText("Following familiar routines")).toBeTruthy();
    expect(screen.getByText("Matched to verified details in uploaded documents")).toBeTruthy();
    expect(screen.getByText("Choose a familiar routine.")).toBeTruthy();
    expect(screen.getByText(/Choose one real next step/)).toBeTruthy();
    expect(screen.getByText(/Finish after the preview/)).toBeTruthy();
    expect(screen.getByText(/A general activity template does not establish treatment effectiveness/i)).toBeTruthy();
    expect(screen.getByText("The child already uses a familiar visual schedule.")).toBeTruthy();
    expect(screen.getByText("Difficulty with directions")).toBeTruthy();
  });

  it("labels family preference matches without claiming document or clinician approval", () => {
    render(<DocumentActivitySuggestions suggestions={[{
      ...suggestion,
      id: "library:puzzle-together",
      title: "Puzzle Together",
      matchSource: "family_preferences",
      matchedPreferences: ["jigsaw puzzles"],
      sourceEvidence: [],
      relatedGoal: "Try a familiar shared activity",
    }]} />);

    fireEvent.click(screen.getByRole("button", { name: "Puzzle Together" }));
    expect(screen.getByText("Matched to family-saved preferences")).toBeTruthy();
    expect(screen.getByText(/jigsaw puzzles/)).toBeTruthy();
    expect(screen.getByText(/Try a familiar shared activity/)).toBeTruthy();
    expect(screen.getByText(/not individualized treatment or clinician-approved assignments/i)).toBeTruthy();
  });

  it("renders nothing when no verified document-grounded suggestion is available", () => {
    const { container } = render(<DocumentActivitySuggestions suggestions={[]} />);
    expect(container.firstChild).toBeNull();
  });
});
