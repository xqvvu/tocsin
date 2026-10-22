# Tocsin

Tocsin 是一个面向 SRE 和运维团队的开源、自托管 Alert Hub。它接收来自 SigNoz、Grafana、Uptime Kuma、Alertmanager、FastGPT 或自定义系统的告警 webhook，将 payload 规范化为统一事件，再按简单、可审计的规则路由到 Feishu、Slack、Email 或通用 webhook 等通知目标。

Tocsin 的目标不是做 SaaS 平台，也不是做通用工作流引擎。它更接近一个可以私有部署的运维基础设施组件：一个进程、一个 SQLite 数据库、一个数据卷，清楚记录告警从进入、规范化、匹配、投递、重试到失败的完整路径。

> 当前状态：**MVP baseline 已完成，但还不是稳定发布版**。核心架构、控制台、SQLite 持久化、认证、
> 配置、投递与 UI 基础都已落地，Source → Webhook → Event → Route → Destination → Delivery → Worker →
> History 主链路与 Docker 运行形态可用；浏览器 E2E 已接入 CI（`.github/workflows/e2e.yml`）；仍缺少
> 稳定的 migration 兼容承诺和公开管理 API（Docker smoke 保留为本地人工 gate），所以请按“可试用的自托管 MVP”
> 而不是“生产就绪的稳定版”来评估。
> 发布硬化清单见 `docs/release/mvp-rc-checklist.md`。

## 为什么需要 Tocsin

团队常常同时使用多套监控与告警系统。每个系统都要分别配置 Feishu、Slack、邮件或 webhook，导致：

- 通知渠道和密钥分散在多个上游系统中。
- 告警路由规则重复、难以审计。
- 无法统一回答“Tocsin 收到了什么、匹配了哪条规则、发送到了哪里、为什么失败”。
- 上游重试、目的端故障、重复告警和敏感字段处理缺乏一致策略。

Tocsin 把这些能力集中到一个私有部署里：

- Sources 代表上游告警发送方，每个 Source 有独立 webhook URL 和 token。
- Events 记录每次进入 Tocsin 的 webhook 请求和规范化后的告警字段。
- Routes 用简单条件匹配 Source、severity、status、labels、title、message。
- Destinations 保存通知目标配置与模板，密钥只留在服务端。
- Deliveries 异步投递并记录状态、尝试次数、失败原因和重试计划。

## 当前能力

仓库当前实现围绕 MVP Alert Hub 方向展开：

- TanStack Start 控制台，包含登录、首次 setup、dashboard shell、Sources、Routes、Destinations、Events、Deliveries、Suppressions（静默）、Integrations（飞书应用）和 Settings 页面。
- Better Auth dashboard 登录；首次注册用户可成为 owner。
- SQLite-first 持久化层，显式 migrations，仓储位于 `apps/console/src/infra/sqlite/repositories/`，按 Sources、Destinations、Routes、Intake、Deliveries、History、Settings、Suppression、Feishu App、On-call 切分。
- Provider parser registry：`generic`、`signoz`、`grafana`、`uptime_kuma`、`alertmanager`、`fastgpt`。
- FastGPT 模型探测 Source：接收 FastGPT 模型状态探测 webhook（`model_status_error` / `model_status_recovered`），把探测状态 red/yellow/green 规范化为 firing/resolved 告警，并以 `modelId` 作为 fingerprint；FastGPT 侧的 `webhookUrl` 填 Tocsin 的接入 URL，`webhookToken` 填 Tocsin 的接入 Token。
- Destination sender registry：`generic_webhook`、`feishu`、`slack`、`email`。
- 飞书加急（on-call 电话呼叫）：飞书自建应用是独立可复用资源（登记、测试凭证、被引用时拒删），飞书
  通知目标可选「应用发送模式」（卡片由应用发出并把 `message_id` 记为该次投递的 provider reference），
  在此之上对命中的 firing 投递按 severity 门槛自动或手动向呼叫对象发起 `urgent_phone`。加急有自己的
  状态机、指数退避与 `(指纹, 通知目标, 呼叫对象)` 去重窗口：电话失败不重发卡片，卡片重试不重复打电话。
- Route rule、normalized event、delivery job、portable config 等核心 schema 位于 `@tocsin/core`。
- SQLite-backed in-process delivery worker，支持异步投递、状态记录、失败重试和手动运行。
- TOML import/export 基础，默认避免导出明文 secret，并支持环境变量引用。
- shadcn/base-ui 风格的紧凑运维 UI，包含错误页、404、profile menu、toast、loading skeleton 等基础体验。
- Dockerfile 与 docker-compose 本地自托管形态。

## 项目结构

```txt
apps/console
  TanStack Start console。拥有 UI、API routes、Better Auth、SQLite、migrations、
  oRPC procedures、按能力组织的 services、SQLite repositories、in-process worker 和 Docker runtime。

packages/core
  共享领域 schema、类型、路由规则、delivery 类型、config schema、JSON helper、
  redaction helper 和共享错误。

packages/api
  env-neutral 的 oRPC 契约层：contract、共享 error map、procedure input/output schema
  与 client helper；浏览器与 server 从同一处推导类型。

packages/providers
  入站 provider parser 与 provider registry。

packages/destinations
  出站 destination sender、message template、destination registry，以及并列的 urgency channel
  registry（加急呼叫，v1 为 `feishu_urgent_phone`）。

docs
  PRD 与架构文档。产品范围以 docs/prd/self-hosted-alert-hub-mvp.md 为准。
```

更详细的架构说明见：

- `docs/prd/self-hosted-alert-hub-mvp.md`
- `docs/architecture/frontend-architecture.md`
- `docs/architecture/sqlite-store.md`
- `docs/architecture/application-container.md`
- `docs/contributing/destination-adapter.md`（新增 destination adapter 的操作手册）

## 本地开发

要求：

- Node.js `26.x`（以仓库根目录的 `.node-version` 为准）
- pnpm `12.14.0`（由 `package.json` 的 `packageManager` 声明）

工程化统一由 [Vite+](https://vite.plus) 的 `vp` CLI 提供：Vite、Vitest、Oxlint、Oxfmt 和任务编排都在一个入口下。`vite-plus` 是仓库根目录的 devDependency，用 `vp` 前先在根目录安装一次依赖。

安装依赖：

```bash
vp install
```

准备 console 环境变量：

```bash
cp apps/console/.env.example apps/console/.env.local
```

启动开发服务器：

```bash
vp -C apps/console dev
```

运行检查：

```bash
vp check            # 格式化 + lint + 类型检查
vp fmt --check      # 只检查格式化
vp lint             # 只做 lint
vp run -r test      # 跑全部包的测试
vp run -r build     # 构建全部包
```

只针对某个包工作时，用 `vp -C <dir> <command>`，例如 `vp -C apps/console test run`。

常用环境变量：

| 变量 | 说明 |
| --- | --- |
| `BETTER_AUTH_URL` | Better Auth 对外 URL，本地通常是 dev server URL。 |
| `BETTER_AUTH_SECRET` | Better Auth secret，生产必须使用 32+ 字符随机值。 |
| `BETTER_AUTH_ALLOWED_HOSTS` | 可选，逗号或换行分隔的 Better Auth 动态 base URL Host 白名单，例如 `localhost:6180,tocsin.example.com`。通过 PVC、反向代理或预览域名访问时需要加入外部 Host。 |
| `BETTER_AUTH_TRUSTED_ORIGINS` | 可选，逗号或换行分隔的额外可信 Origin，例如 `http://localhost:6180,https://tocsin.example.com`，用于通过 Better Auth 的 CSRF/origin 检查。 |
| `SERVER_URL` | Tocsin 对外访问 URL，用于生成 webhook URL 等。 |
| `TOCSIN_DATABASE_PATH` | SQLite 数据库路径。 |
| `TOCSIN_MAX_WEBHOOK_BYTES` | 入站 webhook 最大 payload 大小。 |
| `TOCSIN_WORKER_BATCH_SIZE` | delivery worker 每批处理数量。 |
| `TOCSIN_WORKER_INTERVAL_MS` | delivery worker 轮询间隔。 |
| `TOCSIN_WORKER_STALE_RUNNING_MS` | running delivery 超时回收窗口。 |
| `TOCSIN_FEISHU_APP_<APP_ID>_APPSECRET` | 配置导出里飞书应用密钥的环境变量引用；导入时从该变量取值，避免明文 secret 进仓库或进配置文件。 |

> `TOCSIN_WORKER_*` 同时作用于 delivery 队列与加急队列：两个 worker 在同一进程内各自轮询。

## 飞书加急部署前提

电话加急（`urgent_phone`）依赖飞书开放平台的应用能力与租户额度，上线前逐项确认：

1. **自建应用与凭证**：在[开发者后台](https://open.feishu.cn/app)创建自建应用，把 `app_id` 与
   `app_secret` 登记到 Tocsin 的「飞书应用」页面，并用测试按钮验证凭证可换到 `tenant_access_token`。
2. **开通机器人能力**：应用必须启用机器人能力，否则发消息与加急都会报 `230006`。
3. **申请权限**：发送消息需要 `im:message` 或 `im:message:send_as_bot`；电话加急需要
   `im:message.urgent:phone`（历史版本 `im:message.urgent:phone_send`）；呼叫对象若按 `user_id`
   录入，还需 `contact:user.employee_id:readonly`。权限变更后要发布应用版本才生效。
4. **机器人必须在目标群内**：`chat_id` 指向的群需要先添加该应用机器人，否则报 `230002`；群设置里的
   加急权限要允许该机器人发起加急（「所有群成员可以加急」，或「仅群主或管理员可以加急」且机器人是
   管理员），否则报 `230052`。
5. **呼叫对象在应用可用范围内**：接收人（`open_id` / `user_id` / `union_id`）必须在应用可用范围内且
   仍在租户内，否则报 `230013`；接收人还必须是该消息所在群的成员，否则接口返回 `code 0` 却把人列进
   `invalid_user_id_list` —— Tocsin 把这种呼叫判为失败，不会记成已打通。
6. **额度与计费**：电话与短信加急消耗企业加急额度，可在[管理后台](https://admin.feishu.cn/) ›
   费用中心 › 权益数据 › 短信/电话加急查看。额度耗尽报 `230024`，Tocsin 判定为不可重试并把提示写进加急
   记录；单个用户未读加急超过 200 条报 `230023`，属于暂时性失败，会退避重试。
7. **频控**：加急与发消息接口为每应用每租户 1000 次/分钟、50 次/秒；自定义群机器人 webhook 是单租户
   单机器人 100 次/分钟、5 次/秒，官方建议避开 10:00、17:30 等整点半点。触发限流（`99991400` 或
   HTTP 429）时 Tocsin 退避重试。
8. **平台限制**：只能加急本机器人自己发送的消息，因此 webhook 模式的投递无法加急（UI 会说明原因）；
   批量发送（`bm_` 前缀消息）不支持加急，折叠会话内的加急只做应用内推送。

错误码分类与核实来源见 `docs/adr/0009-oncall-feishu-urgent.md`。

## Docker 试运行

本地构建并启动：

```bash
BETTER_AUTH_SECRET="$(openssl rand -hex 32)" docker compose up --build
```

默认服务会暴露在 `http://localhost:3000`，SQLite 数据放在 `tocsin-data` volume 中。

这份 compose 文件是本机试运行形态，不是生产方案：未显式提供 `BETTER_AUTH_SECRET` 时，它只会回落到一个
公开占位值，应用在 production 模式下会拒绝提供服务（含健康检查）；它也没有 TLS 与 secret 注入。生产部署、反向代理、环境变量与健康检查见
`docs/release/docker-production-deployment.md`；备份、恢复、升级与回滚见
`docs/release/backup-restore-upgrade.md`；切 tag 的流程见 `docs/release/release-checklist.md`。

## Roadmap

### 0. 已落地的基础

- 建立 Tocsin 的领域语言：Sources、Events、Routes、Destinations、Deliveries、History。
- 建立 monorepo 包边界：`core`、`providers`、`destinations`、`console`。
- 建立 SQLite-first store、显式 migrations 和 repository 分层。
- 建立 application container、request context、dashboard session 类型与 webhook auth 分离。
- 建立 provider parser registry 和 destination sender registry。
- 建立 TanStack Start 控制台的 route-first + feature module 方向。
- 建立 dashboard 登录、first setup、error/not-found、toast、skeleton、profile menu 等基础体验。

### 1. MVP 功能收尾

- 完善 Source 生命周期：创建、禁用、更新、token 轮换、额外共享密钥校验与审计提示。
- 完善 webhook intake：payload size limit、redaction、provider parse error、duplicate request dedupe、快速 accepted response。
- 完善 Event detail：normalized fields、raw debug view、route match 解释、关联 deliveries。
- 完善 Delivery detail：rendered payload、attempt history、last error、next attempt、手动 retry。
- 完善 Route authoring：更清晰的条件编辑、匹配预览、目标 destination 多选与规则解释。
- 完善 Destination test/preview：真实发送测试、模板预览、失败信息脱敏展示。
- 完善 TOML import/export：secret env ref、导入差异预览、校验错误定位、配置迁移策略。
- 补齐端到端 workflow 测试：Source -> Event -> Route -> Delivery -> retry/history。

### 2. 自托管发布硬化

- 整理生产部署文档：Docker、反向代理、数据卷、备份恢复、升级步骤。
  （已完成：`docs/release/docker-production-deployment.md`、`docs/release/backup-restore-upgrade.md`）
- 明确 migration 与版本升级策略，保证 SQLite schema 向前兼容。
  （升级/回滚后果已写入 `docs/release/backup-restore-upgrade.md`；migration plan 已有 `0001`
  baseline + `0002`/`0003` forward step，后续 schema 变更按 forward-only 处理）
- 增加 webhook、worker、delivery、auth 的运行时观测日志。
- 增加配置和敏感字段的安全测试，防止 token hash、destination secret、raw secret config 泄露到客户端。
- 明确默认 retention 策略，限制 raw payload 与 delivery history 的 SQLite 增长。
- 增加 release checklist（已完成：`docs/release/release-checklist.md`）和示例配置
  （`examples/feishu/` 有飞书卡片模板，部署样例仍缺）。

### 3. 集成扩展

- 为常见 provider 增加更多真实 fixture：SigNoz、Grafana、Uptime Kuma、Alertmanager、FastGPT 的多版本 payload。
- 为 Feishu、Slack、Email、Generic webhook 增强模板与卡片格式。
- 增加更多 destination adapter，例如 Discord、Telegram、Teams 或企业内部 webhook 规范。
- 增加 provider/destination contributor guide，让外部贡献者可以只实现 adapter、fixtures 和 tests。

### 4. 运维体验增强

- 更强的搜索和筛选：按 source、severity、status、destination、delivery state、fingerprint、时间范围过滤。
- 更好的 retry 操作：批量 retry、retry reason、retry 后差异记录。
- 更清晰的 route explain：某个 Event 为什么匹配或没有匹配某条 Route。
- 更细的 dashboard 权限：owner/admin/member 的只读与管理边界。
- 更完善的配置审计：谁在何时改了 Source、Route、Destination 或 Settings。

### 5. MVP 之后的可能方向

这些能力为未来保留空间，但不是 MVP 承诺：

- Alert grouping、per-fingerprint mute、重复告警聚合。
- Incident lifecycle、on-call scheduling、escalation policy。
- 多实例部署、分布式队列、Postgres/Redis/Kafka/Temporal 等外部中间件。
- SaaS tenant、billing、organization workspace。
- 稳定公开管理 REST API。
- Tocsin-owned YAML 配置格式。

## 设计约束

- 默认部署形态是单进程、SQLite、一个 Docker image、一个数据卷。
- Dashboard auth 和 webhook auth 是两条不同边界；webhook intake 不依赖浏览器 session。
- Route rules 和 message templates 不执行用户提供的 JavaScript、shell、SQL 或动态代码。
- Secrets 保持 server-side，不进入 route loader data、query data、client props、TOML 默认导出或浏览器日志。
- UI 面向重复使用的运维工作流，优先表格、筛选、详情、明确启停和可审计动作。
- Tocsin-owned portable config 使用 TOML，不使用 YAML。

## 贡献方向

优先贡献这些小而清晰的切片：

- 新 provider parser：adapter、fixtures、normalization tests、registry registration。
- 新 destination sender：按 `docs/contributing/destination-adapter.md` 操作（scaffold + checklist +
  registry registration）。
- 控制台 feature：保持 route thin，把表单、表格、query/mutation 放入 `features/*`。
- SQLite 变更：新增 forward-only migration，并补 migration/store tests。
- 文档变更：中文优先，产品范围和架构决策写入 `docs`。

请先阅读 `AGENTS.md` 和 `docs/prd/self-hosted-alert-hub-mvp.md`。它们定义了当前仓库的工作方式、产品范围和非目标。
