const V2_RESULT_PREFIX = 'VIDEO_PUBLISHER_V2_RESULT:';
const PLATFORM_URLS = {
  xiaohongshu: 'https://creator.xiaohongshu.com/publish/publish?source=official&from=menu&target=video',
  douyin: 'https://creator.douyin.com/creator-micro/content/upload',
  bilibili: 'https://member.bilibili.com/platform/upload/video/frame?spm_id_from=333.1007.top_bar.upload',
  wechat_channels: 'https://channels.weixin.qq.com/platform/post/create',
};
const PLATFORM_HOSTS = {
  xiaohongshu: /creator\.xiaohongshu\.com/,
  douyin: /creator\.douyin\.com/,
  bilibili: /member\.bilibili\.com/,
  wechat_channels: /channels\.weixin\.qq\.com/,
};
const FINAL_TEXT = /^(发布|发布笔记|发表|立即投稿)$/;
const FINAL_GUARD_KEY = '__VIDEO_PUBLISHER_FINAL_GUARD__';
let activeTaskSpace = null;
let taskSpaceRecovery = null;
let activeTaskSpaceProfile = null;

const compactText = value => String(value || '').replace(/\s+/g, ' ').trim();
const unique = values => [...new Set((values || []).filter(Boolean))];

function typedBlocker(code, message, options = {}) {
  return {
    code,
    message,
    retryable: options.retryable === true,
    requiresUser: options.requiresUser === true,
    evidence: options.evidence || null,
  };
}

function okGate(evidence = {}, extra = {}) {
  return { ok: true, evidence, ...extra };
}

function failedGate(evidence = {}, extra = {}) {
  return { ok: false, evidence, ...extra };
}

function profileError(code, message, evidence = null) {
  return Object.assign(new Error(message), { code, evidence });
}

// 账号 → Ego Profile pinning (月明 2026-10-21). The runner header always defines
// `accountBinding` ({ account, label, egoProfileId, platform, expected }). A task
// space is usable only after listTaskSpaces() proves it belongs to that Profile.
function requireAccountBinding() {
  const binding = typeof accountBinding !== 'undefined' ? accountBinding : null;
  if (!binding || typeof binding.egoProfileId !== 'string' || !binding.egoProfileId.trim()) {
    throw profileError('ACCOUNT_BINDING_MISSING', '发布账号未绑定 Ego Profile；拒绝选择或新建任务空间');
  }
  return binding;
}

async function taskSpaceEntries() {
  if (typeof listTaskSpaces !== 'function') throw profileError('PROFILE_UNVERIFIABLE', '当前 Ego Lite 不提供 listTaskSpaces()，无法核对任务空间所属 Profile');
  const entries = await listTaskSpaces();
  return Array.isArray(entries) ? entries : [];
}

function checkEntryProfile(entry, binding, space = entry) {
  const evidence = { account: binding.account, expectedProfileId: binding.egoProfileId, taskSpaceId: space?.id ?? null, taskSpaceName: space?.name ?? null, observedProfileId: entry?.profileId ?? null, observedProfileName: entry?.profileName ?? null };
  if (!entry || typeof entry.profileId !== 'string' || !entry.profileId) throw profileError('PROFILE_UNVERIFIABLE', '无法读到任务空间所属 Ego Profile；不继续', evidence);
  if (entry.profileId !== binding.egoProfileId) throw profileError('PROFILE_MISMATCH', `任务空间属于 Profile ${entry.profileId}，不是${binding.label || binding.account}的 ${binding.egoProfileId}；不复用、不换 Profile`, evidence);
  return evidence;
}

async function assertActiveSpaceProfile(binding) {
  const entries = await taskSpaceEntries();
  const entry = entries.find(item => Number(item.id) === Number(activeTaskSpace?.id));
  const evidence = checkEntryProfile(entry, binding, activeTaskSpace);
  activeTaskSpaceProfile = { profileId: entry.profileId, profileName: entry.profileName ?? null, checkedAt: new Date().toISOString() };
  return evidence;
}

// Reuse a same-name space only after its Profile matches; otherwise create the
// space inside the bound Profile. Never falls back to the active/last Profile.
async function attachOrCreatePinned(name, binding) {
  const entries = await taskSpaceEntries();
  const same = entries.filter(item => item.name === name);
  if (same.length > 1) throw profileError('PROFILE_UNVERIFIABLE', `有 ${same.length} 个同名任务空间「${name}」，无法确定复用哪一个`, { taskSpaceIds: same.map(item => item.id) });
  if (same.length === 1) {
    checkEntryProfile(same[0], binding);
    return await useOrCreateTaskSpace(Number(same[0].id));
  }
  if (typeof taskSpace !== 'function') throw profileError('PROFILE_UNVERIFIABLE', '当前 Ego Lite 不提供 taskSpace(name, { profileId })，不能按 Profile 新建任务空间');
  const handle = await taskSpace(name, { profileId: binding.egoProfileId });
  return await useOrCreateTaskSpace(Number(handle.spaceId));
}

async function selectTaskSpace() {
  const binding = requireAccountBinding();
  const raw = String(taskSpaceRef || '').trim();
  const ref = raw && /^\d+$/.test(raw) ? Number(raw) : (raw || taskName);
  const existingOnly = typeof existingTaskSpaceOnly !== 'undefined' && existingTaskSpaceOnly === true;
  const unavailable = reason => Object.assign(new Error(reason), { code: 'RECORDED_TASK_SPACE_UNAVAILABLE' });
  if (existingOnly && (typeof ref !== 'number' || ref < 1 || !taskName)) throw unavailable('metadata-only requires an existing numeric task-space id and exact recorded name');
  try {
    activeTaskSpace = typeof ref === 'number' ? await useOrCreateTaskSpace(ref) : await attachOrCreatePinned(ref, binding);
    const identityMismatch = typeof ref === 'number'
      && Boolean(taskName)
      && Boolean(activeTaskSpace?.name)
      && activeTaskSpace.name !== taskName;
    if (existingOnly && (Number(activeTaskSpace?.id) !== ref || activeTaskSpace?.name !== taskName)) {
      activeTaskSpace = null;
      throw unavailable('recorded task-space identity/name changed; metadata-only cannot create or select a replacement');
    }
    if (identityMismatch) {
      const conflictingTaskSpace = activeTaskSpace;
      activeTaskSpace = await attachOrCreatePinned(taskName, binding);
      taskSpaceRecovery = {
        recreated: true,
        reason: 'task_space_identity_mismatch',
        previousTaskSpaceId: ref,
        previousTaskSpaceName: conflictingTaskSpace.name,
        taskSpaceId: activeTaskSpace?.id ?? null,
        taskSpaceName: activeTaskSpace?.name || taskName,
      };
    }
  } catch (error) {
    const missingRecordedSpace = typeof ref === 'number' && /task space not found/i.test(String(error?.message || error));
    if (!missingRecordedSpace) throw error;
    if (existingOnly) { activeTaskSpace = null; throw unavailable('recorded task space not found; metadata-only cannot create a replacement'); }
    activeTaskSpace = await attachOrCreatePinned(taskName, binding);
    taskSpaceRecovery = { recreated: true, reason: 'task_space_not_found', previousTaskSpaceId: ref, taskSpaceId: activeTaskSpace?.id ?? null, taskSpaceName: activeTaskSpace?.name || taskName };
  }
  // Every path (recorded id, same name, newly created) is re-proven against the
  // bound Profile before any tab is touched.
  try { await assertActiveSpaceProfile(binding); }
  catch (error) { activeTaskSpace = null; activeTaskSpaceProfile = null; throw error; }
  return activeTaskSpace;
}

// Save a screenshot of the verified creator-home header for the final preview.
// Returns { path } or { error }; a failed capture never fakes evidence.
async function captureAccountHeader(page, label) {
  try {
    const dir = typeof accountScreenshotDir !== 'undefined' && accountScreenshotDir ? accountScreenshotDir : '';
    if (!dir) return { path: null, error: 'account screenshot dir not configured' };
    fs.mkdirSync(dir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const file = path.join(dir, `account-${platform}-${label || 'target'}-${stamp}.png`);
    const saved = await page.screenshot({ path: file });
    return { path: typeof saved === 'string' && saved ? saved : file };
  } catch (error) {
    return { path: null, error: String(error?.message || error).slice(0, 300) };
  }
}

async function selectPlatformTab() {
  const tabs = await listTabs();
  const matching = tabs.filter(tab => PLATFORM_HOSTS[platform].test(String(tab.url || '')));
  const match = platform === 'douyin'
    ? matching.find(tab => /\/creator-micro\/content\//.test(String(tab.url || ''))) || matching[0]
    : matching[0];
  if (match) {
    await switchTab(match.targetId);
  } else {
    if (typeof existingTaskSpaceOnly !== 'undefined' && existingTaskSpaceOnly === true) return { ok: false, blocker: typedBlocker('STATE_AMBIGUOUS', 'recorded task space has no matching platform tab; metadata-only cannot create a replacement') };
    await openOrReuseTab(PLATFORM_URLS[platform], { wait: true, timeout: 45 });
  }
  await wait(1.5);
  const info = await pageInfo();
  if (info?.dialog) {
    return { ok: false, blocker: typedBlocker('STATE_AMBIGUOUS', `浏览器原生弹窗阻塞页面: ${info.dialog.message || 'unknown dialog'}`, { retryable: true, evidence: info.dialog }) };
  }
  if (!info || info.w < 300 || info.h < 300) {
    return { ok: false, blocker: typedBlocker('INPUT_CHANNEL_BROKEN', 'Ego Lite 页面视口不可用', { retryable: true, evidence: info }) };
  }
  return { ok: true, info };
}

async function armFinalPublishGuard() {
  return await js(String.raw`((key, finalSource, finalFlags) => {
    const existing = window[key]
    if (existing?.armed === true && existing.version === 1) {
      return { ok: true, armed: true, version: existing.version, armedAt: existing.armedAt, blockedAttempts: existing.blockedAttempts.length }
    }
    const finalText = new RegExp(finalSource, finalFlags)
    const compact = value => String(value || '').replace(/\s+/g, ' ').trim()
    const state = { armed: true, version: 1, armedAt: new Date().toISOString(), blockedAttempts: [] }
    const buttonLabel = element => {
      if (!(element instanceof Element)) return ''
      const buttonish = element.matches('button, input[type="submit"], [role="button"], .d-button, .bcc-button, .submit-add')
      if (!buttonish) return ''
      return compact(element.value || element.getAttribute('aria-label') || element.innerText || element.textContent || '')
    }
    const guard = event => {
      const candidates = [event.submitter, ...(typeof event.composedPath === 'function' ? event.composedPath() : []), event.target]
      const match = candidates.map(element => ({ element, label: buttonLabel(element) })).find(item => finalText.test(item.label))
      if (!match) return
      event.preventDefault()
      event.stopImmediatePropagation()
      state.blockedAttempts.push({ type: event.type, label: match.label, at: new Date().toISOString() })
    }
    document.addEventListener('click', guard, true)
    document.addEventListener('submit', guard, true)
    state.guard = guard
    window[key] = state
    return { ok: true, armed: true, version: state.version, armedAt: state.armedAt, blockedAttempts: 0 }
  })(${JSON.stringify(FINAL_GUARD_KEY)}, ${JSON.stringify(FINAL_TEXT.source)}, ${JSON.stringify(FINAL_TEXT.flags)})`);
}

async function inspectFinalPublishGuard() {
  return await js(String.raw`((key) => {
    const state = window[key]
    return state?.armed === true && state.version === 1
      ? { armed: true, version: state.version, armedAt: state.armedAt, blockedAttempts: state.blockedAttempts.length, attempts: state.blockedAttempts.slice(-5) }
      : { armed: false, version: state?.version || null, blockedAttempts: state?.blockedAttempts?.length || 0, attempts: state?.blockedAttempts?.slice?.(-5) || [] }
  })(${JSON.stringify(FINAL_GUARD_KEY)})`);
}

function checkpointReceipts(receipts) {
  if (!receiptCheckpointPath || !jobFingerprint || !receipts || !Object.keys(receipts).length) {
    return { ok: false, skipped: true };
  }
  const payload = {
    schemaVersion: 2,
    platform,
    fingerprint: jobFingerprint,
    taskSpaceId: activeTaskSpace?.id ?? null,
    writtenAt: new Date().toISOString(),
    // Signed CDN URLs never reach disk: keep origin+path and a digest only.
    receipts: redactDeep(receipts),
  };
  fs.mkdirSync(path.dirname(receiptCheckpointPath), { recursive: true });
  const temp = `${receiptCheckpointPath}.${process.pid}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(payload, null, 2) + '\n');
  fs.renameSync(temp, receiptCheckpointPath);
  return { ok: true, path: receiptCheckpointPath, writtenAt: payload.writtenAt };
}

// Save the image currently shown in one cover slot so the Node-side runner can
// prove its visual identity against the approved asset (lib/visual-identity.mjs).
// The file stays on this Mac under the job dir; only its path, sha256 and the
// URL digest are reported. Failure is evidence, never a pass.
async function captureSlotImage(slot, url) {
  if (!slotCaptureDir || !url) return { ok: false, slot, reason: slotCaptureDir ? 'slot url missing' : 'slot capture dir not configured' };
  try {
    let bytes;
    if (/^https?:/i.test(url)) {
      const response = await fetch(url);
      if (!response.ok) return { ok: false, slot, reason: `slot image HTTP ${response.status}`, urlDigest: urlDigest(url) };
      bytes = Buffer.from(await response.arrayBuffer());
    } else if (/^(blob:|data:)/i.test(url)) {
      const encoded = await js(String.raw`(async (src) => { const blob = await (await fetch(src)).blob(); return await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1] || ''); reader.onerror = () => reject(reader.error); reader.readAsDataURL(blob) }) })(${JSON.stringify(url)})`);
      bytes = Buffer.from(String(encoded || ''), 'base64');
    } else return { ok: false, slot, reason: 'unsupported slot url scheme' };
    if (!bytes.length) return { ok: false, slot, reason: 'empty slot image' };
    const digest = urlDigest(url);
    fs.mkdirSync(slotCaptureDir, { recursive: true, mode: 0o700 });
    const file = path.join(slotCaptureDir, `${platform}-${slot}-${digest.slice(7, 23)}.img`);
    fs.writeFileSync(file, bytes, { mode: 0o600 });
    return { ok: true, slot, file, bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex'), urlDigest: digest, url: redactUrl(url), capturedAt: new Date().toISOString(), taskSpaceId: activeTaskSpace?.id ?? null };
  } catch (error) {
    return { ok: false, slot, reason: String(error?.message || error) };
  }
}

async function captureSlots(urlsBySlot) {
  const captures = {};
  for (const [slot, urls] of Object.entries(urlsBySlot || {})) {
    const url = (urls || []).find(Boolean);
    if (url) captures[slot] = await captureSlotImage(slot, url);
  }
  return captures;
}

async function preparePlatform() {
  let task;
  try { task = await selectTaskSpace(); }
  catch (error) {
    if (['PROFILE_MISMATCH', 'PROFILE_UNVERIFIABLE', 'ACCOUNT_BINDING_MISSING'].includes(error?.code)) {
      return { task: null, selected: { ok: false, blocker: typedBlocker(error.code, String(error.message), { retryable: false, requiresUser: true, evidence: error.evidence || null }) } };
    }
    if (error?.code !== 'RECORDED_TASK_SPACE_UNAVAILABLE') throw error;
    return { task: null, selected: { ok: false, blocker: typedBlocker('STATE_AMBIGUOUS', String(error.message), { retryable: false }) } };
  }
  const selected = await selectPlatformTab();
  if (!selected.ok) return { task, selected };
  const guard = await armFinalPublishGuard();
  if (!guard.ok || !guard.armed) {
    return {
      task,
      selected: {
        ok: false,
        blocker: typedBlocker('INPUT_CHANNEL_BROKEN', '最终发布按钮硬保护无法挂载', { retryable: true, evidence: guard }),
      },
    };
  }
  return { task, selected, guard };
}

async function pageRootsState() {
  return await js(String.raw`(() => {
    const compact = value => String(value || '').replace(/\s+/g, ' ').trim()
    const roots = [document, ...[...document.querySelectorAll('*')].map(el => el.shadowRoot).filter(Boolean)]
    const text = roots.map(root => root.body?.innerText || root.host?.innerText || '').join('\n')
    return { url: location.href, title: document.title, text: compact(text), rootCount: roots.length }
  })()`);
}

async function inspectFinalButtons(labels = FINAL_TEXT) {
  return await js(String.raw`((source, flags) => {
    const re = new RegExp(source, flags)
    const compact = value => String(value || '').replace(/\s+/g, ' ').trim()
    const roots = [document, ...[...document.querySelectorAll('*')].map(el => el.shadowRoot).filter(Boolean)]
    return roots.flatMap(root => [...root.querySelectorAll('button, [role="button"], .d-button, .bcc-button, div, span')])
      .map(el => {
        const rect = el.getBoundingClientRect(); const style = getComputedStyle(el)
        const text = compact(el.innerText || el.textContent || '')
        const buttonish = el.tagName === 'BUTTON' || el.getAttribute('role') === 'button' || /button|btn|submit/i.test(String(el.className || ''))
        return { text, disabled: Boolean(el.disabled) || el.getAttribute('aria-disabled') === 'true' || /disabled|loading/.test(String(el.className || '')), buttonish, width: Math.round(rect.width), height: Math.round(rect.height), display: style.display, visibility: style.visibility }
      })
      .filter(item => re.test(item.text) && item.width > 12 && item.height > 12 && item.display !== 'none' && item.visibility !== 'hidden')
      .sort((a, b) => Number(b.buttonish) - Number(a.buttonish) || (a.width * a.height) - (b.width * b.height))
  })(${JSON.stringify(labels.source)}, ${JSON.stringify(labels.flags)})`);
}

async function inspectBlockingDialogs(allowPatterns = []) {
  return await js(String.raw`((allowSources) => {
    const compact = value => String(value || '').replace(/\s+/g, ' ').trim()
    const allowed = allowSources.map(source => new RegExp(source))
    const roots = [document, ...[...document.querySelectorAll('*')].map(el => el.shadowRoot).filter(Boolean)]
    const selectors = '.d-modal-mask, .semi-modal-mask, .bcc-dialog, .bcc-modal, [role="dialog"], [class*="modal-mask"], [class*="dialog-mask"]'
    return roots.flatMap(root => [...root.querySelectorAll(selectors)])
      .map(el => {
        const rect = el.getBoundingClientRect(); const style = getComputedStyle(el)
        const text = compact(el.innerText || el.textContent || '')
        const staleLeaving = /leave-active/.test(String(el.className || '')) && Number(style.opacity) === 0
        return { text: text.slice(0, 600), className: String(el.className || ''), width: rect.width, height: rect.height, opacity: style.opacity, pointerEvents: style.pointerEvents, display: style.display, visibility: style.visibility, staleLeaving }
      })
      .filter(item => item.width > 20 && item.height > 20 && item.display !== 'none' && item.visibility !== 'hidden' && !item.staleLeaving)
      .filter(item => !allowed.some(re => re.test(item.text)))
  })(${JSON.stringify(allowPatterns.map(pattern => pattern.source))})`);
}

async function setNativeInputValue(selector, value) {
  return await js(String.raw`((selector, value) => {
    const el = document.querySelector(selector)
    if (!el) return { ok: false, reason: 'input missing', selector }
    const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set
    if (!setter) return { ok: false, reason: 'native value setter missing' }
    el.focus(); setter.call(el, value)
    el.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true, inputType: 'insertText', data: value }))
    el.dispatchEvent(new Event('change', { bubbles: true, composed: true }))
    el.blur()
    return { ok: el.value === value, value: el.value }
  })(${JSON.stringify(selector)}, ${JSON.stringify(value)})`);
}

async function removeExactStaleMask(textPattern) {
  return await js(String.raw`((source, flags) => {
    const re = new RegExp(source, flags)
    const masks = [...document.querySelectorAll('.d-modal-mask, [class*="modal-mask"]')]
      .filter(el => re.test(el.innerText || el.textContent || ''))
      .filter(el => /leave-active/.test(String(el.className || '')) && Number(getComputedStyle(el).opacity) === 0)
    masks.forEach(el => el.remove())
    return { removed: masks.length }
  })(${JSON.stringify(textPattern.source)}, ${JSON.stringify(textPattern.flags)})`);
}

async function emitObservation(observation) {
  const guard = !activeTaskSpace ? { armed: false, blockedAttempts: 0 } : await inspectFinalPublishGuard().catch(error => ({
    armed: false,
    blockedAttempts: 0,
    error: String(error?.message || error),
  }));
  const payload = {
    schemaVersion: 1,
    platform,
    phase,
    taskSpaceId: activeTaskSpace?.id ?? null,
    taskSpace: activeTaskSpace?.name || taskName,
    taskSpaceRecovery,
    taskSpaceProfile: activeTaskSpaceProfile,
    account: typeof accountBinding !== 'undefined' && accountBinding ? { account: accountBinding.account, label: accountBinding.label, egoProfileId: accountBinding.egoProfileId } : null,
    observedAt: new Date().toISOString(),
    finalPublishClicked: false,
    ...observation,
  };
  // Safety is injected centrally and backed by a page-level capture guard.
  // A blocked attempt keeps the draft unpublished, but intentionally fails READY
  // so accidental final-button interaction cannot pass unnoticed.
  payload.gates ||= {};
  const safetyEvidence = { finalPublishClicked: false, guardArmed: guard.armed === true, blockedAttempts: guard.blockedAttempts || 0, attempts: guard.attempts || [], guardVersion: guard.version || null };
  payload.gates.safety = guard.armed === true && guard.blockedAttempts === 0
    ? okGate(safetyEvidence)
    : failedGate(safetyEvidence);
  delete payload.ready;
  cliLog(V2_RESULT_PREFIX + JSON.stringify(payload));
  return payload;
}
