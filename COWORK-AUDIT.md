# NeuroPathways — Full App Audit Guide (for Claude Code cowork)

> **Purpose:** A cowork partner opens this file and follows it section-by-section,
> testing the live app in a browser. Every test is a concrete action with an expected
> result. The auditor reports pass/fail for each item and flags anything unexpected.

## Environment

| Item | Value |
|------|-------|
| Dev server | `https://7417e69e-621a-4884-b51c-d5188c57d8b5-00-1ns004w857dl6.riker.replit.dev/` |
| Published app | `https://nuropath-ai--NeuroPathways.replit.app/` |
| Test runner | Append `/test-runner.html` to the dev server URL |
| Rate limit | 100 requests per 15 minutes. If you hit 429s, wait 15 min. Set `DISABLE_RATE_LIMIT=true` in Replit Secrets to bypass. |

## Demo Accounts (seeded, ready to use)

### Clinician
| Email | Password | Name | Data |
|-------|----------|------|------|
| demo@neuropathways.app | Demo2026!np | Dr. Sarah Chen | 4 families, 5 clients |

Login at: `/ClinicianLogin`

### Parent / Family (client sessions)
| Username | Access Code | Family | Children |
|----------|-------------|--------|----------|
| rivera.parent | DEMO01 | Rivera Family | Sofia (ADHD + Dyslexia), Marco |
| nguyen.parent | DEMO02 | Nguyen Family | Lily (Sensory) |
| jordan.e | DEMO03 | Ellison Family | Jordan (Anxiety) |
| alex.m | DEMO04 | Mercer Family | Alex (ADHD) |

Login at: `/UsernameLogin`

---

## Phase 1 — Automated Tests (run first)

### A. Browser test runner
1. Open the test runner URL in a browser
2. Click **Run Tests**
3. Wait for all tests to complete (~30 sec)
4. **Expected:** 70 tests, all green. Report any failures with their section name and error.
5. Pay special attention to **section 18 (Parent Document Upload)** — 12 tests covering auth guards, file upload, document record creation, portal visibility, and MIME filtering.

### B. API test suite (bash)
```bash
API_BASE_URL="https://7417e69e-621a-4884-b51c-d5188c57d8b5-00-1ns004w857dl6.riker.replit.dev" ./test-suite.sh
```
**Expected:** 150+ assertions, 0 failures. Section 37 covers parent upload. Section 33 includes null-tenant regression tests.

---

## Phase 2 — Security Audit

### S1. Auth guards (unauthenticated)
Open a private/incognito browser (no cookies). For each URL, verify you get redirected to login or see a 401:

| # | URL/Action | Expected |
|---|-----------|----------|
| S1.1 | Navigate to `/` | Redirects to login or shows login page |
| S1.2 | `fetch('/api/children')` in console | 401 |
| S1.3 | `fetch('/api/behavior-logs')` in console | 401 |
| S1.4 | `fetch('/api/documents')` in console | 401 |
| S1.5 | `fetch('/api/users/me')` in console | 401 |
| S1.6 | `fetch('/api/upload', {method:'POST'})` in console | 401 |
| S1.7 | `fetch('/api/client-upload', {method:'POST'})` in console | 401 |
| S1.8 | `fetch('/api/client-upload-document', {method:'POST', headers:{'Content-Type':'application/json'}, body:'{}'})` in console | 401 |

### S2. Security headers
Inspect response headers on any API call (Network tab):

| # | Header | Expected |
|---|--------|----------|
| S2.1 | X-Content-Type-Options | nosniff |
| S2.2 | X-Frame-Options | SAMEORIGIN or DENY |
| S2.3 | Strict-Transport-Security | present |
| S2.4 | X-Powered-By | absent |
| S2.5 | Content-Security-Policy | present |

### S3. Tenant isolation
1. Login as the demo clinician (demo@neuropathways.app)
2. Note a child ID from `/api/children`
3. Open a second browser / incognito window
4. Register a new clinician (any email/password)
5. As the new clinician, try `fetch('/api/client-detail?child_id=<ID>')` — **Expected: 403**
6. As the new clinician, try `fetch('/api/children')` — **Expected: empty array `[]`**
7. As the new clinician, try `fetch('/api/behavior-logs/<any-log-id>')` — **Expected: 403** (even if the log has null tenant_id)

### S4. Cross-tenant null-tenant regression
This tests the fix for the critical PHI leak found in the Sep 19 audit:

1. Login as parent (rivera.parent / DEMO01) on the mobile API:
   ```
   fetch('/api/mobile/auth/login', {method:'POST', headers:{'Content-Type':'application/json'}, body:'{"username":"rivera.parent","access_code":"DEMO01"}'})
   ```
2. Use the returned token to create a behavior log:
   ```
   fetch('/api/mobile/behavior-logs', {method:'POST', headers:{'Content-Type':'application/json','X-Mobile-Token':'<token>'}, body:'{"behavior_type":"audit_test","intensity":"low"}'})
   ```
3. Note the returned log ID
4. As a different clinician (not demo@neuropathways.app), try to read it:
   ```
   fetch('/api/behavior-logs/<log-id>')
   ```
5. **Expected: 403 Access denied** (not 200 with the record)
6. As the demo clinician, verify the log IS visible in their list:
   ```
   fetch('/api/behavior-logs')
   ```
   **Expected:** the `audit_test` log appears in the array

### S5. Upload security
1. Login as demo clinician
2. Try uploading a `.js` file via `/api/upload`:
   ```
   const fd = new FormData(); fd.append('file', new Blob(['alert(1)'], {type:'application/javascript'}), 'evil.js');
   fetch('/api/upload', {method:'POST', body:fd, credentials:'include'})
   ```
   **Expected: 400** "File type not allowed"
3. Try uploading a `.exe`:
   ```
   const fd = new FormData(); fd.append('file', new Blob(['MZ'], {type:'application/x-msdownload'}), 'evil.exe');
   fetch('/api/upload', {method:'POST', body:fd, credentials:'include'})
   ```
   **Expected: 400**

### S6. Client upload security
1. Login as parent (rivera.parent / DEMO01) via `/UsernameLogin`
2. In console, get the invite_token:
   ```
   JSON.parse(localStorage.getItem('np_client_session'))?.invite_token
   ```
3. Try uploading a JS file via client-upload:
   ```
   const fd = new FormData();
   fd.append('file', new Blob(['alert(1)'], {type:'application/javascript'}), 'evil.js');
   fd.append('invite_token', '<token>');
   fd.append('child_id', '<child_id>');
   fetch('/api/client-upload', {method:'POST', body:fd})
   ```
   **Expected: 400** "File type not allowed. Accepted: PDF, PNG, JPG, HEIC, DOCX"
4. Try creating a document for a child that doesn't belong to this family:
   ```
   fetch('/api/client-upload-document', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({invite_token:'<token>', child_id:'00000000-0000-0000-0000-000000000000', title:'test'})})
   ```
   **Expected: 403 or 404**

---

## Phase 3 — Parent Document Upload (deep test)

**This is the most important section.** Test every path through the upload flow.

### P1. Navigation to upload
1. Login as `rivera.parent` / `DEMO01` at `/UsernameLogin`
2. Tap **Documents** in the sidebar navigation
3. **Expected:** Document Center page loads, shows any existing documents
4. **Expected:** An **Upload** button is visible in the header bar (top right area)
5. Tap the **Upload** button
6. **Expected:** Navigates to `/ParentUpload` page

### P2. Upload page layout
1. On the `/ParentUpload` page, verify:
   - Header shows "Upload Document" with "Share a document with your clinician" subtitle
   - Back arrow button in the header
   - Three large buttons stacked vertically:
     - **Take a Photo** (blue camera icon) — "Use your camera to snap a document"
     - **Choose from Photos** (purple image icon) — "Pick an image from your library"
     - **Choose a File** (green file icon) — "PDF, Word document, or image"
   - Privacy notice at the bottom: "Documents are stored securely and shared only with your clinician"
2. Verify buttons are large enough for thumb tapping (at least 56px tall)
3. Verify the page works at 375px width (mobile viewport)

### P3. File selection — Take a Photo
1. Click "Take a Photo"
2. **Expected on desktop:** Opens file picker (camera capture only works on mobile devices)
3. **Expected on iPhone:** Opens the rear camera directly
4. Select/take a photo
5. **Expected:** Page transitions to review state with file preview

### P4. File selection — Choose from Photos
1. If a file is selected, tap "Remove" to clear it
2. Click "Choose from Photos"
3. **Expected:** Opens photo picker (on mobile: photo library; on desktop: file picker filtered to images)
4. Select an image
5. **Expected:** Preview card shows thumbnail, file name, and file size

### P5. File selection — Choose a File
1. Clear any selected file
2. Click "Choose a File"
3. **Expected:** Opens file picker accepting images, PDF, and Word documents
4. Select a PDF or DOCX file
5. **Expected:** Preview card shows file icon (no thumbnail for non-images), file name, file size

### P6. Review state — single child family
1. Login as `nguyen.parent` / `DEMO02` (Nguyen family has one child: Lily)
2. Navigate to `/ParentUpload`
3. Select any file
4. **Expected:** No child selector appears (auto-selected since only one child)
5. **Expected:** Category picker is visible with 5 options
6. **Expected:** "Other" is selected by default

### P7. Review state — multi-child family
1. Login as `rivera.parent` / `DEMO01` (Rivera family has Sofia + Marco)
2. Navigate to `/ParentUpload`
3. Select any file
4. **Expected:** Child selector appears asking "Which child is this for?"
5. **Expected:** Both "Sofia" and "Marco" listed as tappable options
6. Tap one child — **Expected:** selection highlights with primary color border
7. Tap the other — **Expected:** selection switches

### P8. Category picker
1. With a file selected, verify the category picker shows:
   - Treatment Plan / IEP
   - Behavior Plan
   - Progress Report
   - School Document
   - Other (selected by default)
2. Tap each category — **Expected:** selected one highlights, others deselect
3. Select "Treatment Plan / IEP"

### P9. Remove file
1. With a file selected and preview showing
2. Tap "Remove" (red text with X icon under the preview)
3. **Expected:** Returns to the three-button picker state
4. **Expected:** No preview, no child selector, no category picker visible

### P10. Upload — happy path
1. Login as `rivera.parent` / `DEMO01`
2. Navigate to `/ParentUpload`
3. Select an image file (PNG or JPEG)
4. Select child: Sofia
5. Select category: "School Document"
6. Tap **"Upload to Clinician"**
7. **Expected during upload:** Button shows spinner, text changes to "Uploading...", button is disabled
8. **Expected on success:**
   - Green checkmark animation with circle
   - "Uploaded!" heading
   - "Your clinician can now see this document" message
   - Two buttons: "Upload Another" and "Done"

### P11. Upload — verification
1. After successful upload, tap **"Done"**
2. **Expected:** Navigates back to Document Center
3. **Expected:** The newly uploaded document appears in the list with:
   - Title derived from the file name
   - Category "School Document" (or whatever was selected)
4. Login as the demo clinician (demo@neuropathways.app / Demo2026!np) at `/ClinicianLogin`
5. Navigate to the clinician's documents page
6. **Expected:** The parent-uploaded document is visible
7. **Expected:** The `uploaded_by` field shows `client:<child_id>` (not a clinician ID)

### P12. Upload Another
1. Login as parent, upload a document successfully
2. On the success screen, tap **"Upload Another"**
3. **Expected:** Form resets to the three-button picker state
4. **Expected:** Can select a new file and upload again

### P13. Upload — error handling
1. Login as parent
2. Select a file, but do NOT select a child (multi-child family only: rivera.parent)
3. Tap "Upload to Clinician"
4. **Expected:** Red error banner: "Please select which child this document is for."
5. Select a child and try again — **Expected:** Upload succeeds

### P14. Upload — no session
1. Clear localStorage (`localStorage.clear()` in console)
2. Navigate to `/ParentUpload` directly
3. Try to upload a file
4. **Expected:** Upload fails gracefully (not a crash), shows an error about authentication

### P15. Upload — file types
Test each accepted file type:

| # | File type | MIME | Expected |
|---|-----------|------|----------|
| P15.1 | JPEG photo | image/jpeg | Accepted, preview shows thumbnail |
| P15.2 | PNG screenshot | image/png | Accepted, preview shows thumbnail |
| P15.3 | PDF document | application/pdf | Accepted, preview shows file icon |
| P15.4 | Word document (.docx) | application/vnd.openxmlformats... | Accepted, preview shows file icon |
| P15.5 | HEIC (iPhone native) | image/heic | Accepted (backend allows it) |

---

## Phase 4 — Clinician Flows

### C1. Clinician login
1. Navigate to `/ClinicianLogin`
2. **Expected:** Demo credential card visible (amber background)
3. Tap the demo credential — auto-fills email and password, switches to email login mode
4. Click **Sign In**
5. **Expected:** Redirects to clinician dashboard

### C2. Clinician dashboard
1. After login, verify:
   - Dashboard loads with client/family data
   - Navigation sidebar works
   - Children list shows 5 clients
   - Families list shows 4 families

### C3. Client account creation (via wizard)
1. Navigate to the "Create Client Account" flow in the clinician UI
2. Fill in family name, parent name, at least one child
3. Submit
4. **Expected:** Account created with auto-generated username and access code
5. **Expected:** Credentials shown on success screen

### C4. Clinician document upload
1. Navigate to a client's detail page
2. Upload a document via the clinician's upload interface
3. **Expected:** Document appears in the client's document list
4. Login as the corresponding parent
5. **Expected:** Document visible in parent's Document Center

### C5. View parent-uploaded documents
1. After a parent uploads a document (Phase 3)
2. Login as clinician
3. Navigate to the child's documents
4. **Expected:** Parent-uploaded documents are visible
5. **Expected:** Can distinguish parent-uploaded from clinician-uploaded docs

---

## Phase 5 — Parent Flows (non-upload)

### F1. Parent login
1. Navigate to `/UsernameLogin`
2. **Expected:** Demo credential cards visible (amber)
3. Tap `rivera.parent / DEMO01` — auto-fills username and access code
4. Click **Sign In**
5. **Expected:** Redirects to parent dashboard with Rivera family greeting

### F2. Parent dashboard
1. After login, verify:
   - Greeting with family name
   - Quick Log and Help Now buttons visible
   - Recent behavior logs section
   - Goals section
   - Navigation works (sidebar or bottom nav)

### F3. Behavior logging
1. Navigate to Log Behavior
2. Select behavior type, intensity, add optional notes
3. Submit
4. **Expected:** Success feedback, log appears in recents

### F4. Goals
1. Navigate to Goals & Milestones
2. **Expected:** Shows any clinician-created goals
3. Create a new goal from parent side
4. **Expected:** Goal created, progress indicator works

### F5. Documents (read)
1. Navigate to Document Center
2. **Expected:** Shows documents shared by clinician
3. Category filters work if multiple categories exist
4. Search field filters by title

### F6. Child switcher (Rivera family only)
1. Login as `rivera.parent / DEMO01`
2. **Expected:** Child switcher visible (Sofia / Marco)
3. Switch child — **Expected:** All data updates (logs, goals, documents)

### F7. Messages
1. Navigate to Messages
2. **Expected:** Shows messages from clinician (if any)
3. Messages display in chronological order

---

## Phase 6 — Responsive / Mobile

### R1. Mobile viewport (375px)
1. Set browser to 375px width (iPhone SE)
2. Test each page:
   - Login pages: forms usable, no horizontal scroll
   - Parent dashboard: readable, buttons tappable
   - Document Center: list readable, Upload button visible
   - ParentUpload: three buttons stack properly, all tappable
   - Category picker: tags wrap properly

### R2. Tablet viewport (768px)
1. Set browser to 768px width (iPad)
2. **Expected:** Layout adapts, no wasted space, no overflow

---

## Phase 7 — Edge Cases

### E1. Expired session
1. Login as parent
2. Delete the `np_client_session` from localStorage
3. Try to navigate to a protected page
4. **Expected:** Redirects to login or shows appropriate error

### E2. Large file upload
1. Login as parent, navigate to `/ParentUpload`
2. Try to upload a file larger than 20MB
3. **Expected:** Error message (server rejects files > 20MB)

### E3. Console errors
1. While testing any page, keep the browser console open
2. **Expected:** No unhandled errors or exceptions
3. Note any 401 errors on parent pages that call clinician-only endpoints (known issue, not a blocker)

### E4. Back navigation
1. Upload a document, reach the success screen
2. Use browser back button
3. **Expected:** Returns to a usable state (upload form or Document Center), not a broken page

---

## Reporting Format

For each section, report:

```
## [Section ID] [Section Name]
- P1.1: PASS / FAIL — [details if fail]
- P1.2: PASS / FAIL
...
```

Flag any finding as:
- **CRITICAL** — data leak, auth bypass, data loss
- **HIGH** — feature broken, incorrect data shown
- **MEDIUM** — UI defect, confusing behavior
- **LOW** — cosmetic, console noise

End with a summary: total tests run, pass count, fail count, and a list of any findings ranked by severity.
