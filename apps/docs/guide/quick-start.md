---
title: 快速开始
description: 从 Docker Compose 启动本地 Tocsin 实例，走通告警源、路由、通知目标到投递的首次验收。
---

# 快速开始

本指南从 Docker Compose 启动一个本地实例，并走完「告警源 → Event → Route → Destination → Delivery」。部署和备份细节见[生产部署](/operations/deploy-docker)与[备份恢复](/operations/backup-restore)。

## 启动实例

先取得仓库，再在根目录启动。当前文档不假设每个版本都提供预构建镜像。生产模式必须提供持久的 `BETTER_AUTH_SECRET`；不要每次重启都重新生成它。

```bash
git clone https://github.com/xqvvu/tocsin.git
cd tocsin
export BETTER_AUTH_SECRET="$(openssl rand -hex 32)"
export BETTER_AUTH_URL="http://localhost:3000"
export SERVER_URL="http://localhost:3000"
docker compose up -d --build
curl -fsS http://localhost:3000/api/ready
```

`/api/ready` 返回成功后，先在本机打开 `http://localhost:3000/setup` 并创建 owner。第一个注册用户成为 owner，后续注册会被拒绝；在首次 setup 完成前，不要把实例暴露给公网。Compose 默认使用名为 `tocsin-data` 的持久卷。

::: warning 保存认证密钥
示例通过当前 shell 注入密钥。请将生成的值保存到受保护的部署环境或 secret store，以便容器重建后继续使用；轮换密钥会使现有 dashboard session 失效。
:::

首个 owner、登录会话与密码恢复边界见[认证与账号安全](/operations/authentication)。

## 建立投递路径

在 dashboard 中按以下顺序配置：

1. 在「通知目标」新建一个目标，例如 Feishu、Slack、Email 或通用 Webhook。填入真实可达的接收端，并使用目标页的测试操作验证配置。Email 适配器当前标记为 experimental，需要先准备 HTTP 邮件网关，接入与验收见[邮件网关接入与验收](/integrations/email-gateway)。字段、模板和其它通道的边界见[通知目标参考](/integrations/destinations)，各类型的成功判定与验收证据见[通知目标验收与失败判读](/integrations/destination-verification)；需要飞书电话加急时，先按[飞书应用与电话加急](/integrations/feishu-app)完成应用、群和呼叫对象配置。
2. 在「告警源」新建一个 `Generic Webhook` 告警源。创建后立即复制一次性显示的 Webhook URL 与接入 Token；Token 之后不会再次显示。创建、凭据轮换、停用和删除边界见[告警源接入与生命周期](/guide/sources)。
3. 在「路由」新建规则，选择刚创建的告警源、一个或多个匹配条件及通知目标。仅匹配 `critical` 的规则可用于本例。

接入 Token 是凭证，不要写进仓库、工单或共享日志。下面使用占位符说明请求结构；将它替换为刚才复制的真实值，并将 URL 替换为 dashboard 提供的告警源 URL。

```bash
export TOCSIN_SOURCE_TOKEN='<从告警源创建提示中复制>'
curl -i -X POST 'http://localhost:3000/api/sources/<source-id>/webhook' \
  -H "Authorization: Bearer $TOCSIN_SOURCE_TOKEN" \
  -H 'Content-Type: application/json' \
  --data '{
    "id": "checkout-alert-001",
    "title": "Checkout API unavailable",
    "message": "HTTP 503 rate exceeded threshold",
    "severity": "critical",
    "status": "firing",
    "labels": { "service": "checkout", "environment": "prod" }
  }'
```

有效请求会快速返回 HTTP `202`，表示已接收，不代表通知目标已经成功送达。Generic parser 会把以上 `title`、`message`、`severity`、`status` 与 `labels` 归一化；`id` 可作为相同 webhook 请求的幂等标识。

## 核对 Event 与 Delivery

打开「事件」，按时间找到新 Event，检查规范化字段及路由匹配证据；各标签与证据含义见[事件检索与证据](/guide/events)。再打开关联的 Delivery：Worker 在后台处理投递，状态可能先是 `pending` 或 `running`，之后变为 `succeeded` 或 `failed`。失败时查看尝试记录与脱敏后的错误信息，修复通知目标配置后可从投递详情手动重试。

若没有 Delivery，先确认 Route 已启用、条件确实匹配且通知目标已启用；条件组合与多路由语义见[路由规则与匹配](/guide/routes)。Delivery 状态为 `suppressed` 表示命中了有效的告警静默或维护时段；这不是发送失败。创建、核对和结束这类规则见[告警静默与维护时段](/operations/suppressions)。

::: tip 请求认证
告警源 Token 可放在 `Authorization: Bearer ...` 或 `X-Tocsin-Source-Token` 请求头中。也可使用该告警源配置的 Tocsin 侧共享密钥，通过 `X-Tocsin-Provider-Secret` 请求头认证；当前实现接受有效 Token 或有效共享密钥，不要求两者同时提供。Webhook 不使用 dashboard 登录 session。
:::

下一步：[查看各 Provider 的载荷契约](/integrations/providers) · [按 Provider 完成接入验收](/integrations/provider-verification) · [配置并测试通知目标](/integrations/destinations) · [接入 HTTP 邮件网关](/integrations/email-gateway) · [理解事件、路由和抑制](/guide/concepts) · [掌握路由匹配规则](/guide/routes) · [核对环境变量与运行时限制](/operations/configuration) · [管理 owner 与登录会话](/operations/authentication) · [排查接入或投递问题](/operations/troubleshooting)
