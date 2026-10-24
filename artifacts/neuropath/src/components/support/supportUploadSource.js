function uploaderType(document, clinicianId) {
  const uploader = String(document?.uploadedBy ?? document?.uploaded_by ?? "").trim().toLowerCase();
  const clinician = String(clinicianId ?? "").trim().toLowerCase();

  if (
    uploader === "parent"
    || uploader === "client"
    || uploader.startsWith("parent:")
    || uploader.startsWith("client:")
  ) {
    return "client";
  }
  if (
    uploader === "clinician"
    || uploader.startsWith("clinician:")
    || (clinician && uploader === clinician)
  ) {
    return "clinician";
  }
  return null;
}

export function supportUploadSourceLabel(documents, documentIds, clinicianId, fallback = "Upload source unavailable") {
  const ids = new Set(Array.isArray(documentIds) ? documentIds.map(String) : []);
  const sources = new Set(
    (Array.isArray(documents) ? documents : [])
      .filter((document) => ids.has(String(document?.id ?? "")))
      .map((document) => uploaderType(document, clinicianId))
      .filter(Boolean),
  );

  if (sources.size === 1) {
    return sources.has("client") ? "Client-uploaded" : "Clinician-uploaded";
  }
  if (sources.size > 1) return "Client- and clinician-uploaded";
  return fallback;
}

export function supportSourceDocumentIds(value, fallback = []) {
  for (const candidate of [
    value?.sourceDocumentIds,
    value?.source_document_ids,
    value?.sourceDocIds,
    value?.source_doc_ids,
  ]) {
    if (Array.isArray(candidate) && candidate.length > 0) return candidate;
  }
  return Array.isArray(fallback) ? fallback : [];
}
