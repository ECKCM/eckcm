# QR Code Check-in System — Gap Analysis Report

## Analysis Overview
- **Feature**: QR Code Check-in / Check-out / Meal Check-in
- **Analysis Date**: 2026-03-25
- **Match Rate**: 87%
- **Status**: WARN (needs iteration)

## Overall Scores

| Category | Score | Status |
|----------|:-----:|:------:|
| API Implementation | 100% | PASS |
| Scanner Components | 100% | PASS |
| Type Definitions | 89% | WARN |
| Offline Support | 75% | WARN |
| Code Quality | 70% | WARN |
| **Overall** | **87%** | WARN |

## Checkpoint Results (10 Items)

| # | Checkpoint | Result |
|---|-----------|:------:|
| 1 | All 5 Scanner components have `onError` prop with camera error UI | PASS |
| 2 | All 5 Scanner components use `parseQRValue()` supporting both formats | PASS |
| 3 | Meal check-in sends `checkinType: "DINING"`, `mealDate`, `mealType` | PASS |
| 4 | Check-out API correctly updates `checked_out_at` and `checked_out_by` | PASS |
| 5 | Verify API validates DINING requires mealDate + mealType | PASS |
| 6 | Batch-sync supports meal fields for offline DINING check-ins | PARTIAL |
| 7 | ScanResult type includes checkout statuses, meal info, timestamps | PASS |
| 8 | Stats API returns checkout count and meal breakdown | PASS |
| 9 | Navigation includes links to meal and checkout pages | PASS |
| 10 | Offline store CheckinLogEntry supports checkout statuses | PASS |

## Findings

### [ISSUE-1] PendingCheckin lacks meal fields — offline DINING sync broken
- **Severity**: High
- **Location**: `src/lib/checkin/offline-store.ts:20-27`
- `PendingCheckin` interface missing `mealDate` and `mealType` fields
- `meal-checkin-client.tsx` has no offline fallback — network errors show generic error with no queuing
- **Fix**: Add meal fields to PendingCheckin, add offline support to meal scanner

### [ISSUE-2] parseQRValue() duplicated 5 times
- **Severity**: Medium
- **Locations**: All 5 scanner components
- **Fix**: Extract to `src/lib/checkin/parse-qr.ts`

### [ISSUE-3] playBeep() and vibrate() duplicated
- **Severity**: Low
- **Locations**: All 5 scanner components
- **Fix**: Extract to `src/lib/checkin/feedback.ts`

### [ISSUE-4] CheckinResult type out of sync with ScanResult
- **Severity**: Low
- **Location**: `src/lib/types/checkin.ts:49-62`

### [ISSUE-5] OfflineCheckin type is dead code
- **Severity**: Low
- **Location**: `src/lib/types/checkin.ts:67-74`

### [ISSUE-6] CheckinStats type does not match API response
- **Severity**: Low
- **Location**: `src/lib/types/checkin.ts:79-83`

### [ISSUE-7] Checkout/meal log status mapping loses actual status
- **Severity**: Low
- **Location**: `checkout-client.tsx:220`, `meal-checkin-client.tsx:284`
- Checkout status mapped to "checked_in" before IndexedDB write

## Recommended Actions

### Immediate (High)
1. Add `mealDate`/`mealType` to `PendingCheckin` in offline-store.ts
2. Add offline fallback to meal-checkin-client.tsx
3. Include meal fields in sync payload mapping

### Short-Term (Medium)
4. Extract `parseQRValue()` to shared module
5. Extract `playBeep()`/`vibrate()` to shared module

### Housekeeping (Low)
6. Remove/update dead types in checkin.ts
7. Fix status-mapping in checkout and meal log writes
