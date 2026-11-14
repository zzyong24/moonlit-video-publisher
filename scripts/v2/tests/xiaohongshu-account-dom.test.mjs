import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { validateExpectedXiaohongshuAccount, evaluateXiaohongshuAccountProof } from '../lib/expected-account.mjs';
const source = fs.readFileSync(new URL('../ego/xiaohongshu-account.mjs', import.meta.url), 'utf8');

function element(cls, text = '', children = [], hidden = false) {
  const node = { classList: cls ? cls.split(' ') : [], innerText: text, textContent: text, hidden, parentElement: null, getBoundingClientRect: () => ({ width: 400, height: 40 }) };
  for (const child of children) child.parentElement = node;
  node.querySelectorAll = () => children.flatMap(child => [child, ...child.querySelectorAll('div')]);
  return node;
}
function header(name = 'Fixture XHS Creator', id = 'fixture_xhs_id') {
  return element('user-info', '', [element('account-name', name), element('account-id', `小红书账号：${id}`), element('description', 'bio mentions 小红书账号 other_id and Other Name')]);
}
function dom(nodes) {
  const root = element('root', '', nodes);
  return vm.runInNewContext(source.slice(0, source.indexOf('async function verifyXiaohongshuTargetAccount')) + '; readXiaohongshuCreatorHomeDom()', {
    document: root, location: { href: 'https://creator.xiaohongshu.com/new/home' }, getComputedStyle: node => ({ display: node.hidden ? 'none' : 'block', visibility: 'visible' }),
  });
}

test('nickname and stable 小红书账号 come from one header container', () => {
  const result = dom([header()]);
  assert.equal(result.scopeConfirmed, true);
  assert.deepEqual({ ...result.actual }, { name: 'Fixture XHS Creator', xhsId: 'fixture_xhs_id' });
});

test('missing name, two headers, two names in one header, or hidden ID cannot verify', () => {
  for (const nodes of [
    [element('box', '', [element('account-id', '小红书账号：fixture_xhs_id')])],
    [header(), header('Other', 'other_id')],
    [element('user-info', '', [element('account-name', 'A'), element('nick-name', 'B'), element('account-id', '小红书账号：fixture_xhs_id')])],
    [element('user-info', '', [element('account-name', 'Fixture XHS Creator'), element('account-id', '小红书账号：fixture_xhs_id', [], true)])],
  ]) assert.equal(dom(nodes).scopeConfirmed, false);
});

async function reader({ actual = { name: 'Fixture XHS Creator', xhsId: 'fixture_xhs_id' }, profileId = 'Default', withBinding = true, reads = [] } = {}) {
  const calls = [];
  const tabs = [{ label: 'p1', targetId: 'editor', active: true, url: 'https://creator.xiaohongshu.com/publish/publish?source=official' }];
  const page = { label: 'p2', goto: async () => calls.push('home.goto'), reload: async () => calls.push('home.reload'), waitForFunction: async () => calls.push('home.wait'), evaluate: async () => { calls.push('home.read'); return reads.length ? reads.shift() : { actual, scopeConfirmed: true, candidateCount: 1, sourceUrl: 'https://creator.xiaohongshu.com/new/home' }; }, screenshot: async ({ path }) => { calls.push('home.screenshot'); return path; } };
  const task = { spaceId: 31, name: 'xhs space', tabs: async () => tabs, page: () => page, newPage: async () => { calls.push('home.newPage'); return page; } };
  const pkg = { account: 'dahao', expectedAccounts: { xiaohongshu: { name: 'Fixture XHS Creator', xhsId: 'fixture_xhs_id' } }, ...(withBinding ? { accountBinding: { xiaohongshu: { account: 'dahao', label: '大号', egoProfileId: 'Default' } } } : {}) };
  const ctx = vm.createContext({
    activeTaskSpace: { id: 31, name: 'xhs space' }, activeTaskSpaceProfile: { profileId }, taskName: 'xhs space', pkg, setTimeout: (fn) => setImmediate(fn),
    validateExpectedXiaohongshuAccount, evaluateXiaohongshuAccountProof,
    captureAccountHeader: async (p, label) => { calls.push(`shot:${label}`); return { path: `/tmp/account-xiaohongshu-${label}.png` }; },
    taskSpace: async id => { calls.push('same-space'); assert.equal(id, 31); return task; },
    switchTab: async id => { assert.equal(id, 'editor'); calls.push('restore.editor'); },
  });
  return { ctx, calls };
}

test('verified 小红书 identity captures a header screenshot and restores the editor', async () => {
  const f = await reader();
  const result = await new vm.Script(source + '; verifyXiaohongshuTargetAccount()').runInContext(f.ctx);
  assert.equal(result.ok, true);
  assert.equal(result.evidence.screenshotPath, '/tmp/account-xiaohongshu-dahao.png');
  assert.deepEqual(f.calls, ['same-space', 'home.newPage', 'home.goto', 'home.wait', 'home.read', 'shot:dahao', 'restore.editor']);
});

test('wrong 小红书 account → ACCOUNT_MISMATCH without screenshot; wrong Profile → PROFILE_MISMATCH', async () => {
  const wrong = await reader({ actual: { name: 'Fixture XHS Creator', xhsId: 'someone_else' } });
  const mismatch = await new vm.Script(source + '; verifyXiaohongshuTargetAccount()').runInContext(wrong.ctx);
  assert.equal(mismatch.blocker.code, 'ACCOUNT_MISMATCH'); assert.equal(wrong.calls.some(call => call.startsWith('shot:')), false);
  const otherProfile = await reader({ profileId: 'Profile 1' });
  const profile = await new vm.Script(source + '; verifyXiaohongshuTargetAccount()').runInContext(otherProfile.ctx);
  assert.equal(profile.blocker.code, 'PROFILE_MISMATCH');
});

test('expected 小红书 identity requires name and xhsId; stale evidence is unverified', () => {
  assert.ok(validateExpectedXiaohongshuAccount({}).length > 0);
  assert.ok(validateExpectedXiaohongshuAccount({ expectedAccounts: { xiaohongshu: { name: 'A' } } }).length > 0);
  const pkg = { expectedAccounts: { xiaohongshu: { name: 'A', xhsId: 'a1' } } };
  const proof = { actual: { name: 'A', xhsId: 'a1' }, method: 'creator-home-dom', scopeConfirmed: true, sourceUrl: 'https://creator.xiaohongshu.com/new/home', taskSpaceId: 3, taskSpaceName: 's' };
  assert.equal(evaluateXiaohongshuAccountProof(pkg, { ...proof, observedAt: new Date().toISOString() }, { id: 3, name: 's' }).ok, true);
  assert.equal(evaluateXiaohongshuAccountProof(pkg, { ...proof, observedAt: new Date(Date.now() - 16000).toISOString() }, { id: 3, name: 's' }).blocker.code, 'ACCOUNT_UNVERIFIED');
});

test('小红书 header not yet laid out (0 visible candidates) is re-read; ambiguous headers stop re-reading', async () => {
  const late = await reader({ reads: [{ actual: null, scopeConfirmed: false, candidateCount: 0, sourceUrl: 'https://creator.xiaohongshu.com/new/home' }] });
  const ok = await new vm.Script(source + '; verifyXiaohongshuTargetAccount()').runInContext(late.ctx);
  assert.equal(ok.ok, true);
  assert.equal(late.calls.filter(call => call === 'home.read').length, 2);
  const twoHeaders = { actual: null, scopeConfirmed: false, candidateCount: 2, sourceUrl: 'https://creator.xiaohongshu.com/new/home' };
  const amb = await reader({ reads: [twoHeaders, { actual: { name: 'Fixture XHS Creator', xhsId: 'fixture_xhs_id' }, scopeConfirmed: true, candidateCount: 1 }] });
  const blocked = await new vm.Script(source + '; verifyXiaohongshuTargetAccount()').runInContext(amb.ctx);
  assert.equal(blocked.ok, false);
  assert.equal(amb.calls.filter(call => call === 'home.read').length, 1);
  const never = await reader({ reads: Array.from({ length: 20 }, () => ({ actual: null, scopeConfirmed: false, candidateCount: 0 })) });
  const unverified = await new vm.Script(source + '; verifyXiaohongshuTargetAccount()').runInContext(never.ctx);
  assert.equal(unverified.blocker.code, 'ACCOUNT_UNVERIFIED');
  assert.equal(never.calls.filter(call => call === 'home.read').length, 13);
});
