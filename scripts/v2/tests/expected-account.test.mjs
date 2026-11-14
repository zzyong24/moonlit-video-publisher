import test from 'node:test';
import assert from 'node:assert/strict';
import { validateExpectedDouyinAccount, evaluateDouyinAccountProof } from '../lib/expected-account.mjs';
import { evaluateObservation, requiredGates, classifyVerdict } from '../lib/model.mjs';

const expected = { name: 'Fixture Creator', douyinId: 'fixture_creator_id' };
const pkg = { expectedAccounts: { douyin: expected } };
const task = { id: 41, name: 'fixture account space' };
function proof(overrides = {}) {
  return { actual: { ...expected }, sourceUrl: 'https://creator.douyin.com/creator-micro/home', observedAt: new Date().toISOString(), taskSpaceId: task.id, taskSpaceName: task.name, scopeConfirmed: true, method: 'creator-home-dom', ...overrides };
}
function observation(account) {
  const gates = Object.fromEntries(requiredGates('douyin').map(name => [name, { ok: true, evidence: {} }]));
  gates.safety = { ok: true, evidence: { finalPublishClicked: false, guardArmed: true, blockedAttempts: 0 } };
  gates.targetAccount = account;
  return { platform: 'douyin', phase: 'verify', taskSpaceId: task.id, taskSpace: task.name, gates };
}

test('expected Douyin name and stable douyinId are mandatory with no business-account defaults', () => {
  for (const value of [undefined, {}, { douyin: {} }, { douyin: { name: 'Creator' } }, { douyin: { douyinId: 'creator_id' } }, { douyin: { name: 'Creator', douyinId: 123 } }]) assert.ok(validateExpectedDouyinAccount({ expectedAccounts: value }).length > 0);
  assert.deepEqual(validateExpectedDouyinAccount(pkg), []);
});

test('only fresh same-task scoped name plus ID exact match can satisfy targetAccount', () => {
  const result = evaluateDouyinAccountProof(pkg, proof(), task);
  assert.equal(result.ok, true);
  assert.equal(evaluateObservation(observation(result)).ready, true);
});

for (const actual of [{ name: expected.name, douyinId: 'different_account' }, { name: 'Different Creator', douyinId: expected.douyinId }]) {
  test(`same login with mismatched identity is blocked: ${JSON.stringify(actual)}`, () => {
    const result = evaluateDouyinAccountProof(pkg, proof({ actual }), task);
    assert.equal(result.ok, false); assert.equal(result.blocker.code, 'ACCOUNT_MISMATCH');
    const verdict = evaluateObservation(observation(result));
    assert.equal(verdict.ready, false); assert.equal(classifyVerdict(verdict), 'blocked_user');
  });
}

for (const override of [{ observedAt: new Date(Date.now() - 16000).toISOString() }, { observedAt: 'invalid' }, { taskSpaceId: 42 }, { taskSpaceName: 'other space' }, { scopeConfirmed: false }, { method: 'cached-receipt' }, { sourceUrl: 'https://www.douyin.com/user/example' }, { actual: { name: expected.name } }]) {
  test(`cached or insufficient identity cannot satisfy the gate: ${JSON.stringify(override)}`, () => {
    const result = evaluateDouyinAccountProof(pkg, proof(override), task);
    assert.equal(result.ok, false); assert.equal(result.blocker.code, 'ACCOUNT_UNVERIFIED');
  });
}

test('central READY model independently rejects stale or empty self-reported targetAccount evidence', () => {
  for (const account of [{ ok: true, evidence: {} }, { ok: true, evidence: { ...proof({ observedAt: new Date(Date.now() - 16000).toISOString() }), expected } }]) {
    const verdict = evaluateObservation(observation(account));
    assert.equal(verdict.ready, false); assert.equal(verdict.blocker.code, 'ACCOUNT_UNVERIFIED');
  }
});

test('Douyin and Xiaohongshu require the account gate; Bilibili/WeChat Channels do not claim automatic coverage', () => {
  for (const platform of ['douyin', 'xiaohongshu']) assert.equal(requiredGates(platform).includes('targetAccount'), true);
  for (const platform of ['bilibili', 'wechat_channels']) assert.equal(requiredGates(platform).includes('targetAccount'), false);
});
