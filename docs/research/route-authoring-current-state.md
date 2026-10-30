# Route 路由能力现状盘点（Route Authoring 与 Explain）

- 调研基线（历史）：commit `73d84d3`；当时的本地工作树路径已失效，
  续做前以当前 `origin/main` 为准
- 方法：只读代码侦察，范围限定 `packages/core/src/route/`、`apps/console/src/server/`、`apps/console/src/features/routes/` 及直接相邻的 event/delivery/UI 路径
- 对应上游文档：`docs/prd/post-mvp-planning.md:88`「### 2. Route Authoring 与 Explain」（第 203 行给出第二优先级理由）
- 状态校正（2026-10-19，第 17 轮）：下文部分「缺口」已交付——投递缺口解释
  （`route-match-gaps.ts`、`event-detail-route-gaps.tsx`）、route×destination 视图与接入快照
  来源标注（`event-detail-route-matches-table.tsx`）、每类条件多行增删（`route-forms.tsx`）
  均已落地。续做前按当前 `origin/main` 与 backlog DOC-30 复核。

> **本文档不含实现方案。** 仅盘点现状、证据与缺口；「候选切片」一节只描述可独立交付的能力边界，不给出技术设计。

---

## 一句话结论

**部分能。** Tocsin 已经在**接入时刻**为每条 route 落盘了完整、逐条件的匹配证据（`events.route_matches_json`，含 `matched` 与 `checks`），并在 Event detail 以「路由匹配」页签展示。「命中却没投递」也已有解释通道（2026-10-19 第 17 轮交付）：`route-match-gaps.ts` 按 route × destination 给出 `route_deleted` / `route_disabled` / `destination_missing` / `destination_disabled` / `duplicate_within_window` / `unknown`，`event-detail-route-gaps.tsx` 在详情页渲染。该轮之后又补齐了两处：逐条件证据由 `apps/console/src/features/routes/ui/route-match-check-badges.tsx` 按 `condition` / `expected` / `actual` 渲染为中文并显示事件里的实际值（无结构化字段的历史快照回退到原始英文 `detail`）；`routeMatches` 为 `null` 被当前规则回填时带 `routeMatchesProvenance` 标注，UI 明确区分「接入快照」与「现状重算」（`event-detail-route-matches-table.tsx:47`）。

---

## 1. 路由匹配引擎在哪 / 条件如何表达 / 在哪一层执行

**引擎位置（唯一实现）：** `packages/core/src/route/route.ts`

- 求值入口 `evaluateRouteMatch(routeInput, input)` —— `route.ts:80`
- 布尔快捷 `routeMatchesEvent(route, input)` —— `route.ts:103`
- 批量筛选 `findMatchingRoutes(routes, input)` —— `route.ts:107`

**条件表达（`RouteRuleSchema`，`route.ts:19`）：**

| 字段 | 语义 | 操作符 |
|---|---|---|
| `sourceIds` | 精确枚举 | one-of（`evaluateSource`，`route.ts:124`） |
| `severities` | 精确枚举 | one-of（`evaluateOneOf`，`route.ts:141`） |
| `statuses` | 精确枚举 | one-of（`evaluateOneOf`，`route.ts:141`） |
| `labels` | `{key, operator, value}` | **`equals` / `contains` 两者，仅此两者**（`LabelMatchOperatorSchema`，`route.ts:10`；`evaluateLabels`，`route.ts:159`） |
| `titleContains` | 子串 | 大小写不敏感 `includes`（`evaluateContainsAll`，`route.ts:184`） |
| `messageContains` | 子串 | 同上 |

- **不支持 `regex`、`exists`、`not_*`、数值比较**：`LabelMatchOperatorSchema` 是 `z.enum(["equals","contains"])`；`packages/core/src/route/` 内检索 `regex|exists|startsWith|endsWith` 无命中。
- 空数组 = 「无条件通过」（`evaluateSource`/`evaluateOneOf`/`evaluateLabels`/`evaluateContainsAll` 均显式 push `matched: true, detail: "No … condition"`）。因此**空 rule 等价于 catch-all**。
- `title`/`message` 的子串判断先 `toLocaleLowerCase()`（`route.ts:195`），大小写不敏感。
- **执行层级 = intake（接入时），不是投递前**：
  - 接入：`apps/console/src/server/intake/intake.service.ts` → `WebhookIntakeService.acceptWebhook`，第 89–101 行对 `store.routes.list()` 全量求值。
  - 投递前只剩一个**开关级**校验，不重新求值规则：`apps/console/src/infra/sqlite/repositories/delivery/delivery.repository.ts:192` 的 `claimNext` 条件 `deliveries.route_id is null OR routes.enabled = 1`——即 **route 被禁用后，已入队的投递会停止认领，但规则条件本身不会被重新评估**。

---

## 2. Route 的数据模型

**领域模型定义：** `packages/core/src/route/route.ts`

- `RouteDefinitionSchema` —— `route.ts:37`：`id` / `name`（trim 非空）/ `enabled`（默认 `true`）/ `rule`（默认 `EmptyRouteRule`）/ `destinationIds`（`min(1)` 且必须去重，`route.ts:44-47` 的 `refine`）
- `RouteRuleSchema` / `LabelMatcherSchema` —— 见第 1 节
- `EmptyRouteRule` —— `route.ts:28`

**事件侧模型：** `packages/core/src/event/normalized-event.ts`

- `NormalizedEventSchema` —— 第 22 行：`title` / `message` / `severity`（`AlertSeveritySchema` = `critical|warning|info|unknown`）/ `status`（`AlertStatusSchema` = `firing|resolved|unknown`）/ `fingerprint` / `labels` / `occurredAt`
- `LabelsSchema` 会在 transform 阶段**丢弃空字符串值的 label**（第 10–15 行，`pickBy` 在 `:14`）——影响 `contains ""` 这类边界，但 schema 已禁止空 `value`（`NonEmptyRouteStringSchema`）。

**持久化模型：** `apps/console/src/infra/sqlite/migrate/schema.ts`

- `routes` 表 —— 第 99 行：`id` / `name`(unique) / `enabled`(0|1) / `rule_json` / `destination_ids_json` / `created_at` / `updated_at`。**规则整体存为 JSON 文本，未展开为列**。
- `events.route_matches_json` 列 —— 第 82 行（详情见第 4 节）。
- `deliveries.route_id` —— 第 119 行，可空，`ON DELETE CASCADE`。

**行↔模型映射：** `apps/console/src/infra/sqlite/repositories/route/route.helpers.ts` → `routeFromRow`（第 8 行）、`encodeDestinationIds` / `decodeDestinationIds`（第 18/22 行）。

**API 契约：** `packages/api/src/schemas/routes.ts`（`RouteListOutputSchema` / `RouteOutputSchema`）、`packages/api/src/contract/routes.ts`（`list`/`create`/`update`/`delete`）；命令校验 `packages/core/src/configuration/configuration-commands.ts:125`（`CreateRouteCommandSchema`）、`:132`（`UpdateRouteCommandSchema`）、`:140`（`DeleteRouteCommandSchema`）。

---

## 3. 评估顺序与裁决

- **无优先级字段、无排序字段、无首命中短路。** `RouteDefinitionSchema` 只有 `id/name/enabled/rule/destinationIds`；检索 `priority|orderIndex|position` 于 `packages/core/src/route/` 与 `packages/api/src/schemas/routes.ts` 无命中。
- **全部命中 route 都会被投递**：`findMatchingRoutes` 返回**所有** `matched` 的结果（`route.ts:111` 的 `.filter`），`intake.service.ts:115` 把这批全部交给 `enqueueForEvent`。多 route 命中 = 多份投递，不做互斥裁决。
- **单条 route 内部也不短路**：`evaluateRouteMatch` 在 `enabled` 为真后**逐条件全部求值**并全部记录，最终由 `resultFor`（`route.ts:114`）以 `checks.every(check => check.matched)` 汇总。唯一提前返回是 `enabled === false`（`route.ts:87`）。
- **投递顺序**：`enqueueForEvent` 按 `matches[] × destinationIds[]` 双层循环创建（`delivery.repository.ts:76-81`）；`routes.list()` 的排序是 `created_at desc, id desc`（`route.repository.ts:22-24`），与投递语义无关。
- **实际生效的「抑制」只有幂等去重**：`delivery_dedupe_keys` 主键 `(source_id, idempotency_key, route_id, destination_id)`（`schema.ts:145`）；同一 `idempotencyKey` 在 `dedupeWindowMs`（默认 5 分钟，`intake.service.ts:54`）内只建一条投递。**这与 `packages/core/src/route/route.test.ts:67` 明确钉死的「fingerprint 不参与抑制」是两回事**——fingerprint 当前完全不参与任何裁决。

---

## 4. 可解释性现状（本方向核心痛点）

### 4.1 已经有的部分

- **落盘位置：`events.route_matches_json`**（`schema.ts:82`），schema 为 `RouteMatchResultsSchema` = `RouteMatchResult[]`：
  - `RouteMatchResultSchema` —— `route.ts:61`：`routeId` / `routeName` / `matched` / `destinationIds` / `checks`
  - `RouteMatchCheckSchema` —— `route.ts:55`：`field` ∈ `enabled|source|severity|status|label|title|message`，`matched: boolean`，`detail: string`
- **写入时机**：接入时写 `routes.map(evaluateRouteMatch)`（**含未命中 route**），见 `intake.service.ts:89-94` → `tx.intake.recordEvent({ routeMatches })`；仓储 `intake.repository.ts:55` 编码，`intake.helpers.ts:27` 解码。
- **读取与回显**：`history.repository.ts:122` `getEventDetail` 返回 `routeMatches`；UI 在 `apps/console/src/features/events/ui/event-detail-view.tsx`「路由匹配」页签 → `event-detail-route-matches-table.tsx`（route 名 / 命中·未命中 Badge / 目标数 / 逐 check Badge）。
- **快照语义已被测试钉死**：`intake.service.test.ts:105`「preserves route match explanations from intake time」——改规则后历史 event 仍显示接入时的 `routeName` 与 `checks`。
- **列表页有计数**：`EventListItem.routeMatchCount`（`packages/core/src/operations.ts:176`）由 `countMatchedRoutes`（`history.repository.ts:832`）从 JSON 解出；无命中且无投递时显示「未匹配路由」徽标（`event-delivery-counts-cell.tsx:17-24`，i18n `events.table.unmatchedRoutes`）。

结论：**「匹配了哪条规则、每条规则的哪个条件过没过」——能答，且是接入时刻的不可篡改快照。**

### 4.2 缺口（按严重度）

1. **`checks.detail` 的英文硬编码已由结构化字段与中文化渲染替代（已交付）。**
   - core 仍会在 `detail` 里拼接英文文案（如 `route.ts:137`、`route.ts:179`、`route.ts:201`），但同时输出结构化的 `condition` / `expected` / `actual`；UI 优先按结构化字段渲染（`route-match-check-badges.tsx` 的 `describeRouteCheck`），`label` / `title` / `message` 都会显示事件里的实际值。
   - 仍存限制：`condition` 字段出现之前写入的历史快照没有结构化数据，只能回退渲染原始英文 `detail`；快照不可改写，因此这类旧事件无法补齐实际值。

2. **「命中却没投递」的解释通道已交付（2026-10-19 第 17 轮）。** `route-match-gaps.ts` 以接入快照为基准，对每个 route × destination 判定 `route_deleted` / `route_disabled` / `destination_missing` / `destination_disabled` / `duplicate_within_window` / `unknown`，并由 `event-detail-route-gaps.tsx` 渲染。仍存限制：`duplicate_within_window` 依赖仍在窗口内的 dedupe 行，窗口被清理后退化为 `unknown`；`AcceptedWebhook` 的 `dedupedDeliveryCount` / `skippedExisting` 计数仍不落库（`delivery.repository.ts:81-107`、`intake.service.types.ts:26`）。

3. **`routeMatches` 为 `null` 时被当前规则回填（已加来源标注，不再静默）。** `history.repository.ts:131-137`：
   ```
   const routeMatches = event.routeMatches ?? (await this.routes.list()).map(route => evaluateRouteMatch(route, …))
   ```
   即历史存在两类 event：接入时写了快照的（绝大多数 webhook 事件），和 `null` 需回填的——`intake.service.ts:194` 的 **parser 失败审计事件显式写 `routeMatches: []`**（不是 null），而通过 `recordEvent` 直写的事件（如 `event-replay.service.test.ts:51` 的构造）为 `null`。两类在 UI 上通过 `routeMatchesProvenance` 区分：快照显示「接入快照」，回填结果显示「现状重算」（`event-detail-route-matches-table.tsx:47`），用户能判断眼前是「当时真相」还是「现在的规则算出来的」。

4. **route 事后禁用会让快照与行为分叉。** 快照永久保留 `matched: true`（测试钉死），但 `claimNext`（`delivery.repository.ts:192`）会因 `routes.enabled = 0` 永不认领。用户看到「命中」却永远等不到投递，且无任何 UI 提示「该 route 已禁用」。

5. **快照只覆盖规则比对，不覆盖 destination 解析。** `RouteMatchResult.destinationIds` 是 route 配置项，不代表这些 destination 当时存在/启用；`event-detail-route-matches-table.tsx` 与 `route-match-gaps.ts` 已提供「route × destination 已投递/缺失」的现状视图（2026-10-19），剩余缺口是没有 destination 当时是否存在/启用的历史快照。

### 4.3 记录落点速查

| 问题 | 落点 |
|---|---|
| 匹配了哪些 route、每个条件是否通过 | `events.route_matches_json`（`EventRecord.routeMatches`） |
| 某条投递由哪条 route 产生 | `deliveries.route_id`（可空，`ON DELETE CASCADE`） |
| 投递详情里的 route 定义 | `history.getEventDetail` 的 `DeliveryDetail.route`（`packages/core/src/operations.ts:87`）；`delivery.repository.ts:379` 按 `job.routeId` 现读 |
| 被去重（幂等键已占用）的证据 | `delivery_dedupe_keys`（`source_id`、`idempotency_key`、`route_id`、`destination_id`、`first_event_id`、`created_at`，有 prune 窗口；`schema.ts:164-185`、`delivery.repository.ts:95,109`） |
| 被跳过（`skipExisting`）的证据 | **不存在持久化字段**（仅 API 返回值） |

---

## 5. UI 侧：创建/编辑与「测试路由」

**路由管理页**

- 页面装配：`apps/console/src/features/routes/ui/routes-page.tsx`（`RoutesPage`），挂载于 `apps/console/src/routes/_dashboard.routes.tsx`
- 表格与行操作：`routes-section.tsx` → `RoutesSection` / `RouteActions`（编辑 = `RiEditLine`、补投预览 = `RiRefreshLine`、启停、删除）
- 新建：`route-add-dialog.tsx`（`RouteAddDialog`）
- **编辑（关键限制）**：`route-forms.tsx`（707 行，`EditRouteForm`）。表单字段为 `rule.sourceId` / `rule.severity` / `rule.status` / `rule.labelKey` / `rule.labelOperator` / `rule.labelValue` / `rule.titleContains` / `rule.messageContains` / `destinationIds`——**每类条件只有一个输入位**。
  - 模型层 `model/route-form.ts`：`routeFormDefaultsFromRule` 取 `[0]`，`routeRulePatchFromValues` 用 `replaceFirstCondition`（第 154 行）只替换首元素、保留其余。
  - `getRouteRuleFormRestrictions`（第 97 行）识别多值条件，`route-edit-restricted-notice.tsx` 只显示「共 N 条 / 保留 N-1 条」的**计数**，不显示被保留条件的内容。
  - 结论：**多 source / 多 severity / 多 label / 多 titleContains 只能通过 TOML/JSON 导入或直接调 API 写入**（`config-portability.service.ts:226-242`），UI 无法查看其具体内容、也无法新增第二条件。
- 规则摘要（只读展示）：`model/route-rule-summary.ts` → `buildRouteRuleChips` / `describeRouteRule`（zh 文案 `routing.table.ruleSummary.*`）

**「测试这条路由 / 预览匹配结果」——存在，但不是用户预期的形态**

- 入口：`routes-page.tsx` 的 `maybeOpenRouteReplay`（**仅 `route.enabled` 才打开**）→ `route-replay-prompt.tsx`（`RouteReplayPrompt`）
- 后端：`apps/console/src/server/operations/event-replay.service.ts` → `previewRouteReplay` → `buildRoutePreview`；契约 `packages/api/src/contract/operations.ts:85`（`previewRouteReplay`，GET）/ `:91`（`replayRouteEvents`，POST）
- **它不给「样例 Event → 匹配结果」的测试框**。`buildRoutePreview`（`event-replay.service.ts:192`）反过来做：取 `intake.listRecent({ limit })`（`limit` 默认 20、上限 100，`packages/core/src/operations.ts:120`（`limit` 见 `:122`））的**最近事件**逐个跑 `evaluateRouteMatch`，并且 **`if (preview.newDeliveryCount === 0) continue;`（第 215 行）过滤掉「已命中且已投递」的事件**——所以它回答的是「这条 route 现在还能补投哪些历史事件」，**无法回答「这个 event 会不会命中」**。
- Event 侧对应物：`features/events/ui/event-replay-action.tsx`（「重新匹配」）+ `previewEventReplay`（`operations.queries.ts:50`），同样只给 `matchedRouteCount / newDeliveryCount / existingDeliveryCount` 三个计数（i18n `events.replay.preview*`），**不展示 checks**。
- 检索 `testRoute|routeTest|simulate|dryRun` 于 `apps/console/src`、`packages/core/src`、`packages/api/src` **零命中** —— 确认没有「规则试跑」能力。

---

## 6. 测试覆盖（已钉死的行为）

**核心匹配引擎** —— `packages/core/src/route/route.test.ts`（`describe("route matching")`）：

| 用例 | 钉死的行为 |
|---|---|
| `matches inspectable route conditions`（:41） | checks 全通过 ⇒ matched，且 `destinationIds` 透传 |
| `does not match disabled routes`（:52） | `enabled=false` ⇒ 恒不匹配 |
| `does not use fingerprint as suppression`（:67） | **fingerprint 不参与匹配**（同 fingerprint 不同 message 仍命中） |
| `returns only matching routes`（:92） | `findMatchingRoutes` 只返回命中项 |
| `rejects routes with duplicate destinations`（:115） | `destinationIds` 去重约束 |
| `rejects empty label matcher values`（:125） | 空 label value 报错 |
| `trims route string conditions at schema boundaries`（:138） | id/name/sourceIds/label key·value/title/message 全 trim |
| `rejects whitespace-only route string conditions`（:164） | 纯空白 ⇒ 报错 |

**接入层解释落盘** —— `apps/console/src/server/intake/intake.service.test.ts`：
- `persists a webhook event, matches enabled routes, and enqueues deliveries`（:38）
- **`preserves route match explanations from intake time`（:105）** —— 改规则后 `detail.routeMatches` 仍为接入时的 `routeName` 与 `checks`（这是 Explain 快照语义的锚点）
- `records parser failures as audit events without enqueuing deliveries`（:371）—— 失败事件 `routeMatches: []`

**仓储/详情投影** —— `apps/console/src/infra/sqlite/store.test.ts`：
- `filters operational history and exposes event and delivery details`（:699）—— 断言 `routeMatches` 同时含 `matched: true` 与 `matched: false` 两项，且未命中项的 `checks` 有 `field === "source" && !matched`
- `pauses pending delivery claims while the destination or route is disabled`（:426）—— route 禁用 ⇒ 停止认领
- `cascades dependent delivery records when configuration rows are deleted`（:491）

**补投服务** —— `apps/console/src/server/operations/event-replay.service.test.ts`：
- `creates missing deliveries for an old unmatched event without duplicating them`（:23）
- `previews and replays recent events for a route without automatic delivery creation`（:109）

**表单/摘要/受限编辑** ——
- `apps/console/src/features/routes/model/route-form.test.ts`：`maps route form fields into an inspectable route rule`(:13)、`patches the first editable condition while preserving extra route conditions`(:95) 等 7 例
- `apps/console/src/features/routes/model/route-rule-summary.test.ts` + `route-rule-summary-i18n.test.tsx`
- `apps/console/src/features/routes/ui/route-edit-restricted-notice.test.tsx`
- `apps/console/src/features/sources/model/source-route-coverage.test.ts`、`apps/console/src/features/destinations/model/destination-route-coverage.test.ts`

**未覆盖（测试盲区）**：`checks.detail` 的**文案内容**除 `intake.service.test.ts:167` 的 severity 一例外几乎无断言；`Events`/`Deliveries` 列表对 route 的展示只在 `events-table.test.tsx` 有构造性 fixture；**没有任何测试断言「命中但被去重」时的可解释性**。

---

## 用户无法回答的问题（基于代码事实）

1. **「这条告警明明命中 1 条路由，为什么一条投递都没有？」**
   `enqueueForEvent` 的 `skipExisting` 仍只回传计数、不落库（`delivery.repository.ts:81-107`；`AcceptedWebhook` 非持久化）；去重证据已持久化在 `delivery_dedupe_keys`（`schema.ts:164-185`、`delivery.repository.ts:95,109`），但 Event detail 仍无对应证据位。

2. **「label 没匹配上——事件里 `service` 到底是什么值？」**
   已能回答：`evaluateLabels` 同时输出 `expected` 与事件里的 `actual`，`route-match-check-badges.tsx` 渲染为「label key 期望值 / 实际值」；只有缺少结构化字段的历史快照回退英文 `detail`。

3. **「title/message 为什么没命中？我的标题实际长什么样？」**
   已能回答：`evaluateContainsAll` 输出 `actual`，UI 显示命中片段与事件实际值，无需再切到 Normalized 页签。

4. **「我现在看到的匹配结果是接入当时的，还是按现在的规则重算的？」**
   已能回答：`history.repository.ts:131-137` 的 `??` 回填仍会发生，但结果带 `routeMatchesProvenance`，UI 在表格上方明确显示「接入快照」或「现状重算」。

5. **「这条 route 显示命中，为什么永远不会投递？」**
   快照永久 `matched: true`，但 `claimNext` 的 `routes.enabled = 1` 条件（`delivery.repository.ts:192`）会永久挡住。

6. **「我在 UI 里改的到底是不是这条 route 生效的那个条件？」**
   `replaceFirstCondition`（`route-form.ts:154`）只改第 1 条；受限提示只给计数（`route-edit-restricted-notice.tsx`），**不展示被保留条件的实际内容**——用户无法核对编辑前后差异。

---

## 候选切片（3 个可独立实施的垂直切片）

> 仅描述能力边界与依赖顺序，**不含实现方案**。

### 切片 A：Event Explain 的运维可读化
**能力边界**：Event detail「路由匹配」页签的逐条件证据，达到「不切页签就能核对」的程度——每条 check 能给出**事件实际值**，并以当前界面语言呈现，且明确标注该证据的**产生时刻**（接入快照 / 现状重算）。
**为什么独立可交付**：数据源 `events.route_matches_json` 已存在且已在 UI 渲染，本切片只改「证据的可读性与来源标注」这一条链路，不触碰匹配引擎、不触碰写入路径、不新增持久化结构。落地后问题 2、3、4 直接闭环。

### 切片 B：投递缺口解释
**能力边界**：回答「命中但没投递」。为每条命中 route 展示它与 `deliveries` 的对账结果，并给出未投递的原因分类（幂等去重 / 已存在 / 目标禁用 / route 已禁用）。
**为什么独立可交付**：命中侧证据（`events.route_matches_json`）与投递侧证据（`deliveries.route_id`）**都已持久化**，是对已有记录的关联与呈现；不需要改 `enqueueForEvent` 的返回值语义即可先交付只读解释。落地后问题 1、5 闭环。
**依赖顺序**：**依赖切片 A**——两者共用同一块「解释证据」展示位与文案通道，B 在 A 之上扩展维度；先做 B 会立刻撞上 A 未解决的英文/实值问题。

### 切片 C：多条件规则的可编辑性与快照一致性
**能力边界**：让 UI 能查看并编辑规则中**每一类条件的全部条目**（当前只有每类第一条可编辑）；并在真实存在多条件时，消除「编辑的是哪一条」的歧义。
**为什么独立可交付**：作用于授权面（`features/routes/**` 表单模型 + `routes-section`），与 Explain 展示面（切片 A/B）**没有代码依赖**，可并行推进；其阻塞点仅是「多条件规则当前只能靠 TOML/JSON 导入产生」这一既存事实（`config-portability.service.ts:226`）。
**依赖顺序**：与 A / B 并行，互不阻塞。落地后问题 6 闭环。

**顺序建议**：A → B（串行），C 全程可并行。

---

## 未确认 / 待补

- `packages/core/src/route/route.ts` 未暴露任何「规则试跑」纯函数给 UI 直接消费；是否存在未被我检索到的调用点（如 openapi 生成产物中的动态入口）**未确认**。
- `Events` 列表页 `routeMatchCount` 的展示位置与视觉权重只核到列定义与 cell（`events-table.tsx:78`、`event-delivery-counts-cell.tsx`）；完整列顺序**未逐行确认**。
- `docs/architecture/sqlite-store.md` 对 `route_matches_json` 无专门章节（仅在第 18/136/222 行提到 `routes` 表与 `RouteRepository` 装配），即**该字段尚无架构文档背书**——是否为有意留白**未确认**。
- 多条件 route 在生产环境中的实际占比（判断切片 C 优先级的依据）需要实例数据，本次未采集。

---

**本文档不含实现方案。**
