# Supabase Migration 생성

DB schema 변경이 필요할 때 이 워크플로우를 따라.

## 입력
$ARGUMENTS

## 워크플로우

### Step 1: Migration 파일 생성
```bash
supabase migration new $ARGUMENTS
```
생성된 파일 경로를 확인해 (supabase/migrations/YYYYMMDDHHMMSS_$ARGUMENTS.sql)

### Step 2: Migration SQL 작성
생성된 .sql 파일에 아래 규칙을 지켜서 SQL을 작성해:

**허용:**
- CREATE TABLE (새 테이블)
- ALTER TABLE ... ADD COLUMN (새 컬럼 추가)
- CREATE INDEX
- CREATE OR REPLACE FUNCTION
- CREATE TRIGGER
- ADD CONSTRAINT
- COMMENT ON

**금지:**
- DROP TABLE / DROP COLUMN / DROP INDEX
- ALTER TABLE ... RENAME
- ALTER TABLE ... ALTER COLUMN ... TYPE (타입 변경)
- DELETE FROM / TRUNCATE
- 기존 컬럼에 NOT NULL 추가 (기존 데이터 깨질 수 있음)

**새 컬럼 추가 시:**
- DEFAULT 값 항상 지정
- 또는 NULL 허용으로 추가 후 backfill script 별도 작성

### Step 3: Rollback Migration 생성
같은 migration 번호로 rollback 파일도 생성해:
파일 경로: `supabase/migrations/rollbacks/YYYYMMDDHHMMSS_$ARGUMENTS.rollback.sql`

`supabase/migrations/rollbacks/` 디렉토리가 없으면 만들어.

rollback SQL은 Step 2에서 작성한 변경을 되돌리는 내용이어야 해.

### Step 4: 현재 상태와 비교
```bash
supabase db diff
```
diff 결과를 보여줘.

### Step 5: 사용자 확인 요청
아래 내용을 정리해서 보여주고 **반드시 사용자 확인을 요청**해:

1. **Migration SQL 전체 내용**
2. **Rollback SQL 전체 내용**
3. **영향받는 테이블/컬럼 목록**
4. **기존 데이터 영향 여부** (있으면 backfill plan도 같이)
5. **db diff 결과**

그리고 이 메시지를 출력해:
> ⚠️ 위 migration 내용을 확인해주세요.
> 승인하면 터미널에서 `supabase db push` 를 직접 실행해주세요.
> Claude Code는 db push를 실행할 수 없습니다.

### 절대 하지 마
- `supabase db push` 실행
- production DB에 직접 SQL 쿼리 실행
- 사용자 확인 없이 migration 파일 내용 변경
