#!/usr/bin/env node
// 逐条发布批准检查（团队规则 2026-10-21：发布键在月明）。
// 用法：
//   检查：node scripts/check-approval.mjs --approval <approval.json> --item <作品ID> --platform <平台> --fingerprint <sha256> [--account-proof <proof.json>]
//   抖音/小红书必须带 --account-proof（scripts/v2/verify-account.mjs 在 15 秒内写出的账号核验结果），
//   且批准记录要写明 account（大号/小号），与核验结果的账号、Profile、昵称、账号ID一致才放行。
//   发布成功后核销：node scripts/check-approval.mjs --approval <approval.json> --consume --link <公开链接>
// approval.json 由执行者在月明看过最终预览、对这一条明确批准后当场写入（见 references/per-item-approval.md）。
// 只认这一条：作品ID、平台、内容指纹都必须一致；已核销（consumed）的批准不能再用。退出码 0=可以发布，2=不可以。
import fs from 'node:fs';
import { ACCOUNT_GATED_PLATFORMS, evaluateAccountProof } from './v2/lib/expected-account.mjs';

const argv = process.argv.slice(2);
const opt = name => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
const fail = msg => { console.error(JSON.stringify({status: 'NOT_APPROVED', reason: msg})); process.exit(2); };

const file = opt('--approval');
if (!file) fail('缺少 --approval：先给月明看最终预览，拿到对这一条的明确批准');
let a;
try { a = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { fail(`读不到批准记录：${e.message}`); }

if (argv.includes('--consume')) {
  const link = opt('--link');
  if (!link) fail('核销时必须带 --link（发布后的公开链接或平台作品页），用于回报月明');
  if (a.consumed) fail('这条批准已经核销过，不能再用');
  a.consumed = true; a.publishedLink = link; a.consumedAt = new Date().toISOString();
  fs.writeFileSync(file, JSON.stringify(a, null, 2));
  console.log(JSON.stringify({status: 'CONSUMED', item: a.item, platform: a.platform, link}));
  process.exit(0);
}

const need = ['item', 'platform', 'fingerprint', 'approvedBy', 'approvedAt', 'previewShown', 'approvalQuote'];
for (const k of need) if (!a[k]) fail(`批准记录缺字段 ${k}`);
if (a.consumed) fail('这条批准已用过（consumed=true）；以前的批准不能复用，重新给月明看预览');
if (a.item !== opt('--item')) fail(`批准的是作品 ${a.item}，不是 ${opt('--item')}`);
if (a.platform !== opt('--platform')) fail(`批准的是平台 ${a.platform}，不是 ${opt('--platform')}`);
if (a.fingerprint !== opt('--fingerprint')) fail('内容指纹变了：批准后改过文案/媒体/设置，要重新给月明看预览');
const age = Date.now() - Date.parse(a.approvedAt);
if (!(age >= 0 && age < 24 * 3600 * 1000)) fail('批准时间无效或超过 24 小时，重新确认');

// 发布前 15 秒内再核对一次目标账号（月明 2026-10-21）。
const ACCOUNT_KEYS = {dahao: 'dahao', '大号': 'dahao', xiaohao: 'xiaohao', '小号': 'xiaohao'};
let destination = null;
const proofFile = opt('--account-proof');
if (ACCOUNT_GATED_PLATFORMS.includes(a.platform) || proofFile) {
  if (!proofFile) fail('抖音/小红书点发布前必须带 --account-proof：先跑 scripts/v2/verify-account.mjs，15 秒内有效');
  const approvedAccount = ACCOUNT_KEYS[String(a.account || '').trim()];
  if (!approvedAccount) fail('批准记录缺 account（大号/小号）：预览里必须写明“将发到哪个账号”，月明批准的是那个账号');
  let proof;
  try { proof = JSON.parse(fs.readFileSync(proofFile, 'utf8')); } catch (e) { fail(`读不到账号核验结果：${e.message}`); }
  const evidence = proof?.evidence || {};
  const binding = evidence.binding;
  if (proof?.platform !== a.platform) fail(`账号核验的是平台 ${proof?.platform}，不是 ${a.platform}`);
  if (proof?.ok !== true) fail(`账号核验未通过：${proof?.blocker?.code || 'ACCOUNT_UNVERIFIED'} ${proof?.blocker?.message || ''}`.trim());
  if (!binding?.egoProfileId) fail('账号核验结果没有 Profile 绑定，不能证明发到哪个账号');
  if (binding.account !== approvedAccount) fail(`批准的是${approvedAccount === 'dahao' ? '大号' : '小号'}，核验到的是${binding.label || binding.account}；停止`);
  const recheck = evaluateAccountProof(a.platform, {expectedAccounts: {[a.platform]: evidence.expected}, accountBinding: {[a.platform]: binding}}, evidence, {id: evidence.taskSpaceId, name: evidence.taskSpaceName});
  if (!recheck.ok) fail(`${recheck.blocker.code}：${recheck.blocker.message}（核验结果必须在 15 秒内、同一任务空间、同一 Profile、昵称和账号ID完全一致）`);
  destination = {account: binding.account, label: binding.label, profileId: evidence.profileId, actual: evidence.actual, observedAt: evidence.observedAt, screenshotPath: evidence.screenshotPath || null};
}
console.log(JSON.stringify({status: 'APPROVED', item: a.item, platform: a.platform, ...(destination ? {destination} : {})}));
