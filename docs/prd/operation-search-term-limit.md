# 搜索关键词上限的显式提示（REQ-264）

状态：**已实现（REQ-264，PR #441）**

## 问题

运维搜索框把输入按空白拆成多个关键词，每个关键词都必须命中（AND），
但仓储只取前 8 个，多余关键词被静默丢弃
（`apps/console/src/infra/sqlite/repositories/history/history.repository.ts:754-768`）。
搜索框的 placeholder 却承诺「空格分隔多词需全部命中」
（`apps/console/src/i18n/messages/zh-Hans.json:865-866`），筛选 chip 也继续展示完整
查询串（`apps/console/src/features/operations/ui/operation-filters.tsx:179-204`）。

值班时常见的操作是把一整行错误日志粘进搜索框，希望用它定位告警。实际只用了前 8 个词，
第 9 个之后的约束被丢掉，列表返回的是一个**比查询更宽**的超集；界面没有任何提示，
操作者会误以为「这些结果都同时满足整行日志」，进而错误判断影响面。

## 用户故事

作为值班 SRE，我粘贴一段长日志或多词条件搜索告警时，希望能立刻看到「只用了前 8 个关键词、
忽略了 N 个」，这样我知道当前结果是更宽的候选集，要么删掉多余关键词，要么继续用更精确的
条件收敛。

## 范围

- 把关键词拆分与上限判定上移到 `@tocsin/core`：新增
  `OPERATION_SEARCH_MAX_TERMS = 8` 与 `splitOperationSearchTerms(query)`，
  返回实际生效的 `terms` 与被丢弃的 `ignoredCount`。
- 仓储的事件搜索与投递搜索都改用该函数，行为与改造前一致（仍然只应用前 8 个词）。
- Events 与 Deliveries 的筛选工具栏在 `ignoredCount > 0` 时显示一行非错误提示：
  「搜索只匹配前 8 个关键词，已忽略 N 个」；跟随输入框草稿实时出现/消失。
- 中英文文案成对新增，保持 `i18n/messages.test.ts` 的键名对等与无句号约束。

## 非目标

- 不提高或降低 8 个关键词的上限；不改成 OR 语义。
- 不改变 URL schema、oRPC 输入或服务端过滤语义。
- 不引入「关键词高亮」「逐词 chip 拆分」等交互。
- 不改搜索覆盖的字段集合。

## 验收标准

1. 输入 8 个以内的关键词：不显示提示。
2. 输入超过 8 个关键词：显示提示，且 N 等于超出的关键词数量。
3. 删回 8 个以内：提示消失。
4. 空白、连续空格、换行不影响关键词计数；全空白输入返回 0 个关键词。
5. 仓储仍只应用前 8 个关键词（core 单测锁定 `terms` 与 `ignoredCount`）。
6. 中英文案键名对等，文案不含句号。

## 架构边界

- `packages/core/src/operations.ts`：拆分规则与上限常量（环境中立，控制台与仓储共用）。
- `apps/console/src/infra/sqlite/repositories/history/history.repository.ts`：删除本地副本，
  改调共享函数。
- `apps/console/src/features/operations/ui/operation-filters.tsx`：提示渲染。
- `apps/console/src/i18n/messages/{zh-Hans,en-US}.json`：成对文案。

无迁移、无新依赖、无新增 procedure；恢复旧行为只需删除提示行。
