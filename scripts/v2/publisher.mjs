#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  readPackage,
  bindPublishAccount,
  validateBilibiliPackage,
  validateDouyinPackage,
  validateWechatChannelsPackage,
  validateXiaohongshuPackage,
} from "../lib/content-package.mjs";
import { loadConfig } from "../lib/config.mjs";
import { inspectMediaFile, validateMediaForPlatform } from "../lib/media.mjs";
import { buildIdentity } from "./lib/identity.mjs";
import { acquireJobLock } from "./lib/job-lock.mjs";
import { JobStore } from "./lib/job-store.mjs";
import { acquireMetadataControllerLocks } from "./lib/metadata-lock.mjs";
import { BLOCKER, PLATFORMS, classifyVerdict, compactVerdict, evaluateObservation } from "./lib/model.mjs";
import { parseV2Result } from "./lib/result-line.mjs";
import { runPool, SerialQueue } from "./lib/scheduler.mjs";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = path.join(os.homedir(), ".video-publisher", "v2-jobs");
const RIGHTS_PLATFORMS = new Set(["xiaohongshu", "bilibili", "wechat_channels"]);
const validators = { xiaohongshu: validateXiaohongshuPackage, douyin: validateDouyinPackage, bilibili: validateBilibiliPackage, wechat_channels: validateWechatChannelsPackage };

class UsageError extends Error {}
const activeLockReleases = [];
const HELP = "Usage: publisher.mjs <package.json> [task-suffix] [platform...] [--inspect-only|--metadata-only] [--job-id ID] [--state-root DIR] [--confirm-original-rights] [--auth-poll-seconds N(default 60, 0=off)] [--pause-all-on-user-block]\nAccount: package field account=dahao(大号, default)|xiaohao(小号, Douyin/Xiaohongshu only) resolves through accounts.json (账号→Ego Profile→平台→昵称/ID); missing mapping fails preflight. Douyin requires expectedAccounts.douyin={name,douyinId} before browser work and Douyin/Xiaohongshu require a fresh matching targetAccount before preparation/READY.\nDo not rewrite an old package/job fingerprint: create a corrected version and plan same-page recovery for an existing upload. Same-Profile spaces share login; Bilibili/WeChat Channels still need manual account verification.";
if (process.argv.slice(2).some(arg => arg === "--help" || arg === "-h")) { console.log(HELP); process.exit(0); }


function positive(raw, name) {
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) throw new UsageError(`${name} must be a positive integer`);
  return value;
}

function parseArgs(argv) {
  const config = loadConfig({ requireOnboarded: true });
  const options = {
    inspectOnly: false,
    metadataOnly: false,
    originalRightsConfirmed: false,
    originalityPolicy: config.declarations.originalityPolicy,
    stateRoot: DEFAULT_ROOT,
    jobId: "",
    checkConcurrency: config.execution.checkConcurrency,
    uploadConcurrency: config.execution.uploadConcurrency,
    pauseAllOnUserBlock: false,
    authPollSeconds: 60,
  };
  const positional = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--metadata-only") { options.metadataOnly = true; continue; }
    if (arg === "--inspect-only") { options.inspectOnly = true; continue; }
    if (arg === "--confirm-original-rights") { options.originalRightsConfirmed = true; continue; }
    if (arg === "--pause-all-on-user-block") { options.pauseAllOnUserBlock = true; continue; }
    const setters = {
      "--state-root": value => { options.stateRoot = path.resolve(value); },
      "--job-id": value => { options.jobId = value; },
      "--check-concurrency": value => { options.checkConcurrency = positive(value, arg); },
      "--upload-concurrency": value => { options.uploadConcurrency = positive(value, arg); },
      "--auth-poll-seconds": value => { const seconds = Number(value); if (!Number.isInteger(seconds) || seconds < 0) throw new UsageError(`${arg} must be a non-negative integer`); options.authPollSeconds = seconds; },
    };
    if (setters[arg]) {
      if (!argv[index + 1]) throw new UsageError(`${arg} requires a value`);
      setters[arg](argv[++index]);
      continue;
    }
    if (arg.startsWith("--")) throw new UsageError(`Unknown option: ${arg}`);
    positional.push(arg);
  }
  if (!positional.length) throw new UsageError(HELP);
  const packagePath = path.resolve(positional.shift());
  let taskSuffix = "manual";
  if (positional.length && !PLATFORMS.includes(positional[0])) taskSuffix = positional.shift();
  const platforms = positional.length ? positional : [...config.defaultPlatforms];
  if (platforms.some(platform => !PLATFORMS.includes(platform))) throw new UsageError("Unsupported platform argument");
  const unavailablePlatforms = platforms.filter(platform => !config.availablePlatforms.includes(platform));
  if (unavailablePlatforms.length) {
    throw new UsageError(`Platform is not configured as available: ${unavailablePlatforms.join(", ")}. Update Video Publisher onboarding before browser work.`);
  }
  if (options.metadataOnly && (options.inspectOnly || platforms.length !== 1 || !options.jobId)) throw new UsageError("--metadata-only requires exactly one platform, explicit --job-id, and no --inspect-only");
  return { ...options, packagePath, taskSuffix, platforms };
}

function runCapture(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { ...options, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", chunk => { stdout += chunk; });
    child.stderr.on("data", chunk => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", code => resolve({ code: code ?? 1, stdout, stderr }));
  });
}

function initialState(jobId, identity, args) {
  return {
    schemaVersion: 3,
    jobId,
    fingerprint: identity.fingerprint,
    packagePath: args.packagePath,
    taskSuffix: args.taskSuffix,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: "new",
    scheduler: { checkConcurrency: args.checkConcurrency, uploadConcurrency: args.uploadConcurrency, uiConcurrency: 1 },
    video: identity.video,
    assets: identity.assets,
    platforms: Object.fromEntries(args.platforms.map(platform => [platform, { status: "new", taskSpaceId: null, taskSpaceName: null, receipts: {}, verdict: null, history: [] }])),
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!fs.existsSync(args.packagePath)) throw new Error(`Package JSON not found: ${args.packagePath}`);
  const pkg = readPackage(args.packagePath);
  const media = inspectMediaFile(pkg.videoPath);
  // 账号绑定先于一切浏览器工作：默认大号；小号只在包里明确写 account=xiaohao/小号 时使用，
  // 且只能发抖音/小红书。映射缺失或冲突即该平台预检失败（fail closed）。
  // Fingerprint the package as written (binding adds derived fields only), so
  // existing 大号 jobs keep their identity; an explicit account field is part of it.
  const identityPackage = structuredClone(pkg);
  const accountErrors = Object.fromEntries(args.platforms.map(platform => [platform, bindPublishAccount(pkg, platform)]));
  const preflightErrors = Object.fromEntries(args.platforms.map(platform => [platform, accountErrors[platform].length ? accountErrors[platform] : [
    ...validators[platform](pkg),
    ...validateMediaForPlatform(pkg, platform, media),
  ]]));
  const runnablePlatforms = args.platforms.filter(platform => preflightErrors[platform].length === 0);
  if (!runnablePlatforms.length) {
    throw new Error(args.platforms
      .map(platform => `Package preflight failed for ${platform}: ${preflightErrors[platform].join("; ")}`)
      .join("\n"));
  }
  const rightsTargets = runnablePlatforms.filter(platform => RIGHTS_PLATFORMS.has(platform));
  const standingOriginalityPolicy = args.originalityPolicy === "all_videos_original";
  if (!args.inspectOnly && rightsTargets.length && !standingOriginalityPolicy && !args.originalRightsConfirmed) {
    throw new UsageError(`Originality confirmation is required before browser mutation for: ${rightsTargets.join(", ")}. Complete onboarding with declarations.originalityPolicy=all_videos_original, or confirm this run and add --confirm-original-rights.`);
  }
  const identity = await buildIdentity(identityPackage);
  const jobId = args.jobId || identity.fingerprint.slice(0, 16);
  const jobDir = path.join(args.stateRoot, jobId);
  activeLockReleases.push(acquireJobLock(path.join(args.stateRoot, ".publisher"), {
    jobId,
    packagePath: args.packagePath,
    scope: "publisher",
  }));
  activeLockReleases.push(acquireJobLock(jobDir, { jobId, packagePath: args.packagePath }));
  if (args.metadataOnly) acquireMetadataControllerLocks({ root: process.env.VIDEO_PUBLISHER_V2_PLATFORM_LOCK_ROOT })();
  if (args.metadataOnly && !fs.existsSync(path.join(jobDir, "state.json"))) throw new UsageError("--metadata-only resumes an existing job; no state found");
  const store = new JobStore(jobDir, initialState(jobId, identity, args));
  const state = await store.initialize();
  if (store.lastRecovery) {
    console.error(`[video-publisher-v2] restored corrupt job state from atomic backup; preserved=${store.lastRecovery.corruptPath}`);
  }
  if (state.fingerprint !== identity.fingerprint) throw new Error(`Job ${jobId} belongs to another package`);
  if (args.metadataOnly && args.platforms.some(platform => !state.platforms[platform]?.taskSpaceId || !state.platforms[platform]?.taskSpaceName)) throw new UsageError("--metadata-only requires the recorded task-space id and exact name");
  for (const platform of args.platforms) state.platforms[platform] ||= { status: "new", taskSpaceId: null, taskSpaceName: null, receipts: {}, verdict: null, history: [] };
  for (const platform of args.platforms) {
    const item = state.platforms[platform];
    if (!item.taskSpaceName && item.lastEvidencePath && fs.existsSync(item.lastEvidencePath)) {
      try {
        const saved = JSON.parse(fs.readFileSync(item.lastEvidencePath, "utf8"));
        const observation = saved.observation || saved;
        if (observation.taskSpace && (item.taskSpaceId == null || Number(observation.taskSpaceId) === Number(item.taskSpaceId))) {
          item.taskSpaceName = observation.taskSpace;
        }
      } catch {}
    }
    if (item.receiptTaskSpaceId != null && item.taskSpaceId != null && Number(item.receiptTaskSpaceId) !== Number(item.taskSpaceId)) {
      item.receipts = {};
      item.receiptTaskSpaceId = null;
      await store.clearReceiptCheckpoint(platform);
    }
    const checkpoint = await store.loadReceiptCheckpoint(platform, state.fingerprint, item.taskSpaceId);
    if (checkpoint) {
      // A valid atomic checkpoint is the newer mutation/recovery receipt.
      item.receipts = { ...(item.receipts || {}), ...checkpoint.receipts };
      item.receiptTaskSpaceId = checkpoint.taskSpaceId ?? item.receiptTaskSpaceId ?? item.taskSpaceId ?? null;
    }
  }
  for (const platform of args.platforms.filter(key => preflightErrors[key].length > 0)) {
    const item = state.platforms[platform];
    const observedAt = new Date().toISOString();
    const blocker = {
      code: BLOCKER.PLATFORM_REJECTED_ASSET,
      message: preflightErrors[platform].join("; "),
      retryable: false,
      requiresUser: false,
      evidence: { errors: preflightErrors[platform], media },
    };
    const observation = {
      schemaVersion: 1,
      platform,
      phase: "preflight",
      taskSpaceId: item.taskSpaceId ?? null,
      observedAt,
      finalPublishClicked: false,
      gates: {},
      blocker,
      evidence: { media },
    };
    const verdict = { platform, phase: "preflight", taskSpaceId: item.taskSpaceId ?? null, ready: false, missing: ["preflight"], blocker };
    item.status = "blocked";
    await store.record(platform, "preflight", observation, verdict);
  }
  state.status = args.inspectOnly ? "inspecting" : "running";
  await store.save();

  const runnerPath = path.resolve(process.env.VIDEO_PUBLISHER_V2_RUNNER || path.join(DIR, "run-platform.mjs"));
  let inputChannelBroken = false;
  let userControlLost = false;
  // Per-run timing ledger: every runner call and every scheduler phase gets a
  // start/end so the slowest step is visible in state.json and the summary.
  const runTimings = { runStartedAt: new Date().toISOString(), calls: [], phases: {} };
  state.timings = [...(state.timings || []).slice(-9), runTimings];
  const phaseStart = name => { runTimings.phases[name] = { startedAt: new Date().toISOString() }; };
  const phaseEnd = name => { const entry = runTimings.phases[name]; if (entry) { entry.finishedAt = new Date().toISOString(); entry.durationMs = Date.parse(entry.finishedAt) - Date.parse(entry.startedAt); } };
  async function invoke(platform, phase) {
    const startedAt = Date.now();
    try { return await invokeRunner(platform, phase); }
    finally {
      runTimings.calls.push({ platform, phase, startedAt: new Date(startedAt).toISOString(), finishedAt: new Date().toISOString(), durationMs: Date.now() - startedAt, status: state.platforms[platform]?.status || null });
    }
  }
  async function invokeRunner(platform, phase) {
    const item = state.platforms[platform];
    const previousTaskSpaceId = item.taskSpaceId;
    const runnerArgs = [runnerPath, platform, args.packagePath, phase, `${args.taskSuffix}-${jobId}`, item.taskSpaceId ? String(item.taskSpaceId) : ""];
    if (args.originalRightsConfirmed) runnerArgs.push("--confirm-original-rights");
    const execution = await runCapture(process.execPath, runnerArgs, {
      env: {
        ...process.env,
        VIDEO_PUBLISHER_V2_RECEIPTS: JSON.stringify(item.receipts || {}),
        VIDEO_PUBLISHER_V2_CHECKPOINT_PATH: store.receiptCheckpointPath(platform),
        VIDEO_PUBLISHER_V2_FINGERPRINT: state.fingerprint,
        VIDEO_PUBLISHER_V2_TASK_NAME: item.taskSpaceName || "",
        VIDEO_PUBLISHER_V2_ACCOUNT_SHOT_DIR: path.join(jobDir, "account-proof"),
        VIDEO_PUBLISHER_V2_SLOT_DIR: path.join(jobDir, "cover-slots"),
        ...(args.metadataOnly ? { VIDEO_PUBLISHER_V2_METADATA_JOB_DIR: jobDir, VIDEO_PUBLISHER_V2_METADATA_ROOT: args.stateRoot, VIDEO_PUBLISHER_V2_EXISTING_SPACE_ONLY: "1" } : {}),
      },
    });
    const observation = parseV2Result(`${execution.stdout}\n${execution.stderr}`);
    if (observation.taskSpace) item.taskSpaceName = observation.taskSpace;
    const taskSpaceChanged = previousTaskSpaceId != null && observation.taskSpaceId != null
      && Number(previousTaskSpaceId) !== Number(observation.taskSpaceId);
    const taskSpaceRecreated = observation.taskSpaceRecovery?.recreated === true;
    if (taskSpaceChanged || taskSpaceRecreated) {
      item.receipts = {};
      item.receiptTaskSpaceId = null;
      await store.clearReceiptCheckpoint(platform);
      observation.recovery = {
        ...(observation.recovery || {}),
        taskSpaceRecreated: {
          previousTaskSpaceId: observation.taskSpaceRecovery?.previousTaskSpaceId ?? previousTaskSpaceId,
          taskSpaceId: observation.taskSpaceId,
          numericIdChanged: taskSpaceChanged,
        },
      };
    }
    if (observation.receipts) {
      item.receipts = { ...(item.receipts || {}), ...observation.receipts };
      item.receiptTaskSpaceId = observation.taskSpaceId ?? item.taskSpaceId ?? null;
    }
    if (args.metadataOnly) observation.preparationMode = "metadata_only";
    const verdict = evaluateObservation(observation);
    const destination = destinationPreview(verdict);
    if (destination) item.destination = destination;
    if (verdict.blocker?.code === BLOCKER.INPUT_CHANNEL_BROKEN) inputChannelBroken = true;
    if (verdict.blocker?.code === BLOCKER.USER_CONTROL) userControlLost = true;
    item.status = classifyVerdict(verdict);
    if (observation.blocker) item.status = verdict.blocker?.requiresUser ? "blocked_user" : "blocked";
    await store.record(platform, phase, observation, compactVerdict(verdict));
    console.error(`[video-publisher-v2] ${platform} ${phase}: ${verdict.ready ? "READY" : verdict.missing.join(",") || verdict.blocker?.code || (verdict.preparationOnly ? "PREPARED_REQUIRES_FULL_VERIFICATION" : "incomplete")}`);
    return { observation, verdict };
  }

  console.error(`[video-publisher-v2] inspect parallel=${args.checkConcurrency}`);
  phaseStart("inspect");
  await runPool(runnablePlatforms, args.checkConcurrency, platform => invoke(platform, "inspect"));
  phaseEnd("inspect");
  if (args.inspectOnly) {
    state.status = runnablePlatforms.length === args.platforms.length ? "inspected" : "blocked";
    await store.save();
    await store.close();
    console.log(JSON.stringify(summary(state, args.platforms, store.statePath), null, 2));
    if (state.status === "blocked") process.exitCode = 10;
    return;
  }

  // A platform that needs the user (login, wrong profile/account) pauses only
  // itself. 2026-10-26: 视频号 AUTH_REQUIRED used to stop all four platforms and
  // cost a full restart. User control loss still stops everything (below).
  const userBlocked = runnablePlatforms.filter(platform => state.platforms[platform].status === "blocked_user");
  if (userBlocked.length) console.error(`[video-publisher-v2] paused for user only: ${userBlocked.join(",")}; continuing the others`);
  if (args.pauseAllOnUserBlock && userBlocked.length) {
    state.status = "paused_user";
    await store.save(); await store.close();
    console.log(JSON.stringify(summary(state, args.platforms, store.statePath), null, 2));
    process.exitCode = 10; return;
  }

  if (args.metadataOnly) {
    // This controller owns both locks. No upload runner is started here; native
    // browser uploads continue after the previous waiting CLI has exited.
    const platform = runnablePlatforms[0];
    const inspected = JSON.parse(fs.readFileSync(state.platforms[platform].lastEvidencePath, "utf8")).observation;
    if (!inputChannelBroken && !userControlLost && !inspected.blocker && !inspected.taskSpaceRecovery?.recreated) await invoke(platform, "metadata");
    const item = state.platforms[platform];
    state.status = "metadata_prepared";
    if (item.verdict?.blocker?.code === BLOCKER.USER_CONTROL) state.status = "paused_user";
    else if (inputChannelBroken) state.status = "blocked";
    await store.save(); await store.close();
    const result = summary(state, args.platforms, store.statePath);
    const saved = JSON.parse(fs.readFileSync(item.lastEvidencePath, "utf8")).observation;
    result.metadata = saved.metadata || { ok: false, reason: "metadata phase did not complete" };
    if (!result.metadata.ok && state.status === "metadata_prepared") {
      state.status = "metadata_incomplete";
      await store.save(); await store.close();
      result.status = state.status;
    }
    result.ready = false; // A bounded preparation entry never grants READY or submission.
    console.log(JSON.stringify(result, null, 2));
    if (!result.metadata.ok || state.status !== "metadata_prepared") process.exitCode = 10;
    return;
  }

  const ui = new SerialQueue();
  async function pauseForControlLoss() {
    if (!userControlLost) return false;
    state.status = "paused_user";
    await store.save(); await store.close();
    console.log(JSON.stringify(summary(state, args.platforms, store.statePath), null, 2));
    process.exitCode = 10;
    return true;
  }
  const quarantineTargets = inputChannelBroken ? [] : runnablePlatforms.filter(key => state.platforms[key].status === "needs_quarantine");
  for (const platform of quarantineTargets) {
    if (inputChannelBroken) break;
    await ui.enqueue(async () => {
      const result = await invoke(platform, "quarantine");
      if (!userControlLost && result.observation.quarantine?.safeToUpload) await invoke(platform, "inspect");
    });
    if (await pauseForControlLoss()) return;
  }

  const uploadTargets = inputChannelBroken ? [] : runnablePlatforms.filter(platform => state.platforms[platform].status === "needs_upload");
  console.error(`[video-publisher-v2] upload parallel=${args.uploadConcurrency}: ${uploadTargets.join(",") || "none"}`);
  phaseStart("upload");
  let uploadsRunning = true;
  const uploads = runPool(uploadTargets, args.uploadConcurrency, platform => userControlLost ? undefined : invoke(platform, "upload"))
    .finally(() => { uploadsRunning = false; });
  // Late login join: while the other uploads are still running (they gate the
  // mutation barrier anyway), re-inspect AUTH_REQUIRED platforms read-only every
  // authPollSeconds. A platform the user has logged into joins the upload phase
  // without delaying anyone; otherwise it stays blocked_user for its own rerun.
  const lateAuth = (async () => {
    const waiting = new Set(userBlocked.filter(platform => state.platforms[platform].verdict?.blocker?.code === BLOCKER.AUTH_REQUIRED));
    const joined = [];
    while (waiting.size && uploadsRunning && !userControlLost && !inputChannelBroken && args.authPollSeconds > 0) {
      await new Promise(resolve => setTimeout(resolve, args.authPollSeconds * 1000));
      if (!uploadsRunning || userControlLost || inputChannelBroken) break;
      for (const platform of [...waiting]) {
        await invoke(platform, "inspect");
        if (state.platforms[platform].status === "blocked_user") continue;
        waiting.delete(platform);
        console.error(`[video-publisher-v2] ${platform} login detected; joining upload phase`);
        if (state.platforms[platform].status === "needs_upload") joined.push(invoke(platform, "upload"));
      }
    }
    await Promise.all(joined);
  })();
  await Promise.all([uploads, lateAuth]);
  phaseEnd("upload");
  if (await pauseForControlLoss()) return;

  // No UI mutation starts until every Ego upload process has exited. Live testing proved
  // that overlap freezes the shared browser input channel even across task spaces.
  // A broken browser input channel is also a phase-wide circuit breaker: wait for the
  // parallel runners, skip every later mutation, and let final read-only verification
  // record whatever page truth Ego exposes after restart.
  const mutationTargets = inputChannelBroken ? [] : runnablePlatforms.filter(platform => state.platforms[platform].status === "needs_mutation");
  console.error(`[video-publisher-v2] UI serial: ${mutationTargets.join(",") || "none"}${inputChannelBroken ? " (input channel broken)" : ""}`);
  phaseStart("mutate");
  for (const platform of mutationTargets) {
    if (inputChannelBroken) break;
    await ui.enqueue(() => invoke(platform, "mutate"));
    if (await pauseForControlLoss()) return;
  }
  await ui.idle();
  phaseEnd("mutate");

  console.error(`[video-publisher-v2] final verify parallel=${args.checkConcurrency}`);
  phaseStart("verify");
  await runPool(runnablePlatforms.filter(platform => state.platforms[platform].status !== "blocked_user"), args.checkConcurrency, platform => invoke(platform, "verify"));
  phaseEnd("verify");
  if (await pauseForControlLoss()) return;

  // One targeted retry is allowed only for an idempotent mutation whose fresh verifier
  // returned STATE_AMBIGUOUS. Typed action/auth/risk-control failures are never looped.
  const retryTargets = (inputChannelBroken ? [] : runnablePlatforms).filter(platform => {
    const verdict = state.platforms[platform].verdict;
    return state.platforms[platform].status === "needs_mutation" && verdict?.blocker?.code === BLOCKER.STATE_AMBIGUOUS;
  });
  for (const platform of retryTargets) {
    if (inputChannelBroken) break;
    await ui.enqueue(() => invoke(platform, "mutate"));
    if (await pauseForControlLoss()) return;
  }
  await ui.idle();
  if (retryTargets.length) await runPool(retryTargets, args.checkConcurrency, platform => invoke(platform, "verify"));

  const complete = args.platforms.every(platform => state.platforms[platform].verdict?.ready === true);
  const stillUser = args.platforms.some(platform => state.platforms[platform].status === "blocked_user");
  state.status = complete ? "ready" : stillUser ? "paused_user" : "blocked";
  runTimings.runFinishedAt = new Date().toISOString();
  runTimings.runDurationMs = Date.parse(runTimings.runFinishedAt) - Date.parse(runTimings.runStartedAt);
  const slowest = [...runTimings.calls].sort((left, right) => right.durationMs - left.durationMs)[0] || null;
  runTimings.slowest = slowest;
  if (slowest) console.error(`[video-publisher-v2] timing: run ${Math.round(runTimings.runDurationMs / 1000)}s; slowest ${slowest.platform} ${slowest.phase} ${Math.round(slowest.durationMs / 1000)}s; phases ${Object.entries(runTimings.phases).map(([name, entry]) => `${name}=${Math.round((entry.durationMs || 0) / 1000)}s`).join(" ")}`);
  await store.save(); await store.close();
  console.log(JSON.stringify(summary(state, args.platforms, store.statePath), null, 2));
  if (!complete) process.exitCode = 10;
}

// Final-preview block: "将发到：<账号> / 昵称 / ID" plus the header screenshot
// captured right after the last successful account check.
function destinationPreview(verdict) {
  const evidence = verdict?.gates?.targetAccount?.evidence;
  if (!evidence) return null;
  const binding = evidence.binding || null;
  return {
    account: binding?.account || null,
    label: binding?.label || null,
    egoProfileId: binding?.egoProfileId || null,
    observedProfileId: evidence.profileId || null,
    expected: evidence.expected || null,
    actual: evidence.actual || null,
    verified: verdict.gates.targetAccount.ok === true,
    observedAt: evidence.observedAt || null,
    screenshotPath: evidence.screenshotPath || null,
  };
}

function summary(state, platforms, statePath) {
  return {
    schemaVersion: 3,
    jobId: state.jobId,
    status: state.status,
    ready: platforms.every(platform => state.platforms[platform].verdict?.ready === true),
    statePath,
    scheduler: state.scheduler,
    timings: (state.timings || []).at(-1) ? { phases: state.timings.at(-1).phases, slowest: state.timings.at(-1).slowest || null, runDurationMs: state.timings.at(-1).runDurationMs ?? null } : null,
    platforms: Object.fromEntries(platforms.map(platform => {
      const item = state.platforms[platform];
      return [platform, { status: item.status, taskSpaceId: item.taskSpaceId, ready: item.verdict?.ready === true, missing: item.verdict?.missing || [], blocker: item.verdict?.blocker || null, evidencePath: item.lastEvidencePath || null, destination: item.destination || null }];
    })),
  };
}

main()
  .catch(error => {
    console.error(`[video-publisher-v2] fatal: ${String(error?.stack || error)}`);
    process.exitCode = error instanceof UsageError ? 2 : 1;
  })
  .finally(() => {
    for (const release of activeLockReleases.reverse()) release();
  });
