# Runbook ngày sự kiện — TUNE/MoMo booth (Mac mini, local)

Mục tiêu: một Mac mini chạy Next.js local, 2 TV (`/d/3-5` và `/d/5-10`), điện thoại khách/staff cùng LAN.

## Trước giờ mở cửa

1. Cắm LAN/Wi-Fi booth, đặt IP tĩnh hoặc reserved DHCP cho Mac mini. Ghi IP (ví dụ `192.168.1.20`) ra giấy dán TV/standee QR.
2. Tắt sleep: `sudo pmset -a sleep 0 displaysleep 0 disksleep 0` và trong lúc chạy app: `caffeinate -dims -w <pid>`.
3. System Settings → Energy: ngăn Mac ngủ khi đóng nắp nếu dùng dạng mini/dock; tắt “Put hard disks to sleep”.
4. Lần đầu mở cổng 3000, macOS sẽ hỏi firewall — Allow incoming cho Node.
5. Trong thư mục app, không set `BLOB_*`. Chạy với:
   ```
   export MOMO_LOCAL=1
   export STAFF_KEY='(khóa riêng, không dùng mặc định trong repo)'
   npm run build && npm start
   ```
6. TV mở Chrome/Safari toàn màn hình: `http://<ip-mini>:3000/d/3-5` và `/d/5-10`. Check-in: `/c/3-5`, `/c/5-10`. Staff: `/staff`.
7. Auto-restart: dùng `pm2 start npm --name momo-booth -- start` (kèm env trên) hoặc launchd plist `KeepAlive=true`, `WorkingDirectory` trỏ thư mục app, `EnvironmentVariables` có `MOMO_LOCAL=1`.
8. Backup state: cron/mỗi 5 phút `cp data/live-state.json /Volumes/Backup/momo-live-state-$(date +%H%M).json` (file rất nhỏ). Giữ vài bản.

## Trong sự kiện

- TV “Đang kết nối lại…”: refresh tab, kiểm tra cáp/Wi-Fi, xem process còn sống (`pm2 status` / Activity Monitor).
- Điện thoại khách không vào được: thường là đang dùng 4G, không cùng Wi-Fi booth. Không publish app lên internet trừ khi anh chủ động làm.
- IP đổi (DHCP): TV/QR chết. Khóa IP trước giờ mở cửa.
- Ảnh thiếu/hỏng: màn hình vẫn chiếu thông tin chữ; chạy lại `npm run portraits:optimize` nếu vừa thay file gốc, rồi hard-refresh TV (cache immutable).
- Muốn reset hàng chờ: trang Staff (skip / xoá queue), không xóa nhầm `roster.json`.

## Sự cố nguồn / crash

- Mất điện: khi bật lại, launchd/pm2 start app; state được nạp từ `data/live-state.json` (ghi atomic + debounce, flush khi SIGTERM). Nếu file hỏng, đổi sang bản backup rồi restart.
- Không tự khôi phục được thì `cp backup live-state.json && npm start`.

## Kết thúc ngày

- Copy `data/live-state.json` ra USB/ổ dự phòng.
- Tắt caffeinate/pm2 khi thu dọn.
- Không commit roster/ảnh thật lên repo public.
