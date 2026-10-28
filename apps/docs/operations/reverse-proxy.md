---
title: TLS 反向代理
description: 为单实例 Tocsin 配置 nginx 或 Caddy、保留外部 Host、设置请求体上限并验证登录与 Webhook 链路。
---

# TLS 反向代理

Tocsin 应用只监听明文 HTTP，不负责证书和 TLS 终止。生产拓扑应由一个反向代理终止 HTTPS，再把**所有路径**转发到单实例 console 的 `3000` 端口。Docker 拓扑见[Docker 生产部署](/operations/deploy-docker)，变量参考见[环境变量与运行时配置](/operations/configuration)。

```text
浏览器 / 上游告警系统
          │ HTTPS
          ▼
  nginx / Caddy / 云负载均衡
          │ HTTP，仅内网或 loopback
          ▼
   Tocsin console:3000
          │
          └── 单个 SQLite 数据卷与进程内 Worker
```

本页只覆盖单实例前置代理。不要通过多个代理把请求分发到多个 Tocsin 副本；它们不能并发写入同一 SQLite 数据库。

## 代理必须满足的边界

| 边界 | 要求 |
| --- | --- |
| 外部 URL | `BETTER_AUTH_URL` 与 `SERVER_URL` 必须是代理后的最终 HTTPS 地址，通常两者相同。 |
| Host | 保留浏览器原始 `Host`，不要改写成 `127.0.0.1:3000` 或 `localhost:3000`。 |
| 路径 | 在域名根路径代理 `/`，不要删除或重写 `/api/auth/*`、`/api/sources/*/webhook` 和其它 `/api/*` 路径。 |
| 端口 | 应用端口只应被代理访问。Compose 默认发布到所有网卡，生产清单应改为 loopback 或私有容器网络。 |
| 请求体 | 代理上限不能低于 `TOCSIN_MAX_WEBHOOK_BYTES`；默认是 1 MiB，应用最大允许 10 MiB。 |
| 持久连接 | 当前 console 未使用 WebSocket 或 SSE，普通 HTTP 代理即可；无需配置 Upgrade 隧道。 |
| 缓存 | 不要缓存 dashboard HTML、认证响应或 `/api/*`。Tocsin 不提供 CDN 缓存协议。 |

应用不会根据代理地址自动生成外部链接。当前也没有开关可以启用 Better Auth 的 `trustedProxyHeaders`；因此不要只把外部主机名放在 `X-Forwarded-Host`，却把转发请求的 `Host` 改成内部地址。第一次上线优先使用单一规范域名，避免 Host、Cookie 和重定向之间的歧义。

## 1. 限制应用端口

先让 Tocsin 只监听主机 loopback。使用生产 Compose 清单时，把端口发布改成：

```yaml
services:
  console:
    ports:
      - "127.0.0.1:${TOCSIN_HTTP_PORT:-3000}:3000"
```

如果通过 `docker-compose.override.yml` 覆盖仓库基础文件，普通 YAML 列表会与已有 `ports` 合并，公网映射可能仍然存在。支持 Compose `!override` 标签的版本可写成：

```yaml
services:
  console:
    ports: !override
      - "127.0.0.1:${TOCSIN_HTTP_PORT:-3000}:3000"
```

部署后确认最终配置和监听地址：

```bash
docker compose config --quiet
docker compose up -d
docker compose port console 3000
```

最后一条应只显示 loopback 映射。若代理以容器运行，也可以不发布宿主机端口，让代理通过私有 Docker 网络访问 `console:3000`。不要依赖防火墙规则作为唯一隔离。

## 2. 设置规范外部地址

单域名部署至少显式设置：

```yaml
services:
  console:
    environment:
      BETTER_AUTH_URL: "https://tocsin.example.com"
      SERVER_URL: "https://tocsin.example.com"
```

`BETTER_AUTH_URL` 决定认证 base URL，`SERVER_URL` 用于通知模板中的事件直链。事件直链应使用收件人可达的规范域名；不要填 `http://127.0.0.1:3000` 或容器服务名。

需要同时通过多个域名访问时，把实际 Host 和完整 Origin 显式加入 override：

```yaml
services:
  console:
    environment:
      BETTER_AUTH_URL: "https://tocsin.example.com"
      SERVER_URL: "https://tocsin.example.com"
      BETTER_AUTH_ALLOWED_HOSTS: "tocsin.example.com,ops.internal.example.com"
      BETTER_AUTH_TRUSTED_ORIGINS: "https://tocsin.example.com,https://ops.internal.example.com"
```

- Host 条目不带协议；非 443 端口要包含在 Host 中，例如 `ops.internal.example.com:8443`。
- Origin 条目必须带协议；多个值可用逗号或换行分隔。
- `SERVER_URL` 只能选择一个规范地址。其它域名可以登录，但通知中的事件直链仍指向这个地址。
- 不要为了省事加入不实际使用的通配域；每个可用 Host 都是认证入口。

修改环境变量后执行 `docker compose up -d` 重建容器。仅重启进程不会重新读取已更改的 Compose 环境映射。

## 3. 配置 nginx

下面的最小配置让 nginx 终止 TLS，并保留外部 Host、协议和单一客户端地址：

```nginx
server {
    listen 80;
    server_name tocsin.example.com;

    # 308 才会保留 POST 方法。不要把 Webhook POST 用 301/302 跳转。
    return 308 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name tocsin.example.com;

    ssl_certificate     /etc/letsencrypt/live/tocsin.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/tocsin.example.com/privkey.pem;

    # 默认 1 MiB 与应用默认上限恰好同值；留出余量，避免临界载荷差异。
    client_max_body_size 2m;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;

        # 当前应用使用 Host 解析动态认证地址，不能把它改写成内部地址。
        proxy_set_header Host $http_host;
        proxy_set_header X-Forwarded-Host $http_host;
        proxy_set_header X-Forwarded-Proto $scheme;

        # 单层可信代理：覆盖客户端自带的值，并只传一个地址。
        proxy_set_header X-Forwarded-For $remote_addr;
    }
}
```

`client_max_body_size` 的单位 `m` 是 MiB。若把 `TOCSIN_MAX_WEBHOOK_BYTES` 调到 10 MiB，代理上限也必须同步调整；否则请求会在到达 Tocsin 前返回代理层 `413`，应用日志里不会出现该次接入。

nginx 默认会继续转发 `Authorization` 和自定义请求头。若前面还有 WAF、API Gateway 或 CDN，确认它没有删除 `X-Tocsin-Source-Token`、`X-Tocsin-Provider-Secret`、`X-Request-Id` 等 Webhook 与排障请求头。

`X-Forwarded-Proto` 不只用于生成外部链接。生产构建的 h3 会用它把请求 URL 还原为 `https://<host>`；dashboard 的写操作经过 TanStack Start 的 CSRF 中间件，当浏览器没有发送 `Sec-Fetch-Site` 时会退化为比较 `Origin` 与请求 URL 的 origin。缺少该头时，这类请求会得到 `403 Forbidden`，而页面浏览可能仍然正常。

## 4. 配置 Caddy

Caddy 可以自动申请证书并默认保留原始 Host。下列配置再显式固定 Host 与请求体边界：

```text
tocsin.example.com {
	request_body {
		max_size 2MiB
	}

	reverse_proxy 127.0.0.1:3000 {
		header_up Host {hostport}
		header_up X-Forwarded-Host {hostport}
		header_up X-Forwarded-Proto {http.request.scheme}
		header_up X-Forwarded-For {remote_host}
	}
}
```

`request_body` 的 `max_size` 从 Caddy 2.10 起可用，仍被标记为 experimental。旧版本应省略该指令，并在 Caddy 前面的负载均衡或防火墙上设置请求体上限；Tocsin 自身仍会按 `TOCSIN_MAX_WEBHOOK_BYTES` 返回 `413`。

若 Caddy 前还有 CDN，先按 CDN 的官方方式把来源 IP 配置为可信代理，再让 Caddy 解析真实客户端地址。不要直接信任公网客户端传入的 `X-Forwarded-For` 链。

## 客户端 IP 与多层代理

Better Auth 默认读取 `X-Forwarded-For` 记录 session 的 IP。当前 Tocsin 没有暴露可信代理 CIDR 配置；在没有 `trustedProxies` 设置时，Better Auth 只接受**单值**地址，多段代理链可能显示为「未知」。

因此：

- 单层 nginx/Caddy 直接面对客户端时，覆盖 `X-Forwarded-For` 为单个客户端 IP。
- 应用端口必须只对可信代理开放，否则客户端可以自行伪造该请求头。
- CDN 加源站代理时，优先使用 CDN 插件、`real_ip` 或 Caddy `trusted_proxies` 把 `$remote_addr` / `{remote_addr}` 变成已验证客户端地址，再继续覆盖 `X-Forwarded-For`。
- 不要把未经校验的多跳地址链直接交给 Tocsin，也不要为了“保留更多信息”追加自定义 IP 头。

如果「设置 → UI → 账号安全」中的 IP 显示为「未知」，先检查代理实际发送的 `X-Forwarded-For` 值和会话创建时间。该字段缺失不自动表示账号异常；它会影响来源可见性和基于 IP 的认证限流效果。

## 健康检查与 Webhook

应用的容器 healthcheck 直接访问 `127.0.0.1:3000/api/ready`，不依赖反向代理。`/api/health` 只表示进程可响应，`/api/ready` 才检查 SQLite、迁移和 Worker；语义见[日志与可观测性](/operations/observability#健康检查、worker-状态与投递健康)。

是否把探针暴露到公网由外部监控模型决定。若不需要公网探针，可在代理层只拒绝 `/api/health` 和 `/api/ready`；不要同时阻断 `/api/auth/*`、`/api/*` 与告警源 Webhook 路径。

部署后用无凭据请求确认路由已到达应用：

```bash
curl -fsS https://tocsin.example.com/api/ready

curl -sS -o /dev/null -w '%{http_code}\n' \
  -X POST https://tocsin.example.com/api/sources/not-a-real-source/webhook \
  -H 'Content-Type: application/json' \
  --data '{}'
```

第二条应返回 `401`，因为它没有告警源 Token；重点是它没有返回代理的 `404`、`502` 或 HTML 错误页。真实 Source 应返回 `202`，但这只代表 Event 已接受，不代表通知目标已送达。

## 上线验收

1. `docker compose port console 3000` 只显示 loopback；直接从外部网络访问 `http://<host>:3000` 失败。
2. `https://<域名>/api/ready` 返回 `200`，并且没有证书错误或 HTTP/HTTPS 混用。
3. `/setup` 或 `/login` 的页面、认证 API 和 POST 请求都走同一 HTTPS Origin；浏览器可保存 session cookie，登录后不会立即跳回登录页。
4. 在浏览器 DevTools 确认 session cookie 名为 `__Secure-better-auth.session_token`，带 `Secure`、`HttpOnly` 与 `SameSite=Lax`，且没有跨域预检失败或 `Invalid origin`。用 `http://` 访问时浏览器不会回传该 cookie，表现为登录后又回到登录页。
5. 用一次超过代理上限的测试请求确认返回 `413`；再检查 Tocsin 日志里是否出现同一请求，以区分代理拦截与应用拦截。
6. 创建真实告警源后发送测试 Webhook，得到 `202`，并在 Event 详情看到本次请求、匹配结果和预期 Delivery。
7. 检查响应头 `x-request-id`，再用该 id 在日志中定位请求；不要把 Token、Cookie 或完整载荷贴进工单。
8. 在桌面和手机网络下分别完成登录与页面导航，确认代理没有缓存或改写 dashboard 响应。

## 常见故障

| 现象 | 常见原因 | 处理 |
| --- | --- | --- |
| `502 Bad Gateway` | 容器未启动、应用端口不匹配、代理无法访问 loopback 或私有网络 | 先查 `/api/ready` 和 `docker compose ps`，再核对 `proxy_pass` / upstream 地址。 |
| `/api/ready` 返回应用 `503` | 应用已到达，但 SQLite、迁移或 Worker 未就绪 | 按响应中的固定 `code` 查看[版本升级与回滚](/operations/upgrade-rollback#readiness-判读)。 |
| 登录后立即回登录页 | 外部 URL、Host、HTTPS 或 Cookie 不一致；浏览器拒绝非安全 cookie | 统一 `BETTER_AUTH_URL` 与实际 Origin，保留 Host，并清除旧域名 cookie 后重试。 |
| dashboard 写操作返回 `403 Forbidden`，但页面浏览正常 | 代理缺少 `X-Forwarded-Proto: https`，或把 Host 改写为内部地址；CSRF 在缺少 `Sec-Fetch-Site` 时发现 `Origin` 与请求 URL 不一致 | 补齐 `X-Forwarded-Proto $scheme` 并保留原始 Host；用 DevTools 确认实际发送的请求头。 |
| 多域名中一个域名报 Host/Origin 错误 | 只配置了 `BETTER_AUTH_URL`，没有加入实际 Host 与完整 Origin | 在 Compose override 中补齐 allowed hosts、trusted origins 并重建容器。 |
| Webhook 返回代理自己的 `413` | `client_max_body_size` 或网关上限低于 `TOCSIN_MAX_WEBHOOK_BYTES` | 对齐代理上限；应用日志中没有请求通常说明请求未到进程。 |
| Webhook 返回 `404` | 网关删除了路径前缀、只代理了 dashboard 页面，或把 Webhook 当静态内容处理 | 对 `/api/sources/*/webhook` 保留原始路径、POST 方法和 JSON 请求体。 |
| 登录限流表现异常或会话 IP 未知 | 代理没有传 `X-Forwarded-For`，或传入了无法安全解析的多段地址链 | 让单层可信代理覆盖为单一客户端 IP；多层代理先正确解析可信来源。 |
| 页面或 API 出现旧内容 | 在 CDN/代理启用了缓存 | 对 dashboard 与 `/api/*` 禁用共享缓存，发布后清除误缓存。 |

相关页面：[Docker 生产部署](/operations/deploy-docker) · [环境变量与运行时配置](/operations/configuration) · [认证与账号安全](/operations/authentication) · [日志与可观测性](/operations/observability) · [故障排查](/operations/troubleshooting)
