# NeuroPathways — Phase 0 audit and redesign plan

## Scope and authorization

This phase inventories the current working application before any redesign. It does **not** authorize Phase 1 or changes to application UI, routes, permissions, clinical content, or account relationships.

The requested screen recording was not attached. The user explicitly authorized auditing the current application without it. Findings below distinguish running-app observations from source inspection; nothing is attributed to the unavailable recording.

### Recovery baseline

- Branch: `main`.
- Baseline commit: `0ae2aedb5a0e2bece4591706e54261fa1d697f5e`.
- Annotated recovery tag: `redesign-phase0-baseline-20261018`.
- Bundle: `generated-artifacts/phase0-audit/NeuroPathways-before-redesign.bundle`.
- `git bundle verify` passed and reported complete history. All 476 reachable baseline commits were retained. No reset, rebase, squash, merge, push, or deployment was performed.
- This is a **code recovery baseline**, not a database snapshot. No existing clinical records or account relationships were changed. Browser access used existing synthetic development fixtures; one synthetic parent session was issued.

## 1. Existing screen inventory

| Screen / experience | Current implementation and features to retain | Audit evidence |
| --- | --- | --- |
| Parent Home | Child selector, greeting, urgent Help Now, activities with source labels, inline activity details and outcomes, This Week observations, Prepare prevention steps, Quick Actions, Support Library | Independent and clinician-connected browser captures; `ParentHome.jsx`, `DailySupportHome.jsx` |
| Help Now | Four initial options: Help With a Behavior, Safety/Crisis Plan, Calm Down First, and return to dashboard. Behavior selection, support steps, emergency guidance, switching behaviors, optional logging and plan upload | Browser captures of initial choices and read-only support states; `HelpNowPanel.jsx`, `SupportView.jsx` and support components |
| Practice | Assigned by Your Care Team when published assignments exist; family/starter activities, categories, activity previews, saved activities, routines, focused guided steps, optional outcome/notes controls | Browser list/detail captures in both parent modes; `PracticePage.jsx` |
| Goals & Milestones | Family goals, behavior-linked goals/check-ins, care-team goals and plan-derived goals when available; milestones, source labels, related practice, authorized management controls | Browser captures; `ParentGoalsTab.jsx`, `ClinicalGoals.jsx`, `GoalLines.jsx`, `ChildEditor.jsx` |
| Pullout navigation | Home, Help Now, Practice, Goals, AI Chat near the top; resources/family links below; Menu at the bottom before Add a child where authorized; account/sign-out area | Actual mobile drawer screenshot; `navigationModels.js`, `RoleAwareShell.jsx` |
| Menu directory | History, Support library, Care plan & documents, Upload a plan, AI Chat, Enjoyment & preferences, Clinic connection where authorized, Settings, Messages | Browser capture and source inventory; `ParentMenu.jsx` |
| AI Chat | Child-scoped input, Send, rendered Markdown, messages, source references, review labels, safety/disclaimer text, loading/error states | Empty composer browser capture; conversation/source rendering inspected in `ChatPanel.jsx`. No AI question was submitted |
| Documents | Upload and authorization controls, search, generated categories, source metadata, status, scan/retry where supported, document viewing/opening, error details | Browser captures and `DocsPanel.jsx`; clinician status handling in `DocScanButton.jsx`. No upload or scan was performed in the audit |
| Child Profile / setup | Child details, communication and sensory inputs, selected behaviors, individual goals, existing validation and management controls | Source inventory of `ChildEditor.jsx`, `ChildProfile.jsx`, parent setup routes |
| Preferences | Favorite activities/things, communication methods, comfort/sensory preferences and dislikes | Source inventory of `FamilyTools.jsx`; available through Practice → My Routines → Preferences |
| Routines | Create/edit routine, ordered steps, step movement, deletion where authorized, focused Now/Next player, back/next/finish/exit, saved runs | Source inventory of `FamilyTools.jsx` and Practice navigation |
| Reminders | Existing target/time/day controls, enable state, editing/deletion, quiet hours/snooze and a limitation notice | Source inventory of `FamilyTools.jsx`; do not imply unavailable push delivery is working |
| Messages | Existing child-scoped communication panel and send behavior; account-specific routes | Navigation/source inventory; `MessagesPanel.jsx`, `Messages.jsx`. No message was sent |
| History / Logs | Existing behavior/activity observations, contextual child selection, existing logging actions | Navigation/source inventory; `ParentHistory.jsx`, `LogPanel.jsx`, `LogBehavior.jsx`. No observation was saved |
| Settings / Privacy | Existing account settings, privacy/data requests, authorized profile actions and sign-out | Navigation/source inventory; `Settings.jsx`, `DataRequests.jsx` |
| Other account modes | Individual self-managed client portal, clinician workspace, existing legacy family bridge, multiple-child context and role restrictions | Source/route inventory. They are preservation requirements, not claims of full browser regression coverage |
| Native Expo app | Separate parent and client tab groups, parent home/help/practice/goals/menu, chat/documents/history and other native routes | Source inventory only. Responsive web screenshots are not native-device screenshots |

### Parent/account boundaries that must remain intact

- Independent and clinician-connected parents share the parent experience, but data availability, consent and management privileges remain account-specific.
- Legacy family access preserves clinical IDs and family scoping. Its menu intentionally hides Add a child, Child profile and Clinic connection where the existing code hides them.
- Individual clients must remain in their self-managed client experience.
- A child selection must remain attached to every applicable route, callback, read and mutation. No new child or family record may replace an existing one during a visual redesign.
- Clinician navigation remains clinician-specific. Its mobile quick links currently include Dashboard, Clients and Messages; reports remain in the full menu.

## 2. Route and shortcut inventory

The companion CSV is the detailed, machine-readable comparison baseline:

`generated-artifacts/phase0-audit/NeuroPathways-routes-and-shortcuts.csv`

It inventories registered web route patterns, role-based navigation, the parent Menu directory, contextual actions and Expo file routes. A source inventory entry is **not** a claim that its action was submitted successfully in a browser.

### Main parent destinations

Child context is retained by the existing routing/state implementation; the examples omit actual IDs.

| Shortcut | Existing destination / behavior |
| --- | --- |
| Home | `/ParentHome`, default `today` view |
| Help Now | Existing support overlay, not a replacement destination |
| Practice | `/ParentHome?tab=practice`; `/Practice` remains an existing compatibility entry |
| Goals | `/ParentHome?tab=edit&section=goals` in the parent-free / legacy-family shell; preserve other account-specific `/GoalsMilestones` mappings |
| AI Chat | `/ParentHome?tab=ask` for the unified parent panel; other existing shells retain `/AIChat` |
| Support library | `/ParentHome?tab=today&section=library` for the parent panel |
| Care plan & documents | `/ParentHome?tab=docs` for the parent panel |
| Upload a plan | Existing documents panel from parent Menu; preserve separate `/ParentUpload` and `/UploadBehaviorPlan` routes and their authorized callers |
| Enjoyment & preferences | `/ParentHome?tab=practice&section=preferences` from parent Menu |
| Child profile | `/ParentHome?tab=edit&section=profile` from the parent pullout, where currently authorized |
| Clinic connection | `/ParentHome?tab=clinic`, where currently authorized |
| Messages | `/ParentHome?tab=messages` in ParentHome; preserve other shells' existing `/Messages` entry |
| History | `/History`, with the current selected-child query when present |
| Settings | `/Settings`; keep existing privacy/data-request access |
| Menu | `/Menu`, preserving selected child |
| Add a child | `/ParentQuickStart?new=1`, only where currently authorized |
| My Routines / Saved Activities / Explore Activities | Existing PracticePage views; do not invent new routes |
| Routines / Preferences / Reminders | Existing FamilyTools tabs within Practice |
| Activity step controls / outcomes | Existing guided-activity state and optional save callbacks; not generic navigation links |
| Sign Out | Existing authentication-specific logout callback |

### Home shortcuts and secondary controls

Preserve Choose a Goal, Read a Plan, Try Today, Show/Hide Details, Save for Later, Move to Today, outcome controls, This Week → Quick Log, Prepare → Review support steps, Quick Log, Upload a Plan, Ask, Manage Goals, Support Library, Edit Child Profile, Add a Behavior and View full library. Preserve their current callbacks and return behavior rather than substituting lookalike buttons with different destinations.

## 3. Current design problems by screen

These are redesign findings, not authorization to fix them during Phase 0.

| Area | Current finding | Recommendation for its authorized phase |
| --- | --- | --- |
| Home | Full activity descriptions, skill explanations, source/status labels and multiple feedback controls repeat across stacked cards. On mobile they produce a very long page and push This Week, Prepare and secondary tools well below the first viewport | One clear help action, concise activity previews, less prominent secondary controls and clear whitespace between sections; preserve all existing actions and their destinations |
| Home, desktop | Three similarly styled activity columns compete for attention. Equal card prominence weakens hierarchy despite the useful sidebar and visible help control | Keep sidebar and content width; distinguish urgent help, primary activities and secondary progress/preparation |
| Goals | Two introductory tinted panels repeat “See what [child] is working toward” before the goal list. Goal actions and check-ins add more repeated surfaces | One introduction; compact, source-aware goal rows with details available on demand |
| Practice | Assigned and starter activities repeat rectangular previews, explanatory text and Start/Save controls. Similar assignment titles in synthetic fixtures make scanning harder | Keep assignment/source identity; concise previews and clearer grouping. Never merge or delete similarly named clinical assignments merely for appearance |
| Guided activities | A focused activity detail already exists and is a useful foundation | Preserve one-step-at-a-time behavior, back/next/finish and optional feedback. Keep explanations optional rather than restoring mandatory teaching/reflection steps |
| Help Now | The four choices are already distinct and reachable, and emergency instructions are visible. Colored containers and further support blocks can still compete for attention | Refine spacing/type and emphasize the current step. Never collapse emergency guidance or alter safety/branching logic |
| Pullout menu | Primary links are grouped well after the recent AI/Menu changes. Many secondary links require scrolling within the drawer, and a separate account area adds another visual boundary | Preserve AI near Goals and Menu above Add a child. Refine row spacing, headings and dividers without removing links |
| Bottom navigation | Narrow labels truncate, and a fixed bar requires careful content/composer clearance | Check actual label widths and safe-area spacing across required widths in the relevant approved phase |
| AI Chat | A long introductory safety explanation precedes the conversation; on the observed mobile screen the Send label wraps and the composer sits near the fixed navigation | Keep urgent warnings visible; compact nonurgent disclosure/source sections, a non-wrapping Send button, and adequate composer/bottom-bar space |
| Documents | Upload, scanning explanations, categories and document metadata accumulate in the same area. Empty/upload states and populated/error states have different density | Compact rows/status indicators; keep detailed scan reasons and existing retry/view actions accessible |
| Routines / preferences / reminders | Multiple editors, lists and secondary controls share the family-tools surface | Group related fields and actions; distinguish the Now/Next player from management forms; retain delivery limitations |
| Messages / History / Settings | Existing panels and settings need consistent row/form treatment, but source inspection alone cannot establish every populated/error-state layout | Apply the approved components only in Phase 9 and verify real states before claiming parity |

## 4. Recommended shared visual components

These are proposals only. Do not create or adopt them before Phase 1 approval.

1. **PageHeader:** one title, selected-child context, concise subtitle and existing contextual actions.
2. **SectionHeading:** consistent title/count/secondary action; no duplicated introductory panels.
3. **Action styles:** urgent Help Now, primary action, secondary action, quiet text action and destructive action, using existing colors.
4. **ActivityPreview:** title, skill/duration, brief description, source label and existing Start/Save behavior.
5. **FocusedStepPanel:** current instruction, Back/Next/Finish, optional background and separate optional feedback.
6. **GoalPreview / GoalDetails:** compact summary plus existing authorized details and controls; separate participation from clinical progress.
7. **SourceBadge and StatusIndicator:** text plus icon/color, with accurate family/plan/care-team provenance.
8. **DocumentRow:** compact identifying information, small processing state, view/open and available retry actions.
9. **NavigationRow:** consistent icon, label, active state, focus state and optional chevron; preserve all destinations.
10. **ChatComposer and ChatBubble:** narrow-screen-safe input/send layout, readable answers, expandable nonurgent references.
11. **FieldGroup / InlineFeedback / EmptyState:** consistent spacing and clear errors without pretending unavailable features work.
12. **NoncriticalDisclosure:** only for optional explanations and secondary metadata, never emergency or immediate escalation instructions.

### Proposed visual hierarchy

- Preserve the logo, current blue/teal/neutral palette, readable foregrounds and urgent red.
- First: selected child and one page title.
- Next: urgent help, immediately accessible.
- Then: the current task or a small set of concise activities.
- After that: progress observations and preparation, clearly secondary.
- Supporting tools remain accessible through existing shortcuts and navigation.
- Use the brief's initial spacing ranges as candidates: 20px mobile gutters, 28–36px section spacing, 12–16px related spacing and 16–20px card padding. Validate these against actual narrow screens rather than forcing them globally.
- Keep desktop sidebar and useful wide layouts. Do not simply stretch phone cards across desktop.
- Preserve existing focus/reduced-motion hooks; measure contrast and touch targets before claiming accessibility compliance.

## 5. Risks and required safeguards

| Risk | Safeguard |
| --- | --- |
| Shared CSS/navigation affects unapproved pages or clinician/individual roles | Before Phase 1 edits, list affected surfaces. Prefer scoped opt-in foundations. Ask before side effects outside the authorized phase |
| Duplicate parent implementations and compatibility route adapters | Use the inventory to preserve account-specific mapping, return behavior and `child_id`; do not “clean up” routes during visual work |
| Clinical/source meaning lost while simplifying | Keep provenance, review status, milestones and safety content; never invent a better-looking clinical title |
| Observations confused with clinical improvement | Separate participation, caregiver observations, goal milestones and clinician progress visually and semantically |
| Missing/damaged document mistaken for a redesign issue | Keep real scan errors and repair requirements visible; no scanning-backend changes in Phase 8 |
| Legacy family restrictions accidentally changed | Preserve existing family, child, clinician, tenant and consent boundaries; do not expose hidden management links |
| Long text and fixed navigation conflict | Review 320/360/375/390/430px widths, long filenames and composer states during authorized phases |
| Reminder delivery overstated | Preserve limitation notices; do not imply push/background delivery is enabled because a reminder is saved |
| Web/native parity assumed | Native is a separate code path. Track source parity now; obtain actual device/Expo evidence before claiming native validation |
| Audit fixture lacks a populated state | Mark it unverified instead of fabricating content or testing customer data |
| Recovery misunderstood | The Git bundle restores code/history, not database rows. No clinical data migration is part of the redesign |

## 6. Phased redesign plan — approval required after every row

| Phase | Authorized only after | Scope | Required exit evidence |
| --- | --- | --- | --- |
| 0 | Current audit request | Audit, screen/route inventory, hierarchy/component proposals, code recovery baseline | Current screenshots, findings, limitations and approval request |
| 1 | Explicit Phase 0 approval | Typography, spacing, surfaces, icons and visual foundations, preserving colors. Identify shared-style side effects before changes | Scoped examples, affected-file/surface list, responsive evidence and approval |
| 2 | Explicit Phase 1 approval | Home hierarchy and spacing only | Both parent modes, mobile/desktop before/after, original shortcut checks |
| 3 | Explicit Phase 2 approval | Crisis-friendly Help Now presentation, unchanged safety logic | Initial choices, behavior selection, active step and safety evidence |
| 4 | Explicit Phase 3 approval | Practice list/details, assignments, routines/saved shortcuts and optional feedback presentation | Activity and source preservation; start/steps/save/feedback checks |
| 5 | Explicit Phase 4 approval | Goals presentation and source grouping; no storage/calculation changes | Authorized goal actions, milestones and related activities in both parent modes |
| 6 | Explicit Phase 5 approval | Menu/navigation appearance, not destinations | Compare every original menu shortcut with this inventory |
| 7 | Explicit Phase 6 approval | Chat composer/bubbles/nonurgent sources/disclosures, unchanged model/prompts/safeguards | Narrow-screen Send and readable conversation/source evidence |
| 8 | Explicit Phase 7 approval | Document rows/metadata/status/error presentation, unchanged scanning backend | Search/category/view/open/upload/retry/child/access checks |
| 9 | Explicit Phase 8 approval | Routines, reminders, preferences, profile, messages, history, settings and remaining existing tools | Existing controls, data and delivery limitations retained |
| 10 | Explicit Phase 9 approval | Consistency, responsive/accessibility review, full approved-scope regression; no new redesign/features | Account-mode matrix, required viewport matrix, route/action results and known issues |

At each exit, provide the brief's required headings: What Changed, Files Modified, Before and After, What Was Preserved, Testing, Remaining Issues, Approval Required. Stop for Approve / Revise / Revert. Passing tests, silence or remaining time are not approval.

## 7. Preservation checklist

- Independent, clinician-connected, legacy-family and individual-client identities and account relationships.
- Clinician dashboard and role-specific capabilities.
- Desktop sidebar, mobile navigation, hamburger, back behavior, selected child and existing URLs.
- Home, urgent Help Now, all four initial choices, behavior selection, every support step, escalation, emergency guidance and optional logging.
- Practice, source labels, published care-team assignments, existing generation logic, Save for Later, guided steps and optional feedback.
- Family-created, clinician-created and plan-derived goals, milestones, authorized goal management and related activities.
- Documents, original uploads, metadata, clinical source fidelity, scan status/errors/retry and authorized content access.
- AI Chat functionality, prompts, access boundaries, citations, review status and crisis safeguards.
- Support Library, routines, reminders and honest delivery limitations, preferences, child profiles, clinic connection, messages, history/logs, settings, privacy/data requests and every current shortcut.
- Existing records, consent, permissions and the current NeuroPathways brand palette/logo.

## Testing and evidence

- Baseline web suite executed: **15 test files, 96 tests passed**.
- Git bundle verified successfully; complete baseline history retained.
- Real browser screenshots were captured from synthetic independent and clinician-connected accounts at mobile and desktop widths.
- Browser audit findings and screenshots are packaged alongside the downloadable report. Coverage is bounded to assessment; this is **not** the Phase 10 regression pass.
- No AI message, document upload/scan, clinical log, goal edit or real-user record change was needed for this assessment.
- Source contains visible-focus and reduced-motion hooks. No claim is made of a complete keyboard, screen-reader or contrast audit.
- The unavailable recording was not reviewed. Native device execution, all responsive widths and every mutation/error state remain unverified.

### Browser coverage and limits

The browser reviewer used 390×844 mobile and 1440×1000 desktop viewports. Both independent and clinician-connected parent Homes, mobile drawers, Menu pages, Help Now initial choices and one support state, Practice lists/details, Goals, AI Chat composers and Documents were reviewed. Independent wide Goals was also captured. There are **23 saved PNG screenshots**.

Messages, History and Settings destinations were identified but **not opened or action-tested** in this browser pass. No AI answer/source state, message delivery, goal mutation, reminder delivery, document scan or upload success is claimed.

### Observed issues left unchanged

- Before a child was selected, the browser saw two 401 resource responses and a loading state. Selecting a child populated the dashboards. This is a baseline observation, not a proven production authentication defect; no auth behavior was changed.
- The fixed mobile navigation overlaps lower activity/detail content. In both empty AI Chat composers the input/Send row is partly behind the bar and the label is clipped to “Sen.” This is a confirmed presentation issue to address in the applicable approved phase.
- The Help Now choice overlay allows underlying dashboard content to compete visually with its choices. Keep all four choices and emergency guidance available while improving separation in Phase 3.
- The connected **synthetic test fixture** contains three deliberately unreadable/missing-document rows alongside an already-read plan. Their missing-file messages were visible. No retry, authorization or file change was made, and this is not evidence that production documents are missing.
- Several same-titled assignments/goals exist in the connected synthetic fixture. They were neither merged nor renamed. Similar titles alone do not prove duplicate clinical records.
- Some initial skeleton panels cleared after waiting; they were not classified as persistent blank-page failures.

## Approval required

Phase 0 is complete as an audit of the current application without the recording.

Do you approve this redesign plan and authorize **Phase 1 only**?

- A. Approve Phase 0 and continue to Phase 1.
- B. Request revisions to Phase 0.
- C. Revert Phase 0.

Do not begin Phase 1 until explicit approval is received.
