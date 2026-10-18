import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ChatPanel from "./ChatPanel";

const api = vi.hoisted(() => ({ mutate: vi.fn(), pending: false, options: null }));
vi.mock("@workspace/api-client-react", () => ({
  useParentChat: (options) => {
    api.options = options;
    return { mutate: api.mutate, isPending: api.pending };
  },
}));
vi.mock("@/lib/parentSession", () => ({
  parentRequest: () => ({ headers: { "X-Test-Context": "fixture" } }),
}));

const refs = [
  { documentId: "doc-a", title: "Saved plan A", excerpt: "Original source excerpt A." },
  { documentId: "doc-b", title: "Saved plan B", excerpt: "Original source excerpt B." },
];
const reviewed = (ids) => [{ source: "clinician_reviewed", reviewedBy: "fixture-clinician", sourceDocumentIds: ids }];
const mount = (props = {}) => render(<ChatPanel childId="child-a" childName="Sam" {...props} />);
function submit(message = "A synthetic verification question") {
  fireEvent.change(screen.getByTestId("input-chat"), { target: { value: message } });
  fireEvent.submit(screen.getByTestId("button-send-chat").closest("form"));
}
function answer(data = {}) {
  act(() => api.mutate.mock.calls.at(-1)[1].onSuccess({
    answer: "Original saved answer.", sourceReferences: [], disclaimer: null, ...data,
  }));
}
beforeEach(() => {
  api.pending = false;
  Object.defineProperty(Element.prototype, "scrollIntoView", { configurable: true, writable: true, value: vi.fn() });
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("Parent Chat presentation preserves its contracts", () => {
  it("sends trimmed text with the selected child and preserves the local-day header", () => {
    mount();
    submit("  Keep this exact question.  ");
    expect(api.mutate.mock.calls[0][0]).toEqual({ childId: "child-a", data: { message: "Keep this exact question." } });
    const today = new Date();
    const localDay = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    expect(api.options.request.headers.get("X-Parent-Local-Date")).toBe(localDay);
    expect(api.options.request.headers.get("X-Test-Context")).toBe("fixture");
    expect(screen.getByTestId("input-chat").value).toBe("");
    expect(screen.getByTestId("bubble-me-0").textContent).toContain("Keep this exact question.");
    expect(screen.getByTestId("bubble-me-0").textContent).not.toContain("reviewed by a clinician");
  });

  it("does not submit whitespace or submit again while a request is pending", () => {
    const view = mount();
    submit("   ");
    expect(api.mutate).not.toHaveBeenCalled();
    submit();
    api.pending = true;
    view.rerender(<ChatPanel childId="child-a" childName="Sam" />);
    submit("Another question");
    expect(api.mutate).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("button-send-chat").disabled).toBe(true);
  });

  it("restores the failed question and removes its optimistic bubble on an error", () => {
    mount(); submit("Keep my failed draft.");
    act(() => api.mutate.mock.calls[0][1].onError(new Error("Synthetic request failed")));
    expect(screen.getByText("Synthetic request failed")).toBeTruthy();
    expect(screen.getByTestId("input-chat").value).toBe("Keep my failed draft.");
    expect(screen.queryByTestId("bubble-me-0")).toBeNull();
  });

  it("clears a settled conversation and errors when the selected child changes", () => {
    const view = mount(); submit(); answer();
    expect(screen.getByTestId("bubble-ai-1")).toBeTruthy();
    view.rerender(<ChatPanel childId="child-b" childName="River" />);
    expect(screen.queryByTestId("bubble-ai-1")).toBeNull();
    submit();
    expect(api.mutate.mock.calls.at(-1)[0].childId).toBe("child-b");
  });

  it("keeps emergency guidance and returned safety disclaimers outside collapsed content", () => {
    mount();
    const emergency = screen.getByText(/If there is immediate danger/);
    expect(emergency.textContent).toContain("911");
    expect(emergency.closest('[data-state="closed"]')).toBeNull();
    submit(); answer({ disclaimer: "Urgent safety notice: call emergency services now." });
    const disclaimer = screen.getByText("Urgent safety notice: call emergency services now.");
    expect(disclaimer.closest('[data-state="closed"]')).toBeNull();
    expect(disclaimer.closest("[hidden]")).toBeNull();
  });

  it("keeps all citation titles, identifiers and excerpts accessible in Sources", () => {
    mount(); submit(); answer({ sourceReferences: refs });
    const toggle = screen.getByRole("button", { name: /Sources \(2\)/i });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(toggle);
    for (const ref of refs) {
      expect(screen.getByText(ref.title)).toBeTruthy();
      expect(screen.getByText(ref.excerpt)).toBeTruthy();
      expect(screen.getByText(new RegExp(ref.documentId))).toBeTruthy();
    }
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
  });

  it.each([
    ["no references", [], [], true],
    ["unreviewed sources", refs, [], true],
    ["partly reviewed sources", refs, reviewed(["doc-a"]), true],
    ["all sources reviewed", refs, reviewed(["doc-a", "doc-b"]), false],
    ["review flag missing", refs, [{ source: "clinician_reviewed", sourceDocumentIds: ["doc-a", "doc-b"] }], true],
  ])("preserves clinician-review provenance for %s", (_label, sourceReferences, cards, warning) => {
    mount({ cards }); submit(); answer({ sourceReferences });
    const bubble = screen.getByTestId("bubble-ai-1");
    expect(within(bubble).queryByTestId("text-unreviewed") !== null).toBe(warning);
  });

  it("renders the original markdown headings, paragraphs and numbered steps without rewriting", () => {
    mount(); submit();
    answer({ answer: "## Original heading\n\nOriginal paragraph.\n\n1. First saved step.\n2. Second saved step." });
    const bubble = screen.getByTestId("bubble-ai-1");
    expect(within(bubble).getByRole("heading", { name: "Original heading" })).toBeTruthy();
    expect(within(bubble).getByText("Original paragraph.")).toBeTruthy();
    expect(within(bubble).getByRole("list").tagName).toBe("OL");
    expect(within(bubble).getAllByRole("listitem").map((item) => item.textContent))
      .toEqual(["First saved step.", "Second saved step."]);
  });
});
