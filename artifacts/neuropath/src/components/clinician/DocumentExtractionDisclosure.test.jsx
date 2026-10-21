import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import DocumentExtractionDisclosure from "./DocumentExtractionDisclosure";

describe("DocumentExtractionDisclosure", () => {
  it("shows the verbatim source and review state for extracted information", () => {
    render(
      <DocumentExtractionDisclosure
        records={[{
          id: "record-1",
          category: "support_strategy",
          review_status: "needs_review",
          source_excerpt_verified: false,
          source_section: "Prevention",
          source_page: 2,
          source_excerpt: "Offer the picture card before the transition.",
          interpretation: { strategy: "Use the picture card proactively." },
          ambiguity_reason: "The excerpt could not be verified against searchable text.",
        }]}
      />,
    );

    fireEvent.click(screen.getByText("Source-linked extractions"));

    expect(screen.getByText("Support strategy")).toBeTruthy();
    expect(screen.getByText("Needs review")).toBeTruthy();
    expect(screen.getByText("Offer the picture card before the transition.")).toBeTruthy();
    expect(screen.getByText(/Page 2/)).toBeTruthy();
  });

  it("renders nothing when there are no extracted records", () => {
    const { container } = render(<DocumentExtractionDisclosure records={[]} />);
    expect(container.firstChild).toBeNull();
  });
});
