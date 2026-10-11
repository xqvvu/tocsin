# Destination 模板后续模式评审（#16）

Parent: https://github.com/xqvvu/tocsin/issues/16
日期: 2026-10-10
状态: 评审完成，未改动任何实现代码。**（2026-10-11 更新）本评审建议的 #19 / 18a / 17a / 17b 已全部实现并
合入 main，18b 作废**，见文末「落地情况」。评审结论本身按当时的代码状态保留，不回改正文。

## 结论先行

飞书实现已经把共享模板引擎的三个核心能力（`TemplateContext v1`、递归字符串插值、诊断）验证到可以复用的程度。**#19（generic webhook JSON payload）可以直接复用，零安全边界变化**；**#18（Slack blocks）被一个结构性事实挡住**（blocks 是顶层数组，而现有 JSON 模板的 schema 只接受对象根）；**#17（Email HTML）被安全边界挡住**（仓库不存在任何 HTML 转义层，插值是裸 `replaceAll`）。

因此建议：#19 立刻开工；#18 拆成"对象包装"与"根数组支持"两片；#17 拆成"subject+text"与"HTML body"两片，后者需要 owner 就转义策略拍板后才允许动代码。

## 现状盘点（证据）

| 能力 | 位置 | 说明 |
| --- | --- | --- |
| 模板模式联合类型 | `packages/destinations/src/template.ts:207` | `z.discriminatedUnion("mode", [Text, FeishuCard])`，目前只有 `text` 与 `feishu_card` |
| 文本专用别名 | `packages/destinations/src/template.ts:212` | `TextOnlyDestinationTemplateSchema = TextDestinationTemplateSchema`，被 slack / email / generic-webhook 三个 config 直接引用 |
| 模式分派 | `packages/destinations/src/template.ts` `diagnoseDestinationTemplate`（L286 起） | 用 `template.mode === "text" ? 文本诊断 : 卡片诊断` 的三元表达式硬分派 |
| JSON 递归插值 | `packages/destinations/src/template.ts` `interpolateJsonTemplate`（L505） | 对 string / array / object 叶子一律递归，**渲染器本身与模式无关** |
| 字符串插值 | `packages/destinations/src/template.ts` `interpolateTemplateString`（L524） | `template.replaceAll(RE_TEMPLATE_VARIABLE, ...)`，无转义、无 HTML 感知 |
| 对象根约束 | `packages/core/src/json.ts:7` | `JsonObjectSchema = z.record(z.string(), JsonValueSchema)`，**拒绝顶层数组** |
| 脱敏 payload 路径 | `packages/destinations/src/template.ts` `payloadPathSegments`（L596） | `payloadPathSegments` 允许读取已脱敏 payload 的标量路径与数组下标（非原始 payload） |
| Preview 与样例 | `apps/console/src/server/destinations/destination.service.ts:278` | `previewDestinationConfig` + `resolvePreviewSample` 已支持内置样例与历史 Event |
| 不可重试配置错误 | `packages/destinations/src/feishu/adapter.ts` | `isValidationError` / `validationErrorToPayload` → `configuration_error` 且 `not_retryable` |

三个待扩展通道的现状：

- `slack/schema.ts`：`webhookUrl` + `TextOnlyDestinationTemplateSchema`。`slack/payload.ts` 用代码拼装 `header / section / fields` 三种 block，模板只替换 `section.text` 里的 `message`。
- `email/schema.ts`：`subjectPrefix` + `TextOnlyDestinationTemplateSchema`。subject 由 `email/payload.ts` 用代码拼装（`subjectPrefix + [severity status] + event.title`，非模板驱动）；html 由 `renderEmailHtml(text)` 把已渲染纯文本包进 `<pre>` 自动生成（非独立模板）。缺的是 subject 模板字段与 html 模板字段。
- `generic-webhook/schema.ts`：`url / method / headers` + `TextOnlyDestinationTemplateSchema`，payload 形态固定。

manifest 侧：只有 `feishu/manifest.ts:96` 的 `type: "template"` 字段声明了 `modes: [...]`（含 `help` 链接）。slack / email / generic-webhook 的 template 字段**没有声明 modes**，因此 UI 只能按文本模板渲染。

## 逐条对照 #16 验收项

### 1. 三项需求 vs 飞书实现的复用面

| 后续模式 | 可直接复用 | 需要改动 |
| --- | --- | --- |
| generic webhook JSON payload | `interpolateJsonTemplate`、`diagnoseJsonTemplate`、`renderJsonOrThrow`、`TemplateContext v1`、诊断形状、preview 结果形状 | 联合类型加一个 `mode: "json"`；`diagnoseDestinationTemplate` 的三元改为模式表；manifest 声明 modes；payload 侧按模式取模板 |
| Slack blocks | 同上（渲染器与诊断完全够用） | **根数组问题**：blocks 必须是数组，而模板字段类型 `JsonObjectSchema` 只接受对象。方案 A：模板存 `{ "blocks": [...] }` 对象，发送时取 `blocks` 字段，核心零改动；方案 B：新增接受 `JsonValue` 根的模板 schema，属核心改动 |
| Email subject / text / HTML | `interpolateTemplateString`、`TemplateContext v1`、诊断 | 一个 destination 需要**三个模板槽**（subject、text body、html body），而当前模型是"每个 config 一个 `template` 字段、由 mode 决定形态"。subject 恒为文本、不该有 mode 选择器，现有联合类型无法表达 |

`TemplateContext v1` **不需要新增任何字段**：三项需求的变量面（事件、来源、目的地、presentation、`tocsin.eventUrl`、已脱敏 payload 标量）已被白名单覆盖。

诊断形状 **不需要改动**：`path` 已经是自由字符串，能表达 `template.card.elements[2].fields[0].text.text` 这类别名路径，扩展到其他模式同样够用。

preview 结果形状 **对 #18/#19 不需要改动**；对 #17 需要确认一点：一个 destination 出现多个模板字段时，诊断聚合与"错误定位到具体字段"的呈现方式（多字段合并进同一个 `diagnostics[]`，靠 path 前缀区分，方向上可行）。

adapter manifest 元数据 **需要改动**：三个通道都要补 `modes` 声明，否则 console 无法渲染模式选择器。这是纯元数据扩展，不是边界变化。

### 2. 需要变更的部分（实现前必须记录）

1. **模式分派从三元改为模式表**（共享核心改动）。当前 `mode === "text" ? ... : ...` 的写法在加入第三种模式时会直接产生错误分派。建议改为按 mode 取诊断/渲染策略的表驱动形式。此改动服务 #19 与 #18，应作为它们的前置小 PR。
2. **JSON 模板根类型决策**（#18 阻塞点）。`JsonObjectSchema` 拒绝顶层数组是有意为之（目的地 config 与 TOML 导出都以对象为根），不该为了 Slack 单方面放宽。优先采用方案 A（对象包装），把方案 B 作为独立决策留待后续需求出现。
3. **多模板槽建模**（#17 阻塞点）。当前 `template` 是单一字段 + mode 判别。Email 的 subject/text/html 是三份独立内容、三种输出语境。不要通过给 `DestinationTemplateSchema` 增加 `email_composite` 这类"打包模式"来解决——那会把一个通道的形状泄漏进共享联合类型。应在 email 模块内用三个独立字段建模，各自复用文本/JSON 渲染入口。
4. **HTML 输出编码**（#17 安全阻塞点，见下节）。

### 3. 安全边界保持明确

以下四条边界在三片后续实现中**均不得放宽**：

- **无用户 JavaScript**：插值仍为正则 `replaceAll`，禁止引入 `eval`、`new Function`、模板字符串求值或任何表达式语法。条件/循环/函数调用的禁令继续有效。
- **无原始 payload 变量**：可读取的 payload 路径必须继续经过 `redactJsonValue`（`template.ts:270`、`destination.service.ts:377`），不得新增绕过脱敏的原始引用路径。
- **无目的地密钥**：`secretFields` 声明的字段（如 `webhookUrl`、`endpointUrl`、SMTP 凭证）不得进入 `TemplateContext`，不得出现在 rendered payload、preview 响应或普通日志中。
- **无 source token**：source token 仅在 intake 校验侧使用，不得成为模板变量，也不得被 preview 返回。

**新增风险（仅 #17 HTML）**：仓库已有一个 HTML 实体转义函数 `escapeHtml`（`packages/destinations/src/email/payload.ts`，转义 `& < > " '`），但目前是模块内私有、且只用于把渲染后的纯文本包进 `<pre>` 自动生成 HTML。它**尚未接入插值链路**。因此 #17b 的阻塞点不是"没有转义能力"，而是"HTML body 模板的转义语义如何定义"：

- 与飞书 card JSON 模板类比——JSON 模板里"结构由运算符编写、变量值插入字符串叶子"已经是被验证的模型。HTML body 模板应沿用同一信任模型：**模板标记本身视为运算符可信内容（按原样输出），但每个插值变量的值默认经 `escapeHtml` 转义后再插入**。这样 `{{event.title}}` 带 `<script>` 不会形成注入，同时运算符仍能自由编写 `<table>` 等结构。
- 该策略要求把 `escapeHtml` 从 email 私有函数提升为可复用工具（放 `@tocsin/core` 或 destinations 共享层），并给插值层增加一个"输出语境"参数（text / html），或在 email 侧提供 `renderTextHtmlEscaped` 变体。属于可控的局部改动，不触碰 TemplateContext 白名单。
- 禁止"可信原文"退出方式（如 `raw.` 前缀）：当前 `raw` 命名空间被明确拒绝，为 HTML 单独开口会破坏安全边界一致性。若运算符确需插入富文本，应改用结构化模板而非原文退出。

结论：#17b 可以在采用"变量值默认转义 + 模板结构可信"这一明确语义后实施，无需再等待额外的安全策略批准；但这层语义必须写进 PRD 与 UI 文案，并在测试中覆盖"变量含 HTML 特殊字符"的用例。

### 4. 实现切片确认 / 重新拆分

- **#19** → 确认按原范围实施，可立刻开工。前置：模式表重构 PR。
- **#18** → 建议拆为两片：18a 对象包装 `{ "blocks": [...] }` 的 blocks 模板模式（零核心改动，可实施）；18b 根数组 JSON 模板支持（核心 schema 决策，暂缓）。
- **#17** → 建议拆为两片：17a subject 模板 + text body 模板（无安全问题，可实施）；17b HTML body 模板（采用"变量值默认转义 + 模板结构可信"语义后可实施，见安全边界一节）。
- 三片实现都必须各自携带：schema、payload/发送接线、preview 接线、manifest `modes` 声明、i18n 文案（`en-US` / `zh-Hans`）、表单双向映射、以及对应通道的成功/诊断/密钥安全测试。

## 未解决项

1. `escapeHtml` 的提升位置——放 `@tocsin/core`（供其他通道复用）还是 destinations 共享层。实现 #17b 时定，属局部决策，不阻塞评审通过。
2. Slack blocks 的根数组方案取舍（#18a 对象包装 vs #18b 放宽核心 schema）——本评审推荐 18a。
3. 一个 destination 出现多个模板字段时的 preview 呈现方式（#17）——方向可行（诊断按 path 前缀区分），实现时验证。

## 落地情况（2026-10-11）

本评审交付后，#19 / 18a / 17a / 17b 四片按建议的拆分实现并合入 main。当前实现共四种模板模式，
完整清单见 `docs/prd/destination-template-engine.md` 的「模板模式全貌」；评审建议记录的四条决策的
取舍见 `docs/adr/0010-destination-template-object-root-payload-and-html-escaping.md`。

| 切片 | 结果 | 落地形状 |
| --- | --- | --- |
| #19 generic webhook JSON payload | ✅ 已完成（PR #42） | `mode: "json_payload"`，模板字段 `payload`（对象根）；`GenericWebhookTemplateSchema` 收窄为 text / json_payload |
| #18a Slack blocks（对象包装） | ✅ 已完成（PR #43，守卫 PR #46） | `mode: "slack_blocks"`，模板字段 `payload`，blocks 放 `payload.blocks`；核心 schema 未放宽 |
| #18b 根数组 JSON 模板 | ❌ 已作废 | 对象包装方案（18a）取代；没有需求再驱动放宽 `JsonObjectSchema` 的数组根 |
| #17a Email subject + text 模板 | ✅ 已完成（PR #48） | `subjectTemplate` 平级字段（设置后 `subjectPrefix` 失效）；text body 沿用既有 `template` |
| #17b Email HTML body 模板 | ✅ 已完成（PR #48） | `htmlTemplate` 平级字段；采用本评审推荐的「变量值经 `escapeHtml` 转义、模板标记按原样输出」语义，未提供 raw 退出 |

前置项与本评审的三条未解决项：

- **模式分派**：未按建议做成表驱动，改为穷尽 `switch`（`diagnoseDestinationTemplate`）。第三种模式若忘记
  登记会在编译期失败，而不是被 else 分支接到 `.card`。理由与代价记入 ADR 0010。
- **未解决项 1（`escapeHtml` 提升位置）**：按最小面处理——共享层只增加 `escape` 钩子（
  `TemplateRenderOptions`），实体表留在 `packages/destinations/src/email/payload.ts`，`@tocsin/core` 未改动。
- **未解决项 2（18a vs 18b）**：采纳 18a，18b 作废。
- **未解决项 3（多模板槽的 preview 呈现）**：按 path 前缀区分的方向成立。`subjectTemplate` /
  `htmlTemplate` 经 `EmailConfigSchema` 的 `superRefine` 产出以字段名为前缀的诊断，与
  `template.text` 共用同一条 diagnostics 聚合路径。

仍然没有做的部分（不是评审遗漏，是实现范围）：console 表单尚未提供 `slack_blocks` / `json_payload`
的模式选择器，也没有 Email 两个新字段的输入项；这些模式与字段经 config JSON / API / TOML 可用。
缺口由 https://github.com/xqvvu/vane/issues/47 跟踪。因此本评审「三片实现都必须各自携带……表单双向映射」
这一条只完成了 Feishu 以外的 schema / 渲染 / preview / manifest / i18n / 测试部分。

#16 / #17 / #18 / #19 已在 GitHub 关闭；父 issue #15（`Follow-up destination template modes`）仍为 open，
上述表单缺口是它剩下的主要事项。

## 对 #15 门禁的答复

#15 要求"未经明确 scope 批准不得新增目的地模式"。本评审即 #16 交付，是 #15 门禁链条上的必需环节；#19 / #18a / #17a 三片在实现前仍需按 #15 的措辞获得 scope 确认。建议 owner 将本文件的"实现切片确认"一节视为评审结论，明确批准后各片方可开工。
