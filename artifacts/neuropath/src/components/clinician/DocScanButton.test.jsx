import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import DocScanButton, { describeScanError } from "./DocScanButton";

vi.mock("@/api/entities", () => ({ base44: { functions: { invoke: vi.fn(async () => ({ data: {} })) } } }));
afterEach(cleanup);

describe("DocScanButton", () => {
  it("classifies scanner errors into plain reasons", () => {
    expect(describeScanError("Unsupported file type: application/zip")).toMatchObject({ reason: "Unsupported file format.", retryable: false });
    expect(describeScanError("No readable text in document")).toMatchObject({ reason: "No readable text found.", retryable: true });
    expect(describeScanError("API error 503: upstream unavailable").reason).toBe("Processing service temporarily unavailable.");
    expect(describeScanError("Failed").reason).toBe("Document could not be read.");
  });
  it("shows Failed with View Error and Retry Scan for retryable failures", () => {
    render(<DocScanButton doc={{ id: "d1", child_id: "c1", scan_status: "error", scan_error: "Request timed out" }} clinicianId="u1" />);
    expect(screen.getByTestId("status-doc-scan-d1").textContent).toContain("Failed");
    expect(screen.queryByTestId("text-scan-error-d1")).toBeNull();
    fireEvent.click(screen.getByTestId("button-view-scan-error-d1"));
    expect(screen.getByTestId("text-scan-error-d1").textContent).toContain("Processing service temporarily unavailable.");
    expect(screen.getByTestId("button-scan-doc-d1").textContent).toContain("Retry Scan");
  });
  it("does not offer retry for unsupported formats", () => {
    render(<DocScanButton doc={{ id: "d2", child_id: "c1", scan_status: "failed", scan_error: "unsupported format" }} clinicianId="u1" />);
    expect(screen.queryByTestId("button-scan-doc-d2")).toBeNull();
  });
  it("labels successful scans Ready", () => {
    render(<DocScanButton doc={{ id: "d3", child_id: "c1", scan_status: "done" }} clinicianId="u1" />);
    expect(screen.getByTestId("status-doc-scan-d3").textContent).toContain("Ready");
  });
});
