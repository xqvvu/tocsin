# 决策记录：Q-297 接入预演的读取边界脱敏

- 裁决时间：2026-10-29（第 161 轮）
- 事项：`SourceRehearsalService` 的成功响应原样返回 `normalizedEvent` / `providerMetadata` /
  `routes[].checks[].actual`，未走同仓库已有的读取边界投影。
- 裁决方式：EXPERT_PANEL 三位专家独立评估（安全与可靠性 / 产品与运维 / 独立评估者）。

## 问题事实

- 服务返回值：`apps/console/src/server/sources/source-rehearsal.service.ts:87-97`（裁决前）。
- 现成投影：`packages/core/src/redaction.ts:329`（`redactJsonText`）、`:371`
  （`redactNormalizedEvent`）、`:390`（`redactRouteMatchResults`）。
- 对照读取边界：`history.repository.ts:278` 与 `delivery.repository.ts:550` 的 `redactEventRecord`。
- 生产发送路径：`server/deliveries/delivery-execution.ts:116-121` 在**渲染之前**投影
  `normalizedEvent` 与 `rawPayload`。

## 三位专家意见

### 1. 安全与可靠性专家

- 爆炸半径在浏览器侧：预演响应进入 Network 面板、React state 与 DOM（title / message /
  labels / `checks[].actual`），操作员常粘贴含真实 token 的载荷，凭据会在截图、录屏、
  共享屏上二次暴露；违反 CLAUDE.md「procedure 不得返回未脱敏敏感载荷」。
- 推荐 A：在 service 返回 DTO 前投影；且**先投影再渲染**，与生产
  （`delivery-execution.ts:119-120`）一致；`:149` 的 `redactJsonValue` 应收紧为 `redactJsonText`。
- 可逆：纯读路径，无迁移、无 schema、无契约变更；单 commit revert 即回滚。
- 排障不受损：`matched` / `routeId` / `destinationIds` / `expected` / severity / status /
  fingerprint / occurredAt 全部保留。

### 2. 产品与运维专家

- 预演的核心用途是验证「解析 → 路由 → 模板渲染」，判定本身用原始事件，脱敏只影响展示。
- 真正的运维危害是**预演失真**而非暴露：模板会摊平/变换 title/message/labels
  （`packages/destinations/src/template.ts:379-391`），事后脱敏无法还原外发内容；
  预演是唯一未投影的读取路径，会导致「预演通过、上线内容不同」。
- 结论：必修（S 成本，非发布阻断）；建议在结果区顶部加一行弱化说明。
- 可逆：只影响单次只读响应，不落库、无审计。

### 3. 独立评估者

- 独立核实生产顺序：`delivery-execution.ts:116-120` 确为「先脱敏再渲染」，专家 1 的顺序正确。
- 匹配必须用 raw：`source-rehearsal.service.ts:78` 的事件参与 title/message/label 比较并生成
  `checks[].actual`（`packages/core/src/route/route.ts:317-357`），先脱敏会改匹配结果。
- 无现有测试断言原始凭据值，旧测试无需修改。
- 断言稳定性：不要断言 `detail`（按设计不脱敏）；字符串只断言
  `not.toContain(secret)` + `toContain("[REDACTED]")`；敏感键与 labelKey 走整值替换。

## 最终选择（三人一致）

1. 解析 → 用**原始事件**匹配路由 → `redactNormalizedEvent` 得到展示事件 →
   **用展示事件渲染** destination 预览 → 返回
   `redactRouteMatchResults(routes)`、`redactJsonText(providerMetadata) as JsonObject`、展示事件。
2. `renderMatchedDestinations` 的 payload 投影由 `redactJsonValue` 改为 `redactJsonText`，
   与生产 `delivery-execution.ts:120` 对齐。
3. 结果视图顶部加中英提示：预演展示已脱敏，原始请求体仍在输入框。

## 理由

- 一致性优先：预演的价值在于「所见即所发」，与生产的脱敏时机不一致会让预演结论失真。
- 纵深：`renders[].renderedPayload` 的输出层脱敏保留，作为第二道防线。

## 回滚

`git revert <sha>` 即可；无数据、缓存或迁移需要清理。回滚会恢复泄露面，应尽快以修复替代。

## 验收

- 新增服务用例：含 `token=…` 的 title、敏感 label 与敏感 labelKey 的 route 条件
  在响应中无原文；benign label、fingerprint、`expected`、`matched` 不变；
  preview 收到的 `normalizedEvent` 已是投影；`renderedPayload` 无 secret；
  `recordEvent` / `enqueueForEvent` / `send` 零调用。
- 门禁：`vp check`、`vp run -r test`、`vp run -r build`。
