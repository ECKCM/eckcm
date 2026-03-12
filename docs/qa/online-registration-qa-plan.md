# ECKCM Online Registration — QA Test Plan

> **Methodology**: Zero Script QA (manual browser testing + log analysis via `docker compose logs -f`)
> **Date**: 2026-03-11
> **Implementation State**: 218/231 items (94% match rate, PDCA Act-5 complete)
> **Environment**: Next.js 16 + Supabase (ldepcbxuktigbsgnufcb) + Stripe + Tailwind v4

---

## 1. QA Scope

### In Scope (implemented features)

- Authentication: email signup, OAuth, profile completion, password reset
- Registration wizard: all 8 steps, self-registration, register-for-others, minor with guardian consent
- Payment: Stripe card/bank/ACH, Zelle manual, free registration, donor covers fees toggle
- Confirmation: email, E-Pass generation, status polling
- User dashboard: registrations, receipts, E-Pass viewer, settings
- Admin: registrations list, refund flow, manual payment, check-in (self/kiosk/session), lodging, participants, events

### Out of Scope (intentionally deferred, do NOT test)

- Public manual payment page `/pay/[code]` — not implemented
- Donation page `/donate` — not implemented
- Google Sheets sync — not implemented
- PWA offline check-in (no service worker) — not implemented

---

## 2. Test Environment Setup

### Prerequisites

1. App running locally: `npm run dev` (or via Docker)
2. Supabase project connected (`ldepcbxuktigbsgnufcb`)
3. Stripe test mode configured with test API keys
4. At least one active event configured: ECKCM Summer Camp 2026 (eventId in DB)
5. At least one registration group configured (default group)
6. Admin account: scottchanyoungkim@gmail.com (SUPER_ADMIN)

### Log Monitoring Setup

Start monitoring before each test session:

```bash
# If running via Docker
docker compose logs -f | grep -E '"level":"(ERROR|WARNING)"'

# Capture all logs for review
docker compose logs -f > /tmp/qa-session-$(date +%Y%m%d-%H%M%S).log
```

### Test User Accounts

Create fresh test accounts for each major flow to avoid state contamination:

| Role | Email | Purpose |
|------|-------|---------|
| Fresh user | testuser+qa1@example.com | Self-registration |
| Fresh user | testuser+qa2@example.com | Register for others |
| Fresh user | testuser+qa3@example.com | Minor registration |
| Admin | scottchanyoungkim@gmail.com | Admin operations |

---

## 3. Test Cases

### Priority 1: Critical Paths (Must Pass)

---

#### TC-AUTH-01: Email Signup with Profile Completion

**Flow**: `/signup` → `/signup/complete-profile` → `/dashboard`

**Steps**:
1. Navigate to `/signup`
2. Click "Sign up with Email"
3. Fill in Email, Confirm Email, Password (8+ chars), Confirm Password
4. Fill in First Name, Last Name, Gender
5. Check "I confirm that I am at least 13 years old"
6. Check "I agree to the Terms of Service and Privacy Policy"
7. Complete Turnstile CAPTCHA widget
8. Click "Create Account"
9. Check email inbox for confirmation email
10. Click confirmation link in email
11. Verify redirect to `/dashboard`

**Expected Results**:
- Turnstile widget appears and must be completed before submission
- Age confirmation and Terms checkboxes are required — form blocked without them
- Confirmation email arrives within 60 seconds
- After email confirmation, user lands on `/dashboard`
- Profile appears complete — no redirect back to complete-profile

**Failure Indicators**:
- `ERROR` log at `/api/auth/callback`
- Form submits without CAPTCHA (security issue)
- Redirect loops between dashboard and complete-profile

---

#### TC-AUTH-02: OAuth Signup (Google/Apple)

**Flow**: `/signup` → OAuth provider → `/signup/complete-profile` → `/dashboard`

**Steps**:
1. Navigate to `/signup`
2. Click Google (or Apple) OAuth button
3. Complete OAuth provider flow
4. Verify redirect to `/signup/complete-profile`
5. Fill in profile fields (no email/password fields visible)
6. Submit
7. Verify redirect to `/dashboard`

**Expected Results**:
- No email/password fields shown for OAuth users
- Profile is saved and `profile_completed = true`
- Subsequent logins skip complete-profile

---

#### TC-AUTH-03: Login with Email/Password

**Steps**:
1. Navigate to `/login`
2. Enter valid credentials
3. Complete Turnstile CAPTCHA
4. Click "Sign In"
5. Verify redirect to `/dashboard`

**Expected Results**:
- Dashboard loads with user's registrations and active events
- Wrong password shows error inline (not page refresh)
- Turnstile is required

**Error Case**: Enter wrong password
- Inline error message shown (not generic)
- Turnstile resets after failed attempt

---

#### TC-AUTH-04: Password Reset Flow

**Steps**:
1. Navigate to `/login`, click "Forgot Password?"
2. Enter registered email address
3. Submit
4. Check email for reset link
5. Click reset link → `/reset-password`
6. Enter new password, confirm
7. Submit
8. Verify redirect to `/login?message=password_updated`
9. Log in with new password

**Expected Results**:
- Green "Password updated successfully" message shown on login page after reset
- Old password no longer works
- New password allows login

---

#### TC-REG-01: Complete Self-Registration (Happy Path)

**Flow**: Dashboard → Register → 8-step wizard → Payment → Confirmation

**Steps**:
1. Log in as fresh test user
2. On dashboard, click "Register" for ECKCM Summer Camp 2026
3. Verify "self" mode — no blue info box
4. Step 1 (Dates): Verify dates pre-populated with event dates. Click "Next"
5. Step 2 (Instructions): Read content, check agreement checkbox, click "Next"
6. Step 3 (Participants): Add self as representative with all required fields:
   - First Name, Last Name, Gender, Birth Date
   - Church (select from list or "Other")
   - Department
   - T-Shirt size
   - Email and Phone
7. Click "Next"
8. Step 4 (Lodging): Select lodging type, add preferences if needed, click "Next"
9. Step 5 (Key Deposit): Set key count, click "Next"
10. Step 6 (Airport Pickup): Skip (click "No, I'll arrange my own"), click "Next"
11. Step 7 (Review): Verify summary — dates, participants, pricing breakdown
12. Add optional additional request text
13. Click "Next: Payment"
14. Step 8 (Payment): Verify Stripe PaymentElement loads with amount
15. Use Stripe test card `4242 4242 4242 4242`, exp 12/27, CVC 123
16. Click "Pay $X.XX"
17. Verify redirect to `/register/[eventId]/confirmation`
18. Verify status changes from "loading" to "paid"
19. Check test email inbox for confirmation email

**Expected Results**:
- Pricing breakdown matches lodging/registration fees configured in admin
- Stripe PaymentElement renders without errors
- After successful payment: confirmation code shown, status = PAID
- Confirmation email received with E-Pass link
- Dashboard shows registration with PAID status

**Log Checkpoints**:
- No ERROR logs during `/api/registration/submit`
- No ERROR logs during `/api/payment/create-intent`
- No ERROR logs during `/api/payment/confirm`
- Log shows `[payment/confirm] E-Pass tokens generated` with correct count

---

#### TC-REG-02: Register for Someone Else (Others Mode)

**Steps**:
1. Log in as test user
2. On dashboard, click "Register for Someone Else" (or equivalent button)
3. Verify blue info box: "Registering on behalf of another group" with signed-in user's name/email
4. Complete all steps with a different person's information as representative
5. Submit registration through to payment
6. Complete payment
7. Verify registration appears in dashboard under "registrations"

**Expected Results**:
- `registration_type = "others"` stored in DB
- Duplicate check is skipped (user can register both for self and others)
- Registration linked to logged-in user's account
- Confirmation code generated with other person's last name

---

#### TC-REG-03: Minor Registration with Guardian Consent

**Steps**:
1. Start registration wizard (self or others mode)
2. In Step 3 (Participants), add a participant under 18 (set birth year to make them ~10 years old)
3. Verify guardian fields appear automatically
4. Fill in Guardian Name, Guardian Phone
5. Fill in Guardian Signature (type name)
6. Proceed through remaining steps
7. Complete registration and payment

**Expected Results**:
- Guardian fields appear automatically when age < 18
- Guardian consent fields are required — cannot proceed without them
- Guardian data saved correctly: `guardian_name`, `guardian_phone`, `guardian_signature` in `eckcm_people`
- Admin table shows guardian information in participant record

---

#### TC-REG-04: Free Registration (Zero Amount)

**Prerequisite**: Configure a fee category at $0 or test with a registration group that has $0 registration fee.

**Steps**:
1. Complete registration wizard steps 1-7
2. On Step 7 (Review), verify total shows $0.00
3. Click "Next: Payment"
4. Verify "No Payment Required" card is shown with "Continue" button
5. Click "Continue"
6. Verify redirect to confirmation page

**Expected Results**:
- `create-intent` API returns 400 with `error: "Invalid payment amount"` (correct)
- Payment page handles this by showing "No Payment Required" state
- Confirmation flow proceeds without Stripe payment
- Registration status set to PAID (or SUBMITTED, per business rule)

---

#### TC-PAY-01: Zelle Manual Payment Flow

**Steps**:
1. Complete registration wizard through Review step
2. Submit registration (creates DRAFT registration)
3. On payment page, verify "Manual Payment" tab is visible (if Zelle is enabled)
4. Click "Manual Payment" tab
5. Verify Zelle instructions show:
   - Correct amount
   - Zelle email: kimdani1@icloud.com
   - Account holder: EMPOWER MINISTRY GROUP, INC
   - Confirmation code with registrant info in memo field
6. Check "I agree to send the Zelle payment" checkbox
7. Click "Complete Registration"
8. Verify redirect to confirmation page with "payment=zelle" in URL
9. Verify confirmation page shows "Payment Processing" state (not PAID)

**Expected Results**:
- Zelle memo includes: `{code} - {registrantName} - {phone} - {email}`
- Registration status remains SUBMITTED (not PAID) after Zelle submission
- Confirmation page shows yellow clock icon (pending, not green checkmark)
- Dashboard shows "Pending Payment" status

---

#### TC-PAY-02: Donor Covers Fees Toggle

**Prerequisite**: Admin has enabled "Donor Covers Fees" in payment settings.

**Steps**:
1. Reach payment page with a paid registration
2. Verify "I'd like to cover the payment processing fee" checkbox is visible
3. Note base amount displayed
4. Check the checkbox
5. Verify amount updates (increases by Stripe fee: 2.9% + $0.30)
6. Uncheck checkbox
7. Verify amount reverts to base amount
8. Complete payment with fees covered

**Expected Results**:
- Fee calculation: `Math.ceil((base + 30) / (1 - 0.029))` — verify matches display
- Amount on Stripe PaymentIntent updates correctly
- `feeCents` shown as line item in order summary when fees covered

---

#### TC-PAY-03: Payment Intent Idempotency (Refresh During Payment)

**Steps**:
1. Reach payment page (PaymentIntent created)
2. Refresh the page (F5) without completing payment
3. Verify payment form reloads correctly
4. Complete payment

**Expected Results**:
- No duplicate PaymentIntents created (reuses existing PENDING intent)
- No duplicate payment records in DB
- Payment completes successfully
- Log shows existing PI reused, not a new one created

---

#### TC-PAY-04: Apple Pay / Google Pay (Wallet Payment)

**Prerequisite**: Testing on a device/browser that supports Apple Pay or Google Pay.

**Steps**:
1. Reach payment page
2. Verify "express checkout" wallet buttons appear above payment form (if `wallet` method is enabled and not in test mode)
3. Complete payment via wallet

**Note**: Wallet buttons are hidden when `paymentTestMode = true` on the event. Use a live-mode event or toggle off payment test mode.

**Expected Results**:
- `PaymentRequestButtonElement` renders (Apple Pay or Google Pay button)
- Payment flow works via native wallet sheet
- On success, same confirmation flow triggers

---

#### TC-CONFIRM-01: Post-Payment Confirmation and E-Pass

**Steps**:
1. Complete a successful Stripe payment
2. Wait on confirmation page
3. Verify status polling resolves to "paid" (green checkmark)
4. Check email for confirmation email
5. Click "View E-Pass" on confirmation page
6. Verify E-Pass shows all participants

**Expected Results**:
- Confirmation page polls `eckcm_registrations.status` every 2 seconds, max 10 attempts
- Status resolves to PAID within ~4-6 seconds after payment confirm API called
- Confirmation email contains participant names and confirmation code
- E-Pass displays correctly at `/dashboard/epass`

---

### Priority 2: Core Features (Should Pass)

---

#### TC-DASH-01: Dashboard Registration Management

**Steps**:
1. Log in as user with existing PAID registration
2. Verify dashboard shows: event name, confirmation code, status badge
3. Click on registration to see details
4. Verify "View E-Pass" link works
5. Verify "Cancel" option is available for SUBMITTED registrations (if applicable)

**Expected Results**:
- Active event displayed with correct registration status
- "Register" button hidden if already registered (when `allow_duplicate_registration = false`)
- "Register for Someone Else" button always available

---

#### TC-DASH-02: E-Pass Viewer

**Steps**:
1. Navigate to `/dashboard/epass`
2. Verify list of E-Passes for all participants in registration
3. Click individual E-Pass
4. Verify `/dashboard/epass/[id]` shows QR code

**Expected Results**:
- Each participant has a unique E-Pass token
- QR code is scannable
- E-Pass shows: participant name, confirmation code, event dates

---

#### TC-REG-05: Multiple Room Groups

**Steps**:
1. Start registration
2. In Step 3 (Participants), add first participant to Group 1
3. Click "Add Another Group"
4. Add participant(s) to Group 2
5. Set different lodging preferences per group
6. Complete registration

**Expected Results**:
- Multiple groups created in `eckcm_groups` table
- Display group codes: `{code}-G01`, `{code}-G02`
- Pricing calculation includes lodging for all groups
- Review step shows each group separately

**Limit Testing**: Try adding more than MAX_GROUPS (check constant) — should be blocked.

---

#### TC-REG-06: Saved Person Autofill

**Prerequisite**: User has previously registered and has `eckcm_user_people` entries.

**Steps**:
1. Start a new registration
2. In Step 3 (Participants), click "Add Participant"
3. Verify autofill suggestions appear for previously registered persons
4. Select a saved person
5. Verify fields auto-populate

**Expected Results**:
- Saved persons from `eckcm_user_people` → `eckcm_people` appear as suggestions
- Autofill populates: name, gender, birth date, church, department

---

#### TC-REG-07: Access Code Routing

**Prerequisite**: A registration group exists with a specific access code (e.g., "VIP001").

**Steps**:
1. Start registration
2. In Step 1, enter the access code
3. Verify code auto-uppercases and strips non-alphanumeric characters
4. Proceed to see if correct group is selected

**Expected Results**:
- Matching access code → assigns that registration group
- Invalid access code → error toast "Invalid access code"
- Empty access code → falls back to default group

---

#### TC-ADMIN-01: Admin Registrations List

**Steps**:
1. Log in as admin (scottchanyoungkim@gmail.com)
2. Navigate to `/admin/registrations`
3. Verify table loads with registrations
4. Verify columns include: name, confirmation code, status, payment method, amount, participants count
5. Filter by event using event selector
6. Search for a registration by name or code

**Expected Results**:
- Table renders without errors
- All registered participants appear
- Filtering and search work correctly

---

#### TC-ADMIN-02: Admin Manual Payment Approval (Zelle)

**Steps**:
1. Create a Zelle registration (TC-PAY-01)
2. Log in as admin
3. Navigate to `/admin/registrations`
4. Find the SUBMITTED (pending) Zelle registration
5. Open registration detail
6. Click "Mark as Paid" or "Record Manual Payment"
7. Confirm payment recorded

**Expected Results**:
- Registration status changes to PAID
- Payment record created in `eckcm_payments` with method ZELLE
- E-Pass tokens generated if not already present
- Audit log entry created

---

#### TC-ADMIN-03: Admin Refund Flow (Stripe)

**Prerequisite**: A PAID registration with Stripe payment exists.

**Steps**:
1. Log in as admin
2. Navigate to `/admin/registrations`
3. Find a PAID Stripe registration
4. Open refund dialog
5. Enter partial refund amount
6. Submit refund
7. Verify refund shows in Stripe dashboard
8. Verify registration status updates

**Expected Results**:
- Stripe refund created via API
- `eckcm_refunds` record created
- `eckcm_payments.status` = PARTIALLY_REFUNDED (partial) or REFUNDED (full)
- Audit log: `ADMIN_REFUND_INITIATED`
- On full refund: E-Pass tokens deactivated, registration status = REFUNDED

**Race Condition Test**: Try submitting two refunds simultaneously — only one should succeed (RefundOverLimitError guard).

---

#### TC-ADMIN-04: Check-in Scanner

**Steps**:
1. Log in as admin, navigate to `/admin/checkin`
2. Open the QR scanner tab
3. Scan a valid E-Pass QR code
4. Verify participant info appears in `scan-result-card`
5. Confirm check-in
6. Scan the same QR code again
7. Verify "already checked in" indicator

**Expected Results**:
- Scanner opens camera on supported browsers
- Valid QR code shows participant name, event, registration status
- Duplicate scan shows warning (not a clean success)
- `eckcm_checkins` record created

---

#### TC-ADMIN-05: Check-in Self Mode and Kiosk Mode

**Self Mode** (`/admin/checkin/self`):
1. Admin navigates to self check-in
2. Admin searches for their own participant record
3. Confirms check-in

**Kiosk Mode** (`/admin/checkin/kiosk`):
1. Admin activates kiosk mode
2. Participant scans their own E-Pass
3. Verify check-in recorded without admin intervention

---

#### TC-ADMIN-06: Event Management

**Steps**:
1. Navigate to `/admin/events`
2. View ECKCM Summer Camp 2026 event
3. Click event to view details
4. Verify: name, dates, stripe_mode, registration groups
5. Navigate to `/admin/events/[eventId]` (event detail page)

**Expected Results**:
- Event details load correctly
- Stripe mode (test/live) visible
- Associated registration groups listed

---

#### TC-EPASS-01: Public E-Pass Viewer

**Steps**:
1. Get an E-Pass token from a PAID registration
2. Navigate to `/epass/[token]` (public, no login required)
3. Verify participant information displayed

**Expected Results**:
- Page accessible without authentication
- Shows: participant name, event, check-in status
- QR code for offline scanning displayed

---

### Priority 3: Edge Cases and Error Handling

---

#### TC-EDGE-01: Duplicate Registration Prevention

**Steps**:
1. Complete a full registration for an event (PAID)
2. Attempt to register for the same event again (self mode)
3. Verify blocked on Step 1 of registration wizard

**Expected Results**:
- "Already Registered" card shown with confirmation code
- "Go to Dashboard" button navigates back
- No second registration created in DB

---

#### TC-EDGE-02: DRAFT Registration Cleanup on New Registration

**Steps**:
1. Start registration, reach review step but do NOT complete payment (leave DRAFT)
2. Start a new registration for the same event
3. Verify new registration proceeds (old DRAFT cancelled)
4. Complete new registration

**Expected Results**:
- On submit of new registration, old DRAFT with same user/event/non-others is set to CANCELLED
- New registration created successfully
- DB should have 1 CANCELLED + 1 DRAFT (new) registrations

---

#### TC-EDGE-03: Payment Intent Already Paid (Re-visit Payment Page)

**Steps**:
1. Complete payment successfully
2. Use browser back button to return to payment page
3. Attempt to pay again

**Expected Results**:
- `create-intent` returns 409 "Registration already paid" for PAID status
- Or "Invoice already paid" for SUCCEEDED invoice
- Payment form shows error message, links back to dashboard

---

#### TC-EDGE-04: Rate Limiting

**Steps**:
1. Submit the registration form 6 times rapidly (limit is 5/minute per user)
2. Verify 429 response on 6th attempt

**Expected Results**:
- `POST /api/registration/submit` returns 429 after 5 attempts within 60 seconds
- `POST /api/payment/create-intent` rate-limited at 10/minute
- Error message shown to user: "Too many requests"

---

#### TC-EDGE-05: Profanity Filter

**Steps**:
1. In participant name or additional requests, enter a word that would trigger the profanity filter
2. Submit registration

**Expected Results**:
- Validation rejects submission
- Error message indicates content is not allowed
- Check `src/lib/utils/profanity-filter.ts` for exact behavior

---

#### TC-EDGE-06: Invalid Date Range

**Steps**:
1. In Step 1 (Dates), try to set check-in date after event end date
2. Try to set 0 nights

**Expected Results**:
- DateRangePicker enforces event start/end boundaries
- "Minimum 1 night stay required" error if nightsCount < 1
- Cannot select dates outside event range

---

#### TC-EDGE-07: Registration with Maximum Participants per Group

**Steps**:
1. Try to add more than MAX_PARTICIPANTS_PER_GROUP to a single group
2. Verify limit enforced

**Expected Results**:
- "Add Participant" button disabled or hidden at limit
- Toast error if attempted

---

#### TC-EDGE-08: Unauthenticated Access to Protected Routes

**Steps**:
1. Log out
2. Try to navigate directly to `/register/[eventId]/participants`
3. Try to navigate to `/dashboard`
4. Try to navigate to `/admin/registrations`

**Expected Results**:
- All protected routes redirect to `/login`
- Admin routes redirect non-admin users appropriately
- No data leakage in error responses

---

#### TC-EDGE-09: Missing Registration ID on Payment Page

**Steps**:
1. Navigate directly to `/register/[eventId]/payment` without `registrationId` query param

**Expected Results**:
- "No registration found" error card shown
- "Return to Dashboard" button available
- No API calls attempted without registrationId

---

#### TC-EDGE-10: Stripe Test Mode vs Live Mode

**Steps**:
1. Check event's `stripe_mode` setting in admin
2. If `test`, verify Stripe test key used and test cards work
3. If `live`, verify real Stripe key used (should only use real cards)
4. Verify `paymentTestMode` flag: when enabled, charge amount = $1.00 regardless of actual total

**Expected Results**:
- Test mode: charge $1.00 when `payment_test_mode = true`
- Live mode: charge actual amount
- No mixing of test and live Stripe keys

---

### Priority 4: Admin Settings and Configuration

---

#### TC-ADMIN-07: Form Field Configuration

**Steps**:
1. Navigate to `/admin/settings/form-fields`
2. Verify `eckcm_form_field_config` table data is displayed
3. Toggle a field's visibility or requirement status
4. Verify change reflected in registration wizard participant form

---

#### TC-ADMIN-08: Email Settings and Test

**Steps**:
1. Navigate to `/admin/settings/email`
2. View current email configuration (from/reply-to)
3. Send a test email via `/api/email/test`
4. Verify email received
5. Check email logs at `/api/admin/email/logs`

---

#### TC-ADMIN-09: Stripe Settings

**Steps**:
1. Navigate to `/admin/settings/stripe`
2. Verify current Stripe configuration displayed
3. View stripe-sync status at `/api/admin/stripe-sync`

---

#### TC-ADMIN-10: Registration Group Settings

**Steps**:
1. Navigate to `/admin/settings/groups`
2. View existing groups
3. Verify fee categories linked per group
4. Early bird deadline displayed correctly

---

## 4. Test Execution Tracking

### Test Run Template

For each test session, track:

| Test Case | Status | Notes | Timestamp |
|-----------|--------|-------|-----------|
| TC-AUTH-01 | PASS / FAIL / SKIP | | |
| TC-AUTH-02 | | | |
| TC-AUTH-03 | | | |
| TC-AUTH-04 | | | |
| TC-REG-01 | | | |
| TC-REG-02 | | | |
| TC-REG-03 | | | |
| TC-REG-04 | | | |
| TC-PAY-01 | | | |
| TC-PAY-02 | | | |
| TC-PAY-03 | | | |
| TC-PAY-04 | | | |
| TC-CONFIRM-01 | | | |
| TC-DASH-01 | | | |
| TC-DASH-02 | | | |
| TC-REG-05 | | | |
| TC-REG-06 | | | |
| TC-REG-07 | | | |
| TC-ADMIN-01 | | | |
| TC-ADMIN-02 | | | |
| TC-ADMIN-03 | | | |
| TC-ADMIN-04 | | | |
| TC-ADMIN-05 | | | |
| TC-ADMIN-06 | | | |
| TC-EPASS-01 | | | |
| TC-EDGE-01 | | | |
| TC-EDGE-02 | | | |
| TC-EDGE-03 | | | |
| TC-EDGE-04 | | | |
| TC-EDGE-05 | | | |
| TC-EDGE-06 | | | |
| TC-EDGE-07 | | | |
| TC-EDGE-08 | | | |
| TC-EDGE-09 | | | |
| TC-EDGE-10 | | | |

---

## 5. Issue Documentation Template

When a test fails, document using this format:

```
## ISSUE-XXX: {Title}

- **Test Case**: TC-XXX
- **Severity**: Critical / High / Medium / Low
- **Reproduction Steps**:
  1.
  2.
  3.
- **Expected**: {what should happen}
- **Actual**: {what happened}
- **Logs** (from docker compose logs):
  {relevant log lines}
- **File(s)**: `src/path/to/file.ts:line`
- **Recommended Fix**: {description}
```

---

## 6. Known Limitations (Not Bugs)

These are intentionally deferred items that will appear "broken" — do NOT log as issues:

1. `/pay/[code]` — 404 page (not implemented)
2. `/donate` — 404 page (not implemented)
3. Google Sheets sync button in admin — will fail or show "not configured"
4. Offline mode for check-in — will not work (no service worker)
5. `eckcm_meal_rules` — Meals admin page doesn't query this table; uses `registration_selections` instead
6. PWA install prompt — not available (no service worker)

---

## 7. Code-Reviewable Items (No Browser Testing Needed)

These items were verified through code review and do not require manual browser testing:

### Security Verified by Code Review

| Item | File | Status |
|------|------|--------|
| Rate limiting on registration submit | `src/app/api/registration/submit/route.ts:82` | 5 req/60s per user |
| Rate limiting on payment create-intent | `src/app/api/payment/create-intent/route.ts:20` | 10 req/60s per user |
| Admin route protection | All `/api/admin/*` routes use `requireAdmin()` | Enforced |
| Ownership check on payment confirm | `confirm/route.ts:112` — `created_by_user_id !== user.id` | Enforced |
| Ownership check on create-intent | `create-intent/route.ts:48` | Enforced |
| PaymentIntent metadata verification | `confirm/route.ts:148-155` — registrationId + userId match | Enforced |
| Refund over-limit guard | `refund.service.ts` — `RefundOverLimitError` + post-insert guard | Implemented |
| Cleanup on failed registration | `submit/route.ts:16-68` — cascading cleanup on any step failure | Implemented |

### Architecture Verified by Code Review

| Item | Finding |
|------|---------|
| Stripe webhook removal | Intentional architectural decision — synchronous confirm pattern instead (documented in analysis v7.0) |
| Duplicate PI prevention | Idempotency key `pi_create_{invoice.id}` on PaymentIntent creation |
| Free registration handling | `create-intent` returns 400 with `"Invalid payment amount"` → payment page shows "No Payment Required" UI |
| DRAFT cancellation on re-register | `submit/route.ts:134-143` cancels old DRAFTs before creating new registration |
| E-Pass idempotency | `confirm/route.ts:36-44` skips existing tokens, only inserts new ones |
| Confirmation email non-blocking | Uses `after()` from `next/server` — runs after response sent, won't timeout user |
| Admin client for submit | Uses admin Supabase client (bypasses RLS) for server-side multi-table inserts |

---

## 8. Browser and Device Coverage

### Required

- Chrome (latest) on desktop — primary testing
- Safari on iOS — wallet payment testing (Apple Pay)
- Mobile Chrome on Android — responsive layout testing

### Recommended

- Firefox on desktop — layout/form compatibility
- Safari on macOS — Apple Pay in desktop browser

---

## 9. Acceptance Criteria

### Pass Threshold for Production Readiness

| Category | Required Pass Rate |
|----------|--------------------|
| Priority 1 (Critical) | 100% — all 13 test cases must pass |
| Priority 2 (Core) | 90%+ — at most 1-2 failures allowed |
| Priority 3 (Edge) | 80%+ — document any failures |
| Priority 4 (Admin) | 80%+ — document any failures |

### Blocking Issues (must fix before production)

- Any test case in TC-AUTH-*, TC-REG-01, TC-PAY-01 that fails
- Any security check failure (unauthenticated access, ownership bypass)
- Any data corruption issue (duplicate records, phantom payments)
- Admin refund flow failures

### Non-blocking Issues (can ship with known issues)

- TC-PAY-04 (Apple Pay / Google Pay) — environment-dependent
- TC-EDGE-04 (Rate limiting) — can verify via logs without full browser test
- TC-ADMIN-05 (Kiosk mode) — secondary check-in path
