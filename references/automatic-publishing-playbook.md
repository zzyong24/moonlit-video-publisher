# Automatic Publishing Playbook

Use this playbook after a package has been prepared, when resuming an interrupted run, or when the user has authorized final publication.

## Destination Account Is A Separate Gate

Before finalizing a release package, resolve the intended destination from the user's request/work record and compare the actual creator-home name plus stable ID. A logged-in session, Profile name or task-space name does not prove the destination. Douyin packages require `expectedAccounts.douyin.name` and `douyinId`; the new preflight rejects missing values before any browser runner. See [intake and migration](intake-workflow.md#destination-account-and-versioned-package) and the [full example](../assets/package.example.json).

Never retrofit a historical package or rewrite its job fingerprint. Create a versioned corrected package, preserve the release history and rerun review. If a correct-account matching native upload exists, keep its page and plan verified in-place recovery rather than duplicating it. A wrong-account post is an incident, not a reusable matching draft; deletion or reposting needs its own authorization.

The Douyin automatic `targetAccount` gate independently reads a scoped same-space creator-home header before/after phases and video injection; its evidence expires after 15 seconds. Immediately before final submit, recheck that actual name/ID still matches; do not treat old READY/state as account authority. Keep the upload page intact and reuse the dedicated read-only home Page. Xiaohongshu, Bilibili and WeChat Channels still require manual account-name/ID checks before upload/preparation and final submission; automatic identity coverage is not implemented there.

All spaces sharing an Ego Profile share its login session. Stop affected controllers before an authorized login/Profile/account switch, then freshly verify every destination. Creating another task space cannot isolate or repair the account. Do not silently choose another Profile.

## Execution plan: overlap preparation, serialize UI ownership

Use the existing package, platform contracts and saved job evidence before opening creator pages. Build a small per-platform ledger from fresh inspection: current target identity, upload/processing state, missing metadata, missing native declarations, cover slots, final-review receipt and submission result. Repair only missing work; do not repeat discovery or discard a usable upload.

Run independent preparation concurrently when delegation is available and authorized: one Agent can prepare exact platform copy, another can inspect saved cover/review evidence, and another can maintain a reproduced adapter or its tests. Give each an explicit file scope and a read-only/live-action boundary. Those Agents must not claim creator tabs or run publisher commands. The owning controller alone queues all metadata, cover, declaration and final-button mutations. Different task spaces do not provide different browser input channels.

| Work | Can overlap with native video upload? | Completion evidence |
|---|---|---|
| Copy preparation, saved-artifact review, scoped maintenance | Yes, without browser mutation | Prepared exact text, checks or tested source change; not page completion |
| Enabled title and description fields for a proven matching upload | Yes, through the single-controller path below | Fresh exact text readback; upload may still be incomplete |
| Real topic entities, native declarations and account settings | Only through their verified helpers when actual controls are enabled | Native committed entities/selected controls; not pasted prose |
| Independent custom-cover slots | Only when that target's native editor is usable | Every required accepted composition visibly checked and fingerprint-bound |
| Final review and submit | No: upload and processing must be complete | Fresh full verifier, final review, current-run authority, one submit and destination result |

Do not leave all usable metadata fields idle merely because another platform is uploading. Equally, do not acquire a second UI controller to work around the automatic upload barrier. Stop and hand off only the owning waiting CLI, preserve the browser upload, and use the bounded same-job path below. If no safe early path supports a control, defer that control, not the entire platform's preparation. Submit platforms as they independently become READY; a slow platform need not delay an already reviewed ready platform. Final clicks themselves remain serial.

## 1. Resume the same job

For an unchanged valid package, reuse the package, job id, task-space id, and exact task-space name. Start with a fresh read-only inspection:

```bash
scripts/run-safe-platforms.sh PACKAGE TASK_SUFFIX PLATFORM... --inspect-only --job-id JOB_ID
```

Interpret the result literally:

- `READY`: leave the page unchanged; refresh destination identity again immediately before submission because earlier account evidence expires.
- ordinary missing fields: run the normal same-job command for only the affected platforms.
- `ACCOUNT_MISMATCH` / `ACCOUNT_UNVERIFIED`: stop preparation; resolve the intended account and current Profile session, then freshly verify. Do not redefine expected identity to match the wrong session.
- `INPUT_CHANNEL_BROKEN`: restart or reclaim Ego Lite, then repeat the same job.
- `cover` only, with a visible platform cover URL and no receipt: follow section 2.

Never create a second publishing job to escape a recoverable blocker. It loses the link between page truth, package fingerprint, and cover receipts.

If the user changes a platform's title, topics, or cover after a job starts, preserve the original package and job as historical evidence; its fingerprint cannot be silently rewritten. Finish unaffected platforms with the original job. If the changed platform has not accepted a video or created a matching draft, create a versioned package and a new job for that platform only. If it already has a matching upload, inspect and plan an in-place recovery before any new upload; never duplicate a draft merely to apply metadata changes. Record which package and job actually supplied each platform release.

For an in-place repair on a matching existing draft or post, first identify its recorded numeric task-space id and exact stable task-space name. Use a fresh inspect, then target that same page with the one-platform runner and recorded id; do not start a new orchestrator job just to change metadata, because a new task suffix can create a new task space. After mutation, run an independent verify against the same task space and confirm the visible cover before using any currently authorized final control. Never upload the video again to apply a cover correction. Record the versioned package that supplied the correction alongside the original upload history.

## Prepare metadata while native upload continues

When the real editor exposes enabled fields and the target upload can be proven, prepare those supported fields during the native upload. This is a bounded single-controller path; the maintained ordinary orchestrator still waits at a batch upload barrier.

1. Identify the exact active publisher CLI process tree and its task-space/name. Stop only that waiting CLI controller and its runners, never the browser process, native upload, video input, or another job. Confirm every controller process has exited before another UI command. Do not touch page ownership without the user's explicit continuation after USER_CONTROL.
2. Keep the same page, package, fingerprint and ongoing upload. Prove the filename/current target, actual upload progress, editable field availability, armed final guard and zero blocked attempts. Run the current guoshen content gate for the unchanged package. A matching title alone cannot prove an in-progress video identity.
3. Use an existing idempotent helper for each available field under the one serialized controller. Save independent field evidence; exact prose, real entities and no residue are still required. Do not invoke the ordinary full `mutate` phase while its video prerequisite is false, or change that guard to pretend upload is complete.
4. Keep supported early fields separate from deferred controls. The `--metadata-only` entry described below handles only title/description. Topic helpers, native AI/originality declarations, account settings and cover editors are outside that entry; use a separately verified bounded path only if the native control is usable. Never bypass disabled controls. For covers, check all independent compositions and accepted previews before calling the fingerprint-bound checkpoint helper; video thumbnails and staged-but-unsaved images are not custom-cover evidence.
5. Let the native upload and processing finish. Resume the ordinary same-job runner for only pending platforms; it must import valid checkpoints, avoid reinjection of a still-running or completed target, independently verify every final gate, and preserve already committed metadata. Never include already submitted platforms. An early metadata result is not READY or upload completion.

The 2026-10-09 Douyin recovery verified title, exact body, five real topic entities and no-sync while the 533 MB native upload was still in progress; original rights/final authorization were not changed. That live evidence establishes the bounded manual timing path, not an automatic scheduler or four-platform interleaving regression. Disabled/absent fields and upload-processing-dependent controls remain deferred; the final control always waits for complete upload and final review.

### Maintained entry: title and description only

The maintenance source provides the following recovery entry. Its isolated orchestration/contract tests pass; actual matching-upload acceptance is pending. Use the installed revision only after it has been pinned, and record the first real-page outcome separately. Historical manual success does not validate this implementation.

```bash
scripts/run-safe-platforms.sh PACKAGE SAME_TASK_SUFFIX ONE_PLATFORM \
  --job-id EXISTING_JOB_ID --metadata-only
```

If the job used a custom state root, retain its original `--state-root`. This entry requires an existing state file, unchanged fingerprint, recorded numeric task-space id and exact stable name. It never creates replacement spaces. It acquires publisher/job locks, probes all platform locks before inspection, and holds all four platform locks throughout the metadata phase, so lingering upload runners must be stopped first. A lock failure is a handoff failure; do not remove a live owner's lock.

The phase inspects first, proves target identity from the native filename/input when upload is active, retains the final guard and only invokes existing title/description helpers. It does not inject a file, operate covers/topics/declarations, wait for upload completion, or submit. When existing Douyin topic entities make a body replacement unsafe, the body is deferred rather than destroying them. `metadata_prepared` / exit 0 means the bounded fields passed; `metadata_incomplete` / exit 10 means missing or deferred fields remain. Inspect `metadata.ok`, `fields`, `deferred` and `uploadComplete`; `summary.ready` remains false in either case. Resume ordinary same-job verification afterward. This entry does not make the general scheduler automatically interleave all four platforms. The full invocation and result contract lives in [scripts.md](scripts.md#prepare-plain-metadata-during-a-native-upload); do not duplicate a separate runner contract here.

## 2. Recover a lost cover receipt

Before cover recovery, apply the active Skill's Content Package mapping contract and [cover-workflow.md](cover-workflow.md). Check that each adapter is using the explicit mapped file and that every required native slot has independently accepted its pre-produced composition. Do not repair a missing mapping by cropping on the publishing page. A staged thumbnail, attempted upload, one accepted slot or disabled Complete button is not all-slot acceptance.

A browser interruption can occur after the platform accepts a cover but before the fingerprint-bound checkpoint is written. The page then shows the approved cover while verification reports `custom cover receipt missing`.

Recovery requires all of the following:

1. Xiaohongshu/Douyin: the user or operator visually confirms the cover currently shown on the platform is the approved package cover. Bilibili/WeChat Channels: a local visual-identity proof of every slot replaces that human confirmation (see below).
2. A fresh `inspect-only` result exists for the same job and task space; Douyin also requires a matching, unexpired `targetAccount` proof.
3. The package fingerprint still matches the job.
4. Xiaohongshu exposes one live cover URL, or Douyin exposes distinct portrait and landscape URLs; WeChat Channels exposes distinct vertical/horizontal slot captures; Bilibili exposes the landscape slot capture plus a fresh 16:9 personal-space screenshot.

Then run:

```bash
node scripts/v2/recover-cover-receipts.mjs \
  --job-dir JOB_DIR \
  --package PACKAGE \
  --platform xiaohongshu \
  --platform douyin \
  --confirm-visible-assets
```

The command takes the publisher/job locks, validates every requested recovery before writing, resolves the explicit platform artwork mapping, and records fresh evidence, exact task-space identity, artwork ratio, live URL, and package fingerprint. It refuses stale or contradictory observations, unfinished uploads, mirrored Douyin slots, and identity/package mismatch. Atomic checkpoint/state writes invalidate READY; run same-job `inspect-only` again and proceed only after the affected platform is independently READY. Stop the prior CLI controller before invoking recovery.

Dual-slot platforms (no `--confirm-visible-assets`):

```bash
# WeChat Channels: both slot images were captured by the fresh inspect
node scripts/v2/recover-cover-receipts.mjs --job-dir JOB_DIR --package PACKAGE --platform wechat_channels

# Bilibili: landscape 4:3 from the fresh inspect; 16:9 from a screenshot (≤15 min old), optional crop x,y,w,h in pixels
node scripts/v2/recover-cover-receipts.mjs --job-dir JOB_DIR --package PACKAGE --platform bilibili \
  --slot-image wide=/abs/bili-169.png@661,503,404,228
```

`--slot-image` is allowed with exactly one platform. Every slot is compared with its mapped asset and with every other approved asset; a single failed slot writes nothing. Receipts record `visual.distance`, `nearestOtherDistance` and `margin`; slot URLs are stored redacted with a digest. The same rule applies afterwards: run same-job `inspect-only` and proceed only when the platform is independently READY.

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

Choose the next independently READY platform; do not hold a complete reviewed draft behind another platform's upload. When several are READY, a deterministic tie-break order is Xiaohongshu, Douyin, Bilibili, then WeChat Channels. Keep exactly one final-control operation active, verify its result, and record it before proceeding.

Required evidence:

| Platform | Final control | Success evidence | Recorded status |
|---|---|---|---|
| Xiaohongshu | editor footer `发布` | `发布成功` page | `submitted` until public visibility is confirmed in this workspace |
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
