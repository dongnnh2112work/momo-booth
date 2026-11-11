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

**Not committed — full local paths of everything intentionally left out of git**

Copy brand files from the `public/` copies (or the sources) onto a machine running the demo. Do not commit them unless anh explicitly allows it. Never commit or deploy the real cut-out.

Real portrait (local only):

- `/workspace/momo-vinhdanh-demo/_inputs/private-portrait/A Công 1.png`
- `/workspace/momo-vinhdanh-demo/_inputs/private-portrait/A Cong 1.png` (same file, ASCII name)
- `/workspace/momo/figma-export/A Công 1.png`

Layout / preview refs (some include a real face; do not ship):

- `/workspace/momo/the-mau.png`
- `/workspace/momo/preview_bigcard_a.png`
- `/workspace/momo/preview_bigcard_b.png`
- `/workspace/momo/bi-ti/preview_card_on_bg.png`
- `/workspace/momo-vinhdanh-demo/_inputs/refs/the-mau.png`
- `/workspace/momo-vinhdanh-demo/_inputs/refs/preview_bigcard_a.png`
- `/workspace/momo-vinhdanh-demo/_inputs/refs/preview_bigcard_b.png`
- `/workspace/momo-vinhdanh-demo/_inputs/refs/preview_card_on_bg.png`

Entire Figma export folder `/workspace/momo/figma-export/`:

- `/workspace/momo/figma-export/15 1.png`
- `/workspace/momo/figma-export/15 1@2x.png`
- `/workspace/momo/figma-export/A Công 1.png`
- `/workspace/momo/figma-export/Bục 5.png`
- `/workspace/momo/figma-export/Bục 5@2x.png`
- `/workspace/momo/figma-export/Cube 1 3.png`
- `/workspace/momo/figma-export/Cube 4 3.png`
- `/workspace/momo/figma-export/Cube 7 3.png`
- `/workspace/momo/figma-export/Frame 144.png`
- `/workspace/momo/figma-export/Group 255.png`
- `/workspace/momo/figma-export/Group 256.png`
- `/workspace/momo/figma-export/M16 Me.We.Impact.svg`
- `/workspace/momo/figma-export/Rectangle 239.png`
- `/workspace/momo/figma-export/Rectangle 240.png`
- `/workspace/momo/figma-export/SecurityBand.svg`
- `/workspace/momo/figma-export/icon-star.svg`
- `/workspace/momo/figma-export/icon-star@2x.png`
- `/workspace/momo/figma-export/tag-frame.svg`
- `/workspace/momo/figma-export/tag-frame@2x.png`

Entire Bi Ti / background folder `/workspace/momo/bi-ti/`:

- `/workspace/momo/bi-ti/bg_momo_vinhdanh_1080x1920.png`
- `/workspace/momo/bi-ti/icon-calendar-96.png`
- `/workspace/momo/bi-ti/icon-calendar-96@2x.png`
- `/workspace/momo/bi-ti/preview_card_on_bg.png`
- `/workspace/momo/bi-ti/raw/bg_momo.png`
- `/workspace/momo/bi-ti/raw/icon_calendar_1000.png`
- `/workspace/momo/bi-ti/raw/star_1000.png`

Brand rasters / SVGs copied into the demo `public/` on the box but excluded from this branch (copy these into `public/` to run a visual demo):

- `/workspace/momo-vinhdanh-demo/public/bg/bg_momo_vinhdanh_1080x1920.png`
- `/workspace/momo-vinhdanh-demo/public/figma/Bục 5.png`
- `/workspace/momo-vinhdanh-demo/public/figma/Bục 5@2x.png`
- `/workspace/momo-vinhdanh-demo/public/figma/Cube 1 3.png`
- `/workspace/momo-vinhdanh-demo/public/figma/Cube 4 3.png`
- `/workspace/momo-vinhdanh-demo/public/figma/Cube 7 3.png`
- `/workspace/momo-vinhdanh-demo/public/figma/Group 255.png`
- `/workspace/momo-vinhdanh-demo/public/figma/M16 Me.We.Impact.svg`
- `/workspace/momo-vinhdanh-demo/public/figma/Rectangle 240.png`
- `/workspace/momo-vinhdanh-demo/public/figma/SecurityBand.svg`
- `/workspace/momo-vinhdanh-demo/public/figma/icon-star.svg`
- `/workspace/momo-vinhdanh-demo/public/figma/icon-star@2x.png`
- `/workspace/momo-vinhdanh-demo/public/figma/tag-frame.svg`
- `/workspace/momo-vinhdanh-demo/public/figma/tag-frame@2x.png`
- `/workspace/momo-vinhdanh-demo/public/icons/icon-calendar-96.png`
- `/workspace/momo-vinhdanh-demo/public/icons/icon-calendar-96@2x.png`

Other local-only demo files (not source of the git folder):

- `/workspace/momo-vinhdanh-demo/_briefs/` (Cursor prompts)
- `/workspace/momo-vinhdanh-demo/_inputs/fonts/`, `_inputs/licenses/` (already committed under `public/fonts` and `public/licenses`)
- `/workspace/momo-vinhdanh-demo/artifacts/s2-person-card.png`
- `/workspace/momo-vinhdanh-demo/artifacts/s3-idle-tube.png`
- `/workspace/momo-vinhdanh-demo/artifacts/s3-idle-tube-too-close.png`
- `/workspace/momo-vinhdanh-demo/artifacts/s5-lite.png`
- `/workspace/momo-vinhdanh-demo/node_modules/`, `dist/`, any `.env` (none should exist)

## Next steps (for the cloud / TECH-LEAD agent on this branch)

1. Copy brand assets locally (paths above); do not commit them unless anh explicitly allows it.
2. Merge `demo/vinhdanh-transition` (`demo-vinhdanh-transition/`) for fly-out, flip, holo overlay, hold, and `?auto=1`. Resolve overlap with existing motion already in `PersonCard.tsx`.
3. Retune tube camera / row spacing against a 1080×1920 capture.
4. Keep the repo free of real portraits and secrets. No production deploy, no merge to `main` without anh’s approval.
