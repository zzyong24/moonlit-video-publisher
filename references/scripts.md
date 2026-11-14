# Production And Diagnostic Commands

All paths below are relative to the skill directory.

## Configuration

Inspect onboarding state before any other command:

```bash
node scripts/config.mjs status
node scripts/config.mjs validate
```

Run onboarding as documented in `references/configuration.md`. Set `VIDEO_PUBLISHER_CONFIG` to test or use an alternate per-user configuration file.

## Package Validation

Run once for every selected platform:

```bash
node scripts/check-package.mjs <platform> /absolute/path/to/package.json
```

Every publishing CLI supports `--help` without onboarding or browser access. Douyin validation requires both `expectedAccounts.douyin.name` and `expectedAccounts.douyin.douyinId`; missing identity blocks its runner before browser execution. `check-package` validates declared fields only—it does not prove the current login is the expected account. The live `targetAccount` gate is separate and uses fresh same-space DOM evidence. See [the editable package example](../assets/package.example.json).

Preserve historical packages/jobs and create a versioned corrected package when adding the new fields. Never rewrite a saved fingerprint. If a matching correct-account upload already exists, plan verified same-page recovery before any new injection. Same-Profile task spaces share the session; other platforms still need manual destination identity checks before preparation and final submission.

Supported platform keys:

```text
xiaohongshu
douyin
bilibili
wechat_channels
```

Validation checks the mandatory Douyin expected account, local video path, title limits, required platform fields, package-supplied Douyin topics, and any requested cover paths and ratios. For MP4/M4V/MOV it reports duration from ISO BMFF metadata without `ffprobe`; Douyin content above the real-tested 900-second boundary, plus a maximum 0.1-second allowance for container rounding, fails with `DOUYIN_DURATION_LIMIT` before browser work. In a mixed-platform production run, the orchestrator records the invalid platform as `PLATFORM_REJECTED_ASSET` and continues every other platform that passed preflight.

## Production Orchestrator

```bash
scripts/run-safe-platforms.sh \
  /absolute/path/to/package.json \
  task-suffix \
  xiaohongshu douyin bilibili wechat_channels
```

When onboarding has `declarations.originalityPolicy: all_videos_original`, the runner applies truthful original/self-made declarations without another flag. With the generic `ask_each_run` policy, add `--confirm-original-rights` only after the user confirms the current video; this one-run override is not persisted. Read-only `--inspect-only` never needs either signal.

The platform list is optional; omit it to select all four. If the second positional argument is a platform key, the task suffix defaults to `manual`.

Read-only inspection:

```bash
scripts/run-safe-platforms.sh \
  /absolute/path/to/package.json \
  task-suffix \
  xiaohongshu bilibili \
  --inspect-only
```

Options:

```text
--inspect-only
--metadata-only (existing same-job, exactly one platform; see below)
--confirm-original-rights
--state-root <dir>
--job-id <id>
--check-concurrency <positive integer>
--upload-concurrency <positive integer>
--auth-poll-seconds <n>          (default 60; 0 = no late-login join)
--pause-all-on-user-block        (legacy: one login block pauses every platform)
```

Timings: each invocation appends `{startedAt, phases, calls}` to `state.timings` (last 10 runs) and the summary JSON; the log prints the slowest call.

UI concurrency is fixed at `1` and has no public override.

State defaults to `~/.video-publisher/v2-jobs/<job-id>/`. The job stores the package fingerprint, numeric task-space ids, exact stable task-space names, task-space-bound receipts, observations, compact verdicts, an atomic one-generation `state.backup.json`, and schema-`2` receipt checkpoints under `checkpoints/`. An invalid primary state may recover only from a fingerprint-matching backup; the corrupt file is preserved as `state.corrupt-<timestamp>.json`, after which all platform gates are read again.

Before state or browser work, production acquires `~/.video-publisher/v2-jobs/.publisher/orchestrator.lock/owner.json`, then `<job-dir>/orchestrator.lock/owner.json`. The first permits only one video publishing job under the state root while preserving four-platform parallelism inside that job; the second protects its persisted state. A simultaneous different job or duplicate invocation exits immediately. Normal completion removes both locks; a later run removes a stale lock only when the recorded owner PID is dead.

To resume an interrupted run, repeat the same command with the same `--job-id`. The package fingerprint must match. The orchestrator reuses a persisted task space only when both its numeric id and exact stable name identify the same live space; this prevents Ego's post-crash numeric-id recycling from entering another job. It restores only checkpoints whose platform, package fingerprint, and task-space id all match, then inspects page truth again before acting. If the recorded id is missing or has another live name, the runner selects or recreates only the recorded exact platform-space name and writes its current id back. An explicit recreation invalidates receipts even when Ego assigns the replacement the same numeric id. Ownership or user-control errors never use this fallback.

`INPUT_CHANNEL_BROKEN` is invocation-wide. Once any parallel runner records it, the orchestrator waits for sibling runners, skips every later UI mutation, and performs only final read-only verification. The next ordinary same-job invocation resumes after Ego restarts; do not manually clean state or re-run a one-platform mutator inside the broken invocation.

Exit codes:

```text
0: every selected platform is ready, or read-only inspection completed
10: at least one platform remains blocked or incomplete (final status `paused_user` when a platform still needs login)
1: fatal runner/parse/environment error
2: command usage error
```

## Prepare Plain Metadata During A Native Upload

```bash
scripts/run-safe-platforms.sh /absolute/path/to/package.json same-suffix bilibili \
  --job-id existing-job-id --metadata-only
```

Reuse the exact package, job id, state root (if customized), and recorded task-space identity. Stop only the waiting CLI controller and let all its Ego child runners exit first; keep the browser and its native upload alive. The command refuses an active global/job owner or any surviving platform controller before browser inspection. The metadata phase itself holds all four platform locks so another platform cannot start clicking or waiting through Ego concurrently.

This explicit single-platform recovery entry runs `inspect -> metadata`, with the usual content guoshen gate and final-button capture guard. It fills only already available title/description fields through maintained helpers; it does not inject a video, upload covers, choose topic entities/declarations, change account settings, wait for upload completion, or submit. During upload it requires the selected filename or an exposed matching filename in addition to same-job draft identity. A recreated task space, missing upload identity, or blocking dialog must be resolved through ordinary recovery first. Douyin keeps existing topic entities and defers a conflicting description repair.

The result includes `metadata.ok`, `fields`, `deferred`, `verified` and `uploadComplete`. `metadata_prepared` means this bounded metadata step passed, not that the video is ready; the summary always returns `ready: false`. Incomplete metadata uses `metadata_incomplete` and exit `10`. Resume the ordinary same-job command after this step to wait for the actual upload and complete every remaining gate. No automatic four-platform interleaving is implemented. Unit/contract tests cover this entry; live creator-page acceptance remains pending.

`metadata` is an internal adapter phase: invoke it only through the owning `publisher.mjs --metadata-only`, never as a free-standing `run-platform.mjs` command. The runner checks both parent-owned publisher/job locks. For isolated local tests, `VIDEO_PUBLISHER_V2_PLATFORM_LOCK_ROOT` can relocate platform locks; production must keep one shared root for every controller.

## One-Platform Adapter Runner

Use only for adapter diagnosis and targeted repair:

```bash
node scripts/v2/run-platform.mjs \
  <platform> \
  /absolute/path/to/package.json \
  <inspect|upload|mutate|verify|quarantine> \
  [task-suffix] \
  [numeric-task-space-id]
```

Direct `mutate` diagnosis for Xiaohongshu, Bilibili, or WeChat Channels requires either onboarded `all_videos_original` or the one-run `--confirm-original-rights` override. `inspect`, `upload`, `verify`, and Bilibili `quarantine` remain available without either signal.

`quarantine` is valid only for Bilibili. Always reuse the numeric task-space id recorded in job state; do not invent a second task space for an active draft.

For a verify call that must check a custom-cover receipt, pass the persisted receipt JSON:

```bash
VIDEO_PUBLISHER_V2_RECEIPTS='{"cover":{...}}' \
  node scripts/v2/run-platform.mjs bilibili package.json verify suffix 12
```

## Pre-Publish Account Proof

```bash
node scripts/v2/verify-account.mjs <douyin|xiaohongshu> <package.json> <task-space-id> --task-name "<recorded name>" --out proof.json
```

Selects only the recorded task space (never creates one), re-proves its Ego Profile against `accounts.json`, re-reads creator-home name + stable ID, saves a header screenshot and writes the proof. Exit 0 = verified, 3 = mismatch/unverified (stop), 2 = usage or mapping error. The proof is valid for 15 seconds; feed it to `check-approval.mjs --account-proof`. See [account-profiles.md](account-profiles.md).

## Result Contract

The adapter runner prints one line prefixed with:

```text
VIDEO_PUBLISHER_V2_RESULT:
```

Parsers accept the prefix only at the start of a trimmed output line. An exception message that merely mentions the prefix is not a result and must preserve the underlying runner error.

The payload includes:

```text
platform and phase
taskSpaceId
fresh gate evidence (Douyin includes targetAccount name/ID, same-space identity and observedAt; max age 15s)
typed blocker, when present
cover receipts, when produced
finalPublishClicked: false
```

Do not parse unstructured page logs as success.

## Tests

Run local validation without opening creator pages:

```bash
node --check scripts/v2/publisher.mjs
node --check scripts/v2/run-platform.mjs
for file in scripts/v2/platforms/*.mjs scripts/v2/ego/*.mjs scripts/v2/lib/*.mjs; do node --check "$file"; done
node --test scripts/tests/*.test.mjs scripts/v2/tests/*.test.mjs
```

These tests do not replace real platform acceptance.

Review stages: upload/mutate/quarantine run the content-stage guoshen gate. All observations expose a centrally required publishReview gate checked against the final-stage receipt; content-only drafts may be inspected but remain needs_review, never READY. Final submission always uses the default final gate.
