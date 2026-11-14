import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source = fs.readFileSync(new URL('../ego/core.mjs', import.meta.url), 'utf8');
function functionSource(name, next) {
  const start = source.indexOf(`async function ${name}(`);
  const end = source.indexOf(`async function ${next}(`, start);
  assert.ok(start >= 0 && end > start);
  return source.slice(start, end);
}
function selectorSource() {
  const start = source.indexOf('function profileError(');
  const end = source.indexOf('async function selectPlatformTab(', start);
  assert.ok(start >= 0 && end > start);
  return source.slice(start, end);
}
async function select({ existingOnly = true, missing = false, name = 'recorded target space', id = 14, ref = '14' } = {}) {
  const calls = [];
  const spaces = [{ id, name, profileId: 'Default', profileName: '大号' }];
  const context = vm.createContext({ taskSpaceRef: ref, taskName: 'recorded target space', existingTaskSpaceOnly: existingOnly, activeTaskSpace: null, taskSpaceRecovery: null, activeTaskSpaceProfile: null,
    accountBinding: { account: 'dahao', label: '大号', egoProfileId: 'Default', platform: 'douyin' },
    listTaskSpaces: async () => missing ? spaces.filter(space => space.id !== id) : spaces,
    taskSpace: async (value, options) => { calls.push({ create: value, profileId: options?.profileId }); spaces.push({ id: 99, name: value, profileId: options?.profileId }); return { spaceId: 99, name: value }; },
    useOrCreateTaskSpace: async value => { calls.push(value); if (missing && value === id) throw new Error('task space not found'); return { id: typeof value === 'number' ? value : 99, name: value === 99 ? 'recorded target space' : (typeof value === 'number' ? name : value) }; },
  });
  let result, error;
  try { result = await new vm.Script(selectorSource() + '; selectTaskSpace()').runInContext(context); }
  catch (caught) { error = caught; }
  return { result, error, calls, context };
}

test('metadata initial inspect never creates a replacement when the recorded space is missing', async () => {
  const { error, calls, context } = await select({ missing: true });
  assert.equal(error.code, 'RECORDED_TASK_SPACE_UNAVAILABLE');
  assert.deepEqual(calls, [14]);
  assert.equal(context.activeTaskSpace, null);
  assert.equal(context.taskSpaceRecovery, null);
});

test('metadata initial inspect never creates a replacement for a recycled task-space id', async () => {
  const { error, calls, context } = await select({ name: 'another video job' });
  assert.equal(error.code, 'RECORDED_TASK_SPACE_UNAVAILABLE');
  assert.deepEqual(calls, [14]);
  assert.equal(context.activeTaskSpace, null);
});

test('metadata refuses a named reference before any create-capable selection call', async () => {
  const { error, calls } = await select({ ref: 'recorded target space' });
  assert.equal(error.code, 'RECORDED_TASK_SPACE_UNAVAILABLE');
  assert.deepEqual(calls, []);
});

test('metadata keeps the exact existing numeric space and ordinary recovery still recreates by recorded name', async () => {
  const exact = await select(); assert.equal(exact.result.id, 14); assert.deepEqual(exact.calls, [14]);
  const normal = await select({ existingOnly: false, missing: true });
  assert.equal(normal.result.id, 99); assert.deepEqual(normal.calls, [14, { create: 'recorded target space', profileId: 'Default' }, 99]);
  assert.equal(normal.context.taskSpaceRecovery.recreated, true);
});

test('metadata recovery with no matching platform tab never opens a new tab', async () => {
  const calls = [];
  const result = await vm.runInNewContext(functionSource('selectPlatformTab', 'armFinalPublishGuard') + '; selectPlatformTab()', {
    existingTaskSpaceOnly: true, platform: 'bilibili', PLATFORM_HOSTS: { bilibili: /member\.bilibili\.com/ },
    PLATFORM_URLS: { bilibili: 'https://member.bilibili.com/upload' }, listTabs: async () => [],
    openOrReuseTab: async () => calls.push('create'), switchTab: async () => calls.push('switch'), typedBlocker: (code, message) => ({ code, message }),
  });
  assert.equal(result.ok, false); assert.equal(result.blocker.code, 'STATE_AMBIGUOUS'); assert.deepEqual(calls, []);
});

test('missing recorded space becomes structured blocked preparation rather than channel loss', async () => {
  const fn = functionSource('preparePlatform', 'pageRootsState');
  const result = await vm.runInNewContext(fn + '; preparePlatform()', {
    selectTaskSpace: async () => { throw Object.assign(new Error('no replacement allowed'), { code: 'RECORDED_TASK_SPACE_UNAVAILABLE' }); },
    selectPlatformTab: () => { throw new Error('must not enter any tab'); }, typedBlocker: (code, message) => ({ code, message }),
  });
  assert.equal(result.selected.ok, false); assert.equal(result.selected.blocker.code, 'STATE_AMBIGUOUS');
});
