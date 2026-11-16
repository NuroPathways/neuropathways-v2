export const PLATFORM_ADMIN_BOOTSTRAP_CONFIRMATION = "BOOTSTRAP-ONE-PLATFORM-ADMIN";

export function parsePlatformAdminBootstrapInput(
  args: string[],
  env: Record<string, string | undefined>,
): { userId: string; approvalReference: string } {
  const arg = (name: string) => args.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3);
  const userId = arg("user-id");
  const approvalReference = arg("approval-reference");
  if (
    env.NP_ALLOW_PLATFORM_ADMIN_BOOTSTRAP !== "approved" ||
    arg("confirm") !== PLATFORM_ADMIN_BOOTSTRAP_CONFIRMATION ||
    !userId ||
    !approvalReference ||
    !/^[A-Za-z0-9._:-]{3,128}$/.test(approvalReference)
  ) {
    throw new Error("Bootstrap refused. An operator must supply an explicit user ID, approval reference, confirmation phrase, and NP_ALLOW_PLATFORM_ADMIN_BOOTSTRAP=approved.");
  }
  return { userId, approvalReference };
}
