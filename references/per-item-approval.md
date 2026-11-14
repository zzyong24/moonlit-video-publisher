# 逐条发布批准（团队规则 2026-10-21，优先于本包其他条款）

月明 2026-10-21 定的口径：**发布键在月明**＝可以自动发布，但每一条都要月明先审核、明确批准。

## 流程

1. **准备到 READY**：上传、填表、封面、声明都做完并核验，停在最终发布按钮前，不点。
2. **给月明看最终预览**：发出“这一条”的最终样子——**将发到哪个账号（大号/小号 · 昵称 · 账号ID，附 publisher 汇总 `destination.screenshotPath` 的账号页头截图）**、平台、作品ID/标题、正文或首帖、封面/图片顺序、话题、原创与 AI 声明、可见性、发布时间，附预览截图路径和内容指纹（sha256）。
3. **等月明对这一条明确批准**：要有针对这一条的明确话语（例如“批准发布《标题》到小红书”）。沉默、“看着办”、“都发吧”但没逐条看过预览、对别的作品或别的平台的批准，都不算。
4. **当场写批准记录** `approval.json`（放作品的 `distribution/<平台>/` 目录，不进 skill 仓库）：

   ```json
   {"item": "作品ID", "platform": "xiaohongshu", "fingerprint": "<sha256>",
    "account": "大号", "approvedBy": "月明", "approvedAt": "2026-10-21T10:00:00+08:00",
    "previewShown": "<预览截图路径>", "approvalQuote": "月明原话", "consumed": false}
   ```

5. **发布前检查**：抖音/小红书先跑 `node scripts/v2/verify-account.mjs <平台> <package.json> <task-space-id> --task-name <记录的名字> --out proof.json`（15 秒内有效），再跑 `node scripts/check-approval.mjs --approval approval.json --item <作品ID> --platform <平台> --fingerprint <sha256> --account-proof proof.json`，返回 0 马上点最终按钮，只点一次；超过 15 秒或账号/Profile 对不上就停。`account` 必须是月明在预览里看到并批准的那个账号。
6. **发布后核销并回报链接**：核验平台结果后运行 `--consume --link <公开链接>`，然后把链接（审核中就写“已提交，审核中”）报给月明。

## 不能做

- 不复用以前的批准：重试、续发、换平台、改了任何文案/媒体/设置，都要重新给月明看预览。
- 不把批准写进配置、内容包或下一次任务；一份批准只对一个作品 × 一个平台 × 一个内容指纹有效。
- 多平台同时发：每个平台各给一次预览、各要一次批准。
