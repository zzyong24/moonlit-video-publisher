import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source = fs.readFileSync(new URL('../platforms/douyin.mjs', import.meta.url), 'utf8');
const start = source.indexOf('function douyinSyncSettings(');
const helper = source.slice(start, source.indexOf('async function inspectDouyin()', start));
const evaluate = vm.runInNewContext(helper + '; douyinSyncSettings', {
  okGate: evidence => ({ ok: true, evidence }), failedGate: evidence => ({ ok: false, evidence }),
});
function known() {
  return {
    syncFound: false, syncOn: false, noSyncChecked: false, simultaneousChecked: false,
    publishSettingsSignature: {
      url: 'https://creator.douyin.com/creator-micro/content/post/video?enter_from=publish_page',
      titleControlVisible: true, descriptionControlVisible: true, editorSectionsVisible: true, settingsHeadingVisible: true,
      radioLabels: ['公开', '好友可见', '仅自己可见', '允许', '不允许', '立即发布', '定时发布'].map(text => ({ text, checked: ['公开', '允许', '立即发布'].includes(text) })),
      syncCluesPresent: false, unknownSwitchCount: 0,
    },
  };
}

test('recognized complete Douyin post editor with positive settings evidence can omit sync capability', () => {
  const result = evaluate(known());
  assert.equal(result.ok, true);
  assert.equal(result.evidence.mode, 'not_applicable');
});

test('mere absence of the old no-sync radio never passes settings', () => {
  assert.equal(evaluate({ noSyncChecked: false, syncFound: false }).ok, false);
});

for (const [field, value] of [
  ['url', 'https://creator.douyin.com/creator-micro/home'], ['url', 'https://other.example/creator-micro/content/post/video'],
  ['titleControlVisible', false], ['descriptionControlVisible', false], ['settingsHeadingVisible', false], ['editorSectionsVisible', false],
  ['syncCluesPresent', true], ['syncCluesPresent', undefined], ['unknownSwitchCount', 1], ['unknownSwitchCount', undefined],
]) {
  test(`missing or conflicting positive editor evidence fails closed: ${field}=${value}`, () => {
    const state = known(); state.publishSettingsSignature[field] = value;
    assert.equal(evaluate(state).ok, false);
  });
}

for (const field of ['syncFound', 'syncOn', 'simultaneousChecked']) {
  test(`any active or unknown sync control blocks not_applicable: ${field}`, () => {
    const state = known(); state[field] = true;
    assert.equal(evaluate(state).ok, false);
  });
}

test('partial, duplicate, or ambiguous release setting groups do not establish a complete editor', () => {
  for (const change of [
    labels => labels.slice(1),
    labels => labels.map(label => ({ ...label, checked: false })),
    labels => labels.map(label => ({ ...label, checked: true })),
    labels => [...labels, labels[0]],
  ]) {
    const state = known(); state.publishSettingsSignature.radioLabels = change(state.publishSettingsSignature.radioLabels);
    assert.equal(evaluate(state).ok, false);
  }
});

test('existing explicitly selected no-sync contract still works and enabled sync remains blocked', () => {
  assert.equal(evaluate({ noSyncChecked: true, syncOn: false, simultaneousChecked: false }).evidence.mode, 'explicit_off');
  assert.equal(evaluate({ noSyncChecked: true, syncOn: true, simultaneousChecked: false }).ok, false);
});

test('turn-off helper no-ops verified settings and does not click absent controls', async () => {
  const start = source.indexOf('async function turnOffDouyinSync()');
  const fn = source.slice(start, source.indexOf('async function uploadDouyinCoverSlot(', start));
  const result = await vm.runInNewContext(fn + '; turnOffDouyinSync()', {
    inspectDouyin: async () => ({ gates: { settings: { ok: true, evidence: { mode: 'not_applicable' } } } }),
    js: () => { throw new Error('must not inspect missing sync controls again'); },
  });
  assert.equal(result.ok, true);
  assert.equal(result.already, true);
  assert.equal(result.evidence.mode, 'not_applicable');
});

function unknownSwitchCount(settingRows, controls) {
  const start = source.indexOf('    const knownSettingInputs=');
  const end = source.indexOf('    const syncCluesPresent=', start);
  assert.ok(start > 0 && end > start);
  return vm.runInNewContext(source.slice(start, end) + '; unknownSwitchCount', {
    settingRows, document: { querySelectorAll: () => controls }, visible: () => true,
  });
}

test('the seven known publishing-setting inputs may be native checkboxes without becoming unknown switches', () => {
  const rows = ['公开', '好友可见', '仅自己可见', '允许', '不允许', '立即发布', '定时发布'].map(text => ({ text, input: { type: 'checkbox' } }));
  assert.equal(unknownSwitchCount(rows, rows.map(row => row.input)), 0);
});

test('unrelated switches or extra native checkbox inputs remain unknown', () => {
  const rows = ['公开', '好友可见', '仅自己可见', '允许', '不允许', '立即发布', '定时发布'].map(text => ({ text, input: { type: 'checkbox' } }));
  const unknown = { type: 'checkbox' };
  assert.equal(unknownSwitchCount(rows, [...rows.map(row => row.input), unknown]), 1);
  const other = { text: '未知功能', input: { type: 'checkbox' } };
  assert.equal(unknownSwitchCount([...rows, other], [...rows.map(row => row.input), other.input]), 1);
});
