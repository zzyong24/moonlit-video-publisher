# Guarded Final Publish

Use this phase only after the maintained runner returns `READY` for every selected platform and the user explicitly authorizes final publication in the current run. Authorization is one-shot, scoped to the confirmed package fingerprint and selected platforms, and must never be persisted.

## Preconditions

1. Re-run the shared guoshen receipt gate at its default final stage for the actual package, video, selected covers and current platform before disarming any final control. Missing, stale, changed or incomplete review blocks submission; follow the activated moonlit-content-engine references/publish-review.md.
2. Re-read the package from disk and verify its fingerprint matches the `READY` job.
3. Confirm the exact selected platforms and recorded task-space ids/names.
4. Freshly inspect each page: target identity matches, upload is complete, metadata/settings/covers pass, no dialog blocks the page, and exactly one enabled final control exists. For AI-generated content, independently read the actual native AI label on every selected platform; originality and a prose disclosure do not satisfy it. A runner READY whose adapter lacks that gate still requires this check and hash-bound final-review evidence before submission.
5. Stop on any mismatch. Do not repair content during the final phase; return to the ordinary runner and regain `READY`.

## Execution

- Use `ego-browser` and the recorded task spaces. Never delegate creator-page control to sub Agents.
- Process platforms serially. Before each click, report which exact platform is about to publish.
- Keep each final-publish heredoc scoped to one platform. Select the recorded task space, then explicitly select its exact tab with `listTabs` / `switchTab`; do not rely on whichever tab was active in an earlier invocation. Re-observe after navigation or dialogs, and derive controls from the current DOM rather than reusing old refs.
- On `USER_CONTROL`, stop the entire browser task. Report it as a browser ownership error, not proof of a user action. Resume only after explicit user confirmation. A submission timeout requires checking the content list for the exact target before any retry.
- Disarm only the final-publish guard installed for that exact task space. Do not remove unrelated page listeners or disable browser security controls.
  The v2 guard stores its own handler on `window.__VIDEO_PUBLISHER_FINAL_GUARD__.guard`; remove only that handler from the document's capture-phase `click` and `submit` listeners, then set its `armed` field to `false`. If the handler is missing, stop instead of clearing unrelated listeners or reloading a draft that may lose its custom cover.
- Click the platform's scoped final control once. Do not retry a click when the outcome is unknown; inspect the resulting page first.
- Before clicking, call `scrollIntoView` on the exact control, then freshly check its center is inside the viewport and `document.elementFromPoint` hits the control or its child. A nonzero DOM rectangle is not enough: a real Douyin failure placed the button at y=1529 in a 797px viewport and `Input.dispatchMouseEvent` timed out. After verifying no target submission in the content list, scrolling the same button into view made the real click succeed. Do not use this observation as permission to retry an unknown submission without checking the list.
- Treat navigation, a toast, or a disabled button as an observation, not proof. Record platform-specific success evidence.
- When a semantic snapshot exposes a final control but `document.querySelector()` cannot see it, use the current snapshot ref or an exact role/name locator. This occurs on creator pages that flatten Shadow DOM or framework controls into the accessibility tree. Never reuse a ref from an earlier snapshot.
  In the 2026-10-04 Xiaohongshu editor, the footer is a closed-shadow `XHS-PUBLISH-BTN`. Resolve the fresh snapshot's backend node only for inspection/scrolling. `document.elementFromPoint` returns the shadow host; verify the control using its actual `getRootNode().elementFromPoint` and compare to the same button or child. Do not bypass an unrelated intercepting overlay. Use the fresh semantic ref/role locator for the real final click.

## Current Platform Evidence

| Platform | Final control | Required success evidence |
|---|---|---|
| Xiaohongshu | the editor footer's exact `发布` control, not the sidebar `发布笔记` | `发布成功`, or after a missed transient toast, the content manager contains the exact new title, current submission timestamp and matching duration/identity; read the active status tab and note ID independently |
| Douyin | the editor's enabled primary `发布` control | search the exact target title in content manager, press Enter, and observe a status such as `审核中` or `已发布` |
| Bilibili | the scoped `立即投稿` control (`.submit-add` in the live-tested editor) | page or modal contains `稿件投递成功` |
| WeChat Channels | the editor's exact enabled `发表` control | content list contains the exact target identity and an accepted review/published state such as `原创审核中` |

Selectors are evidence from 2026-09-06, not permanent contracts. If the current page differs, stop and repair the platform adapter through an `inspect -> action -> verify` change before publishing.

After an unknown outcome, inspect without clicking again. Xiaohongshu's `published=true` URL and reset uploader alone are insufficient. A list may temporarily render the same card twice: compare its DOM `data-impression` note ID, not card count, before asserting duplicate submissions. Do not delete or republish to repair a duplicated UI card. On Shadow DOM pages such as WeChat Channels, `document.body.innerText` can omit the visible accepted card; use a fresh semantic snapshot or inspect the known shadow subtree instead of treating that omission as failure.

## Result Contract

Return one record per platform with the package fingerprint, task-space identity, click timestamp, observed URL, exact success text/status, and outcome. Distinguish `submitted/reviewing` from `published`; never report a review state as already public.
