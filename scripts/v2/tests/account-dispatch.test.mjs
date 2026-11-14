import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const full = fs.readFileSync(new URL('../platforms/dispatch.mjs', import.meta.url), 'utf8');
const fn = full.slice(0, full.indexOf('const prepared ='));

async function run({ platform = 'douyin', phase = 'upload', beforeOk = true, afterOk = true } = {}) {
  const calls = []; let count = 0;
  const verify = async () => { calls.push('account'); count++; const ok = count === 1 ? beforeOk : afterOk; return { ok, evidence: { count }, ...(ok ? {} : { blocker: { code: 'ACCOUNT_MISMATCH' } }) }; };
  const ctx = vm.createContext({ platform, phase,
    verifyDouyinTargetAccount: platform === 'douyin' ? verify : async () => { throw new Error('wrong verifier'); },
    verifyXiaohongshuTargetAccount: platform === 'xiaohongshu' ? verify : async () => { throw new Error('wrong verifier'); },
    runPlatformPhase: async () => { calls.push(phase); return { gates: { video: { ok: true } } }; },
    runMetadataPhase: async () => { calls.push('metadata'); return { gates: {} }; },
  });
  const result = await new vm.Script(fn + '; runAccountGuardedPlatformPhase()').runInContext(ctx);
  return { result, calls };
}
for (const phase of ['inspect', 'upload', 'mutate', 'metadata', 'verify']) {
  test(`wrong Douyin account blocks ${phase} before any platform helper runs`, async () => {
    const { calls, result } = await run({ phase, beforeOk: false });
    assert.deepEqual(calls, ['account']); assert.equal(result.blocker.code, 'ACCOUNT_MISMATCH');
  });
  test(`Douyin ${phase} independently refreshes account evidence before and after its helper`, async () => {
    const { calls, result } = await run({ phase });
    assert.deepEqual(calls, ['account', phase, 'account']);
    assert.equal(result.gates.targetAccount.ok, true); assert.equal(result.gates.targetAccount.evidence.count, 2);
  });
}
test('account change while upload is running invalidates the returning result', async () => {
  const { result } = await run({ afterOk: false });
  assert.equal(result.gates.video.ok, true); assert.equal(result.gates.targetAccount.ok, false); assert.equal(result.blocker.code, 'ACCOUNT_MISMATCH');
});
for (const phase of ['inspect', 'upload', 'mutate', 'verify']) {
  test(`wrong Xiaohongshu account blocks ${phase} before any platform helper runs`, async () => {
    const { calls, result } = await run({ platform: 'xiaohongshu', phase, beforeOk: false });
    assert.deepEqual(calls, ['account']); assert.equal(result.blocker.code, 'ACCOUNT_MISMATCH');
  });
  test(`Xiaohongshu ${phase} rechecks account evidence before and after its helper`, async () => {
    const { calls, result } = await run({ platform: 'xiaohongshu', phase });
    assert.deepEqual(calls, ['account', phase, 'account']); assert.equal(result.gates.targetAccount.ok, true);
  });
}
test('Bilibili retains its own contract and does not claim an unimplemented account gate', async () => {
  const { calls, result } = await run({ platform: 'bilibili' });
  assert.deepEqual(calls, ['upload']); assert.equal(result.gates.targetAccount, undefined);
});

test('Douyin file injection and its retry recheck identity before clearing or reusing the file input', async () => {
  const adapter = fs.readFileSync(new URL('../platforms/douyin.mjs', import.meta.url), 'utf8');
  const start = adapter.indexOf('async function uploadDouyin()');
  const fn = adapter.slice(start, adapter.indexOf('async function setDouyinTitle()', start));
  for (const failAt of [1, 2]) {
    const calls = []; let accountCalls = 0, inspections = 0, probes = 0;
    const gates = { authenticated: { ok: true }, draftIdentity: { ok: true }, video: { ok: false, evidence: {} } };
    const ctx = vm.createContext({
      videoPath: '/tmp/fixture-video.mp4',
      inspectDouyin: async () => { inspections++; return { gates: { ...gates, video: { ok: false, evidence: inspections === 1 ? {} : { failed: true, uploading: false } } } }; },
      js: async () => { probes++; return probes === 1 ? { input: true } : { ok: true, selector: '#fixture' }; },
      verifyDouyinTargetAccount: async () => { accountCalls++; const ok = accountCalls < failAt; return { ok, evidence: {}, blocker: { code: 'ACCOUNT_MISMATCH' } }; },
      uploadFile: async () => calls.push('inject'), wait: async () => {},
      typedBlocker: (code, message) => ({ code, message }),
    });
    const result = await new vm.Script(fn + '; uploadDouyin()').runInContext(ctx);
    assert.equal(result.blocker.code, 'ACCOUNT_MISMATCH');
    assert.equal(calls.length, failAt - 1, 'never inject under an unverified account, including retry');
    assert.equal(accountCalls, failAt);
    if (failAt === 1) assert.equal(probes, 1, 'the actual file input must not be cleared before the account check');
  }
});
