#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  readPackage,
  bindPublishAccount,
  coverAssetsForPlatform,
  validateBilibiliPackage,
  validateDouyinPackage,
  validateWechatChannelsPackage,
  validateXiaohongshuPackage,
} from "../lib/content-package.mjs";
import { loadConfig } from "../lib/config.mjs";
import { PLATFORMS, requiredGates } from "./lib/model.mjs";
import { acquirePlatformLock } from "./lib/platform-lock.mjs";
import { acquireMetadataControllerLocks } from "./lib/metadata-lock.mjs";
import { parseV2Result, V2_RESULT_PREFIX } from "./lib/result-line.mjs";
import { redactDeep, redactText } from "./lib/signed-url.mjs";
import { proveSlotIdentity } from "./lib/cover-identity.mjs";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const validators = {
  xiaohongshu: validateXiaohongshuPackage,
  douyin: validateDouyinPackage,
  bilibili: validateBilibiliPackage,
  wechat_channels: validateWechatChannelsPackage,
};
const platformFiles = {
  xiaohongshu: "xiaohongshu.mjs",
  douyin: "douyin.mjs",
  bilibili: "bilibili.mjs",
  wechat_channels: "wechat-channels.mjs",
};

function usage() {
  return "Usage: run-platform.mjs <platform> <package.json> <inspect|upload|metadata|mutate|verify|quarantine> [task-suffix] [task-space-id] [--confirm-original-rights]\nAccount: package field account=dahao(大号, default)|xiaohao(小号, Douyin/Xiaohongshu only) is resolved through accounts.json (账号→Ego Profile→平台→昵称/ID); the task space must belong to that Profile (PROFILE_MISMATCH stops). Douyin requires expectedAccounts.douyin={name,douyinId} and Douyin/Xiaohongshu require a fresh same-task targetAccount proof. metadata is internal to publisher --metadata-only.\nUse a versioned corrected package for legacy identity fields; never rewrite historical fingerprints. Same-Profile spaces share login; Bilibili/WeChat Channels require manual account checks.";
}

// 大号 keeps the historical names so recorded spaces stay reusable; 小号 spaces
// carry the account in their name. The Profile check, not the name, is the gate.
function defaultTaskName(platform, taskSuffix, account) {
  return account && account !== "dahao" ? `video publisher v2 ${account} ${platform} ${taskSuffix}` : `video publisher v2 ${platform} ${taskSuffix}`;
}

function runEgo(script) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.env.VIDEO_PUBLISHER_V2_EGO_COMMAND || "ego-browser", ["nodejs"], { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", chunk => { stdout += chunk; });
    child.stderr.on("data", chunk => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", code => resolve({ code: code ?? 1, stdout, stderr }));
    child.stdin.end(script);
  });
}

const rawArgs = process.argv.slice(2);
if (rawArgs.some(arg => arg === "--help" || arg === "-h")) { console.log(usage()); process.exit(0); }
const originalRightsConfirmed = rawArgs.includes("--confirm-original-rights");
const positional = rawArgs.filter(arg => arg !== "--confirm-original-rights");
if (positional.some(arg => arg.startsWith("--"))) {
  console.error(usage());
  process.exit(2);
}
const [platform, rawPackagePath, phase, taskSuffix = "manual", taskSpaceRef = ""] = positional;
if (!PLATFORMS.includes(platform) || !rawPackagePath || !["inspect", "upload", "metadata", "mutate", "verify", "quarantine"].includes(phase)) {
  console.error(usage());
  process.exit(2);
}
if (phase === "quarantine" && platform !== "bilibili") {
  console.error("quarantine is supported only for bilibili");
  process.exit(2);
}
if (phase === "metadata") {
  // Only the owning publisher can launch this recovery phase. A direct runner
  // would otherwise overlap other-platform waiting processes on shared input.
  for (const [dir, scope] of [[process.env.VIDEO_PUBLISHER_V2_METADATA_JOB_DIR, "job"], [process.env.VIDEO_PUBLISHER_V2_METADATA_ROOT && path.join(process.env.VIDEO_PUBLISHER_V2_METADATA_ROOT, ".publisher"), "publisher"]]) {
    let owner;
    try { owner = JSON.parse(fs.readFileSync(path.join(dir || "", "orchestrator.lock", "owner.json"), "utf8")); } catch {}
    if (!dir || owner?.pid !== process.ppid || owner?.scope !== scope) throw new Error("metadata phase requires the exclusive owning publisher --metadata-only controller");
  }
  if (!taskSpaceRef || !process.env.VIDEO_PUBLISHER_V2_TASK_NAME) throw new Error("metadata phase requires recorded task-space identity");
}
const config = loadConfig({ requireOnboarded: true });
const standingOriginalityPolicy = config.declarations.originalityPolicy === "all_videos_original";
if (phase === "mutate" && ["xiaohongshu", "bilibili", "wechat_channels"].includes(platform) && !standingOriginalityPolicy && !originalRightsConfirmed) {
  console.error(`Originality confirmation is required before ${platform} mutation; set declarations.originalityPolicy=all_videos_original during onboarding, or add --confirm-original-rights after confirming this run.`);
  process.exit(2);
}
const packagePath = path.resolve(rawPackagePath);
if (!fs.existsSync(packagePath)) throw new Error(`Package JSON not found: ${packagePath}`);
const pkg = readPackage(packagePath);
const accountErrors = bindPublishAccount(pkg, platform);
if (accountErrors.length) throw new Error(`Account binding failed for ${platform}: ${accountErrors.join("; ")}`);
const accountBinding = pkg.accountBinding[platform];
const errors = validators[platform](pkg);
if (errors.length) throw new Error(`Package preflight failed for ${platform}: ${errors.join("; ")}`);
if (!fs.existsSync(pkg.videoPath)) throw new Error(`Video file not found: ${pkg.videoPath}`);
function reviewGate(stage, required = false) {
  const gate = process.env.MOONLIT_GUOSHEN_GATE;
  const receipt = process.env.MOONLIT_GUOSHEN_RECEIPT;
  const guoshenDir = process.env.MOONLIT_GUOSHEN_DIR;
  if (!gate || !receipt || !guoshenDir) {
    if (required) throw new Error("guoshen review gate/receipt/dir required before preparation or READY");
    return { ok: false, stage, reason: "final guoshen receipt not provided" };
  }
  const files = [packagePath, pkg.videoPath, ...coverAssetsForPlatform(pkg, platform).map(asset => asset.path)];
  const args = [gate, "--require-chain-version", "2", "--stage", stage, "--receipt", receipt, "--guoshen-dir", guoshenDir, "--platform", platform,
    ...files.flatMap(file => ["--file", path.resolve(file)])];
  const checked = spawnSync(process.env.MOONLIT_PYTHON || "python3", args, {encoding: "utf8"});
  const evidence = { ok: checked.status === 0, stage, receipt, detail: checked.stderr || checked.stdout };
  if (required && !evidence.ok) throw new Error(evidence.detail || "guoshen preflight failed");
  return evidence;
}
if (phase !== "inspect") reviewGate("content", true);
const finalReview = reviewGate("final");



const header = [
  'import fs from "node:fs";',
  'import path from "node:path";',
  `import { validateExpectedDouyinAccount, evaluateDouyinAccountProof, validateExpectedXiaohongshuAccount, evaluateXiaohongshuAccountProof } from ${JSON.stringify(pathToFileURL(path.join(DIR, "lib", "expected-account.mjs")).href)};`,
  `const platform = ${JSON.stringify(platform)};`,
  `const phase = ${JSON.stringify(phase)};`,
  `const existingTaskSpaceOnly = ${JSON.stringify(process.env.VIDEO_PUBLISHER_V2_EXISTING_SPACE_ONLY === "1" || phase === "metadata")};`,
  `const taskName = ${JSON.stringify(process.env.VIDEO_PUBLISHER_V2_TASK_NAME || defaultTaskName(platform, taskSuffix, accountBinding.account))};`,
  `const accountBinding = ${JSON.stringify(accountBinding)};`,
  `const accountScreenshotDir = ${JSON.stringify(process.env.VIDEO_PUBLISHER_V2_ACCOUNT_SHOT_DIR || path.join(path.dirname(packagePath), "account-proof"))};`,
  `const taskSpaceRef = ${JSON.stringify(taskSpaceRef)};`,
  `const packagePath = ${JSON.stringify(packagePath)};`,
  `const pkg = ${JSON.stringify(pkg)};`,
  `const videoPath = ${JSON.stringify(path.resolve(pkg.videoPath))};`,
  `const expectedReceipts = ${JSON.stringify(JSON.parse(process.env.VIDEO_PUBLISHER_V2_RECEIPTS || "{}"))};`,
  `const receiptCheckpointPath = ${JSON.stringify(process.env.VIDEO_PUBLISHER_V2_CHECKPOINT_PATH || "")};`,
  `const jobFingerprint = ${JSON.stringify(process.env.VIDEO_PUBLISHER_V2_FINGERPRINT || "")};`,
  'import crypto from "node:crypto";',
  `import { redactDeep, redactUrl, urlDigest, receiptUrlMatches } from ${JSON.stringify(pathToFileURL(path.join(DIR, "lib", "signed-url.mjs")).href)};`,
  `const slotCaptureDir = ${JSON.stringify(process.env.VIDEO_PUBLISHER_V2_SLOT_DIR || (process.env.VIDEO_PUBLISHER_V2_CHECKPOINT_PATH ? path.join(path.dirname(path.dirname(process.env.VIDEO_PUBLISHER_V2_CHECKPOINT_PATH)), "cover-slots") : ""))};`,
].join("\n");
const fragments = [
  header,
  fs.readFileSync(path.join(DIR, "ego", "core.mjs"), "utf8"),
  fs.readFileSync(path.join(DIR, "ego", "douyin-account.mjs"), "utf8"),
  fs.readFileSync(path.join(DIR, "ego", "xiaohongshu-account.mjs"), "utf8"),
  fs.readFileSync(path.join(DIR, "platforms", platformFiles[platform]), "utf8"),
  fs.readFileSync(path.join(DIR, "ego", "metadata.mjs"), "utf8"),
  fs.readFileSync(path.join(DIR, "platforms", "dispatch.mjs"), "utf8"),
].join("\n\n");

const lockOptions = { root: process.env.VIDEO_PUBLISHER_V2_PLATFORM_LOCK_ROOT };
const releasePlatformLock = phase === "metadata" ? acquireMetadataControllerLocks(lockOptions) : acquirePlatformLock(platform, phase, lockOptions);
let execution;
try {
  try {
    execution = await runEgo(fragments);
  } catch (error) {
    execution = { code: 1, stdout: "", stderr: String(error?.stack || error) };
  }
} finally {
  releasePlatformLock();
}
const combined = `${execution.stdout}\n${execution.stderr}`;
let result;
try {
  result = parseV2Result(combined, "Ego runner");
} catch (error) {
  const detail = combined.trim().slice(-1600);
  const userControl = /user (?:has|had) taken control|user took control|user is controlling|user controls|用户.*控制|not assigned to an agent|task space.*inactive/i.test(detail);
  if (execution.code === 0 && detail) {
    // Never rethrow raw: the parse error message embeds page output (signed URLs).
    console.error(redactText(detail));
    console.error(redactText(String(error?.message || error)));
    process.exit(1);
  }
  const failureEvidence = { reason: "ego runner unavailable", exitCode: execution.code, detail };
  const gates = Object.fromEntries(requiredGates(platform).map(name => [name, { ok: false, evidence: failureEvidence }]));
  gates.safety = { ok: false, evidence: { finalPublishClicked: false, guardArmed: false, blockedAttempts: 0 } };
  result = {
    schemaVersion: 1,
    platform,
    phase,
    taskSpaceId: Number(taskSpaceRef) || null,
    observedAt: new Date().toISOString(),
    finalPublishClicked: false,
    gates,
    blocker: {
      code: userControl ? "USER_CONTROL" : "INPUT_CHANNEL_BROKEN",
      message: userControl ? "Ego Lite 任务空间已由用户接管" : "Ego Lite 已退出或无法返回页面证据",
      retryable: !userControl,
      requiresUser: userControl,
      evidence: failureEvidence,
    },
  };
}
result.gates ||= {};
result.gates.publishReview = { ok: finalReview.ok, evidence: finalReview };
resolvePendingCoverProofs(result);
// Signed CDN URLs (token/sign/encfilekey/t) never leave this process raw.
console.log(V2_RESULT_PREFIX + JSON.stringify(redactDeep(result)));

// Automatic dual-slot uploads (视频号) return receipts with visual.pending; the
// Ego runtime cannot run sips, so the identity proof is resolved here. A slot
// that fails stays unproven: the cover gate fails closed and a typed blocker
// is reported instead of a READY.
function resolvePendingCoverProofs(observation) {
  const slots = observation?.receipts?.cover?.slots;
  if (!slots) return;
  const assets = coverAssetsForPlatform(pkg, platform).map(asset => asset.path);
  const failures = [];
  for (const [slot, item] of Object.entries(slots)) {
    if (!item?.visual?.pending) continue;
    item.visual = item.capture?.ok
      ? proveSlotIdentity({ slotFile: item.capture.file, assetPath: item.assetPath, otherAssetPaths: assets, source: "slot_url" })
      : { ok: false, reason: item.capture?.reason || "slot image not captured" };
    if (!item.visual.ok) failures.push({ slot, ...item.visual });
  }
  const cover = observation.gates?.cover;
  const slotChecks = cover?.evidence?.slotChecks;
  if (slotChecks) for (const [slot, check] of Object.entries(slotChecks)) if (slots[slot]?.visual && !slots[slot].visual.pending) { check.visual = slots[slot].visual.ok === true; check.visualDistance = slots[slot].visual.distance ?? null; }
  if (cover && slotChecks && !failures.length && cover.evidence.urlsMatched && Object.values(slotChecks).every(check => check.asset && check.visual)) {
    cover.ok = true;
    cover.evidence.reason = null;
  }
  if (failures.length) {
    if (cover) cover.ok = false;
    observation.blocker ||= { code: "PLATFORM_REJECTED_ASSET", message: `封面槽位视觉身份未通过：${failures.map(item => item.slot).join(", ")}`, retryable: true, requiresUser: false, evidence: { failures } };
  }
  rewriteCheckpoint(observation.receipts);
}

function rewriteCheckpoint(receipts) {
  const file = process.env.VIDEO_PUBLISHER_V2_CHECKPOINT_PATH;
  if (!file || !fs.existsSync(file)) return;
  try {
    const checkpoint = JSON.parse(fs.readFileSync(file, "utf8"));
    if (checkpoint.fingerprint !== process.env.VIDEO_PUBLISHER_V2_FINGERPRINT) return;
    checkpoint.receipts = redactDeep({ ...checkpoint.receipts, ...receipts });
    checkpoint.visualResolvedAt = new Date().toISOString();
    const temp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(temp, JSON.stringify(checkpoint, null, 2) + "\n");
    fs.renameSync(temp, file);
  } catch (error) {
    console.error(`checkpoint visual update failed: ${error?.message || error}`);
  }
}
