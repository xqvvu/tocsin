# PRD：Alert Suppression 与 Maintenance Window

状态：主体已实现（E1–E3，2026-10-18 复核；2026-10-21 复核未交付增量为试跑预览与保留期清理；
OQ1–OQ3 已于 2026-10-12 拍板）。下方 AC 为完整验收清单，尚未逐项勾选。
方向来源：`docs/prd/post-mvp-planning.md:115`（第三优先级，「Alert Suppression 与 Maintenance Window」）
相关 ADR：`docs/adr/0009-oncall-feishu-urgent.md`（加急去重窗口与指数退避，本 PRD 的关键一致性约束）
相关 PRD：`docs/prd/self-hosted-alert-hub-mvp.md`（术语与口径基线）

## Problem Statement

Tocsin 的 MVP 会忠实投递每一条命中路由的告警，包括重复的 `firing`。这在真实运维里是两个问题：

1. **噪声**。计划内变更、发版、演练、上游抖动期间，同一个 `fingerprint` 的 `firing` 会以固定间隔反复进入通知通道，把人训练成忽略通知。
2. **无暂歇开关**。当值班人已经知道某台主机在维护、已经手动处理了某类告警时，Tocsin 没有"先别发这一段"的表达方式。今天唯一的办法是临时禁用 Source、禁用 Route 或禁用目标，而这些动作会连带影响所有告警，事后也没有"当时静默了什么"的记录。

`docs/prd/post-mvp-planning.md:106` 把该能力列为第三优先级，候选范围是：Silence / suppression / maintenance window 的领域模型；按 source、severity、status、labels、fingerprint 匹配抑制；Event 与 Delivery 记录中保留"被抑制"的可审计证据；UI 中创建、启停、过期和查看 suppression。

真正要解决的问题不是"少发几条消息"，而是**在噪声与可见性之间保持可追溯的平衡**：静默必须能被事后解释，而不是变成一段无从查证的黑洞。

### 为什么是现在

- MVP PRD 已经把这条路径预留出来：故事 69 要求"未来的 silence 与 suppression 概念要有架构空间，使它们能在不改写 Events 与 Deliveries 的前提下加入"（`docs/prd/self-hosted-alert-hub-mvp.md:131`）；对应 out-of-scope 条目明确把它们列为"未来概念，不是 MVP 需求"（`:146`）。本 PRD 是那次预留的兑现。
- 加急（电话呼叫）已经落地（`docs/adr/0009-oncall-feishu-urgent.md`）。这是**最容易被新能力误伤**的既有行为：维护窗口打开时，电话到底会不会被静默，必须在本 PRD 里被明文回答，而不是让实现者顺手决定。
- MVP PRD 同时立了一条与静默看似矛盾、实则互补的质量线：故事 17 要求"告警身份与请求幂等分离，使重复的 firing 不会被意外抑制"（`:79`）。因此本 PRD 的抑制**必须是显式、有范围、有期限的**，不能是隐式的去重副作用。

## Solution

引入一个**抑制规则**（suppression rule）实体（UI 上按意图分成「静默」与「维护窗口」两种 `kind`，共享同一套匹配与生效机制），以及"被抑制"在 Delivery 上的可审计落点。

一句话概括：**抑制作用于投递层**——Event 永远被完整记录（它是"我们收到了什么"的事实），命中的投递被标记为 `suppressed` 并跳过发送，且这条抑制决策本身进入审计。

### 2.1 静默发生在哪一层

**决定：抑制发生在投递层（Delivery），不发生在事件层（Event），也不发生在 route 匹配层。**

三种候选层级与取舍：

| 层级 | 做法 | 判断 |
| --- | --- | --- |
| 事件层（丢弃） | Event 不入库 / 不入队 | **否**。直接违反路线图"保留被抑制的可审计证据"。而且 Event 是"上游发了什么"的原始事实，删除它等于篡改接收记录，与本产品"运维要看得到收到了什么"的核心信任线冲突（MVP PRD 的 carried-forward quality）。 |
| 事件层（标记 suppressed 后仍入队） | Event 记录，但整体不发 | **否**。抑制常常是**目标级**的（"只别再往这个群发"），事件级标记无法表达部分投递被抑制、部分正常。 |
| **投递层** | Event 照常记录；每条 `(event, route, destination)` 投递生成时评估抑制；命中则落一条**状态为 `suppressed` 的 Delivery**，跳过发送 | **是**。同时满足可审计、可表达目标级范围、且复用既有 delivery 状态机与详情页。 |

投递层方案与 MVP PRD 的预留一致：`deliveries` 表已有 `state` 列与 CHECK 约束（`apps/console/src/infra/sqlite/migrate/schema.ts:120,132-133`），扩展一个 `suppressed` 状态是加法而非重写。Domain 类型 `DeliveryStateSchema`（`packages/core/src/delivery/delivery.ts:5`）在本 PRD 之前是
`pending | running | succeeded | failed`，现已扩展为含 `suppressed` 的五状态。

**关键补充：不改写既有记录。** 抑制只影响"尚未尝试发送"的投递。已经发送成功、已经失败的投递不被追溯改写；已经开始或已入队待发的投递在**被认领执行前**再次校验（见 2.4），避免"窗口在重试等待期间打开、重试却照发"的漏洞。

### 2.2 匹配维度与语义

**决定：复用 route 匹配的词汇与语义，不引入第二套匹配语言。**

`RouteRuleSchema`（`packages/core/src/route/route.ts:17-24`）已经把可匹配维度固定为 source / severity / status / labels / title / message，且运算符只有 `equals` 与 `contains`（`LabelMatchOperatorSchema`，`:8`），空条件 = 无条件通过（`evaluateSource` 等函数在期望值为空时直接 push `matched: true`）。抑制规则采用**同一套词汇**：

| 维度 | 语义 | 与 route 的关系 |
| --- | --- | --- |
| `sourceIds[]` | 命中列表内任一 source | 完全一致 |
| `destinationIds[]` | 命中列表内任一目标 | **route 没有**；抑制特有，用于"只静默这个群" |
| `severities[]` | 命中列表内任一 severity | 完全一致 |
| `statuses[]` | 命中列表内任一 status | 完全一致 |
| `labels[]` | `{key, operator: equals\|contains, value}` | 完全一致 |
| `fingerprint[]` | 命中列表内任一 fingerprint（精确相等） | **route 没有**；抑制特有，是"按 fingerprint 抑制"的落点 |
| `titleContains[]` / `messageContains[]` | 大小写不敏感包含 | 完全一致 |

**匹配语义的明确边界：**

- **不支持 glob、不支持 regex、不支持表达式。** 与 route 引擎现状一致，也与 MVP PRD "路由规则不得使用任意 JavaScript 表达式"的口径一致。需要通配时用 `contains`。
- **空条件 = 无条件通过。** 一条 `suppression` 若所有维度都为空 = 静默一切（在指定时间窗内）。这是合法但危险的配置，创建时必须二次确认并给出提示（见 3 号故事）。
- **时间窗是抑制独有的、且必填的维度。** 每条规则有 `startsAt` / `endsAt`；生效条件 = `enabled && startsAt <= now < endsAt && matcher 命中`。维护窗口的语义就是"一段有始有终的时间"，因此把时间窗做成一等字段而不是匹配条件。
- **`fingerprint` 是告警身份，与请求幂等键无关**，两者的分离由 MVP 故事 17 确立。抑制可以按 fingerprint 精确静默"这一个告警"，而不会误伤同 source 的其他告警。

抑制规则的命中判定与 route 一样产出**逐项 checks**（`RouteMatchCheck` 的形状），使 UI 能像 route explain 一样回答"这条告警为什么被静默"。这直接服务于可审计目标。

### 2.3 与加急去重窗口的关系

**这是本 PRD 最关键的一致性约束。** ADR 0009 决定 6 已确立：加急 ping 按 `(fingerprint, destination_id, receiver)` 在一个去重窗口内只建一条（`docs/adr/0009-oncall-feishu-urgent.md`，去重键落在独立表 `oncall_ping_dedupe_keys`，`apps/console/src/infra/sqlite/migrate/schema.ts:225`），窗口沿用 `dedupeWindowMs ?? 5 * 60 * 1000` 的形状（`apps/console/src/server/intake/intake.service.ts:54`）。

**共存方案：两者是串联的两道闸门，不是叠加的两个条件。**

```text
Event 入库
  → route 匹配 → 投递入队（既有）
  → 【闸门一：抑制】命中且窗口生效 → Delivery.state = suppressed，结束（永不发送）
  → 未抑制 → Delivery 执行 → 发送成功且带 providerReference
  → 【闸门二：加急去重窗口】按 (fingerprint, destination, receiver) 决定是否建 ping（既有 ADR 0009）
```

- 抑制在**投递层**，去重窗口在**加急层**，作用对象不同（投递 vs 呼叫）。
- 被抑制的投递**永不执行**（`DeliveryExecution.execute` 根本不会被调用，见 `apps/console/src/server/deliveries/delivery-execution.ts:72`），因此**永不产生 `providerReference`**；而自动加急的前件正是"投递成功 + 有 providerReference"（`delivery-execution.ts:103-105`）。所以**被抑制的告警不会建 ping，也就不会打电话**。
- 反方向同样成立：ping 去重窗口不会改写投递状态，两者状态互不污染——这正是 ADR 0009"电话失败只重试电话，卡片重试不重复打电话"所依赖的隔离，抑制不破坏它。

**电话会不会被静默？会，而且这是有意的语义。** 依据：

- 抑制是运维**主动、显式、有期限**表达的"这一段我知道，别通知我"。维护窗口期间的告警，打电话叫醒值班人恰恰是运维想避免的事。
- 若让电话绕过抑制，会出现更糟的语义：群里安静、电话却响——值班人被叫醒后打开群发现没有任何上下文（ADR 0009 已确认飞书电话文案固定为"给你发了一条加急消息"，电话唯一的上下文就是那条卡片）。**而那条卡片因为被抑制并不存在**，绕过抑制等于制造一条指向虚空的呼叫做不到自洽。

因此：**抑制静默加急电话，且不允许 v1 用任何方式绕过**（是否需要一个显式 bypass 开关，列为 Open Question 1）。

**安全护栏（不新增语义，只做可见性）：** 创建/启用抑制时，UI 必须展示这条规则会影响的**范围预览**——命中的 source、severity/status、以及**其中有多少个开启了加急的目标**（`DestinationOperationalConfig.urgentAutoEnabled` 已可投影，`packages/core/src/destination/destination.ts`）。即：运维在按下"静默"之前，必须能看到"这会同时让 X 个目标在你维护期间不打电话"。

**抑制不追溯已在飞的呼叫。** 抑制只影响尚未创建的 ping；已经 `fired` 或正在重试的 ping 不被撤回、不被取消。电话已经打出去，撤销没有意义，也不该制造"看起来没打其实打了"的状态。

### 2.4 过期、恢复与清理

- **恢复投递不需要任何额外动作**，因为是时间驱动：规则失效（`endsAt` 到达）后，后续事件重新走正常路径。不存在"把静默队列补发"的语义——被静默的那段告警**就是被静默了**，这正是运维要的。
- **窗口内已入队但未执行的投递**：抑制在**投递入队时**首次评估，并在**执行认领时**再次评估（执行路径已存在 reclaim → claim(due) → execute 的收口，见 ADR 0009 对 `DeliveryWorkerService` 顺序的描述与 `delivery-execution.ts`）。这样"投递因失败进入退避、退避期间刚好打开维护窗口"也能被正确抑制。
- **过期与清理**：`endsAt` 到达后规则自动失效（`state` 投影为 `expired`），不需要人手动关闭；运维也可以提前手动禁用（`enabled = false`）。清理沿用现有保留策略的形状（`rawPayloadRetentionDays` 式的 retention setting + 定时 prune，参考 `intake.pruneRawPayloads` 与 `pruneDedupeKeys`，`apps/console/src/infra/sqlite/repositories/delivery/delivery.helpers.ts:95`）：已到期 N 天后的抑制记录可被清理，**但被引用的审计证据必须保留**——清理只删规则本体，投递上的抑制快照不随之消失（见 2.5）。

### 2.5 可审计证据

事后必须能回答"这条为什么没发出去"。三层证据：

1. **Event 层：Event 照常入库**，`routeMatches` 照常记录。因此"我们收到了这条告警、它命中了哪些 route"永远可查。
2. **Delivery 层：被抑制的投递仍是投递。** 新增状态 `suppressed`，并携带：
   - `suppressionId`（可空，指向规则；规则被删则置空）
   - `suppressedAt`（抑制生效时刻）
   - `suppressReason`（**快照文本**：规则名 + 匹配摘要，例如 `维护窗口「10 月数据库迁移」命中 label env=prod`）
   关键设计：**原因以快照落库，不依赖规则仍然存在**。规则被删除或清理后，"当时是因为什么被抑制"依然可读。这是审计证据与规则生命周期解耦的唯一办法。
3. **展示层：** Delivery detail（`DeliveryDetailSchema`，`packages/api/src/schemas/operations.ts:83`）暴露抑制字段；Event detail 的投递列表里被抑制的投递有明确状态与原因；再提供抑制规则的命中列表（"这条规则静默了哪些告警"），双向可查。

被抑制的投递**不产生 delivery attempt**（从未尝试发送），因此 `delivery_attempts` 里没有行，UI 必须把"零尝试的 suppressed"与"尝试失败的 failed"明确区分，避免误判为发送失败。

### 2.6 领域模型草案

> 以下仅为 schema 形状，不含实现代码。

**实体：Suppression（表 `suppressions`）**

```text
suppressions(
  id                text primary key,
  name              text not null unique,          -- 运维可读名，进审计快照
  kind              text not null,                 -- 'silence' | 'maintenance_window'（UI 意图与文案）
  enabled           integer not null default 1,    -- 布尔，风格对齐 routes.enabled
  reason            text,                          -- 运维自填说明（工单号、变更号）
  matcher_json      text not null,                 -- 见下方 SuppressionMatcher
  starts_at         text not null,                 -- ISO datetime
  ends_at           text not null,                 -- ISO datetime，见 OQ2
  created_by        text,                          -- dashboard 用户，审计
  created_at        text not null,
  updated_at        text not null
)
```

**值对象：SuppressionMatcher（与 `RouteRule` 同构，多了两个抑制特有条件）**

```text
{
  sourceIds:       string[],                       -- 空 = 不限制
  destinationIds:  string[],                       -- 抑制特有；空 = 不限制（即全部目标）
  severities:      AlertSeverity[],                -- critical | warning | info | unknown
  statuses:        AlertStatus[],                  -- firing | resolved | unknown
  fingerprints:    string[],                       -- 抑制特有；精确相等
  labels:          { key, operator: 'equals'|'contains', value }[],
  titleContains:   string[],
  messageContains: string[]
}
```

**实体变更：Delivery（表 `deliveries` 扩展，纯加法）**

```text
deliveries + (
  suppression_id       text null references suppressions(id) on delete set null,
  suppressed_at        text null,
  suppress_reason      text null,                  -- 快照，规则删除后仍可读
)
-- 既有 CHECK 约束扩展 state 枚举，加入 'suppressed'：
--   state IN ('pending','running','succeeded','failed','suppressed')
```

**关系：**

- `Suppression` —(匹配)→ 多条 `Delivery`：一条规则可抑制多条投递；一条投递最多被一条规则抑制（按 `startsAt` 优先、同名去重的确定性顺序取第一条命中，避免"到底是谁静默的"不确定）。
- `Suppression` —→ `Event`：**无直接关系**。Event 不知道自己被抑制，因为抑制是投递层决策；想查"这条 Event 被静默了吗"通过它的 Delivery 查。这是本设计里"不污染事件层"的直接体现。
- `Suppression` 与 `Route`：**无引用关系**。抑制不要求挂在某条 route 上（route 是"往哪发"，抑制是"暂时别发"）；但 matcher 可以按 source/destination 间接表达范围。不引入"route 上的静默开关"，以免把两套匹配规则耦合起来（该取舍见 Out of Scope 的理由）。

**命中判定：`evaluateSuppressionMatch(suppression, {sourceId, destinationId, event, now})`** —— 返回结构与 `RouteMatchResult` 同构（`matched` + 逐项 `checks`），供 UI 复用 route explain 的展示方式。

## User Stories

### 创建与范围

1. As an SRE, I want to create a suppression that matches by source, severity, status, labels, title, message, fingerprint, and destination, so that I can silence exactly the noise I mean to and nothing else.
2. As an SRE, I want suppression matching to use the same vocabulary and operators as route rules (`equals` / `contains`), so that I do not have to learn a second matching language.
3. As an SRE, I want an empty condition to mean "no restriction on this dimension", so that a rule reads the same way a route rule reads.
4. As an SRE, I want to be warned and asked to confirm before saving a suppression whose matcher is completely empty (silence everything), so that a catastrophic misconfiguration cannot be created by accident.
5. As an SRE, I want to distinguish a "silence" from a "maintenance window" in the UI, so that I can express intent even though they share one mechanism.
6. As an SRE, I want to attach a free-text reason and my identity to a suppression, so that the next person can tell why it exists.

### 时间窗与生命周期

7. As an SRE, I want every suppression to have a start and an end, so that silence is always bounded and self-healing.
8. As an SRE, I want a suppression to become active automatically at its start time, so that I can schedule a maintenance window in advance.
9. As an SRE, I want a suppression to stop matching automatically at its end time, so that delivery resumes without anyone remembering to flip a switch.
10. As an SRE, I want to disable and re-enable a suppression before its window expires, so that I can abort a maintenance window that is no longer needed.
11. As an SRE, I want to see each suppression's effective state (`scheduled` / `active` / `expired` / `disabled`), so that I can tell what is in effect right now.
12. As an SRE, I want a suppression to be clearly marked expired rather than deleted, so that the operational history is not rewritten.

### 静默层级与正确性

13. As an SRE, I want a silenced Event to still be recorded in full, so that I can prove what arrived even though nothing was sent.
14. As an SRE, I want a silenced delivery to exist as an explicit delivery record with state `suppressed`, so that silence is a visible decision and not a missing row.
15. As an SRE, I want a delivery that is enqueued inside a window but executed after it opens to be re-checked at execution time, so that a retry backoff cannot leak a notification through an open window.
16. As an SRE, I want already-sent and already-failed deliveries never to be rewritten by a suppression, so that history stays truthful.
17. As an SRE, I want `resolved` notifications to be silenceable too, so that a maintenance window does not require me to also mute recovery messages.

### 与加急共存

18. As an SRE, I want a silenced alert to not place an urgent phone call, so that a maintenance window does not wake the on-call engineer for a change they already know about.
19. As an SRE, I want to see, before enabling a suppression, how many destinations with automatic paging fall inside its scope, so that I explicitly consent to muting calls.
20. As an SRE, I want pings that already fired to be left alone when a suppression opens, so that the record reflects what actually happened.
21. As an SRE, I want suppression and paging dedupe to remain independent, so that neither one can silently change the other's state.

### 可审计证据

22. As an SRE, when an alert was not delivered, I want to answer "why" from the delivery itself, so that I do not have to reconstruct it from memory.
23. As an SRE, I want the suppression reason stored as a snapshot on the delivery, so that the explanation survives even after the rule is deleted.
24. As an SRE, I want to see which deliveries a given suppression silenced, so that I can review the blast radius of a past window.
25. As an SRE, I want a silenced delivery to be visually distinct from a failed delivery, so that "we chose not to send" is never mistaken for "sending broke".
26. As an SRE, I want the match explanation (per-dimension checks) available for a suppression, so that I can debug why something was or was not silenced.

### 运维与自托管

27. As an operator, I want suppressions to be manageable from the console (list, create, edit, disable, view), so that I do not need to touch config files for a short-lived change.
28. As a self-hoster, I want completed suppression records to be prunable under a retention setting, so that the database stays small without losing the audit trail on deliveries.
29. As a self-hoster, I want suppressions to run inside the existing single process and existing delivery worker, so that adopting them adds no new infrastructure.
30. As an operator, I want the new surfaces localized in Chinese and English like the rest of the console, so that my team can use them in their own language.

## Implementation Decisions

- **抑制是独立实体，挂在投递层。** 新表 `suppressions`；投递 `deliveries` 纯加法扩展三个字段（`suppression_id` / `suppressed_at` / `suppress_reason`）与枚举 `state` 新增 `suppressed`。不引入 `Incident`、不引入沉默队列。
- **matcher 与 `RouteRule` 同构。** 复用 `packages/core/src/route/route.ts` 的运算符封闭集（`equals` / `contains`），新增 `destinationIds` 与 `fingerprints` 两个抑制特有条件。判定函数 `evaluateSuppressionMatch` 返回与 `RouteMatchResult` 同构的 `checks`，供 UI 复用 route explain 的展示。
- **不引入 glob / regex / 表达式。** 与 route 引擎和 MVP PRD 的"不得使用任意表达式"口径一致。
- **执行口唯一且有二次校验。** 首次评估在投递入队（与 route 匹配同一趟），二次评估在 worker 执行认领时。因此**抑制判定必须在 worker 侧可用**，不能只在 intake 事务里做。这是本设计唯一触及热路径的地方。
- **抑制与加急串联而非叠加。** 被抑制的投递永不执行，因此永不产生 `providerReference`，而自动加急的前件正是"成功 + `providerReference`"（`apps/console/src/server/deliveries/delivery-execution.ts:103`）。**无需为打电话写任何特判**，这是选择投递层的直接收益。
- **原因快照与规则解耦。** `suppress_reason` 是文本快照，`suppression_id` 用 `on delete set null`，使删规则不毁审计。
- **多条规则命中取确定性唯一来源。** 一条投递只挂一条抑制规则：按 `startsAt` 最早、再按 `name` 排序取第一条命中，避免"到底是谁静默的"不确定。是否需要多命中记录列为 Open Question 1 之外的实现细节（默认不做）。
- **保留策略沿用既有形状。** 新增一个 retention setting（对齐 `rawPayloadRetentionDays` 的既有 setting + 定时 prune 形状）清理已到期 N 天后的抑制规则本体；**投递上的抑制快照不参与清理**。
- **oRPC 面。** 新增 `suppressions` namespace，已交付 `list` / `get` / `hits` / `create` / `update` /
  `setEnabled` / `delete`；`preview`（对样例或历史 Event 试跑 matcher）仍为计划项，见 backlog REQ-25。
  `DeliveryDetail` 增加抑制字段；`EventDetail` 的投递列表透出 `suppressed` 状态与原因。私有过程一律 dashboard 鉴权，领域错误由既有边界统一翻译（见 `docs/adr/0007-console-orpc-api-boundary.md`）。
- **文案**遵循 AGENTS.md 运维词汇（「静默」「维护窗口」「抑制」），机器值（`suppressed`、`equivalent` 枚举值等）不翻译。
- **不做 route 级的静默开关。** route strict schema + TOML snake_case 镜像 + 路由表单全链的连带成本高（ADR 0009 已为"加急不配在 route 上"做过同样取舍），且抑制需要的是"跨 route 的一段时间"，挂在 route 上会迫使运维重复配置。

## Testing Decisions

- 好测试只断言外部行为：命令与 DTO 形状、投递状态转移、匹配判定结果、是否产生 attempt；不断言私有 helper、SQL 文本或内部实现细节。
- 主 seam 是**抑制判定与投递入队的服务级集成测试**：内存 SQLite + 假时钟，覆盖"窗口前/中/后"三种时间的匹配矩阵、空条件语义、`destinationIds` / `fingerprints` 两个特有条件、以及"命中 → 产生 `suppressed` 投递且零 attempt"。
- 第二个 seam 是**执行期二次校验回归**：投递在窗口外入队、窗口内在退避、退避后执行——必须能被抑制（先例形状：`apps/console/src/server/deliveries/delivery-execution.test.ts`）。
- 第三个 seam 是**加急共存的负向断言**（本 PRD 最关键的两条）：`suppressed` 投递**不建任何 ping**、`suppressed` 投递**不产生 `providerReference`**。先例是 `oncall.service` 的服务级集成测试。
- 匹配单测：`evaluateSuppressionMatch` 的逐项 checks 与 `RouteRule` 语义一致性（含空条件 = 通过）。
- 审计测试：规则删除后 `suppressed` 投递仍能读出原因文本；`state` 枚举扩展后既有 `failed`/`succeeded` 语义回归不变。
- oRPC 边界测试：新过程的 dashboard 鉴权覆盖与领域错误映射。先例是 `server-orpc-auth.test.ts`、`errors.test.ts`。
- UI 只测用户可见行为：创建表单的空条件确认提示、状态徽章（含 expired/disabled）、投递详情的"为什么没发出去"、加急影响范围提示。先例是 `features/routes/model/*` 与 `features/destinations/model/destination-form.test.ts`。

## Out of Scope

路线图（`docs/prd/post-mvp-planning.md:106`）明确排除的四项，原样保留：

- **Incident lifecycle。** 理由：抑制回答的是"这段时间别通知"，不是一个工单生命周期。引入 Incident 会把状态机、指派、时间线一并带进来，与本产品"通知正确投递"的边界不相称；需要时另立 PRD。
- **On-call scheduling。** 理由：加急（ADR 0009）已刻意不做排班，抑制更不需要知道谁值班——它只负责"不发"。排班的正确落点是 destination 的加急接收人配置。
- **Escalation policy。** 理由：抑制是"不通知"，升级是"升级通知"，两者方向相反。若把升级做进抑制，会让"静默"这个动作产生副作用，破坏可预期性。
- **SaaS-style team ownership。** 理由：Tocsin 是自托管单租户产品，权限模型是 dashboard 鉴权（ADR 0007）。抑制的创建者只作为审计字段记录，不做团队/空间隔离。

本 PRD 另外明确的 v1 边界：

- 抑制不追溯重写已发送/已失败的投递。
- 不补发被静默的告警（不引入"窗口结束后回放"语义）。是否需要"被静默告警摘要"见 Open Question 3。
- 不支持 glob、regex、任意表达式匹配。
- 不支持 route 级的静默开关。
- 不支持静默单个"已 firing 的告警实例"并自动在 resolved 时解除（per-fingerprint mute 已可用 matcher 表达，但不做"自动解除"语义）。
- 不做 alert grouping（与路线图 4「搜索、过滤与历史排障」和更高优先级的聚合能力相关）。
- 不做外部审批流（抑制不需要审批，只需要审计）。
- 不做跨实例协调（与 ADR 0009 对多实例的边界一致）。

## Acceptance Criteria

- [ ] 可以创建 `silence` 与 `maintenance_window` 两类抑制记录，二者共享同一 matcher 与生效机制，仅 `kind` 与文案不同。
- [ ] matcher 支持 `sourceIds`、`destinationIds`、`severities`、`statuses`、`labels`（`equals` / `contains`）、`fingerprints`、`titleContains`、`messageContains`；**不支持** glob / regex / 表达式。
- [ ] 空条件维度 = 不限制；全空的 matcher = 静默一切，且保存前必须经二次确认。
- [ ] 抑制有 `startsAt` / `endsAt`，`enabled` 与时间窗共同决定是否生效；有明确的状态投影（`scheduled` / `active` / `expired` / `disabled`）。
- [ ] 命中抑制的投递以 `state = 'suppressed'` 落库，**不产生 delivery attempt**，**不发送任何内容**。
- [ ] 被抑制的 Event 仍完整入库，`routeMatches` 仍被记录。
- [ ] 已 `succeeded` / 已 `failed` 的投递在抑制生效后状态不被改写。
- [ ] 投递入队时未被抑制、但在执行认领时落入生效窗口的，仍被抑制（执行期二次校验）。
- [ ] `suppressed` 投递**不创建任何 oncall ping**；已在飞（`running` / `fired` / 重试中）的 ping 不因抑制而被取消或改写。
- [ ] 投递详情能回答"这条为什么没发出去"：显示 `suppressed` 状态、抑制原因快照与发生时刻。
- [ ] 抑制规则被删除或清理后，其 `suppressed` 投递仍能读出原因文本（快照与规则解耦）。
- [ ] 抑制详情能看到该规则命中的投递列表；Event 详情的投递列表中 `suppressed` 与 `failed` 视觉可区分。
- [ ] 创建/启用抑制前，UI 展示命中的 source/severity/status 范围，以及范围内**开启了自动加急的目标数量**。
- [ ] `DeliveryStateSchema` 扩展 `suppressed` 后，`pending` / `running` / `succeeded` / `failed` 的既有语义、worker 行为与重试退避**零回归**。
- [ ] `suppressed` 的连带面一并覆盖，不只是枚举本身：`deliveryCounts` 投影、`EventDeliveryCountsCell` 的合计（`apps/console/src/features/events/ui/event-delivery-counts-cell.tsx:15`，四状态**显式求和、无穷尽性守卫**，漏计是编译不报的静默回归）、以及中英 i18n 键。
- [ ] 抑制规则可被 retention setting 清理（形状对齐 `rawPayloadRetentionDays`），且清理不影响投递上的抑制快照。
- [ ] 新增 `suppressions` oRPC namespace；所有过程走 dashboard 鉴权，领域错误由既有边界翻译。
- [ ] 抑制功能在现有单进程 + 现有 delivery worker 模型内运行，不新增进程或基础设施。
- [ ] 新界面字符串有中英双语。
- [ ] `vp check`、`vp run -r test`、`vp run -r build` 全绿。

## Decisions（已拍板 2026-10-12）

三条 Open Question 已由 owner 拍板，**不再是开放项**。完整取舍分析见 `docs/prd/alert-suppression-decisions.md`。

| # | 问题 | 拍板结果 |
|---|---|---|
| 1 | 加急电话是否允许绕过抑制 | **不绕过**，v1 不留开关、不做显式逃逸口。 |
| 2 | `endsAt` 是否允许为空 | **不允许为空**，`ends_at text not null`。 |
| 3 | 窗口结束是否发摘要通知 | **只做 UI 汇总**，不主动发通知。 |

三条的直接后果（实现时必须遵守）：

1. **`suppressed` 是终态。** 被抑制的投递永不执行 → 永不产生 `providerReference` → **既不会自动加急，也不能被手动呼叫**（`buzzDelivery` 同样要求该句柄，`apps/console/src/server/oncall/oncall.service.ts:62-67`）。因此 2.3 节的范围预览文案必须写清「这一段里这些目标的告警**无法用任何 Tocsin 手段叫醒**」，而不是「不会打电话」。
2. **建表用 `ends_at text not null`**（已随 `0002_suppressions` 落地）。迁移器按版本号跳过已应用步骤（`apps/console/src/infra/sqlite/migrate/runner.ts:26-30`），已应用 `0002` 的实例若要改该字段，必须新增 forward step，不能编辑 `0001` 或已提交的 `0002`。
3. **窗口结束无通知**，故 2.5 节的审计证据必须自足：运维唯一的检索入口是 UI，`suppress_reason` 快照必须在不依赖规则本体的情况下读懂。不做摘要 = 不做跨投递聚合切片。

---

## Open Questions（历史记录，均已拍板，见上）

1. **是否需要"逃逸口"（bypass）让加急电话无视抑制？** v1 决定不提供：被抑制的卡片不存在，绕过抑制会打出一条没有上下文的电话。若未来引入，必须是显式、默认关闭、单独权限、且自身留下审计记录的动作。
2. **`endsAt` 允许为空吗？** v1 强制有期限（`ends_at text not null`），让静默永远自愈。允许无终点的长期静默会变成被遗忘的黑洞，若未来要支持，需同时提供强提醒与置顶。
3. **窗口结束时要发一条"维护期间被静默了 N 条告警"的摘要吗？** v1 不做主动通知，只在 UI 提供汇总视图；跨投递聚合的通知是独立切片（见 backlog REQ-24）。

## Further Notes

- 本 PRD 是 `docs/prd/self-hosted-alert-hub-mvp.md:131`（故事 69，"为未来的 silence 与 suppression 留架构空间"）与 `:146`（"silence、suppression、维护窗口是未来概念"）的收敛台阶；MVP PRD 本身不再扩写。
- 与 ADR 0009 的接口在本 PRD 里被明确划定为"串联闸门"：抑制在投递层止步，加急去重窗口在 ping 层判定，两者不共享状态。落地时若需要改 `delivery-execution.ts` 的成功分支，应保持该分支既有语义不变（ADR 0009 已把它标注为唯一被改动的热路径）。
- 投递层的选择附赠了一个好处：**未来的 ack / 确认抑制**（ADR 0009 状态枚举预留的 `suppressed`）与本文的 `suppressed` 投递状态语义一致，可以无迁移增长。
- 若后续需要"按 route 静默"，应另立 ADR 评估 route strict schema + TOML 镜像 + 表单的连带成本（ADR 0009 对加急接收人做过同样的取舍）。
- 文件级实现顺序（schema → repository → 服务/判定 → 执行期校验 → oRPC → UI → 测试）应在下一个切片文档中细化；本 PRD 是产品契约。

## 参考

读过的代码与文档（本 PRD 的事实来源）：

- `docs/prd/post-mvp-planning.md:106`（方向来源、候选范围、四项不做）
- `docs/adr/0009-oncall-feishu-urgent.md`（加急去重窗口 `(指纹, 通知目标, 呼叫对象)`、指数退避、`oncall_pings.state` 的 `suppressed` 预留、delivery 成功分支为唯一热路径改动点）
- `docs/prd/self-hosted-alert-hub-mvp.md`（术语基线；`:79` 告警身份 vs 幂等、`:131` 故事 69 架构预留、`:146` 与 `:207-211` out-of-scope 口径）
- `docs/prd/oncall-feishu-urgent.md`（PRD 写法与术语对齐；加急的 user story / out-of-scope 边界）
- `docs/prd/destination-template-engine.md`（PRD 章节风格：Problem / Solution / User Stories / Implementation Decisions / Testing Decisions / Out of Scope / Further Notes）
- `packages/core/src/route/route.ts`（`LabelMatchOperatorSchema` 只有 `equals` / `contains`；空条件 = 无条件通过；`RouteMatchCheck` 逐项 checks 形状）
- `packages/core/src/delivery/delivery.ts:5`（`DeliveryStateSchema` 五状态含 `suppressed`、`ProviderReferenceSchema`）
- `packages/core/src/event/event.ts`（`EventRecord` 无抑制字段，支持"Event 不感知抑制"）
- `packages/core/src/event/normalized-event.ts`（`AlertSeverity` / `AlertStatus` / `fingerprint` / `labels` = matcher 的取值域）
- `packages/core/src/destination/destination.ts`（`DestinationOperationalConfig.urgentAutoEnabled`，用于"加急影响范围"提示）
- `packages/core/src/oncall/oncall.ts`（ping 状态机与 `suppressed` 预留的注释）
- `apps/console/src/server/deliveries/delivery-execution.ts:72,79,94,104`（执行口唯一；自动加急前件为"成功 + `providerReference`"）
- `apps/console/src/server/intake/intake.service.ts:54`（route 匹配与投递入队同一事务；去重窗口形状）
- `apps/console/src/infra/sqlite/migrate/schema.ts:111-185,188,225`（`deliveries` 的 `state` 列与 CHECK；`delivery_dedupe_keys`；`oncall_pings`；`oncall_ping_dedupe_keys`）
- `apps/console/src/infra/sqlite/repositories/delivery/delivery.helpers.ts:73,95`（`reserveDedupeKey` / `pruneDedupeKeys` 的保留剔除形状）
- `packages/api/src/schemas/operations.ts:83`（`DeliveryDetailSchema` 与 `pings[]`，抑制字段的落点）
- `apps/console/src/server/configuration/config-portability.ts:51,67`（retention setting 的形状先例）
- `apps/console/src/server/orpc/features/`、`packages/api/src/contract/`（namespace 与 contract 的既有组织方式）
- `docs/adr/0007-console-orpc-api-boundary.md`（私有过程的鉴权与错误翻译边界，经 ADR 0009 引用核实）
ADR 0009 引用核实）
