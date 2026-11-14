import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { validateExpectedDouyinAccount, evaluateDouyinAccountProof } from '../lib/expected-account.mjs';
const source = fs.readFileSync(new URL('../ego/douyin-account.mjs', import.meta.url), 'utf8');
function element(cls, text = '', children = [], hidden = false) {
  const node = { classList: cls.split(' '), innerText: text, textContent: text, hidden, getBoundingClientRect: () => ({ width: 400, height: 40 }) };
  node.querySelectorAll = () => children.flatMap(child => [child, ...child.querySelectorAll('div')]);
  return node;
}
function header(name = 'Fixture Creator', id = 'fixture_creator_id') {
  return element('header-hash', '', [element('name-hash', name), element('unique_id-hash', `抖音号：${id}`), element('signature-hash', 'A bio mentioning different_id and Different Creator')]);
}
function dom(nodes) {
  const root = element('root', '', nodes);
  return vm.runInNewContext(source.slice(0, source.indexOf('async function verifyDouyinTargetAccount')) + '; readDouyinCreatorHomeDom()', {
    document: root, location: { href: 'https://creator.douyin.com/creator-micro/home' }, getComputedStyle: node => ({ display: node.hidden ? 'none' : 'block', visibility: 'visible' }),
  });
}

test('account name and stable ID come only from one shared creator-home header, not the signature', () => {
  const result = dom([header()]);
  assert.equal(result.scopeConfirmed, true); assert.equal(result.actual.name, 'Fixture Creator'); assert.equal(result.actual.douyinId, 'fixture_creator_id');
});

test('body text, split containers, duplicate headers, and hidden identity cannot verify an account', () => {
  for (const nodes of [
    [element('signature-any', 'Fixture Creator 抖音号：fixture_creator_id')],
    [element('header-h', '', [element('name-n', 'Fixture Creator')]), element('unique_id-i', '抖音号：fixture_creator_id')],
    [header(), header('Other', 'other_id')],
    [element('header-hidden', '', [element('name-n', 'Fixture Creator'), element('unique_id-i', '抖音号：fixture_creator_id')], true)],
  ]) assert.equal(dom(nodes).scopeConfirmed, false);
});

async function reader({ existing = true, actual = { name: 'Fixture Creator', douyinId: 'fixture_creator_id' }, expectedMissing = false } = {}) {
  const calls = [];
  const tabs = [{ label: 'p1', targetId: 'upload-target', active: true, url: 'https://creator.douyin.com/creator-micro/content/post/video?enter_from=publish_page' }];
  if (existing) tabs.push({ label: 'p2', targetId: 'home-target', active: false, url: 'https://creator.douyin.com/creator-micro/home' });
  const page = {
    label: 'p2',
    reload: async () => calls.push('home.reload'),
    goto: async url => { calls.push('home.goto'); tabs.push({ label: 'p2', targetId: 'home-target', url }); },
    waitForFunction: async () => calls.push('home.wait'),
    evaluate: async () => { calls.push('home.read'); return { actual, scopeConfirmed: !!actual, sourceUrl: 'https://creator.douyin.com/creator-micro/home' }; },
  };
  const task = { spaceId: 41, name: 'fixture space', tabs: async () => tabs, page: label => { assert.equal(label, 'p2'); return page; }, newPage: async () => { calls.push('home.newPage'); return page; } };
  const ctx = vm.createContext({
    activeTaskSpace: { id: 41, name: 'fixture space' }, taskName: 'fixture space', pkg: expectedMissing ? {} : { expectedAccounts: { douyin: { name: 'Fixture Creator', douyinId: 'fixture_creator_id' } } },
    validateExpectedDouyinAccount, evaluateDouyinAccountProof,
    taskSpace: async id => { assert.equal(id, 41); calls.push('same-space'); return task; },
    switchTab: async id => { assert.equal(id, 'upload-target'); calls.push('restore.upload'); },
  });
  return { ctx, calls };
}

test('account checks reload only the dedicated same-space home Page and always restore the native uploader', async () => {
  const f = await reader();
  const result = await new vm.Script(source + '; verifyDouyinTargetAccount()').runInContext(f.ctx);
  assert.equal(result.ok, true); assert.deepEqual(f.calls, ['same-space', 'home.reload', 'home.wait', 'home.read', 'restore.upload']);
  assert.equal(result.evidence.accountPageLabel, 'p2');
});

test('a new read-only home Page is separate from upload and is reused with a fresh reload next check', async () => {
  const f = await reader({ existing: false });
  await new vm.Script(source + '; verifyDouyinTargetAccount()').runInContext(f.ctx);
  await new vm.Script('verifyDouyinTargetAccount()').runInContext(f.ctx);
  assert.equal(f.calls.filter(call => call === 'home.newPage').length, 1);
  assert.equal(f.calls.filter(call => call === 'home.goto').length, 1);
  assert.equal(f.calls.filter(call => call === 'home.reload').length, 1);
  assert.equal(f.calls.filter(call => call === 'restore.upload').length, 2);
});

test('missing expected account fails before opening any page; wrong account fails after scoped read', async () => {
  const missing = await reader({ expectedMissing: true });
  const result = await new vm.Script(source + '; verifyDouyinTargetAccount()').runInContext(missing.ctx);
  assert.equal(result.ok, false); assert.deepEqual(missing.calls, []);
  const wrong = await reader({ actual: { name: 'Different Creator', douyinId: 'different_id' } });
  const blocked = await new vm.Script(source + '; verifyDouyinTargetAccount()').runInContext(wrong.ctx);
  assert.equal(blocked.blocker.code, 'ACCOUNT_MISMATCH'); assert.equal(wrong.calls.at(-1), 'restore.upload');
});
