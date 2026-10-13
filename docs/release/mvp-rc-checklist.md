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

它不等于稳定公开发布已经完成。截至 2026-10-13，发布文档（release checklist、Docker 生产部署、
备份/恢复/升级/回滚）与 README 的状态措辞已经补齐，见 `docs/release/`；仍然缺的是关键浏览器 E2E
workflow、compose smoke automation，以及 delivery history retention 之类的长期可靠性策略。

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
- 架构边界：`@tocsin/core`、`@tocsin/api`（oRPC 契约层，2026-10-13 补记）、`@tocsin/providers`、
  `@tocsin/destinations`、`apps/console` 的职责边界已经建立，console 内部采用 route-first frontend 与
  plain layered backend。

## 非目标

以下内容没有进入 MVP baseline。除非新的 PRD 明确接收，否则不要在发布硬化中顺手实现：

- Silence、suppression、maintenance window。（2026-10-13 校正）抑制已经作为 post-MVP 切片**部分落地**：
  `@tocsin/core` 有抑制领域模型、匹配器与生命周期投影，`silence` 与 `maintenance_window` 是同一机制下
  的两种 kind；SQLite 有 `suppressions` 表与 delivery 的抑制列，投递在入队与认领时会命中规则并落
  `suppressed` 状态（不发送）。但**产品里还没有创建/管理抑制规则的入口**：没有 suppression service、
  oRPC procedure、页面，投递侧只有状态展示，所以今天不能把它当作可用功能对外描述。PRD 与决策见
  `docs/prd/alert-suppression.md`、`docs/prd/alert-suppression-decisions.md`。
- Incident lifecycle、on-call scheduling、escalation policy。
- 更多 destination/provider 适配器，除非为了修复现有主链路。
- SaaS tenant、organization workspace、billing、多实例部署。
- 稳定 public management REST API。
- 大规模视觉重设计或 marketing-style dashboard。
- 重写路由规则系统或引入通用 workflow engine。

## 已知限制

### Route builder

（2026-10-13 校正）可视化编辑器现在会列出并逐条编辑规则里的**每一个**条件条目（source / severity /
status / label / title / message），保存时不再只改每类第一条、保留其余条件
（`apps/console/src/features/routes/ui/route-forms.tsx`，commit `2dd1b5c`）。仅当规则引用了**当前已不存在
的配置值**（例如被删掉的 source）时，才显示受限编辑提示并要求用户先移除这些条目
（`route-edit-restricted-notice.tsx`）；原来的“多条件只能编辑第一条”限制已经不成立。

### 模板

（2026-10-11 校正）结构化模板引擎已作为 post-MVP 切片交付：共享引擎支持 `text`、`feishu_card`、
`json_payload`、`slack_blocks` 四种模式，Email 另有 `subjectTemplate` 与 `htmlTemplate` 两个平级字段，
清单见 `docs/prd/destination-template-engine.md`，模式扩展决策见
`docs/adr/0010-destination-template-object-root-payload-and-html-escaping.md`。

（2026-10-13 校正）上面这条编辑体验缺口也已经消失：Destination 表单按 manifest 渲染模式选择器
（`generic_webhook`: `text` / `json_payload`，`slack`: `text` / `slack_blocks`，`feishu`: `text` /
`feishu_card`，见 `packages/destinations/src/*/manifest.ts` 与
`apps/console/src/features/destinations/model/destination-form.ts`），Email 的 `subjectTemplate` 与
`htmlTemplate` 已是表单输入项，并带模板变量引用面板。issue
https://github.com/xqvvu/vane/issues/47 的剩余范围无法在离线环境核对（GitHub 不可达），但清单原先描述的
三个具体缺口已不再成立。

### 发布硬化

（2026-10-13 校正）发布文档已经补齐：

- `docs/release/release-checklist.md`：切第一个 tag 的人工流程，含“仓库没有任何 release 自动化”的事实。
- `docs/release/docker-production-deployment.md`：反向代理/TLS、环境变量、数据卷、secret、健康检查，
  并把“没有 TLS 终止、没有 Docker secret 注入、compose 内置公开默认 `BETTER_AUTH_SECRET`”写成已知缺口。
- `docs/release/backup-restore-upgrade.md`：SQLite 冷备份/恢复、升级、回滚，以及单一 baseline migration
  的后果。

仍然缺的是自动化：仓库只有 `.github/workflows/ci.yml`（`check · test · build`，`push` 到 main 与
`pull_request` 触发，tag 不触发任何东西），没有关键浏览器 E2E workflow，也没有 compose/Docker smoke
automation；这两条继续留在下面的发布 gate 里。

### 运行时策略

raw payload retention 已可配置并在 intake 路径执行清理；服务端已有 LogTape 结构化日志、request ID
关联、JSON Lines 生产输出与 secret-safe 测试。delivery history retention、dedupe cleanup 成本上限和
外部 observability sink 仍应在发布或 post-MVP 中继续设计。

### Fixtures 与贡献体验

（2026-10-13 校正）destination 侧已经有 contributor guide：`docs/contributing/destination-adapter.md`
覆盖 scaffold、manifest、config schema、preview/send、secret handling、tests 与 registry 注册点，配套
`scripts/new-destination-adapter.mjs`（`just new-destination <kind>`）与 registry audit。provider 侧还没有
对应指南，也不存在 fixture 文件（payload 仍写在 inline 测试里），这两条继续留在 E 节。

## 剩余发布 Gate

### A. 发布工程

- [x] 增加 root/workspace CI workflow，至少运行 fmt-check、lint、test、console build。
- [ ] 增加关键浏览器 E2E workflow：setup/login、创建 Source、复制 webhook URL、创建/测试 Destination、
      创建 Route、发送 webhook、查看 Event/Delivery、过滤历史、失败 retry。
- [ ] 增加 Docker build/compose smoke automation。
- [x] 增加 health endpoint 与 readiness endpoint。
- [x] Dockerfile 提供 runtime image、数据卷和 container healthcheck。
- [x] docker compose 提供本地自托管试运行形态。
- [x] 增加 release checklist：`docs/release/release-checklist.md`。首个 tag 是全人工流程，仓库没有 release
      workflow、changelog 工具或既有 tag。

### B. 文档

- [x] 更新 README，将“仍处于 MVP 开发阶段”的措辞调整为“baseline complete / not stable release”。
      （2026-10-13 完成，保留“不是稳定发布版”的诚实表述；顺带修正 README 里过时的 pnpm 版本号与缺失的
      `packages/api` 结构说明。）
- [x] 补充 Docker 生产部署文档：反向代理/TLS、环境变量、数据卷、secret、健康检查。
      `docs/release/docker-production-deployment.md`（缺失的 TLS 终止与 secret 注入按已知缺口写明，没有编造流程）。
- [x] 补充备份/恢复/升级/回滚文档。`docs/release/backup-restore-upgrade.md`。
- [x] 增加 provider/destination contributor guide 或 README 贡献切片：destination 侧已完成
      （`docs/contributing/destination-adapter.md`，commit `b2173f2`，README「贡献方向」也已链接）；provider 侧
      仍未开始，保留在 E 节。
- [x] 清理 `apps/console/README.md` starter 内容。
- [x] 对齐 README、package metadata、workspace 中的 Node/vp 版本说明。
      （2026-10-13 校正）README 里写成 pnpm `12.6.0`，实际 `packageManager` 是 `pnpm@12.10.1`，已修正。

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
- [x] 增加 adapter 开发贡献指南：manifest、schema、preview/send、secret handling、tests、registry。
      （2026-10-13 校正：这项在名单里一直没勾，但内容早已由 `docs/contributing/destination-adapter.md` 覆盖
      —— 含 scaffold、manifest/config schema 契约、preview/send 失败形状、secret handling、test-kit 与
      registry 注册点，对应 commit `b2173f2`；上游 PR 号（据称 #85）无法在本地历史里核对。范围仍只限
      destination adapter，provider 与 urgency adapter 不在该指南内。）

## 下一轮 PRD 候选

下一轮讨论应该从具体 PRD 进入，而不是继续扩写 MVP：

- Destination 结构化模板引擎：Feishu 卡片、Slack blocks、Email HTML、generic JSON payload template。
  （2026-10-11 已完成，见 `docs/prd/destination-template-engine.md`；2026-10-13 校正：表单侧的模式选择也
  已落地，见上文的模板小节。）
- Alert 操作增强：silence、suppression、maintenance window、per-fingerprint mute。
  （2026-10-13 校正：抑制的领域模型、持久化与投递层执行已落地，`fingerprints` 也在 matcher 里；仍未落地的
  是创建/管理入口（service、procedure、页面）与窗口结束后的通知型汇总。）
- 搜索与排障体验：更强的 Events/Deliveries filter、时间范围、fingerprint 视图、route explain。
- 自托管发布硬化：CI/E2E/Docker smoke、部署文档、备份恢复、升级回滚。
  （2026-10-13 校正：部署、备份恢复、升级回滚文档与 release checklist 已完成；E2E 与 Docker smoke 自动化
  仍未落地。）
- Adapter 贡献体验：fixture 体系、contributor guide、adapter scaffold。
  （2026-10-13 校正：destination 的 contributor guide 与 scaffold 已完成；provider 的 fixture 体系仍缺。）

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

> 第 12 条的文档已经就位（`docs/release/`），但**没有在真实部署上演练过**：仓库没有 E2E 与 Docker
> smoke 自动化，备份/恢复/回滚步骤也只是标准工具用法，未在部署环境执行。首次发布前应把第 11、12 条当成
> 人工验收项，而不是已完成项。
