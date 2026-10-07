export const ACCOUNT_AUTHORITY_CONSENT_VERSION = "1.0";

export const accountHolderTypes = [
  "parent_guardian",
  "clinician",
  "adult_client",
  "teen_client_with_permission",
] as const;

export type AccountHolderType = typeof accountHolderTypes[number];
export type AccountHolderAgeGroup = "under_13" | "13_17" | "18_plus";

export function validateAccountAuthority(
  body: Record<string, unknown>,
  expectedAccountHolderType: AccountHolderType,
  requiresParentAuthority = false,
): { ok: true; ageGroup: AccountHolderAgeGroup } | { ok: false; error: string } {
  const ageGroup = body.accountHolderAgeGroup;
  if (ageGroup === "under_13") {
    return {
      ok: false,
      error: "A parent or guardian must create this account. NeuroPathways does not allow children under 13 to create their own accounts.",
    };
  }
  if (body.accountHolderType !== expectedAccountHolderType) {
    return { ok: false, error: "Choose the account type for this signup." };
  }
  if (ageGroup !== "13_17" && ageGroup !== "18_plus") {
    return { ok: false, error: "Select your age group before creating an account." };
  }
  if (body.adultOrGuardianConfirmed !== true) {
    return { ok: false, error: "Confirm that you are 18 or older or have parent/guardian permission." };
  }
  if (requiresParentAuthority && body.parentGuardianAuthorityConfirmed !== true) {
    return { ok: false, error: "Confirm that you are the parent, guardian, or authorized caregiver for child profiles you create." };
  }
  return { ok: true, ageGroup };
}

export function accountAuthorityEvent(
  accountHolderType: AccountHolderType,
  ageGroup: AccountHolderAgeGroup,
  parentGuardianAuthorityConfirmed: boolean,
  childProfileCreatedByAdult: boolean,
) {
  return {
    eventType: "ACCOUNT_HOLDER_AUTHORITY_CONFIRMED",
    policyType: "account_holder_authority",
    version: ACCOUNT_AUTHORITY_CONSENT_VERSION,
    acceptanceMethod: "signup_checkbox",
    source: "signup",
    actorType: "user",
    metadata: {
      account_holder_type: accountHolderType,
      account_holder_age_group: ageGroup,
      adult_or_guardian_confirmed: true,
      parent_guardian_authority_confirmed: parentGuardianAuthorityConfirmed,
      child_profile_created_by_adult: childProfileCreatedByAdult,
    },
  } as const;
}

export function accountAuthorityInvalidStatus(error: string): 400 | 403 {
  return error.startsWith("A parent or guardian must create this account") ? 403 : 400;
}
