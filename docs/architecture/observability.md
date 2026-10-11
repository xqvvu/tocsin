# 服务端可观测日志

本文档定义 Tocsin 服务端结构化日志的运行时形状、安全规则和扩展方式。当前实现使用
LogTape，保持单进程、stdout/stderr-first 的自托管部署形态；不要求额外日志服务、数据库表或
sidecar。

## 运行时形状

日志运行时分为三个职责：

1. `apps/console/src/server.ts` 在 server entry 启动时调用
   `logger()`，随后初始化 SQLite store，并通过 `system-information.ts` 逐项记录 Tocsin package 版本、
   Node 版本、操作系统、架构、运行环境、SQLite runtime 版本和 `better-sqlite3` 驱动名称。Tocsin
   版本从仓库根 `package.json` 静态导入并随 server bundle 打包；SQLite runtime 版本来自实际连接
   执行的 `sqlite_version()`，不是 npm package 版本。应用只配置 LogTape 一次；library 和 adapter
   不调用 `configure()`。
2. `server/runtime/logging.ts` 是 server-only 配置模块。它拥有 sink、formatter、level、
   `AsyncLocalStorage` 和 LogTape meta logger 配置，但不进入 application container。
3. `start.ts` 注册全局 request logging middleware，并显式保留 TanStack Start CSRF
   middleware。新增自定义 `startInstance` 后框架不再自动补默认 CSRF middleware，因此两者必须
   一起注册。

Logging Runtime 不属于 application container。Container 组装 SQLite、registry、Better Auth、
worker 和业务 service；LogTape 是应用级 instrumentation，全局配置由 server entry 拥有。把它放进
container 会造成请求开始前没有日志、重复配置或把 logger 传遍所有构造函数。

Console 内的业务模块直接使用 LogTape 原生分类 logger，不新增 `ILogger` / `LoggerPort`。Provider
和 destination adapter 不接收 logger；它们继续返回稳定 parse/send 结果，由 console 决定哪些字段
进入 Event、Delivery、日志或未来 metrics。

## Request Context

`request-logging.middleware.ts` 包住 SSR、API route 和 `/api/rpc` procedure 调用的完整请求调用链：

- 优先接受 `x-request-id`，其次接受 `x-correlation-id`。
- 上游 ID 必须匹配受限字符集且不超过 128 字符；无效或缺失时生成 UUID。
- 将 `requestId` 写入 LogTape `withContext()`，并通过
  `AsyncLocalStorage` 隔离并发请求。
- 将有效 `x-request-id` 传给下游 request context，并写回成功响应。
- 只记录 method、pathname、handler type、status 和 duration；不记录完整 URL/query、headers、
  body 或响应 body。
- 成功的 `/api/health`、`/api/ready` 降为 `debug`，避免 Docker probe 污染常规日志。

`server/runtime/request-context.ts` 仍负责 dashboard/webhook 的认证上下文，只读取 middleware 已校验
或生成的 request ID。Source Token、额外共享密钥、raw headers 不进入 LogTape context。

oRPC procedure 层由 `server/orpc/procedure-logging.ts`（挂在根 `os` 最外层）补充 HTTP 层看不到的
信息：procedure path、翻译后的 `ORPCError.code` 和 procedure 耗时。它只记录失败——成功的浏览器
调用已经有 `tocsin.http` 访问日志（procedure 路径就在 URL 尾部），而 SSR 进程内调用
（`createRouterClient`）不经过 HTTP handler，失败时原本完全没有日志。由于 `withContext()` 包住
整个请求调用链（含 SSR 分支），这些记录自动带上同一个 `requestId`，与 HTTP 行可以关联。
Severity 跟随错误映射的 HTTP status：4xx 记 `warning`，5xx 与未翻译故障记 `error`。

## Category 与 Level

当前 category：

| Category               | 责任                                                      |
| ---------------------- | --------------------------------------------------------- |
| `tocsin.runtime`         | 日志运行时启动、系统信息等进程级事实。                    |
| `tocsin.http`            | HTTP 请求完成、失败、status 和 duration。                 |
| `tocsin.orpc`            | oRPC procedure 失败：procedure path、oRPC code、耗时。    |
| `tocsin.intake`          | Webhook 接入接受/拒绝、parser failure、Event 与投递计数。 |
| `tocsin.delivery`        | 单次 Delivery 成功、失败、重试和 destination 稳定结果。   |
| `tocsin.worker.delivery` | 后台 delivery worker 批次摘要和基础设施失败。             |
| `tocsin.oncall`          | 加急呼叫（ping）触发、入队、派发、fired/failed 与退避重试；含平台错误码与运维提示。 |
| `tocsin.worker.oncall`   | 后台加急 worker 批次摘要和基础设施失败。                  |

Level 约定：

- `trace` / `debug`：高频诊断和成功 probe。
- `info`：正常运行事实，例如接入成功、投递成功、非空 worker 批次。
- `warning`：可恢复或预期由产品处理的异常，例如认证拒绝、parser failure、Delivery retry/final
  failure。
- `error`：请求未捕获异常、worker 基础设施失败、HTTP 5xx。
- `fatal`：仅用于无法继续运行的进程级失败；当前没有常规调用点。

`TOCSIN_LOG_LEVEL` 接受 `trace`、`debug`、`info`、`warning`、`error`、`fatal`、`off`，默认
`info`。`TOCSIN_LOG_FORMAT` 接受 `auto`、`json`、`text`；`auto` 在 production 使用 JSON Lines，
development 使用 ANSI 文本。

## Secret-Safe 规则

日志采用“调用点白名单 + sink 兜底脱敏”两层策略。Sink 脱敏不是记录敏感对象的许可。

调用点允许的稳定维度包括：

- request/event/delivery/attempt/source/destination id。
- provider、destination kind、failure reason、error kind、retry hint。
- route/delivery/worker 数量、HTTP status、duration、attempt number。
- 已通过 `redactText()` 处理的稳定错误消息。
- ping id、被加急消息的 provider reference 类型、加急渠道 kind、trigger（`auto` / `manual`）。
- 事件 severity / status（用于回答"这条告警为什么没打电话"）。
- 呼叫对象 id（`open_id` / `user_id` / `union_id` 这类运维标识符）与操作者 user id：它们是排障所需的
  "谁被叫了、谁叫的"，不是 secret，与 destination 操作摘要里的接收人同一口径。

禁止记录：

- authorization、cookie、Source Token、额外共享密钥、session token。
- raw headers、raw payload、normalized message 全文。
- Source/Destination config、secret refs、webhook URL、SMTP password、signing secret。
- 飞书应用凭证（`app_id` / `app_secret`）与 `tenant_access_token`：加急与发送路径都只把它们交给
  adapter，调用点不得记 log；adapter 的结构化结果里也只允许出现平台错误码和已过 `redactText()` 的
  消息文本。
- rendered payload、destination response body、完整 request URL/query。
- raw `Error` 对象、stack 和 cause。

`server/runtime/log-safety.ts` 在 sink 前递归处理 structured properties、named placeholder 和
Error，仅保留安全的 error name/message，并复用 `@tocsin/core` 的 sensitive-key 与文本脱敏规则。
业务调用仍必须使用 named placeholder，不使用 template literal 或字符串拼接承载结构化字段。

## Sink 与扩展

默认只使用同步 console sink：production 输出 JSON Lines，development 输出 ANSI 文本。Docker、
Kubernetes 或 systemd 应从 stdout/stderr 采集；Tocsin 不把运行日志写入业务 SQLite，也不默认创建
本地日志文件。

未来接入 OpenTelemetry、Sentry、CloudWatch 或 syslog 时，在 `logging.ts` 增加 sink，并保持调用点
和 category 不变。异步 sink 需要同时设计 shutdown flush、backpressure 和失败隔离，不能直接从
业务模块发送日志。

浏览器日志是独立议题。当前 LogTape 配置只覆盖 server runtime，不把浏览器异常上传到服务端，也不
把服务端 secret-safe 假设套到 client console。

## 测试守护

- Logging Runtime 并发/重复初始化不抛 `ConfigError`。
- 两个并发 HTTP 请求的 `requestId` 不串线。
- request ID 校验、响应 header、probe level 和异常重抛有测试。
- sink 对 sensitive field、nested field、named placeholder 和 Error 执行脱敏。
- 真实 SQLite intake → delivery 流程验证日志包含稳定运维维度，且不包含 Token、密钥、payload、
  destination URL secret 或 response body secret。
- worker 默认 callback 不输出 raw Error；idle run 保持静默。
- 变更 `start.ts`、middleware 或 logging import chain 后必须运行 console production build，验证
  TanStack Start import protection。
