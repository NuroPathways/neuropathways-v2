import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import DocScanButton, { describeScanError } from "./DocScanButton";
import { base44 } from "@/api/entities";

vi.mock("@/api/entities", () => ({ base44: { functions: { invoke: vi.fn(async () => ({ data: {} })) } } }));
afterEach(cleanup);

describe("DocScanButton", () => {
  it("classifies scanner errors into plain reasons", () => {
    expect(describeScanError("Unsupported file type: application/zip")).toMatchObject({ reason: "Unsupported file format.", retryable: false });
    expect(describeScanError("The file could not be found on the server.")).toMatchObject({ reason: "The stored file is missing.", retryable: false });
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
  it("returns saved extractions when a rescan cannot read the original", async () => {
    const savedRecords = [{
      id: "record-1",
      document_id: "missing",
      category: "behavior",
      source_excerpt: "Previously extracted source detail.",
      interpretation: { name: "Transition difficulty" },
    }];
    base44.functions.invoke.mockRejectedValueOnce(new Error(`API error 422: ${JSON.stringify({
      error: { message: "Couldn't read this document. The file could not be found on the server." },
      failed: [{ id: "missing", reason: "The file could not be found on the server." }],
      document_extractions: savedRecords,
      retained_extraction_fallback: true,
    })}`));
    const onScanned = vi.fn();
    render(<DocScanButton doc={{ id: "missing", child_id: "c1" }} clinicianId="u1" hasSavedExtractions onScanned={onScanned} />);
    fireEvent.click(screen.getByTestId("button-scan-doc-missing"));

    await waitFor(() => expect(screen.getByTestId("text-scan-error-missing")).toBeTruthy());
    expect(screen.getByText("Saved extracted information is shown below. Upload a fresh copy only if you need another scan.")).toBeTruthy();
    expect(onScanned).toHaveBeenCalledWith("missing", expect.objectContaining({
      documentExtractions: savedRecords,
      retainedExtractionFallback: true,
    }));
  });
  it("does not offer retry for unsupported formats", () => {
    render(<DocScanButton doc={{ id: "d2", child_id: "c1", scan_status: "failed", scan_error: "unsupported format" }} clinicianId="u1" />);
    expect(screen.queryByTestId("button-scan-doc-d2")).toBeNull();
  });
  it("restores Retry Scan for old gateway HTML errors and never shows their page markup", () => {
    const error = 'API error 503: <!DOCTYPE html><html><head><title>Your app is starting…</title><style>format: swap</style></head></html>';
    expect(describeScanError(error)).toMatchObject({ retryable: true, reason: "Processing service temporarily unavailable." });
    render(<DocScanButton doc={{ id: "startup", child_id: "c1", scan_status: "failed", scan_error: error }} clinicianId="u1" />);
    expect(screen.getByTestId("button-scan-doc-startup")).toBeTruthy();
    fireEvent.click(screen.getByTestId("button-view-scan-error-startup"));
    expect(screen.getByTestId("text-scan-error-startup").textContent).not.toContain("<!DOCTYPE");
    expect(screen.getByTestId("text-scan-error-startup").textContent).not.toContain("Upload a fresh copy");
  });
  it("labels successful scans Ready", () => {
    render(<DocScanButton doc={{ id: "d3", child_id: "c1", scan_status: "done" }} clinicianId="u1" />);
    expect(screen.getByTestId("status-doc-scan-d3").textContent).toContain("Ready");
  });
  it("updates an upload-driven clinician scan from Processing to Ready", () => {
    const { rerender } = render(<DocScanButton doc={{ id: "auto", child_id: "c1", scan_status: "scanning" }} clinicianId="u1" />);
    expect(screen.getByTestId("status-doc-scan-auto").textContent).toContain("Processing");
    rerender(<DocScanButton doc={{ id: "auto", child_id: "c1", scan_status: "done" }} clinicianId="u1" />);
    expect(screen.getByTestId("status-doc-scan-auto").textContent).toContain("Ready");
    expect(base44.functions.invoke).not.toHaveBeenCalled();
  });
  it("shows the failure and Retry Scan when a clinician automatic scan fails", () => {
    const { rerender } = render(<DocScanButton doc={{ id: "auto-fail", child_id: "c1", scan_status: "scanning" }} clinicianId="u1" />);
    rerender(<DocScanButton doc={{ id: "auto-fail", child_id: "c1", scan_status: "error", scan_error: "The AI service is temporarily unavailable." }} clinicianId="u1" />);
    expect(screen.getByTestId("status-doc-scan-auto-fail").textContent).toContain("Failed");
    expect(screen.getByTestId("button-scan-doc-auto-fail").textContent).toContain("Retry Scan");
    fireEvent.click(screen.getByTestId("button-view-scan-error-auto-fail"));
    expect(screen.getByTestId("text-scan-error-auto-fail").textContent).toContain("The AI service is temporarily unavailable.");
  });
  it("asks for an unlocked or re-exported PDF instead of an endless retry", () => {
    expect(describeScanError("This PDF is password-protected. Upload an unlocked PDF copy.").retryable).toBe(false);
    render(<DocScanButton doc={{ id: "d4", child_id: "c1", scan_status: "error", scan_error: "This PDF is damaged or incomplete. Re-export it as a PDF and upload it again." }} clinicianId="u1" />);
    expect(screen.queryByTestId("button-scan-doc-d4")).toBeNull();
  });
  it("scans only the selected document so unrelated files cannot block it", async () => {
    const result = { scanned: ["good"], failed: [] };
    base44.functions.invoke.mockResolvedValueOnce({ data: result });
    const refresh = vi.fn();
    render(<DocScanButton doc={{ id: "good", child_id: "c1", scan_status: "done" }} clinicianId="u1" onScanned={refresh} />);
    fireEvent.click(screen.getByTestId("button-scan-doc-good"));
    await waitFor(() => expect(screen.getByTestId("status-doc-scan-good").textContent).toContain("Ready"));
    expect(base44.functions.invoke).toHaveBeenCalledWith("buildClientProfile", {
      child_id: "c1",
      force_rebuild: true,
      invite_token: undefined,
      source_document_id: "good",
    });
    expect(refresh).toHaveBeenCalledWith("good", result);
  });
  it("shows the selected file's specific persisted error after a mixed scan failure", async () => {
    base44.functions.invoke.mockRejectedValueOnce(new Error(`API error 422: ${JSON.stringify({
      error: { message: "Combined scan failed" },
      failed: [{ id: "bad", reason: "This PDF is damaged or incomplete. Re-export it as a PDF and upload it again." }],
    })}`));
    render(<DocScanButton doc={{ id: "bad", child_id: "c1" }} clinicianId="u1" />);
    fireEvent.click(screen.getByTestId("button-scan-doc-bad"));
    await waitFor(() => expect(screen.getByTestId("text-scan-error-bad").textContent).toContain("re-exported"));
    expect(screen.queryByTestId("button-scan-doc-bad")).toBeNull();
  });
});
