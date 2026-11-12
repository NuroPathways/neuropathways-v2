export type GoalSourceStatus = "available" | "unavailable" | "unknown";

export function goalSourceAvailability(
  source: string | null | undefined,
  sourceDocumentId: unknown,
  visibleDocumentIds: ReadonlySet<string>,
): { sourceStatus: GoalSourceStatus | null; sourceDocumentId: string | null } {
  const isDocumentGoal = source === "document" || source === "parent_document";
  if (!isDocumentGoal) {
    return { sourceStatus: null, sourceDocumentId: null };
  }

  const storedId = typeof sourceDocumentId === "string" && sourceDocumentId.length > 0
    ? sourceDocumentId
    : null;
  const sourceStatus = !storedId
    ? "unknown"
    : visibleDocumentIds.has(storedId)
      ? "available"
      : "unavailable";

  return {
    sourceStatus,
    sourceDocumentId: sourceStatus === "available" ? storedId : null,
  };
}
