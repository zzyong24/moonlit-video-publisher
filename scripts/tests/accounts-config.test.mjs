import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadAccounts, normalizeAccountKey, resolveAccountsPath, resolvePublishAccount, validateAccountsConfig } from '../lib/config.mjs';
import { bindPublishAccount } from '../lib/content-package.mjs';

const fixturePath = new URL('./fixtures/accounts.fixture.json', import.meta.url);
const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
const clone = () => JSON.parse(JSON.stringify(fixture));

test('the shipped example and the fixture are valid mappings; example keeps 小号 to Douyin/Xiaohongshu', () => {
  const example = JSON.parse(fs.readFileSync(new URL('../../assets/accounts.example.json', import.meta.url), 'utf8'));
  assert.deepEqual(validateAccountsConfig(example), []);
  assert.deepEqual(Object.keys(example.accounts.xiaohao.platforms).sort(), ['douyin', 'xiaohongshu']);
  assert.equal(example.defaultAccount, 'dahao');
  assert.deepEqual(validateAccountsConfig(fixture), []);
});

test('no account means 大号; 小号 must be explicit and accepts Chinese aliases', () => {
  for (const value of [undefined, null, '', '大号', 'dahao']) assert.equal(normalizeAccountKey(value), 'dahao');
  for (const value of ['小号', 'xiaohao']) assert.equal(normalizeAccountKey(value), 'xiaohao');
  assert.throws(() => normalizeAccountKey('第三个号'), { code: 'ACCOUNT_UNKNOWN' });
});

test('resolution returns 账号 → Ego Profile → 平台 → 昵称/ID', () => {
  const dahao = resolvePublishAccount(fixture, undefined, 'douyin');
  assert.deepEqual(dahao, { account: 'dahao', label: '大号', egoProfileId: 'Default', platform: 'douyin', expected: { name: 'Fixture Creator', id: 'fixture_creator_id' } });
  const xiaohao = resolvePublishAccount(fixture, '小号', 'xiaohongshu');
  assert.equal(xiaohao.egoProfileId, 'Profile 1'); assert.equal(xiaohao.expected.id, 'fixture_xhs_second_id');
});

test('小号 on Bilibili or WeChat Channels is a hard error, even if someone adds a mapping', () => {
  for (const platform of ['bilibili', 'wechat_channels']) assert.throws(() => resolvePublishAccount(fixture, 'xiaohao', platform), { code: 'ACCOUNT_PLATFORM_UNSUPPORTED' });
  const widened = clone(); widened.accounts.xiaohao.platforms.bilibili = { name: 'x', id: 'y' };
  assert.ok(validateAccountsConfig(widened).some(error => /only publishes to douyin\/xiaohongshu/.test(error)));
});

test('missing account, Profile id or platform entry fails closed', () => {
  const noXiaohao = clone(); delete noXiaohao.accounts.xiaohao;
  assert.throws(() => resolvePublishAccount(noXiaohao, 'xiaohao', 'douyin'), { code: 'ACCOUNT_MAPPING_MISSING' });
  const noPlatform = clone(); delete noPlatform.accounts.dahao.platforms.bilibili;
  assert.throws(() => resolvePublishAccount(noPlatform, 'dahao', 'bilibili'), { code: 'ACCOUNT_MAPPING_MISSING' });
  const noProfile = clone(); noProfile.accounts.dahao.egoProfileId = '';
  assert.ok(validateAccountsConfig(noProfile).some(error => /egoProfileId is required/.test(error)));
  const sameProfile = clone(); sameProfile.accounts.xiaohao.egoProfileId = 'Default';
  assert.ok(validateAccountsConfig(sameProfile).some(error => /different Ego Lite Profiles/.test(error)));
  const otherDefault = clone(); otherDefault.defaultAccount = 'xiaohao';
  assert.ok(validateAccountsConfig(otherDefault).some(error => /defaultAccount/.test(error)));
});

test('loader reads the file next to config.json, honours VIDEO_PUBLISHER_ACCOUNTS, and fails closed when absent', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'accounts loader '));
  const saved = process.env.VIDEO_PUBLISHER_ACCOUNTS;
  try {
    delete process.env.VIDEO_PUBLISHER_ACCOUNTS;
    const configPath = path.join(root, 'config.json');
    assert.equal(resolveAccountsPath(configPath), path.join(root, 'accounts.json'));
    assert.throws(() => loadAccounts({ configPath }), { code: 'ACCOUNT_MAPPING_MISSING' });
    fs.writeFileSync(path.join(root, 'accounts.json'), '{not json');
    assert.throws(() => loadAccounts({ configPath }), { code: 'ACCOUNT_MAPPING_INVALID' });
    fs.writeFileSync(path.join(root, 'accounts.json'), JSON.stringify(fixture));
    assert.equal(loadAccounts({ configPath }).accounts.dahao.egoProfileId, 'Default');
    process.env.VIDEO_PUBLISHER_ACCOUNTS = path.join(root, 'elsewhere.json');
    assert.equal(resolveAccountsPath(configPath), path.join(root, 'elsewhere.json'));
  } finally {
    if (saved === undefined) delete process.env.VIDEO_PUBLISHER_ACCOUNTS; else process.env.VIDEO_PUBLISHER_ACCOUNTS = saved;
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('binding fills platform identity from the mapping and refuses a conflicting package entry', () => {
  const pkg = { account: '小号' };
  assert.deepEqual(bindPublishAccount(pkg, 'xiaohongshu', { accounts: fixture }), []);
  assert.deepEqual(pkg.expectedAccounts.xiaohongshu, { name: 'Fixture XHS Second', xhsId: 'fixture_xhs_second_id' });
  assert.equal(pkg.accountBinding.xiaohongshu.egoProfileId, 'Profile 1'); assert.equal(pkg.account, 'xiaohao');
  const conflict = { expectedAccounts: { douyin: { name: 'Fixture Creator', douyinId: 'fixture_second_id' } } };
  assert.match(bindPublishAccount(conflict, 'douyin', { accounts: fixture }).join(';'), /ACCOUNT_MAPPING_CONFLICT/);
  assert.match(bindPublishAccount({ account: 'xiaohao' }, 'wechat_channels', { accounts: fixture }).join(';'), /ACCOUNT_PLATFORM_UNSUPPORTED/);
});
