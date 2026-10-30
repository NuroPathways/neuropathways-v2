import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import DocumentStatusInfo, { documentFailureMessage } from "./DocumentStatusInfo";

afterEach(cleanup);
describe("document processing info", () => {
  it("shows the current stage for a processing source", () => {
    render(<DocumentStatusInfo doc={{ id: "doc", title: "Plan" }} status="scanning"
      progress={{ stage: "Saving document results", started_at: "2026-10-30T10:00:00Z" }} />);
    fireEvent.click(screen.getByTestId("button-document-info-doc"));
    expect(screen.getByTestId("document-info-doc").textContent).toContain("Processing");
    expect(screen.getByTestId("document-info-doc").textContent).toContain("Saving document results");
  });
  it("shows the failure reason without exposing server JSON or HTML", () => {
    render(<DocumentStatusInfo doc={{ id: "doc", title: "Plan" }} status="error"
      reason={'API error 503: {"error":{"message":"The document reader took too long to finish."}}'} />);
    fireEvent.click(screen.getByTestId("button-document-info-doc"));
    expect(screen.getByTestId("document-info-doc").textContent).toContain("Why it failed");
    expect(screen.getByTestId("document-info-doc").textContent).toContain("The document reader took too long to finish.");
    expect(documentFailureMessage("<!doctype html><title>Your app is starting</title>")).not.toContain("<!doctype");
  });
});
