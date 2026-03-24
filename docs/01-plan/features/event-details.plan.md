# Plan: Event Details Enhancement

## Executive Summary

| Item | Detail |
|------|--------|
| Feature | Event Details Enhancement |
| Created | 2026-03-23 |
| Level | Dynamic |

### Value Delivered

| Perspective | Description |
|-------------|-------------|
| Problem | Registration dates exist in DB but aren't enforced; early bird dates must be set per-group manually; early bird fee is a raw number input with no link to fee categories |
| Solution | Enforce registration window server-side, add event-level early registration defaults that cascade to groups, and add fee category dropdown for early bird fee selection |
| Function UX Effect | Admins configure once at event level, registration auto-shows/hides for users, groups inherit defaults automatically |
| Core Value | Reduced admin error, consistent early bird behavior, date-driven registration access |

---

## 1. Feature Requirements

### 1.1 Registration Show/Hide Based on Dates

**Current State:** `registration_start_date` and `registration_end_date` are stored on `eckcm_events` but only `is_active` controls visibility. Registration dates are informational only.

**Target State:** Registration page shows/hides based on date window:
- Before `registration_start_date` → Show "Registration opens on [date]" message
- Between `registration_start_date` and `registration_end_date` → Show registration form
- After `registration_end_date` → Show "Registration is closed" message
- If dates are null → Fall back to `is_active` check only (current behavior)

**Files to modify:**
- `src/app/(protected)/register/[eventId]/layout.tsx` — Fetch registration dates, pass to guard
- `src/components/registration/registration-guard.tsx` — Add date-based access logic
- `src/app/(protected)/register/[eventId]/page.tsx` — Display status messages

### 1.2 Event-Level Early Registration Dates (Default for Groups)

**Current State:** Each registration group has its own `early_bird_deadline` (single datetime). No event-level default exists. Admin must set early bird deadline per group manually.

**Target State:**
- Add two new columns to `eckcm_events`:
  - `early_registration_start` (timestamptz, nullable)
  - `early_registration_end` (timestamptz, nullable)
- These serve as **defaults** for groups: if a group's `early_bird_deadline` is null/empty, use the event's `early_registration_end` as that group's effective early bird deadline
- Admin UI: Add early registration date range fields to Event Detail form
- Pricing logic: When evaluating `isEarlyBird`, check group-level first, then fall back to event-level dates

**Files to modify:**
- `eckcm_events` table — Add `early_registration_start`, `early_registration_end` columns (via Supabase)
- `src/app/(admin)/admin/events/[eventId]/event-detail-form.tsx` — Add early registration date inputs
- `src/app/(protected)/register/[eventId]/page.tsx` — Fetch event early registration dates
- `src/lib/services/pricing.service.ts` — Update early bird check to use event-level fallback
- API routes that build `PricingInput` — Pass event-level early dates as fallback

### 1.3 Early Registration Fee Dropdown from Fee Categories

**Current State:** `global_early_bird_fee_cents` on registration groups is a manual number input. The `EARLY_BIRD` fee category exists in `eckcm_fee_categories` but isn't linked to groups as a selectable option.

**Target State:**
- In the Groups Manager, replace the manual early bird fee input with a **dropdown** that lists fee categories (filtered to relevant ones like GENERAL category or a specific `EARLY_BIRD` code)
- When a fee category is selected, its `amount_cents` populates the `global_early_bird_fee_cents` field
- Admin can still see the resolved amount but the source is a fee category
- Add new column to `eckcm_registration_groups`: `early_bird_fee_category_id` (uuid, nullable, FK to `eckcm_fee_categories`)

**Files to modify:**
- `eckcm_registration_groups` table — Add `early_bird_fee_category_id` column (via Supabase)
- `src/app/(admin)/admin/settings/groups/groups-manager.tsx` — Replace manual input with dropdown, load fee categories
- Pricing service callers — Resolve fee from category when building `PricingInput`

---

## 2. Implementation Order

1. **DB schema changes** — Add columns to `eckcm_events` and `eckcm_registration_groups` via Supabase
2. **Event Detail form** — Add early registration date fields to admin UI
3. **Groups Manager dropdown** — Replace early bird fee input with fee category dropdown
4. **Registration date enforcement** — Update layout/guard to check registration window
5. **Pricing service update** — Add event-level early bird date fallback logic
6. **Testing** — Verify all three features end-to-end

---

## 3. Scope Boundaries

### In Scope
- Server-side registration date enforcement
- Event-level early registration date defaults
- Fee category dropdown for early bird fee
- Admin UI changes for event detail and groups manager

### Out of Scope
- Manual Payment "Check" method (separate feature)
- Admin registrations popup refactor (separate feature)
- Email notifications for registration window changes
- Public countdown timer for registration opening

---

## 4. Risk Assessment

| Risk | Mitigation |
|------|------------|
| Existing groups with manual early_bird_fee_cents | Keep column, dropdown writes to both `early_bird_fee_category_id` and `global_early_bird_fee_cents` for backward compatibility |
| Null registration dates | Fall back to current `is_active` behavior — no breaking change |
| Groups without early_bird_deadline relying on no-early-bird | Event-level dates only apply as fallback when group deadline is null AND event dates are set |
