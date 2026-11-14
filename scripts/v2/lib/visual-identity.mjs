// Visual identity proof for cover slots (macOS `sips`, no extra dependencies).
// A receipt may claim "slot X shows asset Y" only when a difference hash of the
// saved slot image is close to the hash of the approved asset file.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";

export const DHASH_W = 16;
export const DHASH_H = 16;
export const DHASH_BITS = DHASH_W * DHASH_H;
// Calibrated 2026-10-26 on the 聆思 v5 covers: same artwork re-encoded by the
// platform stays far below this; a different ratio crop/video frame lands far above.
export const DEFAULT_MAX_DISTANCE = 40;

export function sha256File(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function parseBmp(buffer) {
  if (buffer.toString("ascii", 0, 2) !== "BM") throw new Error("sips did not produce a BMP");
  const offset = buffer.readUInt32LE(10);
  const width = buffer.readInt32LE(18);
  const rawHeight = buffer.readInt32LE(22);
  const bpp = buffer.readUInt16LE(28);
  if (![24, 32].includes(bpp)) throw new Error(`unsupported BMP depth ${bpp}`);
  const height = Math.abs(rawHeight);
  const bottomUp = rawHeight > 0;
  const bytes = bpp / 8;
  const stride = Math.ceil((width * bytes) / 4) * 4;
  const gray = [];
  for (let y = 0; y < height; y += 1) {
    const row = bottomUp ? height - 1 - y : y;
    const line = [];
    for (let x = 0; x < width; x += 1) {
      const at = offset + row * stride + x * bytes;
      const b = buffer[at], g = buffer[at + 1], r = buffer[at + 2];
      line.push(0.299 * r + 0.587 * g + 0.114 * b);
    }
    gray.push(line);
  }
  return { width, height, gray };
}

export function differenceHash(file, { sips = process.env.VIDEO_PUBLISHER_SIPS || "/usr/bin/sips" } = {}) {
  if (!fs.existsSync(file)) throw new Error(`image not found: ${file}`);
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "vp-dhash-"));
  const out = path.join(temp, "h.bmp");
  try {
    const run = spawnSync(sips, ["-s", "format", "bmp", "--resampleHeightWidth", String(DHASH_H), String(DHASH_W + 1), file, "--out", out], { encoding: "utf8" });
    if (run.status !== 0 || !fs.existsSync(out)) throw new Error(`sips failed: ${(run.stderr || run.stdout || "").trim().slice(0, 300)}`);
    const { width, height, gray } = parseBmp(fs.readFileSync(out));
    if (width !== DHASH_W + 1 || height !== DHASH_H) throw new Error(`unexpected resample ${width}x${height}`);
    let bits = "";
    for (let y = 0; y < DHASH_H; y += 1) for (let x = 0; x < DHASH_W; x += 1) bits += gray[y][x] < gray[y][x + 1] ? "1" : "0";
    let hex = "";
    for (let i = 0; i < bits.length; i += 4) hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
    return hex;
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
}

export function hammingDistance(a, b) {
  if (!a || !b || a.length !== b.length) return Infinity;
  let distance = 0;
  for (let i = 0; i < a.length; i += 1) {
    let x = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    while (x) { distance += x & 1; x >>= 1; }
  }
  return distance;
}

// Fail closed: any error, missing tool or unreadable image is "not proven".
export function compareImages(slotFile, assetFile, { maxDistance = DEFAULT_MAX_DISTANCE, hasher = differenceHash } = {}) {
  try {
    const slotHash = hasher(slotFile);
    const assetHash = hasher(assetFile);
    const distance = hammingDistance(slotHash, assetHash);
    return { ok: distance <= maxDistance, method: `dhash${DHASH_BITS}`, distance, maxDistance, slotHash, assetHash };
  } catch (error) {
    return { ok: false, method: `dhash${DHASH_BITS}`, error: String(error?.message || error), maxDistance };
  }
}
