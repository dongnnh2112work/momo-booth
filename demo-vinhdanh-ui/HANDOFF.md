# MoMo Vinh danh — UI demo handoff

Standalone Vite + React + TypeScript + R3F demo. Workdir on the box: `/workspace/momo-vinhdanh-demo`. This branch copies the allowed subset into `demo-vinhdanh-ui/`.

Do not merge or deploy production without anh BeeNgyy’s approval. No paid services. No real staff photos or names in this repo.

## How to run

```bash
cd demo-vinhdanh-ui
npm install
npm run dev      # Vite dev server
npm run build    # tsc -b && vite build (was green 2026-11-11, ~23:41 ICT / UTC+7)
npm run preview
```

- Default (`/`): 1080×1920 kiosk stage, auto-rotating 3D card tube (WebGL).
- `?lite=1` or `prefers-reduced-motion`: CSS 3D ring (`LiteStage`), no WebGL.
- Cycle button (bottom-right, low opacity) and ArrowRight / Space increment an unused `selectedIndex` (reserved for the transition module).
- Fonts: **Momo Trust Display/Sans were not on the box.** Bundled fallbacks: Be Vietnam Pro (names/UI), Paytone One / Baloo 2 (year digits), plus OFL text under `public/licenses/`.

**Brand rasters are not in this git folder** (see Asset list). Copy them locally into `public/` before a visual demo, or the card/background will miss those images.

## Screens — done / half-done

Done

- Stage + font faces + letterbox: `src/index.css`
- Mock guests + loader: `data/mock.csv`, `public/data/mock.csv`, `src/data/loadGuests.ts` (20 fake names only; photos always `/portraits/placeholder.png`)
- Person card (HTML/CSS, 885×1395, real text year): `src/components/PersonCard.tsx`
- 3D image tube (18 reused meshes, 2×9, canvas textures, no html2canvas, dpr ≤ 1.5, auto-rotate): `src/components/Tube.tsx`
- CSS 3D fallback: `src/components/LiteStage.tsx`
- Integration (`Tube` default, `LiteStage` when `?lite=1` or reduced motion): `src/App.tsx`, `src/main.tsx`
- App shell: `index.html`, `vite.config.ts`, `package.json`

Half-done / known gaps

- Tube framing: camera is `[0, 0, 5.2]`, fov 34, row y ±0.32 (after a tighten). Earlier 1080×1920 captures still cropped the front card (`artifacts/s3-idle-tube-too-close.png`, `artifacts/s3-idle-tube.png` on the box only — not committed). Needs a visual retune so ~9–11 cards show and the front card is ~62–70% of stage height.
- `PersonCard.tsx` already contains holo/shine, breathing, year count-up, confetti, and floating cubes from an earlier local pass. The **canonical transition + holo overlay is owned by the cloud module** (see below). Expect overlap when merging; prefer the cloud module for fly-out / flip / hold / `?auto=1`.
- No fly-out, flip, hold timer, or `?auto=1` cycle in this folder.
- No official Momo Trust font files.
- No Vercel preview / no production deploy from this work.
- Software-GL Playwright fps is not representative of the kiosk Mac mini.

Box-only screenshots (not in git): `/workspace/momo-vinhdanh-demo/artifacts/s2-person-card.png`, `s3-idle-tube.png`, `s3-idle-tube-too-close.png`, `s5-lite.png`.

## Transition / holo module (other agent)

Lives on branch `demo/vinhdanh-transition` in folder `demo-vinhdanh-transition/`, built by Cursor cloud agent `bc-04f5e6a7-dbf6-423e-9d82-972ca789ef38`. Scope: fly-out + flip transition and holo single-person overlay (shine, breathing, count-up, confetti, floating cubes). TECH-LEAD will merge that module into this UI branch afterwards (via Cursor). Do not treat this folder as the source of truth for those effects.

## Asset list

Committed here

- `public/fonts/BeVietnamPro-Regular.ttf`, `BeVietnamPro-SemiBold.ttf`, `BeVietnamPro-Bold.ttf`, `PaytoneOne-Regular.ttf`, `Baloo2[wght].ttf`
- `public/licenses/OFL-BeVietnamPro.txt`, `OFL-PaytoneOne.txt`, `OFL-Baloo2.txt`
- `public/portraits/placeholder.png` (generated silhouette, not a real person)
- `data/mock.csv` and `public/data/mock.csv` (fake names only)

**Not committed** (MoMo client brand rasters / SVGs, or private). Copy from the box when running a visual demo:

- Background: `/workspace/momo-vinhdanh-demo/public/bg/bg_momo_vinhdanh_1080x1920.png` (source `/workspace/momo/bi-ti/bg_momo_vinhdanh_1080x1920.png`) → `public/bg/`
- Card chrome: `/workspace/momo-vinhdanh-demo/public/figma/` — `tag-frame@2x.png`, `tag-frame.svg`, `SecurityBand.svg`, `M16 Me.We.Impact.svg`, `icon-star@2x.png`, `icon-star.svg`, `Group 255.png`, `Bục 5.png`, `Bục 5@2x.png`, `Cube 1 3.png`, `Cube 4 3.png`, `Cube 7 3.png`, `Rectangle 240.png`
- Icons: `/workspace/momo-vinhdanh-demo/public/icons/icon-calendar-96.png`, `icon-calendar-96@2x.png` (source `/workspace/momo/bi-ti/`)
- Layout refs only (do not ship; contain a real face): `/workspace/momo/preview_bigcard_a.png`, `preview_bigcard_b.png`, `the-mau.png`, `/workspace/momo/figma-export/Frame 144.png`, `15 1.png`, `Group 256.png`
- Real cut-out, local only, never commit or deploy: `/workspace/momo-vinhdanh-demo/_inputs/private-portrait/A Công 1.png`

## Next steps (for the cloud / TECH-LEAD agent on this branch)

1. Copy brand assets locally (paths above); do not commit them unless anh explicitly allows it.
2. Merge `demo/vinhdanh-transition` (`demo-vinhdanh-transition/`) for fly-out, flip, holo overlay, hold, and `?auto=1`. Resolve overlap with existing motion already in `PersonCard.tsx`.
3. Retune tube camera / row spacing against a 1080×1920 capture.
4. Keep the repo free of real portraits and secrets. No production deploy, no merge to `main` without anh’s approval.
