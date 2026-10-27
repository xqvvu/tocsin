---
title: 告警源接入与生命周期
description: 为 SRE 与运维人员说明 Tocsin 告警源的创建、认证、Token 轮换、停用和删除影响。
---

# 告警源接入与生命周期

告警源（Source）代表一个独立的上游发送方。它把固定的 Webhook 入口、认证凭据、Provider 解析器和启停状态绑定在一起，并决定新请求会以哪个上游身份进入 Event → Route → Delivery 链路。

为每个上游系统或独立发送职责创建一个告警源。不要让多个无关系统共用一个接入 Token，否则无法独立轮换、停用或审计。

## 每个告警源包含什么

| 项目 | 运维含义 |
| --- | --- |
| Source ID 与 Webhook URL | 稳定的接入地址：`/api/sources/<source-id>/webhook`。轮换 Token 不会改变 URL。 |
| 接入 Token | 每个告警源独立的 bearer 凭据。服务端只保存哈希，明文只在创建、轮换或导入新 ID 时一次性显示。 |
| Provider | 选择与上游请求体一致的告警解析器；解析结果会写入 Event 的规范化字段。 |
| 额外共享密钥 | 可选的第二个 Tocsin 侧固定凭据，通过 `X-Tocsin-Provider-Secret` 发送。它不是上游原生 HMAC 验签。 |
| 启停状态 | 停用后拒绝新的 Webhook，但不会删除现有 Event、Route 或 Delivery。 |

Token 不能再次查看。告警源列表可以重新复制 Webhook URL，但不会重新显示 Token；丢失或怀疑泄露时应轮换。

## 创建并验证接入

1. 在「告警源」选择与上游载荷匹配的 Provider，并填写值班人员能辨认的名称。
2. 按需设置额外共享密钥。只使用接入 Token 时留空即可。
3. 创建后立即保存一次性显示的 Webhook URL 与接入 Token。两者都能从提示中复制，Token 也可手动选中。
4. 在上游系统填入 URL 与任一已配置凭据，并以 `application/json` 发送一条代表性测试载荷。
5. 确认返回 `202`，再检查 Event 的规范化字段和 Route 匹配证据。`202` 只表示接入成功，不表示目标已送达。

接入认证接受以下任一有效凭据：

| 凭据 | 请求头 |
| --- | --- |
| 接入 Token | `Authorization: Bearer <source-token>` |
| 接入 Token | `X-Tocsin-Source-Token: <source-token>` |
| 额外共享密钥 | `X-Tocsin-Provider-Secret: <shared-secret>` |

dashboard 登录 session 不能用于 Webhook。未配置额外共享密钥时，该请求头不能替代 Token。字段样例与响应码见[告警源接入参考](/integrations/providers)。

::: tip 先验证再上路由
先确认测试请求产生 Event，再创建或启用 Route。这样能把“认证或解析失败”和“路由没有命中”分开排查。
:::

## 轮换接入 Token

轮换会为同一个告警源生成新 Token，并立即替换旧 Token 的哈希。Source ID、Webhook URL、Provider、Route 和 Event 历史都不变。

::: warning 没有新旧 Token 并行宽限期
轮换提交后，旧 Token 立即无法通过认证。新 Token 只在完成轮换后的提示中显示一次。
:::

推荐按以下顺序操作：

1. 确认上游系统支持快速更新 HTTP 认证凭据，并通知相关值班人员。
2. 如果上游使用额外共享密钥，可先确认该凭据仍能独立通过认证，避免 Token 切换中断。Token 与共享密钥任一有效即可。
3. 在告警源行执行「轮换接入 Token」并确认。
4. 立即保存新 Token，更新上游认证配置，然后发送测试请求。
5. 确认收到新 Event，不应再使用旧 Token 做重试或排障。

轮换 Token 不会修改额外共享密钥；更换共享密钥也不会自动轮换 Token。若两者都可能泄露，应分别处理并更新上游。

## 停用与重新启用

停用告警源会先于凭据校验拒绝新的 Webhook，因此 Token 或共享密钥正确也会返回 `403`。停止期间不会创建 Event，也不会有新的 Route 匹配或 Delivery。

- 已入队的 Delivery 会继续由 Worker 发送；停用告警源不是出站投递的总开关。
- 重新启用后，原有 Token 和额外共享密钥继续生效，无需重新生成。
- 如果仍需要记录 Event、但暂时不希望发送通知，应使用[告警静默与维护时段](/operations/suppressions)，而不是停用告警源。

停用确认框会显示当前排队中的 Delivery 数，便于在拒绝新告警前判断是否仍有在途通知。

## 编辑解析器或共享密钥

编辑告警源可以改名、切换 Provider 或覆盖额外共享密钥。

- Provider 或共享密钥变更只影响后续 Webhook；历史 Event 的规范化结果和路由匹配快照不会重算。
- 编辑框中的共享密钥留空表示保留当前值。输入新值会覆盖旧共享密钥；新凭据保存后应立即更新上游。
- 切换 Provider 前，先用目标解析器支持的示例载荷验证，避免新请求只生成解析失败 Event。

## 删除告警源

删除是不可撤销的破坏性操作。删除告警源会同时移除它的接入 Token、共享密钥、Event 和关联 Delivery；只引用该告警源的 Route 也会被删除，仍引用其他告警源的 Route 只会收窄条件。

删除确认框会列出：

- 可能连带删除的路由数；
- 只移除当前告警源引用、继续保留的路由数；
- 将随 Event 级联删除的历史记录影响。

需要保留审计历史时，优先停用告警源，而不是删除。确认上游已经停止发送后，再按团队的事件保留和备份策略执行删除。

## 故障与凭据处置清单

| 现象或任务 | 处理 |
| --- | --- |
| 新 Webhook 返回 `401` | 确认 URL 中的 Source ID、Token 位置和额外共享密钥是否与当前配置一致；不要尝试从 dashboard 找回旧 Token。 |
| 新 Webhook 返回 `403` | 检查告警源是否已停用；重新启用后沿用原凭据。 |
| Token 丢失 | 直接轮换 Token，保存新值并更新上游。 |
| Token 或共享密钥泄露 | 立即替换对应凭据，检查近期 Event 和 Delivery，并按事故流程处理备份与日志暴露范围。 |
| 上游切换完成但 dashboard 没有 Delivery | Event 可能存在但 Route 未命中或目标停用；见[故障排查](/operations/troubleshooting)。 |

下一步：[理解处理链路](/guide/concepts) · [配置路由匹配](/guide/routes) · [按 Provider 接入载荷](/integrations/providers) · [排查接入与投递](/operations/troubleshooting)
