// Xiaohongshu destination-account check (月明 2026-10-21). Reads the creator
// center home header in a dedicated read-only Page of the same task space: the
// nickname plus the stable "小红书账号/小红书号：xxx" ID. The ID line must be a
// single visible leaf; the nickname must be the only visible `*name*` element
// inside the same small header container. Bio/notes/other containers never count.
// Selectors have fixture coverage only; live creator-page acceptance is pending.
function readXiaohongshuCreatorHomeDom() {
  const ID_RE = /^小红书(?:账号|号)\s*[:：]\s*([A-Za-z0-9_.\-]+)\s*$/;
  const visible = element => {
    if (!element || typeof element.getBoundingClientRect !== 'function') return false;
    const rect = element.getBoundingClientRect(), style = getComputedStyle(element);
    return rect.width > 4 && rect.height > 4 && style.display !== 'none' && style.visibility !== 'hidden';
  };
  const text = element => String(element.innerText || element.textContent || '').trim();
  const classes = element => [...(element.classList || [])].map(value => String(value).toLowerCase());
  const idNodes = [...document.querySelectorAll('div, span, p')].filter(element => visible(element) && ID_RE.test(text(element)) && ![...element.querySelectorAll('div, span, p')].some(child => ID_RE.test(text(child))));
  const candidates = idNodes.map(idNode => {
    const idMatch = text(idNode).match(ID_RE);
    let container = idNode.parentElement;
    for (let depth = 0; container && depth < 4; depth++, container = container.parentElement) {
      const names = [...container.querySelectorAll('div, span, p')].filter(element => element !== idNode && visible(element)
        && classes(element).some(value => /(^|[-_])(nick)?name($|[-_])|nickname|user-?name/.test(value))
        && text(element) && text(element).length <= 40 && !ID_RE.test(text(element)));
      if (names.length === 1) return { name: text(names[0]), xhsId: idMatch[1] };
      if (names.length > 1) return null;
    }
    return null;
  }).filter(Boolean);
  const unique = [...new Map(candidates.map(item => [`${item.name}\u0000${item.xhsId}`, item])).values()];
  const scoped = idNodes.length === 1 && unique.length === 1;
  return { actual: scoped ? unique[0] : null, scopeConfirmed: scoped, candidateCount: idNodes.length, sourceUrl: location.href };
}

async function verifyXiaohongshuTargetAccount() {
  const invalid = validateExpectedXiaohongshuAccount(pkg);
  if (invalid.length) return evaluateXiaohongshuAccountProof(pkg, {}, activeTaskSpace);
  if (!activeTaskSpace?.id || activeTaskSpace.name !== taskName) return evaluateXiaohongshuAccountProof(pkg, {}, activeTaskSpace);
  const home = 'https://creator.xiaohongshu.com/new/home';
  let returnTab;
  let takenOver = false;
  try {
    const task = await taskSpace(activeTaskSpace.id);
    if (Number(task.spaceId) !== Number(activeTaskSpace.id) || task.name !== activeTaskSpace.name) return evaluateXiaohongshuAccountProof(pkg, {}, activeTaskSpace);
    const tabs = await task.tabs();
    const editors = tabs.filter(tab => /^https:\/\/creator\.xiaohongshu\.com\/publish\//.test(tab.url || ''));
    returnTab = editors.find(tab => tab.active) || (editors.length === 1 ? editors[0] : null);
    if (!returnTab?.targetId) return evaluateXiaohongshuAccountProof(pkg, {}, activeTaskSpace);
    // Never reload or navigate the editor holding an upload; use a separate home Page.
    const existing = tabs.find(tab => tab.label && /^https:\/\/creator\.xiaohongshu\.com\/new\/home(?:[?#/]|$)/.test(tab.url || ''));
    const page = existing ? task.page(existing.label) : await task.newPage();
    if (existing) await page.reload({ timeout: 15000, waitUntil: 'domcontentloaded' });
    else await page.goto(home, { timeout: 15000, waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => [...document.querySelectorAll('div, span, p')].some(element => /^小红书(?:账号|号)\s*[:：]/.test(String(element.innerText || element.textContent || '').trim())), undefined, { timeout: 8000 });
    // Live 2026-10-21: the ID text can exist before layout makes it visible, so the
    // first read may see 0 visible candidates. Re-read (still read-only) for up to
    // ~6s until one scoped identity or an ambiguous (>1) header appears; the final
    // observation is still judged fail-closed below.
    let observed = await page.evaluate(readXiaohongshuCreatorHomeDom);
    for (let attempt = 0; attempt < 12 && !observed?.actual && !(observed?.candidateCount > 1); attempt++) {
      await new Promise(resolve => setTimeout(resolve, 500));
      observed = await page.evaluate(readXiaohongshuCreatorHomeDom);
    }
    const profileId = typeof activeTaskSpaceProfile !== 'undefined' && activeTaskSpaceProfile ? activeTaskSpaceProfile.profileId : undefined;
    const verdict = evaluateXiaohongshuAccountProof(pkg, { ...observed, method: 'creator-home-dom', observedAt: new Date().toISOString(), taskSpaceId: activeTaskSpace.id, taskSpaceName: activeTaskSpace.name, accountPageLabel: page.label, ...(profileId ? { profileId } : {}) }, activeTaskSpace);
    if (verdict.ok && typeof captureAccountHeader === 'function') {
      const shot = await captureAccountHeader(page, pkg.account || 'target');
      verdict.evidence.screenshotPath = shot.path;
      if (shot.error) verdict.evidence.screenshotError = shot.error;
    }
    return verdict;
  } catch (error) {
    if (/user (?:has|had) taken control|user took control|user is controlling|user controls|user-controlled|owned by (?:the )?user|用户.*控制|not assigned to an agent|task space.*inactive/i.test(String(error?.message || error))) { takenOver = true; throw error; }
    const failed = evaluateXiaohongshuAccountProof(pkg, {}, activeTaskSpace);
    failed.evidence.readError = String(error?.message || error).slice(0, 300);
    return failed;
  } finally {
    if (returnTab?.targetId && !takenOver) await switchTab(returnTab.targetId);
  }
}
