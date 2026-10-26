# 加急呼叫的领取归属

- 状态：已决（2026-10-26，第 115 轮）
- 关联：backlog `Q-236`；ADR 0009 决定 5；上游决策
  `docs/planning/decisions/oncall-dispatch-intent.md`（Q-235）
- 决策方式：EXPERT_PANEL 三位专家独立评审（安全与可靠性 / 产品与运维 / 独立评估者）

## 问题

Q-235 的拨号意图标记只能保护「已经开始拨号」的 ping。整批领取后尚未轮到的 ping
在 5 分钟 stale 窗口后仍会被另一轮 reclaim 判成「从未拨出」并重新排期；原 worker
到达它时没有归属校验，照样写标记并拨号。手工 buzz 的 `dispatchNow` 每次新建 worker
直接 `runOnce`，绕过周期 runner 的 single-flight，是进程内唯一但真实的并发入口。

三位专家独立核实后均判定 **CONFIRMED**，并一致认为这是 P0：重复电话不可逆，
且 Tocsin 侧几乎不可观测（`attempts ≥ 2 + fired + 空 last_error` 与正常重试成功
无法区分）。

专家还纠正了 Q-235 的一个实现事实：`markDispatchStarted` 写入的是 `runOnce`
开头的批次时刻，不是拨号时刻，所以它并没有把 stale 窗口锚在拨号开始。
这让「已经在通话的 ping 被下一轮 reclaim 判成 stale」也成立。

## 三位专家意见

### 安全与可靠性专家

- 可达性：默认 batch 10、单次呼叫超时 10s（上限 30s）、单 ping 最多 3 次 HTTP；
  `batch ≥ 16` 或调大超时即可稳定超过 300s stale 窗口。
- `attempt_count` 已是单调 fencing token（`claimNext` 每次 +1），无需迁移即可
  做归属校验。
- 推荐 **C（归属守卫）+ A（复用 runner single-flight）**；反对「不修」，
  认为 B（滚动领取）单独使用依赖隐式不变量（单次执行 < stale），不宜单用。
- 标记写失败仍须照拨，守住 Q-225。

### 产品与运维专家

- 默认配置下概率低，但一旦发生是不可逆 P0；事后无法自证「没有重复」。
- buzz 的 toast 文案是「已发起」而不是「已接通」（`zh-Hans.json:210`），
  A 不削弱真实承诺；runner 忙时 mutation 立即返回，反而比等待整批更符合运维预期。
- 推荐 **C+A**；不改 UI、不改状态机、无功勋徽标。
- 明确 charter：无新服务、无新依赖、无迁移、不碰投递/路由/auth 语义。

### 独立评估者

- 修正「重复领取」的说法：`claimNext` 的条件更新已避免重复领取，真正的缺陷是
  旧 worker 仍持有内存中的 claimed 对象并照拨。
- 反向同样成立：`dispatchNow` 的慢批次会被每 5s 一轮的周期 runner 重排。
- 现有测试恰好掩盖缺陷：reclaim 用例都假设原 owner 已死；runner 用例只证明
  单实例 single-flight；没有两个 `runOnce` 交错的用例。
- 推荐 **C 必做，A 作补充，B 不做**；要求新增 `superseded` outcome（不写库、
  不计数），并给出两个确定性用例的断言。

## 分歧与裁决

三位专家一致选择 **C+A**，无分歧。B 被判为与 C 冗余，不实施。

## 最终选择

1. `markDispatchStarted` 增加 `expectedAttemptCount`，SQL 条件为
   `id = ? AND state = 'running' AND attempt_count = ?`；0 行返回 `null`。
2. 执行器在 `urgency.ping` 前调用守卫；返回 `null` 时返回 `superseded`，
   不拨号、不写库、不计数；抛错时照常拨号（Q-225）。
3. 标记的 `startedAt` 使用执行器自己的时钟，锚定拨号时刻。
4. `container.createOncallService` 的 `dispatchNow` 改为
   `ensureOncallWorkerRunner().runNow()`，与周期 runner 共享 single-flight。

## 理由

- 归属校验把「这次 attempt 还有没有资格拨号」变成一次原子 SQL 判定，
  与并发来源、进程数、HMR 多实例无关，不依赖调用方自觉。
- 时钟修正让 stale 窗口真正从拨号开始计算，而不是从批次领取开始。
- single-flight 复用消除进程内唯一的第二并发源，属于最小装配改动。
- 全部为纯代码改动：无迁移、无数据回填、无 DTO 变化；回滚只需 revert。

## 回滚方式

- revert 提交即可；无 schema 变更，镜像回滚不涉及 `schema_migrations`。
- 已落 `fired` / `failed` 的行不需要清理；旧代码只 claim `scheduled`。
- 回滚后手工 buzz 恢复为「每次新建 worker」，最多即时派发，不会更慢。

## 残留风险

- 归属守卫写失败时（磁盘满 / 只读挂载）退化为 Q-235 之前的行为：极端故障下
  仍可能重复拨号。这是「呼叫不得依赖记账」的必然代价。
- 多副本部署绕过进程内 single-flight；归属校验仍然生效，因此不会重复拨号，
  但会多一次无谓的 reclaim。
- `markFired` / `markFailed` 仍无归属守卫。失去归属的 worker 不再拨号，
  因此不会再写这两个状态；只有在守卫成功后的 5 分钟窗口内才可能被 reclaim，
  而单次呼叫被超时上界约束在 1 分钟内。
