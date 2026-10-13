# WeChat Channels Adapter Contract

Read `platform-common.md` and `ego-browser-workflow.md` first.

## Current Acceptance Boundary

As of 2026-07-14, the platform-specific path passed real runs for upload completion, exact description, empty short title, original declaration, 3:4 personal-profile and 4:3 share-card custom covers, no blocking dialog, enabled `发表`, and `finalPublishClicked: false`. Stale cover-editor recovery was also exercised by a real retry.

The remaining system-level boundary is the four-platform production-orchestrator regression described in the root Skill.

## Wujie Lifecycle

The creator editor can be focused while `document.visibilityState` remains `hidden`. That state left `页面初始化中` and fade transitions stuck. Before readiness checks and during upload/dialog waits, call:

```text
Page.bringToFront
Page.setWebLifecycleState { state: active }
Emulation.setFocusEmulationEnabled { enabled: true }
```

Readiness requires the initialization toast to be gone and the real video input to exist, or an already uploaded editor to be proven. Perform at most one gentle reload after the initial activation window.

## Wujie Upload

Search `document` and all open shadow roots for the hidden video input whose `accept` contains `video`. Obtain the input’s CDP object id and use `DOM.setFileInputFiles` with the confirmed source path.

`页面初始化中` is a warning, not sufficient truth by itself. Do not inject while it is present merely because a stale input node exists.

After injection, dispatch one fallback change event only if no upload state appears. Never repeatedly inject the same file.

## Upload Completion

Cover cards can appear before upload completes. A real run displayed:

```text
50%
取消上传
封面预览
个人主页卡片
分享卡片
```

That state is uploading, not ready.

Require cover cards and the absence of all progress signals, including percentage text and `取消上传`, for a stable interval before the upload runner exits. If an existing target upload is in progress, wait for it; do not inject again.

A 533 MB fault test terminated the orchestrator during the Wujie upload. The same task space resumed with action mode `resume_existing`, reactivated the page lifecycle while waiting, completed without reinjection, and later reached `READY` with both cover slots verified.

A later 534 MB run deleted the ready WeChat Channels task space. The same job created a replacement numeric space, re-uploaded and rebuilt only WeChat Channels, generated fresh vertical and horizontal cover receipts, preserved the other three ready drafts, and passed repeated no-op verification.

## Draft Identity

The page does not expose a reliable filename. Reuse an uploaded draft only when the description is empty or matches the expected package. A different non-empty description is foreign and must block.

## Text Defaults

Use the description field as:

```text
TITLE

#TOPIC_1 #TOPIC_2 #TOPIC_3
```

Leave `短标题` empty unless explicitly requested.

## Original Declaration

Enable `声明原创`. If an agreement dialog appears, accept its checkbox and click the dialog’s `声明原创` action. This is not the final `发表` control.

The adapter must verify the checked state after the dialog closes.

## Video Content Mark

Every new WeChat Channels package must carry `contentTypeDeclaration`, determined from the production record. For a known generated segment, set it to `含AI生成内容`; the adapter selects that exact option under `视频标注`. The package value `内容无需标注` maps to the platform option `无需标注`. Do not infer this mark from `声明原创`: the two controls express separate facts. Verify the selected label and close the option menu before the draft can be `READY`.

## Custom Cover for New Uploads

When enabled, inspect the visible cover labels before choosing assets. A new portrait upload can expose a single `个人主页和分享卡片(3:4)` slot, as verified in a real new-upload run on 2026-10-11. In this explicitly labelled unified mode, upload only the approved vertical 3:4 artwork, finish its native crop/save flow, and verify one vertical receipt plus the `unified_3x4` mode; record that both placements share that artwork. Do not infer this mode merely because a horizontal slot is absent during loading, and do not force a nonexistent 4:3 slot. If the editor exposes independent slots, upload both user-provided assets using the same flow first for the personal-profile `3:4` card and then for the share-card `4:3` card:

1. Click `.vertical-cover-wrap .edit-btn` for 3:4 or `.horizon-cover-wrap .edit-btn` for 4:3.
2. In the active edit-cover dialog, locate its existing image file input across open roots.
3. Inject the file through its CDP object id; top-document `uploadFile` cannot reach it.
4. Wait for `.single-cover-uploader-wrap img` to show a real preview.
5. If `裁剪封面图` is visible, click its visible `确定` first.
6. Wait for the parent editor to become visible, then click its visible `确认`.
7. On the share-card path, handle the intermediate `使用此素材` confirmation before the parent `确认` control.
8. Keep the lifecycle active until the editor closes and the corresponding main-card CDN URL changes.
9. Persist each URL with its absolute asset path and ratio, then require a separate verify process to find both again.

Only `.vertical-cover-wrap img.vertical-img-size` and `.horizon-cover-wrap img.horizon-img-size` are receipt targets. Require separate `3:4` and `4:3` receipts in dual-slot mode; explicitly labelled unified mode requires the vertical receipt only.

If a prior attempt leaves `编辑个人主页卡片` or `裁剪封面图` open, safely cancel that known editor, wait for it to close, and retry once. Do not misclassify an unrelated cover dialog as an original-declaration failure.

## Required Gates

```text
authenticated
correct draft identity
upload fully complete, with no percentage or 取消上传
exact description and hashtags
short title empty
original declaration enabled
package-matched `视频标注` selection, with its menu closed
custom receipts matched to the observed unified_3x4 or dual_slot mode when enabled
no blocking dialog
visible enabled 发表 button
final publish not clicked
```

## Existing Published Video Cover Updates

This branch updates an existing video through content management. The production runner above prepares new uploads; do not create a new-upload job for a historical cover correction. Use the observed existing-video UI and persist one receipt per existing object ID in the work's distribution record.

1. Match the existing video's full description, publication time and version before opening its real `修改描述和封面` action. Preserve the video, description, hashtags, existing short title and settings. An already private video is skipped when the current request says to skip private videos.
2. Inspect the current editor's visible slots. Landscape videos can expose independent `个人主页卡片 3:4` and `分享卡片 4:3`; portrait videos can expose a single `个人主页和分享卡片(3:4)` slot. For the shared slot, upload only the native 3:4 source and record that both cards use it. Do not require or force a nonexistent 4:3 slot. The same visible-slot rule applies to new uploads; distinguish the two modes from their explicit native labels.
3. The list's real action icon inside `.edit-cover-item .opr-item` opened the historical editor; clicking its label/wrapper did not prove navigation. The observed `.vertical-img-wrap` and `.horizon-img-wrap` open cover editing. If an overlaid image intercepts an `.edit-btn` click, inspect the visible wrapper before choosing another target.
4. Identify the active dialog by its visible heading: `编辑个人主页卡片`, `编辑分享卡片`, or `编辑封面` for a shared portrait slot. Hidden file inputs and decoded images left in the DOM are not initialization evidence. Wait for the active dialog, current video/frame initialization and its visible confirmation control; after uploading, match the actual active preview to the mapped artwork and native ratio. If a click leaves the main editor without an active dialog, inspect the same work and retry once after it stabilizes. A still-open known cover dialog must be resolved before retrying.
5. A share-card popover can ask `使用此素材作为封面？`. Choose `直接编辑` to upload the independently composed 4:3 artwork. Finish its actual crop/confirmation flow and verify the accepted main card before continuing.
6. An accepted main card can be a data URL, and `封面已更新` can appear before the historical edit is submitted. Verify every required main card, preserve metadata, then use `完成` and the final `确认修改`. The current page warns that this modification is allowed once and cannot be withdrawn. Apply explicit current-run approval to the authorized batch; reuse that approval within the session and do not turn it into permission for future runs. Cancelling the main editor can open a separate `退出` confirmation; cancellation alone does not prove return to the list.
7. Persist the final submission before processing another video, then verify the same list item. `修改审核中，预计30分钟内审核完成` means submitted; saved/public cards can still show the previous image during review. Do not resubmit a review-pending item or claim that the new cover is already visible.
8. Independently reopen the saved work after review and compare each required actual saved image with its mapped source, native ratio, complete title, face and evidence. A shared 3:4 slot needs one actual saved asset; independent slots need both. An already correct unchanged slot can be reused when source matching proves it. Record source paths/hashes, actual used files, saved-image evidence and the observed review state. Strip signed resource query parameters; changed URLs alone do not prove completion.
9. Treat `作者修改过视频信息` / disabled modification entry and `发表超过6个月后无法修改` as platform blockers. Preserve the existing publication and report the blocked work. Do not invent identifiers, bypass the disabled editor, delete it or re-upload its video to obtain another modification opportunity.

The observed triggers were checked on real existing-video updates: independent landscape slots and a shared portrait slot, accepted previews followed by review-pending old artwork, and saved artwork after review. Software adapters and the new-upload path were unchanged; this is guidance for the historical editor, not a claim that the production runner implements bulk historical updates.
