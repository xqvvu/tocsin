# 凭据脱敏边界：SEC-8 与 SEC-7

- 日期：2026-10-20（第 25 轮）
- 裁决方式：EXPERT_PANEL 三位专家独立评估（安全与可靠性 / 产品与运维 / 独立评估者）
- 状态：已裁决，待实现（第 26 轮起按 PR A → PR B 顺序落地）

## 事项

### SEC-8（MEDIUM）

投递 attempt 的错误/响应体、oncall `lastError`、目标测试结果中的裸凭据可穿透：
`redactText` 只匹配 `key=value` / `key: value`，不识别 `Bearer ...`、URL userinfo、
Slack/Feishu webhook URL。证据：`packages/core/src/redaction.ts:88-117`、
`apps/console/src/server/deliveries/delivery-execution.ts:111,149,195,198`、
`apps/console/src/infra/sqlite/repositories/delivery/delivery.helpers.ts:32-44`、
`oncall/oncall.helpers.ts:25`、`history/history.repository.ts:298`。

### SEC-7（MEDIUM）

归一化事件字段绕过 raw 脱敏并可传播到出站：`title/message/labels` 原样落库、渲染并
进入通知；路由命中证据 `checks[].actual` 同样携带原值。证据：
`packages/providers/src/generic/parse.ts:24-27`、
`apps/console/src/server/intake/intake.service.ts:113-114`、
`apps/console/src/server/deliveries/delivery-execution.ts:94`、
`packages/destinations/src/generic-webhook/payload.ts:37,46`、
`packages/core/src/route/route.ts:294-334`、
`history/history.repository.ts:131-209`。

## 三位专家意见

### 安全与可靠性专家

- 两项均成立；SEC-7 因可沿投递链路出站传播，实际风险略高。
- SEC-8：在 `redactText` 中组合值形态规则（认证 scheme、`xox[baprs]-`、
  URL userinfo、Slack/Feishu/Lark webhook URL），并在读取层映射函数复核旧行。
  用 Slack 前缀替代通用 `Bot `，避免误伤普通英文。
- SEC-7：采纳读取/发送边界投影，但必须补 `routeMatches[].checks[].actual` 投影；
  仅投影 title/message/labels 仍会从命中证据泄漏。
- 明确拒绝：解析期脱敏（改变匹配/回放语义）、回填清洗历史行（破坏审计记录）。
- PR 组织：建议一个 PR、两个独立 commit（SEC-8 在前）。

### 产品与运维专家

- 两项都值得现在做；SEC-8 先行，因为只影响诊断信息、风险最小。
- SEC-7 修的是「通知一旦发到 Slack/飞书/邮件就无法撤回」，属于补齐既有安全策略。
- 误伤风险低，但必须用词边界 + 最小长度收紧规则；`disk-space-low`、
  `max_tokens: 4096`、`invalid_token` 必须保持不变。
- 接受「存储/备份仍是原文」的残余风险：能读 SQLite/备份的人本就拥有主机权限；
  本次防护目标是通知外发与屏幕共享。
- PR 组织：拆两个 PR，SEC-8 先落地。

### 独立评估者

- SEC-8 可独立落地且可测；SEC-7 的「投影脱敏」在补齐边界清单前不是可执行规格。
- 必须补齐的泄漏面：事件列表标题、事件详情的 `normalized` 与 `routeMatches`、
  投递列表 `eventTitle`、投递详情 `event.normalized/renderedPayload`、历史样本预览、
  回放预览标题、发送输入、出站 envelope 与模板 `payload.*`。
- 旧 `rendered_payload_json` 行必须在读取时投影，否则「历史投递不泄漏」是过度承诺。
- 建议新增独立 helper，不直接改 `redactText` 的既有输出契约；若改，必须补正反例与
  幂等性测试。
- 明确排除配置导出/编辑器草稿：`[REDACTED]` 在导入侧是拒绝哨兵，误用会破坏 TOML 往返。
- PR 组织：两个 stacked PR，SEC-8 先行。

## 最终选择

按「有分歧时选最保守且可逆方案」：

1. **拆两个 PR，SEC-8 先行（PR A），SEC-7 随后（PR B）。** 两者可独立评审、独立回滚，
   避免 SEC-7 的宽影响面拖住低风险的 SEC-8。
2. **只做读取/发送边界投影，不改存储。** 拒绝解析期脱敏与历史行回填。
3. **SEC-8 在 `packages/core/src/redaction.ts` 中实现值形态脱敏，作为可导出的
   `redactCredentialText`，由 `redactText` 组合调用**；读取层在
   `delivery.helpers`、`oncall.helpers`、`history.repository` 的行映射处复核。
   配置导出/编辑器草稿不在调用范围内，并加回归测试锁定 `[REDACTED]` 导入哨兵行为。
4. **SEC-7 新增 `redactNormalizedEvent` 与 `redactRouteMatchResults`**，只用于
   DTO 组装与 `delivery-execution` 发送输入；`intake.get`、worker claim、回放匹配
   继续读取原始值，保证路由/抑制/去重/回放语义不变。
5. **两个 PR 都必须在读取边界矩阵测试**中断言 DTO `JSON.stringify` 不含原始凭据，
   并对 benign 文本加深比较反例。

## 已知限制（必须写进实现 PR 与发布说明）

- SQLite 文件、WAL、备份中的 `events.normalized_json`、`title/message`、
  `route_matches_json`、历史 attempt 仍是原文；本次不承诺「磁盘无明文」。
- 搜索仍按原文列匹配，可被用于存在性探测；本次不改变搜索谓词。
- `fingerprint`、`providerMetadata`、`source/destination.name`、路由规则 `expected`
  不在脱敏范围：`fingerprint` 是去重/静默键，不能脱敏。
- 值形态规则只覆盖高置信模式（认证 scheme、URL userinfo、Slack/Feishu/Lark webhook
  URL）；generic webhook 的 path/query secret 与无前缀裸 token 不承诺覆盖。
- 写入侧脱敏是永久性的：误伤会丢失诊断原文。用误伤反例测试约束，但无法证明零误伤。
- 接收方可能因多个不同凭据值都变成 `[REDACTED]` 而合并告警；这是已知取舍。

## 回滚

- PR A：`git revert` 该 commit 即可；写入侧已脱敏的 attempt 行不可恢复（被替换的是
  凭据片段），无需数据库操作。
- PR B：`git revert` 该 commit；存储未改，回滚后详情恢复原文。已发送的通知无法撤回。
- 两者都无 schema 变更、无迁移、无数据回填。

## 验收标准

见 `iteration-backlog.md` 中 SEC-7 / SEC-8 / SEC-10 / SEC-15 / SEC-17 / SEC-18 行，
以及各专家的可执行断言清单（认证 scheme、URL userinfo、Slack/Feishu URL 正例；
`disk-space-low`、`max_tokens`、`invalid_token`、普通 URL 反例；幂等性；DTO 边界矩阵；
存储/匹配/去重/回放不变性）。
