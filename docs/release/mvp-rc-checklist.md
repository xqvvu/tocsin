# MVP 完成与发布硬化 Checklist

本文档记录 Tocsin MVP baseline 的完成状态，以及从“可用 MVP”走向“可公开试用发布”的剩余硬化
gate。产品范围仍以 `docs/prd/self-hosted-alert-hub-mvp.md` 为准；架构规则仍以 `AGENTS.md`
和 `docs/architecture/*` 为准。

## 当前结论

截至 2026-06-26，Tocsin 可以视为 **MVP baseline 已完成**：Source → Webhook intake → Event →
Route → Destination → Delivery → Worker → History 的主链路已经贯通，并且具备 dashboard
登录、首次 setup、SQLite 持久化、provider/destination registry、TOML/JSON import/export、健康检查和
Docker runtime 形态。

这个结论的含义是：可以停止继续往 MVP PRD 里追加功能，进入下一轮产品讨论、产出新的 post-MVP PRD，
再用 `to-issues` 拆分新需求。

它不等于稳定公开发布已经完成。CI/E2E、生产部署文档、release checklist、部分 UI 深度和若干
长期可靠性策略仍应作为发布硬化项继续收尾。

## 已完成的 MVP 能力

- Dashboard：首次 setup、登录、dashboard shell、Sources、Routes、Destinations、Events、
  Deliveries、Settings 页面。
- Auth 边界：Dashboard 使用 Better Auth；Webhook intake 使用告警源接入 Token 与可选额外共享密钥，
  不依赖浏览器 session。
- Source 与 Provider：支持 generic、SigNoz、Grafana、Uptime Kuma、Alertmanager、FastGPT 模型探测解析器，
 通过 registry/catalog 暴露 client-safe 能力。
- Webhook intake：payload size limit、raw payload 保存、敏感字段脱敏、provider parse failure
  记录、idempotency dedupe、快速 accepted response。
- Event：保存不可变入站事件，展示规范化字段、脱敏 raw debug data、route matches 和关联
  deliveries。
- Route：支持 source、severity、status、label、title/message contains 规则匹配，并可路由到多个
  destinations。
- Destination：支持 generic webhook、Feishu、Slack、Email；具备 secret-safe preview/test、
  message template 与 rendered payload 记录。
- Delivery worker：SQLite-backed in-process worker，支持 pending/running/succeeded/failed 状态、
  attempt history、bounded retry、manual retry、adapter `retryHint`、stale running reclaim 与
  worker health projection。
- 配置：Sources、Routes、Destinations、Settings 可通过 UI 管理；TOML/JSON import/export 避免默认导出明文
  secret，并支持 env ref。
- Runtime：单进程、SQLite-first、application container、request context、显式 migrations、
  health/readiness endpoint、Dockerfile、docker compose 和数据卷。
- 架构边界：`@tocsin/core`、`@tocsin/providers`、`@tocsin/destinations`、`apps/console` 的职责边界已经建立，
  console 内部采用 route-first frontend 与 plain layered backend。

## 非目标

以下内容没有进入 MVP baseline。除非新的 PRD 明确接收，否则不要在发布硬化中顺手实现：

- Silence、suppression、maintenance window。
- Incident lifecycle、on-call scheduling、escalation policy。
- 更多 destination/provider 适配器，除非为了修复现有主链路。
- SaaS tenant、organization workspace、billing、多实例部署。
- 稳定 public management REST API。
- 大规模视觉重设计或 marketing-style dashboard。
- 重写路由规则系统或引入通用 workflow engine。

## 已知限制

### Route builder

Route matching 层支持完整 `RouteRule` schema，但当前可视化编辑器仍偏向常见单条件编辑。导入或已有规则里
出现多个同类条件时，编辑表单会展示明确的受限编辑提示，并在保存时只改每类第一条、保留其余条件。完整
多条件可视化编辑仍可作为后续增强。

### 模板

（2026-10-11 校正）结构化模板引擎已作为 post-MVP 切片交付：共享引擎支持 `text`、`feishu_card`、
`json_payload`、`slack_blocks` 四种模式，Email 另有 `subjectTemplate` 与 `htmlTemplate` 两个平级字段，
清单见 `docs/prd/destination-template-engine.md`，模式扩展决策见
`docs/adr/0010-destination-template-object-root-payload-and-html-escaping.md`。

仍未完成的是编辑体验：console 的 Destination 表单只对 Feishu 渲染模式选择器，`slack_blocks` 与
`json_payload` 只能经 config JSON / API / TOML 配置，Email 的两个新字段也没有表单输入项；缺口由
https://github.com/xqvvu/vane/issues/47 跟踪。

### 发布硬化

仓库已有 Docker runtime、health/readiness endpoint 和 root CI workflow（fmt-check / lint / test /
console build），但仍缺少关键浏览器 E2E workflow、compose smoke automation、正式发布 checklist、
生产部署/备份/升级/回滚文档。

### 运行时策略

raw payload retention 已可配置并在 intake 路径执行清理；服务端已有 LogTape 结构化日志、request ID
关联、JSON Lines 生产输出与 secret-safe 测试。delivery history retention、dedupe cleanup 成本上限和
外部 observability sink 仍应在发布或 post-MVP 中继续设计。

### Fixtures 与贡献体验

Provider adapters 已有测试，但真实 fixture 文件与 contributor guide 仍可以继续增强，帮助外部贡献者更容易增加
provider/destination。

## 剩余发布 Gate

### A. 发布工程

- [x] 增加 root/workspace CI workflow，至少运行 fmt-check、lint、test、console build。
- [ ] 增加关键浏览器 E2E workflow：setup/login、创建 Source、复制 webhook URL、创建/测试 Destination、
      创建 Route、发送 webhook、查看 Event/Delivery、过滤历史、失败 retry。
- [ ] 增加 Docker build/compose smoke automation。
- [x] 增加 health endpoint 与 readiness endpoint。
- [x] Dockerfile 提供 runtime image、数据卷和 container healthcheck。
- [x] docker compose 提供本地自托管试运行形态。
- [ ] 增加 release checklist。

### B. 文档

- [ ] 更新 README，将“仍处于 MVP 开发阶段”的措辞调整为“baseline complete / not stable release”。
- [ ] 补充 Docker 生产部署文档：反向代理/TLS、环境变量、数据卷、secret、健康检查。
- [ ] 补充备份/恢复/升级/回滚文档。
- [ ] 增加 provider/destination contributor guide 或 README 贡献切片。
- [x] 清理 `apps/console/README.md` starter 内容。
- [x] 对齐 README、package metadata、workspace 中的 Node/vp 版本说明。

### C. 产品与 UI 收尾

- [x] Route rule editor 对多 source、多 severity/status、多 label、多 title/message 条件提供完整编辑或明确的受限编辑提示。
- [x] Route summary / explain 文案继续打磨为运维人员容易理解的中文。
- [x] Event detail 展示 normalized fields、raw debug data、route matches、deliveries。
- [x] Delivery detail 展示 rendered payload、attempts、last error、next attempt、retry 操作。
- [x] Raw/debug JSON 至少具备可读的代码块展示；复制/折叠/search 可作为后续体验增强。
- [x] Sources、Routes、Destinations、Events、Deliveries 已采用紧凑运维型页面与表格形态。
- [x] Header 中 inert notification/help buttons 删除、隐藏或接上真实入口。

### D. 运行时与数据策略

- [x] Delivery worker 支持 stale running reclaim。
- [x] Delivery worker honor adapter `retryHint`。
- [x] 增加 worker health / last-run 状态。
- [x] raw payload retention 可配置并有测试覆盖。
- [ ] 增加 delivery history retention 或明确不自动清理 delivery history 的产品理由。
- [ ] 将 raw payload pruning / dedupe cleanup 从 intake hot path 中移出或限制成本。
- [ ] 评估 Delivery detail 所需的历史快照字段，避免配置重命名破坏历史解释。
- [x] 增加 secret-safe logging 测试或边界测试。

### E. Fixtures 与贡献体验

- [ ] 将 provider inline payload tests 扩展为 fixture 文件。
- [ ] 覆盖 SigNoz、Grafana、Uptime Kuma、Alertmanager、FastGPT 的多版本/代表性 payload。
- [ ] 增加 adapter 开发贡献指南：manifest、schema、preview/send、secret handling、tests、registry。

## 下一轮 PRD 候选

下一轮讨论应该从具体 PRD 进入，而不是继续扩写 MVP：

- Destination 结构化模板引擎：Feishu 卡片、Slack blocks、Email HTML、generic JSON payload template。
  （2026-10-11 已完成，见 `docs/prd/destination-template-engine.md`；剩余缺口是上文的表单侧模式选择。）
- Alert 操作增强：silence、suppression、maintenance window、per-fingerprint mute。
- 搜索与排障体验：更强的 Events/Deliveries filter、时间范围、fingerprint 视图、route explain。
- 自托管发布硬化：CI/E2E/Docker smoke、部署文档、备份恢复、升级回滚。
- Adapter 贡献体验：fixture 体系、contributor guide、adapter scaffold。

## 验收标准

MVP baseline 已能覆盖以下演示路径；发布前仍需要用自动化 E2E 和 Docker smoke 固化：

1. 使用 Docker 或本地命令启动 Tocsin。
2. 首次 setup owner/admin 并登录 dashboard。
3. 创建一个告警源，复制 webhook URL 和接入 Token。
4. 创建一个投递目标并完成 preview/test。
5. 创建一条包含多个条件的路由规则。
6. 向 webhook 发送代表性告警载荷。
7. 在 Events 中看到规范化告警、route match、脱敏 raw debug data。
8. 在 Deliveries 中看到投递状态、attempts、rendered payload、失败与 retry 行为。
9. 重启进程后 worker 不遗留永久 running delivery。
10. 导出 TOML 或 JSON 时不包含明文 secret。
11. 发布 gate 中，CI、测试、build、Docker smoke 和 E2E 通过。
12. 发布文档能指导用户完成自托管部署、备份、升级和恢复。
