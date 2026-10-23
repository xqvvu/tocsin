# Tocsin Console 模板编辑器交互评审

> 状态（2026-10-23 复核）：历史评审存档。基线 `73d84d3` 已落后 main，文中「现状」与切片编号
> 请先对照当前表单代码；评审结论保留，不回改正文。
>
> 本文档只评审交互，不含视觉稿、不含实现。
> 评审对象：`apps/console/src/features/destinations/ui/destination-form.tsx`（1249 行）、
> `apps/console/src/features/destinations/model/destination-form.ts`（751 行）、
> 背景决策 `docs/adr/0010-destination-template-object-root-payload-and-html-escaping.md`。
> 代码基线：`origin/main` @ `73d84d3`。所有「现状」均带 `文件:符号`。

## 一句话总评

引擎已经把「哪个模式、哪条 JSON 路径、哪个变量错了」判得一清二楚，但表单把四种模式摊成两组
控件、把 45 个变量摊成一面按钮墙，且从不把诊断回填到编辑器——交互质量中等偏上、错误恢复很差，
最大问题是**静默改写用户草稿**（切模式注入 starter、内置↔自定义强行改写 mode）。

---

## 1. 模式切换的草稿语义

### 现状

- 草稿按**每个 body 字段**分开存放在表单态里，不是一个共享字符串：
  `model/destination-form.ts:DESTINATION_TEMPLATE_BODY_FIELDS`（L62）把四种模式映射到
  `templateText` / `templateCard` / `templatePayload` 三个字段；读回时
  `model/destination-form.ts:destinationTemplateBodyFormField`（L159）。
- 切模式时**没有任何提示**地可能写入起始 body：
  `ui/destination-form.tsx:renderTemplateModeSelector`（L388）的 `onValueChange` 分支——
  当目标模式是 JSON 模式且该 body 字段 trim 后为空时，调用
  `model/destination-form.ts:destinationTemplateBodyStarter`（L179）整段写入。
- `templateCard` 不是从空开始：`createDefaultDestinationTemplateFormState`（L601）与
  `createDestinationDefaults`（L1197 附近）都把飞书默认卡片 JSON 预置进 `templateCard`。
- 另外两条**会改写 `templateMode`** 的路径：
  - `templateSource` ToggleGroup（L249–272）在 `onValueChange` 里硬写
    `form.setFieldValue("templateMode", "feishu_card")`（L263）；
  - 「恢复默认卡片」按钮（L529–548）同时写 `templateSource="builtin"` 与
    `templateMode="feishu_card"`；
  - kind 下拉切换时把 mode 夹到 `allowed[0]`（`resolveDestinationTemplateFormMode` L270），
    对 slack/generic-webhook 会落到 `text`。
- 这三条路径**都不会**调用 `destinationTemplateBodyStarter`。
- 空 body 与 starter body 的投递语义相反：`model/destination-form.ts:isDestinationTemplateBodyDraft`
  （L189）认为 `""` 合法，`templateFromForm`（L551）在 draft 为空时返回 `null`（= 不写 template，
  走默认信封）；非空则整段替换 envelope。

### 问题

1. **starter 是静默内容写入，不是提示。** 用户切到 `slack_blocks` 看一眼、再切回 `text`，
   `templatePayload` 已经永久多了一份 starter 文档。之后即使他从没打算用 payload，只要再切回去并保存，
   默认 Slack 消息就被整份替换——一次「看一眼」改变了投递行为，且无 toast、无 diff、无撤销。
2. **「空」和「非空」的语义在 UI 里不可区分。** 两种都是合法保存态，但一种是「用默认信封」，
   一种是「覆盖整个 body」。编辑器里只看到一个空/满的 textarea，没有任何文案说明这个差别。
   `destinations.form.variablesDescription` 和 body description 都没提这件事。
3. **看到的不等于保存的。** 因为草稿是三字段并存的，「我切到卡片模式看到一份完整飞书卡」
   并不代表保存时会写入它。用户很容易把「显示出来的默认卡片」误当成「我的草稿」。
4. **编辑既有目的地时，非选中模式的草稿全被重置。** `destinationTemplateFormStateFromDraft`（L619）
   只能从已保存的 `template` 里读回**一个** body key，其余字段回落到默认（=飞书默认卡片 / 空 payload）。
   一个已存 Slack `text` 模板的运算符点开「Slack 区块」页签，看到的是空编辑器，
   很容易读成「我的模板丢了」。
5. **`text` 模式的 starter 是 `""`**，所以只有 JSON 模式享受「自动补一个合法文档」的待遇，
   行为不对称，且这个不对称没有出处可查。
6. 草稿不跨会话：关闭 dialog / 刷新即丢。当前实现里「draft」只是内存态，
   但控件名字（`templateDraftLoadError` = 无法加载已保存的通知模板）暗示了持久化。

### 改进建议

- **把 starter 从「切换副作用」改成「显式动作」。** 删掉 `renderTemplateModeSelector:onValueChange`
  里 L406–414 的 seeding 分支；改为在 body 字段为空时有 JSON 模式时，在编辑器下方渲染一个
  「载入 <模式> 起始模板」按钮（调用同一个 `destinationTemplateBodyStarter`）。
  这样「看一眼」不再改内容，而「我想有个起步文档」仍然一键可达。
- **给 starter/空态加一句状态文案。** 在 `renderJsonTemplateField`（L502）的 `FieldDescription`
  里按 body 是否为空切换两句话：空 =「留空则使用 Tocsin 默认请求体」，非空 =「此内容将完整替换默认请求体」。
  两个新 i18n key，不改任何逻辑。
- **`templateSource` 不要再硬写 mode。** L263 的 `form.setFieldValue("templateMode", "feishu_card")`
  降级为「仅当当前 mode 不在新 source 的可用集合里时才夹取」，复用
  `resolveDestinationTemplateFormMode(mode, modeOptions)`，与 kind 切换保持同一条规则。
- **改 `modeOptions` 而不是改草稿：切模式只改可见字段。** 现在已经是这个模型，问题出在
  「默认卡片预置在 `templateCard` 里」——建议让 `templateCard` 的默认值改为空，
  起始卡片和 starter 走同一个显式按钮，三个字段的初始态就一致了（都空 = 都用默认）。

### 优先级

**高。** 静默写入 + 语义不可区分，是会直接造成误投递的交互缺陷。

---

## 2. 变量面板的信息量

### 现状

- 数据源来自引擎：`packages/destinations/src/template.ts:TemplateVariablePaths`（L194，**43 项**）
  与 `TemplateVariablePrefixes`（L203，`event.labels.`、`payload.`）。
- 面板拼装：`ui/destination-form.tsx:templateVariablePaths`（L1244）把 43 项 + 2 个前缀模式
  拼成 45 个字符串，再在 `renderTemplateVariableReference`（L573）里 `.map()` 成 45 个
  `<Button size="xs" variant="outline">`，容器是 `flex flex-wrap gap-1`。
- 命名空间分布（读 `TemplateStaticPathResolvers` 统计）：`presentation.*` **26**
  （其中 `presentation.labels.*` **24**）、`event.*` 10、`source.*` 3、`destination.*` 3、`tocsin.*` 1。

### 问题

1. **60% 的面板面积被最低频项占据。** 24/43 是 `presentation.labels.*`——面向「本地化标签」，
   而真正高频的 `event.title`/`event.severity`/`event.message` 混在第 1–10 位，
   视觉权重和 `presentation.labels.monitorPath` 完全一样。45 个按钮平铺对运算符就是「扫一遍找」。
2. **两个「模式」按钮插进去的是保证非法的变量。** 我用引擎真实正则验证过：
   `payload.<name>` 与 `event.labels.<name>` 通不过
   `template.ts:isAllowedTemplatePath`（L727）——`payload` 段只接受 `.key` / `[0]` / `["key"]`
   （`payloadPathSegments` L830），`<name>` 不是合法属性名。所以点一下就得到一个红错诊断。
   按钮的可点击外观承诺了「这是可用的」，实际是「这是语法提示」。
3. **没有分组、没有搜索、没有折叠、没有常用项。** `destination-form.ts:destinationTemplateModes`
   已经把「清单由引擎导出」这件事做对了，但呈现层没跟上信息架构。
4. 面板位置在右列编辑器**下方**，45 个按钮会把提交按钮推得很远。

### 改进建议

- **抽一个 `TemplateVariablePanel` 组件**（新文件
  `ui/template-variable-panel.tsx`），入参 `(modeOptions, bodyField, onInsert)`，
  把当前 L573–612 整块搬进去。这是唯一需要新建的文件，逻辑不变。
- **按命名空间分组 + 折叠。** 分组键直接用 `path.split(".")[0]`，顺序固定
  `event` → `source` → `destination` → `tocsin` → `presentation`。
  默认展开 `event`/`source`/`tocsin`/`destination`，折叠 `presentation`。
- **24 个 `presentation.labels.*` 收敛成一项。** 它们本质是同一族，
  面板只留一个 `presentation.labels.<name>` 模式条目 + 不可见的已知 key 列表；
  需要时用下拉选具体 key。这一条让步进从 45 → 约 20 个可见项。
- **顶部加一个过滤输入框**（`Input` 即可），按子串过滤 label。
- **加一行「常用」，钉 4–6 个**：`event.title`、`event.severity`、`event.message`、
  `event.statusDisplay`、`source.name`、`tocsin.eventUrl`。这几个覆盖绝大多数值班通知。
- **把两个模式按钮改成「语法提示」而非可插入值**：渲染成非按钮的 `code` 片段
  （如 `payload.<key>` 展示在描述行里），或者点击后插入 `payload.` 并把光标留在点号后，
  由用户自己敲 key。现在这样点一下就制造一个错误。
- 插入动作改为**插入到光标处**（见第 5 节），并在插入后把光标停在变量右侧，
  这样连点几个变量可以连续输入。

### 优先级

**高。** 45 → 20 的收敛是收益最直接、风险最低的一条；两个模式按钮当前会主动制造错误。

---

## 3. JSON 编辑器的错误定位

### 现状

- 引擎已产出带路径的诊断：`template.ts:diagnoseJsonTemplate`（L475）
  → `diagnosticsForTemplateEntries`（L631 附近）对每个未知变量产出
  `{ severity: "error", path: entry.path, variable, message: "Destination template contains unknown variable: X (did you mean Y?)" }`，
  `path` 是 JSON 路径（`templateStringEntries` 递归拼 `path.index` / `path.key`）。
- 每模式 schema 的 `superRefine` 把 `path` 折成相对路径塞进 zod issue
  （`template.ts` L238/263/291：`diagnostic.path?.replace(/^template\./, "").split(".")`）。
- 路径前缀按模式分派：`diagnoseDestinationTemplate`（L392）穷尽 switch，
  `text → .text`、`feishu_card → .card`、`json_payload`/`slack_blocks` → `.payload`。
- 端到端形态已有测试固定：`configuration.integration.test.ts:506` 断言
  `path: "template.payload.url"`；`:821` 断言 `path: "template.card.elements.0.text.content"`。
- **但 UI 侧**：
  - 表单里的错误只有一句：`renderJsonTemplateField`（L502）的 `validators.onSubmit`
    调 `isDestinationTemplateBodyDraft`（L189），失败返回
    `destinations.form.templateBodyInvalidJson` =「模板 JSON 必须是合法的 JSON 对象」。
    没有行号、没有列号、没有路径，`JSON.parse` 的 `SyntaxError` 在 `catch` 里被丢弃。
  - 带 path 的诊断只走到**预览弹窗**：`ui/destination-notices.tsx:createPreviewTabs`（L102）
    把 `notice.diagnostics` 塞成一个名为「诊断」的 tab，内容是
    `PreviewJsonBlock` 渲染的 **裸 JSON**。另一路是
    `server/destinations/destination.service.ts:templateDiagnosticsPayload`（L425）
    把诊断塞进 `renderedPayload.templateError.diagnostics`，同样以 JSON 呈现。
  - 诊断发生时机是**预览/提交之后**，编辑器本身不显示任何诊断。

### 问题

1. **path 到手就断了。** `elements.0.text.content` 是给机器看的；运算符要在自己的
   textarea 里手数「第 0 个 element 的第 0 个 text 的第 content 个字段」，没有行号也没高亮。
   引擎辛苦算出的定位信息，UI 一个都没用上。
2. **语法错误（JSON 本身不合法）完全没有定位。** 对于「对象根 + 手写 JSON」这个编辑器，
   最高频的错误就是少一个引号/逗号，而这是唯一能精确给出行列的场合，却被
   `isDestinationTemplateBodyDraft` 的 `catch { return false }` 吞掉。
3. **字段级错误与诊断级错误混成一条消息。** 多个未知变量、一个绑定未引用警告
   （`severity: "warning"`，`template.ts` L662 附近）全都挤进一个
   `FieldError` 单行字符串，`severity` 维度在编辑器里丢失。
4. **诊断只在预览后出现，且要以 JSON 形态肉眼比对。** 用户改一个字段 → 点预览 → 切 tab → 读 JSON →
   回去找位置，一轮闭环四步，而数据早就有了。
5. `path` 的点号语法与引擎接受的 `payload["key"]` 语法不一致，带引号的 key 无法直接搜回文本。

### 改进建议

- **把诊断回填到编辑器下方，而不是留在预览 tab。** 需要一个从预览结果回到表单的通路：
  `DestinationForm` 目前只 `onPreview` 出参、不接收预览结果
  （`ui/destination-form.tsx` L80–137 的 `useForm.onSubmit`）。建议加一个表单级
  `previewDiagnostics` 状态，由 `destinations-page.tsx:previewDraft`/`previewEdit`（L115/L139）
  在 `setDestinationPreviewNotice(result)` 的同时回传。这是本切片唯一的架构改动，其余是渲染。
- **在 JSON 编辑器下方渲染诊断列表**（`renderJsonTemplateField` L502 内）：
  每行 `severity` + `path` 的**末段** + `message`。`message` 里引擎已经带了
  `(did you mean ...)`（`template.ts:suggestionFor` L750），这个好能力不该只留在 JSON tab 里。
  warning 用次要色，error 用 destructive（沿用 `FieldError` 的 `role="alert"` 语义）。
- **语法错误给出行列。** `isDestinationTemplateBodyDraft` 里把 `SyntaxError` 的
  `position` 保留下来（`JSON.parse` 的错误对象在 V8 上带 position），
  换算成行号后显示为「第 N 行：JSON 语法错误」，并给编辑器一个错误态。
  这一条不需要新依赖。
- **可选升级：把文本域换成已有的 `JsonEditor`。** 仓库里已经有
  `components/codemirror/json-editor.tsx`（基于 `@uiw/react-codemirror` + `@codemirror/lang-json`，
  已用于 `features/configuration/ui/portable-config-form.tsx`）。注意 `@codemirror/lint`
  **不是本仓库的直接依赖**：`apps/console/package.json` 与 `pnpm-workspace.yaml` 的 `codemirror`
  catalog 都没有声明它，`node_modules/.pnpm` 里那三个 `@codemirror/lint@6.9.7` 只是 `codemirror`
  元包和 `@uiw/codemirror-extensions-basic-setup` 的传递依赖，所以
  `apps/console/node_modules/@codemirror/` 下没有它的软链，console 代码不能直接 `import`。
  这一条若要做，必须先在 package.json 里显式加依赖，属于「可选升级」的额外前置成本。
  `JsonEditor` 当前 props 是
  `{ id, value, placeholder, readOnly, onChange }`（`json-editor.tsx` L7–13），
  要加诊断高亮需要扩一个 `diagnostics` prop。这是三处 JSON 模式共享一个编辑器的自然落点
  （`renderTemplateBodyField` L440 已经按 `isDestinationTemplateJsonMode` 分派）。
  但这条改的是渲染实现，属于独立切片，不建议和上一条合并。
- **顺手把预览的「诊断」tab 从裸 JSON 改成人类可读列表**（`destination-notices.tsx:createPreviewTabs` L145）：
  一个空数组应该显示「无诊断」而不是 `[]`。

### 优先级

**高。** 数据链路已经存在（`path` + `variable` + `did you mean` 全都有测试固定），
缺的只有呈现，投入产出比最高。

---

## 4. 模式选择器的可发现性

### 现状

- 列表由 manifest 驱动：`model/destination-form.ts:destinationTemplateModes`（L213）读
  `configFields` 里 `type: "template"` 的 `modes`；`modeOptions.length > 1` 时才渲染选择器
  （`ui/destination-form.tsx:renderTemplateFields` L309）。
- 各通道声明：
  - Slack `slack/manifest.ts:25` → `text` + `slack_blocks`
  - generic webhook `generic-webhook/manifest.ts:45` → `text` + `json_payload`
  - Feishu `feishu/manifest.ts:100` → `text` + `feishu_card`（两个模式共用同一个
    `destinations.form.templateModeDescription`）
  - **Email `email/manifest.ts` 的 template 字段没有 `modes`** → 走 L215 的兜底
    `[{ mode: "text" }]`，于是 `modeOptions.length === 1`，**根本不渲染模式选择器**。
- Email 的 `subjectTemplate` / `htmlTemplate` 另有输入项（`ui/destination-form.tsx` L700 附近的
  `renderTextField`/`renderTextareaField`，走 `DestinationFormValues.subjectTemplate/htmlTemplate`），
  不出现在模式语言里。ADR 第 4 条明确说它们是平级字段、不是模式。
- 每个模式有一段说明：`destinationTemplateModeDescriptionKey`（L257）优先取 manifest 的
  `descriptionKey`，退回模式自带的 `modeDescriptionKey`。
- Feishu 卡片有 `?` 帮助（`destinationTemplateModeHelp` L291 → manifest 里的 `help`
  + Card JSON v1 文档链接）；`slack_blocks` / `json_payload` **没有** `help`。

### 问题

1. **Email 完全不显示模式选择器，而它其实是三槽通道。** 运算符在 Email 表单里看到
   「邮件主题模板」和「HTML 正文模板」两个平级字段，加上主体「通知模板」，
   却没有任何地方告诉他这三者都支持变量、且 HTML 那一路变量值会被转义
   （转义行为只在 `htmlTemplateDescription` 里一句带过）。ADR 自己也把这块列为已知缺口。
2. **「只有一个模式」和「选择器加载失败」外观相同。** `modeOptions.length > 1` 这个条件
   让 Email（合法单模式）与任何 manifest 缺 `modes` 的通道都静默消失。运算符无从判断
   「这个通道只支持文本」。
3. **没法回答「这个通道支持哪些」。** 选择器只列当前通道的模式，这是对的设计（ADR 第 3 条），
   但没有任何文案说「本通道支持以上 N 种，其余模式该通道渲染不了」。
   看过 ADR/文档里「四种模式」的运算符会以为 Slack 少了两个选项。
4. **Feishu 两个模式共用同一句说明**（`templateModeDescription`），所以切换模式时提示文字不变——
   一次本该用来教学的交互没有信息量。
5. **帮助文案不对称。** 飞书卡片有 `?` + 官方文档外链，Slack blocks / JSON payload 什么都没有，
   而这两个恰恰是最需要「根对象怎么摆」说明的（ADR 第 1 条：`payload.blocks` 承载数组）。
6. i18n 里 `destinations.form.templateModeDescription` 的文案是
   「飞书支持普通文本和交互式卡片」——**按通道硬编码了「飞书」**，
   一旦被别的通道复用就是错误信息。

### 改进建议

- **单模式也渲染选择器**（把 `renderTemplateFields` L309 的条件从 `> 1` 改为 `>= 1`），
  单选态 `disabled` 并配一句说明。这样「没有选择器」不再有歧义。
- **给 Email 的 template 字段补 `modes` 或补命名槽位说明。** 最小改动是在
  `email/manifest.ts` 的 template configField 上加 `descriptionKey`（例如
  「邮件有三处可写模板：主题、HTML 正文、纯文本正文」），并让
  `subjectTemplate`/`htmlTemplate` 的 label 统一带上「模板」字样与同一个变量插入入口。
  若产品决定把三槽提升为可见的「槽位选择器」，那是数据模型问题，需回到 ADR。
- **加一句通道级说明**，放在选择器上方：由
  `destinationTemplateModes(catalog, kind).length` 生成「本通道支持 N 种模板」。
- **给 slack / generic-webhook 的 manifest modes 补 `help`**，与飞书对齐：
  `slack_blocks` 说明「整个请求体由你书写，Block Kit 数组放在 `blocks` 键下」；
  `json_payload` 说明「你的 JSON 取代默认 envelope，URL 与请求头不进入外发体」
  （后者现有 `jsonPayloadTemplateDescription` 已经写了，搬进 `help` 更显眼）。
- **修正共享文案**：把 `destinations.form.templateModeDescription` 里的「飞书」去掉，
  或在 Feishu manifest 里改用不绑定通道名的表述。

### 优先级

**中。** 影响的是「能不能发现能力」，不是「会不会做错事」；但 Email 那条已经从 ADR 起就悬着。

---

## 5. 无障碍与键盘

### 现状

- **变量按钮**（`ui/destination-form.tsx:renderTemplateVariableReference` L589–605）：
  渲染为 `Button type="button"`，底层是 base-ui `ButtonPrimitive`（真实 `<button>`），
  可聚焦、可 Enter/Space 触发。可访问名就是 path 文本
  （测试 `destination-form.test.tsx` L235 用 `getByRole("button", { name: path })` 依赖这一点）。
  没有 `aria-label` 说明动作语义，也没有 roving tabindex —— 45 个连续 tab stop。
- **插入行为**：`ui/destination-form.tsx:appendTemplateVariable`（L1228）
  实现是 `currentValue.trimEnd() ? \`${currentValue} ${variable}\` : variable`，
  **只追加到末尾**，不看光标位置，也不看插入点是否在 JSON 字符串里。
  `destination-form.test.tsx` L88 断言的正是这个结果：卡片 JSON 变成
  `'{"content": "base"} {{source.name}}'`（已不是合法 JSON）。
- **模式 / 来源 ToggleGroup**（L390、L249）：底层 `components/ui/toggle-group.tsx` 是
  base-ui 包装，`ToggleGroup` 实际渲染 `div role="group"` 并挂在 `CompositeRoot`
  上（带 `loopFocus`、`enableHomeAndEndKeys`），`ToggleGroupItem` 渲染 `button` 且带
  `aria-pressed`（见 `@base-ui/react/toggle/Toggle.js`）。所以**方向键 + Home/End 可用**，
  单选/多选语义由 `aria-pressed` 表达。
- **但 group 没有可访问名**：`renderTemplateModeSelector` 只渲染一个不带 `htmlFor` 的
  `<FieldLabel>`，`ToggleGroup` 上没有 `aria-label`/`aria-labelledby`，外层也不是
  `FieldSet`/`FieldLegend`。读屏只会播报「group」+ 若干「按钮 已按下」。
  `templateSource` 的 ToggleGroup（L249）与 `urgentSeverities`（L805）同样没有组名。
- **错误关联缺失**：`components/ui/field.tsx` 的 `Field` 是 `role="group"`、`FieldError`
  是 `role="alert"`（L165 附近），但没有任何地方给控件设 `aria-describedby` /
  `aria-errormessage`。我在全 console 内 grep `aria-describedby` —— **0 处命中**。
  错误只会作为独立 alert 播报，不与字段绑定。
- JSON textarea（L559）有 `id={json-template-${kind}}` 和真实 `<label for>`，标签是好的；
  但 `aria-invalid` 只设在 `name` 输入框上，**JSON textarea 没有**，
  只有外层 `UiField` 的 `data-invalid`（纯样式）。
- **无 live region**：starter 注入、模式切换、变量插入都会改写 textarea 内容，
  全 console grep `aria-live` —— **0 处命中**。键盘/读屏用户不会被告知内容变了。
- `?` 帮助按钮有 `aria-label`（好），但 tooltip 内容没有通过 `aria-describedby` 关联。

### 问题

1. 三个 ToggleGroup **可键盘操作但不可读屏识别**：「切换模板类型」这个组对读屏用户是匿名的。
2. 45 个变量按钮是 45 个 tab stop，键盘用户要按 45 次才能走到提交。
3. 变量插入**只追加末尾**，在 JSON 编辑器里几乎必然破坏 JSON；
   这个行为还被测试固定住了，说明它是「有意为之但错了」。
4. 错误不与字段关联，且 `aria-invalid` 在 JSON 编辑器上缺席。
5. 任何内容变更都没有 `aria-live` 播报。

### 改进建议

- **给三个 ToggleGroup 补组名。** 最小改动：在
  `renderTemplateModeSelector`（L390）、`templateSource`（L249）、`urgentSeverities`（L805）
  的 `<ToggleGroup>` 上直接加 `aria-label={t("destinations.form.templateMode")}` 等；
  更好的做法是把它们包进 `FieldSet`/`FieldLegend`（仓库已有这两个组件），
  用 legend 提供组名。
- **变量面板改 roving tabindex / 单 tab stop。** 与第 2 节的分组方案天然合流：
  折叠 + 过滤把 tab stop 从 45 降到个位数；如果保留平铺，则用
  `tabIndex={-1}` + 方向键管理面板焦点（base-ui 的 Composite 可直接复用，
  和 ToggleGroup 同一套机制）。
- **插入改为按光标位置 + JSON 上下文感知。** 把 `appendTemplateVariable`（L1228）
  改成接收 `(value, selectionStart, selectionEnd, variable)`：
  在光标处替换选区；若光标位于 JSON 字符串字面量内，插入不带前后空格的 `{{path}}`；
  若在字符串外，建议先补一对引号或拒绝并在描述行提示。
  需要给 `renderJsonTemplateField` 的 `Textarea` 加 ref 以读取 `selectionStart`。
  注意这会让 `destination-form.test.tsx` L88 的既有断言失效，需要同步改（属预期）。
- **字段错误关联。** 在 `components/ui/field.tsx` 让 `FieldError` 生成稳定 id，
  由 `Field` 通过 context 提供给控件，控件设 `aria-describedby`；
  同时给 JSON textarea 补 `aria-invalid={field.state.meta.errors.length > 0}`，
  与 `name` 输入框（L1018 已有 `aria-invalid`）对齐。
- **插入/切换加 `aria-live="polite"` 状态行**，例如「已插入 event.title」。

### 优先级

**中。** 键盘可用性本身没坏（base-ui 的 Composite 承担了方向键），
坏在命名、关联、播报，以及「插入到末尾」这个功能性缺陷——
后者其实应单独按「高」对待，因为它无条件产生非法 JSON。

---

## 建议的改进切片

以下 5 条可独立实施、独立验收，按依赖顺序排列。

### 切片 1：变量面板：分组 + 过滤 + 常用行

- 新建 `apps/console/src/features/destinations/ui/template-variable-panel.tsx`
- 改 `ui/destination-form.tsx`（`renderTemplateVariableReference` L573、`templateVariablePaths` L1244）
- 改 i18n：`apps/console/src/i18n/messages/zh-Hans.json`、`en-US.json`（分组标题、过滤占位符）
- 不动任何 server / package 代码
- 影响面：仅 console 前端 4 个文件

### 切片 2：草稿注入改成显式动作

- 改 `ui/destination-form.tsx`：`renderTemplateModeSelector:onValueChange`（L388，删 seeding 分支）、
  `templateSource` ToggleGroup（L249，L263 改为夹取）、`renderJsonTemplateField`（L502，加 starter 按钮与空态文案）
- 改 `model/destination-form.ts`：`createDefaultDestinationTemplateFormState`（L601）
  与 `createDestinationDefaults`（L1197 附近）把 `templateCard` 默认值改为空
- 改 i18n 两个文件
- 更新测试：`model/destination-form.test.ts`（L366「keeps each mode's body separate」依赖默认卡片非空）、
  `ui/destination-form.test.tsx`（L94「restores the default Feishu card template」）
- 影响面：console 前端 4 文件 + 2 个测试

### 切片 3：诊断回填编辑器

- 改 `ui/destinations-page.tsx`（`previewDraft` L115 / `previewEdit` L139 把 `result` 回传表单）
- 改 `ui/destination-form.tsx`（新增 `previewDiagnostics` 表单态、`renderJsonTemplateField` L502 下方渲染诊断列表）
- 改 `model/destination-form.ts`（`isDestinationTemplateBodyDraft` L189 改为返回结构化结果，
  保留 `JSON.parse` 的 position → 行号）
- 改 `ui/destination-notices.tsx`（`createPreviewTabs` L145：诊断 tab 从裸 JSON 改为可读列表，空数组显示「无诊断」）
- 改 i18n 两个文件
- 影响面：console 前端 5 文件；不碰 `packages/destinations`（诊断数据已经够用）

### 切片 4：模式选择器可发现性

- 改 `ui/destination-form.tsx`（L309 条件 `> 1` → `>= 1`，单选态 disabled + 通道级说明行）
- 改 `packages/destinations/src/email/manifest.ts`（给 template 字段补说明文案）
- 改 `packages/destinations/src/slack/manifest.ts`、`generic-webhook/manifest.ts`（补 `help`）
- 改 `packages/destinations/src/feishu/manifest.ts`（共享文案去通道名）
- 改 i18n 两个文件
- 可能触发 `registry.test.ts` 的 manifest 守卫（若加 `help` 需确认不影响断言）
- 影响面：console 前端 2 文件 + `packages/destinations` 4 manifest + i18n

### 切片 5：无障碍：组命名 + 错误关联 + 按光标插入

- 改 `ui/destination-form.tsx`（三处 ToggleGroup 加 `aria-label`；JSON textarea 加
  `aria-invalid` + ref 读 `selectionStart`；`appendTemplateVariable` L1228 改为上下文感知）
- 改 `components/ui/field.tsx`（`FieldError` 生成 id，`Field` 经 context 下发 `describedby`）
- 更新 `ui/destination-form.test.tsx` L61「inserts template variables into the active template field」
  （L88 的末尾追加断言会失效）
- 影响面：console 前端 3 文件 + 1 测试

---

## 开放问题（需产品/用户拍板）

1. **「空 body」是否应该继续表达「使用默认信封」？** 如果是，
   切片 2 的「空态文案」就够；如果应该是一个显式开关（如「使用 Tocsin 默认模板」），
   那草稿模型要动，切片 2 的形状完全不同。
2. **Email 的 subject / html 两槽要不要进入模式选择器？** ADR 第 4 条说不是模式，
   但交互上它们和模式竞争同一个心智模型（「这里可以写模板」）。
   若要提升为可见槽位，是数据模型变更，需要重开 ADR。
3. **`payload.<name>` / `event.labels.<name>` 这两个模式按钮的去留。**
   它们插入的内容保证非法（已用引擎正则验证）。是当作语法提示（不可点）、
   还是改成下拉选已知 key、还是点击后插入前缀并把光标留在点号后？
4. **24 个 `presentation.labels.*` 的真实使用频率。** 它们占面板 60% 面积。
   如果值班成员几乎不用，是否直接从面板隐藏（引擎仍允许手工输入）？
5. **草稿是否需要跨会话持久化？** 现有 i18n key
   `destinations.form.templateDraftLoadError`（「无法加载已保存的通知模板」）
   暗示了持久化意图，但实现只有内存态。这决定切片 2 是否需要额外存储层。