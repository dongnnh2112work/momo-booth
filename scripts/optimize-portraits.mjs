#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const sourceDir = path.join(root, "public/portraits");
const heroDir = path.join(sourceDir, "hero");
const thumbDir = path.join(sourceDir, "thumbs");

const inputs = fs
  .readdirSync(sourceDir)
  .filter((name) => /\.(jpe?g|png)$/i.test(name))
  .map((name) => path.join(sourceDir, name));

if (inputs.length === 0) {
  console.log("No source portraits found in public/portraits.");
  process.exit(0);
}

const sharp = (await import("sharp")).default;
fs.mkdirSync(heroDir, { recursive: true });
fs.mkdirSync(thumbDir, { recursive: true });

for (const file of inputs) {
  const base = path.parse(file).name;
  const hero = path.join(heroDir, `${base}.webp`);
  const thumb = path.join(thumbDir, `${base}.webp`);
  await sharp(file).rotate().resize({ width: 1080, height: 1080, fit: "inside", withoutEnlargement: true }).webp({ quality: 75 }).toFile(hero);
  await sharp(file).rotate().resize({ width: 320, height: 320, fit: "inside", withoutEnlargement: true }).webp({ quality: 70 }).toFile(thumb);
  console.log(`${path.basename(file)} -> hero/${base}.webp, thumbs/${base}.webp`);
}
console.log(`Optimized ${inputs.length} portraits.`);
