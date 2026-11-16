import { and, eq, isNull, sql } from "drizzle-orm";
import {
  db,
  platformAdministratorGrantsTable,
  usersTable,
  userProfilesTable,
} from "@workspace/db";
import { writeAuditEvent } from "../lib/auditEvents";
import { parsePlatformAdminBootstrapInput } from "../lib/platformAdminBootstrap";

async function main() {
  const { userId, approvalReference } = parsePlatformAdminBootstrapInput(process.argv, process.env);
  if (!process.env.DATABASE_URL) {
    throw new Error("Bootstrap refused because the database is not configured.");
  }

  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('np_platform_admin_first_bootstrap'))`);
    const [user] = await tx.select({
      id: usersTable.id,
      emailVerified: usersTable.emailVerified,
    }).from(usersTable).where(eq(usersTable.id, userId));
    const [profile] = await tx.select({
      appRole: userProfilesTable.appRole,
      accountType: userProfilesTable.accountType,
    }).from(userProfilesTable).where(eq(userProfilesTable.id, userId));
    const [existingGrant] = await tx.select({ id: platformAdministratorGrantsTable.id })
      .from(platformAdministratorGrantsTable).where(and(
        eq(platformAdministratorGrantsTable.status, "active"),
        isNull(platformAdministratorGrantsTable.revokedAt),
      ));
    if (!user || !user.emailVerified || profile?.appRole !== "clinician" || profile.accountType !== "clinician") {
      throw new Error("Bootstrap refused. The explicitly selected account must already exist, have a verified email, and have clinician account status.");
    }
    if (existingGrant) {
      throw new Error("Bootstrap refused. An active platform administrator already exists; use the separately governed grant process.");
    }
    await tx.insert(platformAdministratorGrantsTable).values({
      userId,
      status: "active",
      grantedBy: null,
    });
    await writeAuditEvent(tx, {
      userRole: "out_of_band_operator",
      action: "platform_admin_bootstrapped",
      targetType: "user",
      targetId: userId,
      metadata: {
        method: "explicit_operator_cli",
        approval_reference: approvalReference,
      },
    });
  });
  console.log("Platform administrator bootstrap completed. Review the audit record before continuing.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Platform administrator bootstrap failed.");
  process.exitCode = 1;
});
