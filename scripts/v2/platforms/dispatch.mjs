// Destination-account gate (Douyin + Xiaohongshu): verify before and after every
// phase. Other platforms keep their own contracts and require manual checks.
async function verifyTargetAccount() {
  if (platform === 'douyin') return await verifyDouyinTargetAccount();
  if (platform === 'xiaohongshu') return await verifyXiaohongshuTargetAccount();
  return null;
}

async function runAccountGuardedPlatformPhase() {
  if (platform !== 'douyin' && platform !== 'xiaohongshu') return phase === 'metadata' ? await runMetadataPhase() : await runPlatformPhase();
  const before = await verifyTargetAccount();
  if (!before.ok) return { gates: { targetAccount: { ok: false, evidence: before.evidence } }, blocker: before.blocker };
  const result = phase === 'metadata' ? await runMetadataPhase() : await runPlatformPhase();
  // A native upload can take minutes. Never return its pre-upload identity proof
  // as current account evidence; independently recheck after the phase as well.
  const after = await verifyTargetAccount();
  result.gates ||= {};
  result.gates.targetAccount = { ok: after.ok === true, evidence: after.evidence };
  if (!after.ok) result.blocker = after.blocker;
  return result;
}

const prepared = await preparePlatform();
if (!prepared.selected.ok) {
  await emitObservation({
    blocker: prepared.selected.blocker,
    gates: {
      ...(platform === 'douyin' || platform === 'xiaohongshu' ? { targetAccount: failedGate({ reason: 'page unavailable' }) } : {}),
      authenticated: failedGate({ reason: 'page unavailable' }),
      draftIdentity: failedGate({ reason: 'page unavailable' }),
      video: failedGate({ reason: 'page unavailable' }),
    },
  });
} else {
  const result = await runAccountGuardedPlatformPhase();
  await emitObservation(result);
}
