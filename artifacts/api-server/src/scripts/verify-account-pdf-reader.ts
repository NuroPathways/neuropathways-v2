/**
 * Development-only real HTTP + AI regression using isolated fixtures from
 * verify-parent-family-bridge.ts. Never run against production/customer records.
 */
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import { and, desc, eq, gt } from "drizzle-orm";
import {
  db, pool, childrenTable, clientSessionsTable, documentsTable,
} from "@workspace/db";
import { createSession } from "../lib/auth";
import { makePdfFixture } from "../test-utils/pdfFixture";

if (process.env.REPLIT_DEPLOYMENT || process.env.NODE_ENV === "production") {
  throw new Error("Development verification only");
}
const f = JSON.parse(await fs.readFile("/tmp/np-parent-unification-fixtures.json", "utf8"));
assert.match(f.run, /^[0-9a-f-]{36}$/i);
const base = "http://localhost:80/api";
const pdf = makePdfFixture([
  "Behavior: Difficulty with transitions. During a transition away",
  "from a puzzle, the client sometimes cries and raises their voice.",
  "Stopping a preferred activity may be difficult; the exact reason",
  "is unknown.",
  "Try now: Show the familiar break card and wait.",
  "If the voice rises, pause the request, use one calm short",
  "sentence, and give space.",
  "Avoid repeating directions quickly or removing the break card.",
  "Prevention: Show a visual timer with two-minute and one-minute",
  "warnings.",
  "Encouragement: Say, 'You asked for a break,' when the card is",
  "used.",
  "Practice skill: Ask for a break using the break card.",
  "Steps: point to the card, hand it over, and wait for the short",
  "pause.",
  "Notice: write down the transition, early signs, and whether the",
  "timer or card helped.",
]);
async function request(route: string, headers: Record<string, string>, body?: unknown) {
  const response = await fetch(`${base}${route}`, {
    method: body ? "POST" : "GET",
    headers: { ...headers, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, data: await response.json() as any };
}
async function upload(route: string, headers: Record<string, string>, fields: Record<string, string>) {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.set(key, value);
  form.set("file", new Blob([new Uint8Array(pdf)], { type: "application/pdf" }), "synthetic-labeled-support.pdf");
  const response = await fetch(`${base}${route}`, { method: "POST", headers, body: form });
  assert.ok(response.status === 200 || response.status === 201, `Upload HTTP ${response.status}`);
  return await response.json() as any;
}
async function clientToken(childId: string): Promise<string> {
  const [session] = await db.select().from(clientSessionsTable).where(and(
    eq(clientSessionsTable.childId, childId),
    gt(clientSessionsTable.expiresAt, new Date()),
  )).orderBy(desc(clientSessionsTable.expiresAt)).limit(1);
  assert.ok(session?.inviteToken, "Synthetic client session must already exist");
  return session.inviteToken!;
}
async function assertScanned(documentId: string) {
  const [document] = await db.select().from(documentsTable).where(eq(documentsTable.id, documentId));
  assert.equal(document?.scanStatus, "done");
  // Completed classifications may retain a truthful informational notice when
  // no source-verified behavior is found. Reading must not manufacture one.
  assert.doesNotMatch(document.scanError || "", /PDF text reader is unavailable|could not process this file right now/i);
}

try {
  const familyToken = await clientToken(f.legacy.childId);
  const individualToken = await clientToken(f.individual.childId);
  const parents: Array<{ label: string; childId: string; headers: Record<string, string> }> = [
    { label: "independent parent", childId: f.direct.childId, headers: { "X-Parent-Token": f.direct.token } },
    { label: "clinician-connected parent", childId: f.linking.childId, headers: { "X-Parent-Token": f.linking.token } },
    { label: "legacy family bridge", childId: f.legacy.childId, headers: { "X-Family-Token": familyToken } },
  ];
  // Resume the remaining client checks without repeating already passed scans.
  for (const parent of process.argv.includes("--clients-only") ? [] : parents) {
    const route = `/parent/children/${parent.childId}/documents`;
    const document = await upload(route, parent.headers, { authorizedUploader: "true", title: "Synthetic PDF account verification" });
    // Reproduce a previously failed document and ensure Retry clears its error.
    await db.update(documentsTable).set({
      scanStatus: "error", scanError: "The PDF text reader is unavailable.",
    }).where(eq(documentsTable.id, document.id));
    const scanned = await request(`${route}/${document.id}/scan`, parent.headers, {});
    assert.equal(scanned.status, 200, `${parent.label}: scan HTTP ${scanned.status}: ${scanned.data.error || ""}`);
    await assertScanned(document.id);
    const download = await fetch(`${base}/parent/documents/${document.id}/content`, { headers: parent.headers });
    assert.equal(download.status, 200);
    assert.deepEqual(Buffer.from(await download.arrayBuffer()), pdf, "original document bytes preserved");
    console.log(`PASS ${parent.label}: real PDF scan, failed-reader retry, authorized original download`);
  }

  const file = await upload("/client-upload", {}, {
    invite_token: individualToken, child_id: f.individual.childId, authorized_uploader: "true",
  });
  const saved = await request("/client-upload-document", {}, {
    invite_token: individualToken, child_id: f.individual.childId,
    file_url: file.file_url, file_name: "synthetic-labeled-support.pdf",
    title: "Synthetic individual PDF verification", category: "other", authorizedUploader: "true",
  });
  assert.equal(saved.status, 201, "individual client document registration");
  const individualScan = await request("/build-client-profile", {}, {
    child_id: f.individual.childId, invite_token: individualToken, force_rebuild: true,
  });
  assert.equal(individualScan.status, 200, `individual client scan HTTP ${individualScan.status}`);
  await assertScanned(saved.data.id);
  const scannedProfile = individualScan.data.profile;
  const sourceDocIds = scannedProfile?.sourceDocIds ?? scannedProfile?.source_doc_ids;
  assert.ok(sourceDocIds?.includes(saved.data.id), "profile includes the client-uploaded source document");
  const transitionSupport = (scannedProfile?.behaviors || []).find((behavior: any) =>
    /transition/i.test(String(behavior?.name || "")),
  );
  assert.ok(transitionSupport, "client-uploaded document produces a transition support card");
  assert.equal(transitionSupport.support_content_version, 1, "support-card fields are current");
  for (const field of [
    "do_this_right_now",
    "if_it_escalates",
    "avoid",
    "prevention_tips",
    "reinforcement_rewards",
    "practice_skill_steps",
    "what_to_notice",
  ]) {
    assert.ok(Array.isArray(transitionSupport[field]), `support card includes ${field}`);
    assert.ok(transitionSupport[field].length > 0, `synthetic source provides ${field}`);
  }
  assert.equal(typeof transitionSupport.practice_a_helpful_skill, "string");
  assert.ok(transitionSupport.practice_a_helpful_skill.trim(), "support card includes a practice skill");
  const clientPortal = await request("/client-portal-data", {}, {
    child_id: f.individual.childId, invite_token: individualToken,
  });
  assert.equal(clientPortal.status, 200, "individual client can load its own generated support card");
  assert.ok(
    clientPortal.data.profile?.behaviors?.some((behavior: any) => behavior.support_content_version === 1),
    "client portal exposes the same expanded support card",
  );
  console.log("PASS individual client: authorized upload, document registration and real source-labeled PDF scan");

  const clinicianToken = await createSession({ user: { id: f.clinician.id }, access_token: "synthetic" } as any);
  const clinicianHeaders = { Authorization: `Bearer ${clinicianToken}` };
  const [child] = await db.insert(childrenTable).values({
    id: crypto.randomUUID(), childName: "Synthetic account PDF verification",
    clinicianId: f.clinician.id, tenantId: f.clinician.id,
  }).returning();
  const clinicianFile = await upload("/upload", clinicianHeaders, {});
  const [document] = await db.insert(documentsTable).values({
    childId: child.id, clinicianId: f.clinician.id, tenantId: f.clinician.id,
    fileName: "synthetic-labeled-support.pdf", fileUrl: clinicianFile.file_url,
    title: "Synthetic clinician PDF verification",
  }).returning();
  const clinicianScan = await request("/build-client-profile", clinicianHeaders, { child_id: child.id, force_rebuild: true });
  assert.equal(clinicianScan.status, 200, `clinician PDF scan HTTP ${clinicianScan.status}`);
  await assertScanned(document.id);
  console.log("PASS clinician: authorized upload and real PDF scan");

  const deniedIndividual = await request("/build-client-profile", {}, {
    child_id: f.individual.siblingId, invite_token: individualToken, force_rebuild: true,
  });
  assert.equal(deniedIndividual.status, 403);
  const deniedParent = await request(`/parent/children/${f.legacy.childId}/documents`, {
    "X-Parent-Token": f.direct.token,
  });
  assert.equal(deniedParent.status, 404);
  const deniedClinician = await request("/build-client-profile", clinicianHeaders, {
    child_id: f.legacy.crossId, force_rebuild: true,
  });
  assert.equal(deniedClinician.status, 403);
  console.log("PASS access isolation: individual sibling, unrelated parent and other clinician documents denied");
} finally {
  await pool.end();
}
