# momo-booth handoff — hybrid Supabase + Mac mini

Cập nhật: 11/11/2026, đêm (Asia/Saigon). Làm việc trên copy `/workspace/momo-booth-local` (không phải `/workspace/momo-booth-src`). Không deploy production. Không in, echo, hay commit key.

## Kiến trúc

Hai vai trò, một sự kiện (19–27/11/2026, 2 booth `3-5` và `5-10`, ~200 khách, 1 Mac mini / 2 TV):

- **Check-in công khai (Vercel):** `POST /api/booths/[id]/checkin` ghi `public.checkins` bằng service-role trên server (`src/lib/checkinRecord.ts`, `server-only`). Unique `(code, booth)` = idempotent. Anon không được insert/update/delete. Portrait không lên Supabase/Blob.
- **Display Mac mini (`MOMO_LOCAL=1`):** hàng đợi local + SSE. `instrumentation.ts` → `startDisplayIngest()` chỉ khi `usesLocalStore()` và đã có `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Realtime + catch-up (`src/lib/checkinRealtime.ts`). Không còn public ingest API.

Project Supabase: **momo-booth**, ref `glkivvrqtxlurqqyypam`, org `idlltjlwtplnnyfozxvs`, region `ap-southeast-1` (free). URL: `https://glkivvrqtxlurqqyypam.supabase.co`. Tables: `codes(code, booth)` PK; `checkins` unique `(code, booth)`, index `(booth, created_at)`; RLS; `checkins` trong `supabase_realtime`. 32 mã sample (A01–A16 booth `5-10`, B01–B16 booth `3-5`) đã sync.

## Đã xong

- Hardening 1–7, bỏ `@vercel/blob`, thêm `@supabase/supabase-js` ^2.119.0 (cài 2.119.0). Rate limit check-in mặc định 300 (`RATE_LIMIT_CHECKIN_PER_MIN`). Staff key fail-closed, sha256 + timingSafeEqual. Persist xoay `.bak-1..10`. `PUBLIC_BASE_URL`.
- `npm run codes:sync` (`scripts/seed-codes.mjs`) chạy với `SUPABASE_SERVICE_ROLE_KEY` từ env: **read 32, upserted 32, errors 0**. SQL xác nhận 16 + 16 = 32. Key service-role dạng mới (41 ký tự) **không** gãy supabase-js 2.119.0.
- Vercel project `prj_7d7e7UYr8vS2YxOAN1Tzi86wOR2O`, team `team_XLlZ9kT7x8xDgWEwtC4umXbS`. Env **preview + production** (tạo 23:07:15 Asia/Saigon, 11/11/2026), **chỉ tên**:
  - `NEXT_PUBLIC_SUPABASE_URL` (plain)
  - `SUPABASE_SERVICE_ROLE_KEY` (sensitive)
  - `BLOB_READ_WRITE_TOKEN` (đã có từ trước)
  - **Chưa có** `NEXT_PUBLIC_SUPABASE_ANON_KEY` (publishable không đưa được vào file chmod-600 mà Shell đọc được, không gắn vào MCP để tránh lộ giá trị).
- Production **không** redeploy, vẫn `dpl_C5CE8XGktSHKwruHMYSSHdjvhPwK` (READY, 2026-11-05 18:17:35 Asia/Saigon). Env mới chỉ có hiệu lực khi deploy bản mới.
- Item 3a: `POST /api/staff/manual-checkin` + UI “Nhập mã” trên StaffPanel, chỉ local store, staff-key + staff-write rate limit. `npm test` TEST_EXIT=0, `npm run build` BUILD_EXIT=0 (11/11/2026, Cursor grok-4.7-high).
- Harness `scripts/e2e-hybrid.mjs` / `npm run e2e:hybrid` đã viết (Cursor). Chạy thiếu anon: seed 200, check-in **200/200**, resubmit **10/10** `already-checked-in`, rows không tăng, cleanup xóa 200 checkins + 200 mã `E2E-%`, roster sample 32 còn nguyên. Exit 2. Latency / reconnect **SKIPPED**.

## Số test / stress (đã đo, không bịa)

Stress (port 3011, 150 C001–C150 booth `3-5` + 50 D001–D050 booth `5-10`, concurrency 40, sau khi default rate limit = 300):

- Lần A: wall 2.304s, totalRuntimeMs 2120, burst 460ms, p50 79 / p95 141 / max 366 ms, **200/200**, SSE 12/12, staff skip 6/6.
- Lần B: wall 1.931s, totalRuntimeMs 1774, burst 398ms, p50 65 / p95 117 / max 305 ms, **200/200**, cùng consistency.

E2E hybrid (chỉ check-in role, ~44s, 11/11/2026 đêm Asia/Saigon): xem trên. **Chưa đo** check-in-to-display p50/p95/max và reconnect catch-up vì thiếu publishable key trên box.

## Chưa xong / bị chặn

- **E2E đầy đủ:** cần `NEXT_PUBLIC_SUPABASE_ANON_KEY` trên box (cùng cách với service role: env, đừng in ra). Rồi `npm run e2e:hybrid`.
- **Item 3b:** pending-sync queue (idempotent) đẩy check-in staff offline lên Supabase khi reconnect — chưa làm. Chỉ xong 3a (nhập tay vào store local).
- Preview deploy: copy local không phải git; chưa deploy preview. Production deploy **chưa được duyệt**.
- Đổi tên booth `5-10` / `3-5`: chờ anh quyết.
- Độ dài key service role trên Vercel: MCP `$file:` báo 10 bytes trong biên nhận, file local lúc ghi là 41 bytes, giá trị sensitive không decrypt. Nên anh kiểm tra độ dài trên dashboard, **đừng** dán key vào chat.

## Cách chạy

Thư mục: `/workspace/momo-booth-local`. `npm install` rồi:

```bash
npm test
npm run build
```

**Mac mini / display** (local store + Realtime):

```bash
export MOMO_LOCAL=1
export STAFF_KEY='<unique, not placeholder, not momo-ptb>'
export NEXT_PUBLIC_SUPABASE_URL='https://glkivvrqtxlurqqyypam.supabase.co'
export NEXT_PUBLIC_SUPABASE_ANON_KEY='<publishable, not the service role>'
npm start   # hoặc next start, port 3000
```

**Check-in role** (giống Vercel): không set `MOMO_LOCAL`. Cần `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`. Để `usesLocalStore()` = false khi test trên máy không có Blob, set dummy `BLOB_READ_WRITE_TOKEN` và `BLOB_STORE_ID` (không dùng token thật).

**Sync 32 mã sample:**

```bash
NEXT_PUBLIC_SUPABASE_URL='https://glkivvrqtxlurqqyypam.supabase.co' \
SUPABASE_SERVICE_ROLE_KEY="$MOMO_SUPABASE_SERVICE_ROLE_KEY" \
npm run codes:sync
```

**E2E hybrid** (cần build sẵn, không in key):

```bash
NEXT_PUBLIC_SUPABASE_URL='https://glkivvrqtxlurqqyypam.supabase.co' \
SUPABASE_SERVICE_ROLE_KEY="$MOMO_SUPABASE_SERVICE_ROLE_KEY" \
NEXT_PUBLIC_SUPABASE_ANON_KEY="$MOMO_SUPABASE_ANON_KEY" \
npm run e2e:hybrid
```

Thiếu anon → script vẫn seed / 200 check-in / duplicate / cleanup, skip latency+reconnect, exit 2.

**Stress local:** `npm run stress` (sau `npm run build`). Mặc định check-in 300/phút.

## File / secret cố ý không commit

Các path dưới đây **ở local only**, không được đẩy lên GitHub:

- `/workspace/momo-booth-local/.env.local` — hiện **không tồn tại**. Nếu tạo sau này: chmod 600, chỉ chứa tên biến cần thiết, không commit (đã gitignore).
- `/workspace/momo-booth-local/.env` — không dùng / không commit.
- `/workspace/momo-booth-local/data/live-state.json`
- `/workspace/momo-booth-local/data/live-state.json.bak-1`
- `/workspace/momo-booth-local/data/live-state.json.bak-2`
- `/workspace/momo-booth-local/data/stress-roster.json`
- `/workspace/momo-booth-local/data/stress-state.json`
- `/workspace/momo-booth-local/data/stress-state.json.bak-1` … `bak-7`
- `/workspace/momo-booth-local/node_modules/`
- `/workspace/momo-booth-local/.next/`
- `/workspace/momo-booth-local/tsconfig.tsbuildinfo`
- `/workspace/momo-agent-logs/secrets/` — file phụ trợ (ví dụ `supabase_url`). Không commit.
- Service role **không** nằm trong repo. Nó sống trong box env `MOMO_SUPABASE_SERVICE_ROLE_KEY`. **Không bao giờ in, echo, log, hay cat giá trị này.** Chỉ truyền `SUPABASE_SERVICE_ROLE_KEY="$MOMO_SUPABASE_SERVICE_ROLE_KEY"` khi chạy lệnh.

`.env.example` (placeholder only, không có key thật) thì được commit để hướng dẫn.
