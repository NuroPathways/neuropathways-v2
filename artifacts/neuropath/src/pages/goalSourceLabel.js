export function goalSourceLabel(goal) {
  const source = goal?.source ?? goal?.source_type;
  if (source !== "document" && source !== "parent_document") return null;

  const status = goal?.sourceStatus ?? goal?.source_status;
  const origin = source === "parent_document"
    ? "Self-uploaded document"
    : "Clinician-uploaded document";
  if (status === "available") return origin;
  return `${origin} · ${status === "unavailable" ? "source unavailable" : "source not linked"}`;
}
