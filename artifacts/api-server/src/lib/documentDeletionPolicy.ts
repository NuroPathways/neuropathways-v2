type ClinicianDocument = {
  uploadedBy?: string | null;
};

type ParentDocumentMetadata = Record<string, unknown> | null | undefined;

export function clinicianMayDeleteUploadedDocument(
  document: ClinicianDocument | null | undefined,
  clinicianId: string | null | undefined,
  parentMetadata?: ParentDocumentMetadata,
): boolean {
  return Boolean(
    clinicianId &&
    !parentMetadata &&
    document?.uploadedBy === clinicianId,
  );
}
