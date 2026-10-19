# Alert Suppression 决策备忘：三条 Open Question 的拍板材料

状态：**已拍板并实现**（2026-10-12 拍板；2026-10-18 复核：E1–E3 主体已落地，suppression service、oRPC 与 UI 均在）。本文保留拍板材料与核实记录。
输入：`docs/prd/alert-suppression.md` §2.1 / §2.3 / §2.5 / §2.6 与 Open Questions；`docs/planning/next-round.md` §2.1 / §3
口径：本文每个结论都给出 `file:line`。与上述两份文档不一致的地方集中在第 5 节，请以代码为准。

## 一句话结论

三条 OQ 的推荐值是 **OQ1 不做 bypass；OQ2 强制 `ends_at` 非空；OQ3 v1 只做 UI 汇总、不发通知**——
其中 OQ1 与 OQ2 直接决定建表字段，必须在写 `0001_initial_schema.ts` 之前拍，否则已部署实例拿不到这次改动（理由见 5.2）。

## 三条决策一览

| # | 决定什么 | 推荐 | 选推荐值的代价 | 次优选项的代价 | 改 schema？ |
|---|---|---|---|---|---|
| OQ1 | 加急电话是否可绕过抑制 | **否，且 v1 不留开关** | 维护窗口期间的 P0 既不能自动叫醒，**手动呼叫也救不了**（被抑制的投递没有 `providerReference`） | 必须新增一条「呼叫说明」消息才有上下文；`suppressed` 从终态变成「有时可绕过」 | 不改列；但 `suppressed` 语义定稿为**终态** |
| OQ2 | `ends_at` 是否可空 | **不可空（有期限）** | 无法表达「不知道多久」；到期会自行失效，运维可能没注意到静默已结束 | 需要一个**当前不存在**的提醒通道，否则成为遗忘的黑洞 | **决定 `ends_at` 的可空性**（建表字段） |
| OQ3 | 窗口结束是否发摘要 | **只做 UI 汇总** | 存在「静默期盲区」，不主动告知 | 主动发通知无法走既有投递管线，需另造合成事件；且「N 条」定义未定 | 不改列；但 `suppressed` 入枚举会波及 `deliveryCounts` 投影 |

---

## OQ1：加急电话是否允许绕过抑制？

**推荐：不做 bypass（采纳 PRD 默认「不」），并且在 v1 明确不预留开关。** 但必须同时接受一个 PRD 没有写清的代价。

### PRD 的推理方向对，但理由说轻了

PRD §2.3（`docs/prd/alert-suppression.md:93`）的理由是「被抑制的卡片不存在，绕过会打出一条没有上下文的电话」。这成立，但**真正的拦路石是结构性的，不是文案性的**：

- 自动加急的唯一触发点是投递**成功分支**里的注入调用（`apps/console/src/server/deliveries/delivery-execution.ts:94,104`）。被抑制的投递根本进不了 `execute()`：worker 只认领 `state = 'pending'` 的行（`apps/console/src/infra/sqlite/repositories/delivery/delivery.repository.ts:190`），而抑制后状态是 `suppressed`，所以**永远走不到** `:104`。
- 更硬的一层：建 ping 的入参把 `providerReference` 声明为**不可空**（`apps/console/src/infra/sqlite/repositories/oncall/oncall.interface.ts:64`）；执行时 `messageId = claimed.ping.providerReference?.value`，取不到就直接 `not_retryable` 失败（`apps/console/src/server/oncall/oncall-execution.ts:74,77-81`）。

**结论：bypass 不是一个「策略开关」，而是一条新的发送路径。** 选「不」时省下的正是这条路径。

### 选推荐值的真实代价（这是需要 owner 签字的地方）

1. **P0 在维护窗口期间无法通过 Tocsin 叫醒任何人。** 这违反直觉，但确实是本 PRD 的语义：抑制 = 「这一段我知道，别通知我」。
2. **手动呼叫也救不了 —— PRD 没有说这一条。** `buzzDelivery` 同样要求投递带 `providerReference`，取不到直接抛 `DomainValidationError`（`apps/console/src/server/oncall/oncall.service.ts:62-67`）。被抑制的投递没有这个句柄，所以对静默告警**点「加急呼叫」也会被拒**。这不是 bug，但它是「不做 bypass」的真正成本：**v1 里被抑制的告警没有任何呼叫出口，自动和手动都没有。**
3. 因此 UI 范围预览（`urgentAutoEnabled`，`packages/core/src/destination/destination.ts:52,194`）当前写的「会让 X 个目标不打电话」，应升级为「**这一段里这些目标的告警将无法用任何 Tocsin 手段叫醒**」。护栏文案要跟着改，否则它在误导人。

### 选「做 bypass」的代价

- **必须有上下文，否则呼叫无意义。** 飞书电话语音固定为「[成员名] 给你发了一条加急消息」（`docs/adr/0009-oncall-feishu-urgent.md:25`），唯一上下文是那条卡片；卡片被抑制时不存在，所以要绕过就必须**先补发一条消息再呼叫**——一个独立切片的工作量。
- **`suppressed` 语义分裂。** 现在「被抑制 ⇒ 永不执行 ⇒ 无 `providerReference`」是干净因果链；允许绕过意味着要额外区分「即使被抑制也允许呼叫」，与 PRD §2.1「永不发送」冲突。
- **「单独权限」今天不存在。** 审计有先例（`apps/console/src/server/orpc/features/operations/router.ts:45` 写 `currentUser.id`），但**权限没有**：所有 dashboard 过程共用同一守卫，`isDashboardAdminRole` 只区分 `owner || admin`（`apps/console/src/server/runtime/request-context.ts:108-110`），没有更细粒度（角色枚举见 `apps/console/src/infra/sqlite/migrate/better-auth.schema.ts:15-17`）。所以「单独权限」= 新造权限概念，PRD 低估了它。

### 相对便宜的替代（推荐一并拍）

不做 bypass，但**把「显式手动叫醒」明确为逃生口**：P0 的告警只要**正常投递成功一次**，运维就能在投递详情页手动 buzz（`delivery-buzz-button.tsx`，前提 `providerReference !== null`）。这不需要新 schema 或新权限概念。代价有二：(a) 窗口**期间**连这条也不通（见上）；(b) 只对**成功投递过**的告警成立。

**注意：事件补投救不了被静默的告警。** `listExistingTargetsForEvent` 按 `event_id` 取全部投递行且**不过滤 state**（`delivery.repository.ts:443-448`），`enqueueForEvent` 命中「已存在的 `(route, destination)`」即跳过（`:84-87`）。所以某条 Event 一旦产生过 `suppressed` 投递，它的这个目标就**永远算「已存在」**，事后补投也不会新建投递（UI 显示 `newDeliveryCount = 0`，`event-replay-action.tsx:46`）——即抑制会永久关闭该事件在该目标上的补投出口，且删掉规则也不会解除（`suppressed` 行按 §2.5 必须保留作审计）。若 owner 认为补投应当能救回被静默的告警，这是**必须在 E1 里显式决定的语义**（让补投忽略 `suppressed` 行），而不是默认行为。

### 证据

`delivery-execution.ts:94,104` · `oncall.interface.ts:64` · `oncall-execution.ts:74,77-81` · `oncall.service.ts:62-67` · `request-context.ts:108-110` · `destination.service.ts:175-185`（destination「测试」直接调 `send`，产生真实消息但**不落投递行**，因此不可呼叫——逃生口不能复用该路径）· ADR 0009 `:25`

---

## OQ2：`endsAt` 允许为空吗？

**推荐：强制有期限，`ends_at text not null`。** 这是 PRD §2.6 草案已经写下的形态
（`docs/prd/alert-suppression.md` §2.6 `ends_at text not null`），OQ2 的正确答案是**确认它**，而不是推翻它。

### 为什么是「强制有期限」而不是「允许无期限 + 强提醒」

PRD 把取舍写成「强制有期限但可能提前结束」对「允许无期限但需要更强提醒」。**这个对称是假的**，因为后半边要建的东西今天完全不存在：

- 仓库里只有两个定时器，都是队列泵，不是通知器：`ensureDeliveryWorkerRunner()` 与 `ensureOncallWorkerRunner()`
  （`apps/console/src/server/runtime/container.ts:181-182`），两者都是 `setInterval` 驱动的 worker runner
  （`apps/console/src/server/runtime/delivery-worker-runner.ts:107`）。
- **没有任何提醒/摘要/邮件通道**：`AppSettings` 只有 `locale / timeZone / rawPayloadRetentionDays`
  （`packages/core/src/configuration/configuration-results.ts:7-11`），没有通知类设置；
  出站消息的唯一通路是 Destination→Delivery→Event。
- 也就是说，「别忘了它」的提醒在 v1 只能靠 **UI 列表置顶 + 状态徽章**（`scheduled/active/expired/disabled` 投影）。
  这已经够用：`expired` 是自动投影，且 PRD §2.4 明确「到期不需要人手动关闭」。

### 选推荐值的代价

- **无法表达「先静默着，不知道多久」。** 变通是填一个很长的期限；到期后静默**会自己失效**，
  于是出现与「黑洞」相反的事故：**运维以为还静默着，其实告警已经在发了**。
  这是选「强制有期限」换取的主要风险，必须用 UI 表达清楚（到期时间要靠前展示，而不是埋在表单第 4 行）。
- 一句话：**推荐值把风险从「静默遗忘的黑洞」换成「静默静默地结束」。** 后者可审计、可自愈，前者不可。

### 选「允许为空」的代价

- 需要提醒通道，而它不存在（见上），因此这**不是**一个字段可选性决定，而是一个新切片。
- 还会污染状态投影：`null` 让 `expired` 无法由时间推导，必须额外表达「永久」，`enabled && startsAt <= now < endsAt` 要拆成两支。
- 若不建提醒通道而仍允许为空，PRD 已写出后果：「会被遗忘的静默黑洞」——**没有任何机制会把它叫醒**。

### schema 影响（这条必须现在定）

- **推荐值**：`suppressions.ends_at text not null`，与 `starts_at` 对称；不加额外列。
- **次优值**：`ends_at text null`，生效条件拆两支；同时**必须**再排一个提醒切片，否则等于埋雷。
- 顺带一条不依赖本 OQ 的字段：`enabled` 沿用既有风格 `integer not null defaultTo(1)` + `CHECK enabled IN (0,1)`（`apps/console/src/infra/sqlite/migrate/schema.ts:90,95`），PRD §2.6 已对齐，无需再议。

### 证据

`container.ts:181-182` 与 `delivery-worker-runner.ts:107`（只有两个队列泵，无提醒通道）· `configuration-results.ts:7-11`（设置里无通知项）· `schema.ts:90,95` · PRD §2.2 生效条件、§2.4 到期自动失效

---

## OQ3：窗口结束时要不要发「维护期间被静默 N 条告警」的摘要？

**推荐：v1 只做 UI 汇总视图，不发通知。** 选它不是因为它最便宜，而是因为「主动发通知」比 PRD 估的贵得多。

### 为什么「主动发通知」比 PRD 说的更贵

PRD OQ3 说摘要是「跨投递聚合 + 一类新的通知」。核实后第一条成立，第二条**比「一类新通知」更重**：

- 既有出站管线的渲染入参要求 `eventId` 与 `normalizedEvent` 都必填
  （`packages/destinations/src/types.ts:33-41`，`send(input: DestinationRenderInput, …)`）。
  **摘要没有对应的告警事件**，因此要么伪造一个合成 Event（脏数据进入「上游发了什么」的事实表，
  与 PRD §2.1「Event 是原始事实」冲突），要么给 adapter 家族开一条不渲染事件的新通路。
- 两条路都不是「复用现有 destination 通道」——PRD 括注里的乐观判断需要修正。

### 为什么「UI 汇总」也不是零成本

选它之前要知道代价在哪：`suppressed` 进 `DeliveryStateSchema`（`packages/core/src/delivery/delivery.ts:5`）后，
`deliveryCounts` 会被连带打破，且**其中一半是编译器抓不到的**：

- 编译期会响的：`deliveryCounts: z.record(DeliveryStateSchema, …)`（`packages/api/src/schemas/operations.ts:43`）。
  Zod 4 的 enum-keyed record 是**穷尽**的（实测：缺键校验失败；旧 4 键形态在枚举扩张后同样失败），
  因此 `apps/console/src/infra/sqlite/repositories/history/history.repository.ts:109-113` 的字面量必须先补键。
  这个 schema 的注释已经写明「always emits all four delivery states」（`:42`）。
- **编译期不会响的**：`EventDeliveryCountsCell` 的合计是显式四则相加
  （`apps/console/src/features/events/ui/event-delivery-counts-cell.tsx:15`），没有任何穷尽约束。
  加第五个键后**编译通过**，但被抑制的投递会**从事件列表的合计里消失**——正好是 PRD 故事 25
  「静默必须与失败明确区分、不能被误读」想防的事故。这条要补测试，不是靠 AC 里那句「零回归」能兜住的。
- 需要同步的既有断言：`apps/console/src/features/events/ui/events-table.test.tsx:51,84`、
  `apps/console/src/infra/sqlite/store.test.ts:323,329`；SQL 侧要加一个 `SUM(... state = 'suppressed')`；
  筛选器的 `DeliveryStateSchema` 联合（`apps/console/src/features/operations/model/operation-search.ts:19`）随之扩张；
  i18n 两侧必须同时加键，否则 `apps/console/src/i18n/messages.test.ts:8-9` 的键名 parity 测试会红。

### 「N 条」的定义缺口（无论选哪档都要定）

抑制的匹配单位是 `(event, route, destination)`，所以「N 条」最自然的读法是**被抑制的投递数**，
它会把同一个告警在多个 route/目标上重复计数。若 owner 想表达的是「N 个告警」，需要用 `fingerprint` 去重。
建议在 UI 文案里写死口径（「静默了 N 条投递」），避免月度复盘时数不上。

### 证据

`types.ts:33-41,117-119`（渲染入参必需 event）· `operations.ts:42-43`（穷尽 record 与注释）·
`history.repository.ts:109-113`（四键字面量）· `event-delivery-counts-cell.tsx:15`（显式四则相加，无兜底）·
`delivery.ts:5`（枚举）· `messages.test.ts:8-9`（i18n 键 parity）· `schema.ts:133`（DB CHECK 需同步加值）

---

## 5. 核实结果：PRD 与规划备忘中不成立的说法

拍板人应该知道下列三条，它们会影响「先做什么」的判断。

### 5.1 规划备忘的 S0 安全缺口**已经修好了**，备忘 §1.1 / §5 的判断过期

`docs/planning/next-round.md` §1.1 与 §5 主张 `config-portability.ts:286` 用嵌套三元 + `: []` 兜底、无 TS 守卫，
因此新增 kind 会静默漏脱敏，并据此把「修它」排为全仓第一优先级。**当前代码不是这样：**

- 该函数现在是 `destinationSecretPaths`（`apps/console/src/server/configuration/config-portability.ts:287`），
  委托给 `destinationKindSecretPaths(kind)`（`:311`），后者是 **exhaustive switch**，
  `default: { const _exhaustive: never = kind; return _exhaustive; }`（`:322-323`）。
- 更关键：紧邻的文档注释（`:306-309`）**恰好写出了备忘担心的那条风险**——
  「a new destination kind that is not listed here fails typecheck … which would export credentials such as
  `url` / `endpointUrl` in plaintext — keys the `isSensitiveKey` denylist does not cover」。修复已落地且有意图说明。
- 因此备忘 §5「如果只能做一件事」这件事**已经做完了**；它的 `_exhaustive` 计数也过期了：
  全仓现在是 **4** 处（`destination.helpers.ts:268,286`、`config-portability.ts:322`、`source-provider-icon.tsx:36`），
  不是备忘写的「仅两处命中」。

**测试缺口已闭环**：`configuration.integration.test.ts:1283` 已以
`it.each(registeredDestinationKinds)` 覆盖每个 destination kind 的导出脱敏。残留仅是 SEC-2：
用例从 registry 派生 kind，而不是 `DestinationKindSchema.options`；这不构成实际泄漏路径，按测试
完备性处理即可，**不要**再按「潜伏的凭据泄露」优先级排序。

### 5.2 「表结构落地再改要付迁移成本」——实际比这更严重

备忘 §2.1 说表结构一旦落地再改要付迁移成本。核实后更准确的说法是：**已部署实例根本拿不到这次改动。**

- 2026-10-18 复核：当前 migration plan 已不是“只有一步基线”。`0001_initial_schema` 是全新库
  baseline，`0002_suppressions` 是抑制表的 forward step，`0003_complete_legacy_schema` 对旧库做
  幂等 repair。
- 迁移执行器仍按版本号跳过已应用步骤（`apps/console/src/infra/sqlite/migrate/runner.ts:26-30`），
  漂移检测只校验「已应用版本是否都在计划里」这一件事（`:162-171`），不校验列结构。
- 合并这两条：**修改已提交的 migration 对已部署实例仍然无效**；但修复方式不再是“清库”，而是新增
  forward step。这也是本 PRD 的 `0002_suppressions` 选择新建表、而不是回改 `0001` 的原因。
- 附带影响：`suppressed` 进 `DeliveryStateSchema` 同样会撞上这条（DB CHECK 在 `schema.ts:133` 是内联字面量）。

### 5.3 PRD 两处内部不一致

- **§2.6 已经替 OQ2 做了决定。** 草案写 `ends_at text not null`，而 OQ2 却在问「允不允许为空」。
  两者不能并存：拍板人要么确认草案（推荐），要么改草案。
- **§2.5 的「零回归」AC 不够。** AC 只写「`DeliveryStateSchema` 扩展后既有四个状态零回归」，未覆盖本文 OQ3 一节列出的三处连带面（`deliveryCounts` 字面量、`EventDeliveryCountsCell` 合计、i18n 键 parity）。其中 `EventDeliveryCountsCell` 的漏计是**编译不过不报**的静默回归，恰好是 PRD 最在意的那类问题（story 25）。建议把这三条写进 E1 的验收清单。

---

## 拍板后即刻解锁的动作（不含实现）

1. **OQ2 一拍板**，E1 的建表形态即冻结：`ends_at` 可空性、`suppressions` 是否多一列、以及 `suppressed` 进 CHECK 的字面量（`schema.ts:133`）。这是全仓唯一一处「改晚了要清库」的地方。
2. **OQ1 一拍板**，`suppressed` 的语义即冻结为「终态、无 `providerReference`、无呼叫出口」。同时把本文 OQ1 一节第 3 点的护栏文案改准（当前措辞低估了后果），该文案交 `designer`，与 PRD 故事 19 同一屏。
3. **OQ3 一拍板**，E3 的工作量才是可估的：选「UI 汇总」= 一条读查询 + 补三处投影测试；选「发通知」= 独立切片（需先解决「合成事件 vs 新出参通路」这个架构选择）。
4. 三条都拍完之前，`docs/planning/next-round.md` §3 的步骤 5（E1→E2→E3）不应开工；步骤 1–4 与之无关，可照常推进。
