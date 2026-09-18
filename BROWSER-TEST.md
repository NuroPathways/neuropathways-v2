# NeuroPathways — Manual Browser Click-Through Tests

**Purpose:** Test every user-facing flow by clicking through the actual UI, the way a real clinician or parent would. No console commands — just browser interactions.

**Base URL:** `https://7417e69e-621a-4884-b51c-d5188c57d8b5-00-1ns004w857dl6.riker.replit.dev`

**How to use:** Work through each test in order. Mark PASS/FAIL. Screenshot any failures.

---

## Setup

1. Open the Base URL in Chrome or Firefox
2. Open DevTools (F12) and keep the Console tab visible — note any red errors
3. Use a fresh incognito/private window so no old session cookies interfere

---

## 1. Landing Page

| # | Action | Expected Result | PASS/FAIL |
|---|--------|----------------|-----------|
| 1.1 | Open the Base URL | Page loads. Shows NeuroPathways branding. No white screen, no spinner stuck forever. | |
| 1.2 | Check DevTools Console | No red errors. Warnings about favicon or HMR are OK. | |
| 1.3 | Look for "Clinician Portal" and "Family Login" options | Both are visible and clickable. | |
| 1.4 | Resize browser to phone width (~400px) | Page is still usable. Nothing overflows off-screen. Text is readable. | |

---

## 2. Clinician Registration

| # | Action | Expected Result | PASS/FAIL |
|---|--------|----------------|-----------|
| 2.1 | Click "Clinician Portal" or navigate to the registration page | Registration form appears with email, password, name fields. | |
| 2.2 | Click Register/Sign Up with all fields empty | Error message appears. Does NOT crash or show white screen. | |
| 2.3 | Enter email `browsertest@test.dev`, password `ab`, click Register | Error about password being too short. | |
| 2.4 | Enter email `browsertest@test.dev`, password `BrowserTest123!`, first name `Browser`, last name `Tester`, click Register | Success — account created. Redirected to login or dashboard. | |
| 2.5 | Try registering again with the same email | Error — email already registered. | |

---

## 3. Clinician Login

| # | Action | Expected Result | PASS/FAIL |
|---|--------|----------------|-----------|
| 3.1 | Go to the login page | Login form appears with email and password fields. | |
| 3.2 | Enter email `browsertest@test.dev`, password `WrongPassword`, click Login | Error — invalid credentials. No crash. | |
| 3.3 | Enter email `browsertest@test.dev`, password `BrowserTest123!`, click Login | Success — redirected to clinician dashboard. | |
| 3.4 | Check that the page shows you're logged in | Dashboard shows clinician name or email. Navigation is available. | |

---

## 4. Clinician Dashboard

| # | Action | Expected Result | PASS/FAIL |
|---|--------|----------------|-----------|
| 4.1 | Look at the dashboard after login | Dashboard loads without errors. Shows sections for clients/families. May be empty for a new account — that's OK. | |
| 4.2 | Check for a navigation menu or sidebar | Navigation links are visible — at minimum: Clients, Families, or similar. | |
| 4.3 | Click each navigation link | Each page loads without white screen or console errors. | |

---

## 5. Create a Client/Family

| # | Action | Expected Result | PASS/FAIL |
|---|--------|----------------|-----------|
| 5.1 | Find and click "Add Client", "New Family", or similar button | A form appears to create a new client account. | |
| 5.2 | Fill in: Family name `Test Family`, Parent name `Parent One`, Email `parent@test.dev` | Fields accept input. No errors while typing. | |
| 5.3 | Add a child: Name `Child Alpha`, Age `7` | Child fields appear and accept input. | |
| 5.4 | Add a second child: Name `Child Beta`, Age `4` | Second child row appears. Both children visible. | |
| 5.5 | Set username `browser_child` and access code `BROWSER1` | Credential fields accept input. | |
| 5.6 | Click Create/Save | Success message. Family and children created. No console errors. | |
| 5.7 | Go back to the client/family list | The new "Test Family" appears in the list. | |

---

## 6. View Client Detail

| # | Action | Expected Result | PASS/FAIL |
|---|--------|----------------|-----------|
| 6.1 | Click on "Child Alpha" from the client list | Client detail page loads. Shows child's name, age. | |
| 6.2 | Look for sections: Behavior Plans, Documents, Behavior Logs | Sections are visible (may be empty — that's OK for a new client). | |
| 6.3 | Check that no "access_code" or hash string appears anywhere on the page | The hashed access code must NOT be visible in the UI. | |

---

## 7. Create a Behavior Plan

| # | Action | Expected Result | PASS/FAIL |
|---|--------|----------------|-----------|
| 7.1 | From the client detail page, find "Add Behavior Plan" or similar | Button/link is visible and clickable. | |
| 7.2 | Fill in: Behavior name `Elopement`, Description `Running away from designated area` | Fields accept input. | |
| 7.3 | Click Save/Create | Success. Plan appears in the client's behavior plans list. | |
| 7.4 | Click on the newly created plan | Detail view shows the behavior name and description correctly. | |

---

## 8. Log a Behavior (Clinician)

| # | Action | Expected Result | PASS/FAIL |
|---|--------|----------------|-----------|
| 8.1 | Find "Log Behavior" or navigate to behavior logging | Logging form appears. | |
| 8.2 | Select behavior type, set intensity to "high", add notes `Clinician test log` | Form accepts all inputs. Dropdowns/selectors work. | |
| 8.3 | Click Save/Submit | Success. Log appears in the behavior logs list. | |

---

## 9. Upload a Document

| # | Action | Expected Result | PASS/FAIL |
|---|--------|----------------|-----------|
| 9.1 | Find "Upload" or "Add Document" on the client detail page | Upload button/form is visible. | |
| 9.2 | Select a small PDF file (or any allowed file type) | File selector works. File name appears after selection. | |
| 9.3 | Click Upload | Success. Document appears in the documents list. | |
| 9.4 | Try uploading a .js or .exe file | Error message — file type not allowed. Upload is rejected. | |

---

## 10. Password Change (Clinician)

| # | Action | Expected Result | PASS/FAIL |
|---|--------|----------------|-----------|
| 10.1 | Find Settings, Profile, or "Change Password" option | Password change form appears. | |
| 10.2 | Enter wrong current password, new password `NewPass123!`, click Change | Error — wrong current password. | |
| 10.3 | Enter correct current password `BrowserTest123!`, new password `ab`, click Change | Error — new password too short. | |
| 10.4 | Enter correct current password `BrowserTest123!`, new password `NewBrowserPass!`, click Change | Success — password changed. | |
| 10.5 | Log out and log back in with new password `NewBrowserPass!` | Login succeeds with new password. | |

---

## 11. Log Out (Clinician)

| # | Action | Expected Result | PASS/FAIL |
|---|--------|----------------|-----------|
| 11.1 | Find and click "Log Out" or "Sign Out" | Redirected to landing page or login page. | |
| 11.2 | Try navigating back to the dashboard (press Back button or type the URL) | Should NOT show dashboard. Should redirect to login or show auth error. | |

---

## 12. Parent/Family Login

| # | Action | Expected Result | PASS/FAIL |
|---|--------|----------------|-----------|
| 12.1 | From the landing page, click "Family Login" or "Parent Login" | Access code login form appears. Shows username and access code fields. | |
| 12.2 | Enter username `browser_child`, access code `WRONG`, click Login | Error — invalid credentials. | |
| 12.3 | Enter username `browser_child`, access code `BROWSER1`, click Login | Success — parent dashboard loads. Shows child info. | |

---

## 13. Parent Dashboard

| # | Action | Expected Result | PASS/FAIL |
|---|--------|----------------|-----------|
| 13.1 | After parent login, check the dashboard | Shows child's name ("Child Alpha"). Shows quick actions or navigation tabs. | |
| 13.2 | Look for behavior plans | The "Elopement" plan created by the clinician is visible. | |
| 13.3 | Look for behavior logs | The clinician's test log is visible. | |
| 13.4 | Check for sibling info | "Child Beta" appears somewhere (sibling section or selector). | |

---

## 14. Log a Behavior (Parent)

| # | Action | Expected Result | PASS/FAIL |
|---|--------|----------------|-----------|
| 14.1 | Find "Log Behavior" or navigate to the logging page | Behavior logging form appears. | |
| 14.2 | Select a behavior type, set intensity, add notes `Parent logged this` | Form accepts input. | |
| 14.3 | Click Submit | Success. Log is saved. Confirmation shown. | |
| 14.4 | Go back to the behavior logs list | The parent's log appears alongside the clinician's log. | |

---

## 15. Change Access Code (Parent)

| # | Action | Expected Result | PASS/FAIL |
|---|--------|----------------|-----------|
| 15.1 | Find "Change Access Code" or "Change Password" in parent settings | Access code change form appears. | |
| 15.2 | Enter current code `BROWSER1`, new code `ab`, click Change | Error — too short. | |
| 15.3 | Enter current code `BROWSER1`, new code `NEWBROWSER`, click Change | Success — code changed. | |
| 15.4 | Log out and log back in with new code `NEWBROWSER` | Login succeeds with new access code. | |
| 15.5 | Try logging in with old code `BROWSER1` | Fails — old code no longer works. | |

---

## 16. Navigation & Mobile Layout

| # | Action | Expected Result | PASS/FAIL |
|---|--------|----------------|-----------|
| 16.1 | (As parent) Check bottom navigation tabs: Home, Log, AI, Messages | All tabs are visible and clickable. | |
| 16.2 | Click each tab | Each tab loads its content. No white screens or console errors. | |
| 16.3 | Click the browser Back button several times | Navigation works correctly. No stuck states. | |
| 16.4 | Resize to phone width (~400px) or use DevTools mobile mode | Layout adapts. No horizontal scrolling. Text is readable. Buttons are tappable. | |
| 16.5 | Rotate to landscape (if using mobile mode) | Layout adjusts. Nothing breaks. | |

---

## 17. AI Chat (if available)

| # | Action | Expected Result | PASS/FAIL |
|---|--------|----------------|-----------|
| 17.1 | Navigate to AI Chat tab | Chat interface appears. May show a message input box. | |
| 17.2 | Type a message like "What are some calming strategies?" and send | Either: AI responds with helpful content, OR: an error message saying AI is not configured (both acceptable — just note which). | |

---

## 18. Messages

| # | Action | Expected Result | PASS/FAIL |
|---|--------|----------------|-----------|
| 18.1 | Navigate to Messages tab | Messages interface appears. May be empty. | |
| 18.2 | If there's a compose option, send a test message | Message appears in the list after sending. | |

---

## 19. Tenant Isolation Check

| # | Action | Expected Result | PASS/FAIL |
|---|--------|----------------|-----------|
| 19.1 | Open a NEW incognito window (completely separate from the first) | Fresh browser with no cookies. | |
| 19.2 | Register a second clinician: email `other-clinician@test.dev`, password `OtherPass123!` | Registration succeeds. | |
| 19.3 | Log in as the second clinician | Dashboard loads — should be EMPTY. | |
| 19.4 | Check the clients/families list | Must show ZERO clients. The first clinician's "Test Family" must NOT appear. | |
| 19.5 | Check behavior logs, check-ins, win logs lists | All must be EMPTY. No data from the first clinician leaks through. | |

**This is the most critical security test. If the second clinician sees ANY data from the first clinician, that is a BLOCKER — stop testing and report immediately.**

---

## 20. Error Handling

| # | Action | Expected Result | PASS/FAIL |
|---|--------|----------------|-----------|
| 20.1 | Navigate to a URL that doesn't exist (e.g., `/this-page-does-not-exist`) | Shows a 404 page or redirects to home. No raw server error or stack trace. | |
| 20.2 | Open DevTools Network tab, then navigate around the app | No requests return 500 status. No requests show raw stack traces in the response body. | |

---

## Summary

| Section | Tests | What it covers |
|---------|-------|---------------|
| 1. Landing Page | 4 | Page loads, responsive, no errors |
| 2. Registration | 5 | Validation, success, duplicate detection |
| 3. Login | 4 | Wrong password, success, session state |
| 4. Dashboard | 3 | Loads, navigation works |
| 5. Create Client | 7 | Family + children creation, list verification |
| 6. Client Detail | 3 | Detail view, no credential leak |
| 7. Behavior Plan | 4 | CRUD through UI |
| 8. Log Behavior (Clinician) | 3 | Clinician logging flow |
| 9. Upload Document | 4 | Upload success, type rejection |
| 10. Password Change | 5 | Validation, success, login with new password |
| 11. Log Out | 2 | Session ends, can't go back |
| 12. Parent Login | 3 | Access code auth, error handling |
| 13. Parent Dashboard | 4 | Child data, plans, logs, siblings |
| 14. Log Behavior (Parent) | 4 | Parent logging flow |
| 15. Change Access Code | 5 | Validation, success, old code fails |
| 16. Navigation & Mobile | 5 | Tabs, back button, responsive layout |
| 17. AI Chat | 2 | Chat loads, sends message |
| 18. Messages | 2 | Messages interface works |
| 19. Tenant Isolation | 5 | Second clinician sees zero data |
| 20. Error Handling | 2 | No 500s, no stack traces |
| **Total** | **76** | |

---

## After Testing

1. **Remove rate limit override:** In Replit AI chat: `Remove the environment variable DISABLE_RATE_LIMIT and restart the API server.`
2. **Report results:** Copy this file, fill in PASS/FAIL column, note any failures with screenshots.
3. **Critical failures** (stop testing, report immediately):
   - Tenant isolation breach (test 19.4 or 19.5)
   - Access code hash visible in UI (test 6.3)
   - Stack traces in error responses (test 20.2)
   - White screen on any page load
