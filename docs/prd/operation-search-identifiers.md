# 排障搜索覆盖事件与投递 ID

状态：**已实现（本轮 AUTO_SHIP 切片）**
输入：`docs/prd/post-mvp-planning.md` 方向 4「搜索、过滤与历史排障」；
backlog `REQ-31`。

## 一句话结论

Events / Deliveries 列表的搜索框除标题、消息、指纹外，还能直接粘贴事件 ID
或投递 ID 定位记录：事件列表按投递 ID 反查其来源事件，投递列表按事件 ID
拉出该事件的整组投递，列表与 `total` 使用同一谓词。

## 1. 问题

值班排障时最先拿到的是别处传来的标识符，而不是标题：

- 飞书卡片、短信、电话通知或人工补投记录里带的是投递 ID；
- 上游监控系统、Webhook 响应或日志里带的是事件 ID。

当前搜索框只匹配 `events.title` / `events.message` / `events.fingerprint`
（`apps/console/src/infra/sqlite/repositories/history/history.repository.ts:397-410`），
而 Events 与 Deliveries 两个列表、以及各自的 `total` 计数全部复用这一个谓词
（同文件 `:100-102`、`:275-277`、`:320-322`、`:377-379`）。
搜索框占位文案也只承诺「标题、消息或指纹」
（`apps/console/src/i18n/messages/zh-Hans.json:639`）。

结果：

- 在事件列表粘贴投递 ID → 空结果，即使该投递就在当前页；
- 在投递列表粘贴事件 ID → 空结果，无法一次看到该事件的全部投递；
- 在投递列表粘贴投递 ID → 空结果，只能记住投递 ID 再翻页人工比对。

事件与投递详情页之间目前也没有互链（backlog `REQ-10`），
搜索是唯一不依赖新增页面结构的补救路径。

## 2. 用户故事

作为值班工程师，我在告警通知或上游系统里拿到一个事件 ID 或投递 ID 后，
希望把它直接粘进 Events / Deliveries 的搜索框就能定位到对应记录及其整组投递，
这样我不必在分页列表里逐页翻找，也不必先打开详情页再核对 ID。

## 3. 范围

- `eventSearchPredicate` 增加：
  - `events.id LIKE <term>`；
  - `EXISTS` 子查询：任一所属投递的 `deliveries.id LIKE <term>`。
- 新增 `deliverySearchPredicate`，在事件字段基础上增加：
  - `deliveries.id LIKE <term>`；
  - `events.id LIKE <term>`。
- Deliveries 的列表与计数改用 `deliverySearchPredicate`；Events 的列表与计数继续
  使用 `eventSearchPredicate`，两者仍各自保证 `items` 与 `total` 一致。
- 搜索仍是字面量子串匹配，沿用现有 `%`、`_`、`\` 转义
  （`history.repository.ts:412-420`）。
- 搜索框占位文案更新为中英文的「标题、消息、指纹或 ID」。
- 仓储测试覆盖：事件 ID 命中、投递 ID 反查事件、投递 ID 命中、事件 ID 收窄投递、
  以及 `total` 与 `items` 一致。

## 4. 非目标

- 不做模糊匹配、分词、前缀高亮或相关性排序；ID 与文本仍共用同一条 `LIKE` 谓词。
- 不新增独立「按 ID 精确查找」输入框或 URL 参数。
- 不在投递列表搜索目标名称、路由名称、告警源名称（仍由筛选器承担）。
- 不做事件与投递详情页互链（`REQ-10` 单独处理）。
- 不引入 FTS、外部搜索服务或新索引；MVP 数据量下 `LIKE` 足够。
- 不改变搜索输入长度上限（`packages/api/src/schemas/operations.ts:208`，120 字符）。

## 5. 验收标准

1. `listEvents({ q: "<event-id>" })` 返回该事件，`total` 与 `items` 长度一致。
2. `listEvents({ q: "<delivery-id>" })` 返回该投递所属的事件。
3. `listDeliveries({ q: "<delivery-id>" })` 只返回该投递。
4. `listDeliveries({ q: "<event-id>" })` 返回该事件的全部投递。
5. 以上四种情况在计数查询中返回相同数量，分页不出现「第 2 页为空但 total 仍大」。
6. 原有标题 / 消息 / 指纹 / `%` / `_` 字面量测试保持通过。
7. 中英文占位文案同步为「标题、消息、指纹或 ID」/「title, message, fingerprint, or ID」。

## 6. 架构边界

- `apps/console/src/infra/sqlite/repositories/history/history.repository.ts`：
  扩展 `eventSearchPredicate`，新增 `deliverySearchPredicate`，替换投递列表与计数调用。
- `apps/console/src/infra/sqlite/repositories/history/history.interface.ts`：
  补充 `q` 的字段注释。
- `apps/console/src/infra/sqlite/repositories/history/search.test.ts`：新增 2 条用例。
- `apps/console/src/i18n/messages/{zh-Hans,en-US}.json`：占位文案。

无 oRPC contract / schema 变更，无数据库 schema 变更，无新增依赖，
不改变投递、路由或 auth 语义。`EXISTS` 子查询只读取 `deliveries.event_id`
与主键，MVP 数据量下成本可接受。
