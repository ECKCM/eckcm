## **1) 도메인 구조(표준 Bounded Context)**

  

### **A. Identity & Access**

- Auth(OAuth/Email) + User Profile
    
- Staff Assignments(이벤트 스코프) + Roles/Permissions
    

  

### **B. Event & Catalog**

- Event(연도별)
    
- Registration Group(등록그룹)
    
- Fee Categories(가격 카테고리) + Registration Group별 “선택 가능 매핑”
    
- Departments/Church List
    

  

### **C. People & Registration**

- People(Person) = 참가자 실체(유저/가족/스태프 포함)
    
- Registrations(예약/결제 단위)
    
- Groups(Room Group) + Memberships(LEADER/MEMBER)
    

  

### **D. Lodging**

- Building/Floor/Room
    
- Room Assignment(관리자 배정 workflow: Pending→Assigned)
    

  

### **E. Meals**

- Meal Rules(기간/제외일/가격규칙)
    
- Meal Selections(개인×일자×meal_type rows)
    

  

### **F. Payments & Invoicing**

- Stripe PaymentIntent/Webhook
    
- Invoice(라인아이템 스냅샷) + Refund/Partial Refund
    

  

### **G. Check-in (Online/Offline Hybrid)**

- QR Token 검증
    
- Checkin logs (idempotent)
    
- Offline cache baseline + delta sync + pending queue
    

  

### **H. Audit & Comms**

- Audit logs(관리자 변경/다운로드/환불까지)
    
- Resend 이메일 + Realtime 알림
    

---

## **2) 데이터 모델(핵심 테이블 설계) — ECKCM_ prefix**

  

### **2.1 Auth / Staff / 권한**

- ECKCM_users
    
    - id(uuid = auth.uid)
        
    - email, name fields, created_at…
        
    
- ECKCM_roles (SUPER_ADMIN 등)
    
- ECKCM_permissions (participant.read 등)
    
- ECKCM_role_permissions (role↔permission)
    
- ECKCM_staff_assignments
    
    - user_id, event_id, role_id, is_active
        
    - **핵심: staff는 “assignment가 있어야” admin panel 접근**
        
    

  

> Staff도 Person으로 참가하니 아래 People과 1:1 연결을 둠:

  

- ECKCM_user_people
    
    - user_id ↔ person_id (보통 1:1, 필요시 확장 가능)
        
    

---

### **2.2 People / Registration / Group**

- ECKCM_people
    
    - person_id(uuid)
        
    - last_name_en, first_name_en, display_name_ko
        
    - gender, birth_date(date), age_at_event(int), is_k12(bool), grade(enum)
        
    - phone, email(변경 가능/불가 정책은 user profile로 컨트롤)
        
    - department_id, church_id
        
    - pii_encrypted_fields(선택) / masking 전략
        
    
- ECKCM_registrations
    
    - id(uuid)
        
    - event_id
        
    - created_by_user_id (owner)
        
    - registration_group_id (등록 그룹)
        
    - status: DRAFT | SUBMITTED | PAID | CANCELLED | REFUNDED
        
    - confirmation_code(6) **event_id scope unique**
        
    - start_date, end_date, nights_count
        
    - totals snapshot refs(인보이스 연결)
        
    
- ECKCM_groups
    
    - id(uuid)
        
    - event_id, registration_id
        
    - display_group_code: G0001 (unique(event_id, code))
        
    - room_assign_status: PENDING | ASSIGNED
        
    - preferences(elderly/handicapped/1st floor etc)
        
    
- ECKCM_group_memberships
    
    - id(uuid)
        
    - group_id, person_id
        
    - role: LEADER | MEMBER
        
    - status: ACTIVE | INACTIVE
        
    

---

## **3) Registration Group(등록 그룹) + Fee Category 선택 구조(중요)**

  

### **핵심 아이디어(표준)**

- “가격/옵션”을 **Fee Category**로 정의하고,
    
- 각 **Registration Group**에서 **선택 가능**한 Fee Category를 매핑.
    

  

#### **테이블**

- ECKCM_registration_groups
    
    - id, event_id
        
    - name_en, name_ko, description_en/ko
        
    - access_code(optional), early_bird_deadline
        
    - custom fee overrides(optional)
        
    
- ECKCM_fee_categories
    
    - id, event_id
        
    - code (REG_FEE, LODGING_AC, MEAL_BREAKFAST_ADULT…)
        
    - name_en, name_ko
        
    - pricing_type: FLAT | PER_NIGHT | PER_MEAL | RULED
        
    - is_active
        
    
- ECKCM_registration_group_fee_categories
    
    - registration_group_id, fee_category_id
        
    - is_required (예: 등록비)
        
    - selection_mode: AUTO | USER_SELECT | ADMIN_ONLY
        
    - constraints(json) (예: VBS는 4–8yr만 가능)
        
    

  

#### **Registration 시 실제 선택 저장(스냅샷 X, 선택 O)**

- ECKCM_registration_selections
    
    - registration_id
        
    - group_id(optional) / person_id(optional)
        
    - fee_category_id
        
    - quantity / metadata (예: nights=3, room_type=AC)
        
    - computed_amount(결제 시점 스냅샷은 invoice로)
        
    

  

> 결제 순간엔 아래 인보이스로 “라인아이템 스냅샷”을 박제.

---

## **4) Meals — normalized row 구조(당신 결정 반영)**

  

### **규칙/기간**

- ECKCM_meal_rules
    
    - event_id
        
    - meal_start_date, meal_end_date
        
    - no_meal_dates(date[])
        
    - prices: adult_each, youth_each, adult_day, youth_day
        
    - free_under_age: 4 (event start 기준)
        
    

  

### **선택(개인 × 날짜 × meal_type)**

- ECKCM_meal_selections
    
    - id
        
    - event_id, registration_id, group_id, person_id
        
    - meal_date(date)
        
    - meal_type: BREAKFAST | LUNCH | DINNER
        
    - selected(bool)
        
    - price_applied_cents (결제 스냅샷은 invoice로 최종 고정)
        
    

  

> “하루 3끼 할인”은 저장을 3개 row로 하되, **PricingService가 하루 단위로 묶어서 계산**하고 invoice 라인에서 할인 라인을 추가(표준 방식).

---

## **5) Confirmation Code(6자리 영숫자) — 욕 필터 포함**

  

### **생성 규칙(권장)**

- 문자셋: ABCDEFGHJKLMNPQRSTUVWXYZ23456789 (혼동 제거)
    
- 길이: 6
    
- Unique: (event_id, confirmation_code)
    
- 금칙어:
    
    - 욕/비속어/민감 단어 리스트(영/한 포함 가능)
        
    - 서브스트링 매칭으로 차단 (“FUK”, “SEX” 같은)
        
    
- 생성 재시도: 충돌/금칙어면 재생성
    

---

## **6) 오프라인 체크인 하이브리드(Baseline + Delta Sync)**

  

### **6.1 Baseline 캐시(캠프 전날)**

- Kiosk/Staff 디바이스에서 **event 전체 allowlist** 다운로드:
    
    - 최소 필드만: person_id, display_name, confirmation_code, group_code, qr_token_hash, eligibility flags
        
    
- 로컬 IndexedDB 저장 + 버전(캐시 스냅샷 기준 시각)
    

  

### **6.2 Delta Sync(매일 Wi-Fi 잡히면)**

- 서버에 ECKCM_sync_log 또는 updated_at 기반
    
- “변경분만” 다운로드:
    
    - person 변경(이름/그룹 이동)
        
    - registration 상태(취소/환불)
        
    - qr token rotate(분실/재발급)
        
    
- 로컬 캐시 갱신
    

  

### **6.3 오프라인 체크인 큐**

- pending_checkins 로컬 큐에 기록:
    
    - event_id, person_id, type, timestamp, device_id, nonce
        
    
- 온라인 복구 시 배치 업로드
    
- 서버는 **idempotent**로 처리(중복 스캔 방지)
    

  

### **6.4 체크인 로그(서버)**

- ECKCM_checkins
    
    - id
        
    - event_id, person_id
        
    - checkin_type: MAIN | DINING | SESSION | CUSTOM
        
    - session_id?, meal_date?, meal_type?
        
    - source: SELF | KIOSK
        
    - device_id, created_at
        
    
- Unique 인덱스(중요):
    
    - MAIN: (event_id, person_id, checkin_type, date_trunc('day', created_at)) 또는 event당 1회면 (event_id, person_id, checkin_type)
        
    - DINING: (event_id, person_id, meal_date, meal_type)
        
    - SESSION: (event_id, person_id, session_id)
        
    

---

## **7) RLS 정책(Owner + Group leader + Staff scope) — 최종 형태**

  

### **표준 원칙**

- **참가자(User)**:
    
    - 본인이 만든 registration + 본인이 leader/member인 group 범위만 접근
        
    
- **Staff**:
    
    - ECKCM_staff_assignments 에서 event_id 스코프 확인
        
    - permission 기반으로 테이블별 액션 허용
        
    

  

### **구현 팁(현업에서 제일 안정적인 방식)**

- RLS에서 매번 join 많이 하면 느려질 수 있으니:
    
    - has_event_permission(auth.uid(), event_id, 'participant.read') 같은 **SQL 함수**로 캡슐화
        
    - group membership도 is_member_of_group(auth.uid(), group_id) 함수화
        
    

---

## **8) Google Sheets 연동(read-only) 표준**

- Admin/System Settings에:
    
    - sheet_id, range, refresh interval 저장
        
    
- 서버(Edge/cron)에서 주기적으로 읽어 캐시 테이블 갱신:
    
    - ECKCM_sheets_cache_participants (필요 컬럼만)
        
    
- UI는 캐시 테이블을 보여주되, **RLS로 staff만 접근**
    

  

> 즉 “Sheets 직접 조회”가 아니라 “DB 캐시 뷰”로 읽게 하면 속도/권한/감사로그가 깔끔해짐.

---

## **9) i18n(컬럼 분리) 적용 위치**

- Departments / Fee Categories / Registration Groups / Building/Rooms 등
    
    - name_en, name_ko, description_en, description_ko
        
    
- 프론트는 /en, /ko 라우팅 + default EN
    
- Admin UI는 두 컬럼 모두 입력 가능(영/한)
    

---

## **10) 개발 순서(이 설계 기준 “최적”)**

1. **Event + Registration Group + Fee Category 매핑**(가격/옵션 기반)
    
2. Auth + User profile + Person 생성/연결(Staff도 Person)
    
3. Registration DRAFT→Quote(Estimate)→Invoice Draft
    
4. Stripe 결제 + webhook로 PAID 확정 + confirmation code 발급
    
5. Group/Memberships 생성 + E-pass 생성 + Resend 이메일 발송
    
6. Admin Participants Table(필터/엑셀식 편집 최소)
    
7. Lodging(방 생성기 + 배정 workflow)
    
8. Meals(normalized selections + 계산)
    
9. Check-in(온라인) → 오프라인 baseline/delta/queue