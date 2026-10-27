# 决策：为投递健康聚合建立四列覆盖索引

日期：2026-10-27（第 130 轮）
事项：Q-279
决策方式：EXPERT_PANEL 三人独立评审（安全与可靠性 / 产品与运维 / 独立评估者）

## 背景

`destinationDeliveryHealth` 在每次 `destinations.list` 时对整张 `deliveries` 表做
`GROUP BY destination_id`，`since` 只在聚合表达式内、无法下推
（`apps/console/src/infra/sqlite/repositories/history/history.repository.ts:447-478`）。
现有索引只有 `(state, next_attempt_at)` 与 `event_id`
（`apps/console/src/infra/sqlite/migrate/schema.ts:261-269`）。

## 三位专家的结论

### 安全与可靠性专家

- 实测 20 万行：单列 `(destination_id)` 使计划变为 `SCAN deliveries USING INDEX`，
  每行回表，耗时 0.15–0.16 s，**比全表扫描慢约 2 倍**；四列覆盖索引为
  `USING COVERING INDEX`，0.02 s，快 3.5–4 倍。
- 迁移在 `db.transaction()` 内执行，失败连台账一起回滚（`migrate/runner.ts:41-58`）；
  `CREATE INDEX` 持写锁，WAL 下读不阻塞，写方受 `busy_timeout = 5000` 约束。
- 磁盘：覆盖索引约 56 B/行（20 万行 11.2 MB），相对表 + 原索引总量约 +23%。
- 可逆性：数据层完全可逆（`DROP INDEX`），但已记录 `0005` 的库不能直接换回旧镜像。

### 产品与运维专家

- 推荐覆盖索引，理由与安全专家一致；并指出首列 `destination_id` 同时覆盖
  `ON DELETE CASCADE` 的子表查找（`migrate/schema.ts:116-118`、`connection.ts:27`）。
- 对运维语义零影响：行集、分组键、24 小时窗口、显示顺序均不变。
- 要求同 PR 修正 `history.repository.ts` 里「history retention bounds the table」的失效注释。
- 优先级排序：Q-279 > Q-281 > REQ-271 > UI-81。

### 独立评估者

- 接受覆盖索引；给出可直接执行的断言：`sqlite_master` 中存在索引、
  `EXPLAIN QUERY PLAN` 含 `USING COVERING INDEX` 且不含 `TEMP B-TREE`、
  二次迁移 `applied` 为空、旧库升级行数不变。
- 指出新增迁移会改变 `readSqliteSchemaPlan()` 的期望数组与 `schemaVersion()` 断言，
  必须同步更新 `migrate.test.ts`。
- 备选单列索引只在热缓存下占优，若坚持需附带冷缓存微基准，因此不采纳。

## 最终选择

三人一致：**做**，且索引必须是四列覆盖索引
`(destination_id, state, finished_at, created_at)`，不采纳 Q-279 原始的单列方案。

命名采用 `idx_deliveries_destination_id_health`：前三位专家给出三个命名（列名全拼、
`..._destination_health`、`..._destination_id_health`），属外观分歧；取「首列列名 + 用途」
的折中，既符合 `idx_deliveries_state_next_attempt_at` 的列名习惯，也与
`destinationDeliveryHealth` 对应。

落地位置（三处，保证 fresh 与存量一致）：

1. `migrate/0005_deliveries_destination_id_health.ts` —— 已部署库的 forward step。
2. `migrate/schema.ts` 的 baseline builder —— 全新库。
3. `migrate/ensure-complete-schema.ts` 的索引修复 —— 走 `0003` 修旧库的路径。

## 理由

- 单列索引已被两方独立实测证否：索引命中不等于更快，回表成本超过省下的排序。
- 覆盖索引把每次目标列表的全表扫描 + 排序降为索引内顺序扫描，且不改任何读写语义。
- 纯加法 DDL，无数据迁移、无 schema 破坏、无新依赖，符合 Product charter。

## 可逆性与回滚

- **功能可逆**：`DROP INDEX IF EXISTS idx_deliveries_destination_id_health`，数据无损。
- **发布后不可用旧镜像直接回滚**：`assertNoUnknownAppliedMigrations`
  （`migrate/runner.ts:177-191`）会让不认识 `0005` 的构建启动失败。
  - 正确路径：恢复升级前冷备份，再启动旧镜像。
  - 若必须原地降级：不要手工删除 `schema_migrations` 行；应发布一个包含 `0005` 但功能
    等价的回退构建。
- 升级影响：`CREATE INDEX` 在启动路径同步执行，期间服务未就绪；耗时与 `deliveries`
  行数线性相关（20 万行约 0.1 s，推断每 200 万行约 1 s）。

## 残留风险

- 投递行仍无保留/清理策略，表无限增长；索引只降低常数。长期治理应另开条目。
- 覆盖索引带来写入放大（每次投递插入多维护一个索引），相对单行写入可忽略。
