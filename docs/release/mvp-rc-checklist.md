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

它不等于稳定公开发布已经完成。截至 2026-10-20，发布文档（release checklist、Docker 生产部署、
备份/恢复/升级/回滚）与 README 的状态措辞已经补齐，见 `docs/release/`；仍未完成的发布 gate 有
三类：dedupe cleanup 成本上限（D 节）、provider inline payload fixture 化与多版本 payload 覆盖
（E 节），以及 provider 侧 contributor guide（B/E 节）。关键浏览器 E2E 已接入 CI
（`.github/workflows/e2e.yml`，2026-10-22），但 spec 覆盖面仍小于 gate 要求（见 A 节与 REL-22）。compose smoke 已交付并明确保留为本地人工 gate，不计划接入 CI；
delivery history retention 已决定不自动清理，理由见
`docs/release/history-retention-and-snapshots.md` §1。

## 已完成的 MVP 能力

- Dashboard：首次 setup、登录、dashboard shell、Sources、Routes、Destinations、Events、
  Deliveries、Suppressions（列表、创建、编辑、启停、删除、命中投递查看）、Integrations
  （飞书应用登记、测试、被引用保护）、Settings 页面。
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
- Delivery worker：SQLite-backed in-process worker，支持 pending/running/succeeded/failed/suppressed 状态、
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

- Silence、suppression、maintenance window。（2026-10-18 校正）抑制已作为 post-MVP 切片落地：
  `@tocsin/core` 有抑制领域模型、匹配器与生命周期投影，`silence` 与 `maintenance_window` 是同一机制下
  的两种 kind；SQLite 有 `suppressions` 表（`0002_suppressions`）与 delivery 的抑制审计列，投递在入队与
  认领时会命中规则并落 `suppressed` 状态（不发送）。dashboard 已有 suppression service、
  `suppressions` oRPC namespace 与 `/suppressions` 页面，支持列表、创建、编辑、启停、删除和命中投递查看。
  窗口结束后的通知型汇总仍不做。PRD 与决策见 `docs/prd/alert-suppression.md`、
  `docs/prd/alert-suppression-decisions.md`。
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
https://github.com/xqvvu/tocsin/issues/47 已在 `xqvvu/tocsin` 关闭，清单原先描述的三个具体缺口均已不再成立。

### 发布硬化

（2026-10-13 校正）发布文档已经补齐：

- `docs/release/release-checklist.md`：切第一个 tag 的人工流程，含“仓库没有任何 release 自动化”的事实。
- `docs/release/docker-production-deployment.md`：反向代理/TLS、环境变量、数据卷、secret、健康检查，
  并把“没有 TLS 终止、没有 Docker secret 注入”写成已知缺口；compose 公开默认 `BETTER_AUTH_SECRET`
  已移除，缺失或沿用历史公开值会让生产进程启动失败。
- `docs/release/backup-restore-upgrade.md`：SQLite 冷备份/恢复、升级、回滚，以及 baseline + forward
  repair migration（0001–0003）的升级约束。

自动化接入现状：`.github/workflows/ci.yml` 跑 `check · test · build`，`.github/workflows/e2e.yml`
跑浏览器 E2E（两者都在 `push` 到 main 与 `pull_request` 触发，tag 不触发任何东西）；本地入口分别是
`just e2e` 与 `just docker-smoke`。Docker smoke 不再计划接入 CI（见 gate 说明）。

### 运行时策略

raw payload retention 已可配置并在 intake 路径执行清理；服务端已有 LogTape 结构化日志、request ID
关联、JSON Lines 生产输出与 secret-safe 测试。delivery history retention 已决定不自动清理（见
`docs/release/history-retention-and-snapshots.md` §1）；dedupe cleanup 成本上限和外部 observability
sink 仍应在发布或 post-MVP 中继续设计。

### Fixtures 与贡献体验

（2026-10-13 校正）destination 侧已经有 contributor guide：`docs/contributing/destination-adapter.md`
覆盖 scaffold、manifest、config schema、preview/send、secret handling、tests 与 registry 注册点，配套
`scripts/new-destination-adapter.mjs`（`just new-destination <kind>`）与 registry audit。provider 侧还没有
对应指南，也不存在 fixture 文件（payload 仍写在 inline 测试里），这两条继续留在 E 节。

## 剩余发布 Gate

### A. 发布工程

- [x] 增加 root/workspace CI workflow，至少运行 fmt-check、lint、test、console build。
- [x] 增加关键浏览器 E2E workflow：`.github/workflows/e2e.yml`（Playwright + Chromium，`push` 到 main
      与 `pull_request` 触发，失败上传 `apps/console/test-results`，保留 3 天）。本机 `just e2e` 实测通过。
- [ ] 扩展 E2E spec 覆盖到 gate 要求的全部步骤：创建 Route、发送 webhook 后查看 Delivery、过滤历史、
      失败 retry。当前 spec 覆盖 setup/login、Source、Destination 与 Event（见 REL-22）。
- [x] 增加 Docker build/compose smoke automation。→ `just docker-smoke` / `scripts/docker-smoke.sh`：构建镜像 → 起栈 → 等 `/api/ready` → 断言 `/api/health` 与 `/api/ready` 不同 → 断言 `/data/tocsin.sqlite` 已挂载 → 断言首页出 HTML → 拆栈并删卷。**已在本机实测通过**（见 PR）。故意不进 `ci.yml`：构镜像慢，快速门禁应保持快。
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
      （2026-10-18 校正）README 与 AGENTS.md 的 pnpm 版本已对齐 `packageManager` 的 `pnpm@12.14.0`。

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
- [x] 增加 delivery history retention 或明确不自动清理 delivery history 的产品理由。→ **决定不自动清理**，理由与代价见 `docs/release/history-retention-and-snapshots.md` §1。
- [x] 将 raw payload pruning 从 intake hot path 中移出或限制成本。→ 接入改为**有界批**（100/次，主键定位），积压由响应路径外的单飞 sweep 清空；保留行为不变。见 `docs/release/history-retention-and-snapshots.md` §2。
- [ ] 将 dedupe cleanup 从接入热路径移出或限制成本。→ 尚未完成：`pruneDedupeKeys` 仍是**无界** `DELETE FROM delivery_dedupe_keys`，并且在每次 `enqueueForEvent` 内执行（`apps/console/src/infra/sqlite/repositories/delivery/delivery.helpers.ts:107-108`、`delivery.repository.ts:101`）。这与「运行时策略」中「dedupe cleanup 成本上限仍应继续设计」一致。
- [x] 评估 Delivery detail 所需的历史快照字段，避免配置重命名破坏历史解释。→ **评估完成：缺陷成立**（改名会追溯改写历史显示名；删除则级联删掉投递行）。需 schema 变更，属发布决策，见 `docs/release/history-retention-and-snapshots.md` §3。
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
  （2026-10-18 校正：领域模型、持久化、投递层执行、service/oRPC/页面均已落地；仍未落地的是窗口结束后的
  通知型汇总和抑制 retention 清理。）
- 搜索与排障体验：更强的 Events/Deliveries filter、时间范围、fingerprint 视图、route explain。
  （2026-10-18 校正：Events/Deliveries 筛选、相对时间范围、按事件/投递 ID 搜索、投递按失败原因/
  目标/路由搜索与 route explain 均已落地；仍未实现的是 fingerprint 聚合视图、绝对时间窗口与筛选结果导出。）
- 自托管发布硬化：CI/E2E/Docker smoke、部署文档、备份恢复、升级回滚。
  （2026-10-18 校正：部署、备份恢复、升级回滚文档与 release checklist 已完成；E2E 脚本已落地。
  2026-10-22：E2E 已接入 CI（`.github/workflows/e2e.yml`）；Docker smoke 按既定决定保持本地人工 gate。）
- Adapter 贡献体验：fixture 体系、contributor guide、adapter scaffold。
  （2026-10-13 校正：destination 的 contributor guide 与 scaffold 已完成；provider 的 fixture 体系仍缺。）

## 验收标准

MVP baseline 已能覆盖以下演示路径；E2E 由 CI 自动运行，Docker smoke 发布前仍需人工执行
（保持本地人工 gate）：

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

> 第 12 条的文档已经就位（`docs/release/`），但**没有在真实部署上演练过**：E2E 已在 CI 中运行，
> Docker smoke 仍是本地脚本，备份/恢复/回滚步骤也只是标准工具用法，未在部署环境执行。首次发布前应把
> 第 11、12 条当成人工验收项，而不是已完成项。
