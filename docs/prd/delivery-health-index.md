# 投递健康聚合的覆盖索引

Q-279（第 128 轮质量车道 CONFIRMED，第 130 轮 EXPERT_PANEL 裁决）

## 问题

每次 `destinations.list` 都会调用 `destinationDeliveryHealth`
（`apps/console/src/server/destinations/destination.service.ts:78-91`），该查询对整张
`deliveries` 表做 `GROUP BY destination_id`；`state`、`finished_at`、`created_at` 只出现在
聚合表达式里，`since` 无法下推为 WHERE
（`apps/console/src/infra/sqlite/repositories/history/history.repository.ts:447-478`）。
`deliveries` 上只有 `(state, next_attempt_at)` 与 `event_id` 两个索引
（`apps/console/src/infra/sqlite/migrate/schema.ts:261-269`），因此每次打开目标列表都是
顺序全表扫描 + 临时 B 树。

`better-sqlite3` 是同步驱动，扫描期间阻塞单进程事件循环；投递行没有保留/清理实现，
表只会持续增长，所以这个常数开销会随部署时长放大。仓储里「history retention bounds the
table」的旧注释与代码不符（全仓没有 `DELETE FROM deliveries`）。

20 万行实测（项目驱动 better-sqlite3 13.0.3 / SQLite 3.53.4，sqlite3 CLI 3.54.0 复核）：

| 方案 | 查询计划 | 耗时 |
|---|---|---|
| 现状 | `SCAN deliveries` + `USE TEMP B-TREE FOR GROUP BY` | 0.07–0.08 s |
| 单列 `(destination_id)` | `SCAN deliveries USING INDEX`（逐行回表） | 0.08–0.16 s，不优于现状 |
| 四列覆盖索引 | `SCAN deliveries USING COVERING INDEX` | 0.02–0.03 s，约 3–4 倍 |

单列索引只提供分组顺序，`state` / `finished_at` / `created_at` 仍要逐行回表，实测可能比
全表扫描更慢。覆盖索引让扫描完全在索引内完成，并消除 `USE TEMP B-TREE FOR GROUP BY`；
首列 `destination_id` 同时服务 `ON DELETE CASCADE` 的外键查找
（`migrate/schema.ts:116-118`）。

## 用户故事

作为值班工程师，打开「通知目标」列表核对投递健康时，不应因为历史投递堆积而出现可感知
卡顿，更不应让一次列表查询阻塞告警接入与投递 worker。

## 范围

- 新增 forward-only 迁移 `0005_deliveries_destination_id_health`，用
  `CREATE INDEX IF NOT EXISTS` 建立
  `idx_deliveries_destination_id_health (destination_id, state, finished_at, created_at)`。
- fresh 数据库由 baseline builder（`migrate/schema.ts`）直接建立同一索引；旧库修复函数
  （`ensure-complete-schema.ts`）同步补齐；已部署且已记录 `0003` 的库由 `0005` 补齐。
- 修正 `destinationDeliveryHealth` 上方不成立的保留期注释。
- 迁移测试覆盖：索引列顺序、查询计划为 `USING COVERING INDEX` 且无 `TEMP B-TREE`、
  缺索引的旧库升级后行不丢、重复执行幂等。

## 非目标

- 不改查询、不改聚合口径、不改 24 小时失败窗口，也不改任何 DTO 或 UI。
- 不引入投递保留/清理策略：索引只降低常数，不改变表无限增长的事实。
- 不建单列 `(destination_id)` 索引（实测无收益）。
- 不改 `0001`–`0004` 已提交迁移的语义。

## 验收标准

1. `schema_migrations` 最终包含 `0005`；二次启动 `applied` 为空、`skipped` 含 `0005`。
2. `PRAGMA index_info("idx_deliveries_destination_id_health")` 依次返回
   `destination_id`、`state`、`finished_at`、`created_at`。
3. 健康聚合的 `EXPLAIN QUERY PLAN` 含
   `USING COVERING INDEX idx_deliveries_destination_id_health`，且不含 `TEMP B-TREE`。
4. 模拟「已记录 `0001`–`0004`、缺该索引」的库升级后，投递行原样保留。
5. `vp check`、`vp run -r test`、`vp run -r build` 全绿。

## 架构边界

- 只改 `apps/console/src/infra/sqlite/` 下的迁移、baseline、旧库修复与仓储注释，并新增迁移测试。
- 纯加法 DDL，在迁移事务内执行，失败自动回滚；无数据改写、无新依赖、无新服务。
- 发布后不能直接用旧镜像回滚（`assertNoUnknownAppliedMigrations` 会拒绝启动），
  需恢复升级前备份；升级与回滚说明见
  `docs/planning/decisions/delivery-health-index.md` 与
  `docs/release/backup-restore-upgrade.md`。
