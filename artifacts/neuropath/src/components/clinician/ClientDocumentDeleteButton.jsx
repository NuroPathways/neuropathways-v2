import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@workspace/neuropathways-foundations/components/ui/button";
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@workspace/neuropathways-foundations/components/ui/alert-dialog";

export function canDeleteClientDocument(doc, user) {
  const clientId = user?.child_id || user?.childId || user?.id;
  const uploadedBy = doc?.uploaded_by ?? doc?.uploadedBy;
  return Boolean(user?.invite_token && clientId && uploadedBy === `client:${clientId}`);
}

export default function ClientDocumentDeleteButton({ doc, user, onDelete }) {
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  if (!canDeleteClientDocument(doc, user)) return null;

  const confirmDelete = async () => {
    if (deleting) return;
    setDeleting(true);
    setError("");
    try {
      await onDelete(doc);
      setOpen(false);
    } catch (deleteError) {
      setError(deleteError?.message || "The document could not be deleted. It is still in your account.");
    } finally {
      setDeleting(false);
    }
  };

  const title = doc.title || doc.file_name || doc.fileName || "document";
  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="shrink-0 text-destructive"
        aria-label={`Delete document ${title}`}
        data-testid={`button-delete-client-document-${doc.id}`}
        onClick={() => { setError(""); setOpen(true); }}
      >
        <Trash2 aria-hidden="true" className="h-4 w-4" />
        Delete
      </Button>
      <AlertDialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen && !deleting) setOpen(false); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this document?</AlertDialogTitle>
            <AlertDialogDescription>
              Remove {title} and its uploaded file from your account. Goals or support information already created from it will remain.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Keep document</AlertDialogCancel>
            <Button variant="destructive" disabled={deleting} onClick={() => void confirmDelete()} data-testid="button-confirm-delete-client-document">
              {deleting ? "Deleting…" : "Delete document"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
