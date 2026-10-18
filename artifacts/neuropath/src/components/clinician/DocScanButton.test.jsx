import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import DocScanButton, { describeScanError } from "./DocScanButton";
import { base44 } from "@/api/entities";

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
  it("asks for an unlocked or re-exported PDF instead of an endless retry", () => {
    expect(describeScanError("This PDF is password-protected. Upload an unlocked PDF copy.").retryable).toBe(false);
    render(<DocScanButton doc={{ id: "d4", child_id: "c1", scan_status: "error", scan_error: "This PDF is damaged or incomplete. Re-export it as a PDF and upload it again." }} clinicianId="u1" />);
    expect(screen.queryByTestId("button-scan-doc-d4")).toBeNull();
  });
  it("does not mark a healthy document Failed when another document blocks the scan", async () => {
    base44.functions.invoke.mockRejectedValueOnce(new Error(`API error 422: ${JSON.stringify({
      error: { message: "A different file could not be read. Previous information has been preserved." },
      failed: [{ id: "bad", reason: "This PDF is damaged or incomplete." }],
    })}`));
    const refresh = vi.fn();
    render(<DocScanButton doc={{ id: "good", child_id: "c1", scan_status: "done" }} clinicianId="u1" onScanned={refresh} />);
    fireEvent.click(screen.getByTestId("button-scan-doc-good"));
    await waitFor(() => expect(screen.getByTestId("status-doc-scan-good").textContent).toBe("Scan blocked"));
    expect(screen.getByTestId("text-scan-error-good").textContent).toContain("Another document is blocking");
    expect(refresh).toHaveBeenCalledOnce();
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
