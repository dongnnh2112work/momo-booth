# Những ý trong brief không làm

Ngày 17/11/2026. Brief `CURSOR-FIX-BRIEF.md`, nhánh `feat/hybrid-supabase`. Đây là các ý cố ý không làm, để techlead review. Không phải danh sách còn thiếu sót vô tình.

## Task 3 — giành lại lượt bằng mã

Không làm reclaim: máy khác nhập cùng mã thì lấy slot, đổi `clientId` và ticket.

Mã nhân viên là username email, đoán được. Reclaim trước khi có thêm một bí mật sẽ để người đoán mã cướp lượt đang chiếu. Brief gộp reclaim với PIN ở Task 4. Anh không chọn PIN. Đã chuyển `clientId` và pass sang `localStorage` để cùng một máy mở lại vẫn giữ lượt.

## Task 4 — PIN booth và trần 3 slot mỗi IP

Không làm PIN 4 số đổi mỗi 3 phút.

Anh muốn khách quét QR, không gõ thêm mã. PIN là một ô nhập nữa trên điện thoại và một số trên TV. Thay vào đó, QR check-in nằm góc phải màn loop (`/c`). Trang điện thoại mở camera và quét QR chứa mã nhân viên.

Không làm trần 3 slot (spotlight + hàng) mỗi IP cho cả hai booth.

Wifi sảnh là một NAT. Trần 3 sẽ chặn khách thật đứng cùng mạng. Giới hạn đang dùng: 120 check-in/phút mỗi IP đã biết, 10/phút mỗi `clientId`, bucket chung 5000 chỉ là cầu dao.

## Task 4 — gỡ `code` khỏi API public

Chưa đổi payload public sang khóa mờ.

TV, điện thoại và staff đang khớp người bằng `code` (`spotlight.code`, roster, hàng chờ). Đổi cùng lúc với camera quét QR dễ làm màn vinh danh mất người. Mã vẫn có trong `GET /api/booths/*`. Nên làm thành một thay đổi riêng sau khi QR đã diễn tập, không gộp vào tối nay.

## Task 5 — xác nhận tới booth và đổi giờ

Không thêm trạng thái `pending` 45 giây, nút "Tôi đang ở booth", hay tự skip khi hết giờ xác nhận.

Khách vừa quét còn phải đi tới booth. 45 giây dễ bị skip trước khi lên hình. Nhịp chiếu khách đã chốt không đổi trong đợt này.

Không đổi `MAX_HOLD_MS` từ 4 phút xuống 2 phút, không đổi `MIN_HOLD_MS`, không bật `COOLDOWN_MS` 10 phút.

Ba số này đổi thời gian đứng trên TV. Brief để staff chốt sau rehearsal, không tự sửa trước 19/11.

Không đổi câu ước lượng "trễ nhất" sang trung bình 10 lượt gần nhất.

Chưa có số liệu lượt thật. Công thức cũ vẫn là trần, khách không bị hứa một phút rồi đứng lâu hơn.

Đã làm phần staff: nút Xoá từng người (`op=remove`), `window.confirm` trước Skip và trước Xoá hàng chờ.

## Task 6 — một phần điện thoại

Không rung, không đổi `document.title`, không beep Web Audio.

Nhiều máy trong sảnh kêu cùng lúc. Làm sau nếu rehearsal cần.

Không thêm `POST /api/booths/[id]/leave`.

Khách quét xong đang ở hàng. Rời hàng là thêm một API và một trạng thái nữa sát ngày diễn. Staff đã xoá được từng người.

Banner "Bạn là số 2" chỉ được xoá khi máy chuyển từ đang chờ sang đang chiếu. Không xoá mọi banner mỗi lần `live.kind` đổi, vì câu sai booth / QR lạ cũng nằm ở đó.

## Task 7 — copy thẻ và hiệu năng mosaic

Không đổi công thức cột mốc `2026 - năm gia nhập + 1`, không đưa 700+ / 2000+ ra `data/card-copy.json`.

Số lớn trên thẻ là mốc vinh danh (5 / 10 / 15). Dòng cột mốc là số năm gắn bó. HR chưa ký copy mới. Tách file JSON không đổi được nội dung đang chiếu.

Không virtualize 159 người × 2 bản.

Mosaic vừa chỉnh tỉ lệ ảnh. Cắt cửa sổ render dễ gãy animation cột. Chưa đo dưới 50 fps nên chưa viết lại.

Không tắt SSE trên remote mode.

Poll 2 giây đã có. SSE vẫn đẩy spotlight sớm hơn khi check-in. Lỗi SSE không còn gắn nhãn "Đang kết nối lại…"; chỉ báo sau 3 lần poll liên tiếp thất bại.

## Task 8 — đổi id booth

Không đổi `5-10` / `3-5` thành `y5` / `y10-15`.

Nhãn trên TV đã đúng. Id nằm trong QR, bookmark TV, `live_state` và roster. Đổi id hai ngày trước sự kiện không đáng rủi ro. Đã bỏ dòng "Mã thử A01–A16" trên trang setup vì các mã đó không có trong roster thật.

## Task 9

Không chuyển `demo-vinhdanh-ui` và `demo-vinhdanh-transition` ra khỏi repo, không đổi nhãn Server-Timing `blob-read`.

Hai demo không nằm trên TV sự kiện. Đổi tên timing không đổi hành vi khách. Để sau khi diễn xong.

## Ngoài brief

`scripts/e2e-hybrid.mjs` vẫn nói chuyện với bảng `checkins`. Đường đó đã xoá. Không viết lại harness tối nay vì luồng thật là `live_state`, và script cũ không còn là cách kiểm tra.

Không deploy trong commit này.
