#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { readPackage } from '../lib/content-package.mjs';
import { buildIdentity } from './lib/identity.mjs';

function parseArgs(argv) {
  const out = { platforms: [], confirmed: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--confirm-visible-assets') { out.confirmed = true; continue; }
    if (arg === '--platform') { out.platforms.push(argv[++i]); continue; }
    if (arg === '--job-dir') { out.jobDir = path.resolve(argv[++i]); continue; }
    if (arg === '--package') { out.packagePath = path.resolve(argv[++i]); continue; }
    throw new Error(`Unknown option: ${arg}`);
  }
  if (!out.confirmed) throw new Error('--confirm-visible-assets is required after visual confirmation');
  if (!out.jobDir || !out.packagePath || !out.platforms.length) throw new Error('--job-dir, --package, and at least one --platform are required');
  for (const platform of out.platforms) if (!['xiaohongshu', 'douyin'].includes(platform)) throw new Error(`Unsupported recovery platform: ${platform}`);
  return out;
}

function atomicWrite(file, value) {
  const temp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(value, null, 2) + '\n');
  fs.renameSync(temp, file);
}

function latestFreshEvidence(jobDir, platform, taskSpaceId) {
  const evidenceDir = path.join(jobDir, 'evidence');
  const names = fs.readdirSync(evidenceDir)
    .filter(name => name.endsWith(`-${platform}-inspect.json`) || name.endsWith(`-${platform}-verify.json`))
    .sort().reverse();
  for (const name of names) {
    const file = path.join(evidenceDir, name);
    const payload = JSON.parse(fs.readFileSync(file, 'utf8'));
    const observation = payload.observation || payload;
    if (Number(observation.taskSpaceId) !== Number(taskSpaceId)) continue;
    const age = Date.now() - Date.parse(observation.observedAt || 0);
    if (!Number.isFinite(age) || age < 0 || age > 10 * 60 * 1000) throw new Error(`${platform} evidence is stale; run inspect-only again`);
    return { file, observation };
  }
  throw new Error(`No fresh ${platform} inspect evidence for task space ${taskSpaceId}`);
}

const args = parseArgs(process.argv.slice(2));
const pkg = readPackage(args.packagePath);
const identity = await buildIdentity(pkg);
const statePath = path.join(args.jobDir, 'state.json');
const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
if (state.fingerprint !== identity.fingerprint) throw new Error('Package fingerprint does not match the publishing job');

for (const platform of args.platforms) {
  const item = state.platforms?.[platform];
  if (!item?.taskSpaceId) throw new Error(`${platform} has no recorded task space`);
  const { file, observation } = latestFreshEvidence(args.jobDir, platform, item.taskSpaceId);
  const cover = observation.gates?.cover?.evidence || {};
  let receipt;
  if (platform === 'xiaohongshu') {
    const live = String(cover.background || '').match(/url\(["']?([^"')]+)/)?.[1];
    if (!live) throw new Error('Xiaohongshu fresh evidence has no live cover URL');
    receipt = { assetPath: pkg.cover.horizontal4x3Path, ratio: '4:3', beforeUrl: '', afterUrl: live, recoveredFrom: file };
  } else {
    const portrait = cover.urls?.portrait?.find(Boolean);
    const landscape = cover.urls?.landscape?.find(Boolean);
    if (!portrait || !landscape || portrait === landscape) throw new Error('Douyin fresh evidence needs distinct portrait and landscape cover URLs');
    receipt = { slots: {
      portrait: { assetPath: pkg.cover.vertical3x4Path, ratio: '3:4', beforeUrls: [], afterUrl: portrait },
      landscape: { assetPath: pkg.cover.horizontal4x3Path, ratio: '4:3', beforeUrls: [], afterUrl: landscape },
    }, recoveredFrom: file };
  }
  item.receipts = { ...(item.receipts || {}), cover: receipt };
  item.receiptTaskSpaceId = item.taskSpaceId;
  const checkpoint = { schemaVersion: 2, platform, fingerprint: state.fingerprint, taskSpaceId: item.taskSpaceId, receipts: { cover: receipt }, writtenAt: new Date().toISOString() };
  atomicWrite(path.join(args.jobDir, 'checkpoints', `${platform}.receipts.json`), checkpoint);
  (state.receiptRecoveries ||= []).push({ platform, taskSpaceId: item.taskSpaceId, evidencePath: file, recoveredAt: checkpoint.writtenAt, confirmedVisibleAssets: true });
}

atomicWrite(statePath, state);
console.log(JSON.stringify({ jobId: state.jobId, fingerprint: state.fingerprint, recovered: args.platforms }, null, 2));
