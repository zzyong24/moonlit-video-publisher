# YouTube: verified Ego operator workflow

## Routing and persisted preferences

This is a supported single-controller Ego workflow. The maintained `publisher.mjs` orchestrator still accepts only its four existing platforms; do not pass `youtube` to it or represent this operator workflow as an automatic fifth adapter. Preserve previous releases and handle only the missing YouTube item.

Read the optional private `$XDG_CONFIG_HOME/video-publisher/youtube.json` (default `~/.config/video-publisher/youtube.json`). It contains only `schemaVersion: 1`, `enabled`, `includeInAllPlatforms`, `egoProfileId`, `channelName` and `channelId`. Explicit current platform selection takes precedence. If enabled and `includeInAllPlatforms` is true, an authorized “all platforms” request includes this workflow after the ordinary four-platform run. A current explicit YouTube request also selects it. This preference is platform availability, never future publish permission. Missing intended identity must be resolved before upload; never infer the destination solely from the logged-in channel.

Use the same channel identity contract before upload and before final submission: the visible channel name plus the stable `UC…` ID from the Studio channel URL must match the private configuration / approved package. Keep one persistent Profile-pinned task space; save the numeric id, exact name, upload video ID and final URL in the work. Reuse the matching draft after interruption; inspect the channel content list before injecting any file. Never re-upload to recover a metadata failure or unknown final result.

## Package and three-stage review

Create a separate immutable YouTube package when adding this destination to an already submitted four-platform package. Include video path/hash, exact title/description/tags, intended channel name/ID/Profile, explicit visibility and approved 16:9 cover path/hash. Keep native settings, screenshots, approval and result in the work; no channel IDs, personal paths or login state in the public Skill.

Apply the activated content-engine v2 script/content/final gate with platform `youtube` and `supplementalPlatformReview: true` at each stage. Supplement official YouTube rules before upload: community guidelines, copyright, audience, AI disclosure, thumbnails, and any relevant special topic. Unchanged media extraction evidence can be reused by hash, with a new platform semantic review; never copy another platform's verdict. Example official sources:

- https://support.google.com/youtube/answer/9288567 (community)
- https://support.google.com/youtube/answer/2797466 (copyright)
- https://support.google.com/youtube/answer/9528076 (audience)
- https://support.google.com/youtube/answer/14328491 (AI disclosure)
- https://support.google.com/youtube/answer/72431 (thumbnail)

A cartoon character does not by itself make an adult technical tutorial “made for kids”. Judge the intended audience and actual content. Read the complete native AI questionnaire: realistic fabricated people/events/places and core AI music require disclosure; non-realistic animation, production assistance and AI thumbnails are official examples that need not trigger that realistic-content label. Answer the actual current question truthfully and preserve a prose AI disclosure when appropriate; do not equate its compact “No AI” accessible label with no AI anywhere in the production. Do not mechanically reuse another platform's AI label. Save the current question and selected answer as final evidence.

## Studio sequence

1. In Ego, inspect `https://studio.youtube.com`, verify channel name/ID and inspect content for the target. No account/Profile switching without corresponding authorization.
2. Install a page-level final-click guard for the upload dialog's actual `发布` / `Publish` control before file injection. Save `guardArmed: true`, zero blocked attempts and `finalPublishClicked: false` until final review and current-run approval pass. A local guard is a safety net, not approval.
3. Use Create → Upload videos. Inject the confirmed file into the existing `input[name="Filedata"]`, or use the visible Select files chooser. Record the generated video ID/link immediately. File selection is not upload completion.
4. Fill exact title and description using current semantic refs. Upload the approved 16:9 thumbnail with the visible Upload file chooser. Independently inspect the accepted native preview at thumbnail size and larger; no improvised crop or artwork change in Studio.
5. Select made-for-kids status based on the content. Open advanced settings, independently verify paid promotion and the AI questionnaire. Apply language/category only when appropriate to the package, commit tag chips and check for residue. Preserve standard license unless another license was explicitly approved. Do not add sponsorship, collaborators, paid promotion, premieres or a schedule without authorization.
6. The upload dialog scrolls independently. If a semantic target is outside its viewport, inspect the actual DOM and `scrollIntoView` that exact control before using Ego's real click. Do not repeatedly click the same offscreen target or persist coordinates.
7. Go through Video elements and Checks. Existing burned subtitles remain in the video; separately uploaded caption tracks are optional and must use the same version/timing. Wait for upload completion, requested resolution processing and the actual copyright-check result. “No issues found” is a platform observation, not proof of all rights. Any unresolved claim or warning must be assessed before publication.
8. Select the explicitly requested visibility; ordinary public publication is not a premiere. Before the final click, save title/description, audience, AI answer, license/settings, checks, accepted thumbnail and visibility evidence. Run final semantic review and the v2 gate, verify intended channel again and check the current-run one-item approval. A prior upload or default platform preference is insufficient.
9. Disarm only this task's own guard, verify the exact enabled final control is in the viewport and unobstructed, and click once. On uncertainty inspect the same video ID in Studio and the watch URL before considering any retry.
10. Read the publication confirmation and open the actual watch URL in the same task space. Match title, channel and duration; verify playable media and requested resolution when available. Record private/draft, submitted/processing, scheduled or public accurately. Preserve the public URL and one-shot approval consumption, leave only the useful result page, and never repeat already successful destinations.

## Acceptance boundary

The Chinese Studio operator flow has been exercised with a normal landscape talking-head tutorial: upload, accepted 16:9 custom thumbnail, exact text/tag chips, audience, paid-promotion and AI answers, language/category, completed checks, public publication, and 1080p watch-page playback. This validates that observed operator sequence, not a maintained unattended adapter, crash/restart recovery, all account types, alternate Studio languages or automatic cross-platform scheduling. A future automatic adapter needs its own idempotent inspect/mutate/verify tests and interrupted-run/no-op live acceptance before claiming those capabilities.
