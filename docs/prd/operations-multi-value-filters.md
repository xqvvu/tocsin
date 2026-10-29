# Operations 多值筛选

状态：**已实现（第 179 轮 AUTO_SHIP 切片）**
输入：`docs/prd/post-mvp-planning.md` 方向 4「搜索、过滤与历史排障」。

## 一句话结论

Events 与 Deliveries 的严重级别、告警状态、投递状态三个筛选项从单选改为多选，
值班工程师可以一次查看「critical + warning」或「pending + failed」，而不是在多个单一视图之间来回切换。

## 1. 问题

排障时最常见的两种问题都跨多个取值：

- 事故升级期间，值班工程师关心「所有非 info 的告警」——critical 与 warning 要一起看。
- 投递积压时，真正需要处理的是「还没成功」的投递——pending、running、failed 三个状态要一起看。

当前每个维度只能选一个值：

- 搜索 schema 每个维度是一个枚举：`apps/console/src/features/operations/model/operation-search.ts:96-118`
- oRPC 输入只接受单值：`packages/api/src/schemas/operations.ts:308-310,362`
- 仓储谓词是等值比较：`apps/console/src/infra/sqlite/repositories/history/history.repository.ts:122-129,443-446`
- 工具栏三个控件都是单选下拉：`apps/console/src/features/operations/ui/operation-filters.tsx:351-390,715-735`

结果是要么反复切换筛选、要么导出后用别的手段合并，排障视野被人为切碎。

## 2. 用户故事

作为值班工程师，我希望在 Events 和 Deliveries 页面同时选中多个严重级别、告警状态或投递状态，
以便用一个视图回答「这次事故里所有非 info 的告警都投递成功了吗」，而不必逐值切换。

## 3. 范围

- `severity` / `status` / `deliveryState` 三个维度支持多值；其余维度（source、destination、route、时间范围等）保持单值。
- URL 用逗号分隔保存在一个参数里（`?severity=critical,warning`），链接仍然可读、可手写。
- 单选值完全兼容：`?severity=critical` 与多选一个值的行为一致，旧链接不需要迁移。
- 契约同时接受单值与数组，因此已接入 API 的调用方不需要改。
- 未知取值与重复项在解析时丢弃而不是报错：URL 可手写，旧链接不应让整页失败。
- 清空全部勾选等于「不限」，与清除筛选一致，而不是「匹配不到任何行」。
- 工具栏三个控件改为复选框弹层；已选值按选项顺序规范化，同一个选择集合永远产生同一个 URL。
- 激活筛选 chip 展示每个取值的名称，而不是原始逗号字符串。
- 列表与 `total` 使用同一谓词（`IN`），分页不会承诺列表里不存在的行。

## 4. 非目标

- 不做「排除某些值」（`NOT IN`）语义。
- 不给 source / destination / route 等实体维度做多选：这些维度的选项来自配置，多选更多是选择器体验问题，不是本次要解决的排障缺口。
- 不引入新的查询参数命名（如 `severity[]=` 或重复 key）。
- 不改动投递状态机、路由匹配或摄入语义。

## 5. 验收标准

- `?severity=critical,warning` 在 Events 页返回两个级别的告警，`total` 与列表行数一致。
- `?severity=critical` 与改造前返回完全相同的结果集。
- `?deliveryState=failed,pending` 在 Deliveries 页同时返回两种状态。
- `?severity=nope` 被当作未筛选，页面不报错。
- 勾选两个值后 URL 为 `critical,warning`；取消其中一个后 URL 只保留剩余值；全部取消后参数消失。
- 激活 chip 显示两个级别的名称，点击 chip 清除整个维度。
- `vp check` 0 error，`vp run -r test` 全绿，`vp run -r build` 通过。

## 6. 架构边界

- `apps/console/src/features/operations/model/operation-search.ts`：URL 解析与序列化（逗号列表 ↔ 数组）。
- `packages/api/src/schemas/operations.ts`：契约接受单值或数组。
- `apps/console/src/server/operations/operations.service.types.ts`：服务输入类型跟随契约放宽。
- `apps/console/src/infra/sqlite/repositories/history/`：查询类型接受单值或数组，统一走 `IN` 谓词。
- `apps/console/src/features/operations/ui/operation-multi-select.tsx`：新的复选框弹层控件。
- 无迁移、无新依赖、无 schema 变更。
