import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import ClinicianDocuments from "./ClinicianDocuments";

const api = vi.hoisted(() => ({
  me: vi.fn(), children: vi.fn(), documents: vi.fn(), remove: vi.fn(), invoke: vi.fn(),
}));
vi.mock("@/api/entities", () => ({
  base44: {
    auth: { me: api.me },
    entities: { Child: { filter: api.children }, Document: { filter: api.documents, delete: api.remove } },
    functions: { invoke: api.invoke },
  },
}));
beforeEach(() => {
  api.me.mockResolvedValue({ id: "clinician" });
  api.children.mockResolvedValue([{ id: "child", child_name: "Synthetic child" }]);
  api.documents.mockResolvedValue([{ id: "doc", child_id: "child", title: "Synthetic plan", scan_status: "done", uploaded_by: "clinician" }]);
  api.invoke.mockResolvedValue({ data: { documentExtractions: [] } });
  api.remove.mockResolvedValue({ ok: true });
});
afterEach(cleanup);
const mount = () => render(<MemoryRouter><ClinicianDocuments /></MemoryRouter>);

describe("clinician document deletion", () => {
  it("requires confirmation and keeps the source when deletion is cancelled", async () => {
    mount();
    fireEvent.click(await screen.findByTestId("button-delete-document-doc"));
    expect(api.remove).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Keep document" }));
    expect(screen.getByTestId("button-delete-document-doc")).toBeTruthy();
    expect(api.remove).not.toHaveBeenCalled();
  });
  it("removes the document only after the server confirms deletion", async () => {
    mount();
    fireEvent.click(await screen.findByTestId("button-delete-document-doc"));
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Delete document" }));
    await waitFor(() => expect(api.remove).toHaveBeenCalledWith("doc"));
    await waitFor(() => expect(screen.queryByTestId("button-delete-document-doc")).toBeNull());
  });
  it("keeps the document and shows an actionable error if the server denies deletion", async () => {
    api.remove.mockRejectedValueOnce(new Error('API error 409: {"error":"Only the parent can delete this document."}'));
    mount();
    fireEvent.click(await screen.findByTestId("button-delete-document-doc"));
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Delete document" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Only the parent can delete this document.");
    expect(screen.getByTestId("button-delete-document-doc")).toBeTruthy();
  });

  it("does not offer clinician deletion for a parent-uploaded document", async () => {
    api.documents.mockResolvedValueOnce([{
      id: "parent-doc", child_id: "child", title: "Family plan", scan_status: "done", uploaded_by: "parent",
    }]);
    mount();
    expect(await screen.findByText("Family plan")).toBeTruthy();
    expect(screen.queryByTestId("button-delete-document-parent-doc")).toBeNull();
  });

  it("allows deletion of a family upload attached to the clinician's client", async () => {
    api.documents.mockResolvedValueOnce([{
      id: "family-doc",
      child_id: "child",
      clinician_id: "clinician",
      title: "Family upload",
      scan_status: "done",
      uploaded_by: "client:child",
    }]);
    mount();
    expect(await screen.findByText("Family upload")).toBeTruthy();
    expect(screen.getByTestId("button-delete-document-family-doc")).toBeTruthy();
  });
});
