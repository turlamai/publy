# Publy：面向 Agent 的 CLI 调用契约（开发版）

English：[agent-cli.md](agent-cli.md) · 简体中文

**CLI 是通用自动化入口，不是 Typora 专用插件。** Typora、Obsidian、
普通 Markdown 文件、Shell、CI、Agent 都能调用同一套源文件检查、
渲染和公众号草稿服务。Typora、Obsidian 是我们重点验收的写作体验；
发布目标**只有微信公众号草稿箱**，不扩展知乎、头条等平台。

> 当前是源码构建的 TypeScript CLI，不能声称 Racket 独立安装程序、
> 商业托管服务或真实公众号端到端验收已完成。

## 先发现能力，拒绝猜命令

```bash
publy capabilities --json
publy config set api_key "$PUBLY_API_KEY" --json
publy check "D:/Notes/article.md" --json
publy preview "D:/Notes/article.md" --json
publy render "D:/Notes/article.md" --json
publy theme ls --json
publy theme preview medium --json
publy account list --json
publy account add Work --theme claude --json  # 本地写入，必须先得到用户授权
publy quota --json
publy jobs list --json
publy history --json
```

`capabilities --json` 离线返回版本化的能力列表：每个命令是否
支持 JSON、是否可能联网、是否修改本地文件或真正创建草稿。
**没有声明 JSON 的命令不要凭猜测去解析：**部分剩余命令仍偏向人类使用。
`config set <key> <value> --json` 已支持结构化回执，不回显 API key 等配置值；这是需经操作者授权的本地修改。
`jobs cancel <jobId> --json` 和 `jobs retry <jobId> --json` 现在能返回
结构化回执，但**属于修改服务器状态的操作，Agent 必须先获得用户授权**。
若网络异常而结果不确定，返回 `status:"unknown"` 与原 jobId，
应先通过 `jobs list --json` 对账，不能盲目反复操作。
中断草稿的 retry 只对账内容完全匹配的本地确认记录，或重新接入可证明尚未提交的失败。
HTTP 409 `DRAFT_OUTCOME_UNKNOWN` / `IDEMPOTENCY_CONFLICT` 需要另行检查远端草稿；保留原账号、jobId 和请求身份。
对 Agent 公开真实能力，不虚报“所有命令已统一”。

## 安全检查和本地预览

`check --json` 检查原始文章、图片、封面、图片消息 PNG、卡片规则。
`preview --json` 输出单个 JSON 对象，包含
`schemaVersion:1`、`kind:"local-preview"`、`ok`、
`source`、`output`（成功时）、`problems`、
`networkUsed:false`、`submitted:false`。

**JSON 模式永远不自动打开浏览器**，并返回私有 HTML 的路径。Agent
可以自主检查生成物、截图等，但不能未经授权上传原文或预览。预览
包含内嵌的本地图片，使用完应清理临时文件。`mode: cards`
预览调用实际 PNG 引擎，且不静默联网下载字体。有缺图等阻塞时
仍可生成带错误提示的预览，但 JSON 中 `ok:false`、退出码为 4。
检查和预览都不会创建公众号草稿。

## HTML 导出与离线主题列表

`render --json` 生成权限受限的本地 HTML，stdout 返回
`kind:"html-render"`、文件路径 `output`、附件数量、素材问题
以及 `containsAttachmentReferences`。注意与 `preview` 不同：
**这里是公众号渲染原始 HTML**，可能仍包含 `attachment://`
占位链接，必须经过正式图片上传流程，不能当成已可直接粘贴的成品。
原文绝不修改；覆盖现有 HTML 必须显式 `--force`。
命令不会上传文章，也不会创建公众号草稿。

`theme ls --json` 返回内置文章/卡片主题及已安装文章主题元数据 `installedArticleThemes`，保留 `source:"bundled"`、`networkUsed:false`；列出时不访问网络。`theme pack`、`add`、`update`、`remove` 会写入本地文件，必须先得到用户授权；pack 不覆盖已有文件。HTTPS 添加或更新必须提供完整文件的 `--sha256`，不跟随重定向，并通过 `networkUsed` 报告联网情况；本地来源保持离线。成功返回 `kind:"theme-bundle"`、`ok:true` 和稳定 `code`；包无效或写入失败返回 具体的 `THEME_*` 错误码（退出码 2），包括 `THEME_HASH_MISMATCH`、`THEME_UNSAFE_CSS`、`THEME_EXISTS` 与 `THEME_NOT_FOUND`。摘要不能证明作者身份。使用方法见[主题说明](USER-GUIDE.zh-CN.md#使用独立文章主题cli-开发版)。

`theme preview <name> --json` 离线生成私有 HTML，返回 `kind:"theme-preview"`、`output`、主题类型及 `networkUsed:false`；不会打开浏览器或创建草稿。未知主题返回 `UNKNOWN_THEME`（退出码 2），无法渲染返回 `THEME_PREVIEW_FAILED`（退出码 3）。文章与卡片同名时沿用卡片优先规则。

## 发布和“结果未知”的恢复

```bash
# 用户明确同意向指定公众号创建草稿后才能调用：
publy publish article.md --account "我的公众号" --json

# 网络中断时，用同一 requestId 查询，不要盲目创建第二份：
publy publish-result <requestId> --json
```

成功时输出 `kind:"publish-result"`、
`ok:true`、`status:"confirmed"|"scheduled"`、
`requestId` 和账号；预检失败时为
`ok:false`、`status:"not_submitted"`；
网络中断或服务器返回 5xx 时为
`status:"unknown"`、`submitted:null`，保留原请求 ID；
明确拒绝的 4xx 为 `status:"rejected"`。
**unknown 不等于失败，也不等于已成功。** 需要先对账，
必要时在微信后台核对草稿。
`publish-result --json` 返回 unknown 时退出码为 4。

## Agent 接入原则

- **stdout 只输出 JSON，stderr 输出诊断信息**；不要解析中文成功提示。
- 退出码：0 成功，1 用法/配置，2 本地文件或输出路径，
  3 渲染失败，4 素材预检或结果未知，5 服务/网络故障。
- Agent 可自动做离线 `check`、`preview`；创建草稿前应向用户明确展示
  **文章源文件、目标公众号、操作仅为“保存草稿”**并征得授权。
- 操作任务取消/重试等会改变服务器状态，需与只读查询严格区分。
- **当前没有宣称已提供 MCP Server。** CLI 本身是稳定的脚本接口；
  如有真实需求，后续 MCP 只做薄适配，不重复实现发布逻辑。

推荐流程：**发现能力 → 检查 → 本地预览 → 用户确认账号 →
投递草稿 → 查询与恢复**。

`config set <key> <value> --json` 是需要用户授权的本地配置变更，输出单个 `config-set` JSON 对象。`CONFIG_SAVED`、`CONFIG_KEY_INVALID`、`CONFIG_INVALID`、`CONFIG_WRITE_FAILED` 均不回显值（包括 API Key、含凭据的 URL）。

`account add <name> --json` 返回单个 `account-add` 对象，成功码为 `ACCOUNT_SAVED`，错误码为 `ACCOUNT_NAME_INVALID`、`CONFIG_INVALID` 或 `CONFIG_WRITE_FAILED`。输出不包含 App ID、作者元数据或配置原文；未指定参数会保留原有字段。此操作修改本地配置，Agent 须事先获得用户明确授权。

`publish --json` 收到 `DRAFT_OUTCOME_UNKNOWN` 时返回 `status:"unknown"`、原请求 ID 和退出码 5。服务端会在重启后继续阻止未解决的带键即时请求；请先查询并检查微信草稿箱，不要盲目重发。服务端返回明确的 `WECHAT_<code>` 拒绝时报告 `rejected`；无法识别的服务错误仍视为未知。这是开发版契约，不代表端到端恰好一次。
