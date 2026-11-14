import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
const source = fs.readFileSync(new URL('../ego/metadata.mjs', import.meta.url), 'utf8');

async function scenario({ platform = 'bilibili', names = ['sample.mp4'], uploading = true, foreign = false, recreated = false, helperOk = true, freshOk = true, tags = [], already = false, available = true } = {}) {
  const calls = [];
  let inspected = 0;
  const inspect = async () => {
    inspected += 1;
    return { gates: {
      authenticated: { ok: true }, draftIdentity: { ok: !foreign, evidence: {} }, noBlockingDialog: { ok: true },
      video: { ok: false, evidence: { uploading } },
      title: { ok: already || inspected > 1 && freshOk }, description: { ok: already || inspected > 1 && freshOk }, shortTitle: { ok: already || inspected > 1 && freshOk },
      tags: { evidence: { selected: tags } },
    } };
  };
  const action = name => async () => { calls.push(name); return { ok: helperOk, reason: 'fixture failure' }; };
  const context = vm.createContext({ platform, path, videoPath: '/tmp/sample.mp4', taskSpaceRecovery: recreated ? { recreated: true } : null,
    inspectBilibili: inspect, inspectDouyin: inspect, inspectXiaohongshu: inspect, inspectWechatChannels: inspect,
    inspectFinalPublishGuard: async () => ({ armed: true, blockedAttempts: 0 }),
    js: async expression => expression.includes('metadataField') ? { available } : { matched: names.includes('sample.mp4'), names }, typedBlocker: (code, message, details) => ({ code, message, ...details }),
    setNativeInputValue: action('title'), setBilibiliDescriptionV2: action('description'),
    setDouyinTitle: action('title'), clearAndFillDouyinBody: action('description'),
    setWechatDescription: action('description'), clearWechatShortTitle: action('shortTitle'),
    xhsTitle: 'Title', bilibiliTitle: 'Title', wechatDescription: 'Description', compactText: value => String(value || '').replace(/\s+/g, ' ').trim(),
  });
  const result = await new vm.Script(source + '\nrunMetadataPhase()').runInContext(context);
  return { result, calls };
}

test('native upload may continue while title and description are filled and freshly verified', async () => {
  const { result, calls } = await scenario();
  assert.deepEqual(calls, ['title', 'description']);
  assert.equal(result.metadata.ok, true);
  assert.equal(result.metadata.uploadComplete, false);
  assert.equal(result.gates.video.ok, false);
  assert.equal(result.metadata.finalPublishClicked, false);
});

for (const options of [{ names: ['other.mp4'] }, { foreign: true }, { recreated: true }, { uploading: false }]) {
  test(`metadata fails closed before writing: ${JSON.stringify(options)}`, async () => {
    const { result, calls } = await scenario(options);
    assert.deepEqual(calls, []);
    assert.equal(result.metadata.ok, false);
    assert.equal(result.blocker.code, 'STATE_AMBIGUOUS');
  });
}

test('metadata no-op preserves matching fields', async () => {
  const { result, calls } = await scenario({ already: true });
  assert.deepEqual(calls, []);
  assert.equal(result.metadata.ok, true);
});

test('helper success without fresh page truth is not metadata completion', async () => {
  const { result } = await scenario({ freshOk: false });
  assert.equal(result.metadata.ok, false);
  assert.equal(result.blocker.code, 'STATE_AMBIGUOUS');
});

test('helper failure remains typed and does not proceed through other fields', async () => {
  const { result, calls } = await scenario({ helperOk: false });
  assert.deepEqual(calls, ['title']);
  assert.equal(result.blocker.code, 'ACTION_FAILED');
});

test('Douyin preserves existing topic entities and defers body repair', async () => {
  const { result, calls } = await scenario({ platform: 'douyin', tags: ['Test'] });
  assert.deepEqual(calls, ['title']);
  assert.equal(result.metadata.ok, false);
  assert.equal(result.metadata.deferred.length, 1);
});

test('Xiaohongshu title and WeChat description use only bounded plain metadata helpers', async () => {
  assert.deepEqual((await scenario({ platform: 'xiaohongshu' })).calls, ['title']);
  assert.deepEqual((await scenario({ platform: 'wechat_channels' })).calls, ['description', 'shortTitle']);
});


test('hidden or disabled metadata fields are deferred without writing', async () => {
  const { result, calls } = await scenario({ available: false });
  assert.deepEqual(calls, []);
  assert.equal(result.metadata.ok, false);
  assert.match(result.blocker.message, /unavailable or disabled/);
});
