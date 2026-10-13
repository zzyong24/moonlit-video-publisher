# Existing Cover Upload Contract

Use this file only when the user explicitly asks to upload cover files that already exist. This Skill does not create, generate, redesign, or edit cover artwork.

## Package Fields

Only include the ratios required by the selected platforms. Recommended dimensions are 1080 × 1440 for 3:4 and 1440 × 1080 for 4:3.

```json
{
  "cover": {
    "uploadCustomCover": true,
    "vertical3x4Path": "/absolute/path/cover-3x4.png",
    "horizontal4x3Path": "/absolute/path/cover-4x3.png"
  }
}
```

`uploadCustomCover` must be explicitly true. Merely providing paths does not authorize upload.

Every selected platform must have exactly one resolved cover choice before browser work:

- Approved custom artwork: `uploadCustomCover: true` with the required platform ratios and mapped paths.
- Platform-selected video frame: `uploadCustomCover: false`, `useVideoFrame: true`, and nonempty `approvalEvidence` describing the user's acceptance.

These choices are mutually exclusive. Missing fields and account defaults are unresolved choices; `scripts/check-package.mjs` must reject them. Do not proceed to upload or final submission until preflight passes. If the user expects a designed cover and no approved file is ready, send the work back through `moonlit-video-cover` before packaging.

Mapping:

```text
Xiaohongshu: explicitly selected portrait 3:4 or landscape 4:3 native slot; old packages keep their historical mapping
Douyin: vertical 3:4 and horizontal 4:3
Bilibili: explicitly selected native horizontal 4:3 or 16:9 primary slot; additional native placement needs separate evidence
WeChat Channels: vertical 3:4 and horizontal 4:3 for new uploads; historical videos use the observed independent or shared slots
```

Run `scripts/check-package.mjs` for every selected new-upload platform before opening creator pages. Existing-note corrections use the identity and mapped-source checks below.

## Receipt State Machine

For each mapped slot:

1. Record main-page cover URL(s) before opening the editor.
2. Open the platform’s real cover editor and identify each slot by its visible ratio label. Slot order may change between works; never map ratios by a fixed ordinal.
3. Wait until the opened editor has finished initializing its current artwork before choosing a file; early file selection can be overwritten by delayed initialization. Upload the mapped asset through the editor’s existing image input, then wait until that exact artwork is visibly rendered in the labelled slot. Do not finish a crop while the old cover, a blank state, or a loading preview is still visible.
4. Complete the platform-specific crop/save flow. Wait for the modal/editor to close before selecting another slot or submitting.
5. Submit the edit, wait for the editor to return to content management, and read the accepted main-page cover URL/card for the same work.
6. Compare the accepted asset URL with the pre-edit URL; persist `assetPath`, ratio, before URL, and accepted URL for every slot.
7. Independently reopen the saved work and visually match each accepted cover to its selected source artwork. For a profile cover, refresh the public profile and inspect the same work’s actual thumbnail for the correct artwork, full title, and crop. A changed asset URL/ID only proves a resource changed; re-uploading the wrong image also changes its ID, so never use ID change alone as completion evidence.

Never treat `uploadFile` success, a modal canvas, or an intermediate preview as acceptance.

## Platform Evidence

```text
Xiaohongshu: mapped 3:4 or 4:3 asset for an existing note; accepted main preview commonly uses ros-preview.xhscdn.com. Independently read the same note ID’s actual saved image from the management list; record its native dimensions and review state.
Douyin: both main cover cards must have distinct accepted URLs.
Bilibili: editor must close; accepted main `.cover-img` uses archive.biliimg.com or biliimg.com.
WeChat Channels: inspect the actual new-upload or historical editor. Independent personal-profile 3:4 and share-card 4:3 slots require both receipts. An explicitly labelled `个人主页和分享卡片(3:4)` slot requires only the vertical 3:4 receipt and records that the same artwork serves both placements; never force a nonexistent 4:3 slot. Follow platform-wechat-channels.md. Each required saved asset must independently match its source after final submission/review. An unchanged already correct cover can be reused after source matching. Data-URL crop previews and phone-preview mirrors are intermediate evidence.
```

Existing-cover upload operations remain in the single UI queue.

## Xiaohongshu Existing-Note Corrections

This branch changes only an existing note’s cover under the user’s current correction authorization. Use the stable note ID plus the existing title/version to identify it; preserve the original video, title, body, topic entities and settings. Already private notes are skipped when the user asks to skip them. An old AI variant and a retained real demonstration are different notes even if they share a topic; do not attach the retained version’s cover to a rejected/private variant or create a new publication to fill a missing match.

- Read the actual editor’s cover slot: `.default.column` with aspect `0.75 / 1` uses 3:4; `.default.row` with aspect about `1.33 / 1` uses 4:3. Confirm the visible crop/ratio evidence; never apply the new-upload 4:3 package default to every historical note.
- Opening the preview may first reveal `编辑封面`; use the real `上传封面图片` input. Its existence is not proof that the editor has initialized. Wait until video-frame parsing ends and the actual frame thumbnails decode. Ignore unrelated/no-image list items when checking frames.
- After uploading, wait for the uploaded thumbnail to decode and `完成` to enable. Explicitly select that uploaded thumbnail, then match the **actual rendered image in the active cover dialog** to the mapped source before finishing. A loaded thumbnail and enabled button can coexist with an old central canvas. Scope selectors to the active dialog: an unscoped `img.cover` can select an old main-page image.
- After `完成`, require the dialog to close and inspect the actual accepted main image. If it is still old, empty or wrong, stop before `发布` and recover that same note. Do not treat a platform quality message or changed resource ID as source verification.
- Submit the existing-note edit only under current user authorization; `更新成功` proves submission, not the artwork. Read back the same note’s actual saved management-list image, compare with the source and verify its native ratio, full title, face and evidence. If the editor’s CSS preview fails to load, use the actual decoded saved image; never accept a blank preview.
- Record the source path/hash, observed slot, before/accepted asset identifiers, actual saved-image evidence and the platform’s review text. Strip signed query parameters from persisted asset URLs. `审核中` stays `submitted`; do not report it as approval or as proof the public wall already shows the new image.
- A temporarily empty management list is not proof that notes were deleted. Inspect the current list/search state and restore the same page, then re-read the inventory. Do not mutate against an empty or unresolved inventory.

For large batches, persist each submission before the next note; resume by stable ID. A final pass must follow the most recent submission for each note. Source-image matching is a technical check, separate from a human’s final visual acceptance.

## WeChat Channels Historical Corrections

Follow [the existing published-video branch](platform-wechat-channels.md#existing-published-video-cover-updates) for visible slot mapping, one-time final modification, review-pending old artwork, and disabled/age-limited entries. Keep the existing publication identity and original metadata. The new-upload runner and its two-ratio package validation do not supply a historical-edit workflow.

New packages may set cover.platformAssets keyed by platform, with one primary {slot, ratio, path} for Xiaohongshu/Bilibili. Do not treat legacy fixed defaults as proof of the current native slot. Existing user delegation for the approved style permits Agent acceptance; record the delegation and visual/ratio checks instead of requesting artwork confirmation repeatedly. Actual native crop is a post-upload final-review requirement.

B站2026-10-12当前编辑器实际显示首页推荐（4:3）、个人空间（16:9）两个槽位，以及“两个比例的封面都会被展示给观众”。本期必须上传已分别生成的4:3/16:9成图，关闭“双比例同步改动”，分别激活对应画布并替换，保存后独立回读两个效果。单一main-card URL不能证明两个比例均已正确；额外槽位需hash绑定实际图像证据后才能final门禁。

生产阶段一次备齐所选平台所有入口的画幅，发布器只替换已验收的对应成图，不做设计性裁切/拉伸/补边。用户委托同风格Agent验收时不反复索取封面批准。
