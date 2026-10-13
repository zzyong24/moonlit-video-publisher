# Intake Workflow

Start from a video link or local file path.

Before intake, read `node scripts/config.mjs status`. Use `sourceDirectory`, `availablePlatforms`, `defaultPlatforms`, `contentProfile`, platform defaults, and cover preference as proposals only. A current user instruction or explicit package field wins within `availablePlatforms`. If the user asks for an unavailable platform, update onboarding and confirm the account before any browser work.

## Video Input

```text
If it is a local absolute path, use it directly.
If it is a file:// URL, convert it to a local path.
If it is an HTTP(S) link, ask before downloading unless the link clearly points to a direct video file that the user wants published.
If the link points to an already-published creator platform post, treat it as a reference and ask for the source video file before uploading.
```

Before any browser upload, verify the local file exists with `ls -lh` or `test -f`, then run `scripts/check-package.mjs` for every selected platform. For Douyin, MP4/M4V/MOV content above the real-tested 15:00 boundary must be rejected before Ego Lite starts; allow at most 0.1 seconds of container-metadata rounding. Ask for a shorter export; never automatically trim or transcode the source. Continue validating the original file for any other selected platforms because this limit is Douyin-specific.

Before selecting any `原创`, `自制`, or equivalent declaration, require the onboarded `declarations.originalityPolicy` to be `all_videos_original`, or obtain current-video confirmation and pass the one-run `--confirm-original-rights` override. Never infer eligibility from the filename or content. Treat this declaration signal separately from final-publish authorization.

If the exact path does not exist:

```text
1. Stop browser work for that file.
2. Search the source directory for nearby names, for example `*pet*skill*subtitled*.mp4` or `*subtitled*.mp4`.
3. Tell the user the exact path was missing and show the nearest matches.
4. Do not silently fall back to a different video, even if the filename looks similar.
```

This matters because similarly named videos can share a title and topic package, but publishing the wrong local file is worse than pausing for clarification.

## Content Inspection

Before drafting title and tags, inspect the available context:

```text
Filename and nearby subtitle/caption variants
Sidecar subtitle files: .ass, .srt, .vtt
Embedded subtitle streams if sidecars are unavailable
Existing Xiaohongshu titles for similar content
Optional keyframe or video preview if the title is unclear
```

For `.ass` subtitles, read the `[Events]` `Dialogue:` lines and summarize the real topic before drafting.

## Title And Tag Style

Title should match the user's stated voice and the video's real content: clear, conversational, specific, and curiosity-friendly.

Avoid hard-selling, generic traffic bait, and exaggerated claims.

Tags should usually include 3-7 terms, mixing the subject, audience, product, and workflow when relevant. Treat configured `contentProfile.recurringTags` as candidates, not mandatory tags; include only terms relevant to the current video.

Douyin accepts 1-5 topic entities. Explicit package topics win; otherwise use configured `platforms.douyin.defaultTopics`. Confirm account campaigns during onboarding rather than embedding them in this Skill.

Neutral examples:

```text
主题名
工具名
教程
使用技巧
工作流
```

## Platform Text Defaults

Use platform-native text habits:

```text
Xiaohongshu: title + topic entities only. No prose description by default.
Douyin: title + short body if useful + package-supplied topic entities at the end.
Bilibili: title + concise intro/description + tag chips.
WeChat Channels: description field starts with title, then plain hashtags. Leave short title empty.
```

Default cover behavior comes from `cover.uploadExistingByDefault`, which should normally be `false`. Do not create cover artwork. Upload an existing cover only after obtaining its file path for the current run.

Map user-supplied cover files this way:

```text
Xiaohongshu: 4:3 landscape
WeChat Channels: both 3:4 portrait and 4:3 landscape
Bilibili: 4:3 landscape
Douyin: both 3:4 portrait and 4:3 landscape
```

## Proposal Shape

### 标题、简介与话题的搜索意图审读

先从视频真实内容里写出观众会搜索的具体问题，再拟标题、简介与话题。标题前部交代问题或对象；简介开头说明这条视频能回答什么，后面再补经历、证据和适用范围；话题只选视频确实涉及的领域、问题或产品，不为凑数量加泛词。候选话题须在平台输入时选中真实实体，纯文本 `#词` 不算已提交话题。

用户分享的创作者经验可提供写法线索，但未经平台官方证实的搜索权重、固定字数、流量倍数不得写成算法规则。能访问站内搜索时核对联想词、搜索结果和话题候选；访问受限就明确标记候选词未获实时热度验证。发布后再看实际搜索词、点击和观看数据，记录修改前后时间与指标，不把一次波动直接归因于某个标签。

When the user has not provided title and tags:

```text
我先根据视频内容拟一个发布包：

视频:
建议标题:
建议 tags:
抖音 topics:
平台差异:

你觉得合适吗？可以直接改标题或 tag。
```

After the user approves title and tags, ask for platform selection from `availablePlatforms`, proposing `defaultPlatforms`. Mention that existing-cover upload is skipped by default.

## Final Package

Before browser form filling:

```text
视频:
标题:
统一关键词:
小红书 tags:
抖音描述:
抖音 topics:
B站简介:
B站 tags:
B站允许保留的平台自动 tags: 留空，除非用户明确确认
视频号描述:
视频号 tags:
封面: 使用平台默认封面；若本轮明确要求上传已有封面，则记录所需 3:4/4:3 文件路径
平台:
是否使用字幕版:
内容类型声明: 从制作记录确认后写入 contentTypeDeclaration；含生成画面选“含AI生成内容”，已确认无需标注时写“无需标注”或平台对应的无标注值。视频号必须提供声明；与原创/自制权利分别核验
```
