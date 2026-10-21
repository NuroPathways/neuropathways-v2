import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DocsPanel, { processingStatus } from "./DocsPanel";

const api = vi.hoisted(() => ({
  scan: vi.fn(), share: vi.fn(), content: vi.fn(), invalidate: vi.fn(),
}));
vi.mock("@workspace/api-client-react", async (original) => ({
  ...await original(),
  useScanParentDocument: () => ({ mutateAsync: api.scan }),
  useSetParentDocumentSharing: () => ({ mutate: api.share }),
  getParentDocumentContent: (...args) => api.content(...args),
}));
vi.mock("@tanstack/react-query", async (original) => ({
  ...await original(), useQueryClient: () => ({ invalidateQueries: api.invalidate }),
}));
vi.mock("@/lib/parentSession", () => ({
  parentRequest: () => ({ headers: { "X-Test-Context": "fixture" } }),
}));
vi.mock("./UploadBox", () => ({
  default: ({ childId }) => <div data-testid="upload-child">{childId}</div>,
}));

const child = { id: "child-a", name: "Sam", clinicianId: "clinician-a" };
const doc = (changes = {}) => ({
  id: "doc-a", childId: "child-a", title: "Behavior Support Plan", fileName: "original-plan.txt",
  documentType: "treatment_plan", scanStatus: "scanned", scanError: null,
  uploadedBy: "parent", shared: false, reviewed: false, createdAt: "2026-10-18T12:00:00Z",
  ...changes,
});
const mount = (documents = [doc()], selectedChild = child) =>
  render(<DocsPanel child={selectedChild} documents={documents} />);
const details = (id = "doc-a") =>
  fireEvent.click(within(screen.getByTestId(`disclosure-document-details-${id}`)).getByRole("button"));
const clickAsync = async (id) => act(async () => { fireEvent.click(screen.getByTestId(id)); });
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
};
let openedPopup;

beforeEach(() => {
  vi.clearAllMocks();
  api.scan.mockReset().mockResolvedValue({});
  api.share.mockReset();
  api.invalidate.mockReset().mockResolvedValue(undefined);
  api.content.mockReset().mockResolvedValue(new Blob(["Synthetic document bytes"], { type: "text/plain" }));
  Object.defineProperty(URL, "createObjectURL", { configurable: true, writable: true, value: vi.fn(() => "blob:synthetic-fixture") });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, writable: true, value: vi.fn() });
  openedPopup = {
    close: vi.fn(),
    opener: window,
    document: { title: "" },
    location: { replace: vi.fn() },
  };
  vi.spyOn(window, "open").mockImplementation(() => openedPopup);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("Parent Document Center presentation and existing contracts", () => {
  it("preserves the empty state and scopes uploads to the selected child", () => {
    mount([]);
    expect(screen.getByTestId("text-no-documents").textContent).toContain("Your steps already work without one");
    expect(screen.getByTestId("upload-child").textContent).toBe("child-a");
    expect(screen.queryByTestId("input-doc-search")).toBeNull();
  });

  it("searches trimmed case-insensitive titles and original file names", () => {
    mount([doc(), doc({ id: "doc-b", title: "School IEP", fileName: "classroom-source.pdf" })]);
    fireEvent.change(screen.getByTestId("input-doc-search"), { target: { value: "  CLASSROOM  " } });
    expect(screen.queryByTestId("row-document-doc-a")).toBeNull();
    expect(screen.getByTestId("row-document-doc-b")).toBeTruthy();
    fireEvent.change(screen.getByTestId("input-doc-search"), { target: { value: "behavior" } });
    expect(screen.getByTestId("row-document-doc-a")).toBeTruthy();
    expect(screen.queryByTestId("row-document-doc-b")).toBeNull();
  });

  it("retains every derived category, combines it with search and resets with All", () => {
    mount([
      doc(), doc({ id: "safety", title: "Crisis safety", documentType: "other", fileName: "safety.txt" }),
      doc({ id: "school", title: "IEP", documentType: "other", fileName: "iep.pdf" }),
      doc({ id: "report", title: "Evaluation", documentType: "report", fileName: "evaluation.txt" }),
      doc({ id: "other", title: "Notes", documentType: "other", fileName: "notes.txt" }),
    ]);
    for (const category of ["Safety", "School", "Plans", "Reports", "Other"])
      expect(screen.getByTestId(`button-doc-category-${category}`)).toBeTruthy();
    fireEvent.click(screen.getByTestId("button-doc-category-School"));
    expect(screen.getByTestId("button-doc-category-School").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getAllByTestId(/^row-document-/)).toHaveLength(1);
    fireEvent.change(screen.getByTestId("input-doc-search"), { target: { value: "missing" } });
    expect(screen.getByTestId("text-no-doc-matches")).toBeTruthy();
    fireEvent.change(screen.getByTestId("input-doc-search"), { target: { value: "" } });
    fireEvent.click(screen.getByTestId("button-doc-category-all"));
    expect(screen.getAllByTestId(/^row-document-/)).toHaveLength(5);
  });

  it.each([
    ...["scanned", "complete", "completed", "done", "ready"].map((s) => [s, "Ready"]),
    ["failed", "Failed"], ["error", "Failed"], ["scanning", "Processing"],
    ["processing", "Processing"], ["pending", "Processing"],
    ["needs_review", "Needs Review"], ["needs-review", "Needs Review"], ["needs review", "Needs Review"],
  ])("shows a single compact status for %s", (scanStatus, label) => {
    mount([doc({ scanStatus })]);
    expect(screen.getByTestId("status-scan-doc-a").textContent).toBe(label);
    expect(processingStatus(doc({ scanStatus })).text).toBe(label);
    if (label === "Needs Review") {
      details();
      expect(screen.getByTestId("text-scan-detail-doc-a").textContent).toBe("Needs review");
    }
  });

  it("keeps an unclassified safety note visible even while details are closed", () => {
    const note = "Original safety note. Contact emergency services if there is immediate danger.";
    mount([doc({ scanError: note })]);
    expect(screen.getByTestId("status-scan-doc-a").textContent).toBe("Needs Review");
    const element = screen.getByTestId("text-scan-error-doc-a");
    expect(element.textContent).toBe(note);
    expect(element.closest("[hidden]")).toBeNull();
    expect(element.closest('[data-state="closed"]')).toBeNull();
  });

  it("shows a concise failed-scan summary and preserves the complete error in details", () => {
    const note = "Synthetic technical failure with all original diagnostic detail.";
    mount([doc({ scanStatus: "failed", scanError: note, uploadedBy: "clinician", reviewed: true })]);
    expect(screen.getByTestId("text-scan-error-summary-doc-a").textContent).toContain("could not be read");
    expect(screen.queryByText(note)).toBeNull();
    details();
    expect(screen.getByTestId("text-scan-error-doc-a").textContent).toBe(note);
    const metadata = screen.getByTestId("details-document-doc-a");
    for (const value of ["original-plan.txt", "treatment_plan", "Plans", "Clinician", "Sam", "Private to your account", "Clinician reviewed"])
      expect(within(metadata).getByText(value)).toBeTruthy();
    expect(screen.getByTestId("text-scan-detail-doc-a").textContent).toBe("Could not be read");
  });

  it("opens the authenticated PDF tab during the click, then loads the document into it", async () => {
    const pending = deferred();
    api.content.mockReturnValue(pending.promise);
    mount([doc({ fileName: "behavior-plan.pdf" })]);
    fireEvent.click(screen.getByTestId("button-view-doc-a"));

    expect(window.open).toHaveBeenCalledWith("about:blank", "_blank");
    expect(api.content).toHaveBeenCalledWith("doc-a", { headers: { "X-Test-Context": "fixture" }, responseType: "blob" });
    expect(window.open.mock.invocationCallOrder[0]).toBeLessThan(api.content.mock.invocationCallOrder[0]);
    expect(openedPopup.opener).toBeNull();
    expect(openedPopup.location.replace).not.toHaveBeenCalled();

    await act(async () => {
      pending.resolve(new Blob(["%PDF-1.7"], { type: "application/pdf" }));
      await pending.promise;
    });

    expect(URL.createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    expect(openedPopup.location.replace).toHaveBeenCalledWith("blob:synthetic-fixture");
  });

  it("downloads authenticated bytes with the original file name and removes the temporary link", async () => {
    const clicked = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function () {
      clicked.push({ name: this.download, url: this.href });
    });
    mount();
    await clickAsync("button-download-doc-a");
    expect(api.content).toHaveBeenCalledWith("doc-a", expect.objectContaining({ responseType: "blob", headers: { "X-Test-Context": "fixture" } }));
    expect(clicked).toEqual([{ name: "original-plan.txt", url: "blob:synthetic-fixture" }]);
    expect(document.querySelector("a[download]")).toBeNull();
  });

  it.each(["view", "download"])("shows denied %s errors without creating a public URL", async (action) => {
    api.content.mockRejectedValue(new Error("Synthetic forbidden access"));
    mount();
    await clickAsync(`button-${action}-doc-a`);
    expect(screen.getByText("Synthetic forbidden access")).toBeTruthy();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    if (action === "view") expect(openedPopup.close).toHaveBeenCalled();
    else expect(window.open).not.toHaveBeenCalled();
  });

  it("does not request document bytes if the browser blocks the viewer tab", async () => {
    window.open.mockReturnValue(null);
    mount([doc({ fileName: "behavior-plan.pdf" })]);
    await clickAsync("button-view-doc-a");
    expect(api.content).not.toHaveBeenCalled();
    expect(screen.getByText("Please allow pop-ups to view this document.")).toBeTruthy();
  });

  it("preserves read-only scan/share controls", () => {
    mount([doc({ canScan: false, canShare: false })]);
    expect(screen.queryByTestId("button-retry-scan-doc-a")).toBeNull();
    expect(screen.queryByTestId("button-share-doc-a")).toBeNull();
    expect(screen.getByTestId("button-view-doc-a")).toBeTruthy();
    expect(screen.getByTestId("button-download-doc-a")).toBeTruthy();
  });

  it("keeps private sharing disabled without a connected clinic", () => {
    mount([doc()], { ...child, clinicianId: null });
    expect(screen.getByTestId("button-share-doc-a").disabled).toBe(true);
    expect(screen.getByText("Sharing opens once you connect a clinic.")).toBeTruthy();
  });

  it.each([false, true])("preserves sharing payload and allows stopping existing sharing (%s)", (shared) => {
    mount([doc({ shared })], { ...child, clinicianId: shared ? null : "clinician-a" });
    fireEvent.click(screen.getByTestId("button-share-doc-a"));
    expect(api.share.mock.calls[0][0]).toEqual({ childId: "child-a", documentId: "doc-a", data: { shared: !shared } });
    expect(screen.getByTestId("button-share-doc-a").disabled).toBe(true);
    act(() => api.share.mock.calls[0][1].onSettled());
    expect(api.invalidate).toHaveBeenCalled();
  });

  it("retries only the chosen document for the selected child", async () => {
    mount([doc(), doc({ id: "doc-b", scanStatus: "failed" })]);
    await clickAsync("button-retry-scan-doc-b");
    expect(api.scan.mock.calls.map(([value]) => value)).toEqual([
      { childId: "child-a", documentId: "doc-b" },
    ]);
    expect(screen.getByTestId("text-read-batch-status").textContent).toContain("1 of 1 plans read");
  });

  it("keeps batch scans sequential", async () => {
    const first = deferred();
    api.scan.mockImplementationOnce(() => first.promise).mockResolvedValueOnce({});
    mount([doc(), doc({ id: "doc-b", title: "School IEP" })]);
    fireEvent.click(screen.getByTestId("button-read-all-plans"));
    expect(api.scan).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("button-retry-scan-doc-a").disabled).toBe(true);
    await act(async () => { first.resolve({}); });
    expect(api.scan.mock.calls.map(([value]) => value)).toEqual([
      { childId: "child-a", documentId: "doc-a" }, { childId: "child-a", documentId: "doc-b" },
    ]);
    expect(screen.getByTestId("text-read-batch-status").textContent).toContain("2 of 2 plans read");
    expect(api.invalidate).toHaveBeenCalled();
  });

  it("retains failed-scan errors while continuing the remaining batch", async () => {
    api.scan.mockRejectedValueOnce(new Error("Synthetic unreadable first file")).mockResolvedValueOnce({});
    mount([doc(), doc({ id: "doc-b" })]);
    await clickAsync("button-read-all-plans");
    expect(api.scan).toHaveBeenCalledTimes(2);
    expect(screen.getByText("Synthetic unreadable first file")).toBeTruthy();
    expect(screen.getByTestId("text-read-batch-status").textContent).toContain("1 of 2 plans read. 1 need attention");
  });

  it("stops queued scans when the selected child changes", async () => {
    const first = deferred();
    api.scan.mockImplementationOnce(() => first.promise);
    const view = mount([doc(), doc({ id: "doc-b" })]);
    fireEvent.click(screen.getByTestId("button-read-all-plans"));
    view.rerender(<DocsPanel child={{ ...child, id: "child-b", name: "River" }} documents={[]} />);
    await act(async () => { first.resolve({}); });
    expect(api.scan).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("upload-child").textContent).toBe("child-b");
  });
});
