// Selectors are scoped to the creator-home identity header observed in the real
// editor. Never find a nickname/ID in the bio, video text, or another container.
function readDouyinCreatorHomeDom() {
  const visible = element => {
    const rect = element.getBoundingClientRect(), style = getComputedStyle(element);
    return rect.width > 4 && rect.height > 4 && style.display !== 'none' && style.visibility !== 'hidden';
  };
  const byPrefix = (root, prefix) => [...root.querySelectorAll('div')].filter(element => [...element.classList].some(value => value.startsWith(prefix)) && visible(element));
  const candidates = byPrefix(document, 'header-').map(header => {
    const names = byPrefix(header, 'name-'), ids = byPrefix(header, 'unique_id-');
    if (names.length !== 1 || ids.length !== 1) return null;
    const idText = String(ids[0].innerText || ids[0].textContent || '').trim();
    const match = idText.match(/^抖音号\s*[:：]\s*(\S+)\s*$/);
    const name = String(names[0].innerText || names[0].textContent || '').trim();
    return match && name ? { name, douyinId: match[1] } : null;
  }).filter(Boolean);
  return { actual: candidates.length === 1 ? candidates[0] : null, scopeConfirmed: candidates.length === 1, candidateCount: candidates.length, sourceUrl: location.href };
}

async function verifyDouyinTargetAccount() {
  const invalid = validateExpectedDouyinAccount(pkg);
  if (invalid.length) return evaluateDouyinAccountProof(pkg, {}, activeTaskSpace);
  if (!activeTaskSpace?.id || activeTaskSpace.name !== taskName) return evaluateDouyinAccountProof(pkg, {}, activeTaskSpace);
  const home = 'https://creator.douyin.com/creator-micro/home';
  let returnTab;
  let takenOver = false;
  try {
    const task = await taskSpace(activeTaskSpace.id);
    if (Number(task.spaceId) !== Number(activeTaskSpace.id) || task.name !== activeTaskSpace.name) return evaluateDouyinAccountProof(pkg, {}, activeTaskSpace);
    const tabs = await task.tabs();
    const editors = tabs.filter(tab => /^https:\/\/creator\.douyin\.com\/creator-micro\/content\//.test(tab.url || ''));
    returnTab = editors.find(tab => tab.active) || (editors.length === 1 ? editors[0] : null);
    if (!returnTab?.targetId) return evaluateDouyinAccountProof(pkg, {}, activeTaskSpace);
    // Reuse only a managed, read-only home Page. Never reload or navigate the
    // editor containing a native upload, even if it is currently hidden.
    const existing = tabs.find(tab => tab.label && /^https:\/\/creator\.douyin\.com\/creator-micro\/home(?:[?#]|$)/.test(tab.url || ''));
    const page = existing ? task.page(existing.label) : await task.newPage();
    if (existing) await page.reload({ timeout: 15000, waitUntil: 'domcontentloaded' });
    else await page.goto(home, { timeout: 15000, waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => [...document.querySelectorAll('div')].some(element => [...element.classList].some(value => value.startsWith('unique_id-')) && /^抖音号\s*[:：]/.test(String(element.innerText || element.textContent || '').trim())), undefined, { timeout: 8000 });
    const observed = await page.evaluate(readDouyinCreatorHomeDom);
    const profileId = typeof activeTaskSpaceProfile !== 'undefined' && activeTaskSpaceProfile ? activeTaskSpaceProfile.profileId : undefined;
    const verdict = evaluateDouyinAccountProof(pkg, { ...observed, method: 'creator-home-dom', observedAt: new Date().toISOString(), taskSpaceId: activeTaskSpace.id, taskSpaceName: activeTaskSpace.name, accountPageLabel: page.label, ...(profileId ? { profileId } : {}) }, activeTaskSpace);
    // The final preview shows this header screenshot next to "将发到：账号/昵称/ID".
    if (verdict.ok && typeof captureAccountHeader === 'function') {
      const shot = await captureAccountHeader(page, pkg.account || 'target');
      verdict.evidence.screenshotPath = shot.path;
      if (shot.error) verdict.evidence.screenshotError = shot.error;
    }
    return verdict;
  } catch (error) {
    if (/user (?:has|had) taken control|user took control|user is controlling|user controls|user-controlled|owned by (?:the )?user|用户.*控制|not assigned to an agent|task space.*inactive/i.test(String(error?.message || error))) { takenOver = true; throw error; }
    const failed = evaluateDouyinAccountProof(pkg, {}, activeTaskSpace);
    failed.evidence.readError = String(error?.message || error).slice(0, 300);
    return failed;
  } finally {
    if (returnTab?.targetId && !takenOver) await switchTab(returnTab.targetId);
  }
}
