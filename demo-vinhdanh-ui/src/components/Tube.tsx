import { Canvas, useFrame } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import { CanvasTexture, Group, Mesh, MeshBasicMaterial, PlaneGeometry, SRGBColorSpace } from "three";
import type { Guest } from "../data/loadGuests.ts";

const CARD_W = 856;
const CARD_H = 1350;
const CARD_SCALE = CARD_W / 428;
const FALLBACK_PHOTO = "/portraits/placeholder.png";
const DECOR_URLS = ["/card/band.png", "/card/ribbon.png", "/card/cubes.png"] as const;
// Sized for a portrait kiosk: camera sits inside the cylinder, like the
// Codrops tube, so a few tall cards fill the view and the sides bend away.
const PLANE_W = 1.85;
const PLANE_H = PLANE_W * (1395 / 885);
const RADIUS = 2.7;
const PER_ROW = 10;
const ROW_Y = [-1.55, 1.55];
const TAU = Math.PI * 2;
const SLOT_ANGLE = TAU / PER_ROW;
const SPEED = 0.16;

type Tile = {
  id: number;
  mesh: Mesh;
  ctx: CanvasRenderingContext2D;
  texture: CanvasTexture;
  baseTheta: number;
  y: number;
  guestIndex: number;
};

type TubeModel = {
  geometry: PlaneGeometry;
  tiles: Tile[];
  group: Group;
};

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number,
): void {
  const r = Math.min(radius, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function px(value: number): number {
  return value * CARD_SCALE;
}

function drawStar(ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number): void {
  ctx.beginPath();
  for (let i = 0; i < 5; i += 1) {
    const outer = -Math.PI / 2 + (i * Math.PI * 2) / 5;
    const inner = outer + Math.PI / 5;
    const ox = cx + Math.cos(outer) * radius;
    const oy = cy + Math.sin(outer) * radius;
    const ix = cx + Math.cos(inner) * radius * 0.45;
    const iy = cy + Math.sin(inner) * radius * 0.45;
    if (i === 0) ctx.moveTo(ox, oy);
    else ctx.lineTo(ox, oy);
    ctx.lineTo(ix, iy);
  }
  ctx.closePath();
  ctx.fill();
}

function drawGuestCard(
  ctx: CanvasRenderingContext2D,
  guest: Guest,
  photo: HTMLImageElement | null,
  decor: Map<string, HTMLImageElement>,
): void {
  const w = CARD_W;
  const h = CARD_H;

  ctx.clearRect(0, 0, w, h);
  ctx.save();
  roundedRect(ctx, 0, 0, w, h, px(28));
  ctx.clip();

  const gradient = ctx.createLinearGradient(0, 0, w * 0.35, h);
  gradient.addColorStop(0, "#FEC8DC");
  gradient.addColorStop(1, "#F95396");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, w, h);

  const band = decor.get("/card/band.png");
  if (band) ctx.drawImage(band, px(28), px(22), px(30), px(448));

  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.font = `${px(13)}px "MoMo Trust Display", sans-serif`;
  ctx.fillText("M16", px(8), px(6));
  ctx.font = `${px(9)}px "MoMo Trust Sans", sans-serif`;
  ctx.fillText("Me.We.Impact", px(8), px(20));

  if (photo && photo.naturalWidth > 0) {
    const boxW = px(280);
    const boxH = px(430);
    const scale = Math.min(boxW / photo.naturalWidth, boxH / photo.naturalHeight);
    const dw = photo.naturalWidth * scale;
    const dh = photo.naturalHeight * scale;
    ctx.drawImage(photo, px(28) + (boxW - dw) / 2, px(96) + boxH - dh, dw, dh);
  }

  const glow = ctx.createRadialGradient(px(214), px(420), px(10), px(214), px(420), px(190));
  glow.addColorStop(0, "rgba(93,25,52,0.72)");
  glow.addColorStop(1, "rgba(93,25,52,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, px(280), w, px(250));

  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  const stats = [
    [guest.stat1Value, guest.stat1Label, 158],
    [guest.stat2Value, guest.stat2Label, 214],
    [guest.stat3Value, guest.stat3Label, 270],
  ] as const;
  for (const [value, label, top] of stats) {
    ctx.font = `${px(22)}px "MoMo Trust Display", sans-serif`;
    ctx.fillText(value, px(276), px(top), px(136));
    ctx.font = `${px(12)}px "MoMo Trust Sans", sans-serif`;
    ctx.fillText(label, px(276), px(top + 22), px(136));
  }

  const years = String(guest.years);
  const yearX = px(400);
  const yearY = px(430);
  ctx.font = `${px(96)}px "MoMo Trust Display", sans-serif`;
  ctx.textAlign = "right";
  ctx.textBaseline = "alphabetic";
  ctx.lineJoin = "round";
  ctx.lineWidth = px(4);
  ctx.strokeStyle = "#A50064";
  ctx.strokeText(years, yearX + px(6), yearY + px(7));
  ctx.fillStyle = "#FF7EB3";
  ctx.fillText(years, yearX + px(6), yearY + px(7));
  ctx.lineWidth = px(7);
  ctx.strokeStyle = "#ffffff";
  ctx.strokeText(years, yearX, yearY);
  ctx.fillStyle = "#F95396";
  ctx.fillText(years, yearX, yearY);

  const cubes = decor.get("/card/cubes.png");
  if (cubes) ctx.drawImage(cubes, px(188), px(424), px(230), px(94));

  const ribbon = decor.get("/card/ribbon.png");
  if (ribbon) ctx.drawImage(ribbon, px(108), px(18), px(253), px(84));
  ctx.fillStyle = "#F95396";
  ctx.font = `500 ${px(16)}px "MoMo Trust Sans", sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(guest.tag, px(234.5), px(60), px(190));

  ctx.fillStyle = "#D9D9D9";
  ctx.fillRect(0, px(525), w, px(150));

  ctx.fillStyle = "#F95396";
  ctx.font = `${px(30)}px "MoMo Trust Display", sans-serif`;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText(guest.name, px(28), px(540), px(270));

  ctx.fillStyle = "#F95396";
  drawStar(ctx, px(39), px(595), px(12));

  ctx.fillStyle = "#111111";
  ctx.font = `${px(16)}px "MoMo Trust Display", sans-serif`;
  ctx.fillText(guest.department, px(60), px(586), px(230));

  ctx.fillStyle = "#F95396";
  ctx.font = `${px(14)}px "MoMo Trust Sans", sans-serif`;
  ctx.fillText(`Năm gia nhập: ${guest.joinYear}`, px(56), px(620));

  ctx.fillStyle = "#ffffff";
  roundedRect(ctx, px(320), px(582), px(85), px(72), px(3));
  ctx.fill();
  ctx.fillStyle = "#F95396";
  ctx.font = `${px(26)}px "MoMo Trust Display", sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("QR", px(362), px(618));

  ctx.restore();
}

function paintTile(
  tile: Tile,
  guests: Guest[],
  photos: Map<string, HTMLImageElement>,
  decor: Map<string, HTMLImageElement>,
): void {
  const guest = guests[tile.guestIndex];
  if (!guest) return;
  const photo = photos.get(guest.photoUrl) ?? photos.get(FALLBACK_PHOTO) ?? null;
  drawGuestCard(tile.ctx, guest, photo, decor);
  tile.texture.needsUpdate = true;
}

function createTubeModel(guests: Guest[]): TubeModel {
  const geometry = new PlaneGeometry(PLANE_W, PLANE_H);
  const tiles: Tile[] = [];
  const count = guests.length;
  const group = new Group();

  ROW_Y.forEach((y, row) => {
    const rowOffset = row === 1 ? SLOT_ANGLE / 2 : 0;
    for (let slot = 0; slot < PER_ROW; slot += 1) {
      const baseTheta = slot * SLOT_ANGLE + rowOffset;
      const canvas = document.createElement("canvas");
      canvas.width = CARD_W;
      canvas.height = CARD_H;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas 2D context unavailable");
      ctx.imageSmoothingEnabled = true;

      const texture = new CanvasTexture(canvas);
      texture.colorSpace = SRGBColorSpace;
      const material = new MeshBasicMaterial({
        map: texture,
        toneMapped: false,
        transparent: true,
      });
      const mesh = new Mesh(geometry, material);
      const guestIndex = (row * PER_ROW + slot) % count;
      const x = Math.sin(baseTheta) * RADIUS;
      const z = -Math.cos(baseTheta) * RADIUS;
      mesh.position.set(x, y, z);
      mesh.rotation.y = -baseTheta;

      const tile: Tile = {
        id: row * PER_ROW + slot,
        mesh,
        ctx,
        texture,
        baseTheta,
        y,
        guestIndex,
      };
      paintTile(tile, guests, new Map(), new Map());
      tiles.push(tile);
      group.add(mesh);
    }
  });

  return { geometry, tiles, group };
}

function TubeRig({ guests }: { guests: Guest[] }) {
  const photosRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const decorRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const modelRef = useRef<TubeModel | null>(null);
  if (modelRef.current === null && guests.length > 0) {
    modelRef.current = createTubeModel(guests);
  }

  useEffect(() => {
    const model = modelRef.current;
    if (!model || guests.length === 0) return;
    const photos = photosRef.current;
    const decor = decorRef.current;
    let alive = true;

    const repaint = () => {
      if (!alive || modelRef.current !== model) return;
      for (const tile of model.tiles) paintTile(tile, guests, photos, decor);
    };

    const remember = (url: string, img: HTMLImageElement) => {
      photos.set(url, img);
      repaint();
    };

    for (const url of new Set(guests.map((guest) => guest.photoUrl))) {
      const img = new Image();
      img.onload = () => remember(url, img);
      img.onerror = () => {
        if (photos.has(FALLBACK_PHOTO)) {
          photos.set(url, photos.get(FALLBACK_PHOTO)!);
          repaint();
          return;
        }
        const fallback = new Image();
        fallback.onload = () => {
          photos.set(FALLBACK_PHOTO, fallback);
          photos.set(url, fallback);
          repaint();
        };
        fallback.src = FALLBACK_PHOTO;
      };
      img.src = url;
    }

    for (const url of DECOR_URLS) {
      const img = new Image();
      img.onload = () => {
        decor.set(url, img);
        repaint();
      };
      img.src = url;
    }

    void document.fonts.ready.then(repaint);
    void document.fonts.load('30px "MoMo Trust Display"').then(repaint);
    void document.fonts.load('96px "MoMo Trust Display"').then(repaint);
    void document.fonts.load('500 16px "MoMo Trust Sans"').then(repaint);

    return () => {
      alive = false;
    };
  }, [guests]);

  useFrame((_, delta) => {
    const model = modelRef.current;
    if (!model) return;
    const dt = Number.isFinite(delta) ? Math.min(delta, 0.05) : 0;
    model.group.rotation.y += SPEED * dt;
  });

  const model = modelRef.current;
  if (!model) return null;

  return <primitive object={model.group} />;
}

export function Tube({ guests }: { guests: Guest[] }) {
  if (guests.length === 0) return null;

  return (
    <Canvas
      dpr={[1, 1.5]}
      frameloop="always"
      gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
      camera={{ position: [0, 0, 0.15], fov: 72, near: 0.05, far: 30 }}
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 1,
        width: "100%",
        height: "100%",
        background: "transparent",
      }}
      onCreated={({ gl }) => {
        gl.setClearColor(0x000000, 0);
      }}
    >
      <TubeRig guests={guests} />
    </Canvas>
  );
}
