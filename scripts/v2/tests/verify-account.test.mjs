import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const V2_DIR = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const ACCOUNTS = fileURLToPath(new URL('../../tests/fixtures/accounts.fixture.json', import.meta.url));

function setup(fakeEvidence) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'verify account '));
  const videoPath = path.join(root, 'video.mp4'), packagePath = path.join(root, 'package.json'), configPath = path.join(root, 'config.json'), ego = path.join(root, 'fake-ego');
  fs.writeFileSync(videoPath, 'fixture');
  fs.writeFileSync(packagePath, JSON.stringify({ videoPath, title: 'Verify', account: '小号', douyinTopics: ['Test'], cover: { useVideoFrame: true, approvalEvidence: 'fixture' } }));
  fs.writeFileSync(configPath, JSON.stringify({ schemaVersion: 1, onboarding: { completed: true }, sourceDirectory: root, defaultPlatforms: ['douyin'] }));
  // Fake Ego: consumes the script, prints one result line with a fresh timestamp.
  const body = JSON.stringify({ schemaVersion: 1, kind: 'account-proof', platform: 'douyin', taskSpaceId: 7, taskSpace: 'recorded', ok: true, evidence: fakeEvidence });
  fs.writeFileSync(ego, `#!/bin/sh\ncat >/dev/null\nNOW=$(node -e 'console.log(new Date().toISOString())')\nprintf 'VIDEO_PUBLISHER_V2_RESULT:%s\\n' '${body.replace(/'/g, '')}' | sed "s/__NOW__/$NOW/"\n`);
  fs.chmodSync(ego, 0o755);
  const env = { ...process.env, VIDEO_PUBLISHER_CONFIG: configPath, VIDEO_PUBLISHER_ACCOUNTS: ACCOUNTS, VIDEO_PUBLISHER_V2_EGO_COMMAND: ego };
  return { root, packagePath, env };
}
const evidence = (actual, profileId = 'Profile 1') => ({ actual, expected: { name: 'Fixture Second', douyinId: 'fixture_second_id' }, binding: { account: 'xiaohao', label: '小号', egoProfileId: 'Profile 1' }, profileId, method: 'creator-home-dom', scopeConfirmed: true, sourceUrl: 'https://creator.douyin.com/creator-micro/home', observedAt: '__NOW__', taskSpaceId: 7, taskSpaceName: 'recorded', screenshotPath: '/tmp/x.png' });

test('verify-account writes a 15-second proof for the bound account and exits 0', () => {
  const f = setup(evidence({ name: 'Fixture Second', douyinId: 'fixture_second_id' }));
  try {
    const out = path.join(f.root, 'proof.json');
    const result = spawnSync(process.execPath, [path.join(V2_DIR, 'verify-account.mjs'), 'douyin', f.packagePath, '7', '--task-name', 'recorded', '--out', out], { env: f.env, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr + result.stdout);
    const proof = JSON.parse(fs.readFileSync(out, 'utf8'));
    assert.equal(proof.ok, true); assert.equal(proof.account.account, 'xiaohao'); assert.equal(proof.account.egoProfileId, 'Profile 1');
  } finally { fs.rmSync(f.root, { recursive: true, force: true }); }
});

test('verify-account independently rejects a wrong account or Profile even if Ego claims ok', () => {
  for (const [actual, profileId, code] of [[{ name: 'Fixture Creator', douyinId: 'fixture_creator_id' }, 'Profile 1', 'ACCOUNT_MISMATCH'], [{ name: 'Fixture Second', douyinId: 'fixture_second_id' }, 'Default', 'PROFILE_MISMATCH']]) {
    const f = setup(evidence(actual, profileId));
    try {
      const result = spawnSync(process.execPath, [path.join(V2_DIR, 'verify-account.mjs'), 'douyin', f.packagePath, '7', '--task-name', 'recorded'], { env: f.env, encoding: 'utf8' });
      assert.equal(result.status, 3, result.stderr + result.stdout);
      assert.equal(JSON.parse(result.stdout).blocker.code, code);
    } finally { fs.rmSync(f.root, { recursive: true, force: true }); }
  }
});

test('verify-account refuses platforms without an automatic reader and 小号 on them, before any browser', () => {
  const f = setup(evidence({ name: 'x', douyinId: 'y' }));
  try {
    const env = { ...f.env, VIDEO_PUBLISHER_V2_EGO_COMMAND: 'must-not-run-browser' };
    const bili = spawnSync(process.execPath, [path.join(V2_DIR, 'verify-account.mjs'), 'bilibili', f.packagePath, '7', '--task-name', 'recorded'], { env, encoding: 'utf8' });
    assert.equal(bili.status, 2);
    const noName = spawnSync(process.execPath, [path.join(V2_DIR, 'verify-account.mjs'), 'douyin', f.packagePath, '7'], { env, encoding: 'utf8' });
    assert.equal(noName.status, 2);
  } finally { fs.rmSync(f.root, { recursive: true, force: true }); }
});
