# 接入 202 回执分解命中路由数

状态：**已实现（本轮 AUTO_SHIP 切片）**
输入：`docs/planning/iteration-backlog.md` 的 `REQ-375`（requirements 车道第 191 轮）。

## 1. 问题

Webhook 接入成功后，`202` 回执只有 `accepted` / `eventId` / `deliveriesCreated` /
`deliveriesDeduped`（`apps/console/src/routes/api/sources/$sourceId/webhook.ts:66-72`）。
运维拿到 `deliveriesCreated: 0` 时无法从响应判断原因：

- 没有启用的路由命中（规则写错、路由绑错告警源、路由被停用）；
- 命中了去重窗口（`deliveriesDeduped > 0`）。

两者在现有字段下可以反推（`deliveriesDeduped` 为 0 就说明没有命中），但回执缺少「匹配」
这一步的正面证据：接入验收时无法确认「命中了 1 条路由」，部分去重时也看不出实际命中几条。
接入验收文档只能让运维「通常说明没有启用的路由命中，或同一幂等键仍在去重窗口内」
（`apps/docs/integrations/provider-verification.md`），实际排障还得打开事件详情逐条核对
`routeMatches`。服务层其实已经算出了命中结果（`intake.service.ts:136-142,151`），
只是没有投影到回执里。

## 2. 用户故事

作为正在接入上游监控系统的 SRE，我希望 `202` 回执直接告诉我这次事件命中了多少条启用路由，
这样验收时我能确认路由绑定确实生效，`deliveriesCreated: 0` 时也不必先登录控制台翻事件详情
才能确认「规则没命中」。

## 3. 范围

- `202` 响应新增 `routesMatched`（数字）：本次事件命中的**启用**路由数量，
  取自 `WebhookIntakeService.acceptWebhook` 已返回的 `matchedRoutes`
  （`apps/console/src/routes/api/sources/$sourceId/webhook.ts`、
  `apps/console/src/server/intake/intake.service.ts:136-142`）。
- 只返回计数，不返回路由 id、名称或目标标识，避免扩大回执的攻击面。
- 文档同步判读口径：
  - `apps/docs/integrations/provider-verification.md`（响应表、成功样例、`deliveriesCreated: 0` 的分解）；
  - `apps/docs/integrations/providers.md`（成功样例与一句判读说明）；
  - `apps/docs/operations/deploy-docker.md`（首次上线验收清单）。
- 测试：`apps/console/src/routes/api/sources/$sourceId/-webhook.test.ts`
  覆盖 0 / 1 / 2 条命中与去重场景。

## 4. 非目标

- 不改状态码、不改鉴权、不改解析失败分支的 `400` 回执。
- 不返回命中路由的身份信息（id / 名称 / 目标），也不返回每条路由的匹配证据；
  逐条证据继续在事件详情页查看。
- 不改变投递创建、去重、抑制语义；`routesMatched` 只是已有结果的投影。
- 无 schema 变更、无迁移、无新依赖、无环境变量。

## 5. 验收标准

1. 无启用路由命中时，`202` 回执为
   `{ accepted: true, eventId, routesMatched: 0, deliveriesCreated: 0, deliveriesDeduped: 0 }`。
2. 一条启用路由命中并创建投递时，`routesMatched: 1`、`deliveriesCreated: 1`。
3. 两条启用路由命中同一事件时，`routesMatched: 2`、`deliveriesCreated: 2`。
4. 重复请求命中去重窗口时，`routesMatched` 仍为实际命中数，`deliveriesCreated: 0`、
   `deliveriesDeduped: 1`。
5. 停用路由不计入 `routesMatched`（`findMatchingRoutes` 只接收启用路由）。
6. `vp check`、`vp run -r test`、`vp run -r build` 全绿。

## 6. 架构边界

- 纯加法：entrypoint 多做一次 `.length` 投影，service 与 repository 不改。
- 回执字段是运营可见信息，但属于计数而非配置细节：不包含 token、secret、
  路由名称或目标地址，符合「secret 不出服务端、运维可见事实可以暴露」的边界。
- 可逆：回滚提交即可；旧客户端忽略多余字段，无持久化副作用。
