import assert from "node:assert/strict";
import { test } from "node:test";
import {
  canAccessClinicalRecord,
  canManageClinic,
  isPlatformAdministrator,
  resolveClinicIdForTenant,
  resolveLegacyClinicId,
  type ClinicMembershipGrant,
  type ClinicalAssignmentGrant,
} from "./clinicAccessPolicy";

const clinics = {
  alpha: "clinic-alpha-stable-id",
  beta: "clinic-beta-stable-id",
} as const;

const memberships: ClinicMembershipGrant[] = [
  { clinicId: clinics.alpha, userId: "admin-alpha", role: "clinic_admin", status: "active" },
  { clinicId: clinics.alpha, userId: "clinician-alpha", role: "treating_clinician", status: "active" },
  { clinicId: clinics.alpha, userId: "supervisor-alpha", role: "clinical_supervisor", status: "active" },
  { clinicId: clinics.alpha, userId: "pending-alpha", role: "treating_clinician", status: "pending" },
  { clinicId: clinics.beta, userId: "clinician-beta", role: "treating_clinician", status: "active" },
];

const assignments: ClinicalAssignmentGrant[] = [
  { clinicId: clinics.alpha, clientId: "client-alpha", userId: "clinician-alpha", role: "treating_clinician", status: "active" },
  { clinicId: clinics.alpha, clientId: "client-alpha", userId: "supervisor-alpha", role: "clinical_supervisor", status: "active" },
  { clinicId: clinics.beta, clientId: "client-beta", userId: "clinician-beta", role: "treating_clinician", status: "active" },
];

function canRead(input: {
  userId: string;
  clinicId: string;
  clientId: string;
  recordClinicId: string | null;
    clinicStatus?: string;
}) {
  return canAccessClinicalRecord({
    ...input,
      clinicStatus: input.clinicStatus ?? "active",
    memberships,
    assignments,
  });
}

test("two clinic identities keep clinician assignments isolated", () => {
  assert.equal(canRead({
    userId: "clinician-alpha",
    clinicId: clinics.alpha,
    clientId: "client-alpha",
    recordClinicId: clinics.alpha,
  }), true);

  assert.equal(canRead({
    userId: "clinician-alpha",
    clinicId: clinics.alpha,
    clientId: "client-beta",
    recordClinicId: clinics.beta,
  }), false);

  assert.equal(canRead({
    userId: "clinician-beta",
    clinicId: clinics.beta,
    clientId: "client-beta",
    recordClinicId: clinics.beta,
  }), true);
});

test("administrative and platform roles do not grant chart access", () => {
  assert.equal(canManageClinic("admin-alpha", clinics.alpha, memberships), true);
  assert.equal(canManageClinic("admin-alpha", clinics.beta, memberships), false);
  assert.equal(isPlatformAdministrator("platform-operator", [
    { userId: "platform-operator", status: "active" },
  ]), true);

  assert.equal(canRead({
    userId: "admin-alpha",
    clinicId: clinics.alpha,
    clientId: "client-alpha",
    recordClinicId: clinics.alpha,
  }), false);
  assert.equal(canRead({
    userId: "platform-operator",
    clinicId: clinics.alpha,
    clientId: "client-alpha",
    recordClinicId: clinics.alpha,
  }), false);
});

test("supervisors need an explicit active case assignment and pending staff stay blocked", () => {
  assert.equal(canRead({
    userId: "supervisor-alpha",
    clinicId: clinics.alpha,
    clientId: "client-alpha",
    recordClinicId: clinics.alpha,
  }), true);
  assert.equal(canRead({
    userId: "supervisor-alpha",
    clinicId: clinics.alpha,
    clientId: "client-beta",
    recordClinicId: clinics.beta,
  }), false);
  assert.equal(canRead({
    userId: "pending-alpha",
    clinicId: clinics.alpha,
    clientId: "client-alpha",
    recordClinicId: clinics.alpha,
  }), false);
});

test("legacy direct clinician assignments remain scoped to their tenant", () => {
  assert.equal(resolveLegacyClinicId("legacy-clinic", "old-clinician"), "legacy-clinic");
  assert.equal(resolveLegacyClinicId(null, "old-clinician"), "old-clinician");
  assert.equal(resolveLegacyClinicId(null, null), null);

  const clinicRows = [
    { id: clinics.alpha, legacyTenantId: "legacy-tenant-alpha" },
    { id: clinics.beta, legacyTenantId: null },
  ];
  assert.equal(resolveClinicIdForTenant("legacy-tenant-alpha", clinicRows), clinics.alpha);
  assert.equal(resolveClinicIdForTenant(clinics.beta, clinicRows), clinics.beta);
  assert.equal(resolveClinicIdForTenant("unmapped-legacy-tenant", clinicRows), "unmapped-legacy-tenant");

  const base = {
    userId: "old-clinician",
    clinicId: clinics.alpha,
    clientId: "legacy-client",
    recordClinicId: clinics.alpha,
    clinicStatus: "active",
    memberships: [],
    assignments: [],
    legacy: {
      profileRole: "clinician",
      profileTenantId: "legacy-tenant-alpha",
      recordTenantId: "legacy-tenant-alpha",
      recordClinicianId: "old-clinician",
      canonicalClinicId: resolveClinicIdForTenant("legacy-tenant-alpha", clinicRows),
    },
  };
  assert.equal(canAccessClinicalRecord(base), true);
  assert.equal(canAccessClinicalRecord({
    ...base,
    recordClinicId: clinics.beta,
  }), false);
  assert.equal(canAccessClinicalRecord({
    ...base,
    clinicStatus: "suspended",
  }), false);
  assert.equal(canAccessClinicalRecord({
    ...base,
    legacy: { ...base.legacy, recordClinicianId: "someone-else" },
  }), false);
});
