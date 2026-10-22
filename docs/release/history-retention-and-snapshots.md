# 历史保留与快照：两条决策 + 一处已确认的缺陷

- 对应检查项：`docs/release/mvp-rc-checklist.md` 的「delivery history retention」「Delivery detail 历史快照字段评估」。
- 性质：**决策记录 + 缺陷评估**。左侧两条是决策，右侧一条是已核实的缺陷（含修复方向，本轮不修）。

## 一句话结论

**delivery history 不自动清理（理由见 §1）；raw payload 仍按 `rawPayloadRetentionDays` 清理但已从接入热路径上摘掉（见 §2）；`#134` 是一个真缺陷 —— 改名 destination/route 会追溯改写历史投递的显示名（见 §3）。**

---

## 1. delivery history：**决定不自动清理**

**决定：不引入 delivery history 的 retention 设置。** 理由不是"懒得做"，而是它与本产品的核心主张冲突：

- Tocsin 的立身之本是回答"**这条告警到底发出去了没有、为什么失败**"（README 里就是这么定位的）。投递行（`deliveries` + `delivery_attempts`）是那个答案本身，不是缓存。
- raw payload 可以清，因为它**可被重新采集**（上游系统的告警历史）且体积大、含敏感数据；而"当时有没有投递成功"**无法事后重建**。
- 因此二者的保留策略本就该不同：raw payload 有期限是**隐私/体积**取舍，delivery history 永久是**可审计性**取舍。

**代价（诚实记录）**：数据库会随投递量单调增长，自托管实例长期运行后需要人工介入。缓解措施（本轮未做，列入后续）：

- 运维可见的容量信号（表行数/体积），让增长可见而不是突然发现磁盘满；
- 若未来要做清理，必须是**显式 opt-in 且带预览**（"将删除 N 条 N 天前的投递记录"），不能默认开启——默认清理审计证据与产品主张相悖。

**可被推翻的条件**：若真实实例出现"投递量导致实例不可用"，则应改为"默认保留 + 可配置上限 + 达到上限时告警"，而不是静默删除。届时需重开此决策。

---

## 2. raw payload：保留仍生效，但已离开接入热路径

原实现每次接入都执行一次**无界** `UPDATE events SET raw_payload_json = … WHERE received_at < cutoff`。这条语句的成本随**积压量**增长：对一个已有大量历史的事件库，或任何"接入速度超过清理速度"的时期，**每个 webhook 都要为整个积压买单**。

改法（见 `intake.repository.ts`、`intake.service.ts`）：

| | 之前 | 现在 |
|---|---|---|
| 接入路径 | 无界 UPDATE | **有界批**（`RAW_PAYLOAD_PRUNE_BATCH_SIZE = 100`，按 `received_at` 升序取 id，再按主键更新） |
| 积压清空 | 靠下一次接入 | 接入**之后**在响应路径外补一次无界 sweep（`pruneAllRawPayloads`），单飞（single-flight）避免并发 webhook 叠加 |
| 运维手工 | 无 | `pruneAllRawPayloads` 可用于一次性清理既有库 |

**行为等价性**：保留设置仍然生效（保留策略不变，只是把工作挪走），既有测试「prunes retained raw payloads after the configured retention window」仍通过；新增测试覆盖「单次有界调用只清一批且可继续推进」「sweep 能清空整个积压」「经 webhook 端到端仍会清理」。

**本节不覆盖 dedupe cleanup**：`pruneDedupeKeys` 仍是**无界** `DELETE FROM delivery_dedupe_keys`，并且在每次 `enqueueForEvent` 内执行（`delivery.helpers.ts:107-108`、`delivery.repository.ts:101`）。它与 raw payload pruning 是两条独立路径，成本上限仍待设计，见 `mvp-rc-checklist.md` 的未勾选项。

**sweep 故意不 await**：webhook 不应等房子打扫完。失败被吞掉（下一次 webhook 会重试）——在这里抛出会把一个**已成功**的 webhook 报成失败。

---

## 3. `#134` 缺陷：改名会追溯改写历史（**已确认，本轮不修**）

### 现象

投递详情显示的 destination / route 名字是**读取时实时 join 出来的**：

```
apps/console/src/infra/sqlite/repositories/history/history.repository.ts:176
  .select(["destinations.name as destination_name", "routes.name as route_name"])
```

而名字是**可变**的：

```
apps/console/src/infra/sqlite/repositories/destination/destination.repository.ts:84
  name: input.name ?? current.name,
```

**后果**：把 destination 从「SRE pager」改名为「Platform pager」之后，**三个月前那条投递**在详情页里也显示「Platform pager」。审计证据被静默改写——这与 route-match 那条已经修过的教训是同一类：当时 `intake_snapshot` 与「按当前规则重算」长得一模一样，也是无法区分「当时真相」与「现在算的」。

### 与"删除"的区别（两者行为不同，都要知道）

| 操作 | 对历史投递的影响 |
|---|---|
| **改名** | 投递行保留，但显示名被追溯替换（本缺陷） |
| **删除** | `deliveries.destination_id` / `route_id` 外键是 `onDelete("cascade")`（`schema.ts:117`、`:119`）→ **投递行连同 attempt 历史一起消失** |

删除那条同样是"历史被抹掉"，但它是**有意设计**（配置不存在了，投递也无从解释）；改名这条不是——没有任何人决定过"改名要改写历史"。

### 修复方向（需独立切片，不可顺手改）

需要投递行上存**当时的名字快照**（与 `suppress_reason` 同一手法：快照而非外键解引用）。注意约束：

- 这要**改 schema**，而当前 migration plan 是 `0001` baseline + `0002`/`0003` forward step，迁移器按版本号跳过已应用步骤——**修改已提交的 migration 对已部署实例等于没改**。因此应新增 forward-only step，而不是编辑 `0001`。
- 且应同时决定：快照缺失的**老投递**显示什么（回落到实时名字并在 UI 标注"名字为当前值"，还是显示占位）。

**本轮不修的理由**：它是 schema 变更 + 显示语义决策，两者都属于发布决策而非本切片范围。已按检查项要求完成评估并记录。

---

## 附：本轮未做的事

- **浏览器 E2E 与 Docker/compose 冒烟自动化**：浏览器 E2E 已接入 CI（`.github/workflows/e2e.yml`，本地入口 `just e2e`）；Docker/compose 冒烟脚本（`just docker-smoke`）仍未接入 CI，发布前仍需人工执行。
- ~~**容量信号**（§1 的缓解措施）：未实现。~~ **已实现（2026-10-22）**：Settings 页「存储」面板展示数据库体积、剩余空间、各表行数与最早/最新事件时间；数据来自只读 `storageHealth` 服务（`apps/console/src/server/runtime/storage-health.service.ts:18-32`、`apps/console/src/features/configuration/ui/settings-storage-panel.tsx:20-48`、`apps/console/src/server/orpc/features/settings/router.ts:27-29`）。
