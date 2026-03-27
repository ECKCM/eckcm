# Plan: ECKCM Online Registration & Management System

> Feature: `online-registration`
> Created: 2026-02-11
> Updated: 2026-03-14
> Status: v2 — Synced with implementation
> Level: Dynamic (Next.js + Supabase + Stripe)

---

## 1. Overview

ECKCM(Eastern Korean Churches Camp Meeting)은 미국 한국 교회 연합 야영회/수련회를 위한 온라인 참가자 등록 및 관리 시스템이다. 매년 6월 말, 7일간 Camp Berkshire NY에서 개최되며, 항공사/호텔 예약 시스템과 유사한 다중 등록 구조를 제공한다.

### 핵심 목적
- 참가자 온라인 등록 (멀티 그룹, 멀티 참가자)
- 본인 등록 및 타인 대신 등록 (Register for Someone Else)
- 개인 Profile Dashboard (E-Pass, 영수증, 등록 정보)
- 관리자 Dashboard (참가자 관리, 숙소 배정, 체크인, 결제, 인쇄)
- 오프라인/온라인 하이브리드 체크인
- PDF 인보이스/영수증 자동 생성 및 이메일 첨부

---

## 2. Tech Stack

| Category | Technology |
|----------|-----------|
| Framework | Next.js 16 (App Router) |
| Styling | Tailwind CSS v4 + shadcn/ui v4 (Mobile-first Responsive) |
| Font | Pretendard (CDN) + system fallback |
| Backend | Supabase (Auth, DB, RLS, Realtime, Storage) |
| Payment | Stripe (Live/Test mode, Elements, Apple/Google Pay, ACH) + Zelle |
| Email | Resend |
| PDF | pdf-lib (server-side invoice/receipt generation) |
| Auth | Google OAuth, Email/Password |
| Bot Protection | Cloudflare Turnstile |
| Deployment | Vercel |
| Analytics | Vercel Analytics |
| i18n | Korean / English (default: English) |
| Real-time | Supabase Realtime (DB Changes) + Smart Polling (useChangeDetector) |
| External | Google Sheets (read-only sync, deferred) |

---

## 3. Domain Bounded Contexts

### A. Identity & Access
- OAuth (Google) + Email/Password 회원가입
- User Profile (개인정보 입력 필수)
- Staff Assignments (이벤트 스코프 기반 역할)
- RBAC: SUPER_ADMIN, EVENT_ADMIN, ROOM_COORDINATOR, CHECKIN_STAFF, SESSION_CHECKIN_STAFF, DINING_CHECKIN_STAFF, KEY_DEPOSIT_STAFF, CUSTOM
- Granular Permissions (participant.read, checkin.main, group.member.assign 등)
- Role-based Page Permissions (admin 페이지별 접근 제어)
- Login Logging (auth login log tracking)

### B. Event & Catalog
- Event 생성/관리 (연도별, 날짜 범위, activate/deactivate)
- Registration Group (Access Code UI, 가격 오버라이드)
- Fee Categories (FLAT, PER_NIGHT, PER_MEAL, RULED)
- Fee Schedule 표시 (등록 전 안내 페이지)
- Departments (한/영), Church List (한/영, 알파벳 정렬)
- Form Field Manager (등록 그룹별 필드 표시/숨김)

### C. People & Registration
- Person (참가자 실체, User와 1:1 연결)
- Registration Type: Self (본인 등록) vs Others (타인 대신 등록)
- Registration (DRAFT -> SUBMITTED -> PAID -> CANCELLED -> REFUNDED)
- Abandoned DRAFT 자동 삭제 (취소 대신 삭제)
- Group (Room Group, display code G0001)
- Group Memberships (REPRESENTATIVE / MEMBER)
- 6자리 Confirmation Code (욕 필터 포함)
- T-shirt Size (XS, S, M, L, XL)
- Church Role (MEMBER, DEACON, ELDER, MINISTER, PASTOR)
- Per-participant 체크인/체크아웃 날짜 오버라이드
- Guardian/Parent Consent (미성년자 대표 등록 시 필수)
- Saved Persons Autofill (이전 등록 참가자 정보 재사용)
- Additional Requests (자유 텍스트)

### D. Lodging
- Building / Floor / Room 계층 구조
- Magic Room Generator
- Room Assignment Workflow (Pending -> Assigned)
- 특별 요청 (어르신, 장애인, 1층)
- Additional Lodging Fee (그룹 인원 임계치 초과 시 추가 요금)

### E. Meals
- Meal Rules (기간, 제외일, 가격)
- Meal Selections (개인 x 날짜 x meal_type)
- 가격 정책: Adult $18/각, Youth $10/각, 하루 3끼 Adult $45, Youth $25
- 이벤트 시작일 기준 4세 이하 무료
- 도착/출발일 partial meal 선택

### F. Payments & Invoicing
- Stripe Custom Checkout (Elements) — Synchronous Confirm Flow
- 결제수단: Apple Pay, Google Pay, Credit Card, ACH, Zelle
- Cover Processing Fees 옵션 (참가자가 Stripe 수수료 부담 선택)
- Payment Method Discount (수동 결제 할인)
- Invoice 라인아이템 스냅샷
- Unified Invoice/Receipt Numbering (INV-YYYY-NNNN / RCT-YYYY-NNNN, confirmation code 시퀀스 연동)
- PDF Invoice/Receipt 자동 생성 (pdf-lib, 확인 이메일에 첨부)
- Refund / Partial Refund (관리자)
- Custom Invoice 생성
- Stripe Sync (Stripe PaymentIntent와 DB 동기화)
- Cancel PaymentIntent (결제 취소)

### G. Check-in (Online/Offline Hybrid)
- Self Check-in (디바이스 후면 카메라)
- Kiosk Check-in (QR 스캐너)
- Session Check-in (세션 생성, QR 스캔, 대시보드, 출석 이메일)
- 유형: Event / Meal / Session / Custom
- Offline: Baseline 캐시 + Delta Sync + Pending Queue

### H. Audit & Communications
- 관리자 Audit Logs (모든 변경/다운로드/환불)
- Email System:
  - 등록 확인 (PDF invoice 첨부)
  - E-Pass 이메일
  - Invoice/Receipt 이메일
  - 세션 출석 이메일
  - Bulk Announcement (전체 참가자 공지)
  - Email Config Management (Resend API key, from address)
  - Email Delivery Logs (발송 기록 추적)
  - Admin Manual Send (관리자 수동 이메일 재발송)
- Supabase Realtime 인앱 알림
- Admin Real-time Presence (관리자 온라인 상태 표시)
- Smart Polling (useChangeDetector, admin 테이블 자동 갱신)

### I. PDF & Print
- Invoice/Receipt PDF 생성 (pdf-lib, 서버사이드)
- Admin PDF Preview (관리자 미리보기)
- Lanyard Print (벌크, PNG/PDF export)
- QR Code Card Print (벌크, PNG/PDF export)
- E-Pass Repair (관리자 E-Pass 토큰 복구 도구)

---

## 4. User Registration Flow

### Step 1: 회원가입
- OAuth (Google) 또는 Email/Password
- 이메일 중복 체크 (모든 인증 방식 통합)
- 개인정보 입력 (필수):
  - Last Name (EN), First Name (EN), Display Name (KO)
  - 성별, 생년월일 (Year 콤보박스 + Month/Day Dropdown)
  - K-12 학생 여부 (18세 미만 자동 체크) + Grade
  - Department, Phone (국가 코드 포함), Church (Searchable Dropdown, 한/영)
  - Church Role (MEMBER, DEACON, ELDER, MINISTER, PASTOR)

### Step 2: Profile Dashboard
- 현재 등록 가능한 이벤트 표시 + "Register Now" 버튼
- 등록 유형 선택: "Register for Myself" vs "Register for Someone Else"
- 등록 완료 시 "Request Change / Cancellation" 버튼
- E-Pass 목록 (이름, 성별, QR Code) — 정렬 지원
- 등록 정보, 영수증 이력
- Profile Settings (개인정보 수정, 보안)

### Step 3: 등록 전 안내 (Instructions)
- Fee Schedule 표시 (등록비, 숙박비, 식사비 등 요금표)
- 등록 안내사항
- 이전 등록 참가자 Autofill 기능

### Step 4: 등록 (Multi-step Wizard)
1. **Start Registration**: 날짜 범위(nights), 참가자 수(Adults/K-12/Infant), Room Group (max 4), Access Code, 예상 가격
2. **Participants Info**: Room Group별 Representative/Member 정보, Meal 선택 (날짜 범위 sync), T-shirt Size, Church Role, 개별 체크인/체크아웃 날짜 오버라이드
   - Guardian/Parent Consent: 미성년자가 대표인 경우 보호자 이름, 전화, 동의, 전자서명 필수
   - Saved Persons Autofill: 이전 등록 데이터 자동 완성
3. **Lodging**: 특별 요청 체크박스 (어르신, 장애인, 1층)
4. **Key Deposit**: Room당 키 수 (min 1, max 2)
5. **Airport Pickup**: 공항 픽업 옵션 선택 (도착/출발 라이드 목록)
6. **Additional Requests**: 자유 텍스트 요청사항

### Step 5: Review & Pay
- Summary 확인
- Online Payment: Stripe Custom Checkout (Apple Pay, Google Pay, Card, ACH)
  - Cover Processing Fees 옵션 (Stripe 수수료 부담 선택)
- Manual Payment: Zelle (수신자 정보 표시, 메모 포맷, 약관 동의)
  - Payment Method Discount 표시
- Privacy Policy & Disclaimers 동의

### Step 6: 등록 완료
- 결제 성공 페이지 -> Profile Dashboard
- Room Group 생성
- Confirmation Code + E-Pass 이메일 발송 (Group Representative에게)
- Invoice/Receipt PDF 생성 및 이메일 첨부 발송

---

## 5. Admin Dashboard

### 5.1 System Settings
- Registration Status (Open/Closed)
- System Configuration (App Config)
- Fee Categories 관리 (등록비, Early Bird, 숙박, 식사, VBS, Key Deposit)
- Registration Group CRUD (이름, 설명, Access Code UI, 커스텀 요금)
- Departments CRUD (EN/KO Name, Short Code)
- Church List CRUD (EN/KO Name, "Other" 맨 위, 알파벳 정렬)
- Lodging Settings (Building/Floor/Room, Magic Room Generator)
- Session Management (세션 CRUD)
- Airport Rides Management (라이드 옵션 CRUD)
- Stripe API (Test/Live mode, Stripe Sync)
- Email Config (Resend API key, from address, test send)
- Email Delivery Logs (발송 기록 조회)
- Roles & Permissions Editor (역할별 권한 편집)
- Legal Content Management (이용약관/개인정보 CMS)

### 5.2 Events
- CRUD + activate/deactivate
- 등록/이벤트 날짜 설정
- 강제 초기화 (SUPER_ADMIN, 비밀번호 필요, Invoice 시퀀스 리셋 포함)

### 5.3 Event Participants
- Data Table (Excel-like): 개인정보, T-shirt Size, Church Role, Guardian Info, 메모, 결제 상태, 방 배정, 체크인 상태
- 필터, 정렬, 검색
- Smart Polling (useChangeDetector) 실시간 갱신

### 5.4 Registrations Management
- Registration 목록 관리
- Admin Registration Creation (관리자 수동 등록)
- DRAFT Registration 삭제 (abandoned DRAFT 정리)

### 5.5 Room Groups & Lodging
- 전체 그룹 목록
- Pending Groups -> 방 배정
- Assigned Groups 목록

### 5.6 Users & Permissions
- User CRUD + Role 배정
- Role-based Page Permissions (페이지별 접근 제어)
- Roles Permissions Editor (역할-권한 매핑 편집기)

### 5.7 Print
- Lanyard Print (벌크, PNG/PDF export)
- QR Code Card Print (벌크, PNG/PDF export)

### 5.8 Invoice
- 검색, CSV/PDF export
- Invoice/Receipt PDF Preview (admin 미리보기)
- 수동 발송, Custom Invoice 생성
- Unified Numbering (INV-YYYY-NNNN)

### 5.9 Manual Operations
- Manual Registration (Admin only)
- Manual Refund / Partial Refund (Refund Info 조회 포함)
- Manual Payment (with method discount)
- Manual E-Pass Viewer (Public)
- E-Pass Repair (admin 토큰 복구)
- Donation (Public, deferred)
- Bulk Email Announcement

### 5.10 Check-in Management
- Real-time 동시 체크인
- Self / Kiosk / Session Check-in
- Session 생성, 대시보드, 출석 이메일

### 5.11 Admin Real-time Features
- Admin Presence (온라인 관리자 표시)
- Smart Polling (useChangeDetector) 모든 admin 테이블에 적용
- Supabase Realtime 구독

### 5.12 Audit & Analytics
- Audit Logs (모든 변경/다운로드/환불)
- Vercel Analytics (사이트 사용 분석)

---

## 6. Database Schema (eckcm_ prefix)

> **Note**: All tables use lowercase `eckcm_` prefix. PostgREST is case-sensitive.

### Core Tables
| Table | Purpose |
|-------|---------|
| eckcm_users | Auth user profile |
| eckcm_roles | Role definitions |
| eckcm_permissions | Permission definitions |
| eckcm_role_permissions | Role-Permission mapping |
| eckcm_staff_assignments | Staff event-scope assignments |
| eckcm_user_people | User-Person 1:1 link |
| eckcm_people | Participant personal info (+ tshirt_size, church_role, guardian fields) |
| eckcm_registrations | Registration records (+ registration_type, additional_requests) |
| eckcm_registration_drafts | Wizard state persistence |
| eckcm_groups | Room groups |
| eckcm_group_memberships | Group member roles (REPRESENTATIVE/MEMBER) |
| eckcm_events | Event definitions |
| eckcm_registration_groups | Registration group config |
| eckcm_fee_categories | Fee category definitions |
| eckcm_registration_group_fee_categories | Group-Fee mapping |
| eckcm_registration_selections | Registration fee selections |
| eckcm_form_field_config | Dynamic form field visibility |
| eckcm_departments | Department list (EN/KO) |
| eckcm_churches | Church list (EN/KO, Korean names) |
| eckcm_buildings | Lodging buildings |
| eckcm_floors | Building floors |
| eckcm_rooms | Individual rooms |
| eckcm_room_assignments | Room assignment records |
| eckcm_meal_rules | Meal pricing/rules |
| eckcm_meal_selections | Individual meal choices |
| eckcm_invoices | Invoice headers (DRAFT/SENT/PAID/VOID status) |
| eckcm_invoice_line_items | Invoice line items |
| eckcm_payments | Payment records (+ cover_fees, fee_amount_cents, currency) |
| eckcm_refunds | Refund records |
| eckcm_checkins | Check-in logs |
| eckcm_sessions | Session definitions |
| eckcm_epass_tokens | QR token for check-in |
| eckcm_audit_logs | Admin audit trail |
| eckcm_notifications | In-app notifications |
| eckcm_app_config | Global app configuration |
| eckcm_airport_rides | Airport ride options |
| eckcm_registration_rides | Per-registration ride selections |
| eckcm_legal_content | Terms/privacy CMS |
| eckcm_fee_category_inventory | Inventory tracking per fee category |
| eckcm_email_logs | Email delivery logging |
| eckcm_sheets_cache_participants | Google Sheets cache (deferred) |

---

## 7. Security Requirements

- Supabase RLS (Row Level Security)
  - Owner: 본인 registration + group 범위
  - Group Representative: 본인 그룹 멤버 범위
  - Staff: event_id 스코프 + permission 기반
  - SQL 함수 캡슐화: `has_event_permission()`, `is_member_of_group()`, `is_super_admin()`, `owns_registration()`
- Cloudflare Turnstile (bot protection on public forms)
- 개인정보 암호화 저장
- HTTPS 전용
- Stripe PCI DSS 준수
- 세션 타임아웃
- 이메일 중복 방지 (OAuth + Email 통합)
- Role-based Page Permissions (admin 페이지별 접근 제어)
- Rate Limiting (API 요청 제한)
- Guardian/Parent Consent (미성년자 보호)

---

## 8. Development Phases (Recommended Order)

| Phase | Scope | Priority | Status |
|-------|-------|----------|--------|
| Phase 1 | Project Setup (Next.js, Supabase, Tailwind, shadcn/ui) | P0 | ✅ Done |
| Phase 2 | Auth (Google, Email/Password) + User Profile + Person | P0 | ✅ Done |
| Phase 3 | Event + Registration Group + Fee Category + Departments/Churches | P0 | ✅ Done |
| Phase 4 | Registration Wizard (multi-step flow) + Estimate Calculation | P0 | ✅ Done |
| Phase 5 | Stripe/Zelle Payment + Synchronous Confirm + Confirmation Code + E-Pass | P0 | ✅ Done |
| Phase 6 | Profile Dashboard (E-Pass, Receipts, Registration Info) | P0 | ✅ Done |
| Phase 7 | Admin: System Settings + Events + Participants Table | P1 | ✅ Done |
| Phase 8 | Admin: Lodging (Building/Room CRUD, Assignment) | P1 | ✅ Done |
| Phase 9 | Meals (Selections, Pricing) | P1 | ✅ Done |
| Phase 10 | Check-in (Self, Kiosk, Session) + Offline Hybrid | P2 | ✅ Done |
| Phase 11 | Invoice/Receipt PDF, Print (Lanyard, QR Card), Manual Operations | P2 | ✅ Done |
| Phase 12 | Audit Logs, Email System (Announcement, Config, Logs), Realtime | P2 | ✅ Done |
| Phase 13 | Legal, Roles/Permissions Editor, Admin Presence, Smart Polling | P2 | ✅ Done |
| Phase 14 | Vercel Analytics, Security Hardening, Production Deployment | P3 | ✅ Done |
| Phase 15 | i18n (Korean/English), PWA, Google Sheets Sync | P3 | Deferred |

---

## 9. Non-Functional Requirements

| Category | Requirement |
|----------|------------|
| Performance | < 3s initial load, < 1s page transitions |
| Mobile | Mobile-first design |
| Accessibility | WCAG 2.1 AA compliance |
| i18n | Korean / English, default English (partial — UI labels mostly English) |
| Dark Mode | Full dark mode support (registration wizard forced light mode) |
| Offline | Check-in offline support (baseline + delta sync) |
| Scalability | 500+ concurrent registrations |
| Data Export | CSV, PDF, PNG export capabilities |
| Analytics | Vercel Analytics integration |
| Bot Protection | Cloudflare Turnstile on public forms |

---

## 10. Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Stripe 결제 실패 | High | Synchronous confirm + cancel intent, 수동 결제 fallback |
| 오프라인 체크인 데이터 충돌 | Medium | Idempotent 처리, nonce 기반 중복 방지 |
| 대규모 동시 등록 | Medium | Supabase connection pooling, Smart Polling |
| 이메일 발송 실패 | Medium | Resend retry, Email Delivery Logs, 관리자 재발송 |
| Abandoned DRAFT 누적 | Medium | 자동 삭제 정책 (cancel 대신 delete) |
| RLS 성능 저하 | Low | SQL 함수 캡슐화, 인덱스 최적화 |
| PDF 생성 실패 | Low | pdf-lib fallback, error logging |

---

## 11. Success Criteria

- [x] 참가자가 multi-step 등록 wizard를 완료하고 결제할 수 있다
- [x] 본인 및 타인 대신 등록이 가능하다
- [x] 등록 후 Confirmation Code와 E-Pass가 PDF 첨부 이메일로 발송된다
- [x] 관리자가 참가자 목록을 Excel-like 테이블로 관리할 수 있다 (실시간 갱신)
- [x] 관리자가 숙소를 생성하고 그룹에 방을 배정할 수 있다
- [x] QR 코드 기반 체크인이 온/오프라인에서 작동한다
- [x] Stripe + Zelle 결제 및 환불이 정상 작동한다
- [x] 관리자 역할별 권한 제어가 작동한다
- [x] PDF 인보이스/영수증이 자동 생성된다
- [ ] 한국어/영어 전환이 모든 페이지에서 가능하다 (deferred)
- [ ] PWA로 모바일에서 원활하게 동작한다 (deferred)

---

*Generated by bkit PDCA v1.5.5 (v2 - Synced with implementation, 2026-03-14)*
