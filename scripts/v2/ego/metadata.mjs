// Bounded same-job recovery: plain title/description only. The parent owns the
// global and job locks; no other Ego upload/wait process may still be running.
async function runMetadataPhase() {
  const inspect = { xiaohongshu: () => inspectXiaohongshu(), douyin: () => inspectDouyin(), bilibili: () => inspectBilibili(), wechat_channels: () => inspectWechatChannels() }[platform];
  const before = await inspect();
  const refuse = (reason, evidence = {}) => ({ ...before, metadata: { ok: false, reason }, blocker: typedBlocker('STATE_AMBIGUOUS', reason, { retryable: true, evidence }) });
  if (taskSpaceRecovery?.recreated) return refuse('任务空间已重建；先恢复并重新核对上传身份');
  if (!before.gates.authenticated?.ok || !before.gates.draftIdentity?.ok || !before.gates.noBlockingDialog?.ok) return refuse('登录、草稿身份或阻塞弹窗尚未确认', before.gates);
  const guard = await inspectFinalPublishGuard();
  if (!guard.armed || guard.blockedAttempts !== 0) return refuse('最终发布硬保护不可用', guard);
  const video = before.gates.video;
  if (video?.evidence?.failed || (!video?.ok && video?.evidence?.uploading !== true)) return refuse('目标视频尚未进入原生上传状态');
  const target = await js(String.raw`((expected) => {
    const roots = [document, ...[...document.querySelectorAll('*')].map(el => el.shadowRoot).filter(Boolean)];
    const names = roots.flatMap(root => [...root.querySelectorAll('input[type=file]')]).flatMap(el => [...(el.files || [])].map(file => file.name));
    return { matched: names.includes(expected), names };
  })(${JSON.stringify(path.basename(videoPath))})`);
  // Uploading editors often have empty metadata, so draftIdentity alone is weak.
  // Require the actual selected filename (or filename exposed by that platform).
  const named = before.gates.draftIdentity.evidence?.filenameVisible === true || video.evidence?.filenameVisible === true;
  if (!video.ok && !target.matched && !named) return refuse('上传中的目标文件名无法确认；不填写可能属于其他视频的表单', target);
  if (platform === 'wechat_channels') {
    const actual = compactText(before.gates.description?.evidence?.actual);
    if (actual && actual !== compactText(wechatDescription)) return refuse('上传中的视频号存在不匹配的非空描述');
  }
  const actions = {};
  const deferred = [];
  async function ensure(name, action) {
    if (before.gates[name]?.ok) { actions[name] = { ok: true, already: true }; return; }
    const available = await js(String.raw`((metadataField, platformName) => {
      const roots = [document, ...[...document.querySelectorAll('*')].map(el => el.shadowRoot).filter(Boolean)];
      let element;
      if (metadataField === 'title') {
        const selector = platformName === 'bilibili' ? 'input[placeholder*="稿件标题"]' : platformName === 'douyin' ? 'input[placeholder*="作品标题"]' : 'input[placeholder*="填写标题"]';
        element = document.querySelector(selector);
      } else if (metadataField === 'shortTitle') {
        element = roots.flatMap(root => [...root.querySelectorAll('input')]).find(el => (el.placeholder || '').includes('短标题'));
      } else {
        const editors = roots.flatMap(root => [...root.querySelectorAll('[contenteditable="true"],[contenteditable=""]')]);
        element = platformName === 'bilibili' ? editors.find(el => el.classList.contains('ql-editor')) : platformName === 'wechat_channels' ? editors.find(el => /input-editor|视频描述|editor/i.test(String(el.className || '')) && !/chatInput/.test(String(el.className || ''))) : editors.find(el => { const r = el.getBoundingClientRect(); return r.width > 180 && r.height > 50 && !el.closest('[role="dialog"],[class*="modal"],[class*="dialog"]'); });
      }
      if (!element) return { available: false, reason: 'metadata control not present', metadataField };
      const rect = element.getBoundingClientRect(), style = getComputedStyle(element);
      return { available: rect.width > 4 && rect.height > 4 && style.display !== 'none' && style.visibility !== 'hidden' && !element.disabled && !element.readOnly && element.getAttribute('aria-disabled') !== 'true', metadataField };
    })(${JSON.stringify(name)}, ${JSON.stringify(platform)})`);
    if (!available.available) throw new Error(`${name} metadata control is unavailable or disabled`);
    actions[name] = await action();
    if (!actions[name]?.ok) throw new Error(actions[name]?.reason || `${name} metadata action failed`);
  }
  try {
    if (platform === 'xiaohongshu') {
      await ensure('title', () => setNativeInputValue('input[placeholder*="填写标题"]', xhsTitle));
    } else if (platform === 'douyin') {
      await ensure('title', () => setDouyinTitle());
      const tags = before.gates.tags?.evidence || {};
      if (!before.gates.description?.ok && ((tags.selected || []).length || (tags.duplicates || []).length)) {
        deferred.push('description: existing topic entities preserved; use ordinary mutate after upload');
      } else await ensure('description', () => clearAndFillDouyinBody());
    } else if (platform === 'bilibili') {
      await ensure('title', () => setNativeInputValue('input[placeholder*="稿件标题"]', bilibiliTitle));
      await ensure('description', () => setBilibiliDescriptionV2());
    } else if (platform === 'wechat_channels') {
      await ensure('description', () => setWechatDescription());
      await ensure('shortTitle', () => clearWechatShortTitle());
    }
  } catch (error) {
    return { ...(await inspect()), actions, metadata: { ok: false, deferred }, blocker: typedBlocker('ACTION_FAILED', String(error?.message || error), { evidence: actions }) };
  }
  const after = await inspect();
  const fields = Object.keys(actions);
  const verified = fields.every(name => after.gates[name]?.ok === true);
  return {
    ...after, actions,
    metadata: { ok: verified && deferred.length === 0, fields, deferred, verified, uploadComplete: after.gates.video?.ok === true, finalPublishClicked: false, liveAcceptance: 'pending' },
    ...(!verified ? { blocker: typedBlocker('STATE_AMBIGUOUS', '填写后的标题/简介未通过页面复核', { evidence: Object.fromEntries(fields.map(name => [name, after.gates[name]])) }) } : {}),
  };
}
