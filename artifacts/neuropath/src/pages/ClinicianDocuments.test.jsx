import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import ClinicianDocuments from "./ClinicianDocuments";

const api = vi.hoisted(() => ({
  me: vi.fn(), children: vi.fn(), documents: vi.fn(), profiles: vi.fn(), remove: vi.fn(), invoke: vi.fn(),
}));
vi.mock("@/api/entities", () => ({
  base44: {
    auth: { me: api.me },
    entities: {
      Child: { filter: api.children },
      Document: { filter: api.documents, delete: api.remove },
      ClientProfile: { filter: api.profiles },
    },
    functions: { invoke: api.invoke },
  },
}));
beforeEach(() => {
  api.me.mockResolvedValue({ id: "clinician" });
  api.children.mockResolvedValue([{ id: "child", child_name: "Synthetic child" }]);
  api.documents.mockResolvedValue([{ id: "doc", child_id: "child", title: "Synthetic plan", scan_status: "done", uploaded_by: "clinician" }]);
  api.profiles.mockResolvedValue([]);
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

  it("does not allow deletion of a family upload attached to the clinician's client", async () => {
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
    expect(screen.queryByTestId("button-delete-document-family-doc")).toBeNull();
  });

  it("requires explicit review before a source-less profile can be shared with caregivers", async () => {
    const profile = {
      id: "legacy-profile",
      child_id: "child",
      source_doc_ids: null,
      strengths: "A fictional strength to review.",
      caregiver_share_approved_by: null,
      caregiver_share_approved_at: null,
    };
    api.profiles.mockResolvedValueOnce([profile]);
    api.invoke.mockImplementation(async (action, args) => {
      if (action === "manageClientRecord" && args.action === "setClientProfileCaregiverSharing") {
        return {
          data: {
            record: {
              ...profile,
              caregiverShareApprovedBy: args.data.approved ? "clinician" : null,
              caregiverShareApprovedAt: args.data.approved ? new Date("2026-11-14T12:00:00Z") : null,
            },
          },
        };
      }
      return { data: { documentExtractions: [] } };
    });
    mount();

    expect(await screen.findByText("A fictional strength to review.")).toBeTruthy();
    const approve = await screen.findByTestId("button-approve-profile-sharing-legacy-profile");
    expect(approve.disabled).toBe(true);
    fireEvent.click(screen.getByTestId("checkbox-profile-sharing-legacy-profile"));
    expect(approve.disabled).toBe(false);
    fireEvent.click(approve);
    await waitFor(() => expect(api.invoke).toHaveBeenCalledWith("manageClientRecord", {
      action: "setClientProfileCaregiverSharing",
      entity_id: "legacy-profile",
      data: { approved: true },
    }));
    expect(await screen.findByTestId("profile-sharing-approved-legacy-profile")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Stop caregiver sharing" }));
    await waitFor(() => expect(api.invoke).toHaveBeenCalledWith("manageClientRecord", {
      action: "setClientProfileCaregiverSharing",
      entity_id: "legacy-profile",
      data: { approved: false },
    }));
  });

  it("does not show a legacy approval prompt when a reliable source link exists", async () => {
    api.profiles.mockResolvedValueOnce([{
      id: "linked-profile",
      child_id: "child",
      source_doc_ids: ["doc"],
      strengths: "Linked profile data.",
    }]);
    mount();
    expect(await screen.findByText("Synthetic plan")).toBeTruthy();
    expect(screen.queryByTestId("legacy-profile-sharing-review-linked-profile")).toBeNull();
  });
});
