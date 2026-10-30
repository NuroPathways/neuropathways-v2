import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import ClientDocumentDeleteButton from "./ClientDocumentDeleteButton";

afterEach(cleanup);

const user = { id: "client-1", invite_token: "synthetic-session" };
const ownDocument = { id: "doc-1", title: "My plan", uploaded_by: "client:client-1" };

describe("client document delete action", () => {
  it("only appears for documents uploaded by the signed-in client", () => {
    const onDelete = vi.fn();
    const { rerender } = render(<ClientDocumentDeleteButton doc={ownDocument} user={user} onDelete={onDelete} />);
    expect(screen.getByTestId("button-delete-client-document-doc-1")).toBeTruthy();

    rerender(<ClientDocumentDeleteButton doc={{ ...ownDocument, uploaded_by: "clinician-1" }} user={user} onDelete={onDelete} />);
    expect(screen.queryByTestId("button-delete-client-document-doc-1")).toBeNull();
  });

  it("waits for confirmation and closes only after deletion succeeds", async () => {
    const onDelete = vi.fn().mockResolvedValue(undefined);
    render(<ClientDocumentDeleteButton doc={ownDocument} user={user} onDelete={onDelete} />);

    fireEvent.click(screen.getByTestId("button-delete-client-document-doc-1"));
    expect(onDelete).not.toHaveBeenCalled();
    const dialog = screen.getByRole("alertdialog");
    expect(dialog.textContent).toContain("Goals or support information already created from it will remain.");
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete document" }));
    await waitFor(() => expect(onDelete).toHaveBeenCalledWith(ownDocument));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
  });

  it("keeps the confirmation open and shows the server error when deletion fails", async () => {
    const onDelete = vi.fn().mockRejectedValue(new Error("This client cannot delete a clinician document."));
    render(<ClientDocumentDeleteButton doc={ownDocument} user={user} onDelete={onDelete} />);

    fireEvent.click(screen.getByTestId("button-delete-client-document-doc-1"));
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Delete document" }));
    expect((await screen.findByRole("alert")).textContent).toContain("cannot delete a clinician document");
    expect(screen.getByRole("alertdialog")).toBeTruthy();
  });
});
