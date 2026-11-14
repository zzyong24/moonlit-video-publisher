// 2026-10-26 patch: B站/视频号 dual-slot receipts with a machine visual identity
// proof, signed-URL redaction, per-platform login pause and timing ledger.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { readPackage } from '../../lib/content-package.mjs';
import { defaultConfig } from '../../lib/config.mjs';
import { buildIdentity } from '../lib/identity.mjs';
import { redactUrl, redactDeep, receiptUrlMatches, urlDigest } from '../lib/signed-url.mjs';
import { compareImages } from '../lib/visual-identity.mjs';
import { proveSlotIdentity } from '../lib/cover-identity.mjs';

const V2 = fileURLToPath(new URL('..', import.meta.url));
process.env.VIDEO_PUBLISHER_ACCOUNTS = fileURLToPath(new URL('../../tests/fixtures/accounts.fixture.json', import.meta.url));
const HAS_SIPS = fs.existsSync('/usr/bin/sips');
const SIGNED = 'https://finder.video.qq.com/251/20304/stodownload?encfilekey=SECRETKEY&token=SECRETTOKEN&sign=abc';

// Minimal 24-bit BMP writer so the fixtures need no image dependencies.
function bmp(width, height, pixel) {
  const stride = Math.ceil((width * 3) / 4) * 4, size = 54 + stride * height, b = Buffer.alloc(size);
  b.write('BM', 0, 'ascii'); b.writeUInt32LE(size, 2); b.writeUInt32LE(54, 10); b.writeUInt32LE(40, 14);
  b.writeInt32LE(width, 18); b.writeInt32LE(height, 22); b.writeUInt16LE(1, 26); b.writeUInt16LE(24, 28); b.writeUInt32LE(stride * height, 34);
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const [r, g, bl] = pixel(x / width, 1 - y / height); const at = 54 + y * stride + x * 3;
    b[at] = bl; b[at + 1] = g; b[at + 2] = r;
  }
  return b;
}
const artA = (x, y) => { const v = Math.round(255 * ((Math.sin(x * 9) + Math.cos(y * 7) + 2) / 4)); return [v, v, 255 - v]; };
const artB = (x, y) => { const v = Math.round(255 * ((Math.cos(x * 5 + y * 11) + 1) / 2)); return [255 - v, v, v]; };
const artC = (x, y) => { const v = Math.round(255 * ((Math.sin((x - y) * 13) + 1) / 2)); return [v, 255 - v, v]; };
const noisy = art => (x, y) => art(x, y).map((v, i) => Math.max(0, Math.min(255, v + (((x * 997 + y * 131 + i) % 7) - 3))));

function images(root) {
  // Package preflight reads PNG/JPEG dimensions, so convert the BMP to PNG.
  const file = (name, w, h, art) => { const raw = path.join(root, name); fs.writeFileSync(raw, bmp(w, h, art)); const out = raw.replace(/\.bmp$/, '.png'); spawnSync('/usr/bin/sips', ['-s', 'format', 'png', raw, '--out', out]); return fs.existsSync(out) ? out : raw; };
  return {
    portrait: file('cover 3x4.bmp', 120, 160, artA),
    landscape: file('cover 4x3.bmp', 160, 120, artB),
    wide: file('cover 16x9.bmp', 192, 108, artC),
    portraitCdn: file('cdn-portrait.bmp', 90, 120, noisy(artA)),
    landscapeCdn: file('cdn-landscape.bmp', 120, 90, noisy(artB)),
    wideShot: file('screen.bmp', 400, 300, (x, y) => (x > 0.25 && x < 0.73 && y > 0.3 && y < 0.57) ? noisy(artC)((x - 0.25) / 0.48, (y - 0.3) / 0.27) : [128, 128, 128]),
  };
}

test('signed URLs are redacted to origin+path and still match by digest', () => {
  const redacted = redactUrl(SIGNED);
  assert.ok(!/SECRET|token=|sign=/.test(redacted), redacted);
  assert.ok(redacted.startsWith('https://finder.video.qq.com/251/20304/stodownload?<redacted sha256:'));
  assert.equal(receiptUrlMatches(redacted, [SIGNED]), true);
  assert.equal(receiptUrlMatches(urlDigest(SIGNED), [SIGNED]), true);
  assert.equal(receiptUrlMatches(redacted, [SIGNED.replace('abc', 'xyz')]), false);
  assert.equal(receiptUrlMatches(SIGNED, [SIGNED]), true, 'legacy raw receipts still match');
  assert.equal(redactUrl('https://archive.biliimg.com/bfs/archive/x.jpg'), 'https://archive.biliimg.com/bfs/archive/x.jpg');
  const deep = JSON.stringify(redactDeep({ a: [SIGNED], b: { bg: `url("${SIGNED}")` }, n: 3 }));
  assert.ok(!/SECRET/.test(deep), deep);
  assert.equal(JSON.stringify(redactDeep(redactDeep({ u: SIGNED }))), JSON.stringify(redactDeep({ u: SIGNED })), 'redaction is idempotent');
});

test('visual identity proof accepts re-encodes and fails closed on the wrong asset', { skip: !HAS_SIPS && 'macOS sips not available' }, () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vp visual '));
  try {
    const img = images(root);
    const same = compareImages(img.portraitCdn, img.portrait);
    assert.equal(same.ok, true, JSON.stringify(same));
    const wrong = proveSlotIdentity({ slotFile: img.portraitCdn, assetPath: img.landscape, otherAssetPaths: [img.portrait, img.landscape, img.wide] });
    assert.equal(wrong.ok, false, JSON.stringify(wrong));
    const right = proveSlotIdentity({ slotFile: img.landscapeCdn, assetPath: img.landscape, otherAssetPaths: [img.portrait, img.landscape, img.wide] });
    assert.equal(right.ok, true, JSON.stringify(right));
    assert.ok(right.margin >= 16);
    const missing = proveSlotIdentity({ slotFile: path.join(root, 'nope.png'), assetPath: img.landscape });
    assert.equal(missing.ok, false);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

async function recoveryFixture(platform, { captures = {}, unified = false } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vp dual recovery '));
  const img = images(root);
  const jobDir = path.join(root, 'job'), evidenceDir = path.join(jobDir, 'evidence');
  fs.mkdirSync(evidenceDir, { recursive: true }); fs.mkdirSync(path.join(jobDir, 'checkpoints'));
  const videoPath = path.join(root, 'video.mov'); fs.writeFileSync(videoPath, 'video');
  const platformAssets = platform === 'wechat_channels'
    ? { wechat_channels: [{ slot: 'portrait', ratio: '3:4', path: img.portrait }, { slot: 'landscape', ratio: '4:3', path: img.landscape }] }
    : { bilibili: [{ slot: 'landscape', ratio: '4:3', path: img.landscape }, { slot: 'wide', ratio: '16:9', path: img.wide }] };
  const packagePath = path.join(root, 'package.json'), configPath = path.join(root, 'config.json');
  fs.writeFileSync(packagePath, JSON.stringify({ title: 'Dual fixture', videoPath, cover: { uploadCustomCover: true, platformAssets }, bilibiliTags: ['a'], bilibiliDescription: 'd', wechatDescription: 'w' }));
  fs.writeFileSync(configPath, JSON.stringify(defaultConfig()));
  const identity = await buildIdentity(readPackage(packagePath, { config: defaultConfig() }));
  const state = { jobId: 'job', fingerprint: identity.fingerprint, status: 'blocked', platforms: { [platform]: { taskSpaceId: 7, taskSpaceName: `space ${platform}`, receipts: {}, verdict: { ready: false } } } };
  fs.writeFileSync(path.join(jobDir, 'state.json'), JSON.stringify(state));
  const capture = (slot, file) => ({ ok: true, slot, file, sha256: 'x', urlDigest: urlDigest(`${SIGNED}&slot=${slot}`), url: redactUrl(`${SIGNED}&slot=${slot}`), taskSpaceId: 7 });
  const slotCaptures = Object.fromEntries(Object.entries(captures).map(([slot, file]) => [slot, capture(slot, img[file])]));
  const urlsBySlot = Object.fromEntries(Object.keys(captures).map(slot => [slot, [redactUrl(`${SIGNED}&slot=${slot}`)]]));
  const observation = {
    platform, phase: 'inspect', taskSpaceId: 7, taskSpace: `space ${platform}`, observedAt: new Date().toISOString(), finalPublishClicked: false,
    gates: { authenticated: { ok: true }, draftIdentity: { ok: true }, video: { ok: true, evidence: {} }, noBlockingDialog: { ok: true },
      safety: { ok: true, evidence: { guardArmed: true, blockedAttempts: 0, finalPublishClicked: false } },
      cover: { ok: false, evidence: { mode: unified ? 'unified_3x4' : 'dual_slot', urlsBySlot, urls: Object.values(urlsBySlot).flat(), slotCaptures } } },
  };
  fs.writeFileSync(path.join(evidenceDir, `001-${platform}-inspect.json`), JSON.stringify({ observation }));
  return {
    root, img, jobDir,
    run(extra = []) { return spawnSync(process.execPath, [path.join(V2, 'recover-cover-receipts.mjs'), '--job-dir', jobDir, '--package', packagePath, '--platform', platform, ...extra], { encoding: 'utf8', env: { ...process.env, VIDEO_PUBLISHER_CONFIG: configPath } }); },
    checkpoint() { const file = path.join(jobDir, 'checkpoints', `${platform}.receipts.json`); return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null; },
    state() { return JSON.parse(fs.readFileSync(path.join(jobDir, 'state.json'), 'utf8')); },
    cleanup() { fs.rmSync(root, { recursive: true, force: true }); },
  };
}

test('视频号 dual-slot recovery writes per-slot visual receipts without human confirmation', { skip: !HAS_SIPS && 'macOS sips not available' }, async () => {
  const f = await recoveryFixture('wechat_channels', { captures: { vertical: 'portraitCdn', horizontal: 'landscapeCdn' } });
  try {
    const result = f.run(); assert.equal(result.status, 0, result.stderr);
    const receipt = f.checkpoint().receipts.cover;
    assert.equal(receipt.slots.vertical.assetPath, f.img.portrait); assert.equal(receipt.slots.vertical.ratio, '3:4');
    assert.equal(receipt.slots.horizontal.assetPath, f.img.landscape); assert.equal(receipt.slots.horizontal.ratio, '4:3');
    assert.equal(receipt.slots.vertical.visual.ok, true); assert.equal(receipt.slots.horizontal.visual.ok, true);
    assert.equal(receiptUrlMatches(receipt.slots.horizontal.afterUrl, [`${SIGNED}&slot=horizontal`]), true);
    const raw = fs.readFileSync(path.join(f.jobDir, 'state.json'), 'utf8') + JSON.stringify(f.checkpoint());
    assert.ok(!/SECRET|token=/.test(raw), 'no signed query parameter on disk');
    assert.equal(f.state().platforms.wechat_channels.status, 'needs_verification');
  } finally { f.cleanup(); }
});

test('视频号 recovery refuses when the 4:3 share card shows the 3:4 artwork', { skip: !HAS_SIPS && 'macOS sips not available' }, async () => {
  const f = await recoveryFixture('wechat_channels', { captures: { vertical: 'portraitCdn', horizontal: 'portraitCdn' } });
  try {
    const result = f.run(); assert.notEqual(result.status, 0);
    assert.match(result.stderr, /visual identity proof failed/);
    assert.equal(f.checkpoint(), null, 'no receipt written on mismatch');
    assert.equal(f.state().status, 'blocked');
  } finally { f.cleanup(); }
});

test('B站 recovery needs the 16:9 slot image and proves both slots', { skip: !HAS_SIPS && 'macOS sips not available' }, async () => {
  const f = await recoveryFixture('bilibili', { captures: { landscape: 'landscapeCdn' } });
  try {
    const missing = f.run(); assert.notEqual(missing.status, 0); assert.match(missing.stderr, /wide/);
    const wrongCrop = f.run(['--slot-image', `wide=${f.img.wideShot}@0,0,100,300`]);
    assert.notEqual(wrongCrop.status, 0); assert.equal(f.checkpoint(), null);
    const ok = f.run(['--slot-image', `wide=${f.img.wideShot}@100,90,192,81`]);
    assert.equal(ok.status, 0, ok.stderr);
    const receipt = f.checkpoint().receipts.cover;
    assert.equal(receipt.slots.landscape.visual.ok, true); assert.equal(receipt.slots.wide.visual.ok, true);
    assert.equal(receipt.slots.wide.source, 'screenshot'); assert.equal(receipt.slots.wide.taskSpaceId, 7);
    assert.equal(receipt.slots.wide.ratio, '16:9');
  } finally { f.cleanup(); }
});

test('unsupported platforms and the xhs/douyin human confirmation are still enforced', async () => {
  const f = await recoveryFixture('bilibili', { captures: { landscape: 'landscapeCdn' } });
  try {
    const r = spawnSync(process.execPath, [path.join(V2, 'recover-cover-receipts.mjs'), '--job-dir', f.jobDir, '--package', 'x.json', '--platform', 'douyin'], { encoding: 'utf8' });
    assert.notEqual(r.status, 0); assert.match(r.stderr, /--confirm-visible-assets is required/);
  } finally { f.cleanup(); }
});

function publisherFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vp-partial-pause-'));
  const videoPath = path.join(root, 'v.mp4'); fs.writeFileSync(videoPath, 'video');
  const configPath = path.join(root, 'config.json'), packagePath = path.join(root, 'package.json');
  fs.writeFileSync(configPath, JSON.stringify({ schemaVersion: 1, onboarding: { completed: true }, sourceDirectory: root, defaultPlatforms: ['xiaohongshu', 'douyin', 'bilibili', 'wechat_channels'] }));
  fs.writeFileSync(packagePath, JSON.stringify({ videoPath, title: 'Partial', expectedAccounts: { douyin: { name: 'Fixture Creator', douyinId: 'fixture_creator_id' } }, douyinTopics: ['A', 'B'], bilibiliDescription: 'd', bilibiliTags: ['A', 'B'], xhsTopics: ['A', 'B'], wechatDescription: 'w\n\n#A #B', wechatTags: ['A', 'B'], contentTypeDeclaration: '无需标注', cover: { uploadCustomCover: false, useVideoFrame: true, approvalEvidence: 'fixture' } }));
  return { root, configPath, packagePath };
}

function runPublisher(f, extraEnv = {}, extraArgs = []) {
  return spawnSync(process.execPath, [path.join(V2, 'publisher.mjs'), f.packagePath, 'test', '--confirm-original-rights', '--state-root', f.root, ...extraArgs], { encoding: 'utf8', env: { ...process.env, VIDEO_PUBLISHER_CONFIG: f.configPath, VIDEO_PUBLISHER_V2_RUNNER: path.join(V2, 'tests', 'mock-runner.mjs'), ...extraEnv } });
}

test('one platform needing login no longer pauses the other three; timings are recorded', () => {
  const f = publisherFixture();
  try {
    const result = runPublisher(f, { VIDEO_PUBLISHER_V2_MOCK_AUTH_REQUIRED: 'wechat_channels:inspect' }, ['--auth-poll-seconds', '0']);
    const summary = JSON.parse(result.stdout);
    assert.equal(summary.status, 'paused_user');
    assert.equal(summary.platforms.wechat_channels.status, 'blocked_user');
    for (const platform of ['xiaohongshu', 'douyin', 'bilibili']) assert.equal(summary.platforms[platform].ready, true, platform);
    assert.ok(summary.timings.phases.upload.durationMs >= 0);
    assert.ok(summary.timings.slowest.durationMs >= 0);
    const state = JSON.parse(fs.readFileSync(summary.statePath, 'utf8'));
    assert.ok(state.timings.at(-1).calls.some(call => call.platform === 'bilibili' && call.phase === 'upload'));
  } finally { fs.rmSync(f.root, { recursive: true, force: true }); }
});

test('legacy --pause-all-on-user-block keeps the old stop-everything behaviour', () => {
  const f = publisherFixture();
  try {
    const result = runPublisher(f, { VIDEO_PUBLISHER_V2_MOCK_AUTH_REQUIRED: 'wechat_channels:inspect' }, ['--pause-all-on-user-block']);
    const summary = JSON.parse(result.stdout);
    assert.equal(summary.status, 'paused_user');
    assert.equal(summary.platforms.xiaohongshu.ready, false);
  } finally { fs.rmSync(f.root, { recursive: true, force: true }); }
});

test('a platform logged in during the others\' uploads joins the same run', () => {
  const f = publisherFixture();
  try {
    const once = path.join(f.root, 'login-once');
    const result = runPublisher(f, { VIDEO_PUBLISHER_V2_MOCK_AUTH_REQUIRED: 'wechat_channels:inspect', VIDEO_PUBLISHER_V2_MOCK_AUTH_ONCE_FILE: once, VIDEO_PUBLISHER_V2_MOCK_UPLOAD_MS_douyin: '2500' }, ['--auth-poll-seconds', '1']);
    const summary = JSON.parse(result.stdout);
    assert.equal(summary.ready, true, result.stderr);
    assert.match(result.stderr, /wechat_channels login detected; joining upload phase/);
  } finally { fs.rmSync(f.root, { recursive: true, force: true }); }
});

// run-platform.mjs resolves visual.pending from an automatic 视频号 upload with
// sips, redacts signed URLs in the emitted line, and the assembled Ego script
// (header + adapters) still parses. The fake Ego never touches a browser.
async function runPlatformWithFakeEgo(captureName) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vp-runplatform-visual-'));
  const img = images(root);
  const videoPath = path.join(root, 'v.mp4'); fs.writeFileSync(videoPath, 'video');
  const packagePath = path.join(root, 'package.json'), configPath = path.join(root, 'config.json');
  fs.writeFileSync(packagePath, JSON.stringify({ videoPath, title: 'Visual', wechatDescription: 'w\n\n#A #B', wechatTags: ['A', 'B'], contentTypeDeclaration: '无需标注', cover: { uploadCustomCover: true, platformAssets: { wechat_channels: [{ slot: 'portrait', ratio: '3:4', path: img.portrait }, { slot: 'landscape', ratio: '4:3', path: img.landscape }] } } }));
  fs.writeFileSync(configPath, JSON.stringify({ schemaVersion: 1, onboarding: { completed: true }, sourceDirectory: root, defaultPlatforms: ['wechat_channels'], declarations: { originalityPolicy: 'all_videos_original' } }));
  const scriptCopy = path.join(root, 'assembled.mjs');
  const result = {
    schemaVersion: 1, platform: 'wechat_channels', phase: 'inspect', taskSpaceId: 9, taskSpace: 'fake', observedAt: new Date().toISOString(), finalPublishClicked: false,
    gates: { cover: { ok: false, evidence: { urlsMatched: true, urlsBySlot: { horizontal: [SIGNED] }, slotChecks: { horizontal: { asset: true, urlMatched: true, visual: false } } } }, safety: { ok: true, evidence: { guardArmed: true, blockedAttempts: 0, finalPublishClicked: false } } },
    receipts: { cover: { slots: { horizontal: { assetPath: img.landscape, ratio: '4:3', afterUrl: SIGNED, capture: { ok: true, file: img[captureName] }, visual: { pending: true } } } } },
  };
  const fake = path.join(root, 'fake-ego');
  const resultFile = path.join(root, 'result.txt');
  fs.writeFileSync(resultFile, 'VIDEO_PUBLISHER_V2_RESULT:' + JSON.stringify(result) + '\n');
  fs.writeFileSync(fake, `#!/bin/sh\ncat > "${scriptCopy}"\ncat "${resultFile}"\n`);
  fs.chmodSync(fake, 0o755);
  const run = spawnSync(process.execPath, [path.join(V2, 'run-platform.mjs'), 'wechat_channels', packagePath, 'inspect', 'visual', '9'], { encoding: 'utf8', env: { ...process.env, VIDEO_PUBLISHER_CONFIG: configPath, VIDEO_PUBLISHER_V2_PLATFORM_LOCK_ROOT: path.join(root, 'locks'), VIDEO_PUBLISHER_V2_EGO_COMMAND: fake } });
  return { root, run, scriptCopy, cleanup() { fs.rmSync(root, { recursive: true, force: true }); } };
}

test('run-platform proves a pending 视频号 slot, redacts the signed URL, and assembles valid Ego code', { skip: !HAS_SIPS && 'macOS sips not available' }, async () => {
  const f = await runPlatformWithFakeEgo('landscapeCdn');
  try {
    assert.equal(f.run.status, 0, f.run.stderr);
    assert.ok(!/SECRET|token=/.test(f.run.stdout), 'signed query never printed');
    const line = f.run.stdout.split('\n').find(text => text.startsWith('VIDEO_PUBLISHER_V2_RESULT:'));
    const observation = JSON.parse(line.slice('VIDEO_PUBLISHER_V2_RESULT:'.length));
    assert.equal(observation.receipts.cover.slots.horizontal.visual.ok, true);
    assert.equal(observation.gates.cover.ok, true);
    assert.equal(receiptUrlMatches(observation.receipts.cover.slots.horizontal.afterUrl, [SIGNED]), true);
    const check = spawnSync(process.execPath, ['--check', f.scriptCopy], { encoding: 'utf8' });
    assert.equal(check.status, 0, check.stderr);
  } finally { f.cleanup(); }
});

test('run-platform fails the cover gate closed when the uploaded slot shows another asset', { skip: !HAS_SIPS && 'macOS sips not available' }, async () => {
  const f = await runPlatformWithFakeEgo('portraitCdn');
  try {
    const line = f.run.stdout.split('\n').find(text => text.startsWith('VIDEO_PUBLISHER_V2_RESULT:'));
    const observation = JSON.parse(line.slice('VIDEO_PUBLISHER_V2_RESULT:'.length));
    assert.equal(observation.receipts.cover.slots.horizontal.visual.ok, false);
    assert.equal(observation.gates.cover.ok, false);
    assert.equal(observation.blocker.code, 'PLATFORM_REJECTED_ASSET');
  } finally { f.cleanup(); }
});
