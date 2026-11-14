import { evaluateAccountProof, ACCOUNT_GATED_PLATFORMS } from "./expected-account.mjs";
export const PLATFORMS = ["xiaohongshu", "douyin", "bilibili", "wechat_channels"];

export const BLOCKER = Object.freeze({
  AUTH_REQUIRED: "AUTH_REQUIRED",
  ACCOUNT_UNVERIFIED: "ACCOUNT_UNVERIFIED",
  ACCOUNT_MISMATCH: "ACCOUNT_MISMATCH",
  PROFILE_MISMATCH: "PROFILE_MISMATCH",
  PROFILE_UNVERIFIABLE: "PROFILE_UNVERIFIABLE",
  ACCOUNT_BINDING_MISSING: "ACCOUNT_BINDING_MISSING",
  USER_CONTROL: "USER_CONTROL",
  FOREIGN_DRAFT: "FOREIGN_DRAFT",
  UPLOAD_NOT_STARTED: "UPLOAD_NOT_STARTED",
  UPLOAD_STALLED: "UPLOAD_STALLED",
  RISK_CONTROL: "RISK_CONTROL",
  SELECTOR_DRIFT: "SELECTOR_DRIFT",
  STATE_AMBIGUOUS: "STATE_AMBIGUOUS",
  INPUT_CHANNEL_BROKEN: "INPUT_CHANNEL_BROKEN",
  PLATFORM_REJECTED_ASSET: "PLATFORM_REJECTED_ASSET",
  ACTION_FAILED: "ACTION_FAILED",
});

const REQUIRED_GATES = Object.freeze({
  xiaohongshu: [
    "targetAccount", "authenticated", "draftIdentity", "video", "title", "tags", "original",
    "cover", "noBlockingDialog", "finalButton", "safety", "publishReview",
  ],
  douyin: [
    "targetAccount", "authenticated", "draftIdentity", "video", "title", "description", "tags",
    "settings", "cover", "noBlockingDialog", "finalButton", "safety", "publishReview",
  ],
  bilibili: [
    "authenticated", "draftIdentity", "video", "title", "description", "tags",
    "original", "cover", "noBlockingDialog", "finalButton", "safety", "publishReview",
  ],
  wechat_channels: [
    "authenticated", "draftIdentity", "video", "description", "shortTitle", "original",
    "contentDeclaration", "cover", "noBlockingDialog", "finalButton", "safety", "publishReview",
  ],
});

export function gate(ok, evidence = {}, extra = {}) {
  return { ok: ok === true, evidence, ...extra };
}

export function requiredGates(platform) {
  const gates = REQUIRED_GATES[platform];
  if (!gates) throw new Error(`Unsupported platform: ${platform}`);
  return [...gates];
}

function normalizedBlocker(blocker) {
  if (!blocker) return null;
  if (typeof blocker === "string") {
    return { code: BLOCKER.ACTION_FAILED, message: blocker, retryable: false, requiresUser: false };
  }
  return {
    code: blocker.code || BLOCKER.ACTION_FAILED,
    message: blocker.message || blocker.code || "platform action failed",
    retryable: blocker.retryable === true,
    requiresUser: blocker.requiresUser === true,
    evidence: blocker.evidence || null,
  };
}

function missingGateBlocker(observation, missing) {
  const gates = observation.gates || {};
  if (gates.authenticated?.ok === false) {
    return { code: BLOCKER.AUTH_REQUIRED, message: "平台登录态无效或遇到安全验证", retryable: false, requiresUser: true };
  }
  if (ACCOUNT_GATED_PLATFORMS.includes(observation.platform) && gates.targetAccount?.ok !== true) {
    const reason = gates.targetAccount?.evidence?.reason;
    const code = reason === "mismatch" ? BLOCKER.ACCOUNT_MISMATCH : reason === "profile_mismatch" ? BLOCKER.PROFILE_MISMATCH : BLOCKER.ACCOUNT_UNVERIFIED;
    return { code, message: `当前${observation.platform === "douyin" ? "抖音" : "小红书"}账号未通过发布包指定账号核验`, retryable: false, requiresUser: true };
  }
  if (gates.draftIdentity?.ok === false && gates.draftIdentity?.evidence?.foreign === true) {
    return { code: BLOCKER.FOREIGN_DRAFT, message: "当前编辑器属于其他视频草稿", retryable: observation.platform === "bilibili", requiresUser: false };
  }
  if (gates.video?.evidence?.uploading === true) {
    return { code: BLOCKER.UPLOAD_STALLED, message: "视频仍在上传或处理中", retryable: true, requiresUser: false };
  }
  return {
    code: BLOCKER.STATE_AMBIGUOUS,
    message: `以下发布条件没有被页面证据确认: ${missing.join(", ")}`,
    retryable: true,
    requiresUser: false,
    evidence: Object.fromEntries(missing.map(name => [name, gates[name] || null])),
  };
}

export function evaluateObservation(observation) {
  if (!observation || !PLATFORMS.includes(observation.platform)) {
    throw new Error("Invalid platform observation");
  }
  const required = requiredGates(observation.platform);
  const gates = { ...(observation.gates || {}) };
  if (ACCOUNT_GATED_PLATFORMS.includes(observation.platform)) {
    const platform = observation.platform;
    const account = gates.targetAccount;
    const binding = account?.evidence?.binding;
    const rechecked = evaluateAccountProof(platform, { expectedAccounts: { [platform]: account?.evidence?.expected }, ...(binding ? { accountBinding: { [platform]: binding } } : {}) }, account?.evidence, { id: observation.taskSpaceId, name: observation.taskSpace });
    if (account?.ok !== true || !rechecked.ok) gates.targetAccount = { ok: false, evidence: rechecked.evidence };
  }
  const safetyEvidence = gates.safety?.evidence || {};
  const safetyVerified = gates.safety?.ok === true
    && safetyEvidence.finalPublishClicked === false
    && safetyEvidence.guardArmed === true
    && safetyEvidence.blockedAttempts === 0;
  if (!safetyVerified) {
    gates.safety = {
      ...(gates.safety || {}),
      ok: false,
      evidence: safetyEvidence,
    };
  }
  const missing = required.filter(name => gates[name]?.ok !== true);
  const actionBlocker = normalizedBlocker(observation.blocker);
  const blocker = actionBlocker || (missing.length ? missingGateBlocker({ ...observation, gates }, missing) : null);
  const preparationOnly = observation.phase === "metadata" || observation.preparationMode === "metadata_only";
  const ready = missing.length === 0 && blocker === null && !preparationOnly;
  return {
    schemaVersion: 1,
    platform: observation.platform,
    taskSpaceId: observation.taskSpaceId ?? null,
    phase: observation.phase || "inspect",
    observedAt: observation.observedAt || new Date().toISOString(),
    ready,
    ...(preparationOnly ? { preparationOnly: true, requiresFullVerification: true } : {}),
    required,
    missing,
    blocker,
    gates,
    evidence: observation.evidence || {},
  };
}

export function classifyVerdict(verdict) {
  if (verdict.ready) return "ready";
  if (verdict.preparationOnly && !verdict.blocker) return "needs_verification";
  if ([BLOCKER.AUTH_REQUIRED, BLOCKER.USER_CONTROL, BLOCKER.ACCOUNT_MISMATCH, BLOCKER.ACCOUNT_UNVERIFIED, BLOCKER.PROFILE_MISMATCH, BLOCKER.PROFILE_UNVERIFIABLE, BLOCKER.ACCOUNT_BINDING_MISSING].includes(verdict.blocker?.code)) return "blocked_user";
  if (verdict.blocker?.code === BLOCKER.INPUT_CHANNEL_BROKEN) return "blocked";
  if (verdict.blocker?.code === BLOCKER.FOREIGN_DRAFT) {
    return verdict.platform === "bilibili" ? "needs_quarantine" : "blocked_foreign_draft";
  }
  if (verdict.gates.video?.ok !== true) return "needs_upload";
  if (verdict.missing?.length === 1 && verdict.missing[0] === "publishReview") return "needs_review";
  return "needs_mutation";
}

export function compactVerdict(verdict) {
  return {
    platform: verdict.platform,
    phase: verdict.phase,
    taskSpaceId: verdict.taskSpaceId,
    ready: verdict.ready,
    ...(verdict.preparationOnly ? { preparationOnly: true, requiresFullVerification: true } : {}),
    missing: verdict.missing,
    blocker: verdict.blocker,
  };
}
