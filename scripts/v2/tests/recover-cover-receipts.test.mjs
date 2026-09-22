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

test('cover receipt recovery binds fresh live evidence to the package and task spaces', async () => {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'video-publisher-receipt-recovery-'));
  try {
    const jobDir = path.join(root, 'job');
    const evidenceDir = path.join(jobDir, 'evidence');
    const checkpointDir = path.join(jobDir, 'checkpoints');
    await fs.promises.mkdir(evidenceDir, { recursive: true });
    await fs.promises.mkdir(checkpointDir, { recursive: true });
    const videoPath = path.join(root, 'video.mov');
    const portraitPath = path.join(root, 'portrait.png');
    const landscapePath = path.join(root, 'landscape.png');
    await Promise.all([
      fs.promises.writeFile(videoPath, 'video'),
      fs.promises.writeFile(portraitPath, 'portrait'),
      fs.promises.writeFile(landscapePath, 'landscape'),
    ]);
    const packagePath = path.join(root, 'package.json');
    await fs.promises.writeFile(packagePath, JSON.stringify({
      title: 'Recovery fixture', videoPath,
      cover: { uploadCustomCover: true, vertical3x4Path: portraitPath, horizontal4x3Path: landscapePath },
      xhsTopics: ['fixture'], douyinTopics: ['fixture'],
    }));
    const pkg = readPackage(packagePath, { config: defaultConfig() });
    const identity = await buildIdentity(pkg);
    await fs.promises.writeFile(path.join(jobDir, 'state.json'), JSON.stringify({
      jobId: 'fixture', fingerprint: identity.fingerprint,
      platforms: { xiaohongshu: { taskSpaceId: 3, receipts: {} }, douyin: { taskSpaceId: 4, receipts: {} } },
    }));
    const observedAt = new Date().toISOString();
    await fs.promises.writeFile(path.join(evidenceDir, '001-xiaohongshu-inspect.json'), JSON.stringify({ observation: {
      taskSpaceId: 3, observedAt, gates: { cover: { evidence: { background: 'url("https://xhs.example/cover.jpg")' } } },
    } }));
    await fs.promises.writeFile(path.join(evidenceDir, '002-douyin-inspect.json'), JSON.stringify({ observation: {
      taskSpaceId: 4, observedAt, gates: { cover: { evidence: { urls: { portrait: ['https://dy.example/p.jpg'], landscape: ['https://dy.example/l.jpg'] } } } },
    } }));
    const result = spawnSync(process.execPath, [
      fileURLToPath(new URL('../recover-cover-receipts.mjs', import.meta.url)), '--job-dir', jobDir, '--package', packagePath,
      '--platform', 'xiaohongshu', '--platform', 'douyin', '--confirm-visible-assets',
    ], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    const xhs = JSON.parse(await fs.promises.readFile(path.join(checkpointDir, 'xiaohongshu.receipts.json'), 'utf8'));
    const douyin = JSON.parse(await fs.promises.readFile(path.join(checkpointDir, 'douyin.receipts.json'), 'utf8'));
    assert.equal(xhs.fingerprint, identity.fingerprint);
    assert.equal(xhs.taskSpaceId, 3);
    assert.equal(xhs.receipts.cover.assetPath, portraitPath);
    assert.equal(douyin.receipts.cover.slots.portrait.afterUrl, 'https://dy.example/p.jpg');
    assert.equal(douyin.receipts.cover.slots.landscape.afterUrl, 'https://dy.example/l.jpg');
  } finally {
    await fs.promises.rm(root, { recursive: true, force: true });
  }
});
