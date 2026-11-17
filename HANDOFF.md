# momo-booth handoff

Sự kiện 19–27/11/2026. Hai màn: `5-10` (5 năm) và `3-5` (10 và 15 năm). Không in key.

## Luồng chính

Vercel chạy `MOMO_REMOTE=1`. Hàng chờ nằm một dòng `public.live_state`. Check-in, skip và done đều sửa dòng đó. TV mở `https://<domain>/d/<booth>` bằng Chrome. Không còn ghi bảng `checkins` và không còn listener Realtime trên Mac mini.

Cần `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` và `STAFF_KEY` không phải placeholder. Trên Vercel đặt `TRUST_PROXY=1`.

## Fallback khi mất mạng

1. Bật Mac mini với `MOMO_LOCAL=1` và `STAFF_KEY` riêng.
2. Trỏ cả hai TV vào `http://<ip-mac>:3000/d/<booth>`.
3. Dùng QR in sẵn, hoặc nhân sự nhập mã trên `/staff`.
4. Khi có mạng, trỏ TV lại domain Vercel.
5. Ghi lại những người đã được chiếu lúc offline để không chiếu trùng.

`MOMO_LOCAL` thắng nếu cả hai cờ cùng bật.

## Check-in

QR check-in nằm góc phải màn loop và mở `/c`. Điện thoại quét QR mã nhân viên, không gõ mã. Staff vẫn nhập mã tay, chỉ khi `MOMO_LOCAL=1`.
