#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { readPackage, coverAssetsForPlatform, validateCoverPackage } from '../lib/content-package.mjs';
import { buildIdentity } from './lib/identity.mjs';
import { acquireJobLock } from './lib/job-lock.mjs';
import { JobStore } from './lib/job-store.mjs';
import { evaluateDouyinAccountProof } from './lib/expected-account.mjs';
import { redactDeep } from './lib/signed-url.mjs';
import { assetForSlot, materializeSlotImage, proveSlotIdentity } from './lib/cover-identity.mjs';

// xiaohongshu/douyin: single-URL receipts after a human looked at the page.
// bilibili/wechat_channels: per-slot receipts, each backed by a machine visual
// identity proof (sips dHash vs the approved asset); no human confirmation.
const HUMAN_CONFIRMED = ['xiaohongshu', 'douyin'];
const VISUAL_PROOF = ['bilibili', 'wechat_channels'];
const SCREENSHOT_MAX_AGE_MS = 15 * 60 * 1000;

function parseArgs(argv) {
  const out = { platforms: [], confirmed: false, slotImages: {} };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--confirm-visible-assets') { out.confirmed = true; continue; }
    if (arg === '--slot-image') {
      // slot=/path/to/screenshot.png[@x,y,w,h]  (pixel crop of the slot preview)
      const value = argv[++i] || '';
      const match = value.match(/^([a-z]+)=(.+)$/);
      if (!match) throw new Error('--slot-image requires slot=/path[@x,y,w,h]');
      out.slotImages[match[1]] = match[2];
      continue;
    }
    if (['--platform', '--job-dir', '--package'].includes(arg)) {
      const value = argv[++i];
      if (!value || value.startsWith('--')) throw new Error(`${arg} requires a value`);
      if (arg === '--platform') out.platforms.push(value);
      if (arg === '--job-dir') out.jobDir = path.resolve(value);
      if (arg === '--package') out.packagePath = path.resolve(value);
      continue;
    }
    throw new Error(`Unknown option: ${arg}`);
  }
  if (!out.jobDir || !out.packagePath || !out.platforms.length) throw new Error('--job-dir, --package, and at least one --platform are required');
  for (const platform of out.platforms) if (![...HUMAN_CONFIRMED, ...VISUAL_PROOF].includes(platform)) throw new Error(`Unsupported recovery platform: ${platform}`);
  out.platforms = [...new Set(out.platforms)];
  if (out.platforms.some(platform => HUMAN_CONFIRMED.includes(platform)) && !out.confirmed) throw new Error('--confirm-visible-assets is required after visual confirmation (xiaohongshu/douyin)');
  if (Object.keys(out.slotImages).length && out.platforms.length !== 1) throw new Error('--slot-image is only allowed with exactly one --platform');
  return out;
}

function atomicWrite(file, value) {
  const temp = `${file}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(temp, JSON.stringify(value, null, 2) + '\n');
    fs.renameSync(temp, file);
  } finally { fs.rmSync(temp, { force: true }); }
}

function readExistingState(jobDir, fingerprint) {
  const statePath = path.join(jobDir, 'state.json');
  if (!fs.existsSync(statePath)) throw new Error('No existing publishing job state; recovery cannot create a new job');
  let state;
  try { state = JSON.parse(fs.readFileSync(statePath, 'utf8')); }
  catch { state = JSON.parse(fs.readFileSync(path.join(jobDir, 'state.backup.json'), 'utf8')); }
  if (!state || typeof state !== 'object' || Array.isArray(state) || !state.jobId) throw new Error('Invalid publishing job state');
  if (state.fingerprint !== fingerprint) throw new Error('Package fingerprint does not match the publishing job');
  return state;
}

function latestFreshEvidence(jobDir, platform, item, fingerprint) {
  const evidenceDir = path.join(jobDir, 'evidence');
  const names = fs.readdirSync(evidenceDir)
    .filter(name => name.endsWith(`-${platform}-inspect.json`) || name.endsWith(`-${platform}-verify.json`))
    .sort().reverse();
  if (!names.length) throw new Error(`No fresh ${platform} inspect evidence`);
  // Never fall back to older positive evidence after a newer page changed identity.
  const file = path.join(evidenceDir, names[0]);
  const payload = JSON.parse(fs.readFileSync(file, 'utf8'));
  const observation = payload.observation || payload;
  if (observation.platform !== platform || !['inspect', 'verify'].includes(observation.phase)) throw new Error(`${platform} evidence platform/phase mismatch`);
  if (Number(observation.taskSpaceId) !== Number(item.taskSpaceId) || observation.taskSpace !== item.taskSpaceName) throw new Error(`${platform} evidence task-space identity/name mismatch`);
  if ((payload.fingerprint && payload.fingerprint !== fingerprint) || (observation.fingerprint && observation.fingerprint !== fingerprint)) throw new Error(`${platform} evidence package fingerprint mismatch`);
  const age = Date.now() - Date.parse(observation.observedAt || '');
  if (!Number.isFinite(age) || age < 0 || age > 10 * 60 * 1000) throw new Error(`${platform} evidence is stale; run inspect-only again`);
  const gates = observation.gates || {};
  for (const gate of ['authenticated', 'draftIdentity', 'video', 'noBlockingDialog', ...(platform === 'douyin' ? ['targetAccount'] : [])]) {
    if (gates[gate]?.ok !== true) throw new Error(`${platform} fresh evidence does not confirm ${gate}`);
  }
  const safety = gates.safety;
  if (observation.finalPublishClicked !== false || safety?.ok !== true || safety.evidence?.guardArmed !== true || safety.evidence?.blockedAttempts !== 0 || safety.evidence?.finalPublishClicked !== false) throw new Error(`${platform} final-publish safety evidence is missing or invalid`);
  if (observation.blocker || gates.video.evidence?.uploading === true || gates.video.evidence?.failed === true || gates.draftIdentity.evidence?.foreign === true) throw new Error(`${platform} fresh page evidence is blocked or contradictory`);
  return { file, observation };
}

function slotSource(slot, platform, cover, item, slotImages) {
  if (slotImages[slot]) {
    const shot = materializeSlotImage(slotImages[slot]);
    const age = Date.now() - fs.statSync(shot.source || shot.file).mtimeMs;
    if (!(age >= 0 && age <= SCREENSHOT_MAX_AGE_MS)) { shot.cleanup(); throw new Error(`${platform} ${slot} slot screenshot is older than 15 minutes; capture it again`); }
    return { kind: 'screenshot', file: shot.file, cleanup: shot.cleanup, screenshot: { path: shot.source || shot.file, crop: shot.crop } };
  }
  const capture = cover.slotCaptures?.[slot];
  if (!capture?.ok || !capture.file || !fs.existsSync(capture.file)) throw new Error(`${platform} fresh evidence has no saved ${slot} slot image${capture?.reason ? ` (${capture.reason})` : ''}; run inspect-only again${platform === 'bilibili' && slot === 'wide' ? ' or pass --slot-image wide=<16:9 screenshot>[@x,y,w,h]' : ''}`);
  if (Number(capture.taskSpaceId) !== Number(item.taskSpaceId)) throw new Error(`${platform} ${slot} slot image came from another task space`);
  return { kind: 'slot_url', file: capture.file, cleanup() {}, capture };
}

function visualPlan(pkg, platform, item, evidence, slotImages) {
  const assets = coverAssetsForPlatform(pkg, platform);
  const cover = evidence.observation.gates.cover?.evidence || {};
  const slots = platform === 'wechat_channels'
    ? (cover.mode === 'unified_3x4' ? ['vertical'] : ['vertical', 'horizontal'])
    : (assets.some(asset => asset.slot === 'wide') ? ['landscape', 'wide'] : ['landscape']);
  const receipt = { slots: {}, recoveredFrom: evidence.file, proof: 'visual_identity' };
  const failures = [];
  for (const slot of slots) {
    const asset = assetForSlot(assets, platform, slot);
    if (!asset) throw new Error(`${platform} package has no asset for slot ${slot}`);
    const source = slotSource(slot, platform, cover, item, slotImages);
    try {
      const visual = proveSlotIdentity({ slotFile: source.file, assetPath: asset.path, otherAssetPaths: assets.map(other => other.path), source: source.kind });
      if (!visual.ok) failures.push({ slot, ...visual });
      const liveUrl = source.capture?.url || (cover.urlsBySlot?.[slot] || []).find(Boolean) || null;
      if (platform === 'wechat_channels' && !liveUrl) throw new Error(`wechat_channels ${slot} has no live slot URL to bind the receipt to`);
      if (platform === 'bilibili' && slot === 'landscape' && !liveUrl) throw new Error('bilibili landscape has no live cover URL to bind the receipt to');
      receipt.slots[slot] = {
        assetPath: asset.path,
        ratio: asset.ratio,
        afterUrl: liveUrl,
        afterUrlDigest: source.capture?.urlDigest || null,
        taskSpaceId: item.taskSpaceId,
        source: source.kind,
        ...(source.capture ? { capture: { file: source.capture.file, sha256: source.capture.sha256 } } : {}),
        ...(source.screenshot ? { screenshot: source.screenshot } : {}),
        visual,
      };
    } finally { source.cleanup(); }
  }
  if (failures.length) {
    const detail = failures.map(item => `${item.slot}: ${item.reason || 'mismatch'} (distance ${item.distance ?? 'n/a'}, nearest other ${item.nearestOtherDistance ?? 'n/a'})`).join('; ');
    throw new Error(`${platform} visual identity proof failed, no receipt written: ${detail}`);
  }
  return receipt;
}

function recoveryPlan(pkg, platform, item, evidence, slotImages = {}) {
  if (platform === 'douyin') {
    const account = evaluateDouyinAccountProof(pkg, evidence.observation.gates.targetAccount?.evidence, { id: item.taskSpaceId, name: item.taskSpaceName });
    if (!account.ok) throw new Error('Douyin receipt recovery requires fresh matching target-account evidence');
  }
  const errors = validateCoverPackage(pkg, platform);
  if (pkg.cover?.uploadCustomCover !== true) errors.push('receipt recovery requires enabled custom cover upload');
  if (errors.length) throw new Error(`${platform}: ${errors.join('; ')}`);
  const assets = coverAssetsForPlatform(pkg, platform);
  const cover = evidence.observation.gates.cover?.evidence || {};
  let receipt;
  if (VISUAL_PROOF.includes(platform)) {
    receipt = visualPlan(pkg, platform, item, evidence, slotImages);
  } else if (platform === 'xiaohongshu') {
    const asset = assets[0];
    const live = String(cover.background || '').match(/url\(["']?([^"')]+)/)?.[1];
    if (!live) throw new Error('Xiaohongshu fresh evidence has no live cover URL');
    receipt = { assetPath: asset.path, ratio: asset.ratio, beforeUrl: '', afterUrl: live, recoveredFrom: evidence.file };
  } else {
    const portrait = cover.urls?.portrait?.find(Boolean);
    const landscape = cover.urls?.landscape?.find(Boolean);
    if (!portrait || !landscape || portrait === landscape) throw new Error('Douyin fresh evidence needs distinct portrait and landscape cover URLs');
    const mapped = Object.fromEntries(assets.map(asset => [asset.slot, asset]));
    receipt = { slots: {
      portrait: { assetPath: mapped.portrait.path, ratio: mapped.portrait.ratio, beforeUrls: [], afterUrl: portrait },
      landscape: { assetPath: mapped.landscape.path, ratio: mapped.landscape.ratio, beforeUrls: [], afterUrl: landscape },
    }, recoveredFrom: evidence.file };
  }
  return { platform, item, evidence, receipt };
}

const args = parseArgs(process.argv.slice(2));
const releases = [];
try {
  // Same order and same lock paths as the owning publisher. No state is read or
  // written before both locks, and no second job can recover against a live owner.
  const lockInfo = { jobId: path.basename(args.jobDir), packagePath: args.packagePath };
  releases.push(acquireJobLock(path.join(path.dirname(args.jobDir), '.publisher'), { ...lockInfo, scope: 'publisher' }));
  releases.push(acquireJobLock(args.jobDir, lockInfo));
  const pkg = readPackage(args.packagePath);
  const identity = await buildIdentity(pkg);
  const snapshot = readExistingState(args.jobDir, identity.fingerprint);
  const plans = args.platforms.map(platform => {
    const item = snapshot.platforms?.[platform];
    if (!Number.isInteger(Number(item?.taskSpaceId)) || Number(item.taskSpaceId) < 1 || !String(item?.taskSpaceName || '').trim()) throw new Error(`${platform} has no recorded task-space id/name`);
    const evidence = latestFreshEvidence(args.jobDir, platform, item, identity.fingerprint);
    return recoveryPlan(pkg, platform, item, evidence, args.slotImages);
  });
  // Validate all requested platforms before changing even one receipt/checkpoint.
  const store = new JobStore(args.jobDir, snapshot);
  const state = await store.initialize();
  if (state.fingerprint !== identity.fingerprint) throw new Error('Package fingerprint changed during recovery');
  const writtenAt = new Date().toISOString();
  for (const { platform, evidence, receipt } of plans) {
    const item = state.platforms[platform];
    item.receipts = redactDeep({ ...(item.receipts || {}), cover: receipt });
    item.receiptTaskSpaceId = item.taskSpaceId;
    atomicWrite(store.receiptCheckpointPath(platform), { schemaVersion: 2, platform, fingerprint: state.fingerprint, taskSpaceId: item.taskSpaceId, receipts: item.receipts, writtenAt });
    item.verdict = null;
    item.status = 'needs_verification';
    (state.receiptRecoveries ||= []).push({ platform, taskSpaceId: item.taskSpaceId, taskSpaceName: item.taskSpaceName, evidencePath: evidence.file, recoveredAt: writtenAt, confirmedVisibleAssets: HUMAN_CONFIRMED.includes(platform), visualProof: VISUAL_PROOF.includes(platform) ? Object.fromEntries(Object.entries(receipt.slots).map(([slot, value]) => [slot, { distance: value.visual.distance, margin: value.visual.margin, source: value.source }])) : null });
  }
  state.status = 'needs_verification';
  await store.save();
  await store.close();
  console.log(JSON.stringify({ jobId: state.jobId, fingerprint: state.fingerprint, recovered: args.platforms, ready: false, next: 'same-job fresh verification required' }, null, 2));
} finally {
  for (const release of releases.reverse()) release();
}
