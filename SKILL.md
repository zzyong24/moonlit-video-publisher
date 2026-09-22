---
name: moonlit-video-publisher
description: Prepare, verify, and—after explicit current-run authorization—publish videos to Xiaohongshu, Douyin, Bilibili, and WeChat Channels with Ego Lite. Use for onboarding, video intake, platform copy and tags, upload scheduling, draft recovery, original declarations, provided cover assets, workflow extensions, READY verification, and guarded final publication.
metadata:
  version: "2.3.0"
  updated: "2026-09-20"
---

# 月明·四平台视频发布

Prepare one confirmed video package and drive selected creator platforms to a verified draft state. After a separate explicit authorization in the current run, publish serially and verify each platform result. Use Ego Lite for all live creator-page work.

## Configuration And Onboarding

At the start of every invocation, before inspecting a video or opening a browser, run:

```bash
node scripts/config.mjs status
```

If `onboardingRequired` is `true`, stop the publishing flow and onboard the user. Ask first which supported creator platforms the user actually has; require at least one and never assume all four. Then ask which of those available platforms should run by default, proposing all available platforms as the default subset. Ask for Douyin topics only when Douyin is available and Bilibili automatic tags only when Bilibili is available. Collect the source directory, shared copy/tag preferences, and whether every video may truthfully be declared original; keep concurrency `4/4` and platform cover as proposed defaults unless the user changes them. Summarize the choices before writing. Save available accounts with repeatable `--available-platform` flags and defaults with repeatable `--platform` flags, run `validate`, and continue only when `onboardingRequired` is `false`.

Configuration is per user at `$XDG_CONFIG_HOME/video-publisher/config.json`, or `$HOME/.config/video-publisher/config.json`. `VIDEO_PUBLISHER_CONFIG` overrides the path. These legacy internal paths remain unchanged so existing user settings and recovery state continue to work after the Skill was renamed to `moonlit-video-publisher`. Never put a user's configuration inside the shareable Skill folder.

An explicit current request overrides the package; explicit package fields override configuration defaults. A current request may select any configured available platform, but it cannot silently add an unavailable platform: update onboarding and confirm that account first. The onboarding configuration may persist the user's truthful standing originality policy and declared platform availability, but never cookies, credentials, video-specific paths, or final-publish authorization. Read [references/configuration.md](references/configuration.md) for the schema and onboarding command.

## Safety Boundary

Never click the final `发布`, `发布笔记`, `发表`, or `立即投稿` control unless the user explicitly authorizes publishing in the current run. Uploading and preparing a draft do not imply permission to publish. The maintained runner mounts a page-level capture guard for all four labels; `READY` requires evidence that the guard is armed and that it blocked zero attempts.

Before enabling any `原创`, `自制`, or equivalent declaration, require one of two truthful signals: the onboarded `declarations.originalityPolicy` is `all_videos_original`, or the user confirms the current video and the run passes `--confirm-original-rights`. Never infer either signal from the video itself. If neither is available, stop: non-original declaration modes are outside the current live-tested boundary.

Treat `all_videos_original` as a reusable content policy, not permission to publish. The final publish controls still require explicit authorization in the current run and that authority is never persisted. `ask_each_run` remains the generic onboarding default for shared installations.

Stop only when every selected platform is either:

- `ready`: every required gate is verified from fresh page evidence; or
- blocked by a typed condition that genuinely requires the user or a later retry.

Never turn “an action was attempted” into success. A title, tag, declaration, setting, or cover is complete only after a fresh verifier confirms the resulting page state.

## Production Architecture

Use the stateful production entry:

```bash
scripts/run-safe-platforms.sh <package.json> [task-suffix] [platform...]
```

This invokes `scripts/v2/publisher.mjs`. The older Agent-per-platform implementation and its runners have been removed. Do not recreate them.

Use one orchestrator and one Ego Lite task space per platform. Do not delegate live browser control to sub Agents. Agents may help prepare copy or inspect saved artifacts, but they must not control creator tabs.

The publisher first acquires one state-root publisher lock, then one atomic job-directory lock, before any state write or browser phase. Only one video job may control the shared creator accounts at a time; a second job or duplicate invocation must fail immediately while the owner continues. Locks whose recorded PID is dead are stale and may be removed automatically. Keep the separate platform locks as defense in depth. This global job serialization does not reduce the intended four-platform parallelism inside the owning video job.

Schedule by resource type:

```text
read-only inspect: parallel, default 4
video upload and platform processing wait: parallel, default 4
metadata, topic, declaration, setting, and cover mutation: serial, exactly 1
final verification: parallel, default 4
```

The upload phase is a barrier: no UI mutation starts until every selected upload runner has exited. An upload runner may exit only after the platform proves completion. A preview card alone is insufficient when progress text, a percentage, processing text, or `取消上传` remains visible.

Treat the Ego input channel as shared failure state. If any parallel phase returns `INPUT_CHANNEL_BROKEN`, wait for the other runners to exit, then skip every remaining quarantine, upload, and mutation in that invocation. Run only final read-only verification so the persisted job records page truth; resume through the ordinary same-job command after Ego restarts.

Custom-cover dialogs also use the single UI queue. Isolated task spaces do not make concurrent clicking safe.

Accepted cover receipts are written to atomic, fingerprint-bound checkpoints inside the job directory before an adapter returns. This closes the crash window between a successful creator-page mutation and the orchestrator recording its result. A resumed run still has to match the checkpoint against fresh page truth.

Job state also keeps a one-generation atomic backup. If `state.json` is invalid JSON, restore only a backup whose package fingerprint matches, preserve the corrupt primary as `state.corrupt-<timestamp>.json`, and then re-inspect every platform. Never turn restored state into `READY` without fresh page verification.

## Browser Rules

- Use `ego-browser`; do not fall back to Chrome control.
- Verify the exact local video and cover paths before opening creator pages.
- Inspect before acting and reuse only a draft whose identity matches the package.
- Preserve both the numeric task-space id and the exact stable task-space name in persisted job state. A recycled id whose live name differs belongs to another job; select or recreate only the recorded exact name.
- Leave task spaces open by default so the user can review drafts.
- Use hand-written Ego heredocs only after the maintained runner reports a blocker, and fold repeatable fixes back into the adapter.
- If Ego reports that the user took control, stop all browser work. Resume only after the user explicitly says to continue, then claim the recorded task space.

Read [references/ego-browser-workflow.md](references/ego-browser-workflow.md) before browser diagnosis or adapter changes.
For interrupted runs, missing cover receipts, or final publication, follow [references/automatic-publishing-playbook.md](references/automatic-publishing-playbook.md) before using hand-written browser commands.

## Custom Workflow Extensions

When the user asks to add, remove, reorder, or customize a publishing step—for example, “在抖音填完标题后点击某个按钮”—read [references/customizing-workflows.md](references/customizing-workflows.md) before diagnosing the page or editing an adapter.

Use the extension workflow to turn the request into an idempotent `inspect -> action -> verify` step backed by real creator-page evidence. Classify the behavior as a generic adapter repair, an explicit package/config option, or a private per-user default before choosing where it belongs. Never encode personal account data in the shareable Skill, and never let a customization bypass final-publish authorization, truthful originality policy, task-space ownership, or the shared safety gate.

## Phases And Evidence

The platform runner exposes only these phases:

```text
inspect: read page truth; no mutation
quarantine: Bilibili only; resolve or preserve an old draft
upload: upload only when the target video is not already present
mutate: repair metadata, entities, declarations, settings, and covers
verify: independently re-read every required gate
```

Do not use the removed `fill`, `check-only`, `repair-only`, `upload-only`, or `quarantine-only` interfaces.

`ready` is computed centrally. Platform adapters cannot set it themselves. Every result also carries `finalPublishClicked: false` and a safety gate injected by the shared core.

Required evidence includes:

```text
authenticated session
correct draft identity
video upload fully complete
exact platform text and tag/entity state
required original/self-made declarations
required account settings
custom-cover receipt when enabled
no blocking dialog
visible, enabled final button
final publish not clicked
```

Read [references/platform-common.md](references/platform-common.md) for the shared gate and blocker contract.

## Bilibili Draft Recovery

Treat Bilibili’s local restore banner as unresolved identity, not a clean upload page.

1. Open `继续编辑`.
2. If the resumed filename/title matches the package, reuse it.
3. If it is another video, click `存草稿`, return to a clean upload page, and verify the old editor is gone.
4. Upload the target only after that clean state is proven.

Distinguish “some video is uploaded” from “the target video is uploaded”. This exact distinction prevents foreign drafts from bypassing quarantine.

## Content Package

Use the onboarded configuration as defaults, then confirm the source video, platform selection from `availablePlatforms`, title, tags, any unresolved rights/declaration status, and existing-cover upload intent before browser automation. Newlines in JSON fields must be real newline characters.

Use platform-native defaults:

```text
Xiaohongshu: short title, real topic entities, no prose body by default, original declaration
Douyin: title/body plus 1-5 package-supplied topic entities
Bilibili: title, concise description, tag chips, self-made declarations
WeChat Channels: description begins with title and plain hashtags; leave short title empty
```

The package may come from any video-production pipeline. Record its `productionMode` when provided (for example, `html_explainer`), but do not apply production-specific editing rules inside this Skill. A confirmed video path is immutable during publishing; if the video or cover needs revision, stop and return it to the producing Skill, then build a new package fingerprint.

This Skill does not create or edit cover artwork. When the user supplies existing cover files and explicitly enables `cover.uploadCustomCover: true`, validate the mapped file paths and ratios before upload:

```text
Xiaohongshu: 3:4
Douyin: 3:4 and 4:3
Bilibili: 4:3
WeChat Channels: 3:4 and 4:3
```

Run `scripts/check-package.mjs` for every selected platform before browser work. The validator reads MP4/M4V/MOV duration directly from ISO BMFF metadata without `ffprobe`. For Douyin, reject content longer than the real-tested 900-second boundary before Ego Lite starts; allow only 0.1 seconds of container-metadata rounding because a standard 15:00 stream copy reported 900.010 seconds and passed the real upload. Do not automatically trim or transcode the user's media. This duration rule is platform-specific and must not block the other selected platforms.

## Default Flow

1. Load configuration and complete onboarding, including available and default platform selection, when required.
2. Identify the exact local source and any subtitle variant.
3. Propose and confirm the package and selected platforms.
4. Validate any user-supplied cover assets before browser work.
5. Validate each platform package.
6. Run the production orchestrator.
7. Let it inspect in parallel and quarantine Bilibili when required.
8. Let all missing video uploads run in parallel and fully settle.
9. Let the single UI queue repair metadata, declarations, settings, and covers.
10. Run independent parallel verification.
11. Leave every verified draft open before its final button.

If the user explicitly authorizes final publication in the current run, continue with [references/final-publish.md](references/final-publish.md). This is a separate guarded phase after `READY`; never infer it from draft preparation, originality confirmation, or a previous run.

For read-only job inspection:

```bash
scripts/run-safe-platforms.sh <package.json> [task-suffix] [platform...] --inspect-only
```

For one-platform adapter diagnosis, use `scripts/v2/run-platform.mjs` as documented in [references/scripts.md](references/scripts.md).

## 验证范围

历史实测记录见 [发布回归证据](references/live-validation-history.md)，仅在兼容性判断、恢复故障或修改适配器时读取。历史通过不代表当前页面仍兼容；本次成功仍需现场核验。单元测试不替代真实页面证据，本次架构维护不执行外部发布。

## Reference Map

- [references/intake-workflow.md](references/intake-workflow.md): source selection and package drafting.
- [references/configuration.md](references/configuration.md): per-user schema, onboarding, precedence, and privacy boundary.
- [references/cover-workflow.md](references/cover-workflow.md): upload of existing cover assets, ratio mapping, and receipts.
- [references/ego-browser-workflow.md](references/ego-browser-workflow.md): Ego Lite task spaces, upload channels, handoff, and diagnostics.
- [references/platform-common.md](references/platform-common.md): orchestration, gates, blockers, and concurrency.
- [references/final-publish.md](references/final-publish.md): current-run authorization, serialized final controls, and platform success evidence.
- [references/automatic-publishing-playbook.md](references/automatic-publishing-playbook.md): same-job recovery, cover-receipt recovery, semantic control targeting, final submission, and distribution recording.
- [references/scripts.md](references/scripts.md): production and diagnostic commands.
- [references/platform-xiaohongshu.md](references/platform-xiaohongshu.md): Xiaohongshu adapter contract.
- [references/platform-douyin.md](references/platform-douyin.md): Douyin adapter contract.
- [references/platform-bilibili.md](references/platform-bilibili.md): Bilibili adapter and draft quarantine contract.
- [references/platform-wechat-channels.md](references/platform-wechat-channels.md): Wujie lifecycle activation, upload truth, original declaration, cover flow, and retry recovery.

Default source directory comes from configuration; `VIDEO_PUBLISHER_SOURCE_DIR` may override it for `find-video.mjs`.
