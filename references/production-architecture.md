# Production Architecture（2026-10-21 从 SKILL.md 移出，内容未改）


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

The maintained orchestrator currently waits at a batch upload barrier before its automatic mutation phase. Do not confuse that implementation limit with a platform requirement to leave ready metadata fields idle. If the user requests preparation during upload, follow the single-controller recovery branch in [automatic-publishing-playbook.md](automatic-publishing-playbook.md#prepare-metadata-while-native-upload-continues): stop only the waiting publisher CLI controller, preserve the live native upload, and serially fill already available fields through the existing verified helpers. Covers may be prepared only when their actual native controls and target identity are ready. No second controller may click concurrently. The automatic scheduler has not yet been changed to interleave these phases. Upload completion remains a mandatory final gate: a preview card alone is insufficient when progress text, a percentage, processing text, or `取消上传` remains visible.

Treat the Ego input channel as shared failure state. If any parallel phase returns `INPUT_CHANNEL_BROKEN`, wait for the other runners to exit, then skip every remaining quarantine, upload, and mutation in that invocation. Run only final read-only verification so the persisted job records page truth; resume through the ordinary same-job command after Ego restarts.

Custom-cover dialogs also use the single UI queue. Isolated task spaces do not make concurrent clicking safe.

Accepted cover receipts are written to atomic, fingerprint-bound checkpoints inside the job directory before an adapter returns. This closes the crash window between a successful creator-page mutation and the orchestrator recording its result. A resumed run still has to match the checkpoint against fresh page truth.

Job state also keeps a one-generation atomic backup. If `state.json` is invalid JSON, restore only a backup whose package fingerprint matches, preserve the corrupt primary as `state.corrupt-<timestamp>.json`, and then re-inspect every platform. Never turn restored state into `READY` without fresh page verification.

## 2.8.0 Changes

- Login block isolation: `blocked_user` on one platform no longer pauses the others; read-only late-auth polling lets it join the same run.
- Phase/call timings persisted in `state.timings`.
- Bilibili/WeChat Channels dual-slot visual receipts (`scripts/v2/lib/cover-identity.mjs`, `visual-identity.mjs`); resolved in `run-platform.mjs` because the Ego runtime cannot run `sips`.
- Signed URL redaction for every receipt, checkpoint, runner result and error detail (`scripts/v2/lib/signed-url.mjs`).
- Unchanged on purpose: serial UI queue, upload barrier, serial final publish and per-item approval.
