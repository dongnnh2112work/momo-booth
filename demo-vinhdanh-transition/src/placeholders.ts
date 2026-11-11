import * as THREE from "three";

/** Portrait card ratio used by the kiosk overlay (885×1395). */
export const CARD_ASPECT = 885 / 1395;

export const CARD_COUNT = 18;
export const TUBE_RADIUS = 2.9;
export const CARD_W = 0.7;
export const CARD_H = CARD_W / CARD_ASPECT;

const PALETTE: Array<[string, string]> = [
  ["#ffd0e6", "#e21878"],
  ["#ffe08a", "#ff7a3c"],
  ["#ffb3d1", "#c20d68"],
  ["#d9f4ff", "#3aa0e6"],
  ["#fff6fb", "#ff4b9a"],
  ["#ffd9c2", "#e23d5c"],
];

function roundPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

/** Colored stand-in. No photo, no employee record. */
export function makeCardTexture(index: number) {
  const width = 360;
  const height = Math.round(width / CARD_ASPECT);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas 2d unavailable");

  const [top, bottom] = PALETTE[index % PALETTE.length];
  ctx.clearRect(0, 0, width, height);
  roundPath(ctx, 1, 1, width - 2, height - 2, 28);
  ctx.save();
  ctx.clip();

  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, top);
  gradient.addColorStop(1, bottom);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  const faceW = width * 0.4;
  const faceH = height * 0.28;
  const faceX = (width - faceW) / 2;
  const faceY = height * 0.18;
  ctx.fillStyle = "rgba(255,255,255,0.38)";
  roundPath(ctx, faceX, faceY, faceW, faceH, 18);
  ctx.fill();

  const cx = width / 2;
  const cy = faceY + faceH * 0.42;
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.beginPath();
  ctx.arc(cx, cy, faceW * 0.16, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx, cy + faceW * 0.34, faceW * 0.24, Math.PI, 0);
  ctx.fill();

  ctx.fillStyle = "rgba(76,18,50,0.72)";
  ctx.font = "700 22px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("ẢNH", cx, faceY + faceH - 22);

  ctx.fillStyle = "white";
  ctx.font = "800 92px sans-serif";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(String(index + 1).padStart(2, "0"), cx, height * 0.68);
  ctx.font = "700 26px sans-serif";
  ctx.fillText("MẪU", cx, height * 0.68 + 40);

  ctx.restore();
  ctx.lineWidth = 8;
  ctx.strokeStyle = "rgba(255,255,255,0.85)";
  roundPath(ctx, 8, 8, width - 16, height - 16, 24);
  ctx.stroke();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}

export function layoutCard(index: number, count = CARD_COUNT, radius = TUBE_RADIUS) {
  const angle = (index / count) * Math.PI * 2;
  const x = Math.sin(angle) * radius;
  const z = Math.cos(angle) * radius;
  const position = new THREE.Vector3(x, 0, z);
  const outward = new THREE.Vector3(x, 0, z).normalize();
  const xAxis = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), outward);
  if (xAxis.lengthSq() < 1e-8) xAxis.set(1, 0, 0);
  xAxis.normalize();
  const yAxis = new THREE.Vector3().crossVectors(outward, xAxis).normalize();
  const quaternion = new THREE.Quaternion().setFromRotationMatrix(
    new THREE.Matrix4().makeBasis(xAxis, yAxis, outward),
  );
  return { position, quaternion };
}

export function placeholderPerson(index: number) {
  return {
    years: 3 + (index % 8),
    name: `Mẫu ${String(index + 1).padStart(2, "0")}`,
    department: index % 2 === 0 ? "Nhóm demo A" : "Nhóm demo B",
  };
}
