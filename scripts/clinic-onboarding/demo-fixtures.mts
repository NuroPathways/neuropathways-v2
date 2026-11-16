import crypto from "node:crypto";
import { chmod, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { and, eq, inArray, sql } from "../../artifacts/api-server/node_modules/drizzle-orm/index.js";
import {
  auditLogsTable,
  childrenTable,
  clinicMembershipsTable,
  clinicsTable,
  clinicalAssignmentsTable,
  clinicianCredentialsTable,
  db,
  familiesTable,
  parentAccountsTable,
  parentChildSettingsTable,
  parentClinicConsentsTable,
  platformAdministratorGrantsTable,
  usersTable,
  userProfilesTable,
} from "../../artifacts/api-server/node_modules/@workspace/db/src/index.ts";
import { createClinicianPasswordHash } from "../../artifacts/api-server/src/lib/clinicianPassword.js";
import { hashParentPassword } from "../../artifacts/api-server/src/lib/parentAuth.js";
import { makeStarterCard, getStarterTemplate } from "../../artifacts/api-server/src/lib/parentStarterLibrary.js";

const DEMO_DB = "np_demo_clinic_onboarding";
const MARKER_TABLE = "clinic_onboarding_demo_markers";
const mode = process.argv[2];
const databaseUrl = new URL(process.env.DATABASE_URL || "http://invalid");
const privateDir = path.resolve(process.env.NP_DEMO_PRIVATE_DIR || "");
const credentialsFile = path.resolve(process.env.NP_DEMO_CREDENTIALS_FILE || "");
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(scriptDirectory, "../..");
const demoRoot = path.join(workspaceRoot, ".local", "clinic-onboarding-demo");

function refuse(message: string): never {
  throw new Error(`Isolated clinic demo refused: ${message}`);
}

async function assertSafeDemoDatabase() {
  if (
    !["fresh", "populated"].includes(mode) ||
    process.env.NODE_ENV !== "test" ||
    process.env.NP_CLINIC_ONBOARDING_DEMO_MODE !== "1" ||
    process.env.REPLIT_CONNECTORS_ENABLED !== "false" ||
    databaseUrl.hostname !== "127.0.0.1" ||
    databaseUrl.pathname !== `/${DEMO_DB}` ||
    !privateDir.startsWith(`${demoRoot}${path.sep}`) ||
    !credentialsFile.startsWith(`${demoRoot}${path.sep}`)
  ) {
    refuse("the explicit test-mode flag, exact loopback demo database, private demo directory, and disabled connectors are required.");
  }
  const databaseState = await db.execute<{ current_database: string; server_ip: string | null }>(
    sql`select current_database(), host(inet_server_addr()) as server_ip`,
  );
  if (
    databaseState.rows[0]?.current_database !== DEMO_DB ||
    databaseState.rows[0]?.server_ip !== "127.0.0.1"
  ) {
    refuse("the database server did not confirm the exact loopback demo database.");
  }
}

const randomPassword = () => `Demo-${crypto.randomBytes(24).toString("base64url")}-8!`;
const syntheticEmail = (label: string, runId: string) => `${label}.${runId.slice(0, 8)}@example.test`;

type Person = {
  id: string;
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  displayName: string;
  kind: "platform_admin" | "clinic_admin" | "treating_clinician" | "parent";
  tenantId?: string;
};

async function main() {
  await assertSafeDemoDatabase();
  await mkdir(path.dirname(credentialsFile), { recursive: true, mode: 0o700 });
  await chmod(path.dirname(credentialsFile), 0o700);
  await db.execute(sql.raw(`
    CREATE TABLE IF NOT EXISTS ${MARKER_TABLE} (
      run_id varchar PRIMARY KEY,
      mode varchar NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      fixture_ids jsonb NOT NULL,
      active boolean NOT NULL DEFAULT true
    )
  `));

  const existing = await db.execute<{ run_id: string; mode: string }>(
    sql`select run_id, mode from ${sql.raw(MARKER_TABLE)} where active = true order by created_at desc limit 1`,
  );
  if (existing.rows[0]) {
    if (existing.rows[0].mode !== mode) {
      refuse("a different active demo state already exists; stop and reset that isolated run first.");
    }
    const [marker] = existing.rows;
    const credentialsPresent = await import("node:fs/promises")
      .then(({ access }) => access(credentialsFile).then(() => true).catch(() => false));
    console.log(JSON.stringify({
      status: "already_seeded",
      mode,
      runId: marker.run_id,
      credentialsFile: credentialsPresent ? credentialsFile : "missing; reset this isolated run before creating new credentials",
    }));
    return;
  }

  const [userCount, clinicCount, parentCount] = await Promise.all([
    db.select({ id: usersTable.id }).from(usersTable).limit(1),
    db.select({ id: clinicsTable.id }).from(clinicsTable).limit(1),
    db.select({ id: parentAccountsTable.id }).from(parentAccountsTable).limit(1),
  ]);
  if (userCount.length || clinicCount.length || parentCount.length) {
    refuse("an unmarked database already contains accounts or clinics; no rows were changed.");
  }

  const runId = crypto.randomUUID();
  const people: Person[] = [];
  const addClinician = (
    label: string,
    firstName: string,
    lastName: string,
    kind: Person["kind"],
    tenantId?: string,
  ) => {
    const person: Person = {
      id: crypto.randomUUID(),
      email: syntheticEmail(label, runId),
      password: randomPassword(),
      firstName,
      lastName,
      displayName: `${firstName} ${lastName}`,
      kind,
      tenantId,
    };
    people.push(person);
    return person;
  };

  const platformAdmin = addClinician("operator", "Demo", "Operator", "platform_admin");
  let clinicA: { id: string; displayName: string } | undefined;
  let clinicB: { id: string; displayName: string } | undefined;
  let clinicAdmin: Person | undefined;
  let clinicianOne: Person | undefined;
  let clinicianTwo: Person | undefined;
  let secondClinicUser: Person | undefined;
  const parentPeople: Person[] = [];

  if (mode === "populated") {
    clinicA = { id: crypto.randomUUID(), displayName: "NeuroPathways Demo Clinic North" };
    clinicB = { id: crypto.randomUUID(), displayName: "NeuroPathways Demo Clinic South" };
    clinicAdmin = addClinician("clinic-admin", "Morgan", "Sample", "clinic_admin", clinicA.id);
    clinicianOne = addClinician("clinician-one", "Riley", "Sample", "treating_clinician", clinicA.id);
    clinicianTwo = addClinician("clinician-two", "Jordan", "Sample", "treating_clinician", clinicA.id);
    secondClinicUser = addClinician("second-clinic", "Casey", "Sample", "treating_clinician", clinicB.id);
    for (let index = 1; index <= 5; index += 1) {
      const parent: Person = {
        id: crypto.randomUUID(),
        email: syntheticEmail(`caregiver-${index}`, runId),
        password: randomPassword(),
        firstName: `Caregiver ${index}`,
        lastName: "Sample",
        displayName: `Caregiver ${index} Sample`,
        kind: "parent",
      };
      parentPeople.push(parent);
      people.push(parent);
    }
  }

  const fixtureIds: Record<string, string[]> = {
    users: people.map((person) => person.id),
    parents: parentPeople.map((person) => person.id),
    clinics: [],
    memberships: [],
    families: [],
    children: [],
    assignments: [],
  };

  const credentials = people.map((person) => ({
    label: person.kind === "parent" ? `Caregiver ${person.firstName.replace(/\D/g, "")}` : person.displayName,
    role: person.kind,
    email: person.email,
    password: person.password,
  }));

  await db.transaction(async (tx) => {
    for (const person of people.filter((candidate) => candidate.kind !== "parent")) {
      await tx.insert(usersTable).values({
        id: person.id,
        email: person.email,
        emailVerified: true,
        firstName: person.firstName,
        lastName: person.lastName,
      });
      await tx.insert(userProfilesTable).values({
        id: person.id,
        tenantId: person.tenantId ?? null,
        appRole: "clinician",
        accountType: "clinician",
        displayName: person.displayName,
        firstName: person.firstName,
        lastName: person.lastName,
      });
      await tx.insert(clinicianCredentialsTable).values({
        userId: person.id,
        email: person.email,
        passwordHash: await createClinicianPasswordHash(person.password),
      });
    }
    await tx.insert(platformAdministratorGrantsTable).values({
      userId: platformAdmin.id,
      status: "active",
    });

    if (mode === "populated" && clinicA && clinicB && clinicAdmin && clinicianOne && clinicianTwo && secondClinicUser) {
      await tx.insert(clinicsTable).values([
        { id: clinicA.id, displayName: clinicA.displayName, status: "active", createdBy: platformAdmin.id, creationRequestKey: `demo:${runId}:clinic-a` },
        { id: clinicB.id, displayName: clinicB.displayName, status: "active", createdBy: platformAdmin.id, creationRequestKey: `demo:${runId}:clinic-b` },
      ]);
      fixtureIds.clinics = [clinicA.id, clinicB.id];
      const memberships = [
        { clinicId: clinicA.id, userId: clinicAdmin.id, role: "clinic_admin" },
        { clinicId: clinicA.id, userId: clinicianOne.id, role: "treating_clinician" },
        { clinicId: clinicA.id, userId: clinicianTwo.id, role: "treating_clinician" },
        { clinicId: clinicB.id, userId: secondClinicUser.id, role: "treating_clinician" },
      ];
      for (const membership of memberships) {
        const [created] = await tx.insert(clinicMembershipsTable).values({
          ...membership,
          status: "active",
          createdBy: platformAdmin.id,
        }).returning({ id: clinicMembershipsTable.id });
        fixtureIds.memberships.push(created.id);
      }

      for (let index = 0; index < parentPeople.length; index += 1) {
        const parent = parentPeople[index];
        const assignedClinician = index < 3 ? clinicianOne : clinicianTwo;
        const workspaceId = crypto.randomUUID();
        const starter = getStarterTemplate("elopement");
        const demoGoal = "Practice one safe transition with a calm reminder.";
        if (!starter) refuse("the configured demo starter behavior is unavailable.");
        await tx.insert(usersTable).values({
          id: parent.id,
          email: parent.email,
          emailVerified: true,
          firstName: parent.firstName,
          lastName: parent.lastName,
        });
        await tx.insert(userProfilesTable).values({
          id: parent.id,
          tenantId: workspaceId,
          appRole: "parent",
          accountType: "parent_free",
          displayName: parent.displayName,
          firstName: parent.firstName,
          linkedFamilyId: workspaceId,
        });
        await tx.insert(familiesTable).values({
          id: workspaceId,
          tenantId: clinicA.id,
          clinicianId: assignedClinician.id,
          familyName: `Sample Family ${index + 1}`,
          firstName: parent.firstName,
          primaryContact: parent.firstName,
          email: parent.email,
          accountType: "parent_free",
          createdBy: parent.id,
        });
        fixtureIds.families.push(workspaceId);
        await tx.insert(parentAccountsTable).values({
          id: parent.id,
          email: parent.email,
          firstName: parent.firstName,
          workspaceId,
          passwordHash: await hashParentPassword(parent.password),
        });
        const [child] = await tx.insert(childrenTable).values({
          tenantId: workspaceId,
          clinicianId: assignedClinician.id,
          familyId: workspaceId,
          parentId: parent.id,
          parentEmail: parent.email,
          firstName: `Child ${index + 1}`,
          lastName: "Sample",
          childName: `Demo Child ${index + 1}`,
          accountType: "parent_free",
          status: "active",
          createdBy: parent.id,
        }).returning({ id: childrenTable.id });
        fixtureIds.children.push(child.id);
        await tx.insert(parentChildSettingsTable).values({
          childId: child.id,
          parentId: parent.id,
          workspaceId,
          behaviorKey: starter.key,
          goal: demoGoal,
          behaviors: [{
            behaviorKey: starter.key,
            customBehavior: null,
            behaviorName: starter.name,
            goal: demoGoal,
          }],
          supportCards: [makeStarterCard(starter.key, null, demoGoal)],
        });
        await tx.insert(parentClinicConsentsTable).values({
          parentId: parent.id,
          childId: child.id,
          clinicianId: assignedClinician.id,
          scopes: ["documents"],
        });
        const [assignment] = await tx.insert(clinicalAssignmentsTable).values({
          clinicId: clinicA.id,
          clientId: child.id,
          userId: assignedClinician.id,
          role: "treating_clinician",
          status: "active",
          assignedBy: clinicAdmin.id,
        }).returning({ id: clinicalAssignmentsTable.id });
        fixtureIds.assignments.push(assignment.id);
      }
    }

    await tx.execute(sql`
      insert into ${sql.raw(MARKER_TABLE)} (run_id, mode, fixture_ids, active)
      values (${runId}, ${mode}, ${JSON.stringify(fixtureIds)}::jsonb, true)
    `);
  });

  await writeFile(credentialsFile, JSON.stringify({
    purpose: "Fictional local clinic-onboarding demo only",
    runId,
    mode,
    logins: credentials,
  }, null, 2), { mode: 0o600 });
  await chmod(credentialsFile, 0o600);

  // Sanity check the seeded relationships before announcing readiness.
  const seededClinics = await db.select({ id: clinicsTable.id }).from(clinicsTable);
  const seededChildren = await db.select({ id: childrenTable.id }).from(childrenTable);
  const seededParents = await db.select({ id: parentAccountsTable.id }).from(parentAccountsTable);
  let parentChildLinks = 0;
  if (mode === "populated") {
    const links = await db.select({ childId: childrenTable.id })
      .from(childrenTable)
      .innerJoin(parentChildSettingsTable, and(
        eq(parentChildSettingsTable.childId, childrenTable.id),
        eq(parentChildSettingsTable.parentId, childrenTable.parentId),
      ))
      .where(inArray(childrenTable.parentId, parentPeople.map((parent) => parent.id)));
    parentChildLinks = links.length;
  }
  if (
    (mode === "fresh" && (seededClinics.length !== 0 || seededChildren.length !== 0 || seededParents.length !== 0)) ||
    (mode === "populated" && (
      seededClinics.length !== 2 ||
      seededChildren.length !== 5 ||
      seededParents.length !== 5 ||
      parentChildLinks !== 5
    ))
  ) {
    refuse("seed verification did not match the requested demo state.");
  }
  console.log(JSON.stringify({
    status: "seeded",
    mode,
    runId,
    clinics: seededClinics.length,
    caregiverChildren: seededChildren.length,
    caregivers: seededParents.length,
    linkedParentChildSettings: parentChildLinks,
    credentialsFile,
    seededAuditRows: (await db.select({ id: auditLogsTable.id }).from(auditLogsTable)).length,
  }));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Fictional demo setup failed.");
  process.exitCode = 1;
});
