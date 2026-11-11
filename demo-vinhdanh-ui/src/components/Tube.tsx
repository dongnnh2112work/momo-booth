import { Canvas, useFrame } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import { CanvasTexture, Mesh, MeshBasicMaterial, PlaneGeometry, SRGBColorSpace } from "three";
import type { Guest } from "../data/loadGuests.ts";

const CARD_W = 512;
const CARD_H = 808;
const FOOTER_H = 170;
const PLANE_W = 0.82;
const PLANE_H = 0.82 * (1395 / 885);
const RADIUS = 1.55;
const SLOTS = 9;
const TAU = Math.PI * 2;
const SLOT_ANGLE = TAU / SLOTS;
const HALF_SLOT = Math.PI / SLOTS;
const SPEED = 0.18;

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
};

function wrapTau(rad: number): number {
  return ((rad % TAU) + TAU) % TAU;
}

/** Guest a mesh will show the next time it reaches the front (theta = 0). */
function guestIndexFor(baseTheta: number, angle: number, count: number): number {
  const theta = wrapTau(baseTheta + angle);
  const delta = theta < 1e-6 ? 0 : TAU - theta;
  const presentation = Math.round((angle + delta) / HALF_SLOT);
  return ((presentation % count) + count) % count;
}

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

function drawGuestCard(
  ctx: CanvasRenderingContext2D,
  guest: Guest,
  photo: HTMLImageElement | null,
): void {
  const w = CARD_W;
  const h = CARD_H;
  const photoBottom = h - FOOTER_H;

  ctx.clearRect(0, 0, w, h);
  ctx.save();
  roundedRect(ctx, 0, 0, w, h, 40);
  ctx.clip();

  const gradient = ctx.createLinearGradient(0, 0, 0, h);
  gradient.addColorStop(0, "#FDE6EF");
  gradient.addColorStop(1, "#F95396");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, w, h);

  const glow = ctx.createRadialGradient(w * 0.5, h * 0.22, 24, w * 0.5, h * 0.3, w * 0.75);
  glow.addColorStop(0, "rgba(255,255,255,0.5)");
  glow.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);

  if (photo && photo.naturalWidth > 0 && photo.naturalHeight > 0) {
    const scale = Math.min(w / photo.naturalWidth, photoBottom / photo.naturalHeight);
    const dw = photo.naturalWidth * scale;
    const dh = photo.naturalHeight * scale;
    ctx.drawImage(photo, (w - dw) / 2, (photoBottom - dh) / 2, dw, dh);
  }

  ctx.fillStyle = "#D9D9D9";
  ctx.fillRect(0, photoBottom, w, FOOTER_H);

  ctx.fillStyle = "#F95396";
  ctx.font = '36px "Be Vietnam Pro", sans-serif';
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(guest.name, 28, photoBottom + FOOTER_H / 2, w - 56);

  const years = String(guest.years);
  ctx.font = '140px "Paytone One", "Baloo 2", sans-serif';
  ctx.textAlign = "right";
  ctx.textBaseline = "alphabetic";
  ctx.lineWidth = 8;
  ctx.lineJoin = "round";
  ctx.strokeStyle = "#ffffff";
  ctx.strokeText(years, w - 28, photoBottom - 16);
  ctx.fillStyle = "#F95396";
  ctx.fillText(years, w - 28, photoBottom - 16);

  ctx.restore();
}

function paintTile(tile: Tile, guests: Guest[], photos: Map<string, HTMLImageElement>): void {
  const guest = guests[tile.guestIndex];
  if (!guest) return;
  const photo = photos.get(guest.photoUrl) ?? null;
  drawGuestCard(tile.ctx, guest, photo);
  tile.texture.needsUpdate = true;
}

function createTubeModel(guests: Guest[]): TubeModel {
  const geometry = new PlaneGeometry(PLANE_W, PLANE_H);
  const tiles: Tile[] = [];
  const count = guests.length;

  for (let row = 0; row < 2; row += 1) {
    const rowOffset = row === 1 ? HALF_SLOT : 0;
    const y = row === 1 ? 0.32 : -0.32;
    for (let slot = 0; slot < SLOTS; slot += 1) {
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
      const guestIndex = guestIndexFor(baseTheta, 0, count);
      mesh.position.set(Math.sin(baseTheta) * RADIUS, y, Math.cos(baseTheta) * RADIUS);
      mesh.rotation.y = baseTheta;

      const tile: Tile = {
        id: row * SLOTS + slot,
        mesh,
        ctx,
        texture,
        baseTheta,
        y,
        guestIndex,
      };
      paintTile(tile, guests, new Map());
      tiles.push(tile);
    }
  }

  return { geometry, tiles };
}

function TubeRig({ guests }: { guests: Guest[] }) {
  const photosRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const angleRef = useRef(0);
  const modelRef = useRef<TubeModel | null>(null);
  if (modelRef.current === null && guests.length > 0) {
    modelRef.current = createTubeModel(guests);
  }

  useEffect(() => {
    const model = modelRef.current;
    if (!model || guests.length === 0) return;
    const photos = photosRef.current;
    let alive = true;

    const repaint = () => {
      if (!alive || modelRef.current !== model) return;
      for (const tile of model.tiles) paintTile(tile, guests, photos);
    };

    for (const url of new Set(guests.map((guest) => guest.photoUrl))) {
      const img = new Image();
      img.onload = () => {
        photos.set(url, img);
        repaint();
      };
      img.src = url;
    }

    void document.fonts.ready.then(repaint);
    void document.fonts.load('36px "Be Vietnam Pro"').then(repaint);
    void document.fonts.load('140px "Paytone One"').then(repaint);
    void document.fonts.load('140px "Baloo 2"').then(repaint);

    return () => {
      alive = false;
    };
  }, [guests]);

  useFrame((_, delta) => {
    const model = modelRef.current;
    const count = guests.length;
    if (!model || count === 0) return;

    const dt = Number.isFinite(delta) ? delta : 0;
    const steps = Math.min(32, Math.max(1, Math.ceil((SPEED * dt) / 0.35)));
    const stepDt = dt / steps;
    const photos = photosRef.current;

    for (let step = 0; step < steps; step += 1) {
      angleRef.current += SPEED * stepDt;
      const angle = angleRef.current;
      for (const tile of model.tiles) {
        const theta = tile.baseTheta + angle;
        const z = Math.cos(theta) * RADIUS;
        tile.mesh.position.set(Math.sin(theta) * RADIUS, tile.y, z);
        tile.mesh.rotation.y = theta;
        if (z < -0.2) {
          const desired = guestIndexFor(tile.baseTheta, angle, count);
          if (desired !== tile.guestIndex) {
            tile.guestIndex = desired;
            paintTile(tile, guests, photos);
          }
        }
      }
    }
  });

  const model = modelRef.current;
  if (!model) return null;

  return (
    <group>
      {model.tiles.map((tile) => (
        <primitive key={tile.id} object={tile.mesh} />
      ))}
    </group>
  );
}

export function Tube({ guests }: { guests: Guest[] }) {
  if (guests.length === 0) return null;

  return (
    <Canvas
      dpr={[1, 1.5]}
      frameloop="always"
      gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
      camera={{ position: [0, 0, 5.2], fov: 34, near: 0.1, far: 40 }}
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
