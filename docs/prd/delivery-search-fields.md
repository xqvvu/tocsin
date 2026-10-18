# 投递搜索覆盖失败原因、目标与路由

状态：**已实现（本轮 AUTO_SHIP 切片）**
输入：`docs/prd/post-mvp-planning.md` 方向 4「搜索、过滤与历史排障」；
backlog `REQ-37`。

## 一句话结论

Deliveries 列表的搜索框除了事件字段与 ID，还能按投递表格里已经展示的
**失败原因（`last_error`）**、**目标名称**与**路由名称**检索，让值班工程师
从告警文案或失败信息反向定位一整批投递，而不必先记住目标 ID 再切到筛选器。

## 1. 问题

投递列表的搜索谓词只覆盖 `deliveries.id`、`events.id`、`events.title`、
`events.message`、`events.fingerprint`
（`apps/console/src/infra/sqlite/repositories/history/history.repository.ts:424-434`）。
但表格同时展示目标、路由与最新失败原因
（`apps/console/src/features/deliveries/ui/deliveries-table.tsx:97-101`、
`apps/console/src/features/deliveries/ui/delivery-target-cell.tsx:33-47`）。

值班时最常见的入口恰恰是这些字段：

- 告警群里有人说「飞书那个目标一直在超时」，工程师想搜目标名 `Feishu 生产群`；
- 交接班记录写着「Critical route 的投递全挂了」，想搜路由名；
- 上游返回 `connection refused`，想直接搜错误文本，确认影响范围是单个目标还是全部。

当前在这些输入上搜索一律返回空结果，与表格展示的字段不一致；工程师只能
先去筛选面板按目标/路由下拉筛选，或逐页翻找。筛选器解决的是「精确选择」，
搜索解决的是「我只有一段文本」——两者不能互相替代。

## 2. 用户故事

作为值班工程师，我在告警文案、交接记录或上游错误里拿到目标名、路由名或
失败原因的一段文本后，希望直接粘进 Deliveries 搜索框就能找到相关投递，
这样我能立刻判断影响面，而不必先猜它属于哪个目标、再去下拉框里找。

## 3. 范围

- `deliverySearchPredicate` 在现有字段基础上增加：
  - `deliveries.last_error LIKE <term>`；
  - `EXISTS` 子查询：所属目标的 `destinations.name LIKE <term>`；
  - `EXISTS` 子查询：所属路由的 `routes.name LIKE <term>`（手工投递没有路由，
    自然不命中）。
- 列表与 `total` 继续共用同一谓词；计数查询不新增 join，避免重复计数，
  与 `countDeliveries` 现有注释保持一致
  （`history.repository.ts:326-333`）。
- 搜索框占位文案按页面区分：Events 保持「标题、消息、指纹或 ID」；
  Deliveries 改为「标题、消息、指纹、ID、错误、目标或路由」。
- 仓储测试覆盖：失败原因命中、目标名称命中、路由名称命中、手工投递不被
  路由名误伤，以及 `total` 与 `items` 一致。
- 组件测试覆盖：两种 scope 的占位文案各自正确。

## 4. 非目标

- 不搜索告警源名称；告警源已有精确筛选器，且来源名通常写在事件标题里。
- 不搜索尝试记录（`delivery_attempts`）的响应体或历史错误，只搜投递当前的
  `last_error`；尝试级诊断已有详情页。
- 不做模糊匹配、分词、相关性排序或高亮；仍是字面量子串匹配，沿用现有
  `%`、`_`、`\` 转义。
- 不新增 URL 参数、筛选器控件或 oRPC procedure；`q` 的输入形状不变。
- 不引入 FTS、新索引或外部搜索服务。
- 不改变事件列表的搜索范围（事件列表仍不按目标/路由/投递错误搜索）。

## 5. 验收标准

1. `listDeliveries({ q: "<last_error 片段>" })` 返回对应投递，`total` 与
   `items` 长度一致。
2. `listDeliveries({ q: "<目标名称片段>" })` 返回发往该目标的投递。
3. `listDeliveries({ q: "<路由名称片段>" })` 返回该路由产生的投递。
4. 手工投递（`route_id IS NULL`）不会因为路由名搜索被命中，也不会报错。
5. `%`、`_` 仍按字面量处理，不被当作通配符。
6. Events 列表搜索行为不变，原有搜索测试全部通过。
7. Deliveries 页占位文案承诺上述字段，Events 页文案不变。

## 6. 架构边界

- 只改 `apps/console/src/infra/sqlite/repositories/history/history.repository.ts`
  的 `deliverySearchPredicate` 与其注释，以及 `history.interface.ts` 的 `q` 注释。
- 不触碰 schema、迁移、oRPC contract、service 与投递/路由语义；无 secret 暴露
  变化——`last_error`、目标名与路由名本来就已出现在列表 DTO 与表格中。
- 搜索仍在仓储层用 SQLite `LIKE` 完成，不引入新依赖。
