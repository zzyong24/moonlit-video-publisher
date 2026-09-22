# Automatic Publishing Playbook

Use this playbook after a package has been prepared, when resuming an interrupted run, or when the user has authorized final publication.

## 1. Resume the same job

Always reuse the package, job id, task-space id, and exact task-space name. Start with a fresh read-only inspection:

```bash
scripts/run-safe-platforms.sh PACKAGE TASK_SUFFIX PLATFORM... --inspect-only --job-id JOB_ID
```

Interpret the result literally:

- `READY`: leave the page unchanged.
- ordinary missing fields: run the normal same-job command for only the affected platforms.
- `INPUT_CHANNEL_BROKEN`: restart or reclaim Ego Lite, then repeat the same job.
- `cover` only, with a visible platform cover URL and no receipt: follow section 2.

Never create a second publishing job to escape a recoverable blocker. It loses the link between page truth, package fingerprint, and cover receipts.

## 2. Recover a lost cover receipt

A browser interruption can occur after the platform accepts a cover but before the fingerprint-bound checkpoint is written. The page then shows the approved cover while verification reports `custom cover receipt missing`.

Recovery requires all of the following:

1. The user or operator visually confirms the cover currently shown on the platform is the approved package cover.
2. A fresh `inspect-only` result exists for the same job and task space.
3. The package fingerprint still matches the job.
4. Xiaohongshu exposes one live cover URL, or Douyin exposes distinct portrait and landscape URLs.

Then run:

```bash
node scripts/v2/recover-cover-receipts.mjs \
  --job-dir JOB_DIR \
  --package PACKAGE \
  --platform xiaohongshu \
  --platform douyin \
  --confirm-visible-assets
```

The command records the exact evidence file, task space, local asset path, ratio, live URL, and package fingerprint. It refuses stale evidence, mirrored Douyin slots, task-space mismatch, or a package mismatch. Run `inspect-only` again; proceed only when every selected platform is `READY`.

Do not hand-edit `state.json` or manufacture a receipt from an old URL.

## 3. Target final controls from current page truth

Creator pages may expose controls through Shadow DOM or framework accessibility trees. `document.querySelector()` can return nothing while `snapshot()` still shows a valid actionable ref.

Use this order:

1. Take a fresh semantic snapshot.
2. Prefer its current ref for the final control.
3. Use an exact role/name locator when the ref is unavailable.
4. Use a scoped stable selector only when the platform contract documents it, such as Bilibili `.submit-add`.

Never reuse a ref from an earlier snapshot. Before the click, remove only `window.__VIDEO_PUBLISHER_FINAL_GUARD__.guard`, verify the exact control is enabled, and click once.

## 4. Publish serially and verify externally visible state

Recommended order:

1. Xiaohongshu
2. Douyin
3. Bilibili
4. WeChat Channels

Required evidence:

| Platform | Final control | Success evidence | Recorded status |
|---|---|---|---|
| Xiaohongshu | editor footer `发布` | `发布成功` page | `published` |
| Douyin | primary `发布` | search exact title in content manager; `审核中` or `已发布` | match page truth |
| Bilibili | `.submit-add` / `立即投稿` | `稿件投递成功` | `submitted` until accepted |
| WeChat Channels | `发表` | exact target in content list with `原创审核中` or published state | `submitted` or `published` |

For Douyin, navigation to content management is not enough. Search the exact title and press Enter before reading the status. For every platform, a timeout or navigation is an unknown result until the target is found; inspect before any retry.

## 5. Record the release

Write one record per platform to the work's `distribution/releases.json` with:

- platform and content type;
- `published` or `submitted` based on observed evidence;
- observed date and exact status text;
- job id and task-space id;
- package fingerprint when available.

Update the work-level state after recording the platform facts. A review state remains `submitted`; do not report it as public.

## 6. Lessons from the CreatorOS four-platform run

- A missing receipt is a persistence failure when the approved cover remains visible; it is not automatically an upload failure.
- Re-uploading blindly can replace a correct cover or create slot ambiguity.
- Semantic refs can reach controls hidden from ordinary DOM queries.
- Platform success must be read from the destination page, not inferred from the click.
- Run final controls serially so one platform's dialog, navigation, or browser ownership change cannot contaminate another platform.
