# 投递列表的时间口径（REQ-8）

## 问题

投递列表的时间窗口与排序都按入队时间 `deliveries.created_at` 计算
（`apps/console/src/infra/sqlite/repositories/history/history.repository.ts:354,400,523`），
而表格展示的「更新时间」是 `deliveries.updated_at`
（`apps/console/src/features/deliveries/ui/deliveries-table.tsx:126`）。

值班时常见路径是：某条投递在 20 分钟前失败，刚刚点「重试」或 worker 自动重试成功，
然后按「最近 1 小时」查看结果。这条投递的入队时间在窗口之外，于是**从它自己显示的
时间所在的列表里消失**；同样地，不设窗口时列表顺序也与可见时间列不一致——
最近重试过的旧投递排在最后，而不是最前。

## 用户故事

作为值班 SRE，我在排障时按「最后活动」查看投递，希望刚重试或刚改变状态的投递出现在
时间窗口内并排在最前面，这样我能确认重试是否生效，而不必记住它的原始入队时间。

## 范围

- 新增投递列表维度 `timeField`：`created`（默认，入队时间）或 `updated`（最后活动）。
- 选择 `updated` 时，时间窗口过滤与列表排序都改用 `deliveries.updated_at`；
  列表与 `total` 共用同一谓词，翻页不会漂移。
- 控制台在投递页筛选面板新增「时间口径」选择器，与「时间范围」相邻；
  默认值 `created` 不写入 URL，选择「最后活动」后写入 `timeField=updated`，
  并提供可清除的筛选 chip。
- 变更时间口径视为一次筛选变更，两个列表都回到第 1 页。

## 非目标

- 不改变 Events 列表的时间口径（事件没有「最后活动」语义）。
- 不新增排序参数 `sort=asc|desc`；默认仍为最新在前。
- 不修改数据库结构、不新增索引、不改变投递状态机。
- 不改变「时间范围」的锚定语义（`rangeAnchor`）。

## 验收标准

1. `timeField=updated` + `range=1h` 时，窗口按 `updated_at` 计算，页面与 `total` 一致。
2. 同一请求下，`timeField=created`（或缺省）与改造前的行为完全一致。
3. 不设窗口时，`timeField=updated` 的列表按 `updated_at` 降序、再按 id 降序。
4. 投递页筛选面板显示「时间口径」，事件页不显示；选择「更新时间」（即最后活动）后出现 chip，
   清除后回到默认。
5. URL 中的未知值（例如 `timeField=sent`）回退为默认，不抛错。
6. 回归测试覆盖：仓储窗口与排序、URL 解析/清理/合并、筛选面板 chip 与清除。

## 架构边界

- `packages/core/src/operations.ts`：共享枚举 `DeliveryTimeFieldSchema`。
- `packages/api/src/schemas/operations.ts`：oRPC 输入新增可选 `timeField`。
- `apps/console/src/infra/sqlite/repositories/history/`：`DeliveryListQuery.timeField`
  与列选择；列表和计数共用同一个列映射函数。
- `apps/console/src/server/operations/operations.service.ts`：原样透传。
- `apps/console/src/features/operations/`：URL schema、查询键归一化、筛选面板与 chip。

无迁移、无新依赖、无新增 procedure；默认行为可逆。
