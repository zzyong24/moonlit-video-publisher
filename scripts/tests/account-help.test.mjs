import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const scripts = fileURLToPath(new URL('../', import.meta.url));

for (const entry of ['check-package.mjs', 'v2/publisher.mjs', 'v2/run-platform.mjs']) {
  test(`${entry} documents the account contract without onboarding or browser/state access`, () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'account cli help '));
    try {
      const result = spawnSync(process.execPath, [path.join(scripts, entry), '--help'], { encoding: 'utf8', env: { ...process.env, VIDEO_PUBLISHER_CONFIG: path.join(root, 'missing-config.json'), VIDEO_PUBLISHER_V2_EGO_COMMAND: 'must-not-run-browser' } });
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /expectedAccounts.douyin=\{name,douyinId\}/);
      assert.match(result.stdout, /[Ll]egacy|corrected|historical/);
      assert.match(result.stdout, /manual account/);
      assert.deepEqual(fs.readdirSync(root), []);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });
}

test('shared package example supplies synthetic target identity and independent platform cover slots', () => {
  const example = JSON.parse(fs.readFileSync(new URL('../../assets/package.example.json', import.meta.url), 'utf8'));
  assert.equal(typeof example.expectedAccounts.douyin.name, 'string');
  assert.equal(example.expectedAccounts.douyin.douyinId, 'replace_with_target_douyin_id');
  assert.deepEqual(example.cover.platformAssets.douyin.map(asset => asset.ratio), ['3:4', '4:3']);
  assert.deepEqual(example.cover.platformAssets.bilibili.map(asset => asset.ratio), ['4:3', '16:9']);
  assert.equal(example.cover.platformAssets.xiaohongshu[0].ratio, '3:4');
});
