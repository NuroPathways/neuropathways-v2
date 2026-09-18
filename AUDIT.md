# NeuroPathways — Browser Test Audit Guide

**Purpose:** Systematic browser-based testing for cowork sessions. Every test includes the exact URL, action, and expected result so the tester can compare directly.

**Base URL:** `https://7417e69e-621a-4884-b51c-d5188c57d8b5-00-1ns004w857dl6.riker.replit.dev`

**Prerequisite:** The Replit dev server must be running with the latest code pulled from GitHub.

---

## A. Landing Page & Navigation

### A1. Load landing page
- **URL:** `/`
- **Action:** Open in browser
- **Expected:** Page loads without errors. No console errors. Shows NeuroPathways branding with Clinician Portal and Family Login options.

### A2. Check console for errors
- **Action:** Open DevTools (F12) → Console tab
- **Expected:** No red errors. Warnings about missing favicon or HMR are acceptable.

---

## B. Clinician Registration Flow

### B1. Register with empty form
- **URL:** `/RoleSetup?role=clinician` (click Clinician Portal)
- **Action:** Click Register/Sign Up without filling any fields
- **Expected:** Validation error — email and password required. No crash, no white screen.

### B2. Register with short password
- **Action:** Enter email `audit@test.dev`, password `ab`
- **Expected:** Error message about password length (minimum 8 characters).

### B3. Register successfully
- **Action:** Enter email `audit-YYYYMMDD@test.dev` (use today's date), password `AuditPass123!`, first name `Audit`, last name `Tester`
- **Expected:** Account created. Redirected to clinician dashboard or login confirmation.

### B4. Duplicate registration
- **Action:** Try registering with the same email again
- **Expected:** Error — email already registered (409 conflict).

### B5. Login with wrong password
- **Action:** Login with the registered email but password `WrongPassword`
- **Expected:** Error — invalid credentials. No crash.

### B6. Login successfully
- **Action:** Login with correct email and password
- **Expected:** Redirected to clinician dashboard. Session cookie set (check DevTools → Application → Cookies).

---

## C. Clinician Dashboard

### C1. Dashboard loads
- **Action:** After login, navigate to clinician dashboard
- **Expected:** Dashboard shows with sections for families, children, behavior logs, messages. All sections load (may be empty for a new account).

### C2. GET /api/clinician-data
- **Action:** Open DevTools → Network tab, reload the dashboard
- **Expected:** Request to `/api/clinician-data` returns 200 with JSON containing `children`, `families`, `logs`, `messages` arrays.

### C3. GET /api/users/me
- **Action:** In DevTools console, run: `fetch('/api/users/me').then(r=>r.json()).then(console.log)`
- **Expected:** Returns JSON with snake_case keys: `id`, `email`, `first_name`, `last_name`, `app_role`, `account_type`, `display_name`. No camelCase keys like `firstName`.

---

## D. Create Client Account (Family + Children)

### D1. Create a family with two children
- **Action:** Use the clinician UI to create a new client/family. If no UI form exists, run in console:
```javascript
fetch('/api/create-client-account', {
  method: 'POST',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({
    family_name: 'Audit Family',
    first_name: 'Parent',
    last_name: 'One',
    email: 'parent@audit.dev',
    children: [
      {child_name: 'Child A', age: 5, username: 'audit_child_a', access_code: 'AUDIT1'},
      {child_name: 'Child B', age: 8, username: 'audit_child_b', access_code: 'AUDIT2'}
    ]
  })
}).then(r=>r.json()).then(d=>{console.log('Family:', d.family.id); d.children.forEach(c=>console.log('Child:', c.id, c.child_name))})
```
- **Expected:** Returns family object with `id` and two children with `id` and `child_name`. Note the family ID, child IDs, and usernames — needed for later tests.

### D2. Verify family appears in list
- **Action:** In console: `fetch('/api/families').then(r=>r.json()).then(console.log)`
- **Expected:** Array includes the just-created family with `family_name: "Audit Family"`.

### D3. Verify children appear in list
- **Action:** In console: `fetch('/api/children').then(r=>r.json()).then(console.log)`
- **Expected:** Array includes both children. Each has `clinician_id` matching your user ID.

---

## E. CRUD Operations

### E1. Create a behavior plan
```javascript
fetch('/api/behavior-plans', {
  method: 'POST',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({
    child_id: '<CHILD_A_ID>',
    behavior_name: 'Elopement',
    behavior_description: 'Running away from designated area',
    strategy_title: 'Proximity management'
  })
}).then(r=>r.json()).then(console.log)
```
- **Expected:** Returns created plan with `id`. Status 201.

### E2. Read behavior plan
```javascript
fetch('/api/behavior-plans/<PLAN_ID>').then(r=>r.json()).then(console.log)
```
- **Expected:** Returns the plan with all fields populated.

### E3. Update behavior plan
```javascript
fetch('/api/behavior-plans/<PLAN_ID>', {
  method: 'PATCH',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({behavior_description: 'Updated description'})
}).then(r=>r.json()).then(console.log)
```
- **Expected:** Returns updated plan with new description.

### E4. Create a behavior log
```javascript
fetch('/api/behavior-logs', {
  method: 'POST',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({
    child_id: '<CHILD_A_ID>',
    behavior_type: 'elopement',
    intensity: 'high',
    notes: 'Audit test log'
  })
}).then(r=>r.json()).then(console.log)
```
- **Expected:** Returns created log with `id`. Status 201.

### E5. Create a document
```javascript
fetch('/api/documents', {
  method: 'POST',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({
    child_id: '<CHILD_A_ID>',
    title: 'Audit Test Document',
    category: 'assessment'
  })
}).then(r=>r.json()).then(console.log)
```
- **Expected:** Returns created document with `id`.

### E6. Create a message
```javascript
fetch('/api/messages', {
  method: 'POST',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({
    child_id: '<CHILD_A_ID>',
    content: 'Test message from clinician',
    sender_role: 'clinician'
  })
}).then(r=>r.json()).then(console.log)
```
- **Expected:** Returns created message with `id`.

### E7. Create a daily check-in
```javascript
fetch('/api/daily-check-ins', {
  method: 'POST',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({
    child_id: '<CHILD_A_ID>',
    mood: 'happy',
    notes: 'Good day at school'
  })
}).then(r=>r.json()).then(console.log)
```
- **Expected:** Returns created check-in with `id`.

### E8. Create a win log
```javascript
fetch('/api/win-logs', {
  method: 'POST',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({
    child_id: '<CHILD_A_ID>',
    win_type: 'social',
    description: 'Greeted a peer independently'
  })
}).then(r=>r.json()).then(console.log)
```
- **Expected:** Returns created win log with `id`.

---

## F. Client Session (Parent Login)

### F1. Client login with invalid credentials
```javascript
fetch('/api/client-session/login', {
  method: 'POST',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({username: 'nobody', access_code: 'WRONG'})
}).then(r=>console.log('Status:', r.status))
```
- **Expected:** Status 401.

### F2. Client login succeeds
```javascript
fetch('/api/client-session/login', {
  method: 'POST',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({username: 'audit_child_a', access_code: 'AUDIT1'})
}).then(r=>r.json()).then(d=>{console.log('Token:', d.invite_token?.substring(0,16)+'...'); window._clientToken=d.invite_token})
```
- **Expected:** Returns `invite_token` (64-char hex string) and child data. Token saved to `window._clientToken`.

### F3. Client portal data
```javascript
fetch('/api/client-portal-data', {
  headers: {'x-invite-token': window._clientToken}
}).then(r=>r.json()).then(d=>{
  console.log('Child:', d.child?.child_name);
  console.log('Plans:', d.plans?.length);
  console.log('Siblings:', d.siblings?.length);
  console.log('Behavior logs:', d.behaviorLogs?.length || d.behavior_logs?.length);
  console.log('Win logs:', d.winLogs?.length || d.win_logs?.length);
})
```
- **Expected:** Returns child info for Child A, behavior plans created in section E, sibling (Child B), behavior logs, and win logs.

### F4. Parent logs behavior with token
```javascript
fetch('/api/behavior-logs', {
  method: 'POST',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({
    child_id: '<CHILD_A_ID>',
    invite_token: window._clientToken,
    behavior_type: 'meltdown',
    intensity: 'moderate',
    notes: 'Parent-logged behavior'
  })
}).then(r=>r.json()).then(console.log)
```
- **Expected:** Returns created log with `id`. Status 201. Parents can log behaviors using their client token.

### F5. Change access code
```javascript
fetch('/api/client-session/change-access-code', {
  method: 'POST',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({
    username: 'audit_child_a',
    current_access_code: 'AUDIT1',
    new_access_code: 'NEWAUDIT1'
  })
}).then(r=>r.json()).then(console.log)
```
- **Expected:** Returns `{ok: true, invite_token: "..."}`. New token issued.

### F6. Login with new access code
```javascript
fetch('/api/client-session/login', {
  method: 'POST',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({username: 'audit_child_a', access_code: 'NEWAUDIT1'})
}).then(r=>r.json()).then(d=>console.log('New token:', d.invite_token?.substring(0,16)+'...'))
```
- **Expected:** Login succeeds with new access code. Returns new token.

---

## G. Mobile Auth

### G1. Mobile login
```javascript
fetch('/api/mobile/auth/login', {
  method: 'POST',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({username: 'audit_child_b', access_code: 'AUDIT2'})
}).then(r=>r.json()).then(d=>{
  console.log('Mobile token:', d.token?.substring(0,16)+'...');
  console.log('Child:', d.child?.child_name);
  window._mobileToken=d.token
})
```
- **Expected:** Returns `token` and `child` object with `id`, `child_name`, `username`.

### G2. Mobile read endpoints
```javascript
const headers = {'x-mobile-token': window._mobileToken};
Promise.all([
  fetch('/api/mobile/children', {headers}).then(r=>r.json()),
  fetch('/api/mobile/behavior-plans', {headers}).then(r=>r.json()),
  fetch('/api/mobile/behavior-logs', {headers}).then(r=>r.json()),
  fetch('/api/mobile/messages', {headers}).then(r=>r.json()),
  fetch('/api/mobile/documents', {headers}).then(r=>r.json()),
]).then(([children, plans, logs, msgs, docs]) => {
  console.log('Children:', children.length);
  console.log('Plans:', plans.length);
  console.log('Logs:', logs.length);
  console.log('Messages:', msgs.length);
  console.log('Documents:', docs.length);
})
```
- **Expected:** All return 200 with arrays. Content scoped to Child B only.

### G3. Mobile create behavior log
```javascript
fetch('/api/mobile/behavior-logs', {
  method: 'POST',
  headers: {'Content-Type': 'application/json', 'x-mobile-token': window._mobileToken},
  body: JSON.stringify({behavior_type: 'aggression', intensity: 'low', notes: 'Mobile audit test'})
}).then(r=>r.json()).then(console.log)
```
- **Expected:** Returns created log with `id`. Status 201. `child_id` auto-set to Child B.

### G4. Mobile logout
```javascript
fetch('/api/mobile/auth/logout', {
  method: 'DELETE',
  headers: {'x-mobile-token': window._mobileToken}
}).then(r=>r.json()).then(console.log)
```
- **Expected:** Returns `{ok: true}`.

### G5. Token invalid after logout
```javascript
fetch('/api/mobile/children', {
  headers: {'x-mobile-token': window._mobileToken}
}).then(r=>console.log('Status:', r.status))
```
- **Expected:** Status 401 — token is revoked.

---

## H. Security Tests

### H1. Auth guards — unauthenticated requests
Open a new incognito/private browser window (no session cookies). Run each in the console:
```javascript
const routes = [
  '/api/children', '/api/families', '/api/behavior-plans', '/api/documents',
  '/api/intervention-plans', '/api/behavior-logs', '/api/reward-tokens',
  '/api/messages', '/api/ai-conversations', '/api/daily-check-ins',
  '/api/win-logs', '/api/engagement-events', '/api/client-profiles',
  '/api/users/me', '/api/clinician-data'
];
Promise.all(routes.map(r => fetch(r).then(res => ({route: r, status: res.status}))))
  .then(results => results.forEach(r => console.log(r.route, '→', r.status)))
```
- **Expected:** Every route returns **401**.

### H2. Security headers
```javascript
fetch('/api/healthz').then(r => {
  console.log('X-Content-Type-Options:', r.headers.get('x-content-type-options'));
  console.log('X-Frame-Options:', r.headers.get('x-frame-options'));
  console.log('Strict-Transport-Security:', r.headers.get('strict-transport-security'));
  console.log('X-Powered-By:', r.headers.get('x-powered-by'));
})
```
- **Expected:**
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: SAMEORIGIN`
  - `Strict-Transport-Security: max-age=...`
  - `X-Powered-By: null` (absent)

### H3. CORS — reject unknown origin
```javascript
fetch('/api/healthz', {headers: {'Origin': 'https://evil.com'}})
  .then(r => console.log('Access-Control-Allow-Origin:', r.headers.get('access-control-allow-origin')))
```
- **Expected:** `Access-Control-Allow-Origin: null` (no CORS headers for unknown origins).

### H4. Tenant isolation — clinician cannot see another clinician's data
1. Register a second clinician in an incognito window:
```javascript
await fetch('/api/clinician/register', {
  method: 'POST',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({email: 'other-clinician@audit.dev', password: 'OtherPass123!', firstName: 'Other', lastName: 'Doc'})
}).then(r=>r.json())
```
2. Login as the second clinician:
```javascript
await fetch('/api/clinician/login', {
  method: 'POST',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({email: 'other-clinician@audit.dev', password: 'OtherPass123!'})
})
```
3. Try to access the first clinician's children:
```javascript
fetch('/api/children').then(r=>r.json()).then(d=>console.log('Children visible:', d.length))
```
- **Expected:** Returns `[]` — empty array. Second clinician sees zero children (not the first clinician's data).

4. Try to access a specific child by ID:
```javascript
fetch('/api/client-detail?child_id=<CHILD_A_ID>').then(r=>console.log('Status:', r.status))
```
- **Expected:** Status **403** — access denied.

### H5. Tenant isolation — daily-check-ins and win-logs scoped
As the second clinician (same incognito window):
```javascript
Promise.all([
  fetch('/api/daily-check-ins').then(r=>r.json()),
  fetch('/api/win-logs').then(r=>r.json()),
]).then(([checkins, wins]) => {
  console.log('Check-ins visible:', checkins.length);
  console.log('Win logs visible:', wins.length);
})
```
- **Expected:** Both return `[]` or only rows matching this clinician's `tenant_id`. Must NOT return rows from the first clinician. This was a PHI leak bug (F2) that has been fixed.

### H6. Upload file type validation
As a logged-in clinician, test upload restrictions:
```javascript
// Should succeed (PDF)
const pdfBlob = new Blob(['%PDF-1.4 test'], {type: 'application/pdf'});
const formData = new FormData();
formData.append('file', pdfBlob, 'test.pdf');
fetch('/api/upload', {method: 'POST', body: formData})
  .then(r=>r.json()).then(console.log)
```
- **Expected:** Returns `{file_url: "/api/uploads/...", file_name: "test.pdf"}`.

```javascript
// Should fail (JavaScript)
const jsBlob = new Blob(['alert(1)'], {type: 'application/javascript'});
const formData2 = new FormData();
formData2.append('file', jsBlob, 'evil.js');
fetch('/api/upload', {method: 'POST', body: formData2})
  .then(r=>r.json()).then(console.log)
```
- **Expected:** Returns `{error: "File type not allowed..."}`. Status 400.

---

## I. Password Management

### I1. Change password — wrong current password
```javascript
fetch('/api/clinician/change-password', {
  method: 'POST',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({current_password: 'WrongPassword', new_password: 'NewPass123!'})
}).then(r=>console.log('Status:', r.status))
```
- **Expected:** Status 401.

### I2. Change password — too short
```javascript
fetch('/api/clinician/change-password', {
  method: 'POST',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({current_password: 'AuditPass123!', new_password: 'ab'})
}).then(r=>console.log('Status:', r.status))
```
- **Expected:** Status 400.

### I3. Change password — success
```javascript
fetch('/api/clinician/change-password', {
  method: 'POST',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({current_password: 'AuditPass123!', new_password: 'NewAuditPass123!'})
}).then(r=>r.json()).then(console.log)
```
- **Expected:** Returns `{ok: true}`.

### I4. Login with new password
```javascript
fetch('/api/clinician/login', {
  method: 'POST',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({email: 'audit-YYYYMMDD@test.dev', password: 'NewAuditPass123!'})
}).then(r=>console.log('Status:', r.status))
```
- **Expected:** Status 200 — login succeeds with new password.

---

## J. Input Validation

### J1. client-detail without child_id
```javascript
fetch('/api/client-detail').then(r=>console.log('Status:', r.status))
```
- **Expected:** Status 400.

### J2. family-detail without family_id
```javascript
fetch('/api/family-detail').then(r=>console.log('Status:', r.status))
```
- **Expected:** Status 400.

### J3. Nonexistent child
```javascript
fetch('/api/client-detail?child_id=00000000-0000-0000-0000-000000000000')
  .then(r=>console.log('Status:', r.status))
```
- **Expected:** Status 404.

### J4. Nonexistent family
```javascript
fetch('/api/family-detail?family_id=00000000-0000-0000-0000-000000000000')
  .then(r=>console.log('Status:', r.status))
```
- **Expected:** Status 404.

### J5. Unknown action on manage-client-record
```javascript
fetch('/api/manage-client-record', {
  method: 'POST',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({action: 'destroyEverything'})
}).then(r=>console.log('Status:', r.status))
```
- **Expected:** Status 400.

---

## K. UI Flow Tests (Manual)

### K1. Family Login (Parent Portal)
- **Action:** Click Family Login on the landing page
- **Expected:** Shows access code login form. No crash, no white screen.

### K2. Parent login with access code
- **Action:** Enter username `audit_child_a`, access code `NEWAUDIT1` (changed in F5)
- **Expected:** Logs in. Shows parent dashboard with child info, quick actions.

### K3. Log a behavior (parent)
- **Action:** From parent dashboard, click Log or navigate to `/log`
- **Expected:** Shows behavior logging form. Select behavior type, intensity, optional notes. Submit completes in under 5 seconds.

### K4. View behavior plans
- **Action:** Navigate to behavior plans or documents section
- **Expected:** Shows behavior plans created by clinician. Plain language, not clinical jargon.

### K5. Navigation
- **Action:** Test all bottom navigation tabs (Home, Log, AI, Messages)
- **Expected:** Each tab loads without errors. Back button works.

---

## L. API Response Format

### L1. Health endpoint
```javascript
fetch('/api/healthz').then(r=>r.json()).then(console.log)
```
- **Expected:** `{status: "ok"}` — valid JSON.

### L2. List endpoints return arrays
```javascript
fetch('/api/children').then(r=>r.json()).then(d=>console.log('Is array:', Array.isArray(d), 'Length:', d.length))
```
- **Expected:** `Is array: true`.

### L3. Detail endpoints return objects
```javascript
fetch('/api/children/<CHILD_A_ID>').then(r=>r.json()).then(d=>console.log('Has id:', !!d.id))
```
- **Expected:** `Has id: true`.

---

## Summary Checklist

| Section | Tests | What it covers |
|---------|-------|---------------|
| A. Landing Page | 2 | Page loads, no console errors |
| B. Registration | 6 | Empty form, short password, success, duplicate, wrong password, login |
| C. Dashboard | 3 | Dashboard loads, clinician-data, users/me snake_case |
| D. Create Client | 3 | Family + children, verify lists |
| E. CRUD | 8 | Behavior plans, logs, documents, messages, check-ins, win logs |
| F. Client Session | 6 | Login, portal data, parent logging, access code change |
| G. Mobile Auth | 5 | Login, read, create, logout, token revocation |
| H. Security | 6 | Auth guards, headers, CORS, tenant isolation, upload validation |
| I. Password | 4 | Wrong password, short, success, login with new |
| J. Input Validation | 5 | Missing params, nonexistent IDs, unknown actions |
| K. UI Flow | 5 | Parent login, dashboard, behavior logging, navigation |
| L. Response Format | 3 | JSON validity, arrays, objects |
| **Total** | **56** | |

### Post-Testing Cleanup

When done, remove the `DISABLE_RATE_LIMIT` environment variable to re-enable rate limiting:
- In Replit AI chat: `Remove the environment variable DISABLE_RATE_LIMIT and restart the API server.`

### Known Limitations
- `FILE_ENCRYPTION_KEY` not set — uploads stored unencrypted (non-blocking for testing)
- Replit free plan — no Shell tab, limited secret management
- Published URL requires Ramez to republish
- AI chat endpoint (`/api/ai`) requires Anthropic API key in server env
