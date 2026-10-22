# Q-23 + Q-37：dedupe 窗口谓词与有界清理

- 决策日期：2026-10-23（第 83 轮）
- 事项：投递与加急去重键的存在性判断没有 `created_at` 窗口谓词，清理是无界
  `DELETE` 且位于每次 enqueue 的写事务内。
- 状态：**已实施**（PR #375，2026-10-23；delivery 与 oncall 同 PR，按下方最终选择执行）。

## 背景

- 投递：`apps/console/src/infra/sqlite/repositories/delivery/delivery.helpers.ts:85-109`
  的 `reserveDedupeKey` 只按四列主键查询，`pruneDedupeKeys` 无界删除；
  `delivery.repository.ts:101` 在每次 `enqueueForEvent` 的写事务内调用。
- 加急：`apps/console/src/infra/sqlite/repositories/oncall/oncall.repository.ts:33-53`
  同构，且每个 receiver 一次独立事务。
- 表主键不含 `created_at`：`migrate/schema.ts:179-184`（投递）、`:235-239`（加急）；
  插入是裸 `INSERT`。
- `created_at` 索引在全新库由 0001 创建（`migrate/schema.ts:274-278,289-293`），
  但前向修复 `ensure-complete-schema.ts:231-247` 只补了加急那条。

## 三位专家意见

### 安全与可靠性专家

- 推荐「谓词 + 条件替换 + 有界批」三件套同 PR，delivery 与 oncall 同改；批大小 500。
- 窗口谓词必须用 `>=`，与现有 prune 的 `<` 严格互补；命中已有行时**不得**刷新
  `created_at`，否则固定窗口变滑动窗口。
- 关键失效：只加谓词、不做条件替换时，窗口外旧行仍在表内，插入会撞主键；
  投递路径回滚整个 webhook 事务（`intake.service.ts:109-143`），自动加急路径
  异常被吞（`delivery-execution.ts:126-132`），造成静默漏呼。
- 建议不要在本轮补 `ensure-complete-schema` 的索引，以保持零迁移的可逆性。

### 产品与运维专家

- 同样要求三件套，且指出「没有 upsert 的两步方案应被否决」。
- 批大小 100，理由是与 raw payload 先例一致（`intake.helpers.ts:30`）。
- 运维语义：窗口为到达时间起算的固定窗口；`>=` 保证「第 5 分钟整仍算窗口内」，
  窗口外必投。重复投递与漏投递中，漏投更严重，本次修复把「窗口外必投」从
  无界 prune 的副作用升级为显式不变量。
- 同 PR 需更新 `route-match-gaps.ts:147-148` 与
  `docs/prd/route-explain-delivery-gap.md:63` 中「超过窗口必然被 prune」的注释。

### 独立评估者

- 用仓库自带 better-sqlite3 在 `:memory:` 复现了「只做两步」的主键冲突。
- 最小改动集：谓词 + UPSERT + 有界 rowid 子查询删除；oncall 同构；新增仓库级
  判别性测试（窗口外旧 key 不再 dedupe、有界批只删一批、最旧优先、oncall 同构）。
- 额外发现：老库可能缺 `idx_delivery_dedupe_created_at`，有界批只约束删除行数、
  不约束扫描成本；建议新增 forward-only `0004` 迁移补索引。
- 反对把 prune 移出写事务、反对把 `created_at` 加入主键。

## 最终选择

采用**三步修复**，delivery 与 oncall 同一 PR：

1. 存在性判断加 `created_at >= windowStartsAt`；命中即返回，不刷新 `created_at`。
2. 未命中时执行 UPSERT（`onConflict` 覆盖 `created_at` 与 `first_event_id` /
   `first_ping_id`）。窗口化 SELECT 与插入在同一事务内，因此唯一可能的冲突行必然是
   窗口外旧行，覆盖是正确语义。
3. 清理改为有界批：`rowid IN (SELECT rowid … WHERE created_at < ? ORDER BY created_at LIMIT ?)`，
   批大小 **100**，保留在 enqueue 写事务内、且在判定之前。

**分歧裁决：**

- 批大小 100 vs 500：取 **100**。更小的单次写事务是更保守的选择，且与
  `RAW_PAYLOAD_PRUNE_BATCH_SIZE = 100` 一致；窗口谓词生效后，未及时清理的旧行
  不再影响正确性，只影响磁盘上限。
- `0004` 增量索引：本轮**不纳入**。三位专家中评估者建议补、安全专家建议不补、
  产品专家未表态，按「分歧取最保守且可逆」暂缓。有界批已消除无界删除；
  老库上的扫描成本受窗口内行数约束，可接受。另立 **Q-224** 跟踪，下一轮单独
  评估是否补 forward-only 迁移。

## 验收标准

1. 窗口内重复事件仍 dedupe，`first_event_id` 指向首事件（既有 `store.test.ts` 用例）。
2. `created_at == windowStartsAt` 仍抑制；`windowStartsAt - 1ms` 新建投递。
3. 窗口内重复不刷新 `created_at`；窗口外重投新建投递。
4. **核心回归**：窗口外旧 key 未被 prune 触及（有界批未轮到）时，重投必须成功、
   不抛主键冲突，且 key 行的 `created_at` / `first_event_id` 已刷新。
5. 预置 250 条过期 key，一次 enqueue 只删 100 条，且优先删除最旧的行。
6. oncall 同构：窗口外再次加急成功创建 ping，窗口内仍提示已呼叫。
7. `replay`（`dedupeByIdempotency: false`）不受影响。
8. `vp check`、`vp run -r test`、`vp run -r build` 全绿。

## 回滚

- 纯代码改动、无 schema 变更；单个 PR revert 即可。
- **不可只回滚谓词而保留有界批**（会复活主键冲突），也不可只保留谓词而回滚
  UPSERT。回滚必须整 PR 一起。
- 回滚后第一次 enqueue 的无界 prune 会清掉残留旧行，无需数据修复。
