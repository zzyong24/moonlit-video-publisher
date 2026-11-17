![视频发布：核对每个草稿，再提交每个平台](assets/readme/hero.png)

# 月明·视频发布

将已确认的成片发布到小红书、抖音、B 站、视频号和 YouTube：准备草稿、核验实际页面，获得当前作品的逐平台发布授权后提交，并读回结果。

## 支持范围

| 目标平台 | 当前执行方式 | 结果验收 |
|---|---|---|
| 小红书、抖音、B 站、视频号 | 四平台 CLI 编排，必要时由单控制者按平台流程恢复 | 独立核对账号、上传、文案、声明和封面，提交后读回平台结果 |
| YouTube | Agent 使用 Ego 按已实测 Studio 流程执行 | 核对频道、16:9 封面、受众、AI 问卷、版权检查和可见性，公开后验证观看页播放 |

“全平台”按当前请求及私有可用平台配置选择；启用 YouTube 且设置 `includeInAllPlatforms` 时将其纳入。明确指定的平台列表优先。YouTube 尚无第五个自动适配器，不要把 `youtube` 传给四平台 CLI；Agent 在同一任务内串联独立流程，不重复投递已提交平台。

## 试着这样说

```text
用 moonlit-video-publisher，把这版确认的成片准备到我配置的全平台，包括 YouTube，先核对各平台草稿。
只补发 YouTube，沿用已确认成片，先检查频道里是否已经上传，其他平台不要重投。
恢复视频号微信快捷登录：已授权你核对官方弹窗后点击允许，成功后检查目标账号。
```

准备草稿不等于发布授权。最终提交须绑定同一作品、平台与内容版本的当前明确批准；配置默认值和历史批准不能代替。

## 安装

让支持本地 Skill 的 Agent 安装完整仓库，保留随附脚本和资源：

```text
请安装这个 Skill：https://github.com/zzyong24/moonlit-video-publisher
```

也可通过 Skills CLI 安装：

```bash
npx skills add zzyong24/moonlit-video-publisher
```

已有同名安装时先检查差异；使用版本锁的工作区沿用自己的升级机制。

## 首次配置与依赖

需要 Node.js、ego-browser／Ego Lite、可登录的目标账号、确认的成片与封面，以及当前激活的 `moonlit-content-engine` 和 `guoshen` 三阶段审核依赖。发布器接收现有封面；需要新封面时使用 `gbro-cover-design`，本 Skill 不剪视频、不绘制封面。

从 Skill 根目录开始：

```bash
node scripts/config.mjs status
```

四平台 CLI 使用仓库外的 `config.json` 和 `accounts.json`；YouTube 使用同一配置目录的独立 `youtube.json`，不写进四平台配置数组。仅使用 YouTube 时按其独立流程配置频道，不要求为未使用的国内平台开户。默认配置目录为 `~/.config/video-publisher/`，支持既有环境变量覆盖；格式和解析规则见[配置说明](references/configuration.md)。配置只记录可用平台、偏好与目标身份，不携带未来发布许可。

## 执行与恢复

1. 确认成片版本、目标账号和平台，检查是否已有相同上传。
2. 文案确认后完成 script 审核；上传前完成 content 审核；草稿上传后核对原生设置与封面并完成 final 审核。
3. 获得当前平台条目的明确授权，通过批准检查后，串行点击最终按钮，每项只提交一次。
4. 读回结果：审核中记 `submitted`，确认公开才记 `published`；YouTube 公开结果还要验证观看页可播放。

遇到未知提交结果，先查原视频 ID、同页草稿和平台列表，不能以重传重投代替恢复。视频号微信快捷登录已获授权时，Agent 核对官方授权窗、身份与实时画面后点击“允许”，再核对视频号昵称和稳定 ID；系统权限拒绝、身份不明或确需本人扫码/MFA时报告具体阻塞，不绕过系统权限。详见[视频号登录恢复](references/platform-wechat-channels.md#login-recovery)。

## 数据与验收边界

准备草稿会向目标平台上传视频、封面和文案。个人配置、账号标识、凭据、浏览器登录态与运行证据不随 Skill 分发；授权记录只用于当前条目，使用后消费，不作为后续发布许可。不要读取或导出 Cookie、Token。

YouTube 的中文 Studio 横版视频操作流程已实测至公开及 1080p 播放；尚未验证无人值守第五适配器、自动跨五平台调度或 YouTube 自动中断恢复。单元测试和历史成功不能替代本次页面验收。

## 文档导航

- [SKILL.md](SKILL.md)：Agent 执行入口与必读路由
- [配置与首次使用](references/configuration.md)：私有配置、平台选择与频道身份
- [YouTube 流程](references/platform-youtube.md)：Studio 操作、三审与播放验收
- [账号与 Profile](references/account-profiles.md)：目标账号隔离
- [封面映射](references/cover-workflow.md)：既有多规格封面上传与验收
- [逐条发布批准](references/per-item-approval.md)与[最终提交](references/final-publish.md)
- [恢复手册](references/automatic-publishing-playbook.md)与[CLI 命令](references/scripts.md)
- [历史实测范围](references/live-validation-history.md)

当前版本 **2.9.1**：统一五平台说明、Agent 名称、首次配置、封面依赖与资源导航。2.9.0 加入 YouTube 操作流程；2.8.1 补齐视频号微信授权恢复。

---

月明水清深 · `moonlit-video-publisher`

首图为 AI 生成的品牌概念插画，不是工具截图或执行结果。
