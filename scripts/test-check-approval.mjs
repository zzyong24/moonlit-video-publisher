#!/usr/bin/env node
// check-approval.mjs 的最小测试：对的那一条能过；别的作品/平台/改过内容/已核销都拒绝。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

const here = path.dirname(new URL(import.meta.url).pathname);
const checker = path.join(here, 'check-approval.mjs');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'approval-test-'));
const run = (...args) => spawnSync(process.execPath, [checker, ...args], {encoding: 'utf8'}).status;
try {
  const f = path.join(dir, 'approval.json');
  fs.writeFileSync(f, JSON.stringify({item: 'W1', platform: 'x', fingerprint: 'abc', approvedBy: '月明',
    approvedAt: new Date().toISOString(), previewShown: 'p.png', approvalQuote: '批准发布 W1 到 X', consumed: false}));
  const ok = ['--approval', f, '--item', 'W1', '--platform', 'x', '--fingerprint', 'abc'];
  const expect = (cond, msg) => { if (!cond) throw new Error(msg); };
  expect(run(...ok) === 0, '正确的批准应通过');
  expect(run('--approval', f, '--item', 'W2', '--platform', 'x', '--fingerprint', 'abc') === 2, '别的作品应拒绝');
  expect(run('--approval', f, '--item', 'W1', '--platform', 'douyin', '--fingerprint', 'abc') === 2, '别的平台应拒绝');
  expect(run('--approval', f, '--item', 'W1', '--platform', 'x', '--fingerprint', 'zzz') === 2, '内容改过应拒绝');
  expect(run('--approval', f, '--consume') === 2, '核销必须带链接');
  expect(run('--approval', f, '--consume', '--link', 'https://example.com/p/1') === 0, '核销应成功');
  expect(run(...ok) === 2, '已核销的批准不能复用');
  expect(run('--item', 'W1') === 2, '没有批准记录应拒绝');
  // 抖音/小红书：批准要写明 account，且必须带 15 秒内的账号核验结果。
  const binding = {account: 'xiaohao', label: '小号', egoProfileId: 'Profile 1', platform: 'douyin'};
  const proof = (overrides = {}, evidence = {}) => ({platform: 'douyin', ok: true, ...overrides, evidence: {
    expected: {name: '小号昵称', douyinId: 'xh_1'}, actual: {name: '小号昵称', douyinId: 'xh_1'}, binding, profileId: 'Profile 1',
    method: 'creator-home-dom', scopeConfirmed: true, sourceUrl: 'https://creator.douyin.com/creator-micro/home',
    observedAt: new Date().toISOString(), taskSpaceId: 7, taskSpaceName: 'video publisher v2 xiaohao douyin j', screenshotPath: '/tmp/a.png', ...evidence}});
  const g = path.join(dir, 'approval-douyin.json');
  const writeApproval = extra => fs.writeFileSync(g, JSON.stringify({item: 'W1', platform: 'douyin', fingerprint: 'abc', approvedBy: '月明',
    approvedAt: new Date().toISOString(), previewShown: 'p.png', approvalQuote: '批准发布 W1 到抖音小号', consumed: false, ...extra}));
  const pf = path.join(dir, 'proof.json');
  const dy = ['--approval', g, '--item', 'W1', '--platform', 'douyin', '--fingerprint', 'abc'];
  writeApproval({account: '小号'});
  fs.writeFileSync(pf, JSON.stringify(proof()));
  expect(run(...dy) === 2, '抖音没有账号核验结果应拒绝');
  expect(run(...dy, '--account-proof', pf) === 0, '15 秒内、账号一致的核验应通过');
  fs.writeFileSync(pf, JSON.stringify(proof({}, {observedAt: new Date(Date.now() - 16000).toISOString()})));
  expect(run(...dy, '--account-proof', pf) === 2, '超过 15 秒的核验应拒绝');
  fs.writeFileSync(pf, JSON.stringify(proof({}, {actual: {name: '大号昵称', douyinId: 'dh_1'}})));
  expect(run(...dy, '--account-proof', pf) === 2, '昵称/账号ID对不上应拒绝');
  fs.writeFileSync(pf, JSON.stringify(proof({}, {profileId: 'Default'})));
  expect(run(...dy, '--account-proof', pf) === 2, 'Profile 对不上应拒绝');
  fs.writeFileSync(pf, JSON.stringify(proof({ok: false, blocker: {code: 'ACCOUNT_MISMATCH'}})));
  expect(run(...dy, '--account-proof', pf) === 2, '核验失败的结果应拒绝');
  fs.writeFileSync(pf, JSON.stringify(proof()));
  writeApproval({account: '大号'});
  expect(run(...dy, '--account-proof', pf) === 2, '批准大号、核验到小号应拒绝');
  writeApproval({});
  expect(run(...dy, '--account-proof', pf) === 2, '批准记录没写账号应拒绝');
  console.log('check-approval tests passed');
} finally {
  fs.rmSync(dir, {recursive: true, force: true});
}
