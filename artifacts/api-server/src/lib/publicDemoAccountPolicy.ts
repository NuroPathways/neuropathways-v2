import { matchesBlockedIdentifier } from "./securityPolicies";

// These hashes identify demo logins that were previously included in the public
// login UI. Keeping only hashes prevents their identifiers from being bundled
// into the public client while denying both new logins and existing sessions.
const DISABLED_DEMO_CLINICIAN_EMAIL_HASHES = [
  "e411fe8034b44414f768bf3617615be78b028e330f41cde666bf75472df11011",
];

const DISABLED_DEMO_CLIENT_USERNAME_HASHES = [
  "895a6dce8e09600984017711f7adf979547482a2ce86c845e04b46b78d6ae963",
  "8eb1cb785580539ac795b6a91c6adb4d2944c57934c1872703d8dbfaa4bff134",
  "3ce83060b1ce2b0d4d2b87b7776b4012d7e5709e78aedb6e250ac7a41d25869b",
  "e95b695b3a38b051ca2cef6f9b3119adc408b7499ae8b2c77bc184b8c9415abd",
];

export function isDisabledPublicDemoClinicianEmail(value: unknown): boolean {
  return matchesBlockedIdentifier(value, DISABLED_DEMO_CLINICIAN_EMAIL_HASHES);
}

export function isDisabledPublicDemoClientUsername(value: unknown): boolean {
  return matchesBlockedIdentifier(value, DISABLED_DEMO_CLIENT_USERNAME_HASHES);
}
