#!/usr/bin/env node
import fs from "node:fs";
import { requiredGates } from "../lib/model.mjs";
import { readPackage, bindPublishAccount } from "../../lib/content-package.mjs";

const [platform, packagePath, phase, taskSuffix, taskSpaceRaw] = process.argv.slice(2);
const taskSpaceId = Number(process.env.VIDEO_PUBLISHER_V2_MOCK_TASK_SPACE_ID || taskSpaceRaw) || ({ xiaohongshu: 11, douyin: 12, bilibili: 13, wechat_channels: 14 }[platform]);
const taskSpace = process.env.VIDEO_PUBLISHER_V2_TASK_NAME || `video publisher v2 ${platform} ${taskSuffix}`;
const at = Date.now();
if (process.env.VIDEO_PUBLISHER_V2_MOCK_LOG) fs.appendFileSync(process.env.VIDEO_PUBLISHER_V2_MOCK_LOG, JSON.stringify({ at, event: "start", platform, phase }) + "\n");
if (phase === "upload") await new Promise(resolve => setTimeout(resolve, Number(process.env[`VIDEO_PUBLISHER_V2_MOCK_UPLOAD_MS_${platform}`] || 30)));
const brokenChannel = process.env.VIDEO_PUBLISHER_V2_MOCK_BROKEN_CHANNEL === `${platform}:${phase}`;
const userControl = process.env.VIDEO_PUBLISHER_V2_MOCK_USER_CONTROL === `${platform}:${phase}`;
// AUTH_REQUIRED for one platform; with MOCK_AUTH_ONCE_FILE the login "happens"
// after the first blocked inspect (file created), so the late-auth join can run.
const authSpec = process.env.VIDEO_PUBLISHER_V2_MOCK_AUTH_REQUIRED === `${platform}:${phase}`;
const authOnce = process.env.VIDEO_PUBLISHER_V2_MOCK_AUTH_ONCE_FILE;
const authRequired = authSpec && (!authOnce || !fs.existsSync(authOnce));
if (authRequired && authOnce) fs.writeFileSync(authOnce, "logged-in-after-first-check");
const gates = Object.fromEntries(requiredGates(platform).map(name => [name, { ok: process.env.VIDEO_PUBLISHER_V2_MOCK_ALL_GATES === "1" || phase === "mutate" || phase === "verify", evidence: {} }]));
if (platform === "douyin" || platform === "xiaohongshu") {
  const pkg = readPackage(packagePath);
  const bindErrors = bindPublishAccount(pkg, platform);
  if (bindErrors.length) throw new Error(bindErrors.join("; "));
  const binding = pkg.accountBinding[platform];
  const expected = pkg.expectedAccounts[platform];
  const sourceUrl = platform === "douyin" ? "https://creator.douyin.com/creator-micro/home" : "https://creator.xiaohongshu.com/new/home";
  gates.targetAccount = { ok: true, evidence: { expected, actual: expected, binding, profileId: process.env.VIDEO_PUBLISHER_V2_MOCK_PROFILE_ID || binding.egoProfileId, observedAt: new Date().toISOString(), method: "creator-home-dom", scopeConfirmed: true, sourceUrl, taskSpaceId, taskSpaceName: taskSpace, screenshotPath: `/tmp/mock-account-${platform}.png` } };
}
gates.authenticated = { ok: true, evidence: {} };
gates.draftIdentity = { ok: true, evidence: {} };
gates.noBlockingDialog = { ok: true, evidence: {} };
gates.finalButton = { ok: true, evidence: { text: "final", disabled: false } };
gates.safety = { ok: true, evidence: { finalPublishClicked: false, guardArmed: true, blockedAttempts: 0 } };
if (phase === "upload") gates.video = { ok: true, evidence: { stable: true } };
if (brokenChannel) {
  for (const name of Object.keys(gates)) gates[name] = { ok: false, evidence: { reason: "mock input channel broken" } };
  gates.safety = { ok: false, evidence: { finalPublishClicked: false, guardArmed: false, blockedAttempts: 0 } };
}
const result = {
  schemaVersion: 1,
  platform,
  phase,
  taskSpaceId,
  taskSpace,
  observedAt: new Date().toISOString(),
  finalPublishClicked: false,
  ...(phase === "metadata" ? { metadata: { ok: true, uploadComplete: false } } : {}),
  gates,
  ...(brokenChannel ? { blocker: { code: "INPUT_CHANNEL_BROKEN", message: "mock Ego exit", retryable: true, requiresUser: false } } : {}),
  ...(userControl ? { blocker: { code: "USER_CONTROL", message: "mock control loss", retryable: false, requiresUser: true } } : {}),
  ...(authRequired ? { blocker: { code: "AUTH_REQUIRED", message: "mock login required", retryable: false, requiresUser: true } } : {}),
  ...(process.env.VIDEO_PUBLISHER_V2_MOCK_TASK_SPACE_RECREATED === "1" ? { taskSpaceRecovery: { recreated: true, previousTaskSpaceId: taskSpaceId, taskSpaceId } } : {}),
  ...(phase === "mutate" ? { receipts: { cover: { mock: true, taskSpaceId } } } : {}),
};
if (process.env.VIDEO_PUBLISHER_V2_MOCK_LOG) fs.appendFileSync(process.env.VIDEO_PUBLISHER_V2_MOCK_LOG, JSON.stringify({ at: Date.now(), event: "end", platform, phase }) + "\n");
console.log("VIDEO_PUBLISHER_V2_RESULT:" + JSON.stringify(result));
