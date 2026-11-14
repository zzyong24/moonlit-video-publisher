import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { acquireMetadataControllerLocks } from '../lib/metadata-lock.mjs';
import { acquirePlatformLock } from '../lib/platform-lock.mjs';

test('metadata refuses surviving sibling upload controllers and releases partial locks', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'metadata locks '));
  const release = acquirePlatformLock('bilibili', 'upload', { root });
  try {
    assert.throws(() => acquireMetadataControllerLocks({ root }), /already controlled/);
    assert.equal(fs.existsSync(path.join(root, 'xiaohongshu.lock')), false);
    assert.equal(fs.existsSync(path.join(root, 'douyin.lock')), false);
  } finally { release(); fs.rmSync(root, { recursive: true, force: true }); }
});

test('metadata owns all shared-input platform locks until its sole controller exits', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'metadata exclusive '));
  const release = acquireMetadataControllerLocks({ root });
  try {
    for (const platform of ['xiaohongshu', 'douyin', 'bilibili', 'wechat_channels']) assert.throws(() => acquirePlatformLock(platform, 'upload', { root }), /already controlled/);
  } finally { release(); fs.rmSync(root, { recursive: true, force: true }); }
});
