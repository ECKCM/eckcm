# 야영회 종료 후 인프라 무료 티어 전환 가이드

이벤트가 끝나 Vercel / Resend / Supabase를 유료 → 무료로 내리기 위한 절차.
**원칙: 비용은 줄이되 회계·법적 보존 의무가 있는 데이터(등록·결제·환불)는 절대 삭제하지 않는다.**

확인된 현황 (2026-06-29 기준):

| 리소스 | 현재 | 무료 한도 | 여유 |
| --- | --- | --- | --- |
| Supabase DB | 37 MB | 500 MB | 여유 |
| Storage (booklet) | 29 MB / 50 files | 1 GB | 여유 |
| 핵심 테이블 | reg 483 / pay 490 / inv 546 / refund 39 | — | 정상 |

- ECKCM Supabase project: `ldepcbxuktigbsgnufcb`
- Org: `rvlrjlzjbkiuttgzzqoo` (ECKCM 단독 → org 단위 다운 가능)

---

## STEP 0 — 사전 안전장치 (완료됨)

- [x] 신규 결제 경로 차단 (새 Stripe PI 유입 없음)
- [x] 미처리 환불 청산 (환불은 Stripe 수수료 차감 필수)

## STEP 1 — 백업 (다운 전 필수, 비파괴)

무료 티어로 내리면 Supabase 자동 일별 백업(PITR)이 사라진다. 다운 직전 스냅샷이 마지막 안전망.

### 1a. 전체 DB 덤프 (pg_dump)

연결 문자열은 Supabase 대시보드 → Project Settings → Database → **Connection string (URI)** 에서 복사
(또는 Connection pooling 의 Session 모드). 비밀번호는 한 번만 노출되니 미리 확보.

```bash
# 날짜 폴더 준비
mkdir -p backups/2026-06-29

# 전체 덤프 (스키마 + 데이터). <CONNECTION_STRING> 자리에 대시보드 URI를 넣는다.
pg_dump "<CONNECTION_STRING>" \
  --no-owner --no-privileges \
  -Fc -f backups/2026-06-29/eckcm-full.dump

# 복원이 필요할 때:
#   pg_restore --no-owner --no-privileges -d "<NEW_CONNECTION_STRING>" backups/2026-06-29/eckcm-full.dump
```

> pg_dump 메이저 버전이 서버(PostgreSQL 17)와 맞아야 한다. 로컬이 낮으면
> `brew install postgresql@17` 후 `/opt/homebrew/opt/postgresql@17/bin/pg_dump` 사용.

### 1b. 테이블 CSV 스냅샷 (사람이 읽을 수 있는 사본)

```bash
node --env-file=.env.local scripts/backup-tables-csv.mjs backups/2026-06-29
```

회계 테이블을 먼저 받고 모든 `eckcm_*` 테이블을 `<table>.csv` + `_manifest.json` 으로 저장.

### 1c. Storage(booklet) 사본

```bash
node --env-file=.env.local scripts/backup-booklet.mjs backups/2026-06-29/booklet
```

(booklet 은 `convert-booklet.mjs` + 원본 PDF 로 재생성 가능하지만 사본 보관이 안전.)

### 1d. Google Sheets 백업 시트 최신화 확인

registrations / payments / refunds 가 최신인지 확인. (DB→Sheets 는 CSV Import 방식.)

> `backups/` 는 커밋하지 말 것 (개인정보·금액 포함). `.gitignore` 에 추가.

## STEP 2 — Resend → Free

- 대시보드에서 플랜만 Free 로 변경.
- **@eckcm.com 도메인 인증은 절대 풀지 않는다** — E-Pass 재발송 등 산발 발송이 남음.
  발신 도메인은 검증된 eckcm.com 만 사용 가능.
- 무료 한도: 월 3,000건 / 일 100건 (이벤트 후 발송량으로 충분).

## STEP 3 — Vercel → Hobby

- 다운 전 점검:
  - [ ] Cron Jobs 사용 여부 (`vercel.json`/`vercel.ts`의 `crons`) — Hobby 제약 확인
  - [ ] 함수 실행시간 / 동시성 의존 기능
  - [ ] 팀 협업(멤버) 기능 사용 여부
- 환경변수·도메인은 Hobby 에서도 유지됨.
- 비영리(교회) 행사 기준으로 Hobby 사용.

## STEP 4 — Supabase Pro → Free (org 단위, 마지막에)

- STEP 1 백업 확인 후 실행.
- Org `rvlrjlzjbkiuttgzzqoo` 의 Billing → 플랜 Free 로 변경.
- 무료 티어는 **7일 무활동 시 자동 일시정지(pause)**.

### 7일 일시정지 방지 (keep-alive)

E-Pass/관리자 조회가 끊기지 않도록 항상 깨워두는 구성:

- `src/app/api/cron/keep-alive/route.ts` — `eckcm_app_config` 에 head-only count 1건만
  날리는 초경량 ping. `CRON_SECRET` Bearer 로 보호 (다른 cron 과 동일).
- `.github/workflows/supabase-keep-alive.yml` — **3일마다** 위 route 호출
  (7일 한도의 절반 이하 → 한 번 걸러도 여유). Vercel Hobby cron 은 ≤1/day·비보장이라
  신뢰 못 함 → GitHub Actions 가 주력.
- `vercel.json` 에도 keep-alive cron 항목 이중화 (Pro 유지 시 백업 경로).

**활성화 절차** (GitHub repo → Settings → Secrets and variables → Actions):
1. Secret `KEEP_ALIVE_URL` = `https://<prod-domain>/api/cron/keep-alive`
2. Secret `CRON_SECRET` = Vercel 의 `CRON_SECRET` env 와 동일 값
3. Actions 탭에서 "Supabase keep-alive" → **Run workflow** 로 1회 수동 실행해 200 확인
4. GitHub 은 repo 60일 무커밋 시 scheduled workflow 비활성화 → 가끔 수동 실행 또는 커밋으로 재가동

---

## 되돌리기

내년 행사 재가동 시: 각 서비스 플랜을 다시 Pro/유료로 올리고, Supabase 가 paused 면
대시보드에서 Restore. 데이터는 다운 중에도 보존되므로 백업에서 복원할 필요는 보통 없다.
