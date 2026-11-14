import { clinicianCanAccessChild } from "./clinicAuthorization";

type CaregiverShareableProfile = {
  sourceDocIds?: unknown;
  caregiverShareApprovedBy?: unknown;
  caregiverShareApprovedAt?: unknown;
};

function hasValidApprovalTimestamp(value: unknown): boolean {
  if (value instanceof Date) return Number.isFinite(value.getTime());
  if (typeof value !== "string") return false;
  return Number.isFinite(Date.parse(value));
}

/**
 * A profile can be shared when every reliable linked source is caregiver-visible,
 * or when an actively authorized clinician explicitly approved the derived fields.
 * A source link never changes the visibility of the linked document itself.
 */
export async function isClientProfileVisibleToCaregiver(
  profile: CaregiverShareableProfile | null | undefined,
  childId: string,
  visibleDocumentIds: Iterable<string>,
): Promise<boolean> {
  if (!profile) return false;
  const visibleIds = new Set(visibleDocumentIds);
  const sourceValue = profile.sourceDocIds;
  if (Array.isArray(sourceValue) &&
      sourceValue.length > 0 &&
      sourceValue.every((id) => typeof id === "string" && id.length > 0) &&
      sourceValue.every((id) => visibleIds.has(id))) {
    return true;
  }

  const approverId = profile.caregiverShareApprovedBy;
  if (typeof approverId !== "string" ||
      approverId.length === 0 ||
      !hasValidApprovalTimestamp(profile.caregiverShareApprovedAt)) {
    return false;
  }
  return clinicianCanAccessChild(approverId, childId);
}

/** Do not expose source IDs or clinician approval identifiers to caregivers. */
export function projectClientProfileForCaregiver<T extends object>(
  profile: T,
): Omit<T, "sourceDocIds" | "caregiverShareApprovedBy" | "caregiverShareApprovedAt"> {
  const {
    sourceDocIds: _sourceDocIds,
    caregiverShareApprovedBy: _caregiverShareApprovedBy,
    caregiverShareApprovedAt: _caregiverShareApprovedAt,
    ...caregiverProfile
  } = profile as T & Record<string, unknown>;
  return caregiverProfile as Omit<T, "sourceDocIds" | "caregiverShareApprovedBy" | "caregiverShareApprovedAt">;
}
