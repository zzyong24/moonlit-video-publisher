# Xiaohongshu Adapter Contract

Read `platform-common.md` and `ego-browser-workflow.md` first.

## Account Defaults

```text
short title, maximum 20 codepoints
real topic entities only
no prose body unless explicitly requested
原创声明 enabled for original videos
```

## Upload And Identity

Use the confirmed video file. Reuse an uploaded editor only when the filename or expected title identifies this package. A different active draft is a blocker; Xiaohongshu has no tested automatic quarantine flow.

Do not mutate metadata until the upload phase has fully completed and every selected platform upload runner has exited.

## Topic Entities

Clear the body editor completely, then add topics one at a time through the real suggestion panel. The sticky final-publish footer can cover the visually exposed toolbar near the viewport bottom, so a pointer click may land on the footer instead of `话题`. Invoke the exact native `button.contentBtn.topic-btn` control through its page handler to make the platform editor insert `#`, explicitly refocus the editor at its end, type only the compact topic query, and select the exact suggestion row. Do not inject `#话题` as one text operation; that can create a suggestion decoration without loading candidates on a cold page.

For a custom cover, a click on the preview can reveal an `编辑封面` entry without opening the upload modal. Click that exact revealed entry, then require the real `上传封面图片` input before uploading and the accepted preview URL plus matching receipt afterward. Do not treat a successful preview click or a platform-generated cover URL as proof that the approved local cover was used.

Under sustained browser load, the decoration may appear while the candidate panel remains empty. Verify the exact trailing query, poll the exact row for a finite extended window, and if it never appears clear the entire topic editor and retry the whole requested set. Use at most three whole-set attempts; never preserve a half-built set or accept plain text after an empty candidate response.

After an Ego restart, the selected Xiaohongshu tab may report `document.visibilityState: hidden` even though its DOM is readable. Hidden-page timer throttling can delay a real topic candidate response far beyond the bounded wait. Immediately before a serialized topic rebuild, bring the page to front, set its web lifecycle to `active`, enable focus emulation, and prove `visible` plus `document.hasFocus()`. Do not add longer blind waits to compensate for a hidden lifecycle.

Spaces terminate Xiaohongshu topic input. When a readable package label contains whitespace, query the compact form (for example `AI Agent` -> `AIAgent`) and accept it only when the committed entity's `data-topic.name`, normalized without whitespace, matches the requested label. Preserve the readable package label in evidence. Never accept compact plain text as a substitute for an entity.

The verifier must prove:

- every requested topic exists as a committed entity;
- no requested topic remains as plain text;
- no malformed or duplicate entity exists;
- no stale body residue remains when the package has no prose body.

Do not insert `.tiptap-topic` HTML manually.

## Original Declaration

Open `内容设置`, enable `原创声明`, accept the agreement checkbox when a dialog appears, and click the dialog’s `声明原创` control. That dialog control is not the final publish button.

Verify the enabled toggle from a fresh inspection and require the agreement dialog to be closed. A checked toggle behind an open confirmation modal is incomplete. When the checkbox is already accepted, click the dialog’s enabled native `声明原创` control once and wait for that exact modal to disappear. Dismiss a visible PK-cover guide using its exact acknowledgement; do not click an underlying campaign or infer dismissal from an attempted click. Remove any activity that was not requested in the package, then re-verify the ordinary posting settings. A click attempt is insufficient.

The simulator classes `checked` and `unchecked` must be compared as whole tokens: substring `/checked/` incorrectly accepts `unchecked`. The 2026-10-04 live page exposed this false positive during the final screenshot check. An unchecked native input plus an `unchecked` simulator is off, even if the earlier gate passed. Repair through the ordinary original-declaration step and regain READY before any final click.

## AI Content Declaration

When production evidence confirms generated images or video, open the native content-type control and select the exact `笔记含AI合成内容` option. Close the menu and freshly verify the selected label. Originality is a separate control; a disclosure in prose or a READY verdict from an adapter that lacks this gate is insufficient. Until the automatic selector is live-tested, use the guarded manual recovery path and bind the actual selected state to the final review. Preserve a no-generated-content declaration when supported by the real production record.

## Custom Cover

Resolve the cover choice under the package gate. New packages explicitly map the native `3:4` portrait or `4:3` landscape slot with `cover.platformAssets.xiaohongshu`; legacy shared-path packages retain `4:3`. Cover-only edits to historical notes instead follow [the existing-note correction flow](cover-workflow.md#xiaohongshu-existing-note-corrections), choosing `3:4` or `4:3` from the actual editor slot and preserving note metadata.

The tested editor entry is the real preview control under `.default.row` or `.default.column`. Open it with a real browser click, then poll for a visible `上传封面` tab instead of assuming a fixed render delay; one clean reopen is allowed when the asynchronous dialog does not materialize. Upload through the image input, choose the crop ratio matching the asset when exposed, and confirm the editor.

In the 2026-10-04 editor, first resolve the recorded legacy space id with `taskSpace(id)`, then hover the preview using its managed Page. The legacy `useOrCreateTaskSpace` result has no `page()` method; silently skipping the hover leaves `编辑封面` hidden. The modern editor removes its upload input after a thumbnail is accepted. Wait for the native `完成` button to become enabled rather than reopening or assuming a two-second delay. If interruption leaves the correct artwork already accepted, visually compare it against the provided asset, finish the editor, run fresh inspect-only, then use the maintained fingerprint-bound recovery command. New-upload receipt recovery must use the same 4:3 mapping as the adapter, not an old 3:4 default.

Accept the cover only when the main editor exposes the uploaded preview URL, normally on `ros-preview.xhscdn.com`, and no cover dialog blocks the page. Store that URL in the receipt and require the verify phase to find it again.

## Required Gates

```text
authenticated
correct draft identity
video fully uploaded
exact title
exact topic entities with no plain residue
原创声明 enabled, confirmation modal closed
required native AI content label independently verified
no unrequested associated activity
custom mapped-ratio receipt when enabled, otherwise explicitly approved video-frame state
no blocking dialog
visible enabled 发布 button
visible enabled `发布笔记` final button; final publish not clicked
```

This path passed real draft runs on 2026-07-14 and 2026-07-15. The visible-tab polling path was fault-tested by discarding the receipt and re-uploading the same 3:4 asset. Later 731 MB and 533 MB runs survived orchestrator termination during upload without reinjection, and the 533 MB run verified whitespace-normalized topic lookup plus three no-op full reruns. Real Ego Lite crash/restart and sustained-load runs reproduced both the cold-page topic-decoration failure and an empty candidate panel. A mutation-stage crash finally proved the persistent failure was hidden lifecycle throttling: activating and focusing that exact failed page made its next bounded whole-set rebuild commit four entities on attempt one. The 3:4 receipt and four-platform `READY` state were restored, followed by three full no-op reruns.
