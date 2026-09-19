# NeuroPathways — Test Scenarios

## Automated (test-suite.sh)

Run: `API_BASE_URL=https://your-app.replit.app ./test-suite.sh`

Covers 38 sections, 150+ assertions:

| # | Category | What it tests |
|---|----------|---------------|
| 1 | Health | GET /healthz returns 200 + status:ok |
| 2 | Security headers | Helmet headers (nosniff, X-Frame, HSTS, no X-Powered-By) |
| 3 | CORS | Rejects unknown origin, accepts allowed origin |
| 4 | Auth guards | All 13 CRUD routes + 8 special routes return 401 without auth |
| 5 | Public routes | Login/verify endpoints accept unauthenticated requests |
| 6 | Dual auth | manage-client-goal requires either clinician or invite_token |
| 7 | Registration | Email validation, password length, duplicate detection |
| 8 | User profile | GET/PATCH /users/me, clinician-data aggregation |
| 9 | Client account | Create family + children + credentials in one call |
| 10-18 | CRUD | Full create/read/update for children, families, behavior plans, documents, behavior logs, win logs, reward tokens, messages, check-ins, engagement events, intervention plans |
| 19 | Detail endpoints | client-detail, family-detail with related data |
| 20 | Add child | Add child to existing family |
| 21 | Manage record | updateChild, createDocument, deleteDocument, deleteFamily |
| 22 | Goal management | Clinician create/update/delete goals |
| 23-24 | Client login | client-session/login + verify-client-credentials |
| 25 | Client portal | Full portal data with token (child, plans, siblings, logs) |
| 26 | Token auth | behavior-logs, win-logs, engagement-events with invite_token |
| 27 | Client goals | Parent creates/updates goals via invite_token |
| 28 | Access code | Change access code, login with new code |
| 29 | Mobile auth | Login, token issuance |
| 30-31 | Mobile API | Auth guard on all 9 mobile routes, full CRUD with token, logout invalidation |
| 32 | Upload | Accepts PDF, rejects JS and EXE |
| 33 | Tenant isolation | Second clinician cannot see first clinician's data; mobile-created logs have tenant_id set and are denied to other clinicians by ID |
| 34 | Password change | Wrong password, short password, valid change |
| 35 | Input validation | Missing required fields, unknown actions, nonexistent IDs |
| 36 | Response format | Valid JSON, correct structure |
| 37 | Parent upload | Auth guards, validation, file upload, document record, portal visibility, MIME filtering |
| 38 | Cleanup | Deletes test data created during run |

---

## Manual UI Tests

These require a running web app in a browser.

### Login Flow
1. Open app URL — splash/login screen appears
2. Enter valid username + access code — redirects to parent dashboard
3. Enter wrong access code — shows error message
4. Leave fields empty and submit — shows validation message

### Parent Dashboard
1. After login, dashboard shows greeting with family name
2. Quick Log button is visible and tappable
3. Help Now button is visible
4. Recent behavior logs appear (if any exist)
5. Active goals summary shows

### Behavior Logging
1. Tap "Log" in navigation or Quick Log button
2. Select a behavior type
3. Select intensity (low/moderate/high)
4. Add optional notes
5. Submit — success message, log appears in recents

### Goals & Milestones
1. View goals list — shows clinician-created and parent-created goals
2. Progress indicator displays correctly
3. Can create a new goal from parent side

### Documents
1. View documents list
2. Document titles and categories display correctly

### Messages
1. View messages from clinician
2. Messages display in chronological order

### Child Switcher (Family Accounts)
1. If multiple children, selector appears
2. Switching child updates all data on dashboard
3. Behavior logs are scoped to selected child

### Parent Document Upload (NEW — iPhone optimized)
1. From Document Center, tap "Upload" button in header — navigates to /ParentUpload
2. Three large buttons visible: "Take a Photo", "Choose from Photos", "Choose a File"
3. "Take a Photo" opens camera (on iPhone; on desktop opens file picker)
4. "Choose from Photos" opens photo library picker
5. "Choose a File" opens file picker (accepts image/*, .pdf, .doc, .docx)
6. After selecting file, preview card shows file name, size, and thumbnail (for images)
7. "Remove" button clears selected file and returns to picker buttons
8. If multi-child family: child selector appears with all children listed
9. If single-child family: child is auto-selected (no selector shown)
10. Category picker shows 5 options: Treatment Plan/IEP, Behavior Plan, Progress Report, School Document, Other
11. "Other" is selected by default
12. "Upload to Clinician" button is full-width, prominent
13. During upload: spinner shows, button disabled
14. On success: green checkmark animation, "Uploaded!" message, "Your clinician can now see this document"
15. "Upload Another" resets the form; "Done" navigates back
16. On error: red error banner shows the error message
17. Privacy notice at bottom: "Documents are stored securely and shared only with your clinician"
18. Back arrow in header navigates to previous page
19. After upload, returning to Document Center shows the new document in the list

### Responsive
1. Open at 375px width — all screens readable
2. Navigation works on mobile width
3. Forms are usable without horizontal scroll
4. ParentUpload buttons are thumb-friendly (min 56px tall tap targets)
5. ParentUpload preview card truncates long filenames

### Clinician Dashboard (if accessible)
1. Login via clinician email/password
2. Dashboard shows children, families, logs, messages
3. Can create new client account
4. Can view client detail
5. Can upload document
6. Can run AI scan on documents
7. Documents uploaded by parents show "client:<child_id>" in uploaded_by field
