import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function paths(platform, cover) {
  const file = platform === 'douyin' ? 'douyin' : 'wechat-channels';
  const source = fs.readFileSync(new URL(`../platforms/${file}.mjs`, import.meta.url), 'utf8');
  const prefix = source.slice(0, source.indexOf('async function inspect'));
  const variable = platform === 'douyin' ? 'douyinCoverAssets' : 'wechatCoverAssets';
  return JSON.parse(vm.runInNewContext(`${prefix}; JSON.stringify(${variable})`, {
    pkg: { cover, platformTitle: { douyin: 'test' }, douyinDescription: '', douyinTopics: [], wechatDescription: '', contentTypeDeclaration: '含AI生成内容' },
  }));
}

for (const platform of ['douyin', 'wechat_channels']) {
  test(`${platform}: explicit primary slots reach actual adapter, overriding legacy paths`, () => {
    const result = paths(platform, {
      uploadCustomCover: true,
      vertical3x4Path: '/legacy-wrong-portrait.png',
      horizontal4x3Path: '/legacy-wrong-landscape.png',
      platformAssets: { [platform]: [
        { slot: 'landscape', ratio: '4:3', path: '/new wide cover.png' },
        { slot: 'portrait', ratio: '3:4', path: '/new portrait cover.png' },
      ] },
    });
    assert.deepEqual(result.map(asset => asset.path), ['/new portrait cover.png', '/new wide cover.png']);
    assert.deepEqual(result.map(asset => asset.ratio), ['3:4', '4:3']);
  });
  test(`${platform}: legacy-only package keeps the prior two-slot behavior`, () => {
    assert.deepEqual(paths(platform, { vertical3x4Path: '/p.png', horizontal4x3Path: '/l.png' }).map(asset => asset.path), ['/p.png', '/l.png']);
  });
  test(`${platform}: explicit empty or incomplete mapping never falls back to unrelated legacy artwork`, () => {
    const legacy = { vertical3x4Path: '/wrong-p.png', horizontal4x3Path: '/wrong-l.png' };
    assert.deepEqual(paths(platform, { ...legacy, platformAssets: { [platform]: [] } }).map(asset => asset.path), ['', '']);
    assert.deepEqual(paths(platform, { ...legacy, platformAssets: { [platform]: [{ slot: 'portrait', ratio: '3:4', path: '/p.png' }] } }).map(asset => asset.path), ['/p.png', '']);
  });
}
