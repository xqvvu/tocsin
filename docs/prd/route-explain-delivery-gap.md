# Route Explain 切片 B：投递缺口解释的「可解释边界」

状态：**已实现（2026-10-18 复核）**
输入：`docs/research/route-authoring-current-state.md` §4.2 / §4.3 / 候选切片 B；`docs/planning/next-round.md` §2.4
口径：每个结论给出 `file:line`。**与调研文档不一致之处集中在第 4 节，请以代码为准。**
依赖：切片 A 已合并（`1268cfa`），本切片复用同一块证据展示位。

## 一句话结论

「命中但没投递」的原因分成两类：**能从已有记录复原的**（route 已禁用 / 目标已禁用 / 目标已删除 / 投递已落后 / route 已删除）和**复原不了的**（幂等去重 —— 证据在，但只留 5 分钟）。**前者照实写，后者必须明说「原因无法从保留的记录复原」，绝不能用推断冒充事实**——在信任线上造假比不做更糟。

## 1. 本切片的全部风险是「过度承诺」

`docs/planning/next-round.md` §2.4 已经点明：不应为了 B 去改 `enqueueForEvent` 的落库行为，因为那会把一片「只读解释」升级成「写入变更」。采纳这个判断，并由此推出一条设计纪律：

**UI 只能陈述它真的查到的东西。** 「命中」是快照事实，「没有投递行」是可查事实，但两者之间的**因果**通常查不到。把查不到的因果写成因果，就是本切片唯一可能造成的伤害 —— 而且它伤的是 `next-round.md` §3 排在「安全」之后第二位的「用户信任」。

## 2. 原因分类总表

| # | 原因 | 可解释？ | 依据 | 影响粒度 |
|---|---|---|---|---|
| R1 | route 当前已禁用 | ✅ | `delivery.repository.ts:192`（`claimNext` 要求 `routes.enabled = 1`） | route |
| R2 | 目标当前已禁用 | ✅ | `delivery.repository.ts:191`（要求 `destinations.enabled = 1`） | (route, destination) |
| R3 | 目标已被删除 | ✅ | `deliveries.destination_id` 外键 `onDelete("cascade")`，`schema.ts:116` | (route, destination) |
| R4 | 投递仍落后（未到 `next_attempt_at`，或已达 `max_attempts`） | ✅ | `delivery.repository.ts:195-199` | 投递行 |
| R5 | route 已被删除 | ✅（本切片新增） | `deliveries.route_id` 外键 `onDelete("cascade")`，`schema.ts:119`；`route.repository.ts:166-169` 直接删路由 | route |
| R6 | 幂等去重（同 source/key/route/destination 已投过） | ⚠️ 有窗口，**可能已过期** | 见 §3 | (route, destination) |
| R7 | 该 (route, destination) 已存在投递（`skippedExisting`） | ✅ 等价于「有投递行」 | `delivery.repository.ts:84-87`、`listExistingTargetsForEvent` `:440-455` | (route, destination) |
| R8 | `suppressed`（抑制）—— 已实现，且不进入缺口分类 | ✅ | `packages/core/src/delivery/delivery.ts:5-11,33-35`；`delivery.repository.ts` 的抑制入队/认领分支 | (route, destination) |

**关键观察：R1–R4、R7 全部来自「读 `deliveries` 表 + 读 `routes`/`destinations` 现状」，是纯读路径。本切片不需要改 `enqueueForEvent`、不需要新表、不需要迁移。**

## 2.1 为什么「route 已删除」必须单列（调研文档没写）

`deliveries.route_id` 的外键是 `onDelete("cascade")`（`schema.ts:119`），而 `RouteRepository.delete` 只是裸删（`route.repository.ts:166-169`）。**删掉一条 route，它的投递行一起消失**；但 `events.route_matches_json` 是接入时的快照，**仍然写着这条 route 当时命中了**。

结果就是最容易让人不相信系统的那种画面：快照说「命中」，投递列表空空，而 route 在路由页已经不存在了。这不是 R1（禁用），禁用会保留投递行；**R5 是被删干净了**，所以它必须靠「route id 在快照里、但 `routes` 表已无此 id」来判定，而不是靠投递行。

## 3. 可解释原因的恢复方式

判定顺序（按顺序短路，避免给出矛盾结论）：

1. **快照里有该 routeId、`routes` 表查不到** → **R5**（route 已删除）。依据：`routes.list()` 与快照 `routeId` 做差集。
2. **route 存在但 `enabled = false`** → **R1**。依据：`routes.enabled = 0`（`schema.ts:102`）。
3. **该 (route, destination) 有投递行** → 不是缺口，转去展示投递自身状态（R4/R7）。依据：`deliveries` 按 `event_id` + `route_id` join（`listExistingTargetsForEvent` `:440-455` 的同一口径）。
4. **目标 `enabled = false`** → **R2**；**目标已不存在** → **R3**。依据：`destinations.enabled`（`delivery.repository.ts:191`）。

这四条都是「读现状 + 读历史行」，**均可在 `getEventDetail` 的读取侧完成**（该函数当前已在 join `deliveries` × `destinations` × `routes`，见 `history.repository.ts:148-151`）—— 本切片只需扩展它的返回结构，不需要新的查询通路。

## 4. 唯一真正不可复原的：幂等去重（R6）

### 调研文档的说法过期了，但结论仍然成立

`route-authoring-current-state.md` §4.3 说「被去重 / 被跳过的证据 —— **不存在持久化字段**（仅 API 返回值）」。**这句话对 `skippedExisting` 成立，对「去重」不准确：**

- 去重证据**确实落库**：`delivery_dedupe_keys` 表持久化了 `source_id` / `idempotency_key` / `route_id` / `destination_id` / `first_event_id` / `created_at`（`schema.ts:164-183`），且 `reserveDedupeKey` 在命中时**回传已存在的行**（含 `first_event_id`），不只是回传计数（`delivery.helpers.ts:103-141`）。
- **但它不会被立即清掉，只是不再生效**：每次 `enqueueForEvent` 都先跑 `pruneDedupeKeys(context.db, input.dedupeWindowStartsAt)`（`delivery.repository.ts:101`），该函数按 `created_at` 最旧优先删除**一个有界批次**（`DEDUPE_PRUNE_BATCH_SIZE = 100`，`delivery.helpers.ts:95-163`）；窗口外的旧行要等后续 enqueue 逐批清理才消失。
- 窗口只有 **5 分钟**：`dedupeWindowMs = options.dedupeWindowMs ?? 5 * 60 * 1000`（`intake.service.ts:54`），窗口起点 = `receivedAt - dedupeWindowMs`（`:121-122`）。

**结论：去重证据存在，窗口外不再生效，但留存时间不确定（取决于后续 enqueue 的清理进度）。** 因此 R6 的可解释性是**时间相关的**：

- 去重发生时（窗口内）打开详情 → 可以指出「这条投递被去重，首次由 `<first_event_id>` 触发」（该字段可点击跳转，是很有价值的线索）。
- 超过窗口 → 该行不再抑制新投递（存在性判断带 `created_at >= windowStartsAt`，`delivery.helpers.ts:103-133`），并会在后续 enqueue 中有界清理；**行被清掉之后必须承认查不到**。查得到时所述事实仍然为真，只是不再是「此刻仍在窗口内」的证据。

### 因此 R6 的措辞必须分三态，不能合成一句话

| 态 | 判定 | en-US | zh-Hans |
|---|---|---|---|
| 查得到 | `delivery_dedupe_keys` 命中该 (route, destination) | `No delivery was created: an identical alert was already delivered for this route and destination, first triggered by event {eventId}` | `未创建投递：同一告警已就该路由与目标投递过，首次由事件 {eventId} 触发` |
| 查不到 | 无投递行、非 R1–R5、快照显示命中 | `No delivery row exists for this route, and the reason cannot be reconstructed from the records Tocsin keeps` | `该路由没有投递记录，且原因无法从 Tocsin 保留的记录中复原` |
| 明确适用 | route/目标禁用等 | 按 R1–R5 各自文案 | 同 |

「查不到」这条**故意不猜**。它还要附一行提示解释为什么不猜：

| en-US | zh-Hans |
|---|---|
| `Dedupe evidence is cleared in batches after intake, so older gaps cannot always be explained` | `去重证据在接入后会被分批清理，更早的缺口不一定还能解释` |

## 5. UI 落点

- **承载面**：扩展切片 A 的 `event-detail-route-matches-table.tsx`，而不是新开一个页签。理由：A 已经在这一行里渲染 checks 与来源标注，B 是同一问题的下一个维度（「命中了，然后呢」）；另开页签会让运维在两处之间来回对照。
- **粒度**：R1/R5 是 **route 级**（在 route 行上标注）；R2/R3/R4/R6/R7 是 **(route, destination) 级** —— 必须能落到具体目标，因为一条 route 命中多个目标时，常见情况是「一个禁用、一个正常」。
- **与 A 的一致性**：沿用 A 的 `routeMatchesProvenance`。若快照来源是 `recomputed`（无接入快照、读时按当前路由重算），则「命中」本身就不是当时真相，**B 的解释必须标注其前提同样不牢**——不能给人「这是当时的事实」的错觉。
- R6「查得到」态里的 `first_event_id` 应可点击跳转到该事件详情，这是本切片唯一新增的导航动作。

## 6. 本切片明确不承诺

1. **不承诺解释每一条缺口。** 去重证据被清理后的缺口就是解释不了，UI 会这么说。
2. **不改写入路径。** `enqueueForEvent` 不新增落库字段，`delivered`/`deduped`/`skippedExisting` 的返回值语义不变。
3. **不加表、不做迁移。** 本切片仍不加表；当前 migration plan 已有 `0001`–`0003`，但本切片的解释数据全部来自既有表。
4. **抑制不进入本表。** 抑制已实现为投递状态 `suppressed`；被抑制的投递是真实投递行，因此 `routeMatchGaps` 不会把它算作「命中但未投递」的缺口。
5. **不承诺 `suppressed` 之后补投能救回。** 已核实 `listExistingTargetsForEvent` 不过滤 state（`delivery.repository.ts:446-447`），所以抑制行会让该目标永远算「已存在」；这是抑制 PRD 的语义决定（见决策备忘 OQ1），不是本切片能修的。
