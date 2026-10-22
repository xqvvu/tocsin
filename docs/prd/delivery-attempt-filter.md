# Deliveries 按尝试次数过滤

状态：**已实现（第 86 轮 AUTO_SHIP 切片）**
输入：`docs/planning/iteration-backlog.md` REQ-232。

## 一句话结论

Deliveries 列表新增 URL 持久化的「尝试次数」过滤（≥1 / ≥2 / ≥3 次），
让值班工程师一次筛出「被重试过」的投递，而不是逐行看尝试次数列。

## 1. 问题

投递表已经展示尝试次数（`apps/console/src/features/operations/ui/deliveries-table.tsx:91-96`），
DTO 也暴露 `attemptCount`（`packages/core/src/operations.ts:120`），但列表查询没有任何
`attempt_count` 谓词（`apps/console/src/infra/sqlite/repositories/history/history.repository.ts:268-306,372-416`），
筛选面板也没有对应控件（`apps/console/src/features/operations/ui/operation-filters.tsx:337-419,456-493`）。

事故复盘时最常见的追问是「哪些投递重试过、重试了几次」。当前只能按投递状态（如 `failed`）
筛选后逐行读尝试次数，无法把「至少重试过一次」的记录单独拉出来；目标恢复后跑批重试的记录
也会和首投成功的记录混在同一页。

## 2. 用户故事

作为值班工程师，我希望在 Deliveries 页面选择「至少 2 次」尝试，以便只看被重试过的投递，
快速判断是单次抖动还是目标持续不可用。

## 3. 范围

- URL 新增 `minAttempts` 搜索参数，取值为正整数（UI 提供 1 / 2 / 3 三个预设）；空值表示不限。
- 语义为 `deliveries.attempt_count >= minAttempts`，列表与 `total` 计数使用同一谓词。
- 仅在 Deliveries scope 渲染控件与 chip；Events 页面不渲染（事件没有尝试次数维度）。
- 与现有 source / severity / status / destination / destinationKind / route / deliveryState /
  range / `q` 做 AND。
- 修改该条件时两个列表都回到第 1 页；分页本身不重置条件。
- 手改 URL 传入非法值（非数字、0、负数、超过上限）时收敛为「不限」，不抛错。

## 4. 非目标

- attempt 级错误搜索、按尝试序号定位到具体 attempt（已在 `docs/prd` 中排除）。
- 失败原因聚合、重试成功率报表（REQ-45）。
- 「恰好 N 次」或区间过滤：只做下界，避免多一个 URL 维度。
- 为 `attempt_count` 新增索引或迁移。

## 5. 验收标准

1. `minAttempts=2` 时，Deliveries 只返回 `attempt_count >= 2` 的投递，`total` 与 `items` 一致。
2. `minAttempts=1` 排除从未尝试过的投递（`attempt_count = 0` 的排队记录）。
3. 非法值（`abc` / `0` / `-1` / `101`）被 schema 收敛为空，不进入服务端请求。
4. 修改条件时 `eventPage` / `deliveryPage` 回到 1；分页保留条件。
5. Events 页面不渲染该控件，也不因 URL 上的 `minAttempts` 改变事件结果。
6. chip 显示「尝试次数 / ≥ 2 次」，点击后清除该条件。
7. 清空筛选（内联 Reset）同时清除该条件。

## 6. 架构边界

- `apps/console/src/features/operations/model/operation-search.ts`：URL 校验、prune、页码重置。
- `apps/console/src/features/operations/api/operations.queries.ts`：查询键包含 `minAttempts`。
- `packages/api/src/schemas/operations.ts`：`ListOperationsInputSchema` 增加 `minAttempts`。
- `apps/console/src/server/operations/operations.service.types.ts` 与 `operations.service.ts`：
  透传到仓储；不改变任何投递语义。
- `apps/console/src/infra/sqlite/repositories/history/{history.interface,history.repository}.ts`：
  `DeliveryListQuery` 增加 `minAttempts`，列表与计数共用谓词。
- `apps/console/src/features/operations/ui/operation-filters.tsx`：控件与 chip。
- i18n：`apps/console/src/i18n/messages/{zh-Hans,en-US}.json`。

无数据库 schema 变更，无新增运行时依赖，不改变投递 / 路由 / auth 语义。
