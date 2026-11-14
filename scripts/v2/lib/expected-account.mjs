// Destination-account identity gate shared by the Douyin and Xiaohongshu runners.
// Evidence must be a fresh (<=15s), same-task-space, scoped creator-home read of
// both display name and stable account ID. When the package carries an account
// binding (账号 → Ego Profile), the observed task-space Profile must match too.
export const ACCOUNT_PROOF_MAX_AGE_MS = 15000;
export const ACCOUNT_GATED_PLATFORMS = ['douyin', 'xiaohongshu'];
export const ACCOUNT_ID_FIELDS = { douyin: 'douyinId', xiaohongshu: 'xhsId', bilibili: 'uid', wechat_channels: 'finderId' };
const ACCOUNT_HOME_URLS = {
  douyin: /^https:\/\/creator\.douyin\.com\/creator-micro\/home(?:[?#]|$)/,
  xiaohongshu: /^https:\/\/creator\.xiaohongshu\.com\/new\/home(?:[?#/]|$)/,
};
const PLATFORM_NAMES = { douyin: '抖音', xiaohongshu: '小红书', bilibili: 'B站', wechat_channels: '视频号' };

export function validateExpectedAccount(pkg, platform) {
  const idField = ACCOUNT_ID_FIELDS[platform];
  if (!idField) return [`unsupported account platform ${platform}`];
  const expected = pkg?.expectedAccounts?.[platform];
  if (!expected || typeof expected !== 'object' || Array.isArray(expected)) return [`expectedAccounts.${platform} with name and ${idField} is required`];
  const errors = [];
  for (const field of ['name', idField]) {
    if (typeof expected[field] !== 'string' || !expected[field].trim()) errors.push(`expectedAccounts.${platform}.${field} is required as a nonempty string`);
  }
  return errors;
}

export function evaluateAccountProof(platform, pkg, proof = {}, task) {
  const idField = ACCOUNT_ID_FIELDS[platform];
  const invalidExpected = validateExpectedAccount(pkg, platform);
  const expected = invalidExpected.length ? null : { name: pkg.expectedAccounts[platform].name.trim(), [idField]: pkg.expectedAccounts[platform][idField].trim() };
  const binding = pkg?.accountBinding?.[platform] || null;
  const evidence = { ...proof, expected, ...(binding ? { binding } : {}) };
  const age = Date.now() - Date.parse(proof?.observedAt || '');
  const homeUrl = ACCOUNT_HOME_URLS[platform];
  const valid = !invalidExpected.length && Boolean(homeUrl) && proof?.method === 'creator-home-dom'
    && homeUrl.test(proof.sourceUrl || '')
    && Number.isFinite(age) && age >= 0 && age <= ACCOUNT_PROOF_MAX_AGE_MS
    && Number(proof.taskSpaceId) === Number(task?.id) && proof.taskSpaceName === task?.name
    && typeof proof.actual?.name === 'string' && Boolean(proof.actual.name.trim())
    && typeof proof.actual?.[idField] === 'string' && Boolean(proof.actual[idField].trim())
    && proof.scopeConfirmed === true;
  const label = PLATFORM_NAMES[platform] || platform;
  if (!valid) return { ok: false, evidence: { ...evidence, reason: 'unverified', errors: invalidExpected }, blocker: { code: 'ACCOUNT_UNVERIFIED', message: `${label}目标账号缺少本任务空间内的鲜活实名与账号ID证据`, retryable: false, requiresUser: true } };
  if (binding) {
    const profileOk = typeof proof.profileId === 'string' && proof.profileId === binding.egoProfileId;
    if (!profileOk) return { ok: false, evidence: { ...evidence, reason: 'profile_mismatch' }, blocker: { code: 'PROFILE_MISMATCH', message: `${label}任务空间不属于${binding.label || binding.account}的 Ego Profile（预期 ${binding.egoProfileId}，实际 ${proof.profileId ?? '未知'}）；禁止上传和准备`, retryable: false, requiresUser: true } };
  }
  const matched = proof.actual.name.trim() === expected.name && proof.actual[idField].trim() === expected[idField];
  if (!matched) return { ok: false, evidence: { ...evidence, reason: 'mismatch' }, blocker: { code: 'ACCOUNT_MISMATCH', message: `当前${label}账号与发布包指定账号不一致；禁止上传和准备`, retryable: false, requiresUser: true } };
  return { ok: true, evidence };
}

// Backward-compatible Douyin wrappers (used by the Douyin runner and its tests).
export function validateExpectedDouyinAccount(pkg) {
  const expected = pkg?.expectedAccounts?.douyin;
  if (!expected || typeof expected !== 'object' || Array.isArray(expected)) return ['expectedAccounts.douyin with name and douyinId is required'];
  return validateExpectedAccount(pkg, 'douyin');
}

export function evaluateDouyinAccountProof(pkg, proof = {}, task) {
  return evaluateAccountProof('douyin', pkg, proof, task);
}

export function validateExpectedXiaohongshuAccount(pkg) {
  return validateExpectedAccount(pkg, 'xiaohongshu');
}

export function evaluateXiaohongshuAccountProof(pkg, proof = {}, task) {
  return evaluateAccountProof('xiaohongshu', pkg, proof, task);
}
