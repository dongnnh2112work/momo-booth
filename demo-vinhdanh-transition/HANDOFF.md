# Bàn giao: demo chuyển cảnh + thẻ holo (Vinh danh MoMo)

## Bối cảnh

Đây là booth **Vinh danh MoMo** (màn hình dọc 1080×1920). Module này chỉ làm hai việc:

1. **Chuyển cảnh 3D:** một mặt phẳng trong ống đang xoay dừng lại, bay ra trước camera khoảng 1,2 giây kèm lật quanh trục Y, các thẻ khác mờ và lùi, giữ một lúc rồi bay ngược về.
2. **Overlay một người:** thẻ HTML/CSS 885×1395 trên sân khấu 1080×1920, hiệu ứng holo giảm (nghiêng, vệt sáng tránh vùng mặt, thở, đếm số năm, confetti, khối ở mép).

Module **thẻ thật + ống 3D** nằm ở nhánh `demo/vinhdanh-ui`. Hai nhánh sẽ ghép sau. Repo này public, nên mọi ảnh và chữ trên demo là placeholder màu. Không commit ảnh người, dữ liệu nhân sự, hay khóa.

## Đã xong

- App Vite + React + TypeScript + `@react-three/fiber` + `@react-three/drei`, tách khỏi app Next.js ở gốc repo.
- `src/Transition.tsx`: máy trạng thái `idle → enter (phanh + bay) → hold → exit → idle`. Bay `1200ms`, một vòng lật quanh Y và kết thúc mặt hướng camera. Thẻ khác trượt ra xa, thu nhẹ, opacity về khoảng `0.08`. Giữ `holdMs` (mặc định `45000`) rồi đảo chiều. Mesh được tái sử dụng, không nhân bản để bay.
- `src/HoloCard.tsx` + `src/HoloCard.css`: thẻ 885×1395. Nghiêng theo con trỏ, không có con trỏ thì tự nghiêng. Vệt sáng chu kỳ 11 giây, mask elip vùng mặt trên-giữa (khoảng 40% bề ngang). Scale thở `1 → 1.015`. Số năm đếm trong `800ms`. Confetti `2s` đầu. Năm khối CSS ở mép. `prefers-reduced-motion` tắt lật, vệt sáng, confetti, thở và vòng xoay.
- `src/demo.tsx` + `src/demo.css` + `src/placeholders.ts`: ống 18 mặt phẳng, một `PlaneGeometry` dùng chung, texture canvas màu (không file ảnh). Nút «Thẻ tiếp» / «Dừng», bấm lên mặt phẳng cũng kích hoạt. `?auto=1` bắn mỗi 12 giây (lần đầu sau 1,2 giây).
- Hiệu năng kiosk: `dpr` tối đa `1.5`, `antialias: false`, material cơ bản, không hậu kỳ.
- `npm run build` (`tsc --noEmit && vite build`) đã chạy thành công.

## Làm dở / cố ý để ghép sau

- Ống trong `src/demo.tsx` chỉ là vòng tròn placeholder để thử chuyển cảnh. Ống và thẻ thiết kế thật thuộc `demo/vinhdanh-ui`.
- Nội dung `HoloCard` là chữ và hình khối («Mẫu 01», «ẢNH», «The Power of Small»). Chưa phải layout Figma, chưa gắn ảnh.
- Hiệu ứng holo là bản giảm của kiểu pokemon-card (glare theo con trỏ, không filter hạt, opacity thấp). Chưa khớp pixel với file thiết kế.
- Chưa nối `activeIndex` với spotlight của booth Next.js (`src/components/DisplayStage.tsx` ở gốc repo không bị sửa).
- Camera và bán kính ống trong demo chỉnh cho placeholder. Khi gắn ống thật cần chỉnh lại khoảng bay (thẻ kết thúc chiếm đúng `1395/1920` chiều cao khung nhìn).

## API

Đặt `TransitionController` **bên trong** `<Canvas>`.

```tsx
<TransitionController
  activeIndex={0}               // null = hủy, thẻ đang bay sẽ trở về
  holdMs={45000}                // mặc định TRANSITION_HOLD_MS = 45000
  spinSpeed={0.18}              // rad/s khi rảnh; có thể bỏ
  onDone={() => {}}             // một lần, khi thẻ đã về và ống được quay tiếp
  onPhaseChange={(phase) => {}} // "idle" | "enter" | "hold" | "exit"
>
  <group ref={useTubeRig()}>{/* mesh thẻ */}</group>
</TransitionController>
```

- `useTubeRig()` gắn vào `group` cha của các thẻ. Controller là nơi duy nhất ghi `rotation.y`. Đừng tự cộng trục này.
- `useCardSlot(index)` trả về callback ref cho từng `mesh`. `index` trùng `activeIndex`. Gọi sau khi đã đặt vị trí/quaternion «nhà» của thẻ.
- `useTransitionPhase()` đọc pha từ component nằm trong controller. Ngoài canvas thì dùng `onPhaseChange`.
- Một chu kỳ chạy khi `activeIndex` đổi sang một số khác số vừa xong. Muốn phát lại cùng một thẻ: đặt `null`, rồi đặt lại số đó.
- Material của thẻ cần có `opacity` (sẽ bị làm trong suốt). Không clone mesh.

```tsx
<HoloCard
  active={phase === "hold"}
  years={7}
  name="Mẫu 01"
  department="Nhóm demo A"
  greeting={"Thank you\nfor being you"}
/>
```

`HoloCard` là lớp HTML phủ lên canvas, gốc `1080×1920`, thẻ `885×1395` ở giữa. Demo scale lớp này bằng `zoom` để không bóp canvas WebGL.

Hằng số xuất ra: `TRANSITION_FLY_MS` (1200), `TRANSITION_HOLD_MS` (45000), type `TransitionPhase`.

## Cách chạy

```bash
cd demo-vinhdanh-transition
npm install
npm run dev       # http://127.0.0.1:5174
npm run build
npm run preview
```

Query:

- `?auto=1` — tự gọi thẻ kế tiếp mỗi 12 giây. Lúc này demo truyền `holdMs={7500}` để một vòng bay xong trước nhịp sau.
- `?hold=2500` — giữ đúng số mili giây đó.
- `?hold=default` — không truyền prop, component dùng `45000`.
- Không query, bấm tay: demo dùng `4000` để thấy thẻ bay về, không phải mặc định của component.

Phím: `Space` hoặc `→` = thẻ tiếp, `Escape` = dừng.

## Việc tiếp theo

1. Ghép với nhánh `demo/vinhdanh-ui`: ống và thẻ của nhánh đó đăng ký `useTubeRig` / `useCardSlot`; overlay bật khi `onPhaseChange` báo `"hold"`.
2. Thay chữ và khối placeholder trong `HoloCard` bằng thẻ thiết kế, vẫn giữ nghiêng, vệt sáng (mask mặt), thở, đếm năm, confetti.
3. Chỉnh đích bay cho khớp khung thẻ thật. Đừng thêm post-processing; giữ `dpr ≤ 1.5` và tái sử dụng mesh.
4. Nối `activeIndex` với spotlight booth (giữ tối thiểu 45 giây, đúng `holdMs` mặc định).
5. Chỉ copy asset local khi chạy trên máy tech-lead. Không đưa các file đó vào git.

## Asset thật (không commit)

Ảnh thương hiệu và ảnh người nằm trên máy **TECH-LEAD**, thư mục `/workspace/momo/`:

- `figma-export`
- `bi-ti`
- `the-mau.png`
- `preview_bigcard_a.png`

Chúng cố ý không có trong repo vì repo public. Demo chỉ dùng màu vẽ bằng canvas và CSS.
