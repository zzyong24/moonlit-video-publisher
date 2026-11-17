---
name: moonlit-video-publisher
description: "Prepare, verify, and publish one confirmed video to Xiaohongshu, Douyin, Bilibili, WeChat Channels and YouTube with Ego Lite (four-platform orchestrator plus verified YouTube operator flow) — each platform item only after 月明 reviews its final preview and explicitly approves that specific item (per-item approval, never reused; report the published link afterwards). Use when the user asks to 发视频、上传到抖音/小红书/B站/视频号/YouTube、填平台文案与标签、恢复草稿、核验 READY 或审核通过后发布。Covers are provided assets; use gbro-cover-design when new artwork is needed. Not for creating or editing cover artwork, editing videos, or publishing graphic notes/X threads (moonlit-social-publisher)."
metadata:
  version: "2.9.1"
  updated: "2026-11-16"
---

# 月明·视频发布

**三审必读（文案确认即触发）**：文案确认后按当前激活 `moonlit-content-engine/references/publish-review.md` 实际执行guoshen的script文本审核，不强审初稿、不等成片；音画/封面/平台设置明确未审。上传前content审完整实际包并验证script；草稿上传后final审原生设置和封面实际呈现并验证前两阶段。文案改变使相关旧证据失效；每阶段不能替代后续审核、用户授权或平台裁决。旧v1回执须实际补审，不静默升级；调用门禁必须带 `--require-chain-version 2`。


Prepare one confirmed video package and drive selected creator platforms to a verified draft state. After 月明 reviews the final preview of each platform item and explicitly approves that specific item, publish serially, verify each platform result, and report the link. Use Ego Lite for all live creator-page work.

**发布键在月明（团队规则 2026-10-21，优先于本文其他条款）**：可以自动发布，但**每一条**都要先给月明看最终预览，月明对这一条明确批准后才点最终按钮；以前的批准、其他作品或其他平台的批准都不能复用；发布后把链接报给月明。本文里所有“current-run authorization / 本次授权”都按这条理解：一份批准只对一个作品 × 一个平台 × 一个内容指纹有效。完整流程与批准记录格式见 [逐条发布批准](references/per-item-approval.md)，点最终按钮前必须跑 `node scripts/check-approval.mjs`。

**登录态**：只在月明本人 Mac 上已登录的浏览器任务空间里操作；不读取、不导出、不保存 Cookie、Token 或浏览器资料。

## 发布前必需审核

内容进入发布准备，先按名称解析当前激活 `moonlit-content-engine`，读取其 `references/publish-review.md`，并实际运行依赖 `guoshen`。通读正文或独立语音/字幕及全画面，审核目标平台的当前规则、封面、渠道文案和发布设置；上传前完成内容、封面文件、渠道文案及声明意图的报告与版本绑定回执，content门禁通过才上传未发布草稿并填表；上传后核实际设置及封面裁切，final门禁通过才进入READY或最终提交。仅上传后出现的设置与裁切明确延期，不伪称已查，不反复索取已有上传授权。修复、换平台、文案/媒体/设置变化后重审；审核缺失、未完成或不通过不能继续外发。手工浏览器路径、续发、恢复和直接CLI也遵守同一门禁；本地排版/只读检查可先执行。上游不支持的公众号、X等按合同补充对应平台审核，不能套用视频号结论。

执行发布命令前，按激活目录设置 `MOONLIT_GUOSHEN_GATE`、`MOONLIT_GUOSHEN_DIR`、`MOONLIT_GUOSHEN_RECEIPT`。共享门禁只验证回执，不能替代实际语义审核；通过也不代替月明对这一条的批准。

## YouTube routing (2.9.0)

For an explicit YouTube request, or an authorized “all platforms” request whose private `youtube.json` has `enabled` and `includeInAllPlatforms`, read [the YouTube workflow](references/platform-youtube.md) before opening Studio. It supplies a separate reviewed package, intended channel verification, native audience/AI/settings review, guarded one-shot publication and watch-page playback verification. Read its private preferences at the same configuration root as `config.json`; they store availability and identity only. This fifth destination uses the verified Ego operator flow; the four-platform CLI/config arrays remain limited to their automatic adapters. Do not pass YouTube to the four-platform runner, silently omit it from an explicit request, duplicate already submitted platforms, or bypass three-stage review. Explicit current platform selection always wins over defaults.

## Configuration And Onboarding

At the start of every invocation, before inspecting a video or opening a browser, run:

```bash
node scripts/config.mjs status
```

For a YouTube-only request, follow its independent private-preferences onboarding; a missing four-adapter config must not require unused domestic accounts. For any selected automatic adapter, if `onboardingRequired` is `true`, stop that publishing flow and onboard the user. Ask first which supported creator platforms the user actually has; require at least one and never assume all four. Then ask which of those available platforms should run by default, proposing all available platforms as the default subset. Ask for Douyin topics only when Douyin is available and Bilibili automatic tags only when Bilibili is available. Collect the source directory, shared copy/tag preferences, and whether every video may truthfully be declared original; keep concurrency `4/4` and platform cover as proposed defaults unless the user changes them. Summarize the choices before writing. Save available accounts with repeatable `--available-platform` flags and defaults with repeatable `--platform` flags, run `validate`, and continue only when `onboardingRequired` is `false`.

Configuration is per user at `$XDG_CONFIG_HOME/video-publisher/config.json`, or `$HOME/.config/video-publisher/config.json`. `VIDEO_PUBLISHER_CONFIG` overrides the path. These legacy internal paths remain unchanged so existing user settings and recovery state continue to work after the Skill was renamed to `moonlit-video-publisher`. Never put a user's configuration inside the shareable Skill folder.

An explicit current request overrides the package; explicit package fields override configuration defaults. A current request may select any configured available platform, but it cannot silently add an unavailable platform: update onboarding and confirm that account first. The onboarding configuration may persist the user's truthful standing originality policy and declared platform availability, but never cookies, credentials, video-specific paths, or final-publish authorization. Read [references/configuration.md](references/configuration.md) for the schema and onboarding command.

## Destination Account Before Packaging

**账号按 Ego Profile 隔离（月明 2026-10-21）**：默认一律发大号；只有月明明确说「小号」才在包里写 `"account": "xiaohao"`，小号只能发抖音/小红书，其他平台直接报错停下。`accounts.json`（账号 → `egoProfileId` → 平台 → 昵称/ID）缺任何一项都 fail closed。任务空间必须属于该账号的 Profile：复用前用 `listTaskSpaces()` 核对，不符即 `PROFILE_MISMATCH` 停；新建只用 `taskSpace(name, { profileId })`。完整规则、映射格式和命令见 [references/account-profiles.md](references/account-profiles.md)。

Resolve the intended destination from the user's request, never from whichever account is logged in. A logged-in session, Ego Profile name or task-space name is not account identity. Douyin and Xiaohongshu runners require `targetAccount`: a scoped creator-home name + stable ID read in the same task space and same bound Profile, before and after every phase (Douyin also before each video-file injection), rejecting missing, mismatched or older-than-15-second evidence, and saving a header screenshot for the final preview. They reload only a dedicated read-only home Page and never refresh an ongoing upload. Bilibili and WeChat Channels still require manual fresh account verification. Fixture coverage only; live creator-page acceptance must be recorded separately.

Same-Profile spaces share one login. Do not silently try another Profile or switch accounts inside a Profile; stop the owning controllers and get explicit approval first.

Use [the intake contract and package example](references/intake-workflow.md#destination-account-and-versioned-package) for fields and migration. A legacy package without Douyin identity is rejected, not auto-upgraded: preserve historical packages/jobs/receipts, create a versioned corrected package and review it again. Never rewrite an old fingerprint. If a matching upload already exists, plan verified same-page recovery before starting any new job or injection.

## Safety Boundary

Never click the final `发布`, `发布笔记`, `发表`, or `立即投稿` control unless 月明 has seen this item's final preview, explicitly approved this specific item, and `node scripts/check-approval.mjs` passes. Uploading and preparing a draft do not imply permission to publish. The maintained runner mounts a page-level capture guard for all four labels; `READY` requires evidence that the guard is armed and that it blocked zero attempts.

Before enabling any `原创`, `自制`, or equivalent declaration, require one of two truthful signals: the onboarded `declarations.originalityPolicy` is `all_videos_original`, or the user confirms the current video and the run passes `--confirm-original-rights`. Never infer either signal from the video itself. If neither is available, stop: non-original declaration modes are outside the current live-tested boundary.

Treat `all_videos_original` as a reusable content policy, not permission to publish. The final publish controls still require 月明's per-item approval, and that approval is never persisted or reused. `ask_each_run` remains the generic onboarding default for shared installations.

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

The ordinary orchestrator retains its upload-process barrier because overlapping Ego upload/wait processes with another UI controller has frozen the input channel in live testing. Native background uploads need not leave available title/description fields idle: when timing matters, stop only the waiting CLI and all its Ego runners, preserve the original browser uploads, then use the existing-job single-platform `--metadata-only` recovery entry under exclusive locks. It prepares available plain fields and returns `metadata_prepared`, never READY. Topics, declarations and covers remain in the ordinary verified mutation flow. Read [automatic-publishing-playbook.md](references/automatic-publishing-playbook.md#prepare-metadata-while-native-upload-continues) and [scripts.md](references/scripts.md) for the bounded entry. This does not implement automatic four-platform interleaving; new-code upload-overlap live acceptance remains pending. Upload completion and final review remain mandatory before submission.

Treat the Ego input channel as shared failure state. If any parallel phase returns `INPUT_CHANNEL_BROKEN`, wait for the other runners to exit, then skip every remaining quarantine, upload, and mutation in that invocation. Run only final read-only verification so the persisted job records page truth; resume through the ordinary same-job command after Ego restarts.

Custom-cover dialogs also use the single UI queue. Isolated task spaces do not make concurrent clicking safe.

Login waits do not stop the job (2.8.0). A platform that returns `AUTH_REQUIRED` / `blocked_user` no longer pauses the other platforms: they continue through upload, mutation and verification. While the others upload, the orchestrator re-inspects each blocked platform read-only every `--auth-poll-seconds` (default 60, `0` disables); once 月明 has logged in, that platform uploads in the same run. The job ends `paused_user` only if a platform is still blocked. `--pause-all-on-user-block` restores the old stop-everything behaviour. Every run records per-call and per-phase timings in `state.timings` (last 10 runs) and logs the slowest call; read them before guessing where time went.

Dual covers prove themselves (2.8.0). Bilibili (`4:3` recommendation + `16:9` personal space) and WeChat Channels (`3:4` profile + `4:3` share card) slot receipts carry a local visual-identity proof: the slot image actually shown on the page is captured to `<job>/cover-slots/` (mode 0600, never copied out) and compared with the mapped package asset by a 256-bit dHash (`slot_url` ≤ 40, screenshot ≤ 48, and at least 16 closer than to any other approved asset). The cover gate passes only when every required slot has its asset, URL match and visual proof; any doubt fails closed with `PLATFORM_REJECTED_ASSET`. No gate exception is needed for a correct dual-cover draft. See [cover-workflow.md](references/cover-workflow.md#visual-identity-proof).

Signed URLs never leave the job in clear text (2.8.0). Receipts, checkpoints, state, runner output and error details store CDN URLs as `origin+path?<redacted sha256:…>`; gates match by digest. Never paste a raw token/sign URL into a report, log or skill example.

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

The platform runner exposes these phases:

```text
inspect: read page truth; no mutation
quarantine: Bilibili only; resolve or preserve an old draft
upload: upload only when the target video is not already present
metadata: owner-only same-job recovery; available plain fields during native upload
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

Use the onboarded configuration as defaults, apply the destination-account contract above, then confirm the source video, platform selection from `availablePlatforms`, title, tags, any unresolved rights/declaration status, and existing-cover upload intent before browser automation. Newlines in JSON fields must be real newline characters.

Use platform-native defaults:

```text
Xiaohongshu: short title, real topic entities, no prose body by default, original declaration
Douyin: title/body plus 1-5 package-supplied topic entities
Bilibili: title, concise description, tag chips, self-made declarations
WeChat Channels: description begins with title and plain hashtags; leave short title empty
```

The package may come from any video-production pipeline. Record its `productionMode` when provided (for example, `html_explainer`), but do not apply production-specific editing rules inside this Skill. A confirmed video path is immutable during publishing; if the video or cover needs revision, stop and return it to the producing Skill, then build a new package fingerprint.

Before packaging, read the production record for AI-generated image/video usage and set the truthful `contentTypeDeclaration`. A known generated segment requires `含AI生成内容`; do not lose this field while assembling a talking-head release package. Original/self-made rights and AI marking are separate. Unknown usage must be resolved from production evidence rather than defaulting to no mark. Before accepting READY or submitting on any of the four platforms, freshly verify the native AI-content selection independently of originality, prose disclosure and the runner verdict. Until a platform adapter implements and live-tests this gate, perform that native check manually, save its visible evidence with the final review, and block submission if it is absent or ambiguous. Read the selected platform contract for the current native label; do not force an AI label when production evidence proves there is no generated content.

This Skill does not create or edit cover artwork. Every selected platform needs an explicit cover decision in the package before browser work: either upload approved custom artwork with `cover.uploadCustomCover: true`, or use the platform-selected video frame with `cover.useVideoFrame: true` and nonempty `cover.approvalEvidence` recording the user's acceptance. These choices are mutually exclusive. A configuration default such as `uploadExistingByDefault: false`, or simply omitting cover fields, is not a decision and must fail package preflight. Do not upload or submit while the cover decision is unresolved. If custom artwork is needed but unavailable, prepare it through `gbro-cover-design`. Use either explicit artwork approval or an existing user delegation to the Agent for the approved brand style. Record Agent acceptance truthfully under delegation; do not request per-image confirmation again. This is never future final-publish authorization.

When the user supplies existing cover files and explicitly enables `cover.uploadCustomCover: true`, validate the mapped file paths and ratios before upload:

```text
Xiaohongshu: explicitly map the actual 3:4 portrait or 4:3 landscape slot; legacy packages retain their old 4:3 mapping
Douyin: 3:4 and 4:3
Bilibili: prepare both recommendation 4:3 and personal-space 16:9 artwork before publishing; replace each independently, never auto-crop one into the other
WeChat Channels: observed dual slots use 3:4 and 4:3; an explicitly labelled unified 3:4 slot uses only 3:4
```

For a cover-only correction to an already published Xiaohongshu note, follow the existing-note section in [references/cover-workflow.md](references/cover-workflow.md): preserve the note identity, video, title, body, topics and existing settings; map the file to the current editor slot. Do not create a new upload job or require re-upload of the historical video.

For an existing published WeChat Channels video, follow the historical branch in [references/platform-wechat-channels.md](references/platform-wechat-channels.md#existing-published-video-cover-updates). Map the visible independent 3:4/4:3 slots or shared 3:4 slot, preserve the existing publication, honor its modification limit, and verify saved artwork after review. This branch uses the observed historical editor; do not create a new-upload job.

Use `cover.platformAssets[platform]` entries `{slot, ratio, path}` to carry each platform's explicit primary artwork instead of interpreting shared horizontal/vertical filenames as platform requirements. Supported primary mappings: Xiaohongshu portrait 3:4 or landscape 4:3; Bilibili landscape 4:3 or 16:9. Douyin and WeChat Channels keep the tested dual-slot mapping (or the observed WeChat unified slot). For Bilibili's actual dual cover editor, provide the 4:3 primary plus `bilibiliWideCoverPath` for the already generated 16:9 artwork, or two explicit platformAssets entries with landscape/4:3 and wide/16:9. The current automatic adapter accepts the primary; complete the second through the verified manual dual-slot path and bind both actual saved previews to final review before READY. Disable native synchronization so replacing one slot cannot overwrite the other. This is a currently bounded manual requirement, not a claim that the old single-cover adapter verifies both.

An explicit empty mapping fails closed; never fall back silently. Legacy shared paths remain recoverable. Actual ratio labels, accepted image and crop must be checked after upload before final review; additional native slots not yet covered by an automatic adapter require verified manual completion.

Run `scripts/check-package.mjs` for every selected new-upload platform before browser work. The validator reads MP4/M4V/MOV duration directly from ISO BMFF metadata without `ffprobe`. For Douyin, reject content longer than the real-tested 900-second boundary before Ego Lite starts; allow only 0.1 seconds of container-metadata rounding because a standard 15:00 stream copy reported 900.010 seconds and passed the real upload. Do not automatically trim or transcode the user's media. This duration rule is platform-specific and must not block the other selected platforms.

## Default Flow

1. Load configuration and complete onboarding, including available and default platform selection, when required.
2. Identify the exact local source and any subtitle variant.
3. Resolve and freshly check the intended destination accounts; include mandatory Douyin name/ID, then confirm the versioned package, selected platforms and one cover choice per platform.
4. Validate custom cover assets, or the recorded acceptance of the platform video frame, before browser work.
5. Validate each platform package.
6. Run the production orchestrator.
7. Let it inspect in parallel and quarantine Bilibili when required.
8. Start missing native video uploads in parallel. If simple metadata fields are available during a slow upload, use the bounded single-controller metadata recovery path above rather than leaving those fields idle. Never overlap live Ego controllers.
9. After upload/process completion, let the single UI queue finish metadata, declarations, settings, and independent cover slots.
10. Collect independent parallel page evidence. A content-only receipt leaves `publishReview` false / `needs_review`, never READY. Complete the actual native settings and cover review, write final evidence bound to the receipt, then re-run same-job verification.
11. Leave every verified draft open before its final button. When current-run publication is authorized, submit independently READY platforms serially after their own final checks; an unavailable platform does not hold the others. For WeChat Channels login, follow its platform contract’s bounded quick-login recovery: when the user has authorized the official WeChat `允许` confirmation, verify the exact prompt and identity and complete that click through authorized native desktop input. Do not hand it back merely because a general login handoff default exists. Verify the resulting Channels name and stable ID; report only a concrete remaining blocker. The [WeChat Channels contract](references/platform-wechat-channels.md#login-recovery) includes recovery when a native screenshot incorrectly captures the main chat window.

After 月明 approves a specific platform item (per-item-approval.md), continue with [references/final-publish.md](references/final-publish.md). This is a separate guarded phase after `READY`; never infer it from draft preparation, originality confirmation, or a previous run.

After a real release, compare the actual page failures and recovery steps with the current adapters. Preserve user-specific titles, campaign choices, and job IDs in the work's distribution record; move only reusable platform behavior into the maintenance source, verify it, and upgrade the active Skill snapshot. A successful manual repair is evidence for a candidate adapter change, not proof that untested new code already works on the next run.

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
- [references/account-profiles.md](references/account-profiles.md): 大号/小号 → Ego Profile mapping, Profile-pinned task spaces, account gates and the 15-second pre-click proof.
- [references/cover-workflow.md](references/cover-workflow.md): upload of existing cover assets, ratio mapping, and receipts.
- [references/ego-browser-workflow.md](references/ego-browser-workflow.md): Ego Lite task spaces, upload channels, handoff, and diagnostics.
- [references/platform-youtube.md](references/platform-youtube.md): YouTube Studio operator workflow, channel preferences, platform-specific review and watch-page acceptance.
- [references/platform-common.md](references/platform-common.md): orchestration, gates, blockers, and concurrency.
- [references/per-item-approval.md](references/per-item-approval.md): preview → per-item approval → check → publish → report link.
- [references/final-publish.md](references/final-publish.md): per-item approval, serialized final controls, and platform success evidence.
- [references/automatic-publishing-playbook.md](references/automatic-publishing-playbook.md): same-job recovery, cover-receipt recovery (incl. visual dual-slot recovery), semantic control targeting, final submission, and distribution recording.
- [references/scripts.md](references/scripts.md): production and diagnostic commands.
- [references/platform-xiaohongshu.md](references/platform-xiaohongshu.md): Xiaohongshu adapter contract.
- [references/platform-douyin.md](references/platform-douyin.md): Douyin adapter contract.
- [references/platform-bilibili.md](references/platform-bilibili.md): Bilibili adapter and draft quarantine contract.
- [references/platform-wechat-channels.md](references/platform-wechat-channels.md): Wujie lifecycle activation, upload truth, original declaration, cover flow, and retry recovery.

Default source directory comes from configuration; `VIDEO_PUBLISHER_SOURCE_DIR` may override it for `find-video.mjs`.
