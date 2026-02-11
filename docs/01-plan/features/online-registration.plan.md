# Plan: ECKCM Online Registration & Management System

> Feature: `online-registration`
> Created: 2026-02-11
> Status: Draft
> Level: Dynamic (Next.js + Supabase + Stripe)

---

## 1. Overview

ECKCM(Eastern Korean Churches Camp Meeting)은 미국 한국 교회 연합 야영회/수련회를 위한 온라인 참가자 등록 및 관리 시스템이다. 매년 6월 말, 7일간 University of Pittsburgh at Johnstown에서 개최되며, 항공사/호텔 예약 시스템과 유사한 다중 등록 구조를 제공한다.

### 핵심 목적
- 참가자 온라인 등록 (멀티 그룹, 멀티 참가자)
- 개인 Profile Dashboard (E-Pass, 영수증, 등록 정보)
- 관리자 Dashboard (참가자 관리, 숙소 배정, 체크인, 결제, 인쇄)
- 오프라인/온라인 하이브리드 체크인

---

## 2. Tech Stack

| Category | Technology |
|----------|-----------|
| Framework | Next.js (App Router) + PWA (skipWaiting: true) |
| Styling | Tailwind CSS + shadcn/ui (Mobile-first Responsive) |
| Font | Pretendard (CDN) + system fallback |
| Backend | Supabase (Auth, DB, RLS, Realtime, Storage) |
| Payment | Stripe (Live/Test mode, Elements, Apple/Google Pay, ACH) |
| Email | Resend |
| Auth | Google OAuth, Apple OAuth, Email/Password |
| Deployment | Vercel |
| i18n | Korean / English (default: English) |
| Real-time | Supabase Realtime (DB Changes / Broadcast) |
| External | Google Sheets (read-only sync) |

---

## 3. Domain Bounded Contexts

### A. Identity & Access
- OAuth (Google, Apple) + Email/Password 회원가입
- User Profile (개인정보 입력 필수)
- Staff Assignments (이벤트 스코프 기반 역할)
- RBAC: SUPER_ADMIN, EVENT_ADMIN, ROOM_COORDINATOR, CHECKIN_STAFF, SESSION_CHECKIN_STAFF, DINING_CHECKIN_STAFF, KEY_DEPOSIT_STAFF, CUSTOM
- Granular Permissions (participant.read, checkin.main, group.member.assign 등)

### B. Event & Catalog
- Event 생성/관리 (연도별, 날짜 범위, activate/deactivate)
- Registration Group (Access Code, 가격 오버라이드)
- Fee Categories (FLAT, PER_NIGHT, PER_MEAL, RULED)
- Departments (한/영), Church List (영어)
- Form Field Manager (등록 그룹별 필드 표시/숨김)

### C. People & Registration
- Person (참가자 실체, User와 1:1 연결)
- Registration (DRAFT -> SUBMITTED -> PAID -> CANCELLED -> REFUNDED)
- Group (Room Group, display code G0001)
- Group Memberships (LEADER / MEMBER)
- 6자리 Confirmation Code (욕 필터 포함)

### D. Lodging
- Building / Floor / Room 계층 구조
- Magic Room Generator
- Room Assignment Workflow (Pending -> Assigned)
- 특별 요청 (어르신, 장애인, 1층)

### E. Meals
- Meal Rules (기간, 제외일, 가격)
- Meal Selections (개인 x 날짜 x meal_type)
- 가격 정책: Adult $18/각, Youth $10/각, 하루 3끼 Adult $45, Youth $25
- 이벤트 시작일 기준 4세 이하 무료
- 도착/출발일 partial meal 선택

### F. Payments & Invoicing
- Stripe Custom Checkout (Elements)
- 결제수단: Apple Pay, Google Pay, Credit Card, ACH, Check(ACH 처리), Zelle
- Invoice 라인아이템 스냅샷
- Refund / Partial Refund (관리자)
- Custom Invoice 생성

### G. Check-in (Online/Offline Hybrid)
- Self Check-in (디바이스 후면 카메라)
- Kiosk Check-in (QR 스캐너)
- Session Check-in (세션 생성, QR 스캔, 대시보드, 출석 이메일)
- 유형: Event / Meal / Session / Custom
- Offline: Baseline 캐시 + Delta Sync + Pending Queue

### H. Audit & Communications
- 관리자 Audit Logs (모든 변경/다운로드/환불)
- Resend 이메일 (등록 확인, E-Pass, 영수증, 세션 출석)
- Supabase Realtime 인앱 알림

---

## 4. User Registration Flow

### Step 1: 회원가입
- OAuth (Google, Apple) 또는 Email/Password
- 이메일 중복 체크 (모든 인증 방식 통합)
- 개인정보 입력 (필수):
  - Last Name (EN), First Name (EN), Display Name (KO)
  - 성별, 생년월일 (Year 콤보박스 + Month/Day Dropdown)
  - K-12 학생 여부 (18세 미만 자동 체크) + Grade
  - Department, Phone, Church (Searchable Dropdown)

### Step 2: Profile Dashboard
- 현재 등록 가능한 이벤트 표시 + "Register Now" 버튼
- 등록 완료 시 "Request Change / Cancellation" 버튼
- E-Pass (이름, 성별, QR Code)
- 등록 정보, 영수증 이력
- Profile Settings (개인정보 수정, 보안)

### Step 3: 등록 (Multi-step Wizard)
1. **Start Registration**: 날짜 범위(nights), 참가자 수(Adults/K-12/Infant), Room Group (max 4), Access Code, 예상 가격
2. **Participants Info**: Room Group별 Leader/Member 정보, Meal 선택 (날짜 범위 sync)
3. **Lodging**: 특별 요청 체크박스 (어르신, 장애인, 1층)
4. **Key Deposit**: Room당 키 수 (min 1, max 2)
5. **Airport Pickup**: 픽업 필요 여부

### Step 4: Review & Pay
- Summary 확인
- Stripe Custom Checkout (Apple Pay, Google Pay, Card, ACH, Check, Zelle)
- Privacy Policy & Disclaimers 동의

### Step 5: 등록 완료
- 결제 성공 페이지 -> Profile Dashboard
- Room Group 생성
- Confirmation Code + E-Pass 이메일 발송 (Group Leader에게)
- 영수증 즉시 발송

---

## 5. Admin Dashboard

### 5.1 System Settings
- Registration Status (Open/Closed)
- Global Variables
- Fee Categories 관리 (등록비, Early Bird, 숙박, 식사, VBS, Key Deposit)
- Registration Group CRUD (이름, 설명, Access Code, 커스텀 요금)
- Departments CRUD (EN/KO Name, Short Code)
- Church List CRUD (EN, "Other" 맨 위)
- Lodging (Building/Floor/Room, Magic Room Generator)
- Meal Dashboard
- Form Field Manager (등록 그룹별 표시/숨김)
- Stripe API (Test/Live mode)
- Google Sheet 연동
- Email Test

### 5.2 Events
- CRUD + activate/deactivate
- 등록/이벤트 날짜 설정
- 강제 초기화 (SUPER_ADMIN, 비밀번호 필요)

### 5.3 Event Participants
- Data Table (Excel-like): 개인정보, 메모, 결제 상태, 방 배정, 체크인 상태
- 필터, 정렬, 검색

### 5.4 Room Groups & Lodging
- 전체 그룹 목록
- Pending Groups -> 방 배정
- Assigned Groups 목록

### 5.5 Users & Permissions
- User CRUD + Role 배정
- Permission 기반 접근 제어

### 5.6 Print
- Lanyard Print (벌크, PNG/PDF export)
- QR Code Card Print (벌크, PNG/PDF export)

### 5.7 Invoice
- 검색, CSV/PDF export
- 수동 발송, Custom Invoice 생성

### 5.8 Manual Operations
- Manual Registration (Admin only)
- Manual Refund / Partial Refund
- Manual Payment (Public)
- Manual E-Pass Viewer (Public)
- Donation (Public)

### 5.9 Check-in Management
- Real-time 동시 체크인
- Self / Kiosk / Session Check-in
- Session 생성, 대시보드, 출석 이메일

---

## 6. Database Schema (ECKCM_ prefix)

### Core Tables
| Table | Purpose |
|-------|---------|
| ECKCM_users | Auth user profile |
| ECKCM_roles | Role definitions |
| ECKCM_permissions | Permission definitions |
| ECKCM_role_permissions | Role-Permission mapping |
| ECKCM_staff_assignments | Staff event-scope assignments |
| ECKCM_user_people | User-Person 1:1 link |
| ECKCM_people | Participant personal info |
| ECKCM_registrations | Registration records |
| ECKCM_groups | Room groups |
| ECKCM_group_memberships | Group member roles |
| ECKCM_events | Event definitions |
| ECKCM_registration_groups | Registration group config |
| ECKCM_fee_categories | Fee category definitions |
| ECKCM_registration_group_fee_categories | Group-Fee mapping |
| ECKCM_registration_selections | Registration fee selections |
| ECKCM_departments | Department list (EN/KO) |
| ECKCM_churches | Church list |
| ECKCM_buildings | Lodging buildings |
| ECKCM_floors | Building floors |
| ECKCM_rooms | Individual rooms |
| ECKCM_room_assignments | Room assignment records |
| ECKCM_meal_rules | Meal pricing/rules |
| ECKCM_meal_selections | Individual meal choices |
| ECKCM_invoices | Invoice headers |
| ECKCM_invoice_line_items | Invoice line items |
| ECKCM_payments | Payment records (Stripe) |
| ECKCM_refunds | Refund records |
| ECKCM_checkins | Check-in logs |
| ECKCM_sessions | Session definitions |
| ECKCM_audit_logs | Admin audit trail |
| ECKCM_notifications | In-app notifications |
| ECKCM_sheets_cache_participants | Google Sheets cache |

---

## 7. Security Requirements

- Supabase RLS (Row Level Security)
  - Owner: 본인 registration + group 범위
  - Group Leader: 본인 그룹 멤버 범위
  - Staff: event_id 스코프 + permission 기반
  - SQL 함수 캡슐화: `has_event_permission()`, `is_member_of_group()`
- 개인정보 암호화 저장
- HTTPS 전용
- Stripe PCI DSS 준수
- 세션 타임아웃
- 이메일 중복 방지 (OAuth + Email 통합)

---

## 8. Development Phases (Recommended Order)

| Phase | Scope | Priority |
|-------|-------|----------|
| Phase 1 | Project Setup (Next.js, Supabase, Tailwind, shadcn/ui, PWA) | P0 |
| Phase 2 | Auth (Google, Apple, Email/Password) + User Profile + Person | P0 |
| Phase 3 | Event + Registration Group + Fee Category + Departments/Churches | P0 |
| Phase 4 | Registration Wizard (5-step flow) + Estimate Calculation | P0 |
| Phase 5 | Stripe Payment + Webhook + Confirmation Code + E-Pass | P0 |
| Phase 6 | Profile Dashboard (E-Pass, Receipts, Registration Info) | P0 |
| Phase 7 | Admin: System Settings + Events + Participants Table | P1 |
| Phase 8 | Admin: Lodging (Building/Room CRUD, Magic Generator, Assignment) | P1 |
| Phase 9 | Meals (Rules, Selections, Pricing) | P1 |
| Phase 10 | Check-in (Self, Kiosk, Session) + Offline Hybrid | P2 |
| Phase 11 | Invoice, Print (Lanyard, QR Card), Manual Operations | P2 |
| Phase 12 | Audit Logs, Google Sheets Sync, Email Notifications | P2 |
| Phase 13 | i18n (Korean/English), Dark Mode | P2 |
| Phase 14 | Testing, Performance, PWA Optimization, Deployment | P3 |

---

## 9. Non-Functional Requirements

| Category | Requirement |
|----------|------------|
| Performance | < 3s initial load, < 1s page transitions |
| Mobile | Mobile-first design, PWA offline support |
| Accessibility | WCAG 2.1 AA compliance |
| i18n | Korean / English, default English |
| Dark Mode | Full dark mode support |
| Offline | Check-in offline support (baseline + delta sync) |
| Scalability | 500+ concurrent registrations |
| Data Export | CSV, PDF, PNG export capabilities |

---

## 10. Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Stripe 결제 실패 | High | Webhook retry, 수동 결제 fallback |
| 오프라인 체크인 데이터 충돌 | Medium | Idempotent 처리, nonce 기반 중복 방지 |
| 대규모 동시 등록 | Medium | Supabase connection pooling, Edge Functions |
| 이메일 발송 실패 | Medium | Resend retry, 감사 로그 기록 |
| PWA 캐시 문제 | Medium | skipWaiting: true, 버전 관리 |
| RLS 성능 저하 | Low | SQL 함수 캡슐화, 인덱스 최적화 |

---

## 11. Success Criteria

- [ ] 참가자가 5-step 등록 wizard를 완료하고 결제할 수 있다
- [ ] 등록 후 Confirmation Code와 E-Pass가 이메일로 발송된다
- [ ] 관리자가 참가자 목록을 Excel-like 테이블로 관리할 수 있다
- [ ] 관리자가 숙소를 생성하고 그룹에 방을 배정할 수 있다
- [ ] QR 코드 기반 체크인이 온/오프라인에서 작동한다
- [ ] 한국어/영어 전환이 모든 페이지에서 가능하다
- [ ] Mobile-first PWA로 모바일에서 원활하게 동작한다
- [ ] Stripe 결제 및 환불이 정상 작동한다

---

*Generated by bkit PDCA v1.5.2*
