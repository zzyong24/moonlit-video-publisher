// 账号 → Ego Profile pinning (月明 2026-10-21): a task space is used only after
// listTaskSpaces() proves it belongs to the bound Profile; new spaces are created
// inside that Profile; nothing silently falls back to the active/last Profile.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source = fs.readFileSync(new URL('../ego/core.mjs', import.meta.url), 'utf8');
const start = source.indexOf('function profileError(');
const selector = source.slice(start, source.indexOf('async function selectPlatformTab(', start));
const DAHAO = { account: 'dahao', label: '大号', egoProfileId: 'Default', platform: 'douyin' };
const XIAOHAO = { account: 'xiaohao', label: '小号', egoProfileId: 'Profile 1', platform: 'douyin' };

async function select({ binding = DAHAO, spaces = [], ref = '', taskName = 'video publisher v2 xiaohao douyin job', listAvailable = true, existingOnly = false } = {}) {
  const calls = [];
  const live = spaces.map(space => ({ ...space }));
  const context = vm.createContext({
    taskSpaceRef: ref, taskName, existingTaskSpaceOnly: existingOnly, activeTaskSpace: null, taskSpaceRecovery: null, activeTaskSpaceProfile: null,
    ...(binding ? { accountBinding: binding } : {}),
    ...(listAvailable ? { listTaskSpaces: async () => { calls.push('list'); return live; } } : {}),
    taskSpace: async (name, options) => { calls.push({ create: name, profileId: options?.profileId }); const created = { id: 77, name, profileId: options?.profileId }; live.push(created); return { spaceId: 77, name }; },
    useOrCreateTaskSpace: async value => { calls.push({ attach: value }); const found = live.find(space => Number(space.id) === Number(value) || space.name === value); if (!found) throw new Error('task space not found'); return { id: found.id, name: found.name }; },
  });
  let result, error;
  try { result = await new vm.Script(selector + '; selectTaskSpace()').runInContext(context); } catch (caught) { error = caught; }
  return { result, error, calls, context };
}

test('a new 小号 space is created inside the 小号 Profile and re-proven before use', async () => {
  const { result, error, calls, context } = await select({ binding: XIAOHAO });
  assert.equal(error, undefined); assert.equal(result.id, 77);
  assert.deepEqual(calls.filter(call => call.create), [{ create: 'video publisher v2 xiaohao douyin job', profileId: 'Profile 1' }]);
  assert.equal(context.activeTaskSpaceProfile.profileId, 'Profile 1');
});

test('a recorded space in another Profile stops with PROFILE_MISMATCH and is never replaced', async () => {
  const { error, calls, context } = await select({ binding: XIAOHAO, ref: '12', taskName: 'recorded', spaces: [{ id: 12, name: 'recorded', profileId: 'Default' }] });
  assert.equal(error.code, 'PROFILE_MISMATCH');
  assert.equal(error.evidence.expectedProfileId, 'Profile 1'); assert.equal(error.evidence.observedProfileId, 'Default');
  assert.equal(calls.some(call => call.create), false, 'must not create a replacement space');
  assert.equal(context.activeTaskSpace, null);
});

test('a same-name space in another Profile is refused before attaching', async () => {
  const { error, calls } = await select({ binding: DAHAO, taskName: 'shared name', spaces: [{ id: 5, name: 'shared name', profileId: 'Profile 1' }] });
  assert.equal(error.code, 'PROFILE_MISMATCH');
  assert.deepEqual(calls, ['list']);
});

test('a same-name space in the bound Profile is reused, not duplicated', async () => {
  const { result, calls } = await select({ binding: DAHAO, taskName: 'shared name', spaces: [{ id: 5, name: 'shared name', profileId: 'Default' }] });
  assert.equal(result.id, 5); assert.equal(calls.some(call => call.create), false);
});

test('missing Profile information fails closed with PROFILE_UNVERIFIABLE', async () => {
  const noProfile = await select({ ref: '12', taskName: 'recorded', spaces: [{ id: 12, name: 'recorded' }] });
  assert.equal(noProfile.error.code, 'PROFILE_UNVERIFIABLE');
  const noApi = await select({ ref: '12', taskName: 'recorded', spaces: [{ id: 12, name: 'recorded', profileId: 'Default' }], listAvailable: false });
  assert.equal(noApi.error.code, 'PROFILE_UNVERIFIABLE');
});

test('without an account binding no space is selected or created', async () => {
  const { error, calls } = await select({ binding: null });
  assert.equal(error.code, 'ACCOUNT_BINDING_MISSING'); assert.deepEqual(calls, []);
});

test('duplicate same-name spaces are ambiguous, not guessed', async () => {
  const { error } = await select({ taskName: 'dup', spaces: [{ id: 1, name: 'dup', profileId: 'Default' }, { id: 2, name: 'dup', profileId: 'Default' }] });
  assert.equal(error.code, 'PROFILE_UNVERIFIABLE');
});

test('preparePlatform turns a Profile mismatch into a user-required blocker before any tab work', async () => {
  const fnStart = source.indexOf('async function preparePlatform(');
  const fn = source.slice(fnStart, source.indexOf('async function pageRootsState(', fnStart));
  const result = await vm.runInNewContext(fn + '; preparePlatform()', {
    selectTaskSpace: async () => { throw Object.assign(new Error('wrong profile'), { code: 'PROFILE_MISMATCH', evidence: { expectedProfileId: 'Profile 1' } }); },
    selectPlatformTab: () => { throw new Error('must not enter any tab'); },
    typedBlocker: (code, message, options) => ({ code, message, ...options }),
  });
  assert.equal(result.selected.ok, false); assert.equal(result.selected.blocker.code, 'PROFILE_MISMATCH'); assert.equal(result.selected.blocker.requiresUser, true);
});
