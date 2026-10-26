# Post-MVP Planning

本文档是 Tocsin MVP baseline 完成后的下一轮产品讨论入口。它不是承诺列表，也不是 issue
拆分结果；它用于把候选方向收拢到可讨论、可取舍、可产出 PRD 的形态。

## 背景

Tocsin 的 MVP 已经建立了自托管 Alert Hub 的基本闭环：

- 告警源接入与认证。
- Provider 解析与规范化告警。
- 路由规则匹配。
- 投递目标配置、预览、测试和发送。
- SQLite-backed Delivery worker、重试和历史。
- Events / Deliveries 运维视图。
- Settings、TOML import/export 与 JSON import/export。
- Docker runtime 与 health/readiness endpoint。

下一阶段应该从“继续补 MVP”切换为“选择一个明确产品方向，写新的 PRD，再拆 issue”。每个新
PRD 都应该保持 Tocsin 的核心约束：单进程、SQLite-first、自托管、运维工具、非 SaaS、非通用工作流引擎。

## 讨论原则

1. 先定义用户痛点，再讨论实现形态。
2. 每轮只选择一个主方向进入 PRD，避免把 roadmap 写成愿望清单。
3. 新需求必须说明它如何增强 Source、Event、Route、Destination、Delivery 或配置可信度。
4. 不引入 Redis、Postgres、Kafka、Temporal、独立 worker 服务或 SaaS 租户模型，除非有新的架构文档接受这种改变。
5. 模板、路由和规则仍然禁止执行用户提供的 JavaScript、shell、SQL 或动态代码。
6. Secret、raw sensitive payload、token hash、destination secret 不进入客户端 query data、route data、TOML/JSON 默认导出或普通日志。

## 已交付增量

- [设置页 JSON 配置导入导出](./configuration-json-export.md)：复用 TOML 的可移植配置快照、
  schema、事务导入和 secret 脱敏规则，增加 JSON 编辑、导入与下载。
- FastGPT 模型探测 provider：新增 `fastgpt` Source 解析器，接收 FastGPT 模型状态探测 webhook
  （`model_status_error` / `model_status_recovered`），把 red/yellow/green 探测状态映射为
  critical/warning/info severity 与 firing/resolved status，并以 `modelId` 作为 fingerprint。
  接入方式沿用告警源接入 Token：FastGPT 侧 `webhookToken` 填 Tocsin 的接入 Token，
  以 `Authorization: Bearer` 发送。
- [On-call 加急（飞书电话呼叫）](./oncall-feishu-urgent.md)：飞书自建应用成为可复用资源
  （登记、测试、被引用时拒删、导出为 `TOCSIN_FEISHU_APP_<id>_APPSECRET` 环境变量引用）；飞书
  通知目标新增应用发送模式（引用应用 + 群 `chat_id`，卡片由应用发出并把 `message_id` 记为投递的
  provider reference）与加急配置（severity 门槛、`userIdType`、呼叫对象）；命中的 firing 投递自动
  为每个接收人建一条加急记录，投递详情也可手动加急。加急有独立状态机、指数退避与
  `(fingerprint, 目标, 接收人)` 去重窗口，与卡片投递完全解耦：电话失败不重发卡片，卡片重试不重复
  打电话。实现顺序、平台约束与 2026-10-10 的官方文档核实结论见
  [ADR 0009](../adr/0009-oncall-feishu-urgent.md)。

## 当前内测配置删除策略

在公开发布前，Tocsin 的本地 SQLite 数据仍视为可重建的内测数据。告警源、路由和通知目标的 UI
删除操作采用硬删除语义：

- 删除告警源会删除该告警源、它接收到的 Events、相关 Deliveries / attempts / dedupe keys
  和相关加急记录，并清理引用它的路由规则。
- 删除通知目标会删除该通知目标、相关 Deliveries / attempts / dedupe keys，并清理引用它的路由目标。
- 删除路由会删除该路由和相关 Deliveries / attempts / dedupe keys，但保留来源 Events。
- 删除仍被通知目标引用的飞书应用会被拒绝，提示先解除引用。
- 加急记录（pings）随投递级联删除，加急去重键随加急记录级联。- 如果删除引用会让路由语义变宽，例如把只匹配某告警源的规则变成 catch-all，则直接删除该路由，而不是静默放宽匹配范围。

第一次公开 release 前需要重新评估该策略：如果历史数据开始具备审计价值，应切换到“有历史则归档”或软删除模型，并补充对应迁移和文档。

## 候选方向

### 1. Destination 结构化模板引擎

**已交付（2026-10-18 核实）。** 四种模板模式（text / feishu_card / slack_blocks / json_payload）、
Email 的 `subjectTemplate` / `htmlTemplate`、预览与 TOML 表示均已落地，取舍见
[ADR 0010](../adr/0010-destination-template-object-root-payload-and-html-escaping.md)。
以下保留为当时的候选范围记录。

问题：MVP 的文本模板能力已经足够覆盖基础消息，但不能表达飞书卡片、Slack blocks、Email HTML
或通用 webhook 的结构化 JSON payload。下一轮模板工作应把旧的 `messageTemplate` 收敛为统一
`template` 配置模型。

候选范围：

- Destination-aware template schema。
- 用 `template` 替代 `messageTemplate`，不做兼容迁移。
- Feishu text / interactive card。
- Slack text / blocks。
- Email subject / text / HTML。
- Generic webhook JSON payload template。
- Preview、test result、Delivery `renderedPayload` 的 secret-safe 表达。
- TOML import/export 中的结构化模板表示。

不做：

- 用户 JavaScript、表达式语言、远程代码、shell、SQL。
- 跨 destination 复用模板资源，除非 PRD 证明它比 destination-local config 更必要。
- 完整卡片可视化设计器；可以先用 JSON/template editor + preview。

### 2. Route Authoring 与 Explain

问题：匹配层支持多条件规则，但 UI 编辑与解释仍偏基础。用户需要更明确地知道一条 Event 为什么匹配或没有匹配某条 Route。

**部分交付（2026-10-21 复核）。** 多条件规则编辑与摘要、Event 详情 route explain、投递缺口解释均已落地
（`apps/console/src/features/events/ui/event-detail-route-gaps.tsx`、`apps/console/src/features/routes/ui/route-forms.tsx`）；
剩余为样例 Event 干跑预览（backlog REQ-3）；补投预览一致性修正（REQ-22）已于第 74 轮交付
（PR #349，`docs/prd/replay-preview-target-detail.md`）。

候选范围：

- 多 source、多 severity/status、多 label、多 title/message 条件的完整编辑体验。
- 规则摘要与中文运维文案。
- Event detail 中的 route explain。
- Route 测试/预览：给定样例 Event，显示匹配结果。
- TOML 导入复杂规则后的只读/受限编辑提示。

不做：

- 通用 workflow engine。
- 任意表达式规则。
- 图形化流程编排。

### 3. Alert Suppression 与 Maintenance Window

**已交付主体能力（2026-10-18 核实）。** `suppressions` 表、service、oRPC、Dashboard 页面与
`suppressed` 投递状态均已落地；试跑预览与保留期清理等剩余增量见
`docs/planning/iteration-backlog.md`（REQ-25 / REQ-29）。以下保留为当时的候选范围记录。

问题：MVP 会忠实投递重复 firing 告警，但真实运维需要临时静默噪声、维护窗口和按 fingerprint 抑制。

候选范围：

- Silence / suppression / maintenance window 的领域模型。
- 按 source、severity、status、labels、fingerprint 匹配抑制。
- Event 和 Delivery 记录中保留“被抑制”的可审计证据。
- UI 中创建、启停、过期和查看 suppression。

不做：

- Incident lifecycle。
- On-call scheduling。
- Escalation policy。
- SaaS-style team ownership。

### 4. 搜索、过滤与历史排障

**部分交付（2026-10-21 复核，2026-10-27 更新）。** 时间范围过滤（`docs/prd/operations-time-range.md`）、
source/severity/status/destination/route/state 组合过滤、按路由过滤、ID/标签/上游 metadata 搜索、
route explain，以及同指纹历史上下文与变更对比（REQ-249，`docs/prd/event-fingerprint-context.md`）
已落地；fingerprint 聚合视图（REQ-6）、绝对时间窗口（REQ-33）与筛选结果导出（REQ-34）仍待做。
raw/debug JSON 不纳入搜索以避免凭据回显
（`apps/console/src/infra/sqlite/repositories/history/search.test.ts:421`），delivery history 已决定
不自动清理（`docs/release/history-retention-and-snapshots.md:14`），二者不再作为待实现项。

问题：Events 和 Deliveries 已经可查看，但生产排障需要更强的过滤、时间范围、fingerprint 聚合和历史保留策略。

候选范围：

- Events/Deliveries 时间范围过滤。
- fingerprint 视图。
- source/severity/status/destination/state 组合过滤。
- Raw/debug JSON 的 copy、collapse、search。
- Delivery history retention 策略。
- 更清晰的失败分类和 retry 结果。

不做：

- 外部全文搜索服务。
- 大数据分析系统。
- 多实例事件流平台。

### 5. 自托管发布硬化

问题：仓库已有 Docker runtime 和 health/readiness endpoint，但正式公开试用还需要发布工程闭环。

**大部分已交付（2026-10-21 复核）。** Root CI（`.github/workflows/ci.yml`）、Docker build/compose
smoke（`scripts/docker-smoke.sh`、`Justfile`）、生产部署与备份/恢复/升级/回滚文档、release checklist、
脱敏 runtime logs 均已落地；浏览器 E2E 已接入 CI（`.github/workflows/e2e.yml`，2026-10-22），
详见 backlog REL-21。
以下保留为当时的候选范围记录。

候选范围：

- Root CI workflow。
- 浏览器 E2E。
- Docker build / compose smoke。
- 生产部署文档。
- 备份/恢复/升级/回滚文档。
- Release checklist。
- 脱敏 runtime logs。

不做：

- Helm chart 或 Kubernetes operator，除非后续 PRD 明确需要。
- 多实例写协调。
- 托管云发布流程。

### 6. Adapter 贡献体验

问题：provider/destination registry 结构已经建立，但外部贡献者仍需要更清楚的 fixture、测试和文档路径。

**Destination 侧已交付（2026-10-21 复核）。** contributor guide
（`docs/contributing/destination-adapter.md`）、scaffold（`scripts/new-destination-adapter.mjs`）、
test-kit（`packages/destinations/src/test-kit/`）、registry audit
（`packages/destinations/src/registry.ts:83`）与 iconName 消费均已落地；剩余缺口是 provider fixture
目录（REL-2）与 destination 的 kind/secret 路径单一真相（C4 / F2'）。以下保留为当时的候选范围记录。

候选范围：

- Provider fixture 目录规范。
- Destination fake transport 测试规范。
- Adapter contributor guide。
- 新 adapter scaffold 或 checklist。
- 默认注册与 catalog 投影测试文档化。

不做：

- 运行时第三方插件安装。
- Marketplace。
- 动态加载远程 adapter。

## 已认领方向

### On-call 加急（飞书电话呼叫）

已交付（2026-10-10，见上方「已交付增量」与 PR #32–#38）。方向内未兑现的部分留在下方 out-of-scope
清单，作为后续独立增量重新认领。

不在本方向内（仍属 out-of-scope）：on-call 排班、轮转与多级 escalation policy，ack 确认与抑制，
短信/应用内加急渠道，恢复（resolved）呼叫，路由级加急配置。

- PRD：`docs/prd/oncall-feishu-urgent.md`
- ADR：`docs/adr/0009-oncall-feishu-urgent.md`

## 建议优先级

（2026-10-18 更新）方向 1 已交付，方向 3 主体已交付，方向 4 已部分交付；它们不再占用“下一轮讨论”的
位置。剩余工作以 `docs/planning/iteration-backlog.md` 中的切片为准。

新的优先级建议：

1. **Route Authoring 与 Explain 的剩余切片**：方向 2 中 explain、多条件规则编辑、投递缺口解释与
   补投预览一致性（REQ-22，第 74 轮 #349）均已落地；剩余增量只有样例 Event 干跑预览（REQ-3）。
2. **方向 4 的剩余排障能力**：fingerprint 聚合视图、绝对时间窗口与筛选结果导出；raw/debug JSON 搜索与
   delivery history retention 已明确不再作为待实现项（见本文方向 4 小节）。
3. **方向 5 自托管发布硬化与方向 6 Adapter 贡献体验**：按 backlog 中的 release-infra 与
   architecture 条目推进。

## 下一步工作流

1. 选择一个候选方向。
2. 讨论用户故事、非目标、验收标准和架构边界。
3. 用 `to-prd` 产出独立 PRD，例如 `docs/prd/destination-template-engine.md`。
4. Review PRD，必要时更新 `docs/architecture/*`。
5. 用 `to-issues` 拆成可独立领取的垂直切片。
6. 再进入实现。
