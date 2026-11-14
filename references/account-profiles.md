# 发布账号按 Ego Lite Profile 隔离（月明 2026-10-21）

## 规则

- **默认一律发大号（`dahao`）**。只有月明明确说「小号」时，发布包才写 `"account": "xiaohao"`（也接受 `"小号"`）。不能根据当前登录状态推断账号。
- **小号只能发抖音和小红书**。小号配 B站、视频号或其他平台，会报 `ACCOUNT_PLATFORM_UNSUPPORTED`，在任何浏览器操作之前停下。
- **映射缺失就停（fail closed）**：没有 `accounts.json`、没有这个账号、没有 `egoProfileId`、或者没有这个平台的昵称/ID，都直接报错（`ACCOUNT_MAPPING_MISSING` / `ACCOUNT_MAPPING_INVALID`）。
- 同一个 Ego Profile 下的所有 Space 共用一套登录，所以大号和小号**必须在不同的 Profile**；映射校验会拒绝两个账号用同一个 Profile。

## 映射文件

位置：`$XDG_CONFIG_HOME/video-publisher/accounts.json`，或 `~/.config/video-publisher/accounts.json`（和 `config.json` 放在同一个目录）。也可以用 `VIDEO_PUBLISHER_ACCOUNTS` 指定。建议权限设为 600。文件里只放昵称、账号 ID 和 Profile id，**不放 Cookie、Token 或任何登录状态**。不要放进 Skill 目录。

模板：[assets/accounts.example.json](../assets/accounts.example.json)。结构是 `账号 → egoProfileId → platforms.<平台> → {name, id}`：

| 平台 | `id` 填什么 | 发布包里对应的字段 |
|---|---|---|
| douyin | 抖音号 | `expectedAccounts.douyin.douyinId` |
| xiaohongshu | 小红书号 | `expectedAccounts.xiaohongshu.xhsId` |
| bilibili | UID | `expectedAccounts.bilibili.uid` |
| wechat_channels | 视频号 ID | `expectedAccounts.wechat_channels.finderId` |

`egoProfileId` 填 Ego Lite 的 Profile **id**（如 `Default`、`Profile 1`），不能填显示名。

发布包可以不写 `expectedAccounts`，绑定时会按映射自动填上。如果包里手写了，就必须和映射完全一致，否则报 `ACCOUNT_MAPPING_CONFLICT`。不要把当前登录的号抄进去凑数。

## 运行时的闸门

1. **预检**：`check-package.mjs`、`publisher.mjs`、`run-platform.mjs` 都先绑定账号。绑定失败时，这个平台进不了浏览器。
2. **Space 固定到 Profile**（`ego/core.mjs` 的 `selectTaskSpace()`）：
   - 复用已记录的 Space、或复用同名 Space 之前，先用 `listTaskSpaces()` 读出它的 `profileId`。和绑定的不一致就报 `PROFILE_MISMATCH` 停下；不重建、不换 Profile。
   - 新建 Space 只用 `taskSpace(name, { profileId })`，不会再落到「当前激活或上次用过的 Profile」。
   - 读不到 `profileId`、或者有多个同名 Space，报 `PROFILE_UNVERIFIABLE` 停下；没有账号绑定，报 `ACCOUNT_BINDING_MISSING` 停下。
   - 大号的 Space 名字保持原样（`video publisher v2 <平台> <后缀>`），小号的是 `video publisher v2 xiaohao <平台> <后缀>`。名字只是辅助，真正的闸门是 Profile 核对。
3. **账号身份**（抖音、小红书）：每个阶段前后，都在同一 Space 的只读主页里读页头的昵称和账号 ID。证据超过 15 秒就作废；Profile 不对报 `PROFILE_MISMATCH`，昵称或 ID 不对报 `ACCOUNT_MISMATCH`，都会停下。核对通过后，保存一张页头截图（`account-proof/account-<平台>-<账号>-<时间>.png`）。
4. **最终预览**：`publisher.mjs` 汇总里每个平台都有 `destination` 字段（账号、Profile、预期和实际的昵称/ID、截图路径），给月明的预览里必须写「将发到：大号/小号 · 昵称 · ID」，并附上这张截图。
5. **点发布前 15 秒内再核一次**：
   ```bash
   node scripts/v2/verify-account.mjs <douyin|xiaohongshu> <package.json> <task-space-id> --task-name "<记录的 Space 名>" --out <proof.json>
   node scripts/check-approval.mjs --approval approval.json --item <作品ID> --platform <平台> --fingerprint <sha256> --account-proof <proof.json>
   ```
   `verify-account.mjs` 不建 Space、不碰编辑器、不点任何按钮。`check-approval.mjs` 对抖音和小红书要求批准记录里写明 `account`，并要求核验结果在 15 秒内、Profile 一致、昵称和 ID 一致。这两条命令跑完后马上点最终按钮；超过 15 秒就重新跑一遍。
6. B站和视频号没有自动读取账号的功能：只能发大号，并且在准备和最终提交前都要人工核对昵称和 ID。

## 验收状态

以上逻辑目前只有本地 fixture 测试。小红书页头的选择器、`listTaskSpaces()` 返回的 `profileId`、`taskSpace(name, {profileId})` 的签名，都要等 Ego Lite 重启到新版本、建好小号 Profile 之后，用只检查不上传的试跑来验收。
