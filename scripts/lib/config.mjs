import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const CONFIG_SCHEMA_VERSION = 2;
const LEGACY_CONFIG_SCHEMA_VERSION = 1;
export const CONFIG_PLATFORMS = ["xiaohongshu", "douyin", "bilibili", "wechat_channels"];
export const ORIGINALITY_POLICIES = ["ask_each_run", "all_videos_original"];

function cleanList(values = []) {
  const seen = new Set();
  const result = [];
  for (const value of values) {
    const item = String(value || "").trim().replace(/^#+\s*/, "").trim();
    if (!item || seen.has(item)) continue;
    seen.add(item);
    result.push(item);
  }
  return result;
}

export function resolveConfigPath() {
  if (process.env.VIDEO_PUBLISHER_CONFIG) return path.resolve(process.env.VIDEO_PUBLISHER_CONFIG);
  const configHome = process.env.XDG_CONFIG_HOME
    ? path.resolve(process.env.XDG_CONFIG_HOME)
    : path.join(os.homedir(), ".config");
  return path.join(configHome, "video-publisher", "config.json");
}

export function defaultConfig() {
  return {
    schemaVersion: CONFIG_SCHEMA_VERSION,
    onboarding: {
      completed: false,
      completedAt: "",
      updatedAt: "",
    },
    locale: "zh-CN",
    sourceDirectory: path.join(os.homedir(), "Movies"),
    availablePlatforms: [],
    defaultPlatforms: [],
    contentProfile: {
      copyStyle: "clear, conversational, specific, non-hype",
      recurringTags: [],
    },
    declarations: {
      originalityPolicy: "ask_each_run",
    },
    platforms: {
      douyin: { defaultTopics: [] },
      bilibili: { allowedAutoTags: [] },
    },
    execution: {
      checkConcurrency: 4,
      uploadConcurrency: 4,
    },
    cover: {
      uploadExistingByDefault: false,
    },
  };
}

export function normalizeConfig(raw = {}) {
  const fallback = defaultConfig();
  const rawSchemaVersion = Number(raw.schemaVersion ?? fallback.schemaVersion);
  const defaultPlatforms = Array.isArray(raw.defaultPlatforms)
    ? cleanList(raw.defaultPlatforms)
    : fallback.defaultPlatforms;
  const availablePlatforms = Array.isArray(raw.availablePlatforms)
    ? cleanList(raw.availablePlatforms)
    : rawSchemaVersion === LEGACY_CONFIG_SCHEMA_VERSION && Array.isArray(raw.defaultPlatforms)
      ? [...defaultPlatforms]
      : Object.keys(raw).length === 0
        ? fallback.availablePlatforms
        : [];
  return {
    schemaVersion: rawSchemaVersion === LEGACY_CONFIG_SCHEMA_VERSION
      ? CONFIG_SCHEMA_VERSION
      : rawSchemaVersion,
    onboarding: {
      completed: raw.onboarding?.completed === true,
      completedAt: String(raw.onboarding?.completedAt || ""),
      updatedAt: String(raw.onboarding?.updatedAt || ""),
    },
    locale: String(raw.locale || fallback.locale).trim(),
    sourceDirectory: String(raw.sourceDirectory || fallback.sourceDirectory).trim(),
    availablePlatforms,
    defaultPlatforms,
    contentProfile: {
      copyStyle: String(raw.contentProfile?.copyStyle || fallback.contentProfile.copyStyle).trim(),
      recurringTags: cleanList(raw.contentProfile?.recurringTags || []),
    },
    declarations: {
      originalityPolicy: String(raw.declarations?.originalityPolicy || fallback.declarations.originalityPolicy).trim(),
    },
    platforms: {
      douyin: {
        defaultTopics: cleanList(raw.platforms?.douyin?.defaultTopics || []),
      },
      bilibili: {
        allowedAutoTags: cleanList(raw.platforms?.bilibili?.allowedAutoTags || []),
      },
    },
    execution: {
      checkConcurrency: Number(raw.execution?.checkConcurrency ?? fallback.execution.checkConcurrency),
      uploadConcurrency: Number(raw.execution?.uploadConcurrency ?? fallback.execution.uploadConcurrency),
    },
    cover: {
      uploadExistingByDefault: raw.cover?.uploadExistingByDefault === true,
    },
  };
}

export function validateConfig(config) {
  const errors = [];
  if (config.schemaVersion !== CONFIG_SCHEMA_VERSION) {
    errors.push(`schemaVersion must be ${CONFIG_SCHEMA_VERSION}`);
  }
  if (!config.locale) errors.push("locale is required");
  if (!path.isAbsolute(config.sourceDirectory)) errors.push("sourceDirectory must be an absolute path");
  if (!config.availablePlatforms.length) errors.push("availablePlatforms must not be empty");
  const unsupportedAvailable = config.availablePlatforms.filter(platform => !CONFIG_PLATFORMS.includes(platform));
  if (unsupportedAvailable.length) errors.push(`unsupported availablePlatforms: ${unsupportedAvailable.join(", ")}`);
  if (!config.defaultPlatforms.length) errors.push("defaultPlatforms must not be empty");
  const unsupported = config.defaultPlatforms.filter(platform => !CONFIG_PLATFORMS.includes(platform));
  if (unsupported.length) errors.push(`unsupported defaultPlatforms: ${unsupported.join(", ")}`);
  const unavailableDefaults = config.defaultPlatforms.filter(platform => !config.availablePlatforms.includes(platform));
  if (unavailableDefaults.length) {
    errors.push(`defaultPlatforms must be a subset of availablePlatforms: ${unavailableDefaults.join(", ")}`);
  }
  if (config.platforms.douyin.defaultTopics.length > 5) {
    errors.push("platforms.douyin.defaultTopics supports at most 5 topics");
  }
  if (!ORIGINALITY_POLICIES.includes(config.declarations.originalityPolicy)) {
    errors.push(`declarations.originalityPolicy must be one of: ${ORIGINALITY_POLICIES.join(", ")}`);
  }
  for (const key of ["checkConcurrency", "uploadConcurrency"]) {
    const value = config.execution[key];
    if (!Number.isInteger(value) || value < 1) errors.push(`execution.${key} must be a positive integer`);
  }
  return errors;
}

export function configStatus(configPath = resolveConfigPath()) {
  const absolutePath = path.resolve(configPath);
  const exists = fs.existsSync(absolutePath);
  let raw = {};
  let parseError = "";
  if (exists) {
    try {
      const text = fs.readFileSync(absolutePath, "utf8");
      raw = text.trim() ? JSON.parse(text) : {};
    } catch (error) {
      parseError = String(error?.message || error);
    }
  }
  const empty = !raw || typeof raw !== "object" || Array.isArray(raw) || Object.keys(raw).length === 0;
  const config = normalizeConfig(empty ? {} : raw);
  const errors = [...(parseError ? [`invalid JSON: ${parseError}`] : []), ...validateConfig(config)];
  const warnings = [];
  if (path.isAbsolute(config.sourceDirectory)) {
    if (!fs.existsSync(config.sourceDirectory)) warnings.push(`sourceDirectory does not exist: ${config.sourceDirectory}`);
    else if (!fs.statSync(config.sourceDirectory).isDirectory()) warnings.push(`sourceDirectory is not a directory: ${config.sourceDirectory}`);
  }
  return {
    path: absolutePath,
    exists,
    empty,
    onboardingRequired: !exists || empty || config.onboarding.completed !== true || errors.length > 0,
    errors,
    warnings,
    config,
  };
}

export function loadConfig({ configPath = resolveConfigPath(), requireOnboarded = false } = {}) {
  const status = configStatus(configPath);
  if (requireOnboarded && status.onboardingRequired) {
    const detail = status.errors.length ? ` ${status.errors.join("; ")}` : "";
    throw new Error(`Video Publisher onboarding is incomplete. Run: node scripts/config.mjs status.${detail}`);
  }
  return status.config;
}

export function createOnboardedConfig(input = {}) {
  const now = new Date().toISOString();
  const config = normalizeConfig({
    schemaVersion: CONFIG_SCHEMA_VERSION,
    onboarding: {
      completed: true,
      completedAt: input.completedAt || now,
      updatedAt: now,
    },
    locale: input.locale,
    sourceDirectory: input.sourceDirectory,
    availablePlatforms: input.availablePlatforms,
    defaultPlatforms: input.defaultPlatforms,
    contentProfile: input.contentProfile,
    declarations: input.declarations,
    platforms: input.platforms,
    execution: input.execution,
    cover: input.cover,
  });
  const errors = validateConfig(config);
  if (errors.length) throw new Error(errors.join("; "));
  return config;
}

export function writeConfig(config, configPath = resolveConfigPath()) {
  const normalized = normalizeConfig(config);
  const errors = validateConfig(normalized);
  if (normalized.onboarding.completed !== true) errors.push("onboarding.completed must be true");
  if (errors.length) throw new Error(errors.join("; "));
  const absolutePath = path.resolve(configPath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  const temporaryPath = `${absolutePath}.tmp-${process.pid}`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(normalized, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temporaryPath, absolutePath);
  fs.chmodSync(absolutePath, 0o600);
  return absolutePath;
}

// ---------------------------------------------------------------------------
// Publishing accounts: 账号 → Ego Lite Profile → 平台 → 预期昵称/账号ID
// (月明 2026-10-21). Separate per-user file next to config.json; it only holds
// identity expectations and Profile ids, never cookies, tokens or login state.
// Fail closed: a missing file, account, Profile id or platform entry is an error.
// ---------------------------------------------------------------------------
export const ACCOUNTS_SCHEMA_VERSION = 1;
export const DEFAULT_ACCOUNT = "dahao";
export const ACCOUNT_KEYS = ["dahao", "xiaohao"];
export const ACCOUNT_LABELS = { dahao: "大号", xiaohao: "小号" };
// 小号 may only publish to these platforms; any other platform is a hard error.
export const XIAOHAO_PLATFORMS = ["douyin", "xiaohongshu"];
const ACCOUNT_ALIASES = { dahao: "dahao", "大号": "dahao", main: "dahao", xiaohao: "xiaohao", "小号": "xiaohao", secondary: "xiaohao" };

export class AccountConfigError extends Error {
  constructor(code, message, evidence = null) {
    super(message);
    this.code = code;
    this.evidence = evidence;
  }
}

export function resolveAccountsPath(configPath = resolveConfigPath()) {
  if (process.env.VIDEO_PUBLISHER_ACCOUNTS) return path.resolve(process.env.VIDEO_PUBLISHER_ACCOUNTS);
  return path.join(path.dirname(configPath), "accounts.json");
}

export function normalizeAccountKey(value) {
  if (value === undefined || value === null || String(value).trim() === "") return DEFAULT_ACCOUNT;
  const key = ACCOUNT_ALIASES[String(value).trim().toLowerCase()] || ACCOUNT_ALIASES[String(value).trim()];
  if (!key) throw new AccountConfigError("ACCOUNT_UNKNOWN", `未知发布账号 "${value}"；只能是 大号(dahao) 或 小号(xiaohao)`);
  return key;
}

export function validateAccountsConfig(raw) {
  const errors = [];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return ["accounts config must be a JSON object"];
  if (Number(raw.schemaVersion) !== ACCOUNTS_SCHEMA_VERSION) errors.push(`accounts schemaVersion must be ${ACCOUNTS_SCHEMA_VERSION}`);
  if (raw.defaultAccount !== undefined && raw.defaultAccount !== DEFAULT_ACCOUNT) errors.push(`defaultAccount must be "${DEFAULT_ACCOUNT}" (大号); 小号 is used only when explicitly requested`);
  const accounts = raw.accounts;
  if (!accounts || typeof accounts !== "object" || Array.isArray(accounts)) return [...errors, "accounts must be an object keyed by dahao/xiaohao"];
  for (const key of Object.keys(accounts)) {
    if (!ACCOUNT_KEYS.includes(key)) { errors.push(`unknown account key "${key}"; use dahao or xiaohao`); continue; }
    const account = accounts[key];
    if (!account || typeof account !== "object") { errors.push(`accounts.${key} must be an object`); continue; }
    if (typeof account.egoProfileId !== "string" || !account.egoProfileId.trim()) errors.push(`accounts.${key}.egoProfileId is required (Ego Lite Profile id such as "Default" or "Profile 1", not the display name)`);
    const platforms = account.platforms;
    if (!platforms || typeof platforms !== "object" || Array.isArray(platforms)) { errors.push(`accounts.${key}.platforms must be an object`); continue; }
    for (const [platform, identity] of Object.entries(platforms)) {
      if (!CONFIG_PLATFORMS.includes(platform)) { errors.push(`accounts.${key}.platforms.${platform} is not a supported platform`); continue; }
      if (key === "xiaohao" && !XIAOHAO_PLATFORMS.includes(platform)) errors.push(`accounts.xiaohao.platforms.${platform} is not allowed; 小号 only publishes to ${XIAOHAO_PLATFORMS.join("/")}`);
      for (const field of ["name", "id"]) {
        if (typeof identity?.[field] !== "string" || !identity[field].trim()) errors.push(`accounts.${key}.platforms.${platform}.${field} is required as a nonempty string`);
      }
    }
  }
  if (accounts.dahao && accounts.xiaohao && String(accounts.dahao.egoProfileId).trim() === String(accounts.xiaohao.egoProfileId).trim()) {
    errors.push("dahao and xiaohao must use different Ego Lite Profiles (same Profile = shared login)");
  }
  return errors;
}

export function loadAccounts({ accountsPath, configPath = resolveConfigPath() } = {}) {
  const file = accountsPath || resolveAccountsPath(configPath);
  if (!fs.existsSync(file)) throw new AccountConfigError("ACCOUNT_MAPPING_MISSING", `发布账号映射文件不存在：${file}（见 assets/accounts.example.json）`);
  let raw;
  try { raw = JSON.parse(fs.readFileSync(file, "utf8")); }
  catch (error) { throw new AccountConfigError("ACCOUNT_MAPPING_INVALID", `发布账号映射文件无法解析：${file}: ${error.message}`); }
  const errors = validateAccountsConfig(raw);
  if (errors.length) throw new AccountConfigError("ACCOUNT_MAPPING_INVALID", `发布账号映射无效：${errors.join("; ")}`);
  return { path: file, ...raw };
}

// Resolve the one destination for (account, platform). Throws AccountConfigError.
export function resolvePublishAccount(accounts, requestedAccount, platform) {
  const account = normalizeAccountKey(requestedAccount);
  if (!CONFIG_PLATFORMS.includes(platform)) throw new AccountConfigError("ACCOUNT_PLATFORM_UNSUPPORTED", `不支持的平台 ${platform}`);
  if (account === "xiaohao" && !XIAOHAO_PLATFORMS.includes(platform)) {
    throw new AccountConfigError("ACCOUNT_PLATFORM_UNSUPPORTED", `小号目前只能发 抖音/小红书，不能发 ${platform}；已停止`, { account, platform });
  }
  const entry = accounts?.accounts?.[account];
  if (!entry) throw new AccountConfigError("ACCOUNT_MAPPING_MISSING", `账号映射里没有 ${ACCOUNT_LABELS[account]}(${account})`, { account, platform });
  const egoProfileId = String(entry.egoProfileId || "").trim();
  if (!egoProfileId) throw new AccountConfigError("ACCOUNT_MAPPING_MISSING", `${ACCOUNT_LABELS[account]} 没有配置 egoProfileId`, { account, platform });
  const identity = entry.platforms?.[platform];
  if (!identity || !String(identity.name || "").trim() || !String(identity.id || "").trim()) {
    throw new AccountConfigError("ACCOUNT_MAPPING_MISSING", `${ACCOUNT_LABELS[account]} 在 ${platform} 上没有预期昵称/账号ID 映射`, { account, platform });
  }
  return {
    account,
    label: ACCOUNT_LABELS[account],
    egoProfileId,
    platform,
    expected: { name: String(identity.name).trim(), id: String(identity.id).trim() },
  };
}
