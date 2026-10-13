import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  coverAssetsForPlatform,
  readPackage,
  validateCoverPackage,
  validateBilibiliPackage,
  validateDouyinPackage,
  validateWechatChannelsPackage,
  validateXiaohongshuPackage,
} from "../lib/content-package.mjs";
import { defaultConfig, normalizeConfig } from "../lib/config.mjs";
import {
  DOUYIN_DURATION_CONTAINER_TOLERANCE_SECONDS,
  DOUYIN_MAX_DURATION_SECONDS,
  inspectMediaFile,
  readIsoBmffDuration,
  validateMediaForPlatform,
} from "../lib/media.mjs";

async function withTempDir(callback) {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "video-publisher-package-test-"));
  try {
    await callback(root);
  } finally {
    await fs.promises.rm(root, { recursive: true, force: true });
  }
}

function pngHeader(width, height) {
  const buffer = Buffer.alloc(24);
  buffer[0] = 0x89;
  buffer.write("PNG", 1, "ascii");
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  return buffer;
}

function box(type, payload) {
  const buffer = Buffer.alloc(8 + payload.length);
  buffer.writeUInt32BE(buffer.length, 0);
  buffer.write(type, 4, "ascii");
  payload.copy(buffer, 8);
  return buffer;
}

function mp4WithDuration(durationSeconds, timescale = 1000) {
  const payload = Buffer.alloc(20);
  payload[0] = 0;
  payload.writeUInt32BE(timescale, 12);
  payload.writeUInt32BE(Math.round(durationSeconds * timescale), 16);
  return Buffer.concat([box("ftyp", Buffer.alloc(4)), box("moov", box("mvhd", payload))]);
}

test("Douyin topics come from the package instead of account-specific defaults", async () => {
  await withTempDir(async root => {
    const packagePath = path.join(root, "package.json");
    await fs.promises.writeFile(packagePath, JSON.stringify({
      title: "Generic video",
      douyinTopics: ["Automation", "Tutorial"],
      cover: { uploadCustomCover: false, useVideoFrame: true, approvalEvidence: "test fixture" },
    }));
    const pkg = readPackage(packagePath, { config: defaultConfig() });
    assert.deepEqual(pkg.douyinTopics, ["Automation", "Tutorial"]);
    assert.deepEqual(validateDouyinPackage(pkg), []);
  });
});

test("Bilibili automatic-tag allowlist is empty unless the package supplies it", async () => {
  await withTempDir(async root => {
    const packagePath = path.join(root, "package.json");
    await fs.promises.writeFile(packagePath, JSON.stringify({
      title: "Generic video",
      bilibiliTags: ["Automation"],
    }));
    const pkg = readPackage(packagePath, { config: defaultConfig() });
    assert.deepEqual(pkg.bilibiliAllowedAutoTags, []);
  });
});

test("an existing cover asset needs only its file path and ratio", async () => {
  await withTempDir(async root => {
    const coverPath = path.join(root, "cover-4x3.png");
    const packagePath = path.join(root, "package.json");
    await fs.promises.writeFile(coverPath, pngHeader(1440, 1080));
    await fs.promises.writeFile(packagePath, JSON.stringify({
      title: "Generic video",
      xhsTopics: ["Automation"],
      cover: {
        uploadCustomCover: true,
        horizontal4x3Path: coverPath,
      },
    }));
    const pkg = readPackage(packagePath, { config: defaultConfig() });
    assert.deepEqual(validateXiaohongshuPackage(pkg), []);
    assert.deepEqual(coverAssetsForPlatform(pkg, "xiaohongshu"), [
      { slot: "landscape", ratio: "4:3", path: coverPath },
    ]);
  });
});

test("cover preflight rejects an unresolved or contradictory choice and accepts an explicit frame choice", async () => {
  await withTempDir(async root => {
    const unresolvedPath = path.join(root, "unresolved.json");
    const framePath = path.join(root, "frame.json");
    const contradictoryPath = path.join(root, "contradictory.json");
    await fs.promises.writeFile(unresolvedPath, JSON.stringify({ title: "Generic video" }));
    await fs.promises.writeFile(framePath, JSON.stringify({
      title: "Generic video",
      cover: { uploadCustomCover: false, useVideoFrame: true, approvalEvidence: "User accepted the platform frame" },
    }));
    await fs.promises.writeFile(contradictoryPath, JSON.stringify({
      title: "Generic video",
      cover: { uploadCustomCover: true, useVideoFrame: true, approvalEvidence: "User accepted the platform frame" },
    }));

    const unresolved = readPackage(unresolvedPath, { config: defaultConfig() });
    const frame = readPackage(framePath, { config: defaultConfig() });
    const contradictory = readPackage(contradictoryPath, { config: defaultConfig() });

    assert.match(validateCoverPackage(unresolved, "bilibili")[0], /cover choice is unresolved/);
    assert.deepEqual(validateCoverPackage(frame, "bilibili"), []);
    assert.match(validateCoverPackage(contradictory, "bilibili")[0], /cover choice is ambiguous/);
  });
});

test("WeChat Channels requires an explicit content mark in its release package", async () => {
  await withTempDir(async root => {
    const missingPath = path.join(root, "missing-mark.json");
    const declaredPath = path.join(root, "declared-mark.json");
    const base = {
      title: "Personal AI",
      wechatDescription: "Personal AI video",
      wechatTags: ["AI"],
      cover: { uploadCustomCover: false, useVideoFrame: true, approvalEvidence: "approved frame" },
    };
    await fs.promises.writeFile(missingPath, JSON.stringify(base));
    await fs.promises.writeFile(declaredPath, JSON.stringify({ ...base, contentTypeDeclaration: "含AI生成内容" }));
    const missing = readPackage(missingPath, { config: defaultConfig() });
    const declared = readPackage(declaredPath, { config: defaultConfig() });
    assert.match(validateWechatChannelsPackage(missing).join("; "), /contentTypeDeclaration is required/);
    assert.deepEqual(validateWechatChannelsPackage(declared), []);
  });
});

test("Bilibili requires an explicit content mark in its release package", async () => {
  await withTempDir(async root => {
    const missingPath = path.join(root, "missing-bilibili-mark.json");
    const declaredPath = path.join(root, "declared-bilibili-mark.json");
    const base = {
      title: "Personal AI",
      bilibiliDescription: "Personal AI video",
      bilibiliTags: ["AI"],
      cover: { uploadCustomCover: false, useVideoFrame: true, approvalEvidence: "approved frame" },
    };
    await fs.promises.writeFile(missingPath, JSON.stringify(base));
    await fs.promises.writeFile(declaredPath, JSON.stringify({ ...base, contentTypeDeclaration: "含AI生成内容" }));
    const missing = readPackage(missingPath, { config: defaultConfig() });
    const declared = readPackage(declaredPath, { config: defaultConfig() });
    assert.match(validateBilibiliPackage(missing).join("; "), /contentTypeDeclaration is required/);
    assert.deepEqual(validateBilibiliPackage(declared), []);
  });
});

test("account defaults fill only fields omitted from the package", async () => {
  await withTempDir(async root => {
    const packagePath = path.join(root, "package.json");
    await fs.promises.writeFile(packagePath, JSON.stringify({
      title: "Generic video",
      bilibiliTags: ["Tutorial"],
    }));
    const config = normalizeConfig({
      platforms: {
        douyin: { defaultTopics: ["Default topic"] },
        bilibili: { allowedAutoTags: ["Platform tag"] },
      },
    });
    const pkg = readPackage(packagePath, { config });
    assert.deepEqual(pkg.douyinTopics, ["Default topic"]);
    assert.deepEqual(pkg.bilibiliAllowedAutoTags, ["Platform tag"]);
  });
});

test("ISO BMFF duration parser reads mvhd without ffprobe", async () => {
  await withTempDir(async root => {
    const videoPath = path.join(root, "long.mp4");
    await fs.promises.writeFile(videoPath, mp4WithDuration(909.162));
    assert.equal(readIsoBmffDuration(videoPath), 909.162);
    const media = inspectMediaFile(videoPath);
    assert.equal(media.durationSource, "iso-bmff-mvhd");
    assert.equal(media.durationSeconds, 909.162);
  });
});

test("Douyin preflight accepts 15:00 container rounding and rejects longer media only for Douyin", async () => {
  await withTempDir(async root => {
    const acceptedPath = path.join(root, "accepted.mp4");
    const rejectedPath = path.join(root, "rejected.mp4");
    await fs.promises.writeFile(acceptedPath, mp4WithDuration(DOUYIN_MAX_DURATION_SECONDS + DOUYIN_DURATION_CONTAINER_TOLERANCE_SECONDS / 2));
    await fs.promises.writeFile(rejectedPath, mp4WithDuration(DOUYIN_MAX_DURATION_SECONDS + DOUYIN_DURATION_CONTAINER_TOLERANCE_SECONDS + 0.001));
    assert.deepEqual(validateMediaForPlatform({ videoPath: acceptedPath }, "douyin"), []);
    assert.match(validateMediaForPlatform({ videoPath: rejectedPath }, "douyin")[0], /DOUYIN_DURATION_LIMIT/);
    assert.deepEqual(validateMediaForPlatform({ videoPath: rejectedPath }, "xiaohongshu"), []);
  });
});


test("explicit platform cover mapping preserves portrait and wide artwork without fixed 4:3 substitution", async () => {
  await withTempDir(async root => {
    const portrait = path.join(root, "portrait.png"), wide = path.join(root, "wide.png"), packagePath = path.join(root, "package.json");
    await fs.promises.writeFile(portrait, pngHeader(1080, 1440));
    await fs.promises.writeFile(wide, pngHeader(1920, 1080));
    await fs.promises.writeFile(packagePath, JSON.stringify({title:"Generic video", xhsTopics:["Test"], bilibiliDescription:"description", bilibiliTags:["Test"], contentTypeDeclaration:"含AI生成内容", cover:{uploadCustomCover:true, horizontal4x3Path:"must-not-fallback", platformAssets:{xiaohongshu:[{slot:"portrait",ratio:"3:4",path:portrait}],bilibili:[{slot:"landscape",ratio:"16:9",path:wide}]}}}));
    const pkg = readPackage(packagePath, {config:defaultConfig()});
    assert.deepEqual(validateXiaohongshuPackage(pkg), []);
    assert.deepEqual(validateBilibiliPackage(pkg), []);
    assert.equal(coverAssetsForPlatform(pkg,"xiaohongshu")[0].path,portrait);
    assert.equal(coverAssetsForPlatform(pkg,"bilibili")[0].ratio,"16:9");
    pkg.cover.platformAssets.xiaohongshu=[];
    assert.match(validateXiaohongshuPackage(pkg).join(";"), /no cover asset/);
    pkg.cover.platformAssets.xiaohongshu=[{slot:"portrait",ratio:"3:4",path:wide}];
    assert.match(validateXiaohongshuPackage(pkg).join(";"), /ratio mismatch/);
  });
});


test("Bilibili dual-slot correction binds and validates the independent 16:9 file", async () => {
  await withTempDir(async root => {
    const main=path.join(root,"main.png"),wide=path.join(root,"wide.png"),pkgPath=path.join(root,"package.json");
    await fs.promises.writeFile(main,pngHeader(1440,1080));await fs.promises.writeFile(wide,pngHeader(1920,1080));
    await fs.promises.writeFile(pkgPath,JSON.stringify({title:"Test",bilibiliTags:["Test"],bilibiliDescription:"Test",contentTypeDeclaration:"含AI生成内容",bilibiliWideCoverPath:wide,cover:{uploadCustomCover:true,horizontal4x3Path:main}}));
    const pkg=readPackage(pkgPath,{config:defaultConfig()});
    assert.deepEqual(validateBilibiliPackage(pkg),[]);
    assert.deepEqual(coverAssetsForPlatform(pkg,"bilibili").map(a=>a.ratio),["4:3","16:9"]);
    assert.equal(Object.hasOwn(pkg.cover,"platformAssets"),false);
    await fs.promises.writeFile(wide,pngHeader(1440,1080));
    assert.match(validateBilibiliPackage(pkg).join(";"),/ratio mismatch/);
  });
});
