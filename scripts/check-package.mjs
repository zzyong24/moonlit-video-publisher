#!/usr/bin/env node
import { loadConfig } from "./lib/config.mjs";
import {
  bindPublishAccount,
  coverAssetsForPlatform,
  coverUploadEnabled,
  readPackage,
  validateBilibiliPackage,
  validateDouyinPackage,
  validateWechatChannelsPackage,
  validateXiaohongshuPackage,
} from "./lib/content-package.mjs";
import { inspectMediaFile, validateMediaForPlatform } from "./lib/media.mjs";

const validators = {
  xiaohongshu: validateXiaohongshuPackage,
  douyin: validateDouyinPackage,
  bilibili: validateBilibiliPackage,
  wechat_channels: validateWechatChannelsPackage,
};

const HELP = "Usage: check-package.mjs <xiaohongshu|douyin|bilibili|wechat_channels> <package.json>\nAccount: package field account=dahao(大号, default)|xiaohao(小号, Douyin/Xiaohongshu only) resolves through accounts.json (账号→Ego Profile→平台→昵称/ID); a missing mapping fails. Douyin requires expectedAccounts.douyin={name,douyinId}; missing identity fails before browser work. This preflight does not verify the live login.\nLegacy packages must be versioned copies; never rewrite historical packages/job fingerprints. Bilibili/WeChat Channels still require manual account verification.";
const [platform, packagePath] = process.argv.slice(2);
if (platform === "--help" || platform === "-h") { console.log(HELP); process.exit(0); }

if (!validators[platform] || !packagePath) {
  console.error(HELP);
  process.exit(2);
}

loadConfig({ requireOnboarded: true });
const pkg = readPackage(packagePath);
const accountErrors = bindPublishAccount(pkg, platform);
const media = inspectMediaFile(pkg.videoPath);
const errors = [
  ...accountErrors,
  ...(accountErrors.length ? [] : validators[platform](pkg)),
  ...validateMediaForPlatform(pkg, platform, media),
];
const coverAssets = coverAssetsForPlatform(pkg, platform);

const result = {
  platform,
  ok: errors.length === 0,
  title: pkg.title,
  media,
  douyinTopics: platform === "douyin" ? pkg.douyinTopics : undefined,
  account: pkg.accountBinding?.[platform] || null,
  expectedAccount: pkg.expectedAccounts?.[platform],
  cover: {
    uploadCustomCover: coverUploadEnabled(pkg.cover || {}),
    assets: coverAssets,
  },
  errors,
};

console.log(JSON.stringify(result, null, 2));
if (errors.length) process.exit(1);
