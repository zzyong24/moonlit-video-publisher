// Per-slot cover identity proof shared by run-platform.mjs (automatic uploads)
// and recover-cover-receipts.mjs (after a manual dual-slot completion).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { differenceHash, hammingDistance, sha256File, DHASH_BITS } from "./visual-identity.mjs";

// Calibrated on 2026-10-26 (聆思 v5): platform CDN re-encodes of the right
// asset scored 3-7/256, a hand-cropped B站 16:9 dialog screenshot 36/256; the
// nearest wrong-ratio asset was never closer than 69/256.
export const THRESHOLDS = { slot_url: 40, screenshot: 48 };
export const MIN_MARGIN = 16;

export const SLOT_ASSETS = {
  wechat_channels: { vertical: { packageSlot: "portrait", ratio: "3:4" }, horizontal: { packageSlot: "landscape", ratio: "4:3" } },
  bilibili: { landscape: { packageSlot: "landscape", ratio: "4:3" }, wide: { packageSlot: "wide", ratio: "16:9" } },
  douyin: { portrait: { packageSlot: "portrait", ratio: "3:4" }, landscape: { packageSlot: "landscape", ratio: "4:3" } },
};

export function assetForSlot(assets, platform, slot) {
  const spec = SLOT_ASSETS[platform]?.[slot];
  if (!spec) return null;
  return (assets || []).find(asset => asset.slot === spec.packageSlot && asset.ratio === spec.ratio) || null;
}

// Fail closed. ok only when the slot image is near the expected asset AND
// clearly nearer to it than to every other approved asset of the platform.
export function proveSlotIdentity({ slotFile, assetPath, otherAssetPaths = [], source = "slot_url", hasher = differenceHash } = {}) {
  const maxDistance = THRESHOLDS[source] ?? THRESHOLDS.slot_url;
  const base = { method: `dhash${DHASH_BITS}`, source, maxDistance, minMargin: MIN_MARGIN, checkedAt: new Date().toISOString() };
  try {
    if (!slotFile || !fs.existsSync(slotFile)) throw new Error("slot image missing");
    if (!assetPath || !fs.existsSync(assetPath)) throw new Error("asset missing");
    const slotHash = hasher(slotFile);
    const distance = hammingDistance(slotHash, hasher(assetPath));
    const others = [...new Set(otherAssetPaths.filter(other => other && other !== assetPath && fs.existsSync(other)))]
      .map(other => ({ path: other, distance: hammingDistance(slotHash, hasher(other)) }));
    const nearestOther = others.length ? Math.min(...others.map(item => item.distance)) : null;
    const margin = nearestOther === null ? null : nearestOther - distance;
    const ok = distance <= maxDistance && (margin === null || margin >= MIN_MARGIN);
    return { ...base, ok, distance, nearestOtherDistance: nearestOther, margin, slotSha256: sha256File(slotFile), assetSha256: sha256File(assetPath), reason: ok ? null : distance > maxDistance ? "slot image does not match asset" : "slot image is ambiguous between approved assets" };
  } catch (error) {
    return { ...base, ok: false, reason: String(error?.message || error) };
  }
}

// "file.png@x,y,w,h" -> cropped temp copy via sips (pixel coordinates).
export function materializeSlotImage(spec, { sips = process.env.VIDEO_PUBLISHER_SIPS || "/usr/bin/sips" } = {}) {
  const match = String(spec || "").match(/^(.*?)(?:@(\d+),(\d+),(\d+),(\d+))?$/);
  const file = path.resolve(match[1]);
  if (!fs.existsSync(file)) throw new Error(`slot image not found: ${file}`);
  if (!match[2]) return { file, crop: null, cleanup() {} };
  const [x, y, w, h] = match.slice(2, 6).map(Number);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vp-slot-"));
  const out = path.join(dir, "crop.png");
  const run = spawnSync(sips, ["-c", String(h), String(w), "--cropOffset", String(y), String(x), file, "--out", out], { encoding: "utf8" });
  if (run.status !== 0 || !fs.existsSync(out)) throw new Error(`sips crop failed: ${(run.stderr || "").trim().slice(0, 200)}`);
  return { file: out, source: file, crop: { x, y, w, h }, cleanup() { fs.rmSync(dir, { recursive: true, force: true }); } };
}
