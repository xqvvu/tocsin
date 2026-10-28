---
title: 处理链路与概念
description: 从 Webhook 接入到通知送达的完整数据模型：每一步读写哪张表、状态如何流转、排障时先看哪里。
---

# 处理链路与概念

Tocsin 把告警接收与通知发送分开处理，并把每一步写入同一份 SQLite。排查时沿链路读取证据，就能回答四个问题：收到什么、为何匹配、发送到了哪里、结果如何。

本页是一条告警的完整数据模型；各对象的操作细节由专题页展开。

## 全景链路

```text
上游系统
  │ POST /api/sources/<source-id>/webhook
  ▼
认证 ── sources.token_hash / config 中的共享密钥
  ▼
解析 ── Provider → 规范化字段
  │        └─ 解析失败 → events（parse_failed）→ 400 + eventId
  ▼
路由评估 ── routes → events.route_matches_json（接入时快照）
  ▼
接入事务 ── events + deliveries + delivery_dedupe_keys
  │        └─ 命中有效静默 → deliveries.state = suppressed
  ▼ 202 Accepted
投递 Worker ── deliveries: pending → running → succeeded / failed
  │             delivery_attempts: running → succeeded / failed
  ▼
加急 Worker ── oncall_pings: scheduled → running → fired / failed
```

::: tip `202 Accepted` 的含义
Webhook 返回 `202` 只表示 Event 与投递任务已在同一个事务中提交。目标是否收到消息，要看后续 Delivery 的状态。
:::

## 核心对象

| 对象 | 运维含义 | 细节 |
| --- | --- | --- |
| 告警源 Source | 一个上游发送方及其 Provider 解析器；独立认证、可停用、可轮换凭证 | [告警源接入与生命周期](/guide/sources) |
| Event | 每次通过认证的入站请求；保存规范化字段、原始调试信息与接入时路由快照 | [事件检索与证据](/guide/events) |
| Route | 用 source、severity、status、labels、title 或 message 匹配 Event，并指定通知目标 | [路由规则与匹配](/guide/routes) |
| Destination | 一个出站渠道及其端点、模板和凭证；凭证保留在服务端 | [通知目标参考](/integrations/destinations) |
| Delivery | 一个「Event × Route × Destination」的发送任务 | [投递检索、生命周期与重试](/operations/deliveries) |
| Delivery attempt | 一次实际发送尝试；保留响应、错误与耗时 | [投递详情与证据](/operations/deliveries#投递详情与证据) |
| Suppression | 有范围和时间窗的静默；命中的 Delivery 不发送 | [告警静默与维护时段](/operations/suppressions) |
| Oncall ping | 一条飞书电话加急呼叫；按呼叫对象各一条 | [飞书应用与电话加急](/integrations/feishu-app) |
| Integration | 可复用的外部应用资源；当前为飞书应用，凭据存于服务端 | [飞书应用与电话加急](/integrations/feishu-app) |

## 一条告警的时间线

按发生顺序，每一步都标出读写的表。

1. **认证** — 读 `sources`：`token_hash`、`enabled` 与 `config_json` 中的共享密钥。失败返回 `401` 或 `403`，不写入记录。
2. **解析** — Provider 把载荷转成规范化字段。解析失败时写一条 `events`（`parse_failed`，无路由快照内容），返回 `400` 与 `eventId`，不创建 Delivery。
3. **路由评估** — 读 `routes`（包括已停用路由），把每条路由的 `matched` 与逐项检查写入 `events.route_matches_json`。只有启用的命中路由参与建投递。
4. **接入事务** — 读 `settings`（原始载荷保留天数）与 `suppressions`；写 `events`、`deliveries`、`delivery_dedupe_keys`。每个「路由 × 目标」一条 Delivery：`pending`；命中静默为 `suppressed`；命中幂等键则不建。
5. **Worker 领取** — 读 `settings`（全局暂停）、`deliveries`、`destinations`、`routes` 与 `suppressions`；写 `deliveries`、`delivery_attempts`。`pending → running`，`attempt_count + 1`；领取时命中静默 → `suppressed`；目标或路由停用则保持 `pending`。
6. **发送** — 读 `destinations` 与 `feishu_apps`（app 模式凭证）；写 `deliveries`、`delivery_attempts`。成功 → `succeeded`；可重试失败 → `pending` 并写 `next_attempt_at`；终态失败 → `failed`。
7. **电话加急** — 读目标的 urgent 配置与 Event 的 status、severity；写 `oncall_pings`、`oncall_ping_dedupe_keys`。仅飞书 app 模式、`firing` 且严重度在门限内；每个呼叫对象一条 `scheduled`。
8. **人工补投** — 读 `events`、当前启用的 `routes`、`suppressions`；写 `deliveries`。「重新匹配」不新建 Event，只为缺失的「路由 × 目标」补建 Delivery。
9. **人工重试** — 只改 `deliveries`：仅 `failed` 可重试，清空最后错误并回到 `pending`，`attempt_count` 保留。

### 数据表速查

| 表 | 一行代表 |
| --- | --- |
| `sources`、`destinations`、`routes` | 告警源、通知目标与路由配置 |
| `feishu_apps` | 飞书应用凭据（仅服务端解析） |
| `events` | 一次入站请求及接入时路由快照 |
| `deliveries` | 一个发送任务及其状态 |
| `delivery_attempts` | 一次发送尝试的结果 |
| `delivery_dedupe_keys` | 幂等窗口内已建投递的组合 |
| `oncall_pings` | 一次电话加急呼叫 |
| `oncall_ping_dedupe_keys` | 加急去重窗口内的呼叫对象 |
| `suppressions`、`settings` | 静默规则与运行设置 |

补充说明：

- 接入事务内会按保留期做一批有界的原始载荷清理；事务提交后还会在后台排空剩余积压。这不影响 Event 行和规范化字段，见[数据保留与 SQLite 容量](/operations/data-retention#清理什么-保留什么)。
- Provider 解析失败也会留下 Event，但 `route_matches_json` 是空数组，且不产生 Delivery；处理顺序见[解析失败事件](/guide/events#解析失败事件)。
- 路由快照保存的是**接入时**的结论，包括当时已停用的路由。旧事件没有快照时，页面按当前路由重算，见[读取路由匹配证据](/guide/events#读取路由匹配证据)。
- 接入事务与 Worker 领取都会读取 `suppressions`：静默可能在投递排队期间才生效，因此领取时会再判一次。
- 全局「暂停出站投递」只让投递 Worker 停止领取，不改变既有状态，也不暂停独立的加急队列；见[全局暂停出站投递](/operations/deliveries#全局暂停出站投递)。

## Delivery 状态怎么走

| 状态 | 怎么进入 | 值班时怎么读 |
| --- | --- | --- |
| `pending` | 接入时未命中静默；可重试失败后；人工重试 | 等待 Worker、退避、目标或路由停用，或全局暂停。不是失败。 |
| `running` | Worker 已领取并创建 attempt | 正在发送。超时或进程中断会留下长期 `running`，由回收逻辑处理。 |
| `succeeded` | 目标接受消息 | 写入完成时间，以及目标返回的回执与渲染载荷（如有）。 |
| `failed` | 不可重试，或尝试次数用尽 | 保留尝试历史；多数可手动重试。 |
| `suppressed` | 创建或领取时命中有效静默 | 没有 attempt，也没有回执；不是发送失败，不会自动补发。 |

```text
pending ──领取──► running ──成功──► succeeded
   ▲                 │
   │                 ├─ 可重试失败且未达上限 ──► pending（next_attempt_at）
   │                 └─ 不可重试或已达上限 ──► failed
   └── 手动重试（仅 failed）──

pending ──命中有效静默（创建或领取时）──► suppressed
```

- 领取前会先回收超过 `TOCSIN_WORKER_STALE_RUNNING_MS`（默认 5 分钟）仍为 `running` 的尝试：还有剩余次数时回到 `pending` 并标记结果未知，否则转 `failed`。两种「结果未知」的区别见[投递检索、生命周期与重试](/operations/deliveries#两种「结果未知」怎么处理)。
- 目标或路由停用不会把 Delivery 改成失败，只会让它留在 `pending`；重新启用后 Worker 会继续领取。
- 手动重试只接受 `failed`。`suppressed` 不会发送；「目标已接受但本地未落库」的失败也拒绝重试，避免重复通知。重试会保留既有 attempt 历史；若次数已用尽，会临时提高上限以允许这次人工尝试。三个重试入口都会先要求确认；目标开启自动加急时，确认框还会列出这次重试可能拨打的加急电话上界，见[重试确认里的加急提示](/operations/deliveries#重试确认里的加急提示)。

## 加急呼叫状态怎么走

自动加急只在**成功的**飞书 app 模式投递之后触发，并且 Event 必须是 `firing`、严重度在目标的 urgent 门限内。每个呼叫对象各有一条 `oncall_pings` 记录：

| 状态 | 含义 |
| --- | --- |
| `scheduled` | 已入队，等待加急 Worker 领取 |
| `running` | 已领取；派发前会先写入呼叫意图（`dispatch_started_at`） |
| `fired` | 飞书已接受呼叫请求 |
| `failed` | 终态失败；错误中会区分是否可能已经拨出 |

- 去重分两层：同一 fingerprint + 目标 + 呼叫对象在 5 分钟内只产生一条 ping；自动路径还会锁定同一 Delivery + 呼叫对象，卡片重发后也不会再次自动拨打同一个人。见[去重与重试](/integrations/feishu-app#去重与重试)。
- `running` 超时被回收时，如果呼叫意图尚未写入，仍有次数就重新入队；如果已经写入，说明电话可能已经拨出，记录转 `failed` 且不自动重试。先向接收人核实，再决定是否手动补呼。
- 加急队列与卡片投递队列共用轮询间隔和批次上限，但全局暂停不作用于加急队列。逐条读取方式见[读取加急记录](/integrations/feishu-app#读取加急记录)。

## 三种标识不要混用

| 标识 | 作用域、窗口与边界 |
| --- | --- |
| Event 幂等键 | 作用域是 Source + 幂等键 + Route + Destination；固定 5 分钟。不阻止 Event 记录，也不跨 Source 去重。 |
| fingerprint | 作用域是同一 Source；Event 不自动清理，加急去重 5 分钟。不阻止新 Event 或 Delivery，也不跨 Source 聚合。 |
| 外部消息引用 | 属于单条 Delivery，随记录保留。用于展示回执、定位电话加急对象与防重拨，不用于事件去重。 |

- Event 幂等键由 Provider 解析；Generic 使用 `idempotencyKey`、`id` 等字段，缺失时回退到载荷哈希。窗口从首个事件的时间开始，不随重复请求滑动。
- 窗口内重复的 Webhook 仍会写入 Event 供审计，但不会为相同「路由 × 目标」再次创建 Delivery；各命中路由和目标分别计数。
- 删除首个 Event 或任一关联资源时，对应的去重键会随外键级联清理；这只影响后续窗口内的去重，不影响已产生的投递。
- fingerprint 用来回答「同一个告警是否又来了」，见[判断是否重复发生](/guide/events#判断是否重复发生)；它不代表请求幂等。

## 排障时先看哪里

| 问题 | 先看与继续读 |
| --- | --- |
| 到达与解析 | `events.received_at`、`normalized_json`、`provider_metadata_json`；失败事件带 `parse_failed` 标签。见[事件检索与证据](/guide/events)。 |
| 路由匹配 | `events.route_matches_json` 的接入快照。见[读取路由匹配证据](/guide/events#读取路由匹配证据)。 |
| 缺少投递 | `deliveries` 是否为空；再查去重键、Route 与 Destination 是否启用、是否有静默。见[投递检索、生命周期与重试](/operations/deliveries)与[告警静默与维护时段](/operations/suppressions)。 |
| 投递结果 | `deliveries` 与 `delivery_attempts` 的状态、响应和错误。见[投递详情与证据](/operations/deliveries#投递详情与证据)。 |
| 电话加急 | `oncall_pings` 的状态、触发方式与最近错误。见[读取加急记录](/integrations/feishu-app#读取加急记录)。 |
| 队列不动 | `settings` 的全局暂停、Worker 状态、`pending` 的 `next_attempt_at` 与启用状态。见[设置与运行态操作](/operations/settings)与[日志与可观测性](/operations/observability)。 |

## 数据保留与删除

原始载荷和请求头会按保留期清理，但 Event、Delivery、attempt 和 oncall ping 行会保留，因此数据库文件通常不会随清理缩小。历史记录当前没有自动清理；删除告警源、路由或通知目标会连同关联投递一起级联删除，不能当作容量工具。保留边界与删除影响见[数据保留与 SQLite 容量](/operations/data-retention)和[备份与恢复](/operations/backup-restore)。

::: warning 单实例边界
默认运行形态是一个 Tocsin 进程与一个本地 SQLite 文件。它不是多副本集群；不要让多个实例共享同一个 SQLite 文件，也不要把数据库放在不适合 SQLite 的网络文件系统上。
:::

进程、SQLite、Worker 与外部依赖之间的故障边界见[单实例架构与故障边界](/operations/architecture#故障边界)；一次告警穿过进程与队列的简版路径见[一次告警穿过系统](/operations/architecture#一次告警穿过系统)。

更多：[告警源接入与生命周期](/guide/sources) · [事件检索与证据](/guide/events) · [路由规则与匹配](/guide/routes) · [通知目标参考](/integrations/destinations) · [投递检索、生命周期与重试](/operations/deliveries) · [告警静默与维护时段](/operations/suppressions) · [快速开始](/guide/quick-start)
