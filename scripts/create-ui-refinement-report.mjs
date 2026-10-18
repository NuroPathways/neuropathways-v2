import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "generated-artifacts");
const evidence = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const careTests = JSON.parse(fs.readFileSync("/tmp/np-care-team-results.json", "utf8"));
const regression = JSON.parse(fs.readFileSync("/tmp/np-parent-unification-api-results.json", "utf8")).results;
const contrast = JSON.parse(fs.readFileSync(path.join(outDir, "ui-refinement-contrast.json"), "utf8"));
const files = [...new Set([
  ...execFileSync("git", ["diff", "--name-only"], { cwd: root, encoding: "utf8" }).trim().split("\n"),
  ...execFileSync("git", ["ls-files", "--others", "--exclude-standard"], { cwd: root, encoding: "utf8" }).trim().split("\n"),
])].filter(f => f && !f.startsWith("attached_assets/")).sort();
const esc = str => String(str ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const p = str => `<p>${esc(str)}</p>`;
const ul = list => `<ul>${list.map(s => `<li>${esc(s)}</li>`).join("")}</ul>`;
const table = (headers, rows) => `<div class="table"><table><thead><tr>${headers.map(h => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(c => `<td>${esc(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
const sections = [
  ["Exact files modified", p(`${files.length} implementation, schema, generated-contract, verification and project-memory files changed. Uploaded requirements are input, not implementation edits.`) + `<details><summary>Full exact file list</summary><ol class="files">${files.map(f => `<li><code>${esc(f)}</code></li>`).join("")}</ol></details>`],
  ["Readability issues fixed", p("Replaced white-on-light parent headings, faint secondary text, and pale clinician Quick Action labels with existing readable foreground colors. Kept the established teal, blue, sage and navy palette. Darkened gradient header backgrounds while keeping white header text. Filled controls retain contrast on hover; dark-mode Expo primary, secondary and destructive fills use readable dark foregrounds.") +
    table(["Measured surface", "Current ratio", "Required"], contrast.map(r => [r.name, `${r.ratio}:1`, `${r.minimum}:1`])) +
    p("The automated token audit covers known theme surfaces; it is not a claim that every possible state of every screen has a complete accessibility certification. The real-browser audit caught two class-level failures not detectable by theme-token checks alone; these were corrected in the actual components.")],
  ["Learn Why components removed", p("Removed standalone Learn Why navigation and the separate lesson destination from web and mobile Practice/Family Tools. Legacy Learn Why link aliases redirect to Practice. Existing lesson content/data is retained but no longer presented as a separate practice stage. Useful, non-generic explanations remain optional within an activity.")],
  ["Practice navigation changes", p("Practice opens with the selected child's name, published care-team assignments first when available, and up to three relevant family activities. Explore shows only categories with actual available activities, not empty category buttons. Routines and Saved Activities use compact rows. The parent guide has one instruction at a time with Back, Next, Finish and Exit; explanation and feedback are optional. Saved care-team activities use the same assignment and resume state, including across reloads.")],
  ["How clinicians create goals", p("Open the existing client's Goals & Activities workspace, then Add Goal. Enter a meaningful title, description, skill area and measurement method. Frequency, duration, percentage and completed-step measures require an appropriate positive target; percentage is capped at 100. Observation-only and clinician-defined options do not invent a percentage. Milestones and notes are supported. Existing clinical goal IDs and progress are preserved when edited.")],
  ["How clinicians assign library activities", p("Choose Assign Activity in the same client workspace, select an existing starter-library activity, optionally link a published clinical goal and enter schedule/notes, preview, then publish. Library assignments store a stable library reference/version rather than copying or regenerating the original instructions. Assignment reads and writes enforce the child, clinician and tenant/active-link boundary.")],
  ["How clinicians create custom activities", p("Use the Custom Activity option, supply a title, description, skill and at least one original instruction. Materials, estimated duration, goal, useful explanation, difficulty guidance, notes and schedule are optional. The clinician's instructions are stored as entered; no generic AI content replaces missing custom steps. Preview and publication use the same activity definition.")],
  ["How Draft and Published states work", p("New goals and activities default to Draft. Drafts are excluded from parent care-team, legacy portal and mobile read paths. Publishing exposes the authorized child's current assignment. Pause and Archive remove active presentation without deleting the goal, assignment, published snapshots or practice history. Optimistic version checks reject conflicting edits. Published assignment versions are immutable; prior feedback retains its original instructions.")],
  ["How Preview as Parent works", p("Clinician Preview uses the same guide component and content used by parents, including original steps, materials, linked goal, notes and explanation. Preview is explicitly labelled and does not create an assignment, practice update, progress event or parent feedback. The web preview was exercised in the connected browser workflow; mobile shares its corresponding native guide component.")],
  ["How Assigned by Your Care Team appears", p("Published assignments appear inside existing Practice, not a new top-level destination. The entire optional care-team section is hidden on a successful empty result. Fetch errors remain visible with Retry rather than being treated as an empty list. Cards show an explicit care-team badge, skill, duration where provided and linked goal. Parent and child scoping is enforced by the server, including siblings.")],
  ["How Care Team Goals appear", p("Goals & Milestones separates Care Team Goals from Family Goals. Parent-facing care-team goals are read-only and can link to the same active assignments available in Practice. Home practice counts and clinically assessed progress are labelled separately. Parent completion and feedback do not increment clinical mastery. Existing family-created goals and their ownership rules remain available.")],
  ["How parent feedback reaches clinicians", p("After Finish, parents may select We tried it, We needed support, or Didn't get a chance, optionally add a note, or Skip. Saved feedback appears in parent History and clinician Recent Practice with child, assignment, outcome, timestamp and original published version. Request identities make retries idempotent. Direct-parent observations and practice are only visible to the connected clinician while observation sharing is granted; revocation takes effect on the next server read. Legacy-family feedback remains family-scoped. Merely linking an account never exposes private parent-document or family goals.")],
  ["Backend changes", ul([
    "Added typed clinician workspace, goal lifecycle, assignment lifecycle, parent care-team, step/bookmark and feedback endpoints.",
    "Extended the existing reward-token goal collection rather than duplicating or replacing clinical goals.",
    "Added immutable assignment snapshots and consent-filtered practice history/observations; excluded private parent-derived goals from clinician workspace projection.",
    "Reused the existing starter library and parent practice-progress storage, scoped by parent, child, assignment and published version.",
    "Added matching OpenAPI request/response definitions and regenerated the shared React and Zod contracts used by web and native clients.",
    "Prevented legacy generic CRUD and portal/mobile reads from bypassing clinical publication rules or changing clinician-owned care-team goals."
  ])],
  ["Database migrations", p("Additive migration: lib/db/migrations/20261018_care_team_assignments.sql. Existing reward_tokens gains publication status, goal details and version/history metadata; existing rows keep their IDs and published visibility. New tables hold assignments, published snapshots and practice feedback. The migration is idempotent and was applied only to the development database using the development-only migration script. No existing table, client, goal, credential or history was deleted. Production was not migrated and nothing was deployed. Before a future approved publication, apply this schema migration through the project's production migration process.")],
  ["Improvements to goal titles", p("Display helpers prefer meaningful existing title/name text. A technical timestamp title such as F4 goal 13:32:51 falls back to the first meaningful sentence already saved in the description. If no meaningful source exists, a review-needed label is shown rather than inventing a treatment objective. These are display corrections; saved IDs and clinical records are not renamed or deleted automatically.")],
  ["Improvements to document scanning", p("Document views show processing/failed/done states, plain-language errors, View Error and supported Retry Scan controls. Failed rereads retain prior successful profiles, support information and goal records. A partially failed reread does not overwrite an existing successful profile, and scanner retries no longer delete existing document goals automatically. Specific extraction errors are persisted. Real successful scanning was covered by the existing parent regression, and a deliberately unreadable synthetic document verified error persistence and preservation of prior profile/goals.")],
  ["Tests executed", table(["Check", "Coverage"], [
    ["Workspace TypeScript checks", "Shared libraries, API, web, mobile, mockup sandbox and scripts"],
    ["Web unit/component tests", "91 tests in 15 files: navigation, one-step guides, saved assignments, goal validation, preview/status behavior, titles and document controls"],
    ["API unit tests", "53 tests: care-team source/version/clinical-progress boundaries, parent auth, family classification, activity generation and document policy"],
    ["Existing real-HTTP regression", "20 checks: independent, linked, legacy family, individual-client permissions, goals, documents, sharing/revocation and successful scanning"],
    ["New real-HTTP care-team regression", "17 checks: library/custom assignments, draft privacy, lifecycle, scoping, consent, private goals, versions, feedback, saved steps and failed-reread preservation"],
    ["Computed theme/contrast checks", `${contrast.length} known normal-text color pairs, all >=4.5:1, plus source guards against pale surface colors used as text`],
    ["Real browser", "Clinician draft/preview/publish, library and custom assignment, parent guided steps/feedback/history/goals, clinician Recent Practice, pause, saved resume, sibling isolation, independent starter support and responsive layouts"],
    ["Focused browser follow-up", evidence.followupSummary],
  ])],
  ["Test results", ul([
    "Workspace type checks: PASS.",
    "Web unit tests: 91/91 PASS; production web build: PASS.",
    "API unit tests: 53/53 PASS.",
    `Existing parent HTTP checks: ${regression.filter(r => r.status === "PASS").length}/${regression.length} PASS.`,
    `New care-team HTTP checks: ${careTests.filter(r => r.status === "PASS").length}/${careTests.length} PASS.`,
    `Known contrast pairs: ${contrast.filter(r => r.pass).length}/${contrast.length} PASS.`,
    evidence.browserSummary,
    "Desktop 1280px and phone 390px checked; no horizontal overflow in the sampled phone Practice view.",
    "Recovery bundle verified as complete history. Starting branch: main; recovery base commit: 576216760f830497e265661c15cc9099c521f857. Working changes remain local; no user-initiated push, PR merge or deployment was performed."
  ]) + `<h3>Requested screenshot evidence</h3>${table(["Requested view", "Evidence ID"], evidence.screenshots.map(s => [s.description, s.id]))}` +
    p("Screenshots are presented with this report in the conversation. The testing browser provides observation IDs, not downloadable image files, so this self-contained HTML records the evidence IDs rather than embedding remote/private screenshot URLs.")],
  ["Remaining limitations", ul([
    ...evidence.limitations,
    "No evening reference recording was attached or available to inspect; the supplied written brief was the implementation source.",
    "Native iOS/Android hardware, assistive technology and app-store packaging were not tested; Expo code and native type checks are not equivalent to device validation.",
    "The sampled contrast/viewport checks are not a comprehensive WCAG certification of every app page and interactive state.",
    "Synthetic test accounts, goals, assignments, feedback and intentionally failing documents remain isolated in the development database; no real-user records were altered by the verification scripts.",
    "Historical library version 1 must remain available if starter instructions change in future.",
    "Production still requires the additive database migration before any separately approved publication."
  ])],
];
const toc = `<nav aria-label="Report sections"><ol>${sections.map(([title], i) => `<li><a href="#section-${i + 1}">${esc(title)}</a></li>`).join("")}</ol></nav>`;
const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>NeuroPathways — Implementation report</title><style>
:root{color-scheme:light}*{box-sizing:border-box}body{margin:0;background:#f3f7f5;color:#203441;font:16px/1.6 system-ui,sans-serif}header,main{max-width:1100px;margin:auto;padding:32px}header{background:#e7f3ee;border-bottom:4px solid #407f7b}h1{font-size:32px;line-height:1.2;margin:8px 0}h2{font-size:23px;line-height:1.3}h3{font-size:18px}a{color:#285d83}section{background:white;border:1px solid #d4e1dc;border-radius:12px;margin:22px 0;padding:26px;scroll-margin-top:20px}nav{columns:2;column-gap:40px;padding:12px 0}nav li{break-inside:avoid;margin:6px 0}summary{cursor:pointer;font-weight:650}.table{overflow:auto}table{width:100%;border-collapse:collapse;font-size:14px}th,td{padding:10px;text-align:left;border-bottom:1px solid #d4e1dc;vertical-align:top}th{background:#e7f3ee}.files{font-size:12px;overflow-wrap:anywhere}code{font-family:ui-monospace,monospace}.meta{color:#485f69;font-size:14px}.notice{padding:14px;background:#fff5d8;border-left:4px solid #9c7418}@media(max-width:650px){header,main{padding:18px}section{padding:18px}nav{columns:1}h1{font-size:27px}}@media print{body{background:white}nav{display:none}section{break-inside:auto;border:0;padding:0}details:not([open])>ol{display:block}header,main{max-width:none;padding:10px}}
</style><header><p class="meta">IMPLEMENTATION & VERIFICATION · ${esc(new Date().toLocaleDateString("en-US", { timeZone: "America/Denver", dateStyle: "long" }))}</p><h1>NeuroPathways<br>Connected parent practice and clinical goals</h1><p>Complete UI refinement, simplified Practice, clinician publishing and consent-scoped family feedback.</p><p class="notice">Development implementation only. Existing work preserved. No merge or deployment.</p></header><main>${toc}${sections.map(([title, body], i) => `<section id="section-${i + 1}"><h2>${i + 1}. ${esc(title)}</h2>${body}</section>`).join("")}</main></html>`;
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "neuropathways-ui-refinement-report.html"), html);
console.log(`Created 19-section report with ${files.length} changed files and ${evidence.screenshots.length} screenshot references.`);
