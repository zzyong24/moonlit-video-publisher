import test from "node:test";
import assert from "node:assert/strict";
import { BLOCKER, classifyVerdict, evaluateObservation, requiredGates } from "../lib/model.mjs";

function accountEvidence(platform) {
  const identity = platform === "xiaohongshu" ? { name: "Fixture XHS Creator", xhsId: "fixture_xhs_id" } : { name: "Fixture Creator", douyinId: "fixture_creator_id" };
  const sourceUrl = platform === "xiaohongshu" ? "https://creator.xiaohongshu.com/new/home" : "https://creator.douyin.com/creator-micro/home";
  return { expected: identity, actual: { ...identity }, method: "creator-home-dom", scopeConfirmed: true, observedAt: new Date().toISOString(), sourceUrl, taskSpaceId: 1, taskSpaceName: "fixture space" };
}

function observation(platform, overrides = {}) {
  const gates = Object.fromEntries(requiredGates(platform).map(name => [name, {
    ok: true,
    evidence: name === "safety" ? { finalPublishClicked: false, guardArmed: true, blockedAttempts: 0 } : name === "targetAccount" ? accountEvidence(platform) : {},
  }]));
  return { platform, phase: "verify", taskSpaceId: 1, taskSpace: "fixture space", gates: { ...gates, ...(overrides.gates || {}) }, blocker: overrides.blocker || null };
}

test("READY is computed only when every required gate is verified", () => {
  const verdict = evaluateObservation(observation("xiaohongshu"));
  assert.equal(verdict.ready, true);
  assert.deepEqual(verdict.missing, []);
});

test("an action cannot claim READY when cover evidence is missing", () => {
  const verdict = evaluateObservation(observation("xiaohongshu", { gates: { cover: { ok: false, evidence: { receipt: null } } } }));
  assert.equal(verdict.ready, false);
  assert.deepEqual(verdict.missing, ["cover"]);
  assert.equal(verdict.blocker.code, BLOCKER.STATE_AMBIGUOUS);
  assert.equal(classifyVerdict(verdict), "needs_mutation");
});

test("foreign Bilibili drafts enter quarantine instead of user blocking", () => {
  const verdict = evaluateObservation(observation("bilibili", { gates: { draftIdentity: { ok: false, evidence: { foreign: true } } } }));
  assert.equal(verdict.blocker.code, BLOCKER.FOREIGN_DRAFT);
  assert.equal(classifyVerdict(verdict), "needs_quarantine");
});

test("typed risk-control blocker wins over otherwise missing gates", () => {
  const verdict = evaluateObservation(observation("wechat_channels", {
    gates: { video: { ok: false, evidence: { initToast: true } } },
    blocker: { code: BLOCKER.RISK_CONTROL, message: "SDK unavailable", retryable: true },
  }));
  assert.equal(verdict.ready, false);
  assert.equal(verdict.blocker.code, BLOCKER.RISK_CONTROL);
});

test("a broken Ego input channel blocks instead of scheduling a video upload", () => {
  const verdict = evaluateObservation(observation("douyin", {
    gates: { video: { ok: false, evidence: { reason: "ego runner unavailable" } } },
    blocker: { code: BLOCKER.INPUT_CHANNEL_BROKEN, message: "Ego Lite exited", retryable: true },
  }));
  assert.equal(verdict.ready, false);
  assert.equal(verdict.blocker.code, BLOCKER.INPUT_CHANNEL_BROKEN);
  assert.equal(classifyVerdict(verdict), "blocked");
});

test("READY rejects a self-reported safety gate without an armed page guard", () => {
  const verdict = evaluateObservation(observation("xiaohongshu", {
    gates: { safety: { ok: true, evidence: { finalPublishClicked: false, guardArmed: false, blockedAttempts: 0 } } },
  }));
  assert.equal(verdict.ready, false);
  assert.deepEqual(verdict.missing, ["safety"]);
});

test("READY rejects any attempted final-publish interaction even when it was blocked", () => {
  const verdict = evaluateObservation(observation("xiaohongshu", {
    gates: { safety: { ok: true, evidence: { finalPublishClicked: false, guardArmed: true, blockedAttempts: 1 } } },
  }));
  assert.equal(verdict.ready, false);
  assert.deepEqual(verdict.missing, ["safety"]);
});


test("content-only drafts cannot become READY and need review instead of another upload", () => {
  const verdict = evaluateObservation(observation("douyin", { gates: { publishReview: { ok: false, evidence: { stage: "content" } } } }));
  assert.equal(verdict.ready, false);
  assert.deepEqual(verdict.missing, ["publishReview"]);
  assert.equal(classifyVerdict(verdict), "needs_review");
});

test('metadata phases and metadata-only first inspection cannot grant READY while preserving real gate truth', () => {
  for (const overrides of [{ phase: 'metadata' }, { phase: 'inspect', preparationMode: 'metadata_only' }]) {
    const actual = { ...observation('xiaohongshu'), ...overrides };
    const verdict = evaluateObservation(actual);
    assert.equal(verdict.ready, false);
    assert.equal(verdict.preparationOnly, true);
    assert.equal(verdict.requiresFullVerification, true);
    assert.deepEqual(verdict.missing, []);
    assert.equal(verdict.blocker, null);
    assert.equal(Object.values(verdict.gates).every(gate => gate.ok === true), true);
    assert.equal(classifyVerdict(verdict), 'needs_verification');
  }
  assert.equal(evaluateObservation(observation('xiaohongshu')).ready, true);
});
