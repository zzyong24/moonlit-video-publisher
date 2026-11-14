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
import { acquireJobLock } from '../lib/job-lock.mjs';

const RUNNER = fileURLToPath(new URL('../recover-cover-receipts.mjs', import.meta.url));
function png(width, height, label) {
  const bytes = Buffer.alloc(24); bytes[0] = 0x89; bytes.write('PNG', 1, 'ascii'); bytes.writeUInt32BE(width, 16); bytes.writeUInt32BE(height, 20);
  return Buffer.concat([bytes, Buffer.from(label)]);
}
async function fixture({ explicit = false, xhsRatio = '3:4', empty = false, douyinEmpty = false } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cover recovery with spaces '));
  const jobDir = path.join(root, 'fixture'), evidenceDir = path.join(jobDir, 'evidence');
  fs.mkdirSync(evidenceDir, { recursive: true });
  fs.mkdirSync(path.join(jobDir, 'checkpoints'));
  const videoPath = path.join(root, 'video.mov'), portraitPath = path.join(root, 'legacy portrait.png'), landscapePath = path.join(root, 'legacy landscape.png');
  const mappedPortraitPath = path.join(root, 'mapped portrait.png'), mappedLandscapePath = path.join(root, 'mapped landscape.png');
  fs.writeFileSync(videoPath, 'video');
  fs.writeFileSync(portraitPath, png(1080, 1440, 'legacy portrait'));
  fs.writeFileSync(landscapePath, png(1440, 1080, 'legacy landscape'));
  fs.writeFileSync(mappedPortraitPath, png(1080, 1440, 'explicit portrait'));
  fs.writeFileSync(mappedLandscapePath, png(1440, 1080, 'explicit landscape'));
  const cover = { uploadCustomCover: true, vertical3x4Path: portraitPath, horizontal4x3Path: landscapePath };
  if (explicit) cover.platformAssets = {
    xiaohongshu: empty ? [] : [{ slot: xhsRatio === '3:4' ? 'portrait' : 'landscape', ratio: xhsRatio, path: xhsRatio === '3:4' ? mappedPortraitPath : mappedLandscapePath }],
    douyin: douyinEmpty ? [] : [{ slot: 'landscape', ratio: '4:3', path: mappedLandscapePath }, { slot: 'portrait', ratio: '3:4', path: mappedPortraitPath }],
  };
  const packagePath = path.join(root, 'package.json'), configPath = path.join(root, 'config.json');
  fs.writeFileSync(packagePath, JSON.stringify({ title: 'Recovery fixture', videoPath, cover, expectedAccounts: { douyin: { name: 'Fixture Creator', douyinId: 'fixture_creator_id' } }, xhsTopics: ['fixture'], douyinTopics: ['fixture'] }));
  fs.writeFileSync(configPath, JSON.stringify(defaultConfig()));
  const identity = await buildIdentity(readPackage(packagePath, { config: defaultConfig() }));
  const statePath = path.join(jobDir, 'state.json');
  const state = { jobId: 'fixture', fingerprint: identity.fingerprint, status: 'blocked', platforms: {
    xiaohongshu: { taskSpaceId: 3, taskSpaceName: 'exact xhs fixture space', receipts: {}, verdict: { ready: false } },
    douyin: { taskSpaceId: 4, taskSpaceName: 'exact douyin fixture space', receipts: {}, verdict: { ready: false } },
  } };
  fs.writeFileSync(statePath, JSON.stringify(state));
  function evidence(platform, changes = {}, filename = `001-${platform}-inspect.json`) {
    const item = state.platforms[platform];
    const observation = {
      platform, phase: 'inspect', taskSpaceId: item.taskSpaceId, taskSpace: item.taskSpaceName, observedAt: new Date().toISOString(), finalPublishClicked: false,
      gates: {
        ...(platform === 'douyin' ? { targetAccount: { ok: true, evidence: { expected: { name: 'Fixture Creator', douyinId: 'fixture_creator_id' }, actual: { name: 'Fixture Creator', douyinId: 'fixture_creator_id' }, observedAt: new Date().toISOString(), sourceUrl: 'https://creator.douyin.com/creator-micro/home', method: 'creator-home-dom', scopeConfirmed: true, taskSpaceId: item.taskSpaceId, taskSpaceName: item.taskSpaceName } } } : {}),
        authenticated: { ok: true }, draftIdentity: { ok: true }, video: { ok: true, evidence: { stable: true } }, noBlockingDialog: { ok: true },
        safety: { ok: true, evidence: { guardArmed: true, blockedAttempts: 0, finalPublishClicked: false } },
        cover: { ok: false, evidence: platform === 'xiaohongshu' ? { background: 'url("https://xhs.example/cover.jpg")' } : { urls: { portrait: ['https://dy.example/p.jpg'], landscape: ['https://dy.example/l.jpg'] } } },
      }, ...changes,
    };
    fs.writeFileSync(path.join(evidenceDir, filename), JSON.stringify({ observation }));
    return observation;
  }
  evidence('xiaohongshu'); evidence('douyin');
  return { root, jobDir, evidenceDir, state, statePath, identity, packagePath, configPath, portraitPath, landscapePath, mappedPortraitPath, mappedLandscapePath, evidence,
    run(platforms = ['xiaohongshu', 'douyin'], extra = []) {
      return spawnSync(process.execPath, [RUNNER, '--job-dir', jobDir, '--package', packagePath, ...platforms.flatMap(platform => ['--platform', platform]), '--confirm-visible-assets', ...extra], { encoding: 'utf8', env: { ...process.env, VIDEO_PUBLISHER_CONFIG: configPath, VIDEO_PUBLISHER_V2_EGO_COMMAND: 'must-not-run-browser' } });
    },
    checkpoint(platform) { return JSON.parse(fs.readFileSync(path.join(jobDir, 'checkpoints', `${platform}.receipts.json`), 'utf8')); },
    cleanup() { fs.rmSync(root, { recursive: true, force: true }); },
  };
}

test('legacy recovery binds fresh evidence, preserves atomic backup, and requires fresh verification', async () => {
  const f = await fixture();
  try {
    const result = f.run(); assert.equal(result.status, 0, result.stderr);
    const xhs = f.checkpoint('xiaohongshu'), dy = f.checkpoint('douyin');
    assert.equal(xhs.fingerprint, f.identity.fingerprint); assert.equal(xhs.taskSpaceId, 3);
    assert.equal(xhs.receipts.cover.assetPath, f.landscapePath); assert.equal(xhs.receipts.cover.ratio, '4:3');
    assert.equal(dy.receipts.cover.slots.portrait.assetPath, f.portraitPath);
    assert.equal(dy.receipts.cover.slots.landscape.assetPath, f.landscapePath);
    const state = JSON.parse(fs.readFileSync(f.statePath));
    assert.equal(state.status, 'needs_verification'); assert.equal(state.platforms.xiaohongshu.verdict, null);
    assert.equal(JSON.parse(result.stdout).ready, false);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(f.jobDir, 'state.backup.json'))).platforms.xiaohongshu.receipts, {});
    assert.equal(fs.existsSync(path.join(f.root, '.publisher', 'orchestrator.lock')), false);
    assert.equal(fs.existsSync(path.join(f.jobDir, 'orchestrator.lock')), false);
  } finally { f.cleanup(); }
});

for (const ratio of ['3:4', '4:3']) {
  test(`explicit ${ratio} XHS and both Douyin slots override unrelated legacy artwork`, async () => {
    const f = await fixture({ explicit: true, xhsRatio: ratio });
    try {
      const result = f.run(); assert.equal(result.status, 0, result.stderr);
      assert.equal(f.checkpoint('xiaohongshu').receipts.cover.ratio, ratio);
      assert.equal(f.checkpoint('xiaohongshu').receipts.cover.assetPath, ratio === '3:4' ? f.mappedPortraitPath : f.mappedLandscapePath);
      const dy = f.checkpoint('douyin').receipts.cover.slots;
      assert.equal(dy.portrait.assetPath, f.mappedPortraitPath); assert.equal(dy.landscape.assetPath, f.mappedLandscapePath);
    } finally { f.cleanup(); }
  });
}

test('explicit empty mapping fails closed and never falls back to legacy or writes partial recovery', async () => {
  const f = await fixture({ explicit: true, empty: true });
  try {
    const before = fs.readFileSync(f.statePath, 'utf8');
    const result = f.run(['douyin', 'xiaohongshu']); assert.notEqual(result.status, 0); assert.match(result.stderr, /no cover asset/);
    assert.equal(fs.readFileSync(f.statePath, 'utf8'), before);
    assert.deepEqual(fs.readdirSync(path.join(f.jobDir, 'checkpoints')), []);
  } finally { f.cleanup(); }
});

for (const [name, change] of [
  ['recycled task name', { taskSpace: 'different task space' }], ['wrong numeric id', { taskSpaceId: 999 }],
  ['wrong platform', { platform: 'douyin' }], ['wrong phase', { phase: 'mutate' }],
  ['stale evidence', { observedAt: new Date(Date.now() - 11 * 60 * 1000).toISOString() }],
  ['foreign draft', { gates: { authenticated: { ok: true }, draftIdentity: { ok: false, evidence: { foreign: true } } } }],
  ['package mismatch', { fingerprint: 'wrong' }], ['already submitted', { finalPublishClicked: true }],
]) {
  test(`rejects ${name} without falling back to older positive evidence or changing state`, async () => {
    const f = await fixture();
    try {
      f.evidence('xiaohongshu', change, '999-xiaohongshu-inspect.json');
      const before = fs.readFileSync(f.statePath, 'utf8');
      const result = f.run(); assert.notEqual(result.status, 0, result.stdout);
      assert.equal(fs.readFileSync(f.statePath, 'utf8'), before);
      assert.deepEqual(fs.readdirSync(path.join(f.jobDir, 'checkpoints')), []);
    } finally { f.cleanup(); }
  });
}

for (const scope of ['publisher', 'job']) {
  test(`recovery refuses a live ${scope} owner before reading state`, async () => {
    const f = await fixture();
    const release = acquireJobLock(scope === 'publisher' ? path.join(f.root, '.publisher') : f.jobDir, { jobId: 'other', scope });
    try {
      const before = fs.readFileSync(f.statePath, 'utf8');
      const result = f.run(); assert.notEqual(result.status, 0); assert.match(result.stderr, /already running/);
      assert.equal(fs.readFileSync(f.statePath, 'utf8'), before);
      assert.deepEqual(fs.readdirSync(path.join(f.jobDir, 'checkpoints')), []);
    } finally { release(); f.cleanup(); }
  });
}

test('fingerprint mismatch leaves state and backup byte-identical', async () => {
  const f = await fixture();
  try {
    const changed = { ...f.state, fingerprint: 'other-package' };
    fs.writeFileSync(f.statePath, JSON.stringify(changed));
    const backup = path.join(f.jobDir, 'state.backup.json'); fs.writeFileSync(backup, 'sentinel backup');
    const before = fs.readFileSync(f.statePath, 'utf8');
    const result = f.run(); assert.notEqual(result.status, 0); assert.match(result.stderr, /fingerprint/);
    assert.equal(fs.readFileSync(f.statePath, 'utf8'), before); assert.equal(fs.readFileSync(backup, 'utf8'), 'sentinel backup');
  } finally { f.cleanup(); }
});

test('corrupt primary recovers only its matching atomic backup and retains corrupt evidence', async () => {
  const f = await fixture();
  try {
    fs.copyFileSync(f.statePath, path.join(f.jobDir, 'state.backup.json')); fs.writeFileSync(f.statePath, '{corrupt');
    const result = f.run(); assert.equal(result.status, 0, result.stderr);
    assert.ok(fs.readdirSync(f.jobDir).some(name => name.startsWith('state.corrupt-')));
    assert.equal(f.checkpoint('xiaohongshu').fingerprint, f.identity.fingerprint);
  } finally { f.cleanup(); }
});


test('explicit empty Douyin mapping also refuses legacy fallback', async () => {
  const f = await fixture({ explicit: true, douyinEmpty: true });
  try {
    const before = fs.readFileSync(f.statePath, 'utf8');
    const result = f.run(['douyin']); assert.notEqual(result.status, 0); assert.match(result.stderr, /no cover asset/);
    assert.equal(fs.readFileSync(f.statePath, 'utf8'), before);
    assert.deepEqual(fs.readdirSync(path.join(f.jobDir, 'checkpoints')), []);
  } finally { f.cleanup(); }
});

test('recorded task name is mandatory and missing video completion cannot certify a cover', async () => {
  for (const missing of ['name', 'video']) {
    const f = await fixture();
    try {
      if (missing === 'name') { delete f.state.platforms.xiaohongshu.taskSpaceName; fs.writeFileSync(f.statePath, JSON.stringify(f.state)); }
      else { const current = f.evidence('xiaohongshu'); current.gates.video = { ok: false, evidence: { uploading: true } }; f.evidence('xiaohongshu', { gates: current.gates }); }
      const before = fs.readFileSync(f.statePath, 'utf8');
      const result = f.run(['xiaohongshu']); assert.notEqual(result.status, 0);
      assert.equal(fs.readFileSync(f.statePath, 'utf8'), before);
      assert.deepEqual(fs.readdirSync(path.join(f.jobDir, 'checkpoints')), []);
    } finally { f.cleanup(); }
  }
});
