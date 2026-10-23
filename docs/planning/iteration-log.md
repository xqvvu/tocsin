# 自主迭代日志

按轮次倒序追加。每条记录：时间、基线、专家发现、本轮交付、上报事项、下一轮优先项。

## 2026-10-23（第 91 轮）

- 时间：2026-10-23 10:57 CST 起。
- 基线：本轮开始时 `origin/main` @ `53eaf42`；main CI 最近一次 success；无 open PR；
  `v0.1.0-beta.68` 的 tag 与 GitHub Release 均已存在。
- 类型：**`full-audit`（3 条车道）** —— `requirements`（超时终止）、`ui-triage`→`ui-review`、
  `security-exposure`。`docs-drift`、`release-infra`、`architecture`、`quality` 顺延。
- 全量审计时间戳：**第 1 轮（2026-10-18 13:30 CST，未变）**——仍未覆盖全部车道。
- 车道轮转位置：**`architecture`**（下一轮非必跑车道）。
- `ui-triage`：**`review_now`** —— 距上次真实评审 3h10m；自评审后 UI 路径合并 3 条
  （`02478f3`、`66c391d`、`5cf9c59`）；22 条 candidate UI 发现、无 HIGH；但 `/suppressions`
  的 UI-22 几何复验连续两轮顺延，且 #392 改的是 8 个消费者共用的表格外壳，值得一次深度复核。
- `last_ui_review_at`：**2026-10-23 11:10 CST**（本轮已更新）。
- 工作树：`agent-iteration` 仅用于并发锁与干净基线；实现、验证、构建都在会话工作树
  `bold-golick-59a3cd`（写入隔离 hook 禁止跨工作树写入）。收尾时 `agent-iteration` 及其
  `node_modules` 已清理，并发锁已删除。
- 车道超时：`requirements` 运行约 52 分钟未返回，按时间盒终止；本轮无新需求候选，下一轮重跑。

### 本轮交付

- **PR #400 `fix(console): name each filter reset for its scope`（UI-31）**：
  Events/Deliveries 在筛选无结果时同时出现三个同名「重置筛选」。chip 行与空态改用
  「清除全部筛选 / Clear all filters」，空态按钮另有独立 `aria-label`
  （「清除筛选并显示全部投递/事件」），工具栏保留可见「重置筛选」并以既有 `resetTitle`
  作为 `aria-label`（「重置投递筛选/重置事件筛选」）。新增 3 个 i18n key（中英文同步），
  更新 4 个测试文件并新增工具栏可访问名称用例。
  验证：`vp check` 0 errors / 18 warnings（基线）；`vp run -r test` 4/4 包通过（console 949 tests）；
  `vp run -r build` 通过。
  **浏览器验证**（隔离实例 6192 + `/tmp/ui31-verify.sqlite`，390×844 与 500 宽）：
  - `/deliveries?q=zzz` 三个重置入口的可访问名称分别为「重置投递筛选」「清除全部筛选」「清除筛选并显示全部投递」；
  - `/events?q=zzz&deliveryOutcome=failed` 分别为「重置事件筛选」「清除全部筛选」「清除筛选并显示全部事件」；
  - 控件尺寸保持 84×28 / 80×24 / 108×28，`scrollWidth == 390`，无新增换行或横向溢出。
  - 截图 `/tmp/ui31-deliveries-390.png`、`/tmp/ui31-events-390.png`。

### 专家发现

- `ui-review`（浏览器实测，read-only）：
  - UI-31 复现并确认：`operation-filters.tsx:194`、`deliveries-page-toolbar.tsx:40`、
    `deliveries-empty-state.tsx:42`、`events-page-toolbar.tsx:44`、`events-empty-state.tsx:40`；
    `/deliveries?q=zzz` 390×844 三按钮均读作「重置筛选」，事件页同样存在。
  - **#392 的 `min-h-72` 修复成立**：1280×900 `/suppressions` 打开内联编辑后表格区 288px、
    分页 400–426、面板 top=439，间隙 13px，无压塌/重叠；390×844 同样 13px 间隙。
  - **紧凑 hits 表无实质空白**：1280 详情页空态由父级 `flex-1` 撑满（490px），390 下限仅比
    `flex-1` 多 2.5px；不构成缺陷，未改 `OperationsTable`。
  - 其他消费者（`/sources`、`/destinations`、feishu-apps、routes）无回归；无新增 UI 编号
    （下一可用 UI-42）。
- `security-exposure`：
  - **SEC-33（MEDIUM）**：`isSensitiveKey` 漏掉复数/限定词/带前缀形态；实测 `secrets`、
    `passwords`、`appSecrets`、`aws_secret_key`、`awsSecretKey`、`clientSecretKey`、
    `appSigningKey`、`secretValue`、`SecretString`、`credentialsJson`、`privateKeyData` 均为
    false；`redactText("aws_secret_key=abc123")` 原样返回（`redaction.ts:82-83`、
    `config-portability.ts:459-489`、契约 `packages/api/src/contract/portability.ts:22`）。
    改 secret 判定规则 → EXPERT_PANEL。
  - **SEC-34（MEDIUM）**：空用户名 URL userinfo 密码不脱敏（`redaction.ts:188`，
    `redaction.scan.test.ts:348` 冻结），`redis://:hunter2@…`、`postgres://:hunter2@…`、
    `https://:hunter2@…` 原样返回。删一行条件即可，AUTO_FIX。
  - **SEC-35（LOW）**：按 `DestinationKindSchema.options` 参数化的脱敏覆盖仍缺
    `testDestination`、`listDestinations`/`getDestinationTemplateDraft`、
    `destinationMetadataFromRuntime`/`destinationEditorFormDraftFromRuntime` 的 generic/email 断言。
  - 纠偏：**SEC-25 已随 #373 落地**（`destination.service.ts:205,317,329,343` 均 `redactJsonText`），
    backlog 行已改为 shipped；**SEC-31** 的 `X-Amz-Signature`/`X-Amz-Credential`/`X-Goog-Credential`
    现已命中，真正剩余是 `X-Goog-Signature` 与 Azure SAS `sig`。
  - import protection 无新增缺口；`xqvvu/vane` 失效引用全仓 clean（仅 ACR 镜像坐标与历史日志）。
- `requirements`：超时终止，无输出。
- `ui-triage`：`review_now`（理由见上）。

### 本轮未做 / 限制

- 需求车道未产出，backlog 无新增 REQ 候选。
- 未发版评估前先交付 PR；发布决策见下方（若 CI 与时间允许）。

### 下一轮优先项

1. **SEC-34（27）**：空用户名 userinfo 脱敏，AUTO_FIX（一行条件 + oracle/用例）。
2. **SEC-33（23）**：交 EXPERT_PANEL 决定后缀规则扩展与 oracle 更新。
3. **requirements 车道重跑**（本轮超时），并续做 REQ-243（27）/REQ-244（28，需 EXPERT_PANEL）。
4. `architecture`（轮转车道）+ SEC-35 参数化测试补齐。
5. `docs-drift`：复核 SEC-25/SEC-31 相关文档与 backlog 纠偏。

## 2026-10-23（第 90 轮）

- 时间：2026-10-23 09:38 CST 起。
- 基线：本轮开始时 `origin/main` @ `255d494`；main CI 最近一次 success；无 open PR；
  `v0.1.0-beta.67` 的 tag 与 GitHub Release 均已存在。
- 类型：**`full-audit`（3 条车道）** —— `requirements`、`ui-triage`（→ `defer`）、`release-infra`。
  `security-exposure`、`architecture`、`quality`、`docs-drift` 顺延。
- 全量审计时间戳：**第 1 轮（2026-10-18 13:30 CST，未变）**——仍未覆盖全部车道。
- 车道轮转位置：**`security-exposure`**（下一轮非必跑车道）。
- `ui-triage`：**`defer`** —— 距上次真实评审 1.8h（`last_ui_review_at` 2026-10-23 07:50）；
  自评审后 UI 路径合并 1 条（`02478f3`，UI-22 修复本身）；22 条 `candidate` UI 发现中 0 条未解决 HIGH。
  下次触发：满 48h（2026-10-25 07:50）、UI 路径合并 ≥3、或新增 HIGH 可复现缺陷。
- `last_ui_review_at`：**2026-10-23 07:50 CST**（未变；本轮只做了新筛选项的针对性浏览器复验，不是深度评审）。
- 工作树：`agent-iteration` 仅用于并发锁与干净基线；实现、验证、构建都在会话工作树
  `happy-shtern-094490`（写入隔离 hook 禁止跨工作树写入）。本轮结束时 `agent-iteration`
  工作树与其 `node_modules` 已清理，并发锁已删除。

### 本轮交付

- **PR #395 `feat(console): filter events by delivery outcome`（REQ-21，29 分）**：
  Events 列表新增 URL `deliveryOutcome`：`none`（该事件没有任何投递行）∪ 五种 `DeliveryState`
  （至少一条投递处于该状态）。仓储用相关 `EXISTS`/`NOT EXISTS`，`listEvents` 与 `countEvents`
  共用同一谓词，复用 `idx_deliveries_event_id`；服务层只把该字段传给事件查询，投递列表保留精确
  `deliveryState` 维度。chip、内联/页面级重置、`hasOperationFilters` 全部覆盖。PRD
  `docs/prd/event-delivery-outcome-filter.md`，并同步 `operation-filter-scope.md` 的「另行决策」。
  验证：`vp check` 0 errors / 18 warnings（基线）；`vp run -r test` 4/4 包通过；`vp run -r build` 通过；
  PR 的 `check · test · build` 与 `playwright · chromium` 均 pass。
  **浏览器验证**（隔离实例 6180 + `/tmp/tocsin-ui395.sqlite`）：`/events` 出现「Delivery outcome」，
  选 `No delivery` 后 URL 变为 `?deliveryOutcome=none`、空态显示 `No events match`、chip 出现且可清除；
  `/deliveries?deliveryOutcome=none` 不渲染该控件也不显示 chip；390×844 下下拉在弹层内可见
  （x=34.2, y=561.9, 315×31）。截图 `/tmp/ui395-events-outcome-1280.png`、`/tmp/ui395-events-outcome-390.png`、
  `/tmp/ui395-deliveries-1280.png`。
- **PR #396 `fix(console): clear every filter from the page-level reset`（FIX-16）**：
  `deliveries-page.tsx` 的手写重置列表漏了 `minAttempts`，重置后仍按尝试次数过滤。改为三处 Reset
  共用 `operation-search.ts` 的 `clearedOperationSearch`，单测固定键集合并在新增筛选键忘加清空值时失败。
  验证同上（check / 4 包测试 / build 均通过；PR 两项 check pass）。

### 专家发现

- `requirements`（6 条新候选，均带代码证据，已写入 backlog）：
  - **REQ-244（28）** 自托管 secret 文件注入 `*_FILE`：`env.ts:10-13`、`config-portability.service.ts:93-110`、
    `docker-entrypoint.sh:1-36` 均不支持；部署文档已列为已知缺口（`docker-production-deployment.md:17,140`）。
  - **REQ-243（27）** 投递按严重级别优先领取：`claimNext` 不 join `events`（`delivery.repository.ts:229-247`），
    worker 10 条/5s（`env.ts:39-40`），积压时 critical 排在 info 后。
  - **REQ-247（27）** Adapter `lifecycle`/`configVersion` 在控制台不可见：ADR 0002 承诺（`:90-94`）、
    catalog DTO 已有（`adapter-manifest.ts:149-156`、`registry.ts:73-86`、destinations `:68-81`），
    console 零消费、导入不检查（`config-portability.service.ts:93-110`）。
  - **REQ-242（26）** 静默规则缺路由维度：`suppression.ts:32-49,156-160`、`delivery.repository.ts:144-152,261-269`；
    路由行静默只能复制 rule+destinations（`suppression-form.ts:285-312`）。
  - **REQ-246（23）** 单事件敏感载荷清除：`event-raw-tab.tsx:6-28` 无动作，仓储只有按保留期的批清理
    （`intake.repository.ts:105-156`）。
  - **REQ-245（21）** Settings 维护动作（`quick_check` / VACUUM）：`store.ts:66-72` 承认缺 gated entry，
    全仓无实现；需重开 `settings-storage-prd:44-48` 的非目标。
- `release-infra`：
  - E2E 已由 `.github/workflows/e2e.yml`（#372）接入 CI，但仓库 **无 ruleset / main 无 branch protection**
    （`gh api repos/xqvvu/tocsin/rulesets` → `[]`），`playwright · chromium` 与 `check · test · build`
    都只是建议门禁；`playwright test --list` 仍只有 1 个用例（`alert-flow.spec.ts:27`）。
  - `scripts/artifact-smoke.sh` 仍不存在；`ci.yml:43-50` 只 build 不启动产物，E2E 跑 `vp dev`
    （`playwright.config.ts:33`）→ REL-5/8 成立。
  - `packages/providers` 无 fixture 目录，6 个 adapter 测试仍内联 19 处 payload → REL-2/24 成立。
  - `migrate.test.ts` 6 处仍全 `:memory:`（`:36,134,419,478,488,519`）；`connection.ts:29-32` 开 WAL 但无断言；
    `schema_migrations` 无 checksum 列（`runner.ts:102-109`）→ REL-9 成立，checksum 属 schema 变更。
  - `docker-smoke.sh` 无 restart 断言（`:67-129`）→ REL-6 成立；`.github/**` 仍被 fmt/lint 排除（`vite.config.ts:10`）→ REL-11 成立。
- `ui-triage`：`defer`（理由见上）。

### 发布决策（EXPERT_PANEL，3 专家一致放行）

- **发布经理**：`v0.1.0-beta.67..origin/main` 共 7 个提交，用户可见 2 个（#395 投递结果筛选、
  #396 重置筛选修复），其余 docs/test；建议 `0.1.0-beta.68`。
- **发布阻断审计**：目标 SHA 的 CI 与 E2E 全绿；无开放 PR（除发布 PR 本身）；无回归、无 revert；
  `migrate/` 零 diff；`blocked-autonomous` 三项（LICENSE、无 branch protection）为长期存量，不阻断；
  `v0.1.0-beta.68` 无重名 tag。
- **运维/回滚专家**：部署面零变化（Dockerfile/compose/entrypoint/env/锁文件零 diff）、无迁移；
  完全可逆，回滚只需把镜像换回 `0.1.0-beta.67`，无需数据修复。
- 执行：PR #398 合并为 `628af89`（其 `check · test · build` 与 `playwright · chromium` 均 success）→
  annotated tag `v0.1.0-beta.68` 指向 `628af89` → GitHub Release 已创建（prerelease，body 非空）→
  镜像 `registry.cn-hangzhou.aliyuncs.com/xqvvu/vane:0.1.0-beta.68` 已推送，
  digest `sha256:60198b43…`，`imagetools inspect` 确认 `linux/amd64` + `linux/arm64`。
- 回滚镜像：`0.1.0-beta.67`（`v0.1.0-beta.66` 仍保留）。

### 下一轮优先项

1. **REQ-243（27）** 投递按严重级别优先领取——值班时延，纯查询改动、无迁移。
2. **REQ-244（28）** `*_FILE` secret 注入——自托管部署安全，独立切片。
3. **REQ-242（26）** 静默规则路由维度——需同步旧 PRD 的非目标措辞。
4. `security-exposure`（轮转车道）+ UI-22 在 `/suppressions` 的针对性几何复验。
5. REL-9 的文件库 migration + WAL 断言（低成本 AUTO_FIX，checksum 需单独裁决）。

## 2026-10-23（第 89 轮）

- 时间：2026-10-23 08:26 CST 起。
- 基线：本轮开始时 `origin/main` @ `85f4f3f`；main CI 最近一次 success；无 open PR；
  `v0.1.0-beta.66` 的 tag 与 GitHub Release 均已存在。
- 类型：**`release`（部分审计）** —— 主交付是第 88 轮顺延的 `0.1.0-beta.67` 发版 + UI-22 修复；
  审计只跑 `requirements`（排序存量候选）与 `ui-triage`。其余车道未跑，`release-infra` 轮转位置不变。
- 全量审计时间戳：**第 1 轮（2026-10-18 13:30 CST，未变）**——本轮未覆盖全部车道。
- 车道轮转位置：**`release-infra`**（下一轮非必跑车道，本轮未跑）。
- `ui-triage`：**`defer`** —— 距上次真实浏览器评审 38 分钟（`last_ui_review_at` 2026-10-23 07:50）；
  自评审后 UI 路径合并 0 条；唯一 HIGH（UI-22）正是本轮修复对象；无新增 HIGH。
  下次触发：满 48h（2026-10-25 07:50）、UI 路径合并 ≥3、或新增 HIGH 可复现缺陷。
- `last_ui_review_at`：**2026-10-23 07:50 CST**（未变，本轮未做新的深度评审，只做针对性复验）。
- 工作树：`agent-iteration` 仅用于并发锁与干净基线；实现、验证、构建都在会话工作树
  `wizardly-borg-0b2373`。工作树在收尾阶段清理。

### 本轮交付

- **PR #392 `fix(console): keep list tables from collapsing under inline edit panels`**（UI-22，24 分）：
  `operations-table.tsx:106` 的根节点 `min-h-0` → `min-h-72`，内联编辑面板不再把表格压到 0px，
  分页条不再与表单标题重叠。`operations-table.test.tsx` 新增布局回归断言，
  `routes-section-layout.test.tsx` 的旧断言（误把 `min-h-0` 当成契约）改为新契约。
  验证：`vp check` 0 errors / 18 warnings（基线）；`vp run -r test` 4/4 包通过（937 tests）；
  PR 的 `check · test · build` 与 `playwright · chromium` 均 success。
  **浏览器验证**（隔离实例 + `/tmp/tocsin-ui22.sqlite`，1280×720 与 390×844）：表格 288px、
  分页 388–439、面板自 439 开始，重叠 0px；内容高于视口时页面列可滚动
  （scrollHeight 983 > clientHeight 632），表单可达。截图 `/tmp/ui22-fixed-1280.png`、`/tmp/ui22-fixed-390.png`。
- **PR #393 `chore(release): v0.1.0-beta.67`**：根 `package.json` 版本递增，
  `docs/release/release-checklist.md` 的 tag 总数（58→59）、最新 tag、tag 区间末端同步。
- **发布 `0.1.0-beta.67`**：tag 指向 `f412689`（annotated），GitHub Release 已创建（prerelease，body 非空）；
  镜像 `registry.cn-hangzhou.aliyuncs.com/xqvvu/vane:0.1.0-beta.67`（linux/amd64 + linux/arm64）。

### EXPERT_PANEL（发布评估，3 专家一致放行）

- **发布经理**：自 `v0.1.0-beta.66` 起唯一用户可见变更是 `4bb525b`（路由行一键临时静默，REQ-238），
  其余 6 个提交只改 `docs/`；建议递增为 `0.1.0-beta.67`。
- **发布阻断审计**：无 open PR；`85f4f3f` 的 CI/E2E 均 success；migration 目录零 diff；
  无 revert；Dockerfile/compose/.env.example/锁文件零变化。UI-22 经 `git blame` + `git tag --contains`
  核实为 `v0.1.0-beta.50` 起就存在的既有缺陷，**不是** beta.66 之后的回归，不阻断发版。
  放行条件：tag 必须打在版本递增后的 commit 上，并重新确认该 commit 的 CI/E2E。
- **运维/回滚专家**：部署面零变化，旧镜像可直接读新库；回滚只需换回 `0.1.0-beta.66` 镜像，无需数据修复。
- 决策记录：三份意见并入本条日志（本轮无需单独 `docs/planning/decisions/<slug>.md`，因为是一致的低风险发布）。
- 执行偏差（如实记录）：打 tag 时 `f412689` 的 **CI（check·test·build）为 success**，
  但 **E2E workflow 仍停在 "Install Chromium" 步骤逾 15 分钟未结束**（外部依赖下载慢，非代码失败）；
  其父提交 `02478f3` 的 CI 与 E2E 均 success，且 `f412689` 相对 `02478f3` 只改 `package.json` 版本与
  3 行 release 文档。据此按「CI 绿 + 变更面为零风险」放行打 tag。
  **补记**：本轮收尾前 E2E 已完成，`f412689` 的 **CI 与 E2E 均为 success**，发布 gate 事后完整满足。

### 专家发现

- `requirements`（本轮只做存量排序，未做全量发现）：
  - **Top 1 REQ-21（27）** Events 按投递结果筛选（无投递/失败/被静默）：`history.repository.ts:76-90,133-141`
    已计算各状态计数，`history.interface.ts:24-34` 无该维度，`operation-filters.tsx:40-44` 明确 Events
    不渲染投递状态。顶栏 REQ-166 只统计 failed，零投递/全静默仍是盲区。
  - **Top 2 REQ-39（27）** 静默剩余时间 + 一键续期：`suppressions-section.tsx:253-264`、
    `suppression-detail-page.tsx:87-91` 只显示起止时间；REQ-238 刚交付一键静默，创建后看不到还剩多久。
  - **Top 3 REQ-40（26，建议重评 27）** 详情返回保留列表筛选：`event-detail-page.tsx:66`、
    `delivery-detail-page.tsx:70` 硬跳无 `search`。
  - 行号漂移：REQ-21 原引 `:47-77` → `:76-90`；REQ-40 原引 `delivery-detail-page.tsx:49-55` → `:65-73`；
    REQ-39 原引 `:247-258` → `:253-264`。REQ-33 已被 REQ-207 吸收但仍为 candidate，建议合并关闭。
  - 新增 **REQ-241（27）**：一键静默成功后直达新规则并显示到期时间——`create` 返回完整 Suppression
    （`packages/api/src/contract/suppressions.ts:47-51`），但 `suppression-from-row-dialog-content.tsx:86-89`
    丢弃结果，`onSaved` 只关弹窗（`suppression-from-route-dialog.tsx:62`）。
- `ui-triage`：`defer`（理由见上）。

### 发布决策

- 三位专家一致 → 发布 `0.1.0-beta.67`（详见上方 EXPERT_PANEL 与交付）。
- 用户可见变更（自 `v0.1.0-beta.66`）：REQ-238 路由行一键临时静默（#389）+ UI-22 内联编辑表格塌陷修复（#392）。
- 版本：`0.1.0-beta.67`；release PR #393 合并为 `f412689`。
- 回滚镜像：`0.1.0-beta.66`。升级/回滚：无迁移、无环境变量/配置格式/启动参数变化。

### 下一轮优先项

1. 补记 `v0.1.0-beta.67` 的 E2E 结论；若为失败，按前向修复并只发新版本号，绝不重打该 tag。
2. **UI-22 复验**：`/suppressions` 页内联编辑（本轮只在 `/routes` 做了浏览器几何验证）——
   两页共用同一外壳，但仍应实测一次并更新 `last_ui_review_at`。
3. **REQ-21（27）** Events 按投递结果筛选；需同步 `operation-filter-scope.md`。
4. **FIX-16** Deliveries 工具栏 Reset 不清 `minAttempts`，补一条断言。
5. `release-infra`（轮转车道）。

## 2026-10-23（第 88 轮）

- 时间：2026-10-23 07:10 CST 起。
- 基线：本轮开始时 `origin/main` @ `7f60dd2`；main CI 最近一次 success；无 open PR；
  `v0.1.0-beta.66` 的 tag 与 GitHub Release 均已存在。
- 类型：**`full-audit`（3 条车道）** —— `requirements`、`ui-triage`→`ui-review`、`docs-drift`。
  `security-exposure`、`release-infra`、`architecture`、`quality` 顺延。
- 全量审计时间戳：**第 1 轮（2026-10-18 13:30 CST，未变）**——仍未覆盖全部车道。
- 车道轮转位置：**`release-infra`**（下一轮非必跑车道）。
- `ui-triage`：**`review_now`** —— 自上次评审 UI 路径合并 5 个（`10b44f6`、`dcff721` #378、
  `025ac9b` #382、`bf19c17` #386、`99cea2f`），其中 3 个未经浏览器复验；#386 在顶栏新增
  常驻指示器，只有 jsdom 测试。
- `last_ui_review_at`：**2026-10-23 07:50 CST**（本轮完成真实浏览器评审）。
- 工作树：`agent-iteration` 用于并发锁与干净基线；实现与验证在会话工作树
  `zealous-volhard-c028bb`。

### 本轮交付

- PR #389 `feat(console): silence a route from its row`（REQ-238，29 分）：
  路由行新增「临时静默此路由」操作，预填 matcher = 路由 `rule` + `destinationIds`；
  目标行与路由行共用 `suppression-from-row-dialog-content.tsx`，目标行适配层行为不变。
  新增 PRD `docs/prd/route-row-silence.md`（含「静默没有路由维度」的已知限制）。
  验证：`vp check` 0 errors / 18 warnings（基线）；`vp run -r test` 4/4 包通过；
  `vp run -r build` 通过；PR 的 `check · test · build` 与 `playwright · chromium` 均 success。
- PR #390 `docs: correct stale PRD status and release facts`（DOC-1..8）：
  5 个 PRD 补「已交付」状态头、release checklist 的 annotated tag 数量 57→58、
  `request-context.ts` 的 server-only 标记、`delivery-attempt-filter.md` 的投递表路径。

### 专家发现

- `requirements`：
  - **REQ-240（27）** Events 按通知目标过滤（含「未投递到该目标」反向筛选）：
    `operations.service.ts:37-46` 的 `listEvents` 无目标字段、`history.interface.ts:24-34`
    无 `destinationId`、`operation-filters.tsx:38-44,347` 只在 Deliveries scope 渲染目标下拉；
    URL 已有 `destinationId`（`operation-search.ts:30`）但 Events 页静默忽略。
    建议契约加 `destinationMatch: any|delivered|missing`，用 `EXISTS`/`NOT EXISTS` 子查询，
    v1 不加索引。已核实 backlog 无对应条目，且 `operation-filter-scope.md:54-56` 明确把
    该决策挂起——本候选即那次「另行决策」。
  - **FIX-16** Deliveries 工具栏「重置筛选」不清 `minAttempts`：`deliveries-page.tsx:67-77`
    的 `resetFilters` 未包含该字段，`pruneSearch` 因 `>0` 继续写回 URL；
    同页内联 Reset（`operation-filters.tsx:186-201`）却包含，两者语义相反。
- `docs-drift`：8 条断言过期，全部由 #390 修复；已确认 suppression UI、`xqvvu/vane`→`tocsin`、
  `config-portability.ts` 穷尽 switch、provider fixture、raw payload 搜索测试行号、
  application-container 工厂清单等既有修复仍成立。
- `ui-review`（真实浏览器，隔离临时实例 + 种子库）：
  - **UI-22 浏览器复现（HIGH）**：内联编辑面板打开时 `OperationsTable` 根节点高度 0px
    （`operations-table.tsx:106` 的 `flex min-h-0 flex-1`），分页条（y 153–204）压在
    面板标题（y 176）上；Routes 与 Suppressions 两页同因。注入 `min-height:288px` 后
    几何恢复正常（`/tmp/ui-22-fixsim2.png`）。一行修复即可。
  - **UI-23 重新定性（MEDIUM）**：390px 下表格 980px 宽、视口 348px，动作列在首屏外，
    但横向滚动后可点达——「不可达」表述不准确，真实缺陷是零可发现性。
  - **UI-40（MEDIUM）**：390px 顶栏 `delivery-failure-indicator.tsx:43` 与
    `delivery-pause-indicator.tsx:35` 的 `hidden sm:inline` 让失败计数与暂停文案消失，
    只剩两个红色图标，且无 tooltip；抑制指示器却保留全文，三者不一致。
  - **UI-41（LOW）**：`table-pagination.tsx:88` 的 `aria-label={page}` 让读屏只念数字。
  - 复核：顶栏三个指示器在 1280/390 均共存；无硬编码 UI 文案；破坏性操作均有确认框。
  - `/routes` 不接受 `range`/`rangeAnchor`（`_dashboard.routes.tsx` 无 `validateSearch`），
    #378 的锚点 chip 只在 Events/Deliveries——属规格预期，非缺陷。

### EXPERT_PANEL

- 本轮无新的裁决事项。

### 发布决策

- 本轮不发布 `0.1.0-beta.67`：PR #389 合并时已接近单轮时间预算上限，无法在剩余时间内完成
  版本递增 PR、打 tag、创建 Release 并完成多平台镜像构建与推送。按「超出预算后不再启动新工作」
  的规定，发版整体顺延到下一轮首项；本轮的用户可见变更（REQ-238）留待 beta.67。

### 下一轮优先项

1. **发版 `0.1.0-beta.67`**（含 #389 REQ-238），按第 9.5 步完整执行 tag/Release/镜像。
2. **UI-22 一行修复**（`operations-table.tsx:106` → `min-h-72` + 布局回归测试），浏览器复验。
3. **FIX-16** Deliveries 工具栏 Reset 清 `minAttempts`，补一条断言。
4. **REQ-240（27）** Events 按通知目标过滤；需同步改 `operation-filter-scope.md`。
5. `release-infra`（轮转车道）。

## 2026-10-23（第 87 轮）

- 时间：2026-10-23 06:20 CST 起。
- 基线：本轮开始时 `origin/main` @ `ab8c6a4`；main CI 最近一次 success；无 open PR；
  `v0.1.0-beta.65` 的 tag 与 GitHub Release 均已存在。
- 类型：**`full-audit`（受时间/配额约束展开 3 条车道）** —— `requirements`、`ui-triage`、
  轮转车道 `security-exposure`。`docs-drift`、`release-infra`、`architecture`、`quality` 顺延。
- 全量审计时间戳：**第 1 轮（2026-10-18 13:30 CST，未变）**——本轮仍未覆盖全部车道。
- 车道轮转位置：**`docs-drift`**（下一轮非必跑车道）。
- `ui-triage`：**`defer`** —— 距上次评审 10h42m（`last_ui_review_at` 2026-10-22 19:45）；
  自评审以来 UI 路径合并 4 个，未复验 2 个（#378 时间窗锚点、#382 尝试次数筛选），< 3；
  `UI-` candidate 21 条（< 25）；无新增 HIGH。下一次触发：满 48h（2026-10-24 19:45）、
  未复验 UI 合并 ≥3、新增 UI 发现 ≥2、candidate ≥25，或出现新的 HIGH 可复现缺陷。
- `last_ui_review_at`：**2026-10-22 19:45 CST**（未变，本轮未做 UI 评审）。
- 工作树：`agent-iteration` 仅用于并发锁与干净基线；实现、验证在会话工作树
  `friendly-saha-d4e548`。工作树将在本轮收尾阶段清理。

### 本轮交付

- PR #386 `feat(console): surface recent delivery failures in the header`（REQ-166，28 分）：
  顶栏新增投递失败徽标，复用 `operations.list`（`limit: 1`、`deliveryState: failed`、
  `range: 24h`）读取 `deliveries.total`；数量为 0、加载中或查询失败时隐藏；
  点击进入 `/deliveries?deliveryState=failed&range=24h`；每 60 秒刷新。
  新增 PRD `docs/prd/delivery-failure-indicator.md` 与 3 条组件测试、顶栏挂载断言。
  验证：`vp fmt --write`；`vp check` 0 errors / 18 既有 warning；`vp run -r test`
  4/4 包通过（console 930 tests）；`vp run -r build` 通过；PR 的 `CI` 与 `E2E` 均 success。
  注：`code-review` 发现并修复两处：tooltip 把「按创建时间筛选」说成「按失败时间」，
  以及测试中 hoisted mock 读取非 hoisted 常量。
- PR #387 `docs(planning): record round 87`（本轮日志与 backlog）。

### 专家发现

- `requirements`：
  - **REQ-238（29）** 路由行一键临时静默：路由行操作只有编辑/补投预览/启停/删除
    （`routes-section.tsx:162-230`）；复用同构 matcher（`suppression.ts:26-45`、
    `route.ts:18-25`）与目标预填弹窗（`destination-actions.tsx:107`、
    `suppression-from-destination-dialog-content.tsx:49`）。纯 UI，无 API/DTO/迁移。
  - **REQ-239（28）** 多关键词 AND 搜索：`q` 被整体包成单个 `%term%`
    （`history.repository.ts:458-475,487-512,536-538`），无法表达「标题含 A 且消息含 B」。
  - 未展开的第三条：Events 按通知目标过滤（`operations.service.ts:37-45` 只把
    `destinationId` 传给投递查询，`history.interface.ts:24-34` 无该字段），留待下轮。
- `security-exposure`：
  - 新发现 3 条 LOW：转义 JSON 文本漏脱敏（**SEC-32**，`redaction.ts:501-526,627-655`；
    `redactText('{\"token\":\"abc123\"}')` 原样返回）、`X-Goog-Signature`/Azure SAS `sig`
    绕过结构化键脱敏（SEC-31 残余，`redaction.ts:13-66,82-83,204-208`）、PEM 正文与
    `tls.key` 未覆盖（SEC-20 残余，`redaction.ts:99-124`）。三条均建议 AUTO_FIX。
  - 复核：SEC-22 / SEC-23 / SEC-26 仍成立，维持 EXPERT_PANEL；SEC-25 已修复
    （`destination.service.ts:205,317,329,343` 四处 `redactJsonText`）。
  - 已核实 clean：oRPC DTO 无 token/secret 泄漏；import protection 无漏标；日志脱敏接线
    完整；脱敏测试已按 `DestinationKindSchema.options` 参数化；一次性 token 只在 React state。
- `ui-triage`：`defer`（理由见上）。

### EXPERT_PANEL

- 本轮无新的裁决事项；SEC-22 / SEC-23 / SEC-26 维持既有 EXPERT_PANEL 状态。

### 发布决策

- 三位专家（发布经理 / 阻断审计 / 运维回滚）**一致赞成发布 `0.1.0-beta.66`**；
  阻断审计在 E2E 完成前持 HOLD，`4dc081c` 的 `CI` 与 `E2E` 均 success 后条件满足。
- 用户可见变更（自 `v0.1.0-beta.65`）：PR #386 顶栏投递失败指示器（REQ-166）；
  PR #387 为纯文档，不单独触发发版。
- 门槛：`4dc081c` 的 `CI` 与 `E2E` 均 success；无其他 open PR（仅本轮日志 PR #387）；
  无 revert；`beta.65..4dc081c` 的 migrate 目录、`Dockerfile`、`docker-compose.yml`、
  `.env.example`、锁文件零变化。
- 版本：`0.1.0-beta.66`；release PR #388（`chore(release): v0.1.0-beta.66`）rebase 合并为
  `4dc081c`。
- tag：`v0.1.0-beta.66`（annotated，指向 `4dc081c`）；GitHub Release 已创建
  （prerelease，body 非空）。
- 镜像：`registry.cn-hangzhou.aliyuncs.com/xqvvu/vane:0.1.0-beta.66`
  （linux/amd64 + linux/arm64，index digest
  `sha256:4671822e368483dcb7a15d28f2402d6cd645bf3ea75a2cb474ce0184b2647f35`）；
  回滚镜像 `0.1.0-beta.65`。
- 升级/回滚：无 migration、无环境变量/配置格式/启动参数变化；回滚仅需换回旧镜像，
  无需数据修复。

### 下一轮优先项

1. REQ-238（29）路由行一键临时静默。
2. SEC-32 转义 JSON 漏脱敏 + SEC-31/SEC-20 残余（AUTO_FIX 安全增强）。
3. REQ-239（28）多关键词 AND 搜索。
4. REQ-235（27）投递暂停记录原因；REQ-24（28）抑制窗口汇总。
5. `docs-drift`（轮转车道）。

## 2026-10-23（第 86 轮）

- 时间：2026-10-23 05:42 CST 起。
- 基线：本轮开始时 `origin/main` @ `3ff8ef5`；main CI 最近一次 success；无 open PR；
  `v0.1.0-beta.64` 的 tag 与 GitHub Release 均已存在。
- 类型：**`full-audit`（受时间/配额约束展开 3 条车道）** —— `requirements`、`ui-triage`、
  轮转车道 `docs-drift`。`security-exposure`、`release-infra`、`architecture`、`quality` 顺延。
- 全量审计时间戳：**第 1 轮（2026-10-18 13:30 CST，未变）**——本轮未覆盖全部车道。
- 车道轮转位置：**`security-exposure`**（下一轮非必跑车道）。
- `ui-triage`：**`defer`** —— 距上次评审 9h57m（`last_ui_review_at` 2026-10-22 19:45）；
  自评审以来未评审 UI 合并 1 个（#378 时间窗锚点 chip，有单测、无浏览器复验）；
  `UI-` candidate 21 条（阈值 25）；无新增 HIGH。下一次触发：满 48h（2026-10-24 19:45）、
  未评审 UI 合并 ≥3、新增 UI 发现 ≥2、candidate ≥25，或出现新的 HIGH 可复现缺陷。
- `last_ui_review_at`：**2026-10-22 19:45 CST**（未变，本轮未做 UI 评审）。
- 工作树：`agent-iteration` 仅用于并发锁与干净基线；实现、验证在会话工作树
  `exciting-poitras-8f78eb`。

### 本轮交付

- PR #382 `feat(console): filter deliveries by attempt count`（REQ-232，27 分）：
  URL 增 `minAttempts`（UI 预设 ≥1 / ≥2 / ≥3 次，空值不限，非法值收敛为不限）；
  列表与 `total` 共用 `attempt_count >= n`，仅 Deliveries scope 渲染控件与 chip；
  修改条件回第 1 页、分页保留、内联 Reset 一并清除。新增 PRD
  `docs/prd/delivery-attempt-filter.md`；新增 URL schema/merge 5 例、仓储三档尝试次数 5 例、
  service 透传断言、控件可见性与 reset 断言。
  验证：`vp fmt --write`；`vp check` 0 errors / 18 既有 warning；`vp run -r test`
  4/4 包通过（console 927 tests）；`vp run -r build` 通过。
  注：本轮开始时 `vp check` 报 3944 errors（`JsonObject` 退化为 any），
  `vp install --frozen-lockfile --force` 后恢复为 0 errors；属会话工作树链接残缺，非代码问题。
- PR #383 `docs: correct stale release gates and version facts`（DOC-67..72）：
  RC 清单与 retention 文档的 dedupe「无界」断言、post-MVP 的 REQ-22 剩余项、发布 checklist
  的版本/tag 数、raw payload 搜索测试行号、adapter fixtures 断言、application-container
  目录树，共 6 处。验证：`vp fmt --check` 通过。

### 专家发现

- `requirements`：
  - **REQ-235（27）** 全局投递暂停记录「原因」并在顶栏/横幅/恢复框/最近区间展示；
    证据 `configuration-results.ts:20-25,41-47`、`configuration-commands.ts:142`、
    `settings-delivery-pause-panel.tsx:29-39`、`deliveries-paused-notice.tsx:58-70`、
    `delivery-resume-dialog.tsx:28-39`。无迁移、无新端点、不强制填写。
  - **REQ-236（26）** 运维表格列可见性偏好（localStorage，锁定主标识与操作列）；
    证据 `components/common/table-features.ts:11-20`、`operations-table.tsx:56-93`、
    `events-table-layout.ts:3-7`。
  - **REQ-237（25）** 静默规则按 ID 跨页批量启停；
    证据 `suppressions-section.tsx:93-140`、`suppressions-page.tsx:69-110`、
    `suppression.mutations.ts:8-18`、`packages/api/src/contract/suppressions.ts:59-63`。
- `docs-drift`：DOC-67..72 六条，全部为纯文档更正，本轮已交付（#383）。
- `ui-triage`：`defer`（理由见上）。

### EXPERT_PANEL

- 本轮无新的裁决事项；SEC-22 / SEC-26 维持既有 EXPERT_PANEL 状态。

### 文档同步

- `obsidian-vault` skill 在本会话不可用，本轮 Obsidian 同步已跳过（仓库内文档已更新）。

### 发布决策

- 三位专家（发布经理 / 阻断审计 / 运维回滚）**一致赞成发布 `0.1.0-beta.65`**。
- 用户可见变更（自 `v0.1.0-beta.64`）：PR #382 投递按尝试次数筛选（REQ-232）；
  PR #383 为纯文档，不单独触发发版。
- 门槛：`025ac9b`/`e87cae4` 的 main CI 与 E2E 在专家审计时为 pending，打 tag 前复核为 success；
  无 open PR；无 revert；`beta.64..e87cae4` 的 migrate 目录、`Dockerfile`、`docker-compose.yml`、
  `.env.example` 零变化。
- 版本：`0.1.0-beta.65`；release PR #385（`chore(release): v0.1.0-beta.65`）rebase 合并为
  `cf25272`，其 `CI` 与 `E2E` 均 success。
- tag：`v0.1.0-beta.65`（annotated，指向 `cf25272`）；GitHub Release 已创建
  （prerelease，body 非空）。
- 镜像：`registry.cn-hangzhou.aliyuncs.com/xqvvu/vane:0.1.0-beta.65`
  （linux/amd64 + linux/arm64，index digest `sha256:08bcfa7e…`）；回滚镜像 `0.1.0-beta.64`。
- 升级/回滚：无 migration、无环境变量/配置格式/启动参数变化；回滚仅需换回旧镜像，无需数据修复。

### 下一轮优先项

1. REQ-233（27）Events/Deliveries 同条件切换（纯前端、成本最低）。
2. REQ-235（27）投递暂停记录原因。
3. REQ-227（27）失效筛选引用；REQ-234（25）路由证据直达编辑。
4. Q-224 老库 dedupe 索引迁移评估（forward-only `0004`）。
5. REQ-236（26）表格列可见性；REL-22 扩展 E2E spec 覆盖 Route/Delivery/retry/过滤。

## 2026-10-23（第 85 轮）

- 时间：2026-10-23 04:26 CST 起。
- 基线：本轮开始时 `origin/main` @ `c4a8243`；main CI 最近一次 success（同 commit 的 E2E 仍在跑）；
  无 open PR；`v0.1.0-beta.63` 的 tag 与 GitHub Release 均已存在。
- 类型：**`full-audit`（受时间/配额约束展开 3 条车道）** —— `requirements`（窄扫描）、
  `ui-triage`、轮转车道 `security-exposure`。`docs-drift`、`release-infra`、`architecture`、
  `quality` 顺延。
- 全量审计时间戳：**第 1 轮（2026-10-18 13:30 CST，未变）**——本轮未覆盖全部车道。
- 车道轮转位置：**`docs-drift`**（下一轮非必跑车道）。
- `ui-triage`：**`defer`** —— 距上次评审 8h42m（`last_ui_review_at` 2026-10-22 19:45）；
  自评审以来 UI 路径合并 2 个（`48e0e74`、`10b44f6`），均已浏览器复验；未评审 UI 合并 0；
  `UI-` candidate 21 条（阈值 25）；无新增 HIGH。下一触发：满 48h（2026-10-24 19:45）、
  未评审 UI 合并 ≥3、新增 UI 发现 ≥2、candidate ≥25，或出现新 HIGH。
- `last_ui_review_at`：**2026-10-22 19:45 CST**（未变，本轮未做 UI 评审）。
- 工作树：`agent-iteration` 仅用于并发锁与干净基线；实现、验证在会话工作树
  `objective-pare-bcf899`。

### 本轮交付

- PR #378 `feat(console): anchor relative time windows to a URL timestamp`（REQ-231，27 分）：
  URL 增可选 `rangeAnchor`，操作者选择时间范围时写入秒级时刻；`OperationsService` 用它代替
  请求时刻计算 `since`（无锚点行为完全不变）；chip 显示绝对下界（「最近 1 小时 · 自 10/23 04:00」）；
  更换窗口或清除窗口丢弃旧锚点，未来锚点钳制到请求时刻，不可解析锚点回退请求时刻。
  新增 11 条测试（锚点解析/prune/merge 6、紧凑时间格式 2、chip 渲染 2、service 锚定与 clamp 1）。
  PRD `docs/prd/operations-time-range.md` 同步。
  验证：`vp fmt --write`；`vp check` 0 errors / 18 既有 warning；`vp run -r test` 4/4 包通过
  （console 916 tests）；`vp run -r build` 通过。
  注：本轮开始时 `vp check` 报 3938 errors（`Cannot find type definition file for 'node'`），
  `vp install --frozen-lockfile --force` 后恢复 0 errors；属会话工作树链接残缺，非代码问题。
- PR #379 `fix(core): redact PEM private keys and SigV4 signatures`（SEC-30）：
  `privateKeyPem` / `X-Amz-Signature` 归一化后词尾是 `pem` / `signature` 且带厂商前缀，
  精确集合未覆盖；补 `privatekeypem` / `xamzsignature` 与正反例测试。仅扩大脱敏覆盖。

### 专家发现

- `requirements`（窄扫描）：
  - REQ-231、REQ-232 证据在 `origin/main @ c4a8243` 复核成立；REQ-231 本轮实现。
  - **REQ-233（27）** Events/Deliveries 同条件切换：两页共用筛选维度，但侧栏 `Link` 不带
    search（`dashboard-navigation.tsx:59,73`），两个工具栏只有刷新/重置
    （`events-page-toolbar.tsx:18-48`、`deliveries-page-toolbar.tsx:19-66`）。
  - **REQ-234（25）** 投递详情路由证据直达路由编辑：路由只有文本
    （`delivery-summary-tab.tsx:26-29`、`delivery-route-evidence.tsx:41-46`），Routes 编辑态
    只在组件本地（`routes-page.tsx:26-31`），`_dashboard.routes.tsx:9-21` 无 `validateSearch`。
- `security-exposure`：
  - 新发现 **SEC-30（LOW）**：`privateKeyPem` / `x-amz-signature` 绕过 `isSensitiveKey`
    （`redaction.ts:13-60,76-77`）；本轮已修（#379）。
  - 已核实 clean（下轮不必重复）：SEC-25 四处 `renderedPayload` 均已脱敏
    （`destination.service.ts:202-205,314-317,326-329,341-343`）；SEC-13 精确键集合完整；
    SEC-24 测试覆盖到位（`read-projection-redaction.test.ts:67-76,119-147`）；SEC-22 的
    list/detail 已剥离 URL 密码（`destination.helpers.ts:63,346-363`）；import protection 无漏标；
    旧仓库名 `xqvvu/vane` 仅剩 ACR 镜像坐标与历史日志文本。
  - 仍开放且已被 backlog 跟踪：SEC-22 编辑草稿原值（`destination.helpers.ts:116,129`）、
    SEC-26 webhook path/查询串凭据（`destination.helpers.ts:63,84,161-163`），均需 EXPERT_PANEL。
- `ui-triage`：`defer`（理由见上）。

### EXPERT_PANEL

- 本轮无新的裁决事项；SEC-22 / SEC-26 维持既有 EXPERT_PANEL 状态。

### 文档同步

- `obsidian-vault` skill 在本会话不可用，本轮 Obsidian 同步已跳过（仓库内文档已更新）。

### 发布决策

- 三位专家（发布经理 / 阻断审计 / 运维回滚）**一致赞成发布 `0.1.0-beta.64`**。
- 用户可见变更（自 `v0.1.0-beta.63`）：PR #378 相对时间窗锚定（REQ-231）、
  PR #379 PEM/SigV4 脱敏收口（SEC-30）。
- 门槛：目标 SHA `dcff721` 的 `CI` 与 `E2E` 均 success；无 open PR；无 revert；
  `v0.1.0-beta.63..dcff721` 的 migrate 目录、`Dockerfile`、`docker-compose.yml`、
  `.env.example` 均零变化。
- 版本：`0.1.0-beta.64`；release PR #380（`chore(release): v0.1.0-beta.64`）。
- tag：`v0.1.0-beta.64`（annotated，指向 release PR 合并后的 main commit）；
  GitHub Release 已创建（prerelease，body 非空）。
- 镜像：`registry.cn-hangzhou.aliyuncs.com/xqvvu/vane:0.1.0-beta.64`
  （linux/amd64 + linux/arm64，index digest `sha256:01fc9cb6…`）；回滚镜像 `0.1.0-beta.63`。
- tag 指向 `d6758c7`（release PR 合并后的 main commit，其 `CI` 与 `E2E` 均 success）。
- 升级/回滚：无 migration、无环境变量/配置格式变化；回滚仅需换回旧镜像，无需数据修复。

### 下一轮优先项

1. REQ-232（27）投递按尝试次数筛选（证据已复核；URL `minAttempts` + `attempt_count >= n`）。
2. REQ-233（27）Events/Deliveries 同条件切换（纯前端、成本最低）。
3. Q-224 老库 dedupe 索引迁移评估（forward-only `0004`）。
4. REQ-227（27）失效筛选引用；REQ-234（25）路由证据直达编辑。
5. REL-22 扩展 E2E spec 覆盖 Route/Delivery/retry/过滤。

## 2026-10-23（第 84 轮）

- 时间：2026-10-23 00:57 CST 起。
- 基线：本轮开始时 `origin/main` @ `bd4bfbe`；main CI 最近 3 次 success；无 open PR；
  `v0.1.0-beta.62` 的 tag 与 GitHub Release 均已存在。
- 类型：**`full-audit`（受时间约束只展开 2 条车道）** —— `requirements`（窄扫描）与
  `ui-triage`；轮转车道 `security-exposure` 顺延。实现名额给第 83 轮已裁决的 Q-23 + Q-37。
- 全量审计时间戳：**第 1 轮（2026-10-18 13:30 CST，未变）**——本轮未覆盖全部车道。
- 车道轮转位置：**`security-exposure`**（未变，下一轮非必跑车道）。
- `ui-triage`：**`defer`** —— 距上次评审 5h14m（`last_ui_review_at` 2026-10-22 19:45）；
  自评审以来 UI 路径合并 2 个（`48e0e74`、`10b44f6`），均已浏览器复验；未评审 UI 合并 0；
  `UI-` candidate 21 条（阈值 25）；无新增 HIGH。再触发条件：满 48h（2026-10-24 19:45）、
  未评审 UI 合并 ≥3、新增 UI 发现 ≥2、candidate ≥25、或出现新 HIGH 可复现缺陷。
- `last_ui_review_at`：**2026-10-22 19:45 CST**（未变，本轮未做 UI 评审）。
- 工作树：`agent-iteration` 仅用于并发锁与干净基线；实现、验证在会话工作树
  `eloquent-williams-a13a69`。工作树已清理。

### 本轮交付

- PR #375 `fix(console): bound dedupe cleanup and window the key check`：
  按第 83 轮 EXPERT_PANEL 的三步决策实施 Q-23 + Q-37，delivery 与 oncall 同 PR。
  1. 存在性判断加 `created_at >= windowStartsAt`，命中返回且不刷新 `created_at`；
  2. 插入改 UPSERT（`onConflict().doUpdateSet()`），接管有界清理尚未触及的旧行；
     否则裸 INSERT 会撞四列主键并回滚整个 enqueue（自动加急异常还会被吞掉）；
  3. 清理改最旧优先有界批（100 条，`rowid IN (SELECT … LIMIT)`），仍在写事务内、判定之前。
  新增 `delivery-dedupe.test.ts` 6 例：窗口边界（`>=` 抑制 / `-1ms` 不抑制）、命中不刷新、
  250 条旧键一次只删 100 且最旧优先、旧键被接管后重投成功、replay 绕过、oncall 同构两例。
  反向验证：临时回退 UPSERT 后两例以 `UNIQUE constraint failed` 失败，恢复后全绿。
  同步修正 `route-match-gaps.ts` 注释与 `docs/prd/route-explain-delivery-gap.md`
  「超过窗口必然被 prune」的旧表述（有界清理后旧行可留存）。
  验证：`vp fmt --write`；`vp check` 0 errors / 18 既有 warning；`vp run -r test`
  4/4 包通过（console 905 tests）；`vp run -r build` 通过。
  注：本轮开始时 `vp check` 报 3935 errors（`JsonObject` 退化为 any），
  `vp install --frozen-lockfile --force` 后恢复为 0 errors；属会话工作树链接残缺，
  非代码问题，与此前轮次记录的现象一致。

### 专家发现

- `requirements`（窄扫描，2 条候选，均 27 分，已达门槛但本轮未实现）：
  - REQ-231（27）相对时间窗锚定：每次请求用服务端当前时刻重算 `since`
    （`operations.service.ts:36,107`），URL 只有 `range`（`operation-search.ts:40-43`），
    翻页/分享链接窗口滑动会重复或漏行；chip 不显示解析后的绝对窗口
    （`operation-filters.tsx:589-596`）。
  - REQ-232（27）投递按尝试次数筛选：查询无 `attempt_count` 谓词
    （`history.repository.ts:280-298`），但 DTO 已暴露（`packages/core/src/operations.ts:120`）
    且表格已展示（`deliveries-table.tsx:93-95`），筛选面板缺控件
    （`operation-filters.tsx:337-419,456-493`）。
- `ui-triage`：`defer`（理由见上）。
- 轮转车道 `security-exposure` 本轮未跑，顺延下一轮。

### EXPERT_PANEL

- 本轮无新的裁决事项；执行第 83 轮已落盘决策
  `docs/planning/decisions/dedupe-window-and-bounded-prune.md`，状态已更新为「已实施」。
- Q-224（老库 `idx_delivery_dedupe_created_at` 迁移）仍未评估，下一轮单独处理。

### 文档同步

- `obsidian-vault` skill 在本会话不可用，本轮 Obsidian 同步已跳过（仓库内文档已更新）。

### 发布决策

- 三位专家（发布经理 / 阻断审计 / 运维回滚）**一致赞成发布 `0.1.0-beta.63`**。
- 用户可见变更（自 `v0.1.0-beta.62`）：PR #373 预览/测试载荷脱敏（SEC-25）、
  PR #375 去重窗口与有界清理（Q-23/Q-37）；PR #372/#374 为 CI/文档，不单独触发发版。
- 门槛：目标 SHA `a95bace` 的 `check · test · build` 与 `playwright · chromium` 均 success；
  无 open PR；无 revert/未修复回归；`v0.1.0-beta.62..a95bace` 的 migrate 目录零变化。
- 版本：`0.1.0-beta.63`；release PR #376（`chore(release): v0.1.0-beta.63`）rebase 合并为
  `4e1a3da`。
- tag：`v0.1.0-beta.63`（annotated，指向 `4e1a3da`）；GitHub Release 已创建（prerelease，
  body 非空）。
- 镜像：`registry.cn-hangzhou.aliyuncs.com/xqvvu/vane:0.1.0-beta.63`
  （linux/amd64 + linux/arm64，index digest `sha256:0830ffc0…`）；回滚镜像 `0.1.0-beta.62`。
- 升级/回滚：无 migration、无环境变量/配置格式变化；回滚仅需换回旧镜像，无需数据修复。

### 下一轮优先项

1. REQ-231（27）相对时间窗锚定。
2. REQ-232（27）投递按尝试次数筛选。
3. Q-224 老库 dedupe 索引迁移评估（forward-only `0004`）。
4. REQ-227（27）失效筛选引用；REQ-228/229（25）。
5. REL-22 扩展 E2E spec 覆盖 Route/Delivery/retry/过滤。

## 2026-10-23（第 83 轮）

- 时间：2026-10-22 23:58 CST 起（跨日）。
- 基线：本轮开始时 `origin/main` @ `4e3e702`；main CI 最近 3 次 success；无 open PR；
  `v0.1.0-beta.62` 的 tag 与 GitHub Release 均已存在。
- 类型：**`full-audit`（受配额/时间约束只展开 3 条车道）** —— `requirements`（窄扫描）、
  `ui-triage`、轮转车道 `docs-drift`；实现阶段另并发 3 位专家对 Q-23 + Q-37 做
  EXPERT_PANEL。`security-exposure`、`release-infra`、`architecture`、`quality` 顺延。
- 全量审计时间戳：**第 1 轮（2026-10-18 13:30 CST，未变）**——本轮未覆盖全部车道，
  不更新，下一轮仍按「距上次全量审计 ≥6h」处理。
- 车道轮转位置：**`security-exposure`**（下一轮非必跑车道）。
- `ui-triage`：**`defer`** —— 距上次评审 4h17m（`last_ui_review_at` 2026-10-22 19:45）；
  自评审以来 UI 路径提交 2 个（`48e0e74`、`10b44f6`），均已在隔离实例浏览器复验；
  未评审 UI 合并 0；新增未解决 UI 发现 0（candidate 存量 21，未到 25 阈值）。
  再触发条件：满 48h（2026-10-24 19:45）、未评审 UI 合并 ≥3、新增 UI 发现 ≥2、
  candidate 存量 ≥25、或出现新的 HIGH 可复现缺陷。
- `last_ui_review_at`：**2026-10-22 19:45 CST**（未变，本轮未做 UI 评审）。
- 工作树：`agent-iteration` 仅用于并发锁与干净基线；实现、验证在会话工作树
  `clever-bose-83d396`。工作树已清理。

### 本轮交付

- PR #373 `fix(console): redact rendered destination preview payloads`：
  `testDestination`、模板诊断、adapter preview、模板校验错误四处 `renderedPayload`
  统一过 `redactJsonText`；新增按 `DestinationKindSchema.options` 参数化的回归测试
  （每种 kind 一个 secret 标记，断言 DTO 不含明文且含 `[REDACTED]`）。
  反向验证：临时回退 `destination.service.ts` 后新测试失败，恢复后通过。
  验证：`vp fmt --write`；`vp check` 0 errors / 18 既有 warning；
  `vp run -r test` console 899 tests；`vp run -r build` 通过。
- PR #374 `docs: correct drift in route authoring, RC gates, PRDs and architecture`：
  关闭 DOC-23/26/34/45/48/51/62/66；同一 PR 携带本轮日志、backlog 与决策记录，
  CI 通过后 rebase 合并。

### 专家发现

- `requirements`（窄扫描，3 条候选，均未达 27 分门槛，已写入 backlog）：
  - REQ-228（25）按渠道类型暂停出站投递：`claimNext` 无 kind 条件
    （`delivery.repository.ts:221-242`），全局暂停不区分渠道
    （`delivery-worker.service.ts:60-76`、`settings.helpers.ts:8-11`）。
  - REQ-229（25）预览/测试标明配置来源：
    `destinations-page.tsx:38-41,132-158,180-182,250-256`、
    `destination-notices.tsx:114-121`、`destination.ts:144-152`。
  - REQ-230（24）告警源批量启停：`sources-section.tsx:41-91`、
    `source-actions.tsx:119-190`。
- `ui-triage`：`defer`（理由与再触发条件见上）。
- `docs-drift`（8 条均经代码核实）：
  - DOC-34 `docs/research/route-authoring-current-state.md:17,105,115` 仍称
    「无解释通道 / 无 route×destination 视图」，实际 `route-match-gaps.ts:57` +
    `event-detail-route-gaps.tsx:29,45-47` 已交付。
  - DOC-66 `docs/release/mvp-rc-checklist.md:20-21,148-150` 把 provider contributor
    guide 列为剩余 gate，E 节 `:177-183` 没有该条目。
  - DOC-26 三份已交付 mini-PRD 仍用现在时：`delivery-retention-notice.md:5-12`、
    `event-fingerprint-silence.md:5-9`、`raw-payload-pruned-state.md:5-15`。
  - DOC-51 `frontend-architecture.md:21-22,160-176,193-194` 清单缺
    Suppressions/Integrations/Auth（实际 10 个 feature、8 个导航入口）。
  - DOC-23 `application-container.md:35,39-53` factory 清单缺
    `createRuntimeInformationService()`，runtime 树缺 5 个服务/类型文件。
  - DOC-48 四份 PRD 缺状态头；DOC-62 `sqlite-store.md:369,483` 文件名拼写；
    DOC-45 `README.md:202,229,231` Roadmap 过期。

### EXPERT_PANEL：Q-23 + Q-37

- 三位专家（安全与可靠性 / 产品与运维 / 独立评估者）**一致**：修复必须是三步，
  不是第 81 轮的两步。
  1. 存在性判断加 `created_at >= windowStartsAt`，命中即返回、不刷新 `created_at`；
  2. 插入必须改 UPSERT/条件替换。否则窗口谓词让旧行不可见但仍占主键，
     裸 `INSERT` 触发 `SQLITE_CONSTRAINT_PRIMARYKEY`：投递事务回滚（webhook 500），
     自动加急异常被 `delivery-execution.ts:126-132` 吞掉（静默漏呼）。
     评估者已在 `:memory:` 用仓库自带 better-sqlite3 复现。
  3. prune 改有界批（rowid 子查询、`ORDER BY created_at LIMIT`、批 100），
     保留在 enqueue 写事务内且在判定之前；delivery 与 oncall 同 PR。
- 分歧与裁决：批大小 100（产品/评估者）vs 500（安全）→ 取更保守的 **100**；
  forward-only `0004` 补 `idx_delivery_dedupe_created_at`（评估者建议、安全专家反对）
  → 本轮不纳入，另立 **Q-224** 下轮单独评估迁移风险。
- 决策记录：`docs/planning/decisions/dedupe-window-and-bounded-prune.md`
  （含三人意见、验收标准、回滚步骤）。
- 本轮不实施：时间预算不足，且本轮「小修复」名额已被 SEC-25 占用；
  下一轮最高优先实施。

### 发布决策

- **本轮不发布**：SEC-25 属用户可见修复，理论满足发版条件；但本轮时间预算不足以
  完成版本递增 PR + tag/Release + 多平台镜像构建与验证，按「超时不再启动新的实现
  工作」顺延下一轮优先评估。`v0.1.0-beta.62` 仍为最新版本。

### 文档同步

- `obsidian-vault` skill 在本会话不可用，本轮 Obsidian 同步已跳过（仓库内文档已更新）。

### 下一轮优先项

1. Q-23 + Q-37 三步修复（决策已落盘；delivery/oncall 同 PR；补判别性测试）。
2. 发布评估：`0.1.0-beta.63`（SEC-25 用户可见修复；若 Q-23/Q-37 也合入则一并发布）。
3. Q-224 老库 dedupe 索引迁移评估（forward-only `0004`）。
4. REQ-227（27）失效筛选引用；REQ-228/229（25）。
5. REL-22 扩展 E2E spec 覆盖 Route/Delivery/retry/过滤。

## 2026-10-22（第 82 轮）

- 时间：2026-10-22 22:46 CST 起。
- 基线：本轮开始时 `origin/main` @ `6a26b46`；main CI 最近 3 次 success；有 1 个遗留
  open PR `#371`（第 81 轮日志的 PR 引用修正，1 行 docs 改动），本轮已 rebase 合入
  `22449b1`；`v0.1.0-beta.62` 的 tag 与 GitHub Release 均已存在。
- 类型：**`full-audit`（受配额约束只展开 3 条车道）** —— `requirements`、`ui-triage`、
  轮转车道 `security-exposure`；`docs-drift`、`release-infra`、`architecture`、`quality`
  顺延。实现名额给 REL-21 + REL-7（E2E 接入 CI 与 harness 修复）。
- 全量审计时间戳：**第 1 轮（2026-10-18 13:30 CST，未变）**——本轮未覆盖全部车道，
  不更新，下一轮仍按「距上次全量审计 ≥6h」处理。
- 车道轮转位置：**`docs-drift`**（下一轮非必跑车道）。
- `ui-triage`：**`defer`** —— 距上次评审 3h02m（`last_ui_review_at` 2026-10-22 19:45）；
  自评审以来 UI 路径提交 2 个（`48e0e74`、`10b44f6`），均已在隔离实例浏览器复验；
  未评审 UI 合并 0；未解决 `UI-` 发现 21 条（18 shipped / 21 candidate，自评审后新增 0）。
  再触发条件：满 48h（2026-10-24 19:45）、未评审 UI 合并 ≥3、新增 UI 发现 ≥2、
  candidate 存量 ≥25、或出现新的 HIGH 可复现缺陷。
- `last_ui_review_at`：**2026-10-22 19:45 CST**（未变，本轮未做 UI 评审）。
- 工作树：`agent-iteration` 仅用于并发锁与干净基线；实现、验证在会话工作树
  `zen-gauss-d93075`。工作树已清理。
- 依赖：`agent-iteration` 与会话工作树都执行了 `vp install --frozen-lockfile`（热 store，
  3–6s）；另装了 Playwright 1.64.1 期望的 Chromium **1248**（本机原先只有 1234）。

### 本轮交付

- PR #371 `docs(planning): fix the round 81 PR reference`（rebase 合并 `22449b1`）。
- PR #372 `ci(e2e): run the browser suite in GitHub Actions`：
  - 新增 `.github/workflows/e2e.yml`（job `playwright · chromium`，25 分钟上限，
    `push` main + `pull_request`，`playwright install --with-deps chromium`，
    失败上传 `apps/console/test-results` 保留 3 天）。
  - `playwright.config.ts`：host/baseURL 改 `localhost`；就绪探针改 `/api/ready`；
    清库移入 webServer 启动命令并删除 `e2e/global-setup.ts`（消除「服务先打开并迁移
    数据库、globalSetup 后删库」的时序竞争）。
  - `Justfile`：`just e2e` / `e2e-ui` 显式 `playwright install chromium`。
  - `vite.config.ts`：`vp staged` 的 fmt 规则加 `--no-error-on-unmatched-pattern`。
    `.github/**` 在 `ignorePatterns` 内，单独提交 workflow YAML 会让 pre-commit
    以 "all matched files may have been excluded" 失败——本次新增 workflow 正好触发。
  - 发布文档同步 7 个文件（README、release-checklist、mvp-rc-checklist、
    post-mvp-planning、self-hosted-alert-hub-mvp、history-retention-and-snapshots、
    backup-restore-upgrade）；gate A 拆成「workflow 已存在（勾选）」与「spec 覆盖面
    （留给 REL-22）」。
  - 验证：`vp fmt --write`；`vp check` 0 errors / 18 既有 warning；`vp run -r test`
    4/4（console 898 tests）；`vp run -r build`；`playwright test` 改动前后各 1 passed
    （15.7s / 15.0s，改动后刻意保留旧数据库以证明清库发生在启动前）。

### 专家发现

- `requirements`（窄扫描，15 分钟时间盒内产出 2 条）：
  - REQ-226（26）：筛选只有「包含」语义，值班时无法「排除刷屏的上游」而不改变投递语义
    （`operation-filters.tsx:255-258,345-346,399-400`、`history.repository.ts:98-100,268-290`）。
  - REQ-227（27）：URL 引用的 Source/Destination/Route 被删除后，chip 静默回退为原始 ID，
    空态只提示「有筛选」，分享链接会表现为「没有告警」（`operation-filters.tsx:523-530,
    551-556,570-575`、`events-empty-state.tsx:29-43`、`deliveries-empty-state.tsx:29-45`）。
  - 两条均已写入 backlog（均为 candidate，本轮未实现）。
- `ui-triage`：`defer`，理由与再触发条件见上。
- `security-exposure`（只读，附 `file:line`）：
  - MEDIUM / SEC-25 仍开放：test/preview 的 `renderedPayload` 未投影
    （`apps/console/src/server/destinations/destination.service.ts:202,314,326,340`，
    `redactJsonText` 已在 `:30` 导入）→ AUTO_FIX 可做。
  - MEDIUM / SEC-26 + SEC-22 仍开放：`destination.helpers.ts:63` 仅去 URL userinfo 密码
    （`:346-363`），Slack/Feishu path token 与 generic `?token=`/`?sig=` 原样进入 5 个
    SSR loader 预取的 `destinations.list`，以及 `:161-163` 投递元数据与 `:116,129`
    编辑草稿 → 查询串投影可 AUTO_FIX，完整 URL 可见性仍需 EXPERT_PANEL。
  - 未发现问题：脱敏测试对凭据型 key 有真实覆盖（`packages/core/src/redaction.test.ts:94-158`、
    `read-projection-redaction.test.ts:113-147`）；import protection 标记无违规；
    `xqvvu/vane` 无代码/配置残留；近期提交未把 secret 写入日志或 DTO。

### EXPERT_PANEL

- 本轮无代码级裁决事项。Q-23 + Q-37（dedupe 窗口谓词 + 有界 prune）仍待下一轮
  EXPERT_PANEL 后再实施；SEC-26 的完整 URL 可见性同样待裁决。

### 发布决策

- **本轮不发布**：自 `v0.1.0-beta.62` 以来的变更只有 PR #371/#372（CI workflow、
  E2E harness、pre-commit 配置、文档状态同步），没有用户可见的行为变化或修复；
  按 routine「纯 docs/chore/test 变更永远不触发发版」跳过打 tag 与镜像推送。
- 补建检查：最近 10 个 tag 均有对应 GitHub Release，无待补建项。

### 文档同步

- `obsidian-vault` skill 在本会话不可用，本轮 Obsidian 同步已跳过（仓库内文档已更新）。

### 下一轮优先项

1. `docs-drift` 车道（轮转）。
2. Q-23 + Q-37：dedupe `created_at` 窗口谓词 + 有界批，先 EXPERT_PANEL。
3. SEC-25：test/preview `renderedPayload` 套 `redactJsonText`（AUTO_FIX，按 kind 参数化断言）。
4. REQ-227（27）：失效筛选引用识别与一键清除（纯前端）。
5. REL-22：扩展 E2E spec 覆盖 Route/Delivery/retry/过滤。

## 2026-10-22（第 81 轮）

- 时间：2026-10-22 21:28 CST 起。
- 基线：本轮开始时 `origin/main` @ `ada8f2a`；main CI 最近 3 次 success；有 1 个遗留
  open PR `#368`（第 80 轮创建，CI 卡在 `Install system deps`）；`v0.1.0-beta.61` 的
  tag 与 GitHub Release 均已存在，最近 10 个 tag 全部有 release，无待补建项。
- 类型：**遗留 PR 收尾 + 三车道审计 + 发布评估**（非 full-audit）。按第 1 步「有遗留
  open PR 优先推进」，本轮实现名额由 #368 收尾占用，不再开新需求切片。
- 全量审计时间戳：第 1 轮（2026-10-18 13:30 CST，未变）。
- 车道：`requirements` + `ui-triage` 必跑；`ui-triage` 判定 **`defer`**；第三名额给
  `release-infra`（第 80 轮遗留的 REL-21 需要落地评估，轮转的 `security-exposure`
  顺延下一轮）；并发 ≤3。
- 车道轮转位置：**`security-exposure`**（下一轮非必跑车道）。
- `requirements`：连续第 3 轮（第 78、80、81 轮）在限时内无产出（本轮 23 分钟仍停在
  「列出 backlog 标题以避免重复」），按时间纪律终止；下一轮改为窄扫描：只读
  `docs/prd/post-mvp-planning.md` + 3 个指定 UI 目录，先给 2 条候选再扩展。
- `ui-triage`：**`defer`** —— 距上次评审 1h47m（`last_ui_review_at` 2026-10-22 19:45）；
  自评审以来 UI 路径提交仅 1 个且已于第 79 轮浏览器复验（`48e0e74`）；triage 时未评审
  UI 合并 0；新增未解决 UI 发现 0（22 条存量均为第 79 轮评审自身产出）；静态扫描仅
  已知的 `destinations-empty-state.tsx:16` 一处空态不一致（UI-37）。#368 在 triage 后合并，
  第 80 轮已在隔离实例 6207 实测 Token 可见 / 失败提示 / 关闭后消失，计入已评审。
  再触发条件：满 48h（2026-10-24 19:45）、未评审 UI 合并 ≥3、新增 UI 发现 ≥2、
  存量 ≥25、或出现新的 HIGH 可复现缺陷。
- `last_ui_review_at`：**2026-10-22 19:45 CST**（未变，本轮未做 UI 评审）。
- 工作树：`agent-iteration` 仅用于并发锁；实现与验证在会话工作树
  `nervous-rosalind-bca514`。工作树已清理。
- 依赖：会话工作树 `node_modules` 已存在且可用；本轮无代码改动，未重装。

### 本轮交付

- PR #368 `fix(console): show the one-time source token and report copy failures` ——
  第 80 轮创建的遗留 open PR，本轮 CI 恢复后 **rebase 合并为 `4856b5b`**（含 `10b44f6`
  修复、`3ba4338` 决策记录、`4856b5b` 第 80 轮日志）。合并前复核：
  `check · test · build` 2m18s 通过；其余 3 个 `copyText` 调用方均有 try/catch
  （`copyable-code-line.tsx:71-78`、`delivery-ping-detail-dialog.tsx:131-138`、
  `delivery-attempt-detail-dialog.tsx:161-168`），`copyText` 由返回 boolean 改为
  失败抛错不会造成未捕获拒绝。合并后 main CI（`4856b5b`）success。
- PR #370 `docs(planning): record round 81 and refresh release baselines`：本轮日志与 backlog 更新
  （UI-36/Q-38 → shipped；Q-23/Q-37 补 dedupe 窗口谓词陷阱；REL-21 补可执行
  workflow 方案与文档同步清单；REL-24 补第一批搬运方案；REL-16/REL-23 → blocked-autonomous）。

### 专家发现

- `requirements`：无输出（限时终止，见上）。
- `ui-triage`：`defer`（见上）。
- `release-infra`（只读，附 `file:line`）：
  - HIGH / REL-21：仓库仍无 E2E workflow（`.github/workflows/` 仅 `ci.yml:16-51`）。
    已给出可直接落地的 `e2e.yml`：job `playwright · chromium`、`timeout-minutes: 25`、
    `voidzero-dev/setup-vp@v1` + `vp install --frozen-lockfile` +
    `vp -C apps/console exec playwright install --with-deps chromium` +
    `vp -C apps/console exec playwright test`，失败上传 `apps/console/test-results`。
    不需要 workflow 级 env：`playwright.config.ts:32-43` 已起 webServer 并注入
    `TOCSIN_DATABASE_PATH`/`BETTER_AUTH_SECRET`/`BETTER_AUTH_URL`。本地前置：Playwright
    1.64.1 期望 Chromium **1248**，本机缓存 1234，必须先 `playwright install chromium`。
    不要用 `just e2e`（GitHub runner 无 `just`，且 `justfile:78-79` 不装浏览器）。
  - MEDIUM / Q-23 + Q-37（**新发现的语义陷阱**）：dedupe 存在性判断没有 `created_at`
    窗口谓词（`delivery.helpers.ts:88-99`、`oncall.repository.ts:41-47`）。若只把 prune
    改成有界批，窗口外的旧 key 仍会命中并**错误抑制新投递**；必须同一 PR 两步：
    ① 判定加 `created_at >= windowStartsAt`；② prune 改有界批或移出写事务。
    `created_at` 已有索引（`migrate/schema.ts:275-276,290`）。触及投递语义 → EXPERT_PANEL。
  - MEDIUM / REL-24：6 个 provider 测试文件共 848 行、19 个内联 payload；第一批只搬
    5 文件 / 10 payload 到**包根** `packages/providers/fixtures/<provider>/<scenario>.json`
    （`feishu/index.test.ts:15-16` 的 `with { type: "json" }` 先例可用）。多版本真实
    payload 需上游样本，禁止编造。
  - MEDIUM：`mvp-rc-checklist.md:129-130` 的 gate A 把「workflow 存在」与「spec 覆盖
    Route/Delivery/retry/过滤」混在一起，需拆分；新增 workflow 后需同步 7 个文档文件
    （`README.md:9-10`、`release-checklist.md` 6 处、`history-retention-and-snapshots.md:91`、
    `backup-restore-upgrade.md:180`、`mvp-rc-checklist.md` 7 处、`post-mvp-planning.md:169`、
    `self-hosted-alert-hub-mvp.md:20`）。
  - MEDIUM：`release-checklist.md` 的版本断言已由第 80 轮 #367 修正，无新增过期。
  - LOW：`e2e/global-setup.ts:13-18` 在 webServer 启动后才删库（本地会删掉运行中连接
    的库；CI 干净 runner 上是 no-op）；建议把 `rm -f` 前移到 webServer command。
  - 事实：main 无 branch protection、rulesets 为空（REL-16/REL-23）；当前 token 仅
    `repo`+`workflow`、无 admin，无法启用保护 → 保持 blocked-autonomous。新增
    `e2e.yml` 不受影响，也不会自动成为门禁。

### EXPERT_PANEL

- 本轮无代码级裁决事项；Q-23 + Q-37 的修复方案已明确但需下一轮 EXPERT_PANEL 批准后实施。
- 发布评估由三位专家（发布经理 / 阻断审计 / 运维回滚）独立给出，见「发布决策」。

### 发布决策

- 三位专家（发布经理 / 阻断审计 / 运维回滚）**一致赞成发布 `0.1.0-beta.62`**。
  - 发布经理：`v0.1.0-beta.61..origin/main` 共 5 个提交，唯一用户可见变更为 `10b44f6`；
    预发布递增 N。
  - 阻断审计：目标 commit `4856b5b` CI success 且 SHA 对齐；无 open PR；无未修复 HIGH；
    `beta.61..main` 未触碰 `migrate/`；#368 已 rebase 合并。
  - 运维/回滚：`Dockerfile`/`Justfile`/compose/`.node-version`/lockfile/`server/**` 均未改动；
    无迁移，SQLite 双向兼容；回滚只需换回 `0.1.0-beta.61` 镜像；版本号须先 bump 再构建，
    否则容器自报 beta.61。
- 发布结果见下方「发布记录」。

### 发布记录

- 版本：`0.1.0-beta.62`；release PR #369（`chore(release): v0.1.0-beta.62`）rebase 合并为
  `63c8931`，main CI success。
- tag：`v0.1.0-beta.62`（annotated，指向 `63c8931`）；GitHub Release 已创建
  （prerelease，描述含镜像、升级与回滚说明，body 非空校验通过）。
- 镜像：`registry.cn-hangzhou.aliyuncs.com/xqvvu/vane:0.1.0-beta.62`
  （linux/amd64 + linux/arm64，index digest `sha256:b658c913…`），
  构建参数 `--provenance=false --sbom=false`，builder `tocsin-multi`。
- 发布依据：自 `v0.1.0-beta.61` 起唯一用户可见变更 #368（一次性 Token 可见 + 复制失败
  真实提示）；无迁移、无配置/环境变量/依赖变化。
- 回滚：换回 `registry.cn-hangzhou.aliyuncs.com/xqvvu/vane:0.1.0-beta.61`，无需清理
  持久化状态。

### 下一轮优先项

1. `security-exposure` 车道（轮转）：脱敏 key 形态测试、secret 投影回归。
2. REL-21：落地 `e2e.yml`（先本地跑通 Chromium 1248 + `playwright test`），同一 PR 拆分
   gate A 文本并同步 7 个文档断言。
3. Q-23 + Q-37：dedupe 窗口谓词 + 有界批，先 EXPERT_PANEL 再实施。
4. REL-24 第一批 fixture 搬运（5 文件 / 10 payload）。
5. `requirements` 改窄扫描（连续 3 轮停滞）。

## 2026-10-22（第 80 轮）

- 时间：2026-10-22 20:26 CST 起。
- 基线：本轮开始时 `origin/main` @ `32f7fcf`；main CI 最近 3 次 success；无 open PR；
  `v0.1.0-beta.61` 的 tag 与 GitHub Release 均已存在，无待补建项。
- 类型：**需求切片 + 三车道审计 + 发布评估**（非 full-audit）。backlog 有多个 ≥27 候选
  （UI-36、NEW-BP、REQ-223），按第 1.5 步继续。
- 全量审计时间戳：第 1 轮（2026-10-18 13:30 CST，未变）。
- 车道：`requirements` + `ui-triage` 必跑；`ui-triage` 判定 **`defer`**，第三名额给轮转车道
  `release-infra`；并发 ≤3。
- `requirements` 车道运行 12 分钟仍在读取基线（只返回「开始读取」），按限时纪律终止，
  本轮无新候选；连续第 2 轮（第 78、80 轮）出现同一停滞，下一轮需缩小扫描范围或拆分执行。
- 车道轮转位置：**`security-exposure`**（`release-infra` 已在本轮执行；下一轮从
  `security-exposure` 起）。
- `ui-triage`：**`defer`** —— 距上次评审 0.7h（`last_ui_review_at` 2026-10-22 19:45）；
  自评审以来 UI 路径提交仅 1 个（`48e0e74`）；22 条未解决 `UI-` 发现全部是上一轮评审自身
  产出，无新增；最近的 UI 合并均有隔离实例浏览器记录；静态扫描无系统性断裂。
  再触发条件：满 48h（2026-10-24 19:45）、≥3 个 UI 提交、新增 ≥2 条 UI 发现、存量 >22、
  或出现新的 HIGH UI 发现。
- `last_ui_review_at`：**2026-10-22 19:45 CST**（未变，本轮未做 UI 评审）。
- 工作树：`agent-iteration` 仅用于并发锁；实现、验证、自查均在会话工作树
  `vigorous-allen-df00eb`。工作树已清理。
- 依赖：会话工作树缺 `@rolldown/plugin-babel` 链接，`vp install --frozen-lockfile --force`
  （6.1s，热 store）修复。

### 本轮交付

- PR #367 `docs(release): refresh release checklist baselines`（rebase 合并 `ada8f2a`）。
  - tag 数 51 → 53、最新版本 beta.59 → beta.61、核实基线 → `32f7fcf`；部署文档 Node
    版本 `26.12.0` → `26.12.1`（实测 `.node-version`）。
  - 验证：`vp fmt --check` 通过（824 files）。
- PR #368 `fix(console): show the one-time source token and report copy failures`（**open**）。
  - 成功面板渲染一次性 Token（只读、等宽、可全选），增加「我已保存」显式关闭；
    `copyText` 改为 Clipboard API → textarea + `execCommand` → 抛错；面板失败分支改
    `toast.error` 并给出「请手动选中内容后复制」。
  - 新增 `browser.test.ts`（5 项）与 `source-token-notice-panel.test.tsx`（5 项）；
    同步 E2E 断言；AGENTS.md 记录一次性展示例外。
  - 验证：`vp check` 0 errors（18 个既有 warning）；`vp run -r test` 170 文件 / 898 项；
    `vp run -r build` 通过；code-review（low）无发现。
  - 浏览器实测（隔离 `localhost:6207` + 临时 SQLite）：创建告警源后 Token 可见
    （`tocsin_src_tXwLFEyx7HKzdXA1Da_-3jE_d5xZ2nrj`）；强制 `writeText` 拒绝 +
    `execCommand=false` 后点击「复制 Token」出现「复制失败 / 请手动选中内容后复制」，
    无成功提示；点击「我已保存」后 Token 从 DOM 消失。
  - **CI 卡住**：`check · test · build` 在 `Install system deps` 停留 26+ 分钟（runner
    基础设施问题，非代码失败）。按第 8 步有界等待规则保留 open PR，下一轮继续。

### 专家发现

- `requirements`：无输出（超时终止）。
- `ui-triage`：`defer`，理由与再触发条件见上。
- `release-infra`：
  - HIGH：仓库仍无 E2E workflow，唯一 workflow 是 `.github/workflows/ci.yml:16-50`
    （`vp check` / `vp run -r test` / `vp run -r build`）；`docs/release/mvp-rc-checklist.md:129`
    未勾。→ REL-21。
  - MEDIUM：`just e2e` 不安装 Playwright 浏览器（`Justfile:77-79`），干净机器/CI 会因
    revision 不匹配失败；`playwright.config.ts:26,33,34,41` 仍用 `127.0.0.1` 且探针等
    `/api/health` 而非 `/api/ready`。→ REL-7（已有条目，本轮补证据）。
  - MEDIUM：`release-checklist.md` 版本/tag 数过期两版（已由 #367 修复）。
  - MEDIUM：dedupe 清理仍是无界 `DELETE FROM delivery_dedupe_keys`
    （`delivery.helpers.ts:107-108`，由 `delivery.repository.ts:101` 在入队热路径调用），
    RC gate 171 的未勾状态准确。
  - MEDIUM：provider 无 fixture 目录，6 个 adapter 共 19 处内联 payload（如
    `packages/providers/src/alertmanager/index.test.ts:15`）。→ REL-24（已有条目）。
  - LOW：部署文档 Node 版本过期（已由 #367 修复）；CI 同时用 apt 与 `npm -g` 安装
    node-gyp（`.github/workflows/ci.yml:29,40`）；Docker smoke 卷隔离与多平台构建参数
    核实无问题。
- `EXPERT_PANEL`（UI-36）：安全、产品、评估三位专家独立评估后**一致同意**方案
  A+B+C+D（展示一次性 Token + 复制降级 + 错误提示 + 测试），并要求在 AGENTS.md 记录
  一次性展示例外、同步 E2E 断言、jsdom 显式 stub。决策记录：
  `docs/planning/decisions/source-token-once-display.md`。

### 发布决策

- **本轮不发布**：唯一用户可见变更（PR #368）仍在 open 状态且 CI 未完成；#367 仅为
  docs/chore。无 tag、无镜像推送。

### 下一轮优先项

1. 推进 PR #368：先查 runner 卡在 `Install system deps` 的原因；必要时 rerun。合并后把
   UI-36 / Q-38 标为 shipped。
2. `security-exposure` 车道（轮转位置）：SEC-30/SEC-31、`.server`/`.client` 标记复核。
3. REL-21 + REL-7：E2E workflow 与 `playwright install chromium`；提交前必须本地跑通
   `just e2e`；同时把 `127.0.0.1` 改为 `localhost`、探针改 `/api/ready`。
4. UI-37/38/39 三个低成本一致性项可合为一个 chore 切片。
5. REQ-223：术语收口「已抑制 → 已静默」。
6. `requirements` 车道连续停滞：下一轮改为先给 3 个具体文件范围、限时 10 分钟。

## 2026-10-22（第 79 轮）

- 时间：2026-10-22 19:26 CST 起。
- 基线：本轮开始时 `origin/main` @ `7c356e1`；main CI 最近 3 次 success；无 open PR；
  `v0.1.0-beta.60` 的 tag 与 GitHub Release 均已存在，无待补建项。
- 类型：**UI 评审切片**（非 full-audit）。backlog 有多个 ≥27 候选，按第 1.5 步继续。
- 全量审计时间戳：第 1 轮（2026-10-18 13:30 CST，未变）。
- 车道：`requirements` + `ui-triage` 必跑；`ui-triage` 判定 **`review_now`**，第三名额给
  `ui-review`；并发 ≤3。
- 车道轮转位置：**`release-infra`**（第三名额被 UI 评审占用，未轮转；下一轮从 `release-infra` 起）。
- `ui-triage`：**`review_now`** —— 距上次评审 9h57m（< 48h）；自 09:30 起 UI 路径提交 **13 个**
  （≥3 强信号），含 `ee00fa2` 19 文件的结构性 header/PageToolbar 改动且尚无整体评审；
  未解决 `UI-` 存量 19（≤20）；自评审新增未解决 UI 发现 1 条（UI-35）；未验证 UI 合并 2
  （`777147e`、`a5d8b51`）。
- `last_ui_review_at`：**2026-10-22 19:45 CST**（第 79 轮，隔离实例 `localhost:6206` + 临时 SQLite，
  1280×900 与 390×844 真实浏览器评审）。
- 工作树：`agent-iteration` 仅用于并发锁；实现、验证、自查均在会话工作树
  `silly-noyce-0a2c8c`。工作树已清理。
- 依赖：会话工作树 `node_modules` 缺 `@rolldown/plugin-babel` 链接，
  `vp install --frozen-lockfile --force`（5.5s，热 store）修复。

### 本轮交付

- PR #363 `fix(console): keep the code block's first frame server-safe`（UI-35，24 分）。
  - 根因：`components/ai-elements/code-block.tsx` 在 render 期同步读模块级 Shiki 缓存；
    服务端进程缓存已热（直接输出高亮 token），浏览器新标签页首帧缓存为空（退回
    `createRawTokens`，`color: inherit`），两份 HTML 不一致，React 每次刷新事件详情都判定
    hydration 失败并重建整棵树（评审记录 77 条 console 消息）。
  - 改动：首帧一律渲染 raw token，挂载后在 effect 中应用缓存命中或异步高亮；高亮态按
    `code` + `language` 失效，代码切换不复用旧结果；删除 render 期 setState 重置。
  - 新增 `code-block-content.test.tsx`：预热缓存后 `renderToString` 首帧不得含 Shiki 前景色；
    挂载后着色生效；代码切换不复用旧高亮。
  - 验证：`vp check` 0 errors（15 个既有 warning）；`vp run -r test` 168 文件 / 888 项；
    `vp run -r build` 通过；PR CI `check · test · build` 通过（4m27s）。
  - 浏览器复验（隔离实例 6206）：刷新 `/events/a92ba43c-…` 控制台仅 5 条消息，无
    `Hydration failed`。
  - 自查（code-review，low）：无发现。

### 专家发现

- `requirements`（3 个新候选，均写入 backlog）：
  - REQ-223（27）：投递状态与静默证据仍用「已抑制/抑制时」，`messages.test.ts:24-40`
    的禁用词断言只覆盖 `suppressions.*`，三组键漏网；纯 i18n。
  - REQ-224（26）：投递详情只在挂载时取一次数据，pending→running→终态不会反映；
    建议仅非终态 5s 轮询 + 工具栏刷新，无新端点。
  - REQ-225（25）：`en-US.json` 46 处 `{count}` 未用 ICU plural，count=1 出现 "1 attempts"。
- `ui-review`（浏览器实测，6206 隔离实例）：
  - UI-35（HIGH，仍存在）→ 本轮已修复（PR #363）。
  - UI-36（HIGH，新增）：创建成功面板 Token 从不渲染，非安全上下文下复制失败仍提示
    「已复制」（`source-token-notice-panel.tsx:43-68`、`lib/browser.ts:7-13`）；需
    EXPERT_PANEL 确认与「Token 不进 client component」边界。
  - UI-5 / UI-6 / UI-4（MEDIUM，复现）：首屏 layout shift 累计 CLS≈0.12；a11y 树两个同名
    侧栏按钮；移动 Sheet 无关闭按钮 + 中文界面残留 "Close"/"Dashboard"。
  - UI-37/38/39（LOW，新增）：通知目标空态缺 `EmptyContent`；设置页中文占位走 `font-mono`；
    暂停面板绕过 `useOperationDateFormatter`。
  - 已核验无问题：1280/390 下 shell 组合无 header/h1 重叠；UI-34 禁用原因已同时有文本与
    `aria-describedby`；设置页三块面板列数与 header 高度对齐一致。

### EXPERT_PANEL

- 本轮无裁决事项。

### 发布决策

- 三位专家（发布经理 / 阻断审计 / 运维回滚）一致赞成发布 `0.1.0-beta.61`。
  - 自 `v0.1.0-beta.60` 以来唯一用户可见变更即 PR #363；无迁移、无配置/依赖变化，
    回滚只需换回 `0.1.0-beta.60` 镜像，数据库无需恢复。
  - 镜像：`registry.cn-hangzhou.aliyuncs.com/xqvvu/vane:0.1.0-beta.61`
    （linux/amd64 + linux/arm64）。
  - 升级提醒：代码块首屏短暂无语法着色是预期修复行为；构建必须保留
    `--provenance=false --sbom=false`。
- 已发布：`chore(release)` PR #365 合入 `e9029d2`；tag `v0.1.0-beta.61` 与 GitHub Release
  （prerelease）均已创建，描述含镜像、升级与回滚说明。多平台镜像推送完成，
  `imagetools inspect` 确认 `linux/amd64` + `linux/arm64`，index digest `sha256:2b9c9712…`。

### 下一轮优先项

1. `release-infra` 车道（轮转位置）：E2E workflow 接入 CI、provider fixture。
2. UI-36：创建成功面板 Token 可见性与复制失败提示（先 EXPERT_PANEL 定边界）。
3. REQ-223：术语收口「已抑制 → 已静默」，成本低、与静默产品词一致。
4. UI-37/38/39 三个低成本 UI 一致性项可合为一个 chore 切片。
5. UI-5 / UI-6：侧栏 SSR cookie 与 a11y 标签，需先设计再实现。

## 2026-10-22（第 78 轮）

- 时间：2026-10-22 18:26 CST 起。
- 基线：本轮开始时 `origin/main` @ `9ef541d`；main CI 最近 3 次 success；无 open PR；
  `v0.1.0-beta.59` 的 tag 与 GitHub Release 均已存在，无待补建项。
- 类型：**需求切片 + 两车道审计**（非 full-audit）。backlog 有多个 ≥27 候选，按第 1.5 步继续。
- 全量审计时间戳：第 1 轮（2026-10-18 13:30 CST，未变）。
- 车道：`requirements` + `ui-triage` 必跑；`ui-triage` 判定 **`defer`**，第三名额给轮转车道
  `security-exposure`；并发 ≤3。
- `requirements` 车道运行约 15 分钟仍停在读取基线（仅返回一句「开始读取」），按限时纪律终止，
  本轮无新候选产出，留待下一轮。
- 车道轮转位置：**`release-infra`**（下一轮非必跑车道）。
- `ui-triage`：**`defer`** —— 距上次评审 8h57m（< 48h）；09:30 后 11 个 UI 提交中 9 个有
  隔离实例/截图验证，未验证 ≤2 个（`777147e` 侧边栏命中、`a5d8b51` 导航图标）；未解决
  `UI-` 存量 19 条（≤20）；自上次评审新增未解决 UI 发现 1 条（UI-35 < 2）；静态浏览无系统性
  断裂，仅 `destinations-empty-state.tsx:16` 缺 `EmptyContent` 且 padding 与
  `sources-empty-state.tsx:25` 不一致（约 20 分，未达触发线）。
  再触发条件：2026-10-24 09:30 CST 满 48h、未验证 UI 合并 ≥3、新增 UI 发现 ≥2、
  存量 >20、UI-35 在干净 main 复现。
- `last_ui_review_at`：**2026-10-22 09:30 CST**（未变，本轮未做 UI 评审）。
- 工作树：`agent-iteration` 仅用于并发锁；实现、验证、自查均在会话工作树
  `fervent-swartz-788729`。工作树已清理。
- 依赖：会话工作树 `node_modules` 缺 `@rolldown/plugin-babel` 链接，
  `vp install --frozen-lockfile --force`（6.1s，热 store）修复。

### 本轮交付

- PR #360 `feat(console): search events and deliveries by idempotency key`（NEW-BT，27 分）。
  - 两个搜索谓词增加 `events.idempotency_key LIKE ? ESCAPE '\'`
    （`history.repository.ts:457,489`），事件列表与投递列表都能用幂等键反查；列表与 `total`
    继续共用同一谓词。
  - 中英搜索占位文案加入「幂等键 / idempotency key」，并同步
    `operation-filters.test.tsx` 的断言。
  - `redactEventRecord` 注释改为「匹配原始值、DTO 投影仍脱敏」，与 title/message/fingerprint
    的既有规则一致。
  - 新增搜索测试：事件/投递列表命中、`total` 一致、`_` 按字面量匹配（带连字符诱饵）。
  - PRD `docs/prd/idempotency-key-search.md`。
  - 验证：`vp check` 0 errors（18 个既有 warning）；`vp run -r test` 167 文件 / 885 项；
    `vp run -r build` 通过；PR CI `check · test · build` 通过（2m31s）。
  - 自查（code-review，low）：无发现。

### 专家发现

- `requirements`：车道超时终止，无产出。
- `ui-triage`：见上；未新增未解决 UI 发现。
- `security-exposure`：
  - **SEC-26（MEDIUM，仍存在）**：`destination.helpers.ts:63,289-303` 仍返回完整 webhook URL
    （Slack/Feishu path token、generic `?token=`/`?sig=`），并随 5 个 SSR loader 预取的
    `destinations.list` 进入 dehydrated 数据；与 `docs/architecture/frontend-architecture.md:440-442`
    的「endpoint 可见」决策冲突 → EXPERT_PANEL。
  - **SEC-22（MEDIUM，部分修复）**：list/detail 已剥离 userinfo 密码
    （`destination.helpers.ts:63,346-363`）；编辑草稿 `:116,129` 仍原样返回，经
    `destination.service.ts:144-150` 的 `getTemplateDraft` 进入编辑表单
    （`edit-destination-form.tsx:96-100`），需 preserve/replace/clear 语义 → EXPERT_PANEL。
  - **SEC-23（MEDIUM，仍存在）**：`redaction.ts:265-277` 保留 `fingerprint` 原值；列表
    （`history.repository.ts:130`）、详情（`event-normalized-tab.tsx:45-47`）、补投
    （`event-replay.service.ts:322`）与外发（`template.ts:152,383`、`delivery-execution.ts:97`）
    均未投影 → EXPERT_PANEL。
  - **SEC-25（LOW，仍存在）**：`destination.service.ts:202,314,326,340` 四处 renderedPayload
    仍无 `redactJsonText` 投影，属边界不对称；AUTO_FIX 仍开放。
  - **SEC-31（新增，LOW，22 分）**：预签名 URL 查询凭据（`X-Amz-Signature`、
    `X-Goog-Signature`、Azure SAS `sig`）不命中 `isSensitiveKey`
    （`packages/core/src/redaction.ts:58-76`），告警正文/raw payload/response body 中的
    预签名 URL 会原样进入详情与证据包；AUTO_FIX。
  - 已核验干净：server-only 标记、Source token/tokenHash 不出现在 list/detail、
    Feishu `appSecret` 只在服务端、日志/审计无凭据回显、旧仓库名无失效引用。
- `release-manager` / `release-blocker` / `release-ops`：三人一致**赞成发布** `0.1.0-beta.60`，
  详见下方发布决策。

### EXPERT_PANEL

- 本轮无裁决事项。SEC-22 / SEC-23 / SEC-26 继续留在 backlog（candidate），
  下一轮或专门轮次交专家小组。

### 发布决策

- **发布 `0.1.0-beta.60`**：三位专家一致通过。自 `v0.1.0-beta.59` 以来有两个用户可见变更：
  查询缓存 15s 新鲜期（#358，`aba053a`）与事件/投递按幂等键搜索（#360）。
  `origin/main` 与 #360 的 CI 均为 success；无其他 open PR；migration 目录零改动；
  Dockerfile/环境变量/依赖均无变化。回滚镜像 `0.1.0-beta.59`。
- 版本：`0.1.0-beta.60`；版本 PR #361（`chore(release): v0.1.0-beta.60`，rebase 合并 `af7a4b3`）。
- tag：`v0.1.0-beta.60`（annotated，指向 `af7a4b3`；该 commit 的 main CI 为 success）。
- Release：<https://github.com/xqvvu/tocsin/releases/tag/v0.1.0-beta.60>（prerelease，body 已校验非空）。
- 镜像：`registry.cn-hangzhou.aliyuncs.com/xqvvu/vane:0.1.0-beta.60`
  （linux/amd64 + linux/arm64，index digest `sha256:96f455fc…`）；回滚镜像 `0.1.0-beta.59`。
- 发布依据：`release-manager` / `release-blocker` / `release-ops` 三人一致通过；无 migration、
  无依赖/环境变量/Dockerfile 变化。

### 下一轮优先项

1. **NEW-BP（27）**：控制台基线安全响应头（先 curl 核对 Nitro 默认头）。
2. **NEW-BV（26）**：后台 Worker 失败顶栏常驻可见。
3. **SEC-31 / SEC-25**：两个 AUTO_FIX（脱敏覆盖）。
4. **Q-223（24）**：定位 `settings/get`、`suppressions/list` 每次加载各两次的真实原因。
5. **UI-35（24）**：干净 main 上复现事件详情 hydration mismatch（嫌疑 `code-block.tsx` 模块级缓存）。
6. 下一轮非必跑车道：**`release-infra`**。

## 2026-10-22（第 77 轮）

- 时间：2026-10-22 17:26 – 18:45 CST。
- 基线：本轮开始时 `origin/main` @ `b3d390a`；main CI 最近 3 次 success；无 open PR；
  `v0.1.0-beta.59` 的 tag 与 Release 均已存在，无待补建项。
- 类型：**需求切片 + 文档更正 + 三车道审计**（非 full-audit）。backlog 有多个 ≥27 候选，按第 1.5 步继续。
- 全量审计时间戳：第 1 轮（2026-10-18 13:30 CST，未变）。
- 车道：`requirements` + `ui-triage` 必跑；`ui-triage` 判定 **`defer`**，第三名额给轮转车道 `docs-drift`；并发 ≤3。
- 车道轮转位置：**`security-exposure`**（下一轮非必跑车道）。
- `ui-triage`：**`defer`** —— 距上次评审 8h（< 48h）；09:30 后 12 个 UI 路径合并全部有浏览器验证记录；
  未解决 `UI-` 候选 19 条（阈值 >20）；自上次评审新增 UI 发现 1 条（UI-35，阈值 ≥2）。
  UI-35 静态复核：时间渲染已有 `ClientOnly`（`operation-timestamp.tsx:22-34`），嫌疑转向
  `code-block.tsx:113,143-174` 的模块级 token 缓存导致 SSR 请求间差异；需真实复现再定责。
  再触发条件：2026-10-24 09:30 满 48h、未验证 UI 合并 ≥3、新增 UI 候选 ≥2、存量 >20 或 UI-35 复现。
- `last_ui_review_at`：**2026-10-22 09:30 CST**（未变，本轮未做 UI 评审）。
- 工作树：`agent-iteration` 仅用于并发锁；实现、验证、浏览器检查均在会话工作树
  `heuristic-williamson-ab28c4`。工作树已清理。
- 依赖：会话工作树缺 `@rolldown/plugin-babel` 链接，`vp install --frozen-lockfile --force` 修复。

### 本轮交付

- PR #358 `perf(console): keep loader-prefetched queries fresh after hydration`（NEW-BO，28 分）。
  - 新增 `apps/console/src/lib/query-client.ts`：`createQueryClient()` 默认 `queries.staleTime = 15_000`；
    `router.tsx` 改用该工厂；各查询既有 `staleTime` 覆盖不变。
  - 新增单元测试：窗口内不 stale、窗口后 stale、`invalidateQueries` 仍立即生效；PRD
    `docs/prd/query-client-stale-time.md`。
  - 验证：`vp check` 0 errors（18 个既有 warning）；`vp run -r test` 167 文件 / 883 项；
    `vp run -r build` 通过。隔离实例 `localhost:6205` + 临时 SQLite（owner `admin@example.test`）：
    Events 页浏览器缓存中 `operations.list` 带 15s 新鲜期，加载后无额外 `operations.list` 请求，
    console 无 error。
  - **推翻原假设**：首次 hydration 并未复现 `operations.list` 重复请求（默认 0 与 15s 均只请求一次）；
    真正的重复请求出现在 `settings/get` 与 `suppressions/list`（每次加载各两次，见 Q-223）。
    PRD 与代码注释已按实测改写，不再声称 hydration 重复查询。
  - 自查（code-review，low）：发现注释过度断言，已在同一 PR 的第二提交修正。
- PR #359 `docs(release): align checklists and architecture trees with current code`（AUTO_FIX）。
  - 修复 docs-drift 的 8 项：REL-29（版本/tag 数）、REL-30（dedupe 行号）、DOC-23（前端树/CSRF/
    session/suppressions router/工厂清单，部分）、DOC-43（README）、DOC-22（next-round 落后提交数）、
    DOC-60（server/configuration 职责，前半）、DOC-63（容量信号已实现）、DOC-62 未改（与本次发现
    的容量项重名，新发现记作 DOC-63）。
  - 验证：`vp fmt --check` 通过（821 files）。

### 专家发现

- `requirements`：新增 5 条代码可核实的候选（NEW-BT..NEW-BX），均无迁移：
  - **NEW-BT（27）** 事件/投递搜索不含 `idempotencyKey`，而事件详情把它作为可复制标识展示
    （`event-normalized-tab.tsx:51-57`、`history.repository.ts:449-464,477-500`）。
  - **NEW-BU（25）** 存储面板无宿主机磁盘余量（`settings-storage-panel.tsx:34-42`）。
  - **NEW-BV（26）** 后台 worker 失败只在 Settings 可见（`worker-health.service.ts:40-45`、`dashboard-header.tsx:23-26`）。
  - **NEW-BW（25）** 补投预览不标注停用目标/路由（`event-replay-action.tsx:195-214`、`delivery.repository.ts:231-232`）。
  - **NEW-BX（25）** 目标运行配置不可复制（`destination-operational-config-cell.tsx:14-23`）。
- `docs-drift`：8 项全部有双向 `file:line` 证据；7 项已随 #359 修复，DOC-23/DOC-60 只修了本轮
  证据覆盖的部分并在 backlog 标注剩余范围。
- `ui-triage`：见上；未新增未解决 UI 发现。

### EXPERT_PANEL

- 本轮无裁决事项。ARCH-51（worker 启动时机）仍未裁决，留待后续轮次。

### 发布决策

- **本轮不发布**：自 `v0.1.0-beta.59` 以来唯一的代码变更是查询缓存新鲜期（内部性能策略），
  其余为文档更正；不满足「至少一个用户可见变更或修复」的发布门槛，且不为了发版而发版。
  下一轮若有用户可见切片（如 NEW-BT）再评估。

### 下一轮优先项

1. **NEW-BT（27）**：事件/投递搜索覆盖幂等键（本批唯一达门槛、无迁移）。
2. **NEW-BP（27）**：基线安全响应头中间件（先 curl 核对 Nitro 默认头）。
3. **NEW-BV（26）**：后台 Worker 失败顶栏常驻可见。
4. **Q-223（24）**：定位 `settings/get`、`suppressions/list` 每次加载各两次的真实原因。
5. **UI-35**：干净 main 上复现事件详情 hydration mismatch（嫌疑 `code-block.tsx` 模块级缓存）。
6. 下一轮非必跑车道：**`security-exposure`**。

## 2026-10-22（第 76 轮）

- 时间：2026-10-22 16:20 – 17:05 CST。
- 基线：本轮开始时 `origin/main` @ `2aaf10e`；main CI 最近 3 次均为 success；无 open PR；
  `v0.1.0-beta.58` 的 tag 与 GitHub Release 均已存在，无待补建项。
- 类型：**需求切片 + 两车道审计**（非 full-audit）。backlog 有多个 ≥27 候选，按第 1.5 步继续。
- 全量审计时间戳：第 1 轮（2026-10-18 13:30 CST，未变）。
- 车道：`requirements` + `ui-triage` 必跑；`ui-triage` 判定 **`defer`**，第三名额给轮转车道
  `release-infra`；并发始终 ≤3。
- 车道轮转位置：**`docs-drift`**（下一轮非必跑车道；release-infra 复验出的 REL-29/REL-30 也归它）。
- `ui-triage`：**`defer`** —— 距上次评审约 7.5h（< 48h）；09:30 后 11 个 UI 路径合并全部有
  浏览器验证记录，未验证合并 0；自上次评审新增未解决 `UI-` 发现仅 UI-35（1 条 < 2）；
  存量 `UI-` candidate 19 条（≤20）。再触发条件：2026-10-24 09:30 满 48h、
  未验证 UI 合并 ≥3、新增 UI 候选 ≥2 或存量 >20。`ui-triage` 建议下轮在干净 main 上复现
  UI-35 的 hydration mismatch（`features/events/ui/event-detail-view.tsx:41`）。
- `last_ui_review_at`：**2026-10-22 09:30 CST**（未变，本轮未做 UI 评审）。
- 工作树：`agent-iteration` 仅用于并发锁；实现、验证、浏览器检查均在会话工作树
  `keen-meninsky-8cc682`。工作树已清理。
- 依赖：会话工作树 `node_modules` 缺 `@rolldown/plugin-babel` 链接，`vp install
  --frozen-lockfile --force`（5.9s，热 store）修复。

### 本轮交付

- PR #355 `feat(console): project background worker health in settings`（NEW-BL，27 分）。
  - 新增只读 `settings.getWorkerHealth`，同时投影投递与加急 runner 的
    `{started,state,lastStartedAt,lastFinishedAt,lastError,lastRun}`；
    `started=false` 表达「进程内 runner 尚未装配」，读取过程刻意不调用
    `ensure*WorkerRunner()`，也不碰 store。
  - `WorkerHealthService` 注入两个 runner 读取函数；`lastError` 在服务层再次 `redactText`，
    `lastRun` 字段逐个映射（`paused` 仅在存在时输出）。
  - 设置页新增「后台 Worker」两列面板：状态、上次开始/完成、运行计数、上次错误；
    手动刷新一并刷新 `worker-health` 查询键。
  - PRD `docs/prd/worker-health-projection.md`；新增 service/容器装配/面板/鉴权清单/失效测试。
  - 验证：`vp check` 0 errors（18 个既有 warning）；`vp run -r test` 166 文件 / 881 项；
    `vp run -r build` 通过。隔离实例 `localhost:6204` + 临时 SQLite（owner
    `admin@example.test`）浏览器实测：两 Worker 均显示「空闲」、上次开始/完成时间、
    「领取 0 · 回收 0 · 成功 0 · 失败 0 · 重试 0」「无错误」，console 无 error/warning；
    截图 `/tmp/tocsin-worker-health-verify.png`（未入库）。
  - 自查（code-review，low）：发现未启动分支返回模块级共享常量对象，已改为每次返回副本并复跑测试。

### 专家发现

- `requirements`：backlog 已饱和，只新增 5 条代码可核实的新候选（NEW-BO..NEW-BS）：
  - **NEW-BO（28）** `QueryClient` 默认 `staleTime: 0`，loader 预取后 hydration 立即重复请求
    （`router.tsx:11`、`routes/_dashboard.events.tsx:17-23`、`operations.queries.ts:62-73`）。
  - **NEW-BP（27）** 缺少基线安全响应头（`start.ts:4-8`，
    `docs/release/docker-production-deployment.md:12-23`）。
  - **NEW-BQ（26）** 投递详情顶栏把失败原因塞进不换行 Badge，长错误横向溢出
    （`delivery-detail-summary.tsx:38-40`、`components/ui/badge.tsx:8`）。
  - **NEW-BR（25）** 历史列表全表扫描 + TEMP B-TREE，需先分页后聚合与排序索引
    （`history.repository.ts:92-95,263-265`、`migrate/schema.ts:243-293`；本机实测 0.18–0.26s）。
  - **NEW-BS（24）** 详情 DTO 内嵌完整 raw payload，应按需加载
    （`packages/core/src/operations.ts:63-87,139-157`、`env.ts:33-38`）。
- `release-infra`：逐条复验 RC 未勾 gate，未产生新编号——全部已存在：
  - CI 仍只有 quality job，E2E 完全未接入（`.github/workflows/ci.yml:16-50`；
    `apps/console/playwright.config.ts:8-9` 注释声称「its own workflow」与远端不符）→ REL-21/REL-22。
  - 构建产物启动与文件型 SQLite migration 无 CI smoke（REL-5/REL-8）。
  - `packages/providers/src/` 仍无 fixture 目录，payload 内联（REL-2/REL-24）。
  - Docker smoke 隔离卷已修（REL-3 shipped），仍缺重启持久化与容器 healthcheck 断言
    （`scripts/docker-smoke.sh:67-75,115-122`）→ REL-6/REL-26；固定宿主机端口 → REL-27。
  - 分支保护为空（`gh api branches/main/protection` 404、rulesets `[]`）→ REL-16/REL-23。
  - `just e2e` 缺 `playwright install`（`Justfile:78-79`）→ REL-7/REL-28。
  - `docs/release/release-checklist.md:4,20,73-74` 仍冻结在 beta.54（实际 beta.58、50 个 tag）
    → REL-29；`mvp-rc-checklist.md:171` 的 dedupe 行号漂移 → REL-30。
  - 未发现「文档声称已做但 CI 未做」的虚假勾选；E2E/Docker smoke 的「本地人工 gate」措辞与现状一致。
- `ui-triage`：见上。

### EXPERT_PANEL

- 本轮无裁决事项。ARCH-51（worker 启动时机）仍未裁决，留待后续轮次。

### 发布决策

- **已发布 `v0.1.0-beta.59`**：三位发布专家一致 APPROVE。
  - 发布经理：`v0.1.0-beta.58..origin/main` 的用户可见变更为 #355（设置页后台 Worker 健康面板
    与 `settings.getWorkerHealth`）；其余为 docs/健壮性补丁；建议预发布递增。
  - 发布阻断审计员：6/6 PASS —— 目标 commit `841ea2c` main CI success、无 open PR、
    migration 零 diff、版本与 tag 不冲突、最近 10 个 tag 与 Release 一一对应；
    唯一 `blocked-autonomous` 为 REL-13（LICENSE，非运行时阻断）。
  - 运维/回滚专家：Dockerfile/compose/env/启动参数/lockfile 零改动，`migrate/` 零 diff；
    旧库直接打开安全，回滚只需换回 `0.1.0-beta.58` 镜像，无需恢复备份。
- 版本变更走 PR #356 `chore(release): v0.1.0-beta.59`（rebase 合并 `a97ac34`），
  该 commit main CI success。
- tag：`v0.1.0-beta.59`（annotated，指向 `a97ac34`）；
  Release：<https://github.com/xqvvu/tocsin/releases/tag/v0.1.0-beta.59>（prerelease，body 已校验非空）。
- 镜像：`registry.cn-hangzhou.aliyuncs.com/xqvvu/vane:0.1.0-beta.59`，
  linux/amd64 + linux/arm64，index digest `sha256:77d2dbbb…`；回滚镜像 `0.1.0-beta.58`。

### 下一轮优先项

1. **NEW-BO（28）**：QueryClient `staleTime` 默认值，消除 hydration 后重复查询。
2. **NEW-BP（27）**：基线安全响应头中间件（先 curl 核对 Nitro 默认头）。
3. **UI-35 复现与定责**：干净 main 上打开事件详情确认 hydration mismatch 是否既有。
4. **NEW-BQ（26）**：投递详情失败原因可读化（纯前端小切片）。
5. 下一轮非必跑车道：**`docs-drift`**（含 REL-29/REL-30、DOC-6）。

## 2026-10-22（第 75 轮）

- 时间：2026-10-22 15:50 – 16:55 CST。
- 基线：本轮开始时 `origin/main` @ `be9a6b5`；main CI 最新一次（docs 提交）为 in_progress，
  上一个 release 提交为 success；无 open PR；最近 10 个 tag 与 Release 一一对应，无待补建项。
- 类型：**需求切片 + 两车道审计**（非 full-audit）。backlog 有多个 ≥27 候选，按第 1.5 步继续。
- 全量审计时间戳：第 1 轮（2026-10-18 13:30 CST，未变）。
- 车道：`requirements` + `ui-triage` 必跑；`ui-triage` 判定 **`defer`**，第三名额给轮转车道
  `security-exposure`；并发始终 ≤3。
- 车道轮转位置：**`release-infra`**（下一轮非必跑车道）。
- `ui-triage`：**`defer`** —— 距上次评审 6h20m（< 48h）；09:30 后 10 个 UI 路径合并全部有
  浏览器验证记录，未验证合并 0；未解决 `UI-` 候选 19 条（阈值 >20），自上次评审新增仅 UI-35
  （阈值 ≥2）。再触发条件：2026-10-24 09:30 满 48h、未验证 UI 合并 ≥3、新增 UI 候选 ≥2
  或存量 >20。另校正 UI-35 的定位为 `features/events/ui/event-detail-view.tsx:41`。
- `last_ui_review_at`：**2026-10-22 09:30 CST**（未变，本轮未做 UI 评审）。
- 工作树：`agent-iteration` 仅用于并发锁；实现、验证、浏览器检查均在会话工作树
  `dazzling-turing-291a29`。工作树已清理。
- 依赖：会话工作树 `node_modules` 缺 `@types/node` 等链接（`vp check` 报 3878 个错误），
  `vp install --frozen-lockfile --force`（5.8s，热 store）修复。

### 本轮交付

- PR #352 `feat(console): record who pauses and resumes delivery`（NEW-BK，28 分）。
  - `settings` KV 新增 `delivery_paused_by` 与 `delivery_pause_last`（JSON），无迁移；
    `SettingsUpdateInput` 与只读投影分离，避免派生字段被写回。
  - 暂停记录 session 邮箱，重复暂停保留首次时间与操作者；恢复持久化
    `{startedAt,endedAt,pausedBy,resumedBy}` 并清空实时字段。
  - `AppSettings` / oRPC 输出新增只读 `deliveryPausedBy`、`lastDeliveryPause`；设置页暂停面板
    显示「自 … 起暂停 · 操作者 …」与「最近一次暂停：… – … · 操作者 …」，操作者缺失时退化文案。
  - 操作者只从 `context.dashboardRequest.currentUser.email` 注入；浏览器不提交。
  - 新增仓储/集成/组件测试 3 组；PRD `docs/prd/delivery-pause-attribution.md`。
  - 验证：`vp check` 0 errors（18 个既有 warning）；`vp run -r test` 164 文件 / 872 项；
    `vp run -r build` 通过。隔离实例 `localhost:6203` + 临时 SQLite（owner
    `admin@example.test`）浏览器实测：暂停后显示「自 2026/10/22 07:57:51 起暂停 ·
    操作者 admin@example.test」，恢复确认后显示「最近一次暂停：2026/10/22 07:57:51 –
    07:58:03 · 操作者 admin@example.test」+「已恢复出站投递」toast，console 无错误；
    截图 `/tmp/tocsin-pause-attr-verify.png`（未入库）。

### 专家发现

- `requirements`：backlog 已饱和（401 条 candidate），本轮只新增 **REQ-222（24）**
  Raw payload 保留期缩短的影响预览与清理边界（`settings-preferences-panel.tsx:60-65`、
  `settings-storage-panel.tsx:10-19,44-70`，代码已核实）。另建议把静默规则「从未命中」
  健康徽标并入 **REQ-184**（`suppressions-section.tsx:92-132`，代码已核实），不另开编号。
- `security-exposure`：
  - **SEC-30（20，新增）** 导出 secret 路径与 adapter manifest 缺一致性断言
    （`config-portability.ts:442-455`、`packages/destinations/src/*/manifest.ts`、
    `registry.ts:100-107`、`configuration.integration.test.ts:1517`，代码已核实）。
  - 无新发现的检查项：`isSensitiveKey` 已覆盖
    `appSecret/clientSecret/apiSecret/privateKey/X-Auth-Token/Authorization/token/password`
    （`packages/core/src/redaction.ts:13-77`）；写入/读取/传输/导出/日志/证据包路径均已脱敏；
    参数化导出测试按 registry kinds（`configuration.integration.test.ts:24,162-168`）；
    25 个 server-only + 9 个 client-only 标记无漏标/过度预标；oRPC 无 token hash / 签名密钥 /
    appSecret 直取；`github.com/xqvvu/vane` 失效引用为 0（ACR 镜像坐标属正确用法）。
- `ui-triage`：见上。

### EXPERT_PANEL

- 本轮无裁决事项。ARCH-51（worker 启动时机）仍未裁决，留待后续轮次。

### 发布决策

- **已发布 `v0.1.0-beta.58`**：三位发布专家一致 APPROVE。
  - 发布经理：`v0.1.0-beta.57..origin/main` 的用户可见变更为 #352
    （暂停操作者与最近一次暂停区间），其余为 docs；建议预发布递增。
  - 发布阻断审计员：合入前按流程 REJECT（PR #352 尚未合入），翻转条件为
    rebase 合并 → 目标 commit CI success → migration 零 diff；三项随后均满足。
  - 运维/回滚专家：Dockerfile/compose/env/启动参数零改动；`migrate/` 零 diff；
    旧镜像会忽略新 settings 键；回滚只需换回 `0.1.0-beta.57` 镜像。
- 版本变更走 PR #353 `chore(release): v0.1.0-beta.58`（rebase 合并 `9c82f01`），
  该 commit main CI success。
- tag：`v0.1.0-beta.58`（annotated，指向 `9c82f01`）；
  Release：<https://github.com/xqvvu/tocsin/releases/tag/v0.1.0-beta.58>（body 已校验非空）。
- 镜像：`registry.cn-hangzhou.aliyuncs.com/xqvvu/vane:0.1.0-beta.58`，
  linux/amd64 + linux/arm64，index digest `sha256:9fb887cd…`；回滚镜像 `0.1.0-beta.57`。

### 下一轮优先项

1. **NEW-BL（27）**：加急 Worker 健康只读投影（复用 `DeliveryWorkerHealthSnapshot`）。
2. **Q-23（25）**：dedupe cleanup 改有界批删除。
3. **UI-35 复现与定责**：先在干净 main 上打开事件详情确认 hydration mismatch 是否既有，
   定位点 `features/events/ui/event-detail-view.tsx:41`。
4. **SEC-30（20）**：manifest/导出 secret 路径一致性参数化测试（AUTO_FIX）。
5. 下一轮非必跑车道：**`release-infra`**。

## 2026-10-22（第 74 轮）

- 时间：2026-10-22 14:26 – 15:35 CST。
- 基线：本轮开始时 `origin/main` @ `e8eecc6`；main CI 最近 3 次 success；无 open PR；
  `v0.1.0-beta.56` 的 tag 与 GitHub Release 均已存在，无待补建项。
- 类型：**需求切片 + 两车道审计**（非 full-audit）。backlog 有多个 ≥27 候选，按第 1.5 步继续。
- 全量审计时间戳：第 1 轮（2026-10-18 13:30 CST，未变）。
- 车道：`requirements` + `ui-triage` 必跑；`ui-triage` 判定 **`defer`**，第三名额给轮转车道
  `architecture`；并发始终 ≤3。`requirements` 在 75 分钟实现预算结束后才返回（约 61 分钟），
  4 条候选已补记入 backlog（NEW-BK..NEW-BN），未影响本轮选题。
- 车道轮转位置：**`security-exposure`**（下一轮非必跑车道）。
- `ui-triage`：**`defer`** —— 距上次评审 4h58m（< 48h）；09:30 后 6 个 UI 提交全部有
  浏览器验证记录，未验证合并 0；未解决 `UI-` 候选 18 条（存量 >20 才提前触发）。
  再触发条件：2026-10-24 09:30 满 48h、未验证 UI 合并 ≥3、新增 UI 候选 ≥2 或存量 >20；
  triage 另建议从存量挑一个 S 切片（如 UI-21 `Close` 本地化）顺带消化。
- `last_ui_review_at`：**2026-10-22 09:30 CST**（未变，本轮未做 UI 评审）。
- 工作树：`agent-iteration` 仅用于并发锁；实现、验证、浏览器检查均在会话工作树
  `elegant-lewin-d1b91c`。工作树已清理。
- 依赖：会话工作树 `node_modules` 缺 `@rolldown/plugin-babel` 链接，`vp install --force`
  （8.4s，热 store）修复。

### 本轮交付

- PR #349 `feat(console): show replay preview target details`（REQ-22，28 分）。
  - 事件补投预览渲染 `EventReplayPreview.targets`：`新建/已存在` 徽标 + 路由名 + 通知目标名；
    目标名复用 `destinationsQueryOptions()`，缺失回退 `destinationId`。
  - 路由补投预览移除 `slice(0, 10)`，渲染全部候选；每个候选增加「新建目标」徽标组，
    底部增加「确认后将补投以上全部 N 条候选事件」。
  - 新增 3 条组件测试；PRD `docs/prd/replay-preview-target-detail.md`；纯前端无 DTO/迁移。
  - 验证：`vp check` 0 errors（18 个既有 warning）；`vp run -r test` 164 文件 / 867 项；
    `vp run -r build` 通过。浏览器实测（隔离实例 `localhost:6201` + 临时 SQLite，
    owner `admin@example.test`，1 源 / 12 事件 / 2 目标 / 1 路由）：
    事件预览显示 `已有 1 条` + `可新建 1 条` 的目标矩阵；路由预览 12 条候选全部渲染，
    第 1 条只列 `Audit channel`，计数 23 = 12×2−1；1280 与窄视口无横向溢出
    （`scrollWidth === clientWidth`），console 除下述 hydration mismatch 外无新错误；
    截图 `/tmp/tocsin-replay-verify/*.png`（未入库）。

### 专家发现

- `architecture`（5 条新发现，均已写入 backlog）：
  - **ARCH-47（24）** `operation-filters.tsx` 695 行，内聚 `OperationFilters`（`:52`）、
    `OperationFiltersPanel`（`:202`）、`useOperationSearchDraft`（`:617`）、
    `OperationSearchInput`（`:663`），违反大组件拆 sibling 约定。
  - **ARCH-48（22）** 表单值/视图模型类型仍在 `ui/`：`destination-ui-types.ts:24,55`、
    `source-ui-types.ts:7`、`event-detail-stats.ts:5`。
  - **ARCH-49（21）** `packages/api` 无 `#api/*` 别名，契约层跨目录相对导入
    （`contract/operations.ts:4,5,23,24` 等）。
  - **ARCH-50（20）** `DashboardNavigationSkeleton` 具名导出（`dashboard-navigation.tsx:186`），
    未按 `Component.Skeleton` 暴露。
  - **ARCH-51（26，EXPERT_PANEL）** `getSqliteStore()` 内启动两个后台 worker
    （`container.ts:205-210`），任何只读 service 工厂都会触发。
  - 已核验无新增违规：router 薄、无 `ORPCError`、无 DI 框架/模块级单例、
    `components/common` 纯净、server-only 标记无新缺口。
- `ui-triage`：见上。
- 浏览器观察：**UI-35（24）** 事件详情 SSR hydration mismatch（console msgid 111，
  `TabsContent value="normalized"`），随后 msgid 112-130 级联；未确认是否既有问题，
  下轮先在干净 `origin/main` 复现再定责。
- `requirements`（4 条新候选，均在预算结束后返回并已写入 backlog）：
  - **NEW-BK（28）** 全局投递暂停缺操作者与最近暂停区间：暂停/恢复不带 actor
    （`settings-delivery-pause-panel.tsx:33,66-72`、`settings.repository.ts:63-79`）。
  - **NEW-BL（27）** 加急 Worker 健康不可见：`OncallWorker.getHealth()` 无消费者
    （`oncall-worker.service.ts:47-49`），`/api/ready` 只确保 delivery runner。
  - **NEW-BM（26）** 静默命中列表无筛选：契约只有 id/page/limit，底层仓储已支持谓词。
  - **NEW-BN（25）** 证据包不记录导出者（`evidence-bundle.ts:27-34`），session 已在前端可用。

### EXPERT_PANEL

- 本轮无新增裁决事项。ARCH-51 记为候选但未裁决（需评估 worker 启动时机，非纯重构）。

### 发布决策

- **已发布 `v0.1.0-beta.57`**：三位发布专家一致 APPROVE。
  - 发布经理：`v0.1.0-beta.56..origin/main` 的用户可见变更为 #349（补投预览目标明细）、
    `777147e`（折叠侧边栏标签不再拦截点击）、`a5d8b51`（投递导航 history 图标），
    其余为 docs；建议预发布递增。
  - 发布阻断审计员：目标 `f979f61` main CI success、无 open PR、`migrate/` 零改动、
    `v0.1.0-beta.57` tag 不存在、beta.56 Release body 非空；`blocked-autonomous` 仅 REL-13。
  - 运维/回滚专家：无迁移、无 Dockerfile/compose/env/启动参数变化；回滚只需换回
    `0.1.0-beta.56` 镜像，库结构兼容。
- 版本变更走 PR #350 `chore(release): v0.1.0-beta.57`（rebase 合并 `f979f61`）。
- tag：`v0.1.0-beta.57`（annotated，指向 `f979f61`）；
  Release：<https://github.com/xqvvu/tocsin/releases/tag/v0.1.0-beta.57>（body 已校验非空）。
- 镜像：`registry.cn-hangzhou.aliyuncs.com/xqvvu/vane:0.1.0-beta.57`，
  linux/amd64 + linux/arm64，index digest `sha256:b1717048…`；回滚镜像 `0.1.0-beta.56`。

### 下一轮优先项

1. **NEW-BK（28）**：全局投递暂停的操作者与最近一次暂停区间（settings KV，无迁移）。
2. **NEW-BL（27）**：加急 Worker 健康只读投影（复用 `DeliveryWorkerHealthSnapshot`）。
3. **Q-23（25）**：dedupe cleanup 改有界批删除（唯一能一轮关闭未勾选代码 gate 的项）。
4. **UI-35 复现与定责**：先在干净 main 上打开事件详情确认 hydration mismatch 是否既有。
5. 下一轮非必跑车道：**security-exposure**。

## 2026-10-22（第 73 轮）

- 时间：2026-10-22 13:26 – 14:20 CST。
- 基线：本轮开始时 `origin/main` @ `7893280`；main CI success；无 open PR；
  `v0.1.0-beta.55` 的 tag 与 GitHub Release 均已存在且 body 非空，无待补建项。
- 类型：**需求切片 + 安全修复 + 三车道审计**（非 full-audit）。backlog 有多个 ≥27 候选，
  按第 1.5 步继续。
- 全量审计时间戳：第 1 轮（2026-10-18 13:30 CST，未变）。
- 车道：`requirements` + `ui-triage` 必跑；`ui-triage` 判定 **`defer`**，第三名额给轮转车道
  `release-infra`；并发始终 ≤3。
- 车道轮转位置：**`architecture`**（下一轮非必跑车道）。
- `ui-triage`：**`defer`** —— 距上次评审 3h57m（< 48h）；09:30 后 6 个 UI 提交全部有
  浏览器验证记录，未验证 UI 合并 0；18 条 `UI-` candidate，与第 62/68/70/71/72 轮持平
  （提前触发线为存量 >20）。再触发条件：2026-10-24 09:30 满 48h、未验证 UI 合并 ≥3、
  新增 UI 候选 ≥2 或存量 >20。
- `last_ui_review_at`：**2026-10-22 09:30 CST**（未变，本轮未做 UI 评审）。
- 工作树：`agent-iteration` 仅用于并发锁；实现、验证、浏览器检查均在会话工作树
  `gifted-hamilton-1795e5`。工作树已清理。
- 文档同步：当前会话未暴露 `obsidian-vault` skill，Obsidian 同步已跳过。

### 本轮交付

- PR #343 `feat(console): show the full urgent-call error in delivery detail`（REQ-168，28 分）。
  - 投递详情「电话加急」表新增 `DeliveryPingDetailDialog`：完整错误原文 + 呼叫时间线 +
    复制按钮；无错误时保持共享占位符。新增中英文 `deliveries.detail.pingDialog.*`。
  - 纯前端；PRD `docs/prd/delivery-ping-error-detail.md`；新增 2 条组件测试。
  - 验证：`vp check` 0 errors；`vp run -r test` 861 项；`vp run -r build` 通过。
    浏览器实测（隔离实例 `localhost:6199` + 临时 SQLite，种子数据含失败呼叫）：
    1280×900 对话框展示完整 386 字符错误、复制按钮存在、无页面横向溢出、console 错误 0；
    390×844 对话框 358px 宽、无横向溢出；截图 `/tmp/tocsin-ping-ui/dialog-{1280,390}.png`。
- PR #344 `fix(console): drop URL passwords from destination read projections`（SEC-22，27 分，AUTO_FIX）。
  - `destinationOperationalConfigFromRuntime` 的 endpoint 去掉 URL 密码、保留用户名；
    listItem、投递 `destinationMetadata` 与 7 个 route loader 的 SSR 数据不再携带密码。
  - 编辑草稿仍读存储原值，保存不会抹掉密码；发送路径不变。
  - 新增 3 条测试（投影剥离 + 序列化不含密码、编辑草稿保留、无凭据 URL 原样）。
  - 验证：`vp check` 0 errors；`vp run -r test` 862 项；`vp run -r build` 通过。

### 专家发现

- `requirements`（复核 4 条 + 3 条新候选，均已写入 backlog）：
  - **REQ-22（28）仍成立**：事件补投预览只渲染计数（`event-replay-action.tsx:155-169`），
    路由补投预览只显示前 10 条（`route-replay-prompt.tsx:164`）却提交全部候选（`:42,54-57`）。
  - **SEC-22 仍成立**（本轮已交付 #344）：只读投影原样返回 endpoint
    （`destination.helpers.ts:63,83-85,152-162`）。
  - **NEW-BD/NEW-BE/NEW-BF/NEW-BG 均仍成立**（`delivery-detail-view.tsx:20-22`、
    `destination-operational-config-cell.tsx:32-33,61-62`、`route.ts:325,330` vs `:296-298`、
    `settings-runtime-panel.tsx:23-55`）。
  - 新候选：**NEW-BH（25）** 运行时参数来源标注；**NEW-BI（26）** 切换 provider 未提示
    历史事件不重解析（`source-form.tsx:128-160`、`intake.service.ts:212-219`）；
    **NEW-BJ（21）** 补投无持久操作痕迹（需 forward-only `replay_runs` + EXPERT_PANEL）。
- `release-infra`（4 个未勾选 gate 仍成立，1 个新并发风险）：
  - E2E workflow 仍缺失（`.github/workflows/ci.yml:16-51` 只有 quality job）；
    spec 名为 “set up, route, and deliver” 但没有 Route（`alert-flow.spec.ts:27,90,117-118`）。
  - dedupe cleanup 仍无界（`delivery.helpers.ts:107-109`、`delivery.repository.ts:85-101`），
    加 `LIMIT` 有界批是唯一能一轮关闭未勾选代码 gate 的项（Q-23）。
  - provider fixture 目录仍缺失（6 个 `index.test.ts` 共 19 个内联 payload）。
  - Docker smoke 已修好生产卷隔离（`scripts/docker-smoke.sh:20-25`，`down -v` 只作用于
    `tocsin-smoke` 项目），但 project/image/volume 仍是固定标识，并发 worktree 会互删 → REL-27。
  - 新 docs 漂移：`release-checklist.md:4,20,73-74` 版本/tag 冻结在 beta.54（REL-29）、
    dedupe 行号 `:99` → `:101`（REL-30）。
  - main CI 最近 10 次全部 success。
- `ui-triage`：见上。

### EXPERT_PANEL

- 本轮无新增裁决事项。SEC-23、SEC-26、NEW-AU、NEW-AX、NEW-BJ 仍待后续轮次专家小组。

### 发布决策

- **已发布 `v0.1.0-beta.56`**：三位发布专家一致 APPROVE。
  - 发布经理：`v0.1.0-beta.55..origin/main` 的用户可见变更是 #343（电话加急错误对话框）与
    #344（目标读取投影剥离 URL 密码），其余为 docs；建议预发布递增。
  - 发布阻断审计员：目标 `ccf20b9`（后为 `7df71dc`）main CI success、无 open PR、
    `migrate/` 零改动、`v0.1.0-beta.56` tag 不存在、beta.55 Release 存在且 body 非空；
    `blocked-autonomous` 仅 REL-13（LICENSE），不阻断。
  - 运维/回滚专家：无迁移、无配置/环境变量/启动参数变化；#344 仅读取投影剥离密码，
    发送路径不变；回滚只需换回 `0.1.0-beta.55` 镜像。
- 版本变更走 PR #346 `chore(release): v0.1.0-beta.56`（rebase 合并 `7df71dc`）。
- 记录本轮 log/backlog 的 PR #345 `docs(planning): record round 73`（rebase 合并 `3e969b3`）。
- tag：`v0.1.0-beta.56`（annotated，指向 `7df71dc`）；
  Release：<https://github.com/xqvvu/tocsin/releases/tag/v0.1.0-beta.56>（body 已校验非空）。
- 镜像：`registry.cn-hangzhou.aliyuncs.com/xqvvu/vane:0.1.0-beta.56`，
  linux/amd64 + linux/arm64，index digest `sha256:1432f782…`；回滚镜像 `0.1.0-beta.55`。

### 下一轮优先项

1. **REQ-22（28）**：补投预览目标级明细，并让「预览数量 = 实际提交数量」。
2. **Q-23（25）**：dedupe cleanup 改有界批删除（唯一能一轮关闭未勾选代码 gate 的项）。
3. **REL-7 bundle**：`playwright install chromium` + 全部改 `localhost` + webServer 用 `/api/ready`。
4. **NEW-BI（26）/ NEW-BD（26）/ NEW-BE（26）**：纯前端切片。
5. 下一轮非必跑车道：**architecture**。

## 2026-10-22（第 72 轮）

- 时间：2026-10-22 12:26 – 13:05 CST。
- 基线：本轮开始时 `origin/main` @ `7acb669`；main CI success；无 open PR；
  `v0.1.0-beta.54` 的 tag 与 GitHub Release 均已存在且 body 非空，无待补建项。
- 类型：**需求切片 + 三车道审计**（非 full-audit）。backlog 有多个 ≥28 候选，按第 1.5 步继续。
- 全量审计时间戳：第 1 轮（2026-10-18 13:30 CST，未变）。
- 车道：`requirements` + `ui-triage` 必跑；`ui-triage` 判定 **`defer`**，第三名额给轮转车道
  `security-exposure`；并发始终 ≤3。
- 车道轮转位置：**`release-infra`**（下一轮非必跑车道）。
- `ui-triage`：**`defer`** —— 距上次评审 2h35m（< 48h）；09:30 后 4 个提交触及 UI
  （`4b9328d`、`ee00fa2`、`5fccd2b`、`c507970`），但四者都有 1280/390 浏览器验证记录，
  未验证合并为 0；`UI-` 未解决候选 18 条，与第 62/68/70/71 轮持平（提前触发线为存量 >20）。
  再触发条件：2026-10-24 09:30 满 48h、未验证 UI 合并 ≥3、新增 UI 候选 ≥2 或存量 >20。
- `last_ui_review_at`：**2026-10-22 09:30 CST**（未变，本轮未做 UI 评审）。
- 工作树：`agent-iteration` 仅用于并发锁；实现、验证、浏览器检查均在会话工作树
  `suspicious-volhard-5bdcea`。工作树已清理。
- 文档同步：当前会话未暴露 `obsidian-vault` skill，Obsidian 同步已跳过。

### 本轮交付

- PR #340 `feat(console): show silence evidence on event deliveries`（REQ-176，29 分）。
  - 事件详情投递表新增只读「静默」列：原因快照两行截断 + `title` 全文，
    规则存在时链接 `/suppressions/$suppressionId`，规则已删除时显式说明快照仍保留；
    未抑制行显示共享占位符。
  - 新组件 `features/events/ui/event-detail-delivery-suppression-cell.tsx`（一文件一导出组件）；
    DTO 字段早已存在，无新 oRPC、无迁移、无 service 变更。
  - PRD `docs/prd/event-delivery-suppression-evidence.md`；backlog REQ-176 → shipped。
  - 验证：`vp check` 0 errors（18 个既有 warning）；`vp run -r test` 162 文件 / 859 项；
    `vp run -r build` 通过。浏览器实测（隔离实例 `localhost:6198` + 临时 SQLite，
    owner `admin@example.test`）：种子数据下「静默」列显示原因与 `sup_demo` 链接，
    1280×900 与窄视口 `docScrollWidth === docClientWidth`，无 console 错误；
    截图 `/tmp/tocsin-suppression-cell-{1280,390}.png`（未入库）。
  - 说明：本轮投递数据用 SQLite 种子写入（该切片只消费已持久化字段），未走完整 Webhook 链路。

### 专家发现

- `requirements`（4 条新候选，已写入 backlog，均带当前代码行号）：
  - **NEW-BD（26）** 投递详情在全局暂停期间不解释「为什么还没发」：
    `delivery-detail-view.tsx:19-24` 只挂 suppression/retention，暂停横幅只在列表页
    （`deliveries-page.tsx:102`）；复用 `appSettingsQueryOptions()` 加只读 notice。
  - **NEW-BE（26）** 目标列表看不出使用哪个飞书应用：`destination-operational-config-cell.tsx:32-33,61-62`
    只显示 chatId；DTO 只有 `appRef`（`destination.ts:45-50`），但页面已加载 `feishuApps`
    （`destinations-page.tsx:49,55`），可纯前端解析应用名。
  - **NEW-BF（24）** 路由编辑器未说明大小写语义：标题/消息大小写不敏感
    （`packages/core/src/route/route.ts:330`），标签 equals/contains 敏感（`:297-299`）；
    静默表单已写「不区分大小写」，两处不一致。
  - **NEW-BG（25）** Settings 运行时面板看不到 schema 版本：
    `settings-runtime-panel.tsx:23-55`、`runtime-information.service.ts:31-50` 均无该字段，
    而 `store.schemaVersion()` 已存在（`store.ts:132-140`）。
  - 复核 **REQ-22（28）仍成立**：事件补投预览只渲染 `targets.length`
    （`event-replay-action.tsx:155-168`），路由补投预览只显示前 10 条
    （`route-replay-prompt.tsx:164`）却提交全部候选（`:42,54-57`，服务端上限 100）。
  - 复核 **REQ-176**：审计时发现该切片正被本会话实现，结论为「已过期（被实现）」。
- `security-exposure`（无新 HIGH/MEDIUM）：
  - 第 71 轮新增的 `settings.getStorageHealth` 白名单 DTO 无 secret/路径泄漏，
    已列入 private procedure（`server-orpc-auth.test.ts:136`）；唯一副作用是 4 次
    `count(*)` + `min/max` 在超大库上可能阻塞 worker，属性能问题。
  - import protection 全量核对：`server/**`、`infra/**` 中直接使用 `node:*`、SQLite 驱动、
    `process.env`、better-auth runtime 的 11 个文件均带 server-only 标记，违规 0；
    `packages/core`、`packages/api`、feature `model/*` 无环境专属导入。
  - **SEC-22 仍成立且是当前唯一真实外泄**：endpoint 的 URL userinfo 密码原样进入 listItem、
    deliveryMetadata 与 7 个 route loader 的 SSR 数据（`destination.helpers.ts:63,84,162`）；
    建议只剥离 userinfo 密码，编辑草稿保持原值（否则保存会用无密码 URL 覆盖）。
  - **SEC-25 仍成立**（`destination.service.ts:202,314,326,340` 的 `renderedPayload` 未过
    `redactJsonText`），当前无实际泄漏，属边界不对称。
  - **SEC-23 / SEC-26 仍成立**，均需 EXPERT_PANEL（外发/匹配依赖原值；完整 webhook URL
    是否可见是产品决策）。
  - 旧仓库名 `xqvvu/vane` 仅剩真实 ACR 镜像坐标与历史文本，无失效链接。
- `ui-triage`：见上。

### EXPERT_PANEL

- 本轮无新增裁决事项。SEC-26、SEC-23、NEW-AU、NEW-AX 仍待后续轮次专家小组。

### 发布决策

- **已发布 `v0.1.0-beta.55`**：三位发布专家一致 APPROVE。
  - 发布经理：`v0.1.0-beta.54..origin/main` 的用户可见变更是 #340（事件详情投递表静默列），
    其余 3 个提交为 docs 与等价样式重构；建议预发布递增。
  - 发布阻断审计员：目标 `03bec20` 的 main CI success、无 open PR、最近 10 次 main 运行全绿、
    区间内 `migrate/` 零改动；`REL-13`（LICENSE）按惯例不阻断。
  - 运维/回滚专家：无 schema、无配置/环境变量/启动参数、无依赖变化；回滚只需换回
    `0.1.0-beta.54` 镜像，SQLite 向前兼容。
- 版本变更走 PR #341 `chore(release): v0.1.0-beta.55`（rebase 合并 `03bec20`）。
- tag：`v0.1.0-beta.55`（annotated，指向 `03bec20`）；
  Release：<https://github.com/xqvvu/tocsin/releases/tag/v0.1.0-beta.55>（body 已校验非空）。
- 镜像：`registry.cn-hangzhou.aliyuncs.com/xqvvu/vane:0.1.0-beta.55`，
  linux/amd64 + linux/arm64，index digest `sha256:8702bda7…`；回滚镜像 `0.1.0-beta.54`。

### 下一轮优先项

1. **SEC-22**：目标 endpoint 的 URL userinfo 密码只读投影（安全车道推荐的单轮 AUTO_FIX）。
2. **REQ-22**：补投预览目标级明细，并让「预览数量 = 实际提交数量」。
3. **NEW-BD / NEW-BE**：投递详情暂停说明、目标列表飞书应用名（均为纯前端）。
4. **REQ-168（28）**：加急呼叫失败原因完整查看（pings 表错误列只有截断文本）。
5. 下一轮非必跑车道：**release-infra**。

## 2026-10-22（第 71 轮）

- 时间：2026-10-22 11:26 – 12:00 CST。
- 基线：本轮开始时 `origin/main` @ `5ae2e68`；main CI success；无 open PR。
- 类型：**需求切片 + 三车道审计**（非 full-audit）。backlog 有多个 ≥27 候选，按第 1.5 步继续。
- 全量审计时间戳：第 1 轮（2026-10-18 13:30 CST，未变）。
- 车道：`requirements` + `ui-triage` 必跑；`ui-triage` 判定 **`defer`**，第三名额给轮转车道
  `docs-drift`；并发始终 ≤3。`requirements` 约 15 分钟后返回 5 条新候选（见下）。
- 车道轮转位置：**`security-exposure`**（下一轮非必跑车道）。
- `ui-triage`：**`defer`** —— 距上次评审 1h56m（< 48h）；09:30 后 8 个提交中 3 个触及 UI
  （`c507970`、`5fccd2b`、`ee00fa2`），但三者都有浏览器验证记录，未验证 UI 合并为 0；
  18 条 candidate 与第 62/68/70 轮持平（提前触发线为存量 >20）。再触发条件：
  2026-10-24 09:30 满 48h、未验证 UI 合并 ≥3、新增 UI 候选 ≥2 或存量 >20。
- `last_ui_review_at`：**2026-10-22 09:30 CST**（未变，本轮未做 UI 评审）。
- 工作树：`agent-iteration` 仅用于并发锁；实现、验证、浏览器检查均在会话工作树
  `elegant-tereshkova-c317e9`。工作树已清理。
- 文档同步：当前会话未暴露 `obsidian-vault` skill，Obsidian 同步已跳过。

### 本轮交付

- PR #338 `feat(console): surface SQLite storage health in settings`（NEW-AT，27 分）。
  - 新增只读 `settings.getStorageHealth`：数据库体积（`page_count × page_size`）、
    可回收空间（freelist）、`events`/`deliveries`/`delivery_attempts`/`oncall_pings` 行数、
    最老/最新事件时间（空库 `null`）。
  - `SqliteStore.storageHealth()` 与 `sqliteVersion()`/`schemaVersion()` 同层；
    `StorageHealthService` 逐字段映射 DTO；`withDashboardService` 注入。
  - Settings「界面」页签新增「数据库存储」面板；抽出共享 `formatBytes`；
    oRPC auth inventory 与两个 fake container 同步。
  - `quick_check` 明确非目标：全文件扫描会阻塞单进程 worker，需独立限时入口。
  - PRD `docs/prd/settings-storage-health.md`；backlog NEW-AT → shipped。
  - 验证：`vp check` 0 errors（18 个既有 warning）；`vp run -r test` 162 文件 / 856 项
    （首轮 `server-orpc-auth.test.ts` inventory 因新过程失败，已补预期）；`vp run -r build` 通过。
  - 浏览器实测（隔离实例 `localhost:6197` + 临时 SQLite，owner `admin@example.test`）：
    空库显示 `248 KiB` / `8 KiB`、四表 0、事件时间「暂无事件」；经真实 Webhook 写入两个事件后
    事件数 2、最老/最新时间正常；1280×900 与 390×844 均无横向溢出
    （`docScrollWidth === docClientWidth`），无 console 错误。截图
    `/tmp/tocsin-storage-health-{1280,390}.png`（未入库）。

### 专家发现

- `requirements`（5 条新候选，已写入 backlog）：
  - **NEW-AZ（27）** Raw payload 保留期缩短影响预检：保留天数直接保存
    （`settings-preferences-panel.tsx:60-64,160-201`），缩短后下一条 Webhook 即按新 cutoff
    不可逆清理（`intake.service.ts:127-134`、`intake.repository.ts:105-135`）。建议只读
    `previewRetentionImpact`，谓词与 `pruneRawPayloads` 共用。
  - **NEW-AY（26）** Settings 最近诊断：LogTape 只有 console sink（`logging.ts:35-60`），
    Settings 无最近错误（`settings-runtime-panel.tsx:15-55`）。建议有界内存 ring（warning+，
    复用 `log-safety.ts:8-10,29-39` 脱敏）+ 只读 procedure + 诊断面板。
  - **NEW-BB（26）** 事件接入 request ID：中间件已生成并回写（`request-logging.middleware.ts:13-26,84-98`），
    但 events 表无 `request_id`（`migrate/schema.ts:63-83`），raw headers 清理后不可追溯。
    建议 forward-only `0004` 加 nullable 列 + 详情复制；不回填历史。
  - **NEW-BC（24）** 通知目标复制为停用草稿：表单已接受 `defaultValues`
    （`destination-form.tsx:82-103`），编辑草稿已返回非密钥值；纯前端，密钥置空、默认停用。
  - **NEW-BA（24）** 飞书群 `chat_id` 校验：当前纯文本输入（`feishu/manifest.ts:50-56`、
    `feishu/schema.ts:104-109`），发送时才失败；建议只读 `validateFeishuChat` 复用 tenant token。
  - 复核：**NEW-AL（28）**、**NEW-AQ（27）** 仍成立并更新行号；**NEW-AP 降为 25**——
    `ee00fa2` 已把规则 chip 改为按维度分组换行（`routes-section.tsx:343-390`、
    `route-rule-summary.ts:39-92`），剩余价值只有键盘/触屏可达的只读展开与 source 名称，
    若认为分组 + tooltip 已足够可直接 retire。
- `docs-drift`（10 条，均已核实代码）：
  - **DOC-6/DOC-23**：`frontend-architecture.md:18-19,37-108` 仍缺 setup/integrations/
    settings/suppressions 路由与 `features/{auth,integrations,suppressions}`；
    `:83` 仍称中间件「仅剩」request-logging（实际还有 `csrf.middleware.ts`，`start.ts:3-7`）。
    `application-container.md:35` 工厂列表仍未含 suppression/runtime-information/event-replay/
    operations（本轮又新增 `createStorageHealthService`）；`:56-69,86,95` 缺 session/suppressions/
    dashboard-context/operations.service。
  - **DOC-60**：`frontend-architecture.md:242-245` 仍称 `server/configuration` 含 source/
    destination/route service；实际各自独立目录。`:314-315` 与 `application-container.md:114`
    仍称 private procedure 用裸 `requireDashboard()`，实际 8 个 router 文件 10 处
    `withDashboardService`，裸调用仅剩 `operations/router.ts:69`。
  - **DOC-62/DOC-66**：`sqlite-store.md:369,483` 仍写 `better-auth-schema.ts`（实际
    `better-auth.schema.ts`）；RC checklist E 节缺 provider 贡献指南勾选项（新增 DOC-66）。
  - **DOC-24 关闭**：PRD 已把 `preview` 标为 REQ-25 计划项、AC 勾选为有意保留；
    contract 恰好 7 个过程。四状态是 core 既有语义，非文档漂移。
- `ui-triage`：见上；补充记录 `ee00fa2` 的浏览器验证只写在 commit message，
  未回写 iteration-log，本轮已由 triage 记录（1280/1440/390、每个列表页一个 h1）。

### EXPERT_PANEL

- 本轮无新增裁决事项。SEC-26、NEW-AU、NEW-AX 仍待后续轮次专家小组。

### 发布决策

- **已发布 `v0.1.0-beta.54`**：三位发布专家一致 APPROVE。
  - 发布经理：`v0.1.0-beta.53..origin/main` 有 4 个用户可见变更（#338 存储健康、#337 路由规则
    可读性/页面标题、#335 静默命中范围、#332 暂停态 worker 原因），远超「至少一个」门槛。
  - 阻断审计：main @ `d6eb07c` CI success；唯一 open PR 是发布 PR #336（CI success、MERGEABLE）；
    migrate/Dockerfile/compose/env/scripts 零 diff；唯一 `blocked-autonomous` 为历史 REL-13，
    非本次增量。
  - 运维/回滚：零迁移、零配置面变化；beta.53 可读 beta.54 数据；回滚只需换回
    `0.1.0-beta.53` 镜像并重启。
- 发布 PR #336 rebase 合并为 `708c404`，main CI success 后打 annotated tag
  `v0.1.0-beta.54`（指向 `708c404`），创建 GitHub Release
  <https://github.com/xqvvu/tocsin/releases/tag/v0.1.0-beta.54>。
- 镜像：`registry.cn-hangzhou.aliyuncs.com/xqvvu/vane:0.1.0-beta.54`，
  `linux/amd64` + `linux/arm64`，index digest `sha256:d9ce6443…`；回滚镜像 `0.1.0-beta.53`。
- 备注：发布 PR #336 的原始说明只覆盖 #332/#335（merge-base 停在 `b0ecfe2`）；实际 Release
  描述已补入 #337/#338 与依赖升级。

### 下一轮优先项

1. **NEW-AZ（27）** 保留期缩短影响预检；**NEW-AL（28）** 恢复前积压影响；
   **NEW-AQ（27）** 覆盖率名单展开；**NEW-AP（25，可 retire）** 路由规则只读展开。
2. **SEC-25** AUTO_FIX（`renderedPayload` 投影）；**SEC-22** AUTO_FIX（只读 endpoint userinfo）；
   **Q-58/Q-56/Q-57** 低成本测试补齐。
3. **NEW-AY（26）/NEW-BB（26）** 诊断与 request ID（NEW-BB 需 additive migration）；
   **NEW-BC/NEW-BA（24）** 配置体验。
4. **DOC-6/DOC-23/DOC-60/DOC-62/DOC-66** 文档更正批次（可独立 docs-only PR）。
5. 轮转车道 **`security-exposure`**；**SEC-26/NEW-AU/NEW-AX** 交 EXPERT_PANEL。

## 2026-10-22（第 70 轮）

- 时间：2026-10-22 10:25 – 11:05 CST。
- 基线：本轮开始时 `origin/main` @ `fc24f33`；main CI success；无 open PR。
- 类型：**需求切片 + 三车道审计**（非 full-audit）。backlog 有多个 ≥27 候选，按第 1.5 步继续。
- 全量审计时间戳：第 1 轮（2026-10-18 13:30 CST，未变）。
- 车道：`requirements` + `ui-triage` 必跑；`ui-triage` 判定 **`defer`**，第三名额给轮转车道
  `architecture`；并发始终 ≤3。
- 车道轮转位置：**`docs-drift`**（下一轮非必跑车道）。
- `ui-triage`：**`defer`** —— 距上次评审仅 56 分钟（< 48h）；此后 4 个提交里只有 1 个触及 UI
  （`c507970`，第 69 轮评审产出的 #332，当轮已在隔离实例 6195 做过 1280/390 浏览器验证），
  其余 3 个是 docs；18 条未解决 UI 候选与第 62 轮持平、属既有存量（第 68 轮把提前触发线定为
  存量 >20）。三个强信号只有「候选 ≥2」技术成立，重复评审同一暂停簇价值低。
  再触发条件：2026-10-24 09:30 满 48h、未验证 UI 合并 ≥3、新增 UI 候选 ≥2 或存量 >20。
- `last_ui_review_at`：**2026-10-22 09:30 CST**（未变，本轮未做 UI 评审）。
- 工作树：`agent-iteration` 仅用于并发锁；实现、验证、浏览器检查均在会话工作树
  `sharp-elgamal-d123d3`。工作树已清理。
- 文档同步：当前会话未暴露 `obsidian-vault` skill，Obsidian 同步已跳过。

### 本轮交付

- PR #335 `feat(console): disclose the alert scope of a silence rule`。
  - 新增 `features/suppressions/model/suppression-scope.ts`（纯投影：告警源名称/停用/已删除、
    severity/status、是否有文本条件）与 `ui/suppression-scope-preview.tsx`「命中范围」面板，
    在 `suppression-forms.tsx` 的 `UrgentImpactPreview` 之前渲染，创建与编辑共用。
  - 面板三行：告警源（未限制「所有告警源」；停用源「（已停用）」；已删除源按 id「（已删除）」）、
    严重级别、告警状态；设置了指纹/标签/标题/消息条件时追加「会进一步收窄命中范围」说明。
  - 中英文案各 11 键；`suppression-scope-preview.test.tsx` 5 条组件测试；PRD
    `docs/prd/suppression-condition-scope.md`；backlog NEW-AO → shipped。
  - 验证：`vp check` 0 errors（18 个既有 warning）；`vp run -r test` 4/4 workspace 任务、
    console 160 文件 / 849 项；`vp run -r build` 通过。
  - 浏览器实测（隔离实例 `localhost:6196` + 临时 SQLite，owner `admin@example.test`；
    6190 已被其他会话占用且不是本分支代码，故未复用）：空 matcher 三行均为「所有…」；
    勾选「严重」「触发中」后即时更新；输入标题条件后出现收窄说明；新建告警源并勾选后显示
    「Grafana Prod」；停用该源后显示「Grafana Prod（已停用）」；窄视口（500px）无横向溢出；
    无 console 错误或警告。截图 `/tmp/tocsin-suppression-scope-{zh,panel-zh,source-zh,narrow-zh}.png`
    （未入库）。

### 专家发现

- `requirements`（5 条新候选，已写入 backlog）：
  - **NEW-AT（27）** Settings 数据库存储健康面板：runtime 面板无存储指标
    （`settings-runtime-panel.tsx:15-47`），`/api/ready` 只有三个布尔（`routes/api/ready.ts:17-31`），
    全仓无 `page_count`/`fileSize`/`integrity_check` 运行时消费。
  - **NEW-AU（25）** 周期性维护窗口：静默只有绝对起止（`suppression.ts:44-60`），
    需 recurrence 与 occurrence 投影，属语义变更，落地前需 EXPERT_PANEL。
  - **NEW-AV（25）** 源级 Webhook 载荷上限：只有全局 `TOCSIN_MAX_WEBHOOK_BYTES`
    （`env.ts:33`），入口在读 body 前未取源策略（`routes/api/sources/$sourceId/webhook.ts:41-46`）。
  - **NEW-AW（23）** 源级 raw payload 保留覆盖：只有全局 `rawPayloadRetentionDays`
    （`settings.repository.ts:33,59-60`），`SourceSummary` 无策略字段（`source.ts:13-18`）。
  - **NEW-AX（20）** 自监控告警：`/api/ready` 只返回状态码，worker 停转/积压无外发信号；
    与暂停/积压语义相互递归，价值高但成本最高。
- `architecture`（无新增违规类别，全部归入既有 backlog）：
  - 已核实干净：无模块级 service 单例；`*.service.ts` 不抛 `ORPCError`；router 不自行翻译
    domain error；无 DI 框架；`components/common` 15 个文件无 feature/server/oRPC 导入；
    无新增缺失 `server-only` 标记。
  - 复核仍成立并更新行号：ARCH-1 `route-forms.tsx` 1035 行（`:62/:128`）、ARCH-2
    `suppression-forms.tsx` 728 行（`:68/:137`）、ARCH-10 `destination-form.tsx` 1393 行（`:82`）、
    ARCH-5 service 直抛 `RecordNotFoundError`（`destination.service.ts:138,158,211,259,383`、
    `oncall.service.ts:59,73`）、ARCH-6 `ready.ts:10,19,22,26`、ARCH-8 加重证据
    （`server/orpc/features/i18n/router.ts:16` 直接 `getApplicationContainer()`）、
    ARCH-9 `locale-cookie.ts:29-47` 且被 `i18n/router.ts:1` 导入、FIX-9/FIX-10 仍成立。
  - 债务集中在三条主线：入口过厚（worker 编排、readiness、public container 访问）、
    巨型表单（1393/1035/728 行）、`features/operations` 成为事实上的跨 feature 共享库
    （ARCH-32 复核仍成立）。

### EXPERT_PANEL

- 本轮无新增裁决事项；NEW-AU/NEW-AX 落地前需专家小组。SEC-26 仍待后续轮次专家小组。

### 发布决策

- **本轮发布 `v0.1.0-beta.54`**：三位专家一致 APPROVE。
  - 发布经理 **APPROVE**：`v0.1.0-beta.53..origin/main` 有 2 个用户可见提交——
    #335 静默规则「命中范围」面板（`5fccd2b`）、#332 暂停态 worker 禁用原因可达（`c507970`）；
    一个完整功能切片 + 一个无障碍修复，不属于为发版而发版。建议预发布递增为 `0.1.0-beta.54`。
  - 发布阻断审计员 **APPROVE**：6/6 PASS —— `origin/main` @ `b0ecfe2` CI success、无 open PR、
    migrate 目录零 diff、Dockerfile/compose/env/scripts 零 diff、唯一 blocked 项为 REL-13（LICENSE，
    非运行时阻断）、无未修复回归。
  - 运维/回滚专家 **APPROVE**：变更只在浏览器渲染层（feature UI + i18n），零迁移、零配置变化；
    新旧镜像可读同一库；回滚只需换回 `0.1.0-beta.53` 镜像并重启。
- **发布被 CI 基础设施阻断，未执行**：发布 PR #336（`chore(release): v0.1.0-beta.54`）的
  `check · test · build` 连续 3 次在 **Setup Vite+** 步骤失败——
  `Failed to parse CLI package metadata for @voidzero-dev/vite-plus-cli-linux-x64-gnu@1.3.0`、
  `Error: Failed to install Vite+ after 8 attempts across 4 URL(s)`（`gh run 39713020639`）。
  失败发生在任何仓库代码执行之前，与 PR 内容无关；同一 job 在 30 分钟前的 #335 上仍是 success，
  判定为上游 npm 元数据/安装脚本的瞬时故障。
- 处理：PR #336 **保持 open**，不打 tag、不推镜像（tag 必须指向 CI 已绿的 commit）；
  下一轮优先重跑 #336 的 CI，绿后 rebase 合并、再打 `v0.1.0-beta.54` 并推送双平台镜像。
- **第 71 轮补记**：上游 `Setup Vite+` 已恢复，PR #336 于 2026-10-22 03:47Z rebase 合并为
  `708c404`，`v0.1.0-beta.54` 已发布（内容扩展到 #337/#338 与依赖升级，详见第 71 轮记录）。
- 已就绪待用：发布说明草稿 `/tmp/tocsin-release-notes-v0.1.0-beta.54.md`；
  发布内容将是 tag + GitHub Release + `registry.cn-hangzhou.aliyuncs.com/xqvvu/vane:0.1.0-beta.54`
  （`linux/amd64` + `linux/arm64`），回滚镜像 `0.1.0-beta.53`。

### 下一轮优先项

0. **先收尾发布**：重跑 PR #336 的 CI（`gh run rerun <id> --failed`）。绿后 `--rebase` 合并，
   在 `origin/main` 上打 annotated tag `v0.1.0-beta.54`、创建 GitHub Release（草稿见
   `/tmp/tocsin-release-notes-v0.1.0-beta.54.md`），再构建并推送双平台镜像
   `0.1.0-beta.54`。若上游 `Setup Vite+` 仍失败，保持 PR open、不打 tag、不推镜像。
1. **NEW-AT（27）** Settings 存储健康；**NEW-AP（28）** 路由规则只读展开；
   **NEW-AQ（27）** 覆盖率名单展开；**NEW-AL（28）** 恢复前积压影响。
2. **SEC-25** AUTO_FIX（`renderedPayload` 投影）；**SEC-22** AUTO_FIX（只读 endpoint userinfo）；
   **Q-58/Q-56/Q-57** 低成本测试补齐。
3. **NEW-AU/NEW-AX** 交 EXPERT_PANEL；**SEC-26** 交 EXPERT_PANEL。
4. 轮转车道 **`docs-drift`**（DOC-6/DOC-22/DOC-23/DOC-24 等）；UI 遗留：暂停横幅视觉权重。

## 2026-10-22（第 69 轮）

- 时间：2026-10-22 09:20 – 09:50 CST。
- 基线：本轮开始时 `origin/main` @ `f23520b`；main CI success；无 open PR。
- 类型：**UI 评审切片 + 三车道审计**（非 full-audit）。backlog 有多个 ≥27 候选，按第 1.5 步继续。
- 全量审计时间戳：第 1 轮（2026-10-18 13:30 CST，未变）。
- 车道：`requirements` + `ui-triage` 必跑；`ui-triage` 判定 **`review_now`**（限缩到投递暂停簇），
  `ui-review` 取第三名额；`quality` 为轮转车道，与 requirements 并行。ui-triage 结束后才启动
  ui-review，并发始终 ≤3。
- 车道轮转位置：**`architecture`**（下一轮非必跑车道）。
- `ui-triage`：**`review_now`** —— 距上次评审 3h39m（< 48h），但自上次以来 5 个 UI 合并（阈值为 3），
  18 条未解决 UI 候选，且 5 个合并全部聚集在同一个新功能（全局投递暂停）上、每次只验证单表面，
  代码快览已确认三处跨表面落差（横幅中性 Alert vs 顶栏 destructive 徽标；暂停一键生效 vs 恢复需确认；
  `Run worker` 禁用原因只在 `title`）。判定做**限缩评审**而不是全量重审。
- `last_ui_review_at`：**2026-10-22 09:30 CST**（第 69 轮暂停簇浏览器评审，隔离实例 6195 + 临时 SQLite）。
- 工作树：`agent-iteration` 仅用于并发锁；实现、验证、浏览器检查均在会话工作树
  `serene-heyrovsky-8bfcb5`。工作树已清理。
- 文档同步：当前会话未暴露 `obsidian-vault` skill，Obsidian 同步已跳过。

### 本轮交付

- PR #332 `feat(console): explain why the worker action is disabled while paused`（rebase 合并 `c507970`）。
  - 暂停时在工具栏动作区下方渲染可见说明「出站投递已暂停，恢复后才能运行 worker」，并用
    `aria-describedby` 关联到按钮；保留原生 `title`；中英文案同步。
  - 新增 `deliveries-page-toolbar.test.tsx` 三态覆盖（运行中 / 暂停 / 其他操作 pending）。
  - PRD `docs/prd/delivery-worker-paused-reason.md`；backlog 新增 `UI-34`（shipped）。
  - 验证：`vp check` 0 errors（18 个既有 warning）；`vp run -r test` 4/4 workspace 任务、
    console 159 文件 / 844 项；`vp run -r build` 通过。
  - 浏览器实测（隔离实例 `localhost:6195` + 临时 SQLite，owner `admin@example.test`）：
    1280×900 与 390×844 下暂停态说明均可见、不溢出；无障碍树按钮 `description` 为说明文案且保持
    `disabled`；恢复后说明消失、按钮可用；无 console 错误，请求均 200。
    截图 `/tmp/tocsin-run-worker-paused-{1280,390}.png`（未入库）。

### 专家发现

- `requirements`（5 条新候选，已写入 backlog）：
  - **NEW-AO（29）** 静默规则创建/编辑披露条件范围（源/严重级别/状态）：抑制 PRD 的安全护栏要求
    （`docs/prd/alert-suppression.md:99,287`），已交付切片只做目标/加急
    （`docs/prd/suppression-scope-disclosure.md:47`）；表单已有 matcher 输入
    （`suppression-forms.tsx:368-408`），影响区只有 `UrgentImpactPreview`
    （`urgent-impact-preview.tsx:18-86`）。纯前端。
  - **NEW-AP（28）** 路由列表规则摘要可只读展开完整条件：chips 单行截断、完整条件只在 `title`
    （`routes-section.tsx:354-369`），`describeRouteRule` 折叠 source 数量
    （`route-rule-summary.ts:39-48,60-91`）。
  - **NEW-AQ（27）** 覆盖率徽标可展开路由名单与阻断原因：名单只在 `title`
    （`source-route-coverage-cell.tsx:17-35`、`destination-route-coverage.ts:20-24`）。
  - **NEW-AR（26）** 暂停支持自动恢复时间：暂停 PRD 明确列为非目标（`docs/prd/delivery-pause.md:50`），
    需 mini-PRD + EXPERT_PANEL。
  - **NEW-AS（24）** 未命中路由事件的 24h 聚合信号：只有逐行徽标
    （`event-delivery-counts-cell.tsx:37-45`），低于门槛，建议与 REQ-21 协同。
- `quality`（6 条复核，结论已写入 backlog）：
  - **Q-5/Q-43** 仍成立：损坏 JSON 无读取容错，`claimNext` 事务内 `intake.get(job.eventId)` 抛错会
    回滚整批（`delivery.repository.ts:323`），Events 列表 `route_matches_json` 损坏整页 500
    （`history.repository.ts:132,424-432`）；`rendered_payload_json` 影响投递详情
    （`delivery.helpers.ts:55-57`）。
  - **Q-13** 仍成立：唯一 worker 脱敏测试 `sendContext: {}` 且绑定驱动文案
    （`delivery-worker.service.test.ts:851-865`），脱敏断言恒真。
  - **Q-10** 部分修复、剩余成立：`settings.get()` 已前置（`delivery-worker.service.ts:54-58`）；
    post-claim 单条抛错中断整批（`:99-109`）与 `markSucceeded` 失败被当发送失败重试
    （`delivery-execution.ts:105-120`）仍在。
  - **Q-2** 仍成立：`response.text()` 无字节预算（`packages/destinations/src/utils.ts:77-83`），
    落库未截断（`delivery.repository.ts:386,432`）。
  - **Q-4/Q-12/Q-57** 仍成立：6 个 NOT_FOUND 分支无覆盖，测试 harness 未注入 resolver
    （`configuration.integration.test.ts:118-122`），`testDestination` 解析失败语义与投递路径不一致
    （`destination.service.ts:176-181`）。
  - **新增 Q-58（22）**：两条第 67/68 轮新测试无法证明其声称行为——`operations.service.test.ts:148-197`
    未注入服务时钟，`delivery-pause-hint.test.tsx:51-59` 未等查询落地。
  - **Q-56 降级**：`markFailed` 在 `oncall.repository.ts:211` 自行重算 `shouldRetry`，原「无限重排
    并重复呼叫」风险不成立，测试缺口仍在但降为 LOW。
- `ui-review`（限缩暂停簇，代码 + 浏览器）：
  - 已确认并交付：`Run worker` 禁用原因只在原生 `title`（`deliveries-page-toolbar.tsx:36-50`）→ PR #332。
  - 已确认、保留为候选：暂停横幅用中性 `Alert`（`deliveries-paused-notice.tsx:59`），而顶栏徽标用
    `destructive`（`delivery-pause-indicator.tsx:28-29`）、Settings 用 `text-destructive`
    （`settings-delivery-pause-panel.tsx:67`），视觉权重不一致；本轮未改，避免把紧急停止横幅
    过度染色，留待下一次 UI 评审结合截图决定。
  - 判定为合理设计、不改：Settings「暂停一键生效 / 恢复需确认」的方向差异——暂停只停止发送，
    恢复会触发积压发送与重新呼叫，确认放在危险方向（`delivery-resume-dialog.tsx:16-24`）。

### EXPERT_PANEL

- 本轮无新增裁决事项；SEC-26 仍待后续轮次专家小组。

### 发布决策

- **本轮不发布**：三位专家未达成一致。
  - 发布经理 **REJECT**：`v0.1.0-beta.53..c507970` 只有 1 个用户可见 commit（#332，单页暂停态提示），
    上一轮刚发过 beta.53，为一行说明再做一次双平台构建 + ACR 推送属于「为发版而发版」；
    建议与该提示和下一轮更高价值变更一起发 beta.54。
  - 发布阻断审计员 **APPROVE**：6/6 PASS（main CI success、无其他 open PR、无阻断回归、
    零 migration、零 env/Docker/脚本变化、工作树干净）。
  - 运维/回滚专家 **APPROVE**：零迁移、零配置变化，旧镜像可直接读新库，回滚只需换回
    `0.1.0-beta.53` 镜像；爆炸半径仅限 Deliveries 工具栏。
  - 按「有分歧时选最保守且可逆的方案」：跳过发布，tag 保持 `v0.1.0-beta.53`，
    不构建/不推送镜像；下一轮重新评估。

### 下一轮优先项

1. **NEW-AO（29）** 静默条件范围披露；**NEW-AP（28）** 路由规则只读展开；**NEW-AQ（27）** 覆盖率名单展开。
2. **NEW-AL（28）** 恢复投递前积压影响；**SEC-25** AUTO_FIX（`renderedPayload` 投影）；
   **SEC-22** AUTO_FIX（只读 endpoint userinfo）。
3. **Q-58/Q-56/Q-57** 低成本测试补齐；**ARCH-45/46** 两个 S 级分层修正；**SEC-26** 交 EXPERT_PANEL。
4. 轮转车道 **`architecture`**；UI 评审遗留：暂停横幅视觉权重、`Run worker` 说明已交付。

## 2026-10-22（第 68 轮）

- 时间：2026-10-22 08:26 – 09:50 CST。
- 基线：本轮开始时 `origin/main` @ `0a10af9`；main CI success；无 open PR。
- 类型：**需求切片 + 真实缺陷修复 + 发版**（非 full-audit）。backlog 有多个 ≥27 候选，按第 1.5 步继续。
- 全量审计时间戳：第 1 轮（2026-10-18 13:30 CST，未变）。
- 车道：`requirements` + `ui-triage` 必跑；`ui-triage` 判定 **`defer`**，第三名额给轮转车道
  **`security-exposure`**。并发始终 ≤3。
- 车道轮转位置：**`quality`**（下一轮非必跑车道）。
- `ui-triage`：**`defer`** —— 距上次真实浏览器评审 2h43m（< 48h）；自那以来 3 个 UI 合并
  （#319/#322/#325）均已在当轮用隔离实例做过浏览器验证；18 条未解决 UI 候选与第 62 轮以来持平，
  第 65–67 轮零新增 UI 候选；抽查暂停相关四个表面未见新不一致。下次触发：2026-10-24 05:47
  满 48h、出现未浏览器验证的 UI 合并、新增 UI 候选 ≥2 或存量 >20。
- `last_ui_review_at`：不变（2026-10-22 05:47 CST）。
- 工作树：`agent-iteration` 仅用于并发锁；实现、验证、发版构建均在会话工作树
  `trusting-ptolemy-0ff80f`。工作树已清理。
- 文档同步：本会话未暴露 `obsidian-vault` skill，Obsidian 同步已跳过。

### 本轮交付

- PR #328 `fix(console): stop pause toggles rewriting the retained payload window`（Q-55，rebase 合并 `ab87e24`）。
  - `UpdateAppSettingsCommandSchema.rawPayloadRetentionDays` 改为可选，`AppSettingsService` 仅在显式提供时写入。
  - 两个暂停入口只发送 `deliveryPaused`，`DeliveryResumeDialog` 不再接收 retention 属性。
  - 新增集成回归测试：暂停/恢复省略 retention 时保留已存储窗口，显式更新仍生效。
  - 验证：`vp check` 0 errors；`vp run -r test` 157 文件 / 837 项；`vp run -r build` 通过。
- PR #329 `feat(console): disclose how the delivery pause affects replay and test actions`（NEW-AI，rebase 合并 `c9c1156`）。
  - 新增 `DeliveryPauseHint`（queued / immediate），读取共享 `appSettingsQueryOptions`，仅暂停时渲染。
  - 接入事件补投框、路由历史匹配框、通知目标测试框；目标测试用 destructive 文案提示「绕过队列立即真实发送」。
  - 中英文案同步；PRD `docs/prd/delivery-pause-action-hints.md`；组件测试覆盖三态。
  - 验证：`vp check` 0 errors；`vp run -r test` 158 文件 / 840 项；`vp run -r build` 通过。
  - 浏览器实测（隔离实例 `localhost:6198` + 临时 SQLite，owner `admin@example.test`）：
    暂停后三处提示均出现且文案正确；恢复投递并刷新后三处消失；无 console 错误。
    截图 `/tmp/tocsin-pause-hint-{event,route,destination}.png`（未入库）。
- 发布：版本 PR #330 `chore(release): v0.1.0-beta.53`（rebase 合并 `f9e92d8`）。

### 专家发现

- `requirements`（3 条新候选，已写入 backlog）：
  - **NEW-AL（28）** 恢复投递前展示积压影响（数量/最老等待/目标分布）：恢复确认框只有定性警告
    （`delivery-resume-dialog.tsx:52-74`），从 Settings 恢复看不到积压；建议复用 `getDeliveryBacklog`
    并扩 destination 聚合；「丢弃积压」终态语义并入 REQ-189 后再做。
  - **NEW-AM（27）** 同指纹相邻事件差异对照：详情只读当前事件（`history.repository.ts:150-232`），
    索引 `(source_id, fingerprint, received_at)` 已存在；只读返回上一条并展示字段 diff。
  - **NEW-AN（25）** 投递尝试错误变化标注：尝试表错误列只有详情按钮（`delivery-attempts-table.tsx:70-73`），
    纯前端派生「首次/重复/已变化」。
- `security-exposure`（复核，无新增暴露面）：
  - SEC-25 仍成立（LOW/AUTO_FIX）：`destination.service.ts:202,314,326,340` 的 `renderedPayload`
    仍未过 `redactJsonText`；同文件已导入该函数，最小修法只覆盖这四处。
  - SEC-22 仍成立（MEDIUM/AUTO_FIX 子集）：`destination.helpers.ts:63,84` 只读投影原样返回 endpoint
    userinfo；editor draft（`:116,129`）必须保持原值，否则保存会用无密码 URL 覆盖存储值。
  - SEC-23 / SEC-26 未变；SEC-26 影响面仍为 7 个 route loader + 投递详情 + 目标表，维持 EXPERT_PANEL。
  - 脱敏回归测试仍未按 `DestinationKindSchema.options` 参数化：缺四类 kind 的 endpoint userinfo
    投影断言与 test/preview `renderedPayload` 投影断言。
  - 旧仓库名 `xqvvu/vane` 仅剩 ACR 镜像坐标与历史日志，`github.com/xqvvu/vane` 为 0。
- `ui-triage`：defer（理由见上）。

### EXPERT_PANEL

- 本轮无新增裁决事项；SEC-26 仍待后续轮次专家小组。

### 发布决策

- 发布经理 / 阻断审计员 / 运维回滚专家三位一致 **APPROVE** `v0.1.0-beta.53`：
  自 beta.52 以来 2 个用户可见变更（#328、#329）；`origin/main` @ `c9c1156` 与版本提交 `f9e92d8`
  main CI success；零 open PR；零 migration、零环境变量/启动参数/Docker 配置变化；
  `v0.1.0-beta.53` 未被占用；回滚只需换回 beta.52 镜像，SQLite schema 未变。
- tag：`v0.1.0-beta.53` → `f9e92d8`；GitHub Release 已创建（prerelease，正文非空）。
- 镜像：`registry.cn-hangzhou.aliyuncs.com/xqvvu/vane:0.1.0-beta.53`
  （linux/amd64 + linux/arm64，index digest `sha256:03edbbf2…`；`imagetools inspect` 已确认两个平台）。
- 回滚镜像：`registry.cn-hangzhou.aliyuncs.com/xqvvu/vane:0.1.0-beta.52`。

### 下一轮优先项

1. **NEW-AL（28）** 恢复投递前积压影响；**NEW-AJ（27）** 告警源接入健康；**NEW-AE（27）** 事件详情加急呼叫结果。
2. **NEW-AM（27）** 同指纹相邻事件差异；**SEC-25** AUTO_FIX（`renderedPayload` 投影）；
   **SEC-22** AUTO_FIX（只读 endpoint userinfo）。
3. **Q-56/Q-57** 低成本测试补齐；**ARCH-45/46** 两个 S 级分层修正；
   **SEC-26** 交 EXPERT_PANEL；**NEW-AK（25）/NEW-AN（25）**。
4. 轮转车道 **`quality`**；UI 评审遗留：暂停开关即时生效说明/成功 toast、横幅视觉强化、
   `Run worker` 禁用原因可见化。

## 2026-10-22（第 67 轮）

- 时间：2026-10-22 07:53 – 08:20 CST。
- 基线：本轮开始时 `origin/main` @ `c0894ec`；main CI success；无 open PR。
- 类型：**需求切片 + 发版**（非 full-audit）。backlog 有多个 ≥27 候选，按第 1.5 步继续。
- 全量审计时间戳：第 1 轮（2026-10-18 13:30 CST，未变）。
- 车道：`requirements` + `ui-triage` 必跑；`ui-triage` 判定 **`defer`**，第三名额给轮转车道
  **`quality`**。并发始终 ≤3。
- 车道轮转位置：**`security-exposure`**（下一轮非必跑车道）。
- `ui-triage`：**`defer`** —— 距上次评审 2h08m（< 48h）、自上次评审以来 2 个 UI 合并（#319/#322，
  均当轮浏览器验证）、18 条未解决 UI 候选属稳定存量、零新增 UI 候选。触发条件：UI 合并累计 ≥3、
  新增候选 ≥2、存量 >20、出现未浏览器验证的 UI 修复，或 2026-10-24 05:47 满 48h。
- `last_ui_review_at`：不变（2026-10-22 05:47 CST）。
- 工作树：`agent-iteration` 仅用于并发锁；实现、验证在会话工作树 `intelligent-tharp-a86e0b`。工作树已清理。
- 文档同步：`obsidian-vault` skill 在当前会话不可用，Obsidian 同步已跳过。

### 本轮交付

- PR #325 `feat(console): summarize the claimable delivery backlog while paused`（NEW-AH，rebase 合并 `8bab0c8`）。
  - 新增只读 `operations.getDeliveryBacklog`：`claimable` + `oldestCreatedAt`，谓词与 `claimNext` 一致
    （pending、目标启用、路由为空或启用、退避已到、`attempt_count < max_attempts`）。
  - Deliveries 暂停横幅在说明下增加一行：有积压显示条数与最早等待，无积压显式说明；仅暂停时启用、
    30 秒刷新，等待时长复用 `useOperationalNow` 推进；查询失败/加载中静默。
  - 仓储新增 `summarizeClaimable`，operations service/router 保持薄入口；DTO 在 `@tocsin/core`；
    无迁移、无新依赖；中英文案同步；PRD `docs/prd/delivery-backlog-summary.md`。
  - 测试：仓储覆盖停用目标/停用路由/未到退避/重试耗尽，并断言与 `claimNext` 在同一数据集上一致；
    service 固定时钟；组件覆盖有积压、无积压、未暂停不查询。
  - 验证：`vp check` 0 errors；`vp run -r test` 157 文件 / 836 项；`vp run -r build` 通过。
  - 浏览器实测（隔离实例 `localhost:6197` + 临时 SQLite）：暂停后空队列显示「No queued deliveries are
    ready to be claimed」；直接种入 5 条 pending（2 条可领取、1 条停用目标、1 条未到退避、1 条重试耗尽）后，
    横幅显示「2 queued deliveries will be claimed immediately after resuming · oldest waiting 1h 59m」，
    证明谓词与计数一致；无 console/网络错误。

### 专家发现

- `requirements`（2 条新候选，已写入 backlog）：
  - **NEW-AJ（27）** 告警源接入健康信号（速率突增 + 解析失败计数）：`SourceSummary` 无流量/解析字段
    （`source.ts:10-16`），Sources 表无健康列（`sources-section.tsx:41-76`），但索引与解析失败标签已具备
    （`schema.ts:245-248`、`intake.service.ts:192-239`）；建议与 REQ-9/REQ-12 共用 activity DTO。
  - **NEW-AK（25）** 死路由巡检（最近命中 + 7 天命中数）：`RouteDefinitionSchema` 无活动字段
    （`route.ts:37-52`），缺 `(route_id, created_at)` 索引（`schema.ts:260-266`）；优先并入共享 DTO。
- `quality`（3 条新候选，已写入 backlog）：
  - **Q-55（26，真实缺陷）** 暂停/恢复会静默回写陈旧的 `rawPayloadRetentionDays`：契约必填
    （`configuration-commands.ts:129-138`），两个暂停入口用渲染时快照回填
    （`delivery-resume-dialog.tsx:37-44`、`settings-delivery-pause-panel.tsx:29-39`）；跨标签页改保留期后恢复
    会写回旧值。
  - **Q-56（25）** oncall 过期 reclaim 的「重试耗尽」分支无测试（`oncall.repository.ts:120-125`）。
  - **Q-57（22）** `testDestination` 配置解析失败路径未定义/未测试（`destination.service.ts:176-181`）。
- `ui-triage`：defer（理由见上）。

### EXPERT_PANEL

- 本轮无新增裁决事项；SEC-26 仍待后续轮次专家小组。

### 发布决策

- 发布经理、阻断审计员、运维/回滚专家三位一致 **APPROVE** `v0.1.0-beta.52`：
  自 beta.51 以来 1 个用户可见变更（#325）；`origin/main` @ `8bab0c8` main CI success；零 open PR；
  零迁移、零配置/环境变量/启动参数变化、零锁文件变动；`v0.1.0-beta.52` 未被占用；
  回滚风险 LOW（换回 beta.51 镜像即可，暂停/积压是运行时状态，不受版本回滚影响）。
- 版本 PR #326 `chore(release): v0.1.0-beta.52`（rebase 合并 `b9d080e`）；根 `package.json` 为唯一版本来源，
  `release-checklist.md` 版本与 tag 计数（44）同步。
- tag：`v0.1.0-beta.52` → `b9d080e`（main CI success 后创建）；GitHub Release 已创建
  （prerelease，正文非空）。
- 镜像：`registry.cn-hangzhou.aliyuncs.com/xqvvu/vane:0.1.0-beta.52`
  （linux/amd64 + linux/arm64，index digest `sha256:d6a87873…`）。

### 下一轮优先项

1. **Q-55（26）** 暂停回写陈旧 retention（真实缺陷）；**NEW-AI（27）** 补投/重试/测试发送的时机标注。
2. **NEW-AJ（27）** 告警源接入健康；**NEW-AE（27）** 事件详情加急呼叫结果；**NEW-AK（25）** 死路由巡检。
3. **Q-56/Q-57** 低成本测试补齐；**SEC-25/SEC-22** AUTO_FIX；**SEC-26** 交 EXPERT_PANEL；
   **ARCH-45/46** 两个 S 级分层修正。
4. 轮转车道 **`security-exposure`**；UI 评审遗留：暂停开关即时生效说明/成功 toast、横幅视觉强化、
   `Run worker` 禁用原因可见化。

## 2026-10-22（第 66 轮）

- 时间：2026-10-22 06:26 – 06:45 CST。
- 基线：本轮开始时 `origin/main` @ `f47a726`；main CI success；无 open PR。
- 类型：**需求切片 + 发版**（非 full-audit）。backlog 有多个 ≥27 候选，按第 1.5 步继续。
- 全量审计时间戳：第 1 轮（2026-10-18 13:30 CST，未变）。
- 车道：`requirements` + `ui-triage` 必跑；`ui-triage` 判定 **`defer`**，第三名额给轮转车道
  **`security-exposure`**。并发始终 ≤3。
- 车道轮转位置：**`quality`**（下一轮非必跑车道）。
- `ui-triage`：**`defer`** —— 距上次评审仅 39 分钟（< 48h）、自上次评审以来仅 1 个 UI 合并
  （#319，且已同轮浏览器验证）、18 条未解决 UI 候选属稳定存量。下次触发条件：满 2 小时且出现
  未评审 UI 提交，或 UI 合并累计 ≥3，或新增 candidate ≥2。
- `last_ui_review_at`：不变（2026-10-22 05:47 CST）。
- 工作树：`agent-iteration` 仅用于并发锁；实现、验证在会话工作树 `jolly-hawking-20efa1`。工作树已清理。

### 本轮交付

- PR #322 `feat(console): disclose urgent paging before resuming delivery`（NEW-AG，rebase 合并 `0f3262e`）。
  - 新增 `DeliveryResumeDialog`：Deliveries 暂停横幅与 Settings 取消勾选都先确认；披露排队投递会
    立即领取并发送、飞书应用模式 + 自动加急会对排队期间仍处于触发中的告警重新呼叫接收人；
    暂停操作仍单击生效，成功后 toast，失败保留对话框。
  - 暂停态文案补充「加急呼叫不受暂停影响」（横幅与 Settings 说明），新增中英
    `deliveries.resumeDialog.*` 5 条。
  - 新增两个组件测试：确认前不提交 / 确认后提交 / 失败保留对话框；Settings 暂停无需确认、
    恢复需确认、确认后提交。
  - PRD `docs/prd/delivery-resume-disclosure.md`。
  - 验证：`vp check` 0 errors；`vp run -r test` 156 文件 / 830 项；`vp run -r build` 通过。
  - 浏览器实测（隔离实例 `localhost:6196` + 临时 SQLite）：暂停 → 两处恢复均弹确认框 →
    「暂不恢复」保持暂停 → 「恢复并发送」后横幅与顶栏徽标消失、Worker 恢复可用、toast 出现；
    无 console/网络错误。

### 专家发现

- `requirements`（2 条新候选，已写入 backlog）：
  - **NEW-AH（28）** 暂停期间「可领取积压规模 + 最老等待」只读投影：横幅与恢复对话框只显示
    暂停时间，操作员无法在恢复前判断会立即发出多少条（`delivery-worker.service.ts:60-76`、
    `delivery-worker-runner.ts:50`）。
  - **NEW-AI（27）** 暂停期间补投/重试/目标测试的时机标注：这些入口不读暂停状态
    （`event-replay-action.tsx:1-40`、`route-replay-prompt.tsx:34-59`、
    `delivery-retry-button.tsx:17-56`），目标测试更会绕过 worker 立即真实发送
    （`destination.service.ts:175-198`）。
- `security-exposure`（复核，无新增暴露面）：
  - SEC-25 仍成立（LOW/AUTO_FIX）：`destination.service.ts:202,314,326,340` 的
    `renderedPayload` 未过 `redactJsonText`，与投递详情读边界不对称；当前无实际泄漏。
  - SEC-22 仍成立（MEDIUM）：只读投影 `destination.helpers.ts:63,84,289-303` 原样返回
    endpoint userinfo；但 editor draft 不能脱敏，否则编辑保存会用无密码 URL 覆盖存储值。
  - SEC-26 影响面扩大：`destinationsQueryOptions()` 被 7 个 route loader 预取
    （events/deliveries/routes/settings/sources/suppressions/destinations），投递证据包也会
    带走 endpoint；维持 EXPERT_PANEL。
  - 最近 20 个提交未新增 secret → DTO/SSR/日志路径；脱敏键表无需变更。
- `ui-triage`：defer（理由见上）。

### EXPERT_PANEL

- 本轮无新增裁决事项；SEC-26 仍待后续轮次专家小组。

### 发布决策

- 发布经理 / 阻断审计 / 运维回滚三位专家一致 **APPROVE** `v0.1.0-beta.51`：
  自 beta.50 以来 1 个用户可见变更（#322）；`origin/main` @ `0f3262e` 与版本提交 `35f5a14`
  的 main CI 均 success；零 open PR、零迁移、零配置/环境变量/启动参数变化；
  `v0.1.0-beta.51` 未被占用；回滚风险 LOW（换回 beta.50 镜像即可，暂停/投递状态不受影响）。
- 版本 PR #323 `chore(release): v0.1.0-beta.51`（rebase 合并 `35f5a14`）；根 `package.json`
  为唯一版本来源，`release-checklist.md` 版本与 tag 计数（43）同步。
- tag：`v0.1.0-beta.51` → `35f5a14`（main CI success 后创建）；GitHub Release 已创建
  （prerelease，正文非空）。
- 镜像：`registry.cn-hangzhou.aliyuncs.com/xqvvu/vane:0.1.0-beta.51`
  （linux/amd64 + linux/arm64，index digest `sha256:83f28f0418…`）。

### 下一轮优先项

1. **NEW-AH（28）** 暂停积压摘要；**NEW-AI（27）** 补投/重试/测试发送的时机标注。
2. 轮转车道 **`quality`**；SEC-25/SEC-22 作为 AUTO_FIX，SEC-26 交 EXPERT_PANEL。
3. Q-52/Q-53/Q-54 低成本测试补齐；ARCH-45/46 两个 S 级分层修正。
4. UI 评审遗留：暂停开关即时生效说明/成功 toast、Deliveries 横幅视觉强化、
   `Run worker` 禁用原因可见化。

## 2026-10-22（第 65 轮）

- 时间：2026-10-22 05:38 – 06:12 CST。
- 基线：本轮开始时 `origin/main` @ `c24d218`；main CI success；无 open PR。
- 类型：**语义修复 + 需求切片 + UI 评审**（非 full-audit）。backlog 有多个 ≥27 候选，按第 1.5 步继续。
- 全量审计时间戳：第 1 轮（2026-10-18 13:30 CST，未变）。
- 车道：`requirements` + `ui-triage` 必跑；`ui-triage` 判定 `review_now（限缩）`，第三名额给 **`ui-review`**；
  轮转车道 **`architecture`** 在 ui-triage 结束后补跑。并发始终 ≤3。
- 车道轮转位置：**`security-exposure`**（下一轮非必跑车道）。
- `ui-triage`：**`review_now（限缩）`** —— 距上次全量评审（03:10）2h28m、自那以来 4 个 UI 提交（≥3 阈值），
  其中只有 #313 从未被评审车道看过；18 条未解决 UI 候选属稳定存量。聚焦 #313 的跨页可见性与 390px。
- `last_ui_review_at`：**2026-10-22 05:47 CST**（本轮真实浏览器评审）。
- 工作树：`agent-iteration` 仅用于并发锁与基线；实现、验证在会话工作树
  `angry-grothendieck-d55df9`。工作树已清理。

### 本轮交付

- PR #318 `fix(console): keep operational timestamps advancing`（Q-51，rebase 合并 `24e2d32`）。
  - 新增 `#/i18n/use-operational-now`：`useOperationalNow()` 默认 30s tick，导出
    `OPERATIONAL_CLOCK_REFRESH_MS`；替换抑制列表（状态徽标/排序/启停确认）、抑制详情页与
    `RetryTimestamp` 共 4 处 `useNow()`；header 指示器复用同一常量。
  - 新增 fake-timer 回归：重试标签跨午夜后从 `dateTime` 切到 `time`。
  - 验证：`vp check` 0 errors；`vp run -r test` 153 文件 / 821 项；`vp run -r build` 通过。
- PR #319 `feat(console): surface a paused delivery state in the header`（NEW-AF，rebase 合并 `08ec3dd`）。
  - `DeliveryPauseIndicator` 读 `appSettingsQueryOptions`，暂停时渲染 destructive 徽标并链接 `/deliveries`；
    加载/失败静默；< `sm` 仅图标 + `aria-label`；设置 mutation 的 `setQueryData` 使恢复即时消失。
  - 组件测试覆盖暂停/未暂停/查询失败三态；header 测试补断言；PRD `docs/prd/delivery-pause-visibility.md`。
  - 浏览器实测（隔离实例 `localhost:6193` + 临时 SQLite）：暂停后 Events 页 1280 显示徽标、390 仅图标
    且标题不截断、无横向溢出；点击进入 Deliveries 横幅；恢复后徽标立即消失；无 console/网络错误。
  - 验证：`vp check` 0 errors；`vp run -r test` 154 文件 / 824 项；`vp run -r build` 通过。

### 专家发现

- `requirements`（2 条新候选，已写入 backlog）：
  - **NEW-AF（29）** 全局投递暂停的常驻可见性——与本轮 ui-review 的唯一切片建议一致，已交付（#319）。
  - **NEW-AG（28）** 恢复投递前的加急影响披露：恢复后发送成功的 app 模式飞书投递会按目标自动建 ping
    （`delivery-execution.ts:119-130`；门控 `oncall.service.ts:147-160`），去重窗口仅 5 分钟
    （`oncall.service.ts:18`）；两个恢复入口均直接执行且文案只说「恢复后继续发送」
    （`deliveries-paused-notice.tsx:30-35`、`settings-delivery-pause-panel.tsx:44-47`、`zh-Hans.json:89,260`）。
- `architecture`（2 条新发现 + 既有候选复核）：
  - **ARCH-45（S）** `getAuthBootstrap` 在入口直连全局 container（`server/orpc/features/session/router.ts:35-39`）。
  - **ARCH-46（S）** 「重复暂停保留首次时间」产品规则落在仓储（`settings.repository.ts:63-80`）。
  - 既有候选仍成立：ARCH-28（core/api 双份已扩到 `AppSettings`/`WorkerRunNotice`，无 parity 守卫）、
    ARCH-30（分页本地 state）、ARCH-27（provider catalog 无消费者）、ARCH-5、ARCH-6、ARCH-13、
    ARCH-14、ARCH-23（部分）。
  - 近 12 次提交未引入其他边界问题；`2d8d1ff` 反而加强了启动期失败边界。
- `ui-review`（限缩，浏览器实测；截图 /tmp/ui65-*.png）：
  1. **暂停在 Deliveries/Settings 外零信号**（Events header 仅「Events」）→ 本轮 NEW-AF 交付。
  2. 暂停开关与「保存设置」同页却点击即生效，无「立即生效」说明、无成功 toast，仅红字
     （`settings-delivery-pause-panel.tsx:40-64`）。
  3. Deliveries 横幅用默认 Alert，视觉等同普通信息；`Run worker` 仅靠 title 解释禁用，移动端无 hover
     （`deliveries-paused-notice.tsx:45`、`deliveries-page-toolbar.tsx:40-46`）。
  4. 暂停不读 on-call runner（`container.ts:378-380`），手动加急与已排队 ping 仍会呼叫，但文案未说明
     （`zh-Hans.json:89,260`）→ 并入 NEW-AG。
  - 390px 无横向溢出、按钮可达；全程无 console/网络错误。
- `security-exposure` 车道本轮未跑（第三名额给 ui-review），SEC-22/25/26 仍待裁决。

### EXPERT_PANEL

- 本轮无新增裁决事项。

### 发布决策

- 发布经理 / 阻断审计 / 运维回滚三位专家一致 **APPROVE** `v0.1.0-beta.50`：
  自 beta.49 以来 2 个用户可见变更（#318 运维时间推进、#319 全局暂停顶栏徽标）；
  `origin/main` @ `08ec3dd` 与版本提交 `51f4f34` 的 main CI 均 success、无 open PR、零迁移、
  `v0.1.0-beta.50` 未被占用；回滚风险 LOW（换回 beta.49 镜像即可，暂停状态与队列保持不变）。
- 版本 PR #320 `chore(release): v0.1.0-beta.50`（rebase 合并 `51f4f34`），根 `package.json` 为唯一版本来源；
  `release-checklist.md` 的当前版本与 tag 计数（42）同步。
- tag：`v0.1.0-beta.50` → `51f4f34`（main CI success 后创建）；GitHub Release 已创建（prerelease，正文非空）。
- 镜像：`registry.cn-hangzhou.aliyuncs.com/xqvvu/vane:0.1.0-beta.50`
  （linux/amd64 + linux/arm64，index digest `sha256:54710b641636f88afdb38b9e6edc30efcdbe29feb5aa2a16238b58a252767ceb`）。
- 发布说明提示：顶栏全局暂停指示 + 运维时间不再冻结；无迁移/配置/环境变量变化；
  回滚镜像 `0.1.0-beta.49`（回滚后顶栏徽标消失，但暂停状态仍保留）。

### 下一轮优先项

1. **NEW-AG（28）** 恢复投递前的加急影响披露。
2. **NEW-AE（27）** 事件详情加急呼叫结果；**NEW-W（27）** 中文输入法组合期间不提交搜索；
   **NEW-AB（27）** 主题切换；**NEW-AC（26）** 目标级请求超时。
3. 轮转车道 **`security-exposure`**；SEC-22/25/26 交 EXPERT_PANEL。
4. UI 评审遗留：暂停开关即时生效说明/成功 toast、Deliveries 横幅视觉强化与 `Run worker` 禁用原因。
5. Q-52/Q-53/Q-54 低成本测试补齐；ARCH-45/46 两个 S 级分层修正。

## 2026-10-22（第 64 轮）

- 时间：2026-10-22 04:32 – 05:1x CST。
- 基线：本轮开始时 `origin/main` @ `4f420a3`；main CI success；无 open PR。
- 类型：**需求切片 + 小修复 + EXPERT_PANEL 安全加固**（非 full-audit）。backlog 有多个 ≥27 候选，按第 1.5 步继续。
- 全量审计时间戳：第 1 轮（2026-10-18 13:30 CST，未变）。
- 车道：`requirements` + `ui-triage` 必跑；第三名额给轮转车道 **`quality`**（第 63 轮记录的下一车道）。
- 车道轮转位置：**`architecture`**（下一轮非必跑车道）。
- `ui-triage`：**`review_now（限缩）`** —— 距上次真实评审（03:10）仅 83 分钟、2 个 UI 提交、18 条稳定 UI 候选；但 #307
  的跨天重试是评审后唯一无浏览器验证的行为变更，且 `next` 列 8% 宽、无裁剪。本轮按限缩范围只复核该列，
  未重访 Settings/Destinations 与既有候选。
- `last_ui_review_at`：**2026-10-22 03:10 CST**（未变；本轮为限缩浏览器复核，不计全量 UI 评审）。
- 工作树：`agent-iteration` 仅用于并发锁与基线；实现、验证在会话工作树 `gallant-nobel-766e93`。工作树已清理。

### 本轮交付

- PR #313 `feat(console): pause outbound delivery from settings`（NEW-AA，rebase 合并 `8464445`）。
  - `AppSettings` 增加 `deliveryPaused`/`deliveryPausedAt`（settings 键值，无迁移）；重复暂停保留首次时间，恢复清空；
    `runOnce` 在 reclaim/claim 前读设置，暂停时返回 `paused: true` 零结果且不动队列（同时收窄 Q-10 的失效面）；
    Settings 即时开关 + Deliveries 横幅/恢复 + 手动运行禁用；PRD `docs/prd/delivery-pause.md`。
  - 验证：`vp check` 0 errors；`vp run -r test` 152 files / 815 tests；`vp run -r build` 通过；浏览器实测
    （隔离实例 6203 + 临时 SQLite，1280 与 390 两种宽度）暂停/恢复/刷新持久化/按钮禁用与 Toast，无 console error。
- PR #314 `fix(deliveries): clip cross-day retry timestamps inside their column`（UI-33，rebase 合并 `491f3e5`）。
  - 1280×900 实测跨天值文本结束 `x=892`、单元格右界 `x=847`，直接覆盖「最近错误」列；`next` 列 8%→11%、
    加 `truncate`（`lastError` 22%→19%），补回归测试；修复后相邻列从 `x=876` 干净开始。
  - 验证：`vp check` 0 errors；`vp run -r test` 152 files / 816 tests；`vp run -r build` 通过。
- PR #315 `fix(auth): refuse published secrets in production`（SEC-27，EXPERT_PANEL）。
  - compose fallback 从公开 64 位 hex 改为已被拒绝的占位值；`bootstrap()` 在任何请求前调用
    `requireBetterAuthSecret`；黑名单保留两个历史公开值并做 trim/lowercase 归一化；`.env.example` 改占位值；
    根 `.env` 加入 `.gitignore`；新增 `deployment-secrets.contract.test.ts`；README/部署/升级/RC 文档同步。
  - 验证：`docker compose config` 解析为占位值且 exit 0；构建产物在 production + 占位 secret 下首个请求
    `/api/ready` 返回 500，日志含可操作错误且不回显 secret；`vp check` 0 errors；`vp run -r test` 全绿；
    `vp run -r build` 通过。

### 专家发现

- `requirements`（1 条新候选，已写入 backlog）：
  - **NEW-AE（27）** 事件详情展示该事件的加急呼叫结果：PRD 承诺事件详情可见「谁被叫了、成没成」
    （`docs/prd/oncall-feishu-urgent.md:21`），实际只有投递详情挂 `DeliveryPingsTable`
    （`delivery-detail-view.tsx:54`）；仓储只有 `listForDelivery`（`oncall.repository.ts:228-238`）。
    方案：`listForEvent` + `EventDetail.pings` + 事件详情区块，现有索引可查、无迁移。
  - 其余方向（去重窗口可配置、schema 版本面板、配置健康体检、日志级别热调等）均低于门槛或与既有候选重复，未凑数。
- `quality`（4 条新发现，已写入 backlog）：
  - **Q-51（27，HIGH 价值）** `useNow()` 不推进时间：use-intl 4.14.9 未传 `updateInterval` 时只取挂载时刻，
    生产 `AppIntlProvider` 未传 `now`；抑制状态/排序/停用确认文案与 `RetryTimestamp` 全部冻结，
    而 header 指示器每 30s 自 tick，出现自相矛盾；`suppression-detail-page.tsx:31-33` 注释与实现不符。
  - **Q-52（26）** 加急执行「凭据/引用/渠道无效」终止分支无测试（`oncall-execution.ts:71-84`），
    若被误删会落入 retryable catch-all 反复重试。
  - **Q-53（24）** 已删除抑制规则的详情链接落到通用错误页，与 Event/Delivery 的就地 not-found 不一致。
  - **Q-54（23）** 补投服务 nullable 与停用路由分支无测试。
- `ui-triage`：见上；发现并促成 UI-33。
- `security-exposure` 车道本轮未跑（第三名额给 `quality`），SEC-22/25/26 仍待裁决。

### EXPERT_PANEL：SEC-27

- 三位专家（安全与可靠性 / 产品与运维 / 独立评估者）一致同意实施，分歧只在 compose 是否用 `${VAR:?}`。
- 最终选择（最保守且可逆）：compose 回落到**已被应用拒绝的占位值**（保留 `ps/logs/down` 可用），
  由 `bootstrap()` 做启动期校验，黑名单保留历史公开值并归一化。
- 决策记录：`docs/planning/decisions/sec-27-better-auth-secret.md`，含三位专家意见、回滚方式与实测行为
  （Nitro 懒加载入口 → 所有请求 500 + 容器 unhealthy，而不是进程启动即退出）。
- 附带更正：backlog 原文写 `.env.example:2`，实际路径是 `apps/console/.env.example`。

### 发布决策

- 发布经理 / 阻断审计 / 运维回滚三位专家一致通过 `v0.1.0-beta.49`：自 beta.48 以来 3 个用户可见变更
  （#313 全局暂停投递、#314 跨天重试列溢出、#315 生产拒绝公开 secret），`origin/main` @ `a201d6f`
  main CI success、无 open PR、零迁移、tag 未占用；回滚风险 LOW。
- 版本 PR #316 `chore(release): v0.1.0-beta.49`（rebase 合并 `9ceebb4`），根 `package.json` 为唯一版本来源，
  `release-checklist.md` 的当前版本与 tag 计数同步。
- tag：`v0.1.0-beta.49` → `9ceebb4`（main CI success 后创建）；GitHub Release 已创建（prerelease，正文非空）。
- 镜像：`registry.cn-hangzhou.aliyuncs.com/xqvvu/vane:0.1.0-beta.49`
  （linux/amd64 + linux/arm64，index digest `sha256:55eb3de37c59f4bd4cdb5b35c5d035e877abc4c79740d05e8f5cb5b4d17fb5cc`）。
- 发布说明显著提示：`BETTER_AUTH_SECRET` 生产语义收紧（缺 secret/占位值拒绝服务、轮换后 session 全部失效）；
  回滚只需换回 `0.1.0-beta.48` 镜像，无迁移；回滚后暂停状态会被旧版忽略、投递立即恢复。

### 下一轮优先项

1. **Q-51（27）** 共享 `useOperationalNow(30s)` 修复时间冻结（抑制状态/排序/确认文案/跨天重试）。
2. **NEW-AE（27）** 事件详情加急呼叫结果；**NEW-W（27）** 中文输入法组合期间不提交搜索；**NEW-AB（27）** 主题切换。
3. 轮转车道 **`architecture`**；SEC-22/25/26 交 EXPERT_PANEL。
4. Q-52/Q-53/Q-54 低成本测试补齐。

## 2026-10-22（第 63 轮）

- 时间：2026-10-22 03:42 – 04:3x CST。
- 基线：本轮开始时 `origin/main` @ `c1f41ce`；main CI success；无 open PR。
- 类型：**需求切片 + 安全加固**（非 full-audit）。backlog 有多个 ≥27 候选，按第 1.5 步继续。
- 全量审计时间戳：第 1 轮（2026-10-18 13:30 CST，未变）。
- 车道：`requirements` + `ui-triage` 必跑；第三名额给轮转车道 **`security-exposure`**（第 62 轮记录的下一车道）。
- 车道轮转位置：**`quality`**（下一轮非必跑车道）。
- `ui-triage`：**`defer`** —— 距上次真实浏览器评审（2026-10-22 03:10）仅 32 分钟；自那以来唯一 UI 路径提交
  是评审自身的修复 `261416a`（已浏览器复验）；未解决 UI 候选 18 条属稳定存量（重评阈值 >20）。
- `last_ui_review_at`：**2026-10-22 03:10 CST**（未变；本轮未做 UI 评审）。
- 工作树：`agent-iteration` 仅用于并发锁与基线；实现、验证在会话工作树
  `vibrant-cohen-1d0fce`。工作树已清理（删除 `agent-iteration`、会话工作树 `node_modules`，
  并删除已合并的本地 agent 分支）。

### 本轮交付

- PR #307 `fix(operations): keep the date on cross-day retry timestamps`（NEW-V，rebase 合并 `40cefe5`）。
  - 新增共享 `RetryTimestamp`，按控制台时区与 `useNow()` 选择 `time`/`dateTime`；投递列表、加急记录表、
    事件详情投递表统一消费；表头「下次 / Next」→「下次重试 / Next retry」。
  - `AppIntlProvider` 新增可选 `now`，让依赖「今天」的渲染可确定性测试。
  - 新增 `retry-timestamp.test.tsx`、`deliveries-table-next-retry.test.tsx`，扩充加急表用例；
    PRD `docs/prd/retry-timestamp-cross-day.md`。
  - 验证：`vp check` 0 errors；`vp run -r test` 152 files / 813 tests；`vp run -r build` 通过。
- PR #308 `fix(core): redact provider-prefixed cloud credential keys`（SEC-28 + SEC-29，rebase 合并 `cdccbe0`）。
  - `SENSITIVE_EXACT_KEYS` 增加 `awssecretaccesskey`/`storageaccountkey`/`sharedaccesskey`/
    `storageconnectionstring`/`databaseconnectionstring`，键名与自由文本赋值两条路径同时生效；
    `aws_access_key_id`、`account_key_id` 保持可见。
  - `server/runtime/dashboard-session.ts` 补 `@tanstack/react-start/server-only`。
  - 验证：core 91 项脱敏测试、全仓 813 项、`vp run -r build` 均通过。

### 专家发现

- `requirements`（4 条新候选，已写入 backlog）：
  - **NEW-AA（28）** 全局暂停出站投递（运维急停）：worker 无条件 claim（`delivery-worker.service.ts:47-62`），
    settings 无暂停位；全局静默会把排队投递终态丢弃（`delivery.repository.ts:252-284`）。无迁移，单轮可交付，
    **本轮最推荐**（已被本轮的 NEW-V 占用主切片名额，下一轮优先）。
  - **NEW-AB（27）** 主题切换：深色 token 已定义（`styles.css:8,55`）但从未启用（`__root.tsx:44`）。
  - **NEW-AC（26）** 目标级请求超时：全局单一超时（`env.ts:23-28`、`container.ts:193`），目标 schema 无字段。
  - **NEW-AD（21）** Owner 管理本地成员账号：角色已声明但拒绝创建（`auth-owner-bootstrap.ts:21-29`），
    L 成本，需 EXPERT_PANEL。
- `security-exposure`：
  - **SEC-27（HIGH，27）** `docker-compose.yml:13,17` 在 production 下用仓库公开的 `BETTER_AUTH_SECRET`
    默认值启动，`auth-config.ts:3-4,67-80` 黑名单未覆盖；修复需改为 fail-fast，**交 EXPERT_PANEL**。
  - **SEC-28（MEDIUM，25，已修）** 带前缀云凭据键（`aws_secret_access_key` 等）绕过脱敏。
  - **SEC-29（LOW，22，已修）** `dashboard-session.ts` 缺 server-only 标记。
  - 复核无回归：SEC-1 覆盖完整、SEC-24/SEC-2 已闭环；`node:*`/SQLite/`process.env` 边界标记齐全；
    全仓代码/脚本无 `xqvvu/vane` 失效引用。

### EXPERT_PANEL

- 本轮两个代码 PR 均为只读展示/脱敏加固，无 schema/迁移/投递/路由/auth 语义变更，按 AUTO_SHIP 交付。
- **SEC-27** 改变部署契约（缺 secret 时拒绝启动），登记为 EXPERT_PANEL 事项，下一轮由三位专家裁决。

### 发布决策

- 发布经理 / 阻断审计 / 回滚专家三人一致通过 `v0.1.0-beta.48`（PR #310）：
  自 beta.47 以来 2 个用户可见修复（#307 跨天重试时间、#308 云凭据键脱敏），其余为 docs(planning)；
  阻断审计 6/6 门槛通过（main CI `3c724df` success、无 open PR、近 5 次 main run 全绿、零迁移、
  tag 未占用、仅 REL-13 法律项持续挂起）；回滚风险 LOW，仅换回 beta.47 镜像即可，无需恢复数据库。
- tag：`v0.1.0-beta.48` → `3c724df`；GitHub Release 已创建（prerelease，正文非空）。
- 镜像：`registry.cn-hangzhou.aliyuncs.com/xqvvu/vane:0.1.0-beta.48`
  （linux/amd64 + linux/arm64，index digest `sha256:c28fca9c3db16a0fca1f446b98201ff9fa590dad8441eaa23aa69a462d1e26d9`）。

### 下一轮优先项

1. **NEW-AA（28）** 全局暂停出站投递（主切片首选，无迁移）。
2. **NEW-W（27）** 中文输入法组合期间不提交搜索；**NEW-AB（27）** 主题切换。
3. 轮转车道 **`quality`**；SEC-27 交 EXPERT_PANEL；SEC-22/25/26 待裁决。

## 2026-10-22（第 62 轮）

- 时间：2026-10-22 02:55 – 03:4x CST。
- 基线：本轮开始时 `origin/main` @ `09b9797`；main CI success；无 open PR。本轮合并后 main @ `edd431a`。
- 类型：**UI 评审主交付 + 小修复 + 需求发现 + 发布**（非 full-audit）。
- 全量审计时间戳：第 1 轮（2026-10-18 13:30 CST，未变）；backlog 有多个 ≥27 候选，按第 1.5 步继续。
- 车道：`requirements` + `ui-triage` 必跑；`ui-triage` 判定 **`review_now（限缩）`**，第三名额给 `ui-review`；
  轮转车道 `security-exposure` 未跑。
- 车道轮转位置：**`security-exposure`**（下一轮非必跑车道）。
- `ui-triage`：**`review_now（限缩）`** —— 自上次真实评审（2026-10-21 23:55）以来有 4 个 UI 路径提交
  （`3231470` 目标行静默、`4f8388d` 对话框重构、`a50469d` Settings 运行时面板、`9215d98` 移除未用变体），
  其中两个行为变化晚于上次评审；未解决 UI 候选 18 条；#295/#298 只有实现者桌面验证，缺 390px 复验。
  限缩到 `/settings` UI 标签与 `/destinations` 六操作列/静默流程。
- `last_ui_review_at`：**2026-10-22 03:10 CST**（本轮真实浏览器评审，隔离实例 6202 + 临时 SQLite，
  `admin@example.test`）。
- 工作树：`agent-iteration` 仅用于并发锁与基线；实现、验证在会话工作树
  `xenodochial-kirch-f16b53`。工作树已清理（删除 `agent-iteration` 与本会话 `node_modules`，
  并删除已合并的本地 agent 分支）。

### 本轮交付

- PR #302 `fix(operations): project destination kind into event detail deliveries`（Q-14，rebase 合并 `563ea03`）。
  - `getEventDetail` 补选 `destinations.kind`，`eventDetailDeliveryFromRow` 透传，core 类型补可选字段；
    `delivery-list-kind.test.ts` 新增走真实 SQL 的仓储断言。
  - 验证：`vp check` 0 errors；`vp run -r test` 802 tests；`vp run -r build` 通过。
- PR #303 `fix(settings): let the UI tab scroll on mobile`（UI-32，rebase 合并 `261416a`）。
  - `sm` 以下「界面」页签自身滚动（`overflow-y-auto`）、偏好表单 `flex-none`；桌面保持 `overflow-hidden` / `flex-1`。
  - 浏览器实测：移动端 `scrollTop` 0→587，保存按钮 y=783–811（视口 844）；1280×900 面板 747/747 与修复前一致。
  - 新增 `settings-layout.ts` + 结构回归测试、mini-PRD `docs/prd/settings-mobile-scroll.md`；
    150 files / 804 tests。
- 发布 `v0.1.0-beta.47`（PR #304，tag → `edd431a`，GitHub Release 已创建）：发布经理 / 阻断审计 /
  回滚专家三人一致通过；无迁移与配置变化，回滚镜像 `0.1.0-beta.46`。
  - 镜像：`registry.cn-hangzhou.aliyuncs.com/xqvvu/vane:0.1.0-beta.47`
    （linux/amd64 + linux/arm64，index digest `sha256:99087a4f…`）。

### 专家发现

- `requirements`（5 条新候选，均已写入 backlog）：
  - **NEW-V（28）** 投递列表「下次重试」跨天只显示 `HH:mm`（`deliveries-table.tsx:96-105`），
    事件详情已用 `retryTimestampFormat`（`event-detail-deliveries-table.tsx:78-87`）；加急记录同病
    （`delivery-pings-table.tsx:88-103`）；纯前端。
  - **NEW-W（27）** 中文输入法组合期间仍按 300ms 提交搜索草稿（`operation-filters.tsx:610-688`），
    拼音半成品会写入 URL 并发起查询。
  - **NEW-Y（27）** 事件级多目标投递时序视图；job 级时间字段已齐（`delivery.ts:19-35`、
    `operations.ts:89-96`），纯客户端派生，与 NEW-U 的 attempt 级边界区分。
  - **NEW-X（26）** 详情页按当前筛选顺序连续查看；详情路由无 `validateSearch`
    （`_dashboard.events_.$eventId.tsx:6-12`、`_dashboard.deliveries_.$deliveryId.tsx:6-12`），与 REQ-40 互补。
  - **NEW-Z（22，EXPERT_PANEL）** 手动重试的操作者与时间不可追溯（`operations.service.ts:72-74`、
    `operations/router.ts:37-40`），需 forward-only `0004`。
- `ui-review`（浏览器实测，隔离实例 6202 + 临时 SQLite）：
  - 新高危 **UI-32（27，已修）**：390×844 下 Settings UI 页签 `651/863` 且 `overflow: hidden`，
    滚轮/触摸 `scrollTop` 恒 0；偏好表单被压成 26px，保存按钮在屏幕外
    （`settings-page.tsx:31`、`settings-preferences-panel.tsx:74`）。
  - 复核 UI-23、UI-21 仍复现（不重复计分）；UI-22/30/31 未重复复现。
  - 已验证正常：运行时 12 项在 1280 为 4 列、390 为 1 列且无截断；目标行六操作在 1280 操作列 275px /
    按钮组 164px、390 横滑后亦无重叠；静默对话框预填目标与 2h 窗口，保存后 `/suppressions` 显示
    「通知目标: Ops Webhook Alpha」；Escape 关闭回焦、焦点陷阱 5 轮正常、无 console 错误。
- `security-exposure`：未跑（第三名额被 `ui-review` 占用），下一轮补。

### EXPERT_PANEL

- 本轮两个代码 PR 均为只读投影/布局，无 schema/迁移/投递/路由/auth 语义变更，按 AUTO_SHIP 交付。
- 新候选 **NEW-Z（22）** 涉及 forward-only 迁移与审计语义，标记 EXPERT_PANEL，实现前裁决。

### 发布决策

- 三人一致发布 `v0.1.0-beta.47`：自 beta.46 以来唯一用户可见变更为 Settings 移动端滚动修复（#303）；
  #302 为只读投影补齐。阻断审计 5/5 gate 通过（main CI `edd431a` success、无 open PR、无迁移、
  tag 未占用、仅 REL-13 法律项 blocked）；回滚专家判定 LOW，回滚只需换回 `0.1.0-beta.46` 镜像，
  无需恢复数据库。
- 镜像：`registry.cn-hangzhou.aliyuncs.com/xqvvu/vane:0.1.0-beta.47`（linux/amd64 + linux/arm64，
  index digest `sha256:99087a4f698ffbae587b305d5926b926f39ea69e1a495735790b0db48c48fffe`）。

### 下一轮优先项

1. **NEW-V（28）** 投递列表下次重试跨天显示日期；**NEW-W（27）** 中文输入法组合期间不提交。
2. **NEW-R（28）** 告警源断流预警（迁移部分先交 EXPERT_PANEL）；**NEW-S（27）** 加急呼叫全局审计页；
   **NEW-Y（27）** 事件级时序视图。
3. 轮转车道 **`security-exposure`**；UI-21（对话框关闭按钮本地化）。
4. Q-14 后续：事件详情投递表消费 `destinationKind` 渲染适配器图标。

## 2026-10-22（第 61 轮）

- 时间：2026-10-22 00:26 – 01:1x CST。
- 基线：本轮开始时 `origin/main` @ `3b9793a`；main CI success；无 open PR。
- 类型：**需求切片 + 文档修复**（非 full-audit）。最近全量审计仍为第 1 轮（2026-10-18 13:30 CST）；
  backlog 有多个 ≥27 候选，按第 1.5 步继续，不重跑全量审计。
- 车道：`requirements` + `ui-triage` 必跑；`ui-triage` 判定 **`defer`**，第三名额给轮转车道
  **`docs-drift`**（已连续两轮未跑）。三条车道均返回。
- 车道轮转位置：**`security-exposure`**（下一轮非必跑车道）。
- `ui-triage`：**`defer`** —— 距上次真实浏览器评审仅 32 分钟（2026-10-21 23:55 CST），
  自上次评审以来 UI 路径净新增未评审面 ≈ 0（2 个提交均为第 60 轮交付及其纯结构拆分），
  未解决 UI 候选 18 条属稳定基线；当前瓶颈是「修」而非「找」。重新评估触发条件：
  实质 UI 提交合入、满 48 小时、UI 候选突破 20 条，或出现无浏览器复验的 UI 修复。
- `last_ui_review_at`：**2026-10-21 23:55 CST**（未变；本轮未做 UI 评审）。
- 工作树：`agent-iteration` 仅用于并发锁与基线；实现、验证在会话工作树
  `lucid-noether-019a3d`。会话工作树 `node_modules` 再次残缺（`@rolldown/plugin-babel` 缺失），
  删除根与各 workspace 的 `node_modules` 后 `vp install --frozen-lockfile` 恢复（2.5s）。

### 本轮交付

- PR #298 `feat(settings): project runtime and effective limits`（rebase 合并），REQ-84 + REQ-216。
  - 新增只读 `settings.getRuntime` 白名单 DTO：版本、运行环境、Node、平台/架构、SQLite 驱动与版本、
    出站超时、Webhook 上限、worker 间隔/批量/超时回收、日志格式/级别。
  - 新增 `RuntimeInformationService`：显式依赖 store 的 `sqliteVersion`、生效限制与日志配置；
    每次调用从活动连接读取 SQLite 版本；逐字段组装，环境变量原文不进入返回值。
  - Settings 页 `UI` 标签新增「运行时与生效参数」只读网格；路由 loader 预取，配置刷新一并失效。
  - 新增中文 mini-PRD `docs/prd/settings-runtime-projection.md`；中英文各 14 个 i18n key。
  - 验证：`vp check` 0 errors（16 条存量 warning）；`vp run -r test` 149 files / 801 tests；
    `vp run -r build` 通过。
  - 浏览器实测（隔离实例 6199 + 临时 SQLite，`admin@example.test`，1280×900）：12 个字段全部渲染；
    `document` 1280/1280、`main` 1024/1024、面板 982/982，无横向溢出；时长显示 `10 s` / `5 s` / `5 min`。
    截图 `/tmp/tocsin-settings-runtime-1280-v2.png`。
- PR #299 `docs: correct stale release and PRD status claims`（本轮文档修复）。
  - 发布 checklist 的版本/tag 清单改为从仓库派生；RC checklist 的 E2E / Docker smoke gate 改为与
    同文一致（E2E 待接 CI、Docker smoke 本地人工）。
  - 七个已交付 mini-PRD 补状态头；post-MVP 剩余项、ADR 0003/0008、history-retention 行号同步。

### 专家发现

- `requirements`（4 条新候选，均已写入 backlog）：
  - **NEW-R（28）** 告警源断流预警：`SourceSummary` 无最近接收时间
    （`packages/core/src/source/source.ts:13-18`），`sources` 表无阈值（`schema.ts:39-50`），
    顶栏只有静默指示器（`dashboard-header.tsx:30-31`）；需 forward-only 迁移，迁移部分交 EXPERT_PANEL。
  - **NEW-S（27）** 加急呼叫全局审计页：pings 只能从单条投递详情查看
    （`oncall.repository.ts:228-238`、`delivery-pings-table.tsx:16-18`），无全局只读入口；数据字段已齐。
  - **NEW-T（27）** 运维关系选择器可搜索：筛选与表单全量平铺
    （`operation-filters.tsx:220-273`、`suppression-forms.tsx:523-565`、`route-forms.tsx:838-1029`）；
    复用 `combobox.tsx`，纯前端。
  - **NEW-U（26）** 投递尝试时间线与退避间隔：低于 27 门槛，作为低风险 follow-up
    （`delivery-attempts-table.tsx:37-45`、`delivery-diagnostics.ts:8-18`）。
- `docs-drift`（8 条，全部纯文档 AUTO_FIX）：
  - 高优先：`release-checklist.md:4,20,67-75,88` 版本/tag 冻结在 beta.35；`mvp-rc-checklist.md:199,205`
    与同文 `:21,107,130` 对 Docker smoke gate 自相矛盾；七个 mini-PRD 缺状态头
    （`suppression-scope-disclosure.md:10-14`、`evidence-bundle-download.md:9-10`、
    `queued-deliveries-before-disable.md:8` 等）。
  - 其余：`application-container.md:57` 的 `features/auth/router.ts` 应为 `session` 且工厂清单缺
    suppressions/replay/operations；`frontend-architecture.md:17-19,83,101-108,242,315-316` 目录树与
    procedure 写法过期；`post-mvp-planning.md:232-234` 剩余项与同文 `:97-99,143-144` 矛盾；
    `adr/0008:19-20`、`adr/0003:9`、`history-retention-and-snapshots.md:43,56,74` 版本/路径/行号漂移。
  - 本轮已修：release-checklist、RC checklist、七个 mini-PRD、post-mvp 剩余项、ADR 0008/0003、
    history-retention 行号。剩余 architecture 文档刷新（DOC-51/DOC-60/DOC-23）与
    `console-server-restructure-plan.md`（DOC-50 余项）仍留 backlog。
- 安全与发布基线复核：`xqvvu/vane` 仅作为真实 ACR 镜像坐标存在，无失效 GitHub 链接；
  `mvp-rc-checklist` 的 dedupe cleanup、provider fixture gate 仍准确；E2E 未接入 CI 属实。

### EXPERT_PANEL / 发布决策

- 本轮需求切片为只读新增过程与展示，无迁移、无 schema、无投递/路由/auth 语义变化，按 AUTO_SHIP 交付。
- NEW-R 的 `sources.silence_threshold_minutes` 迁移在后续实现前需 EXPERT_PANEL。
- 发布评估：发布经理 / 阻断审计 / 回滚专家三人一致通过，发布 `v0.1.0-beta.46`
  （tag → `0d3c78d`，GitHub Release 已创建）：自 beta.45 以来唯一用户可见变更为 Settings 运行时投影
  （#298）；无迁移、无环境变量/启动参数变化；回滚镜像 `0.1.0-beta.45`。
  - 镜像：`registry.cn-hangzhou.aliyuncs.com/xqvvu/vane:0.1.0-beta.46`
    （linux/amd64 + linux/arm64，index digest `sha256:9dbf9b17…`）。

### 下一轮优先项

1. **NEW-R（28）** 告警源断流预警；先交 EXPERT_PANEL 评估 forward-only 迁移。
2. **NEW-S（27）** 加急呼叫全局审计页；**NEW-T（27）** 可搜索关系选择器。
3. **Q-14（27）** 事件详情 `destinationKind` 补齐；**NEW-I（27）** 出站 `redirect: "manual"`。
4. 轮转车道 **`security-exposure`**；architecture 文档刷新（DOC-51/DOC-60/DOC-23）。
5. `last_ui_review_at` 未刷新；UI 评审下次由 `ui-triage` 按触发条件重新判断。

## 2026-10-21（第 60 轮）

- 时间：2026-10-21 23:26 – 2026-10-22 00:3x CST。
- 基线：本轮开始时 `origin/main` @ `5ccbae7`；main CI success；无 open PR。
- 类型：**非 full-audit**（backlog 有多个 ≥27 候选；最近全量审计仍为第 1 轮，backlog 未清空）。
- 全量审计时间戳：第 1 轮（未变）。
- 车道：`requirements` + `ui-triage` 必跑；`ui-triage` 判定 **`review_now（限缩）`**，第三名额给 `ui-review`。轮转车道 `docs-drift` 未跑。
- 车道轮转位置：**`docs-drift`**（下一轮非必跑车道；已连续两轮未跑）。
- `ui-triage`：**`review_now（限缩）`** —— 距上次真实浏览器评审 6h39m（未满 48h），但自 16:50 起命中 5 个 UI 提交 / 4 个 PR（≥3），backlog 未解决 UI 候选 16 条（≥2），且 #293 明确缺浏览器复验；限缩到 `/deliveries` 与 `/events` @1280×900。
- `ui-review`：**已完成**（隔离实例 6200 + 临时 SQLite，`admin@example.test`）。
  - **UI-25 确认修复**：`/deliveries` 容器 982 / scrollWidth 982，「更新时间」右缘 1171 = 操作列左缘 1171（遮挡 0px）；`/events` 982 / 982，接收时间右缘 1161 = 操作列左缘 1161（0px）。
  - **Q-15 浏览器复现**：`/events?destinationKind=feishu` 返回全部 3 行、无 chip、筛选按钮无徽标。
  - 新发现 **UI-30**（操作列 `min-w-24` 在 `table-fixed` 下失效，实际 88.4px）与 **UI-31**（三个同名「重置筛选」），均已写入 backlog。
- `last_ui_review_at`：**2026-10-21 23:55 CST**（本轮真实浏览器评审）。
- 工作树：`agent-iteration` 仅用于并发锁与基线；实现、验证在会话工作树 `epic-tharp-f554df`。会话工作树 `node_modules` 缺 `@rolldown/plugin-babel`，删除根与各 workspace 的 `node_modules` 后 `vp install --frozen-lockfile` 恢复。

### 本轮交付

- PR #295 `feat(suppressions): silence one notification target from its row`（rebase 合并 `3231470` + `4107e32`），REQ-220。
  - 目标行新增「临时静默」动作（`IconTooltip` 包裹的盾牌图标），打开复用 `CreateSuppressionForm` 的对话框，预填 `matcher.destinationIds=[id]`、2 小时窗口与规则名；弹窗体只在打开时挂载（列表渲染不需要 query 上下文），`resetOnSubmit=false` 保证保存失败保留输入。
  - 新增中文 mini-PRD `docs/prd/destination-row-silence.md`；中英文各 10 个 i18n key。
  - 验证：`vp check` 0 errors；`vp run -r test` 148 files / 798 tests；`vp run -r build` 通过；浏览器实测创建成功（`/suppressions` 显示「通知目标: UI review webhook」、生效中），1280×900 下 6 个行操作未挤占其它列。
- 发布 `v0.1.0-beta.45`（PR #296，tag → `2cbc6cd`，GitHub Release 已创建）：发布经理 / 阻断审计 / 回滚专家一致通过；无迁移与配置变化，回滚镜像 `0.1.0-beta.44`。
  - 镜像：`registry.cn-hangzhou.aliyuncs.com/xqvvu/vane:0.1.0-beta.45`（linux/amd64 + linux/arm64，index digest `sha256:0603bcc6…`）。

### 专家发现

- `requirements`（复核三组仍成立 + 4 条新候选）：
  - **REQ-220（28）** 目标行临时静默 —— 本轮已交付。
  - **REQ-84 + REQ-216（合并 28）** Settings 只读运行时投影：`server/runtime/system-information.ts:10-32` 已采集版本/Node/SQLite，`apps/console/src/env.ts:23-40` 的运行参数未进入 Settings，契约只有 get/update（`packages/api/src/contract/settings.ts:10-17`）；白名单 DTO，绝不返回 env 原文。
  - **NEW-I（27）** 出站禁止自动跟随重定向：`packages/destinations/src/transport.ts:72-77` 未设 `redirect`，307 会重放签名 body；统一 `redirect: "manual"`。
  - **NEW-Q（26）** 静默命中时间口径（`suppression-hits-table.tsx:67-72` 用 `updatedAt`）；**NEW-N（25）** Token 轮换宽限期（`source.service.ts:66-71`，需迁移 + 鉴权，交 EXPERT_PANEL）；**NEW-P（24）** 投递耗时列；**NEW-O（23）** 最近测试持久化。
- `ui-review`：见上；UI-25 已验，Q-15 复现，UI-30/31 入 backlog。
- `docs-drift` 未跑（第三名额被 ui-review 占用），下一轮补。

### EXPERT_PANEL / 发布决策

- 发布小组三人一致：发布 `0.1.0-beta.45`（发布经理建议版本、阻断审计五项门槛全通过、回滚专家判定低风险）。无 schema/迁移/投递/auth 语义改动，本轮无需其他 EXPERT_PANEL。

### 下一轮优先项

1. **REQ-84 + REQ-216（28）** Settings 只读运行时投影（缺口最大、无迁移）。
2. **Q-14（27）** 事件详情 `destinationKind` 补齐；**Q-15（25）** `hasOperationFilters` 按 scope 过滤；**UI-30（22）** 操作列固定宽。
3. **NEW-I（27）** 出站 `redirect: "manual"`（安全增强，需四类适配器测试）。
4. 轮转车道 **`docs-drift`**（连续两轮未跑）。
5. `last_ui_review_at` 已刷新；UI 评审下次由 `ui-triage` 重新判断。

## 2026-10-21（第 59 轮）

- 时间：2026-10-21 21:38 – 23:2x CST。
- 基线：本轮开始时 `origin/main` @ `48833e4`；main CI success；无 open PR。
- 类型：**非 full-audit**（backlog 有多个 ≥27 分候选；最近全量审计仍为第 1 轮，但 backlog 未清空）。
- 车道：`requirements` + `ui-triage` 必跑；`ui-triage` 判定 **`review_now（限缩）`**，第三名额给轮转车道 **`quality`**，
  随后补发 `ui-review`（并发峰值 3）。
- 车道轮转位置：`quality` 已完成；下一轮非必跑车道为 **`docs-drift`**。
- `ui-triage`：**`review_now（限缩）`** —— 距上次真实浏览器评审 2h15m（未满 48h）、UI 合并只有 #289 一个；
  但 #289 的内联重置漏 `destinationKind` 是真实交互回归，且存量 UI 发现 ≥2，故限缩评审范围到
  `/deliveries` 筛选 Popover 与 1280px 表格遮挡。
- `ui-review`：**本轮未产出**。只读浏览器评审 subagent 运行约 95 分钟未返回，已停止以控制配额；
  UI-25 的证据沿用第 57 轮实测（容器 982 / 内容 1100、遮挡 118px）。本轮的表格修复因此只有
  测试级验证，**没有新的浏览器复验**，下一轮应补一次 1280×900 实测。
- `last_ui_review_at`：2026-10-21 16:50 CST（未变；本轮未完成新的浏览器评审）。
- 工作树：`agent-iteration` 仅用于并发锁与基线；实现、验证在会话工作树 `lucid-wu-ccc63f`。
  会话工作树 `node_modules` 再次残缺（`@rolldown/plugin-babel` 解析失败），删除根与各 workspace
  的 `node_modules` 后 `vp install --frozen-lockfile` 恢复。

### 本轮交付

- PR #292 `fix(operations): clear the destination kind filter from the inline reset`（rebase 合并 `6b1cd34`），FIX-15。
  - 内联「重置筛选」补 `destinationKind: ""`，与页级重置一致；新增 9 键全开的载荷断言。
  - 验证：`operation-filters.test.tsx` 12 passed；`vp check` 0 errors。
- PR #293 `fix(operations): fit events and deliveries tables in the 1280px viewport`（rebase 合并 `91c0eee`），UI-25。
  - Events `min-w-275` → `min-w-230`（920px）、Deliveries `min-w-320` → `min-w-240`（960px），
    落在 1280×900 侧栏展开时 982px 的表格视口内；新增 `operations-table-fit.test.ts` 固化 982px 基线。
  - 验证：`operations-table-fit.test.ts` 2 passed；`vp check` 0 errors（12 条存量 warning）。
  - **未做浏览器复验**：见上。

### 专家发现

- `requirements`（三项复核，均仍成立、均无需迁移）：
  - **REQ-220（28）** 目标行临时静默：`destination-actions.tsx:68-105` 无入口，matcher 已支持
    `destinationIds`（`suppression.ts:32-34`），表单支持目标多选与 `defaultValues`
    （`suppression-forms.tsx:368-377`、`:83,:96-104`）。注意：原描述的 30m/1h/4h/24h 快捷时长
    **并不存在**（`suppression-form.ts:125` 固定 2h），应并入 NEW-B，别重复计分。
  - **REQ-84 + REQ-216（合并 28）** Settings 只读运行时投影：`system-information.ts:12-33` 已有
    版本/Node/平台/SQLite 但只有启动日志消费；`env.ts:23-40` 的有效运行参数未进入 Settings；
    `contract/settings.ts:10-17` 只有 get/update。必须白名单投影，绝不返回原始 env。
  - **NEW-I（27）** 出站禁止自动跟随重定向：`transport.ts:73-77` 未设 `redirect`；所有出站路径经
    `Adapter.getTransportContext`（`utils.ts:99-107`）可集中注入 `redirect: "manual"`。
- `quality`（8 条中 5 条有效，均带 file:line）：
  - **FIX-15（MEDIUM）** 内联重置漏 `destinationKind` —— 本轮已修（#292）。
  - **Q-14（MEDIUM）** `EventDetailDelivery.destinationKind` 恒为 undefined：事件详情 SQL 未取
    `destinations.kind`（`history.repository.ts:176`），core 类型无此字段
    （`packages/core/src/operations.ts:89-92`）而 API schema 声明 optional
    （`packages/api/src/schemas/operations.ts:55`）；第 58 轮测试只手造对象喂 schema，未走仓储。
  - **Q-15（LOW）** `hasOperationFilters` 不分 scope（`operation-search.ts:82-94`），手工带
    `destinationKind` 访问 `/events` 会把空态误报成「筛选无匹配」。
  - **Q-16（LOW）** `httpStatusToRetryHint` 的 408/409/425 无任何用例（`utils.ts:46-52`）。
  - **REQ-221（LOW，语义待定）** kind 取实时 join（`history.repository.ts:250,315,507-512`），
    目标改类型会重分类历史投递；是否要快照列需产品判断。
- 已核实无新增缺口：kind 列表/total 共用谓词与非法值回退、抑制 `destinationIds` 边界、
  oRPC 形状约束均正常。

### EXPERT_PANEL

- 本轮两个切片均不触碰 schema/迁移/投递/路由/auth 语义，无需 panel。
- 仍登记：**SEC-26**、**SEC-11**；新增 **REQ-221** 若要做需要决定是否加 kind 快照列。

### 发布

- **本轮不发布**：超出单轮时间预算，未能完成 3 位专家的发布评估。本轮两个用户可见修复
  （#292、#293）留待下一轮评估 `0.1.0-beta.45`。

### 下一轮优先项

1. **REQ-220（28）** 目标行临时静默；**REQ-84 + REQ-216（28）** Settings 只读运行参数；
   **NEW-I（27）** 出站禁止自动跟随重定向。
2. **Q-14（27）** 事件详情 `destinationKind` 投影补齐或删除；**FIX-15 已修**。
3. **UI-25 浏览器复验**：1280×900 侧栏展开/收起各截一次；并确认 1024px 仍可横向滚动。
4. 下一轮轮转车道 **`docs-drift`**；`quality` 本轮已跑。
5. 发布评估：若下一轮有新用户可见变更，一并评估 beta.45。

## 2026-10-21（第 58 轮）

- 时间：2026-10-21 17:25 – 18:2x CST。
- 基线：本轮开始时 `origin/main` @ `0e3b006`（beta.43 记录之后）；main CI success；无 open PR。
- 类型：**非 full-audit**（backlog 有多个 ≥27 分候选；最近全量审计仍为第 1 轮，但 backlog 未清空）。
- 车道：`requirements` + `ui-triage` 必跑；`ui-triage` 判定 **`defer`**，第三名额给轮转车道 **`architecture`**。
- 车道轮转位置：`requirements` / `ui-triage` / `architecture` 均已完成；下一轮非必跑车道为 **`quality`**。
- `ui-triage`：**`defer`** —— 上次真实浏览器评审 16:50（仅 35 分钟前），此后 6 个合并中唯一触及 UI 的是
  UI-13 且已在 1280 实测；#278/#281 也已逐项验证；按「不定时」原则不重复消耗预算。
  下一轮最值得做的 UI 切片：UI-25（27）1280px sticky 操作列遮挡。
- `last_ui_review_at`：2026-10-21 16:50 CST（未变；本轮未做 UI 评审）。
- 工作树：`agent-iteration` 仅用于并发锁与基线；实现、验证在会话工作树
  `quizzical-thompson-b3c539`，镜像在 `/tmp/tocsin-build-beta44` 的 tag 干净检出中构建。
  本轮开始时会话工作树 `node_modules` 残缺（`vp check` 报 3592 errors、`@types/node` 缺失），
  按既有经验删除各 workspace 的 `node_modules` 后 `vp install --frozen-lockfile` 恢复。

### 本轮交付

- PR #289 `feat(operations): filter deliveries by destination kind`（rebase 合并 `d4b6d05`），REQ-206。
  - Deliveries URL 新增 `destinationKind`（`generic_webhook`/`feishu`/`slack`/`email`），非法值回退为全部类型。
  - 契约、service 透传；仓储列表与 `total` 共用 `EXISTS` 谓词，避免分页与总数漂移；
    筛选面板仅 Deliveries 作用域，含 chip 与重置。
  - 新增 PRD `docs/prd/delivery-kind-filter.md`；仓储 2 条、service 1 条、URL 模型 3 条、
    筛选面板 2 条断言。
  - 验证：`vp check` 0 errors（12 存量 warning）、`vp run -r test` 全绿（console 792 tests）、
    `vp run -r build` 通过。
  - **未做浏览器人工验证**：控件复用既有 Select 模式，组件测试覆盖作用域与 chip；
    未启动独立实例（既有 6190 dev server 属其他会话代码，不能验证本分支）。

### 专家发现

- `requirements`（代码已核实）：
  - REQ-206 证据成立且本轮已实现；REQ-220（表内 27 / 轮次注记 28 不一致）、NEW-I（27）、
    REQ-84 + REQ-216（28）证据仍成立（`destination-actions.tsx:68-105`、
    `suppression.ts:34,209,343-346`、`transport.ts:47-95`、`system-information.ts:10-32`、
    `routes/api/health.ts:5-11`）。
  - 新增 **NEW-K（26）** Settings 语言/时区变更对排队投递渲染的影响披露：worker 领取时才读取
    `presentation`（`delivery-worker.service.ts:63-64`），保存只 hard reload
    （`settings-preferences-panel.tsx:51-64`）。
  - 新增 **NEW-L（25）** 会话过期统一再登录与回跳：客户端 RPCLink 无 interceptor
    （`lib/orpc.ts:19-27`），长开页面只弹原始错误并丢失筛选。
  - 新增 **NEW-M（24）** 路由/静默标签 facet 补全：标签键值仍为自由文本
    （`route-forms.tsx:514-545`、`suppression-forms.tsx:635-704`）。
- `ui-triage`：`defer`，理由见上。
- `architecture`：
  - 第 57 轮改动无漂移：coverage 派生在 `features/sources/model/source-route-coverage.ts`，
    `redaction.ts` 保持中性，`request-context.ts:1-2` server-only 标记正确。
  - 存量证据复核仍成立：ARCH-5（`destination.service.ts:35,138,158,211,259,383`、
    `oncall.service.ts:7,59,73`）、ARCH-6（`routes/api/ready.ts:10,19,22,26`）、
    ARCH-30（`components/common/operations-table.tsx:56-79`）、
    ARCH-28（core `operations.ts:89-92` 缺 `destinationKind`，API schema 有）。
  - 新增 **ARCH-42（23）** `operations/router.ts:64-78` handler 内建 worker 并汇总健康；
    **ARCH-43（22）** `urgent-ping-explanation.test.ts:7` 直连 infra；
    **ARCH-44（20）** Sources 页用全量 routes/destinations 在浏览器算覆盖率
    （`sources-page.tsx:27-30`）。

### EXPERT_PANEL

- 本轮切片不触碰 schema/迁移/投递/路由/auth 语义，无需 panel。
- 仍登记下一轮：**SEC-26**（endpoint/webhook URL 掩码模型与「留空=保留」编辑语义）、
  **SEC-11**（任意认证头名脱敏 vs parser 需要）。

### 发布

- 三方评估一致 APPROVE（发布经理 / 阻断审计 / 运维回滚）：自 beta.43 有 1 个用户可见变更（#289），
  `d4b6d05` 与发版 commit `788a5b4` 的 main CI 均 success，无 open PR、无迁移/schema/锁文件变化，
  `v0.1.0-beta.44` 未被占用。
- 版本：`0.1.0-beta.44`；PR #290 `chore(release): v0.1.0-beta.44`（rebase 合并 `788a5b4`）；
  该 commit CI success。
- Tag：`v0.1.0-beta.44`（annotated，指向 `788a5b4`）；GitHub Release：
  `https://github.com/xqvvu/tocsin/releases/tag/v0.1.0-beta.44`（prerelease）。
- 镜像：`registry.cn-hangzhou.aliyuncs.com/xqvvu/vane:0.1.0-beta.44`
  - index digest `sha256:4dce90b03611c112630385b4a817f09c685a8d244a5dd45745d3f50304625022`
  - `linux/amd64` @ `sha256:58942c5d…`，`linux/arm64` @ `sha256:657d5f67…`
  - 构建参数：`--provenance=false --sbom=false`；未推 `latest`；回滚镜像 `0.1.0-beta.43`。
- 运维提示：本次仅新增只读筛选，无配置/数据变化；升级与回滚只需换镜像。

### 下一轮优先项

1. **REQ-220（28）** 目标行临时静默；**REQ-84 + REQ-216（28）** Settings 只读运行参数；
   **NEW-I（27）** 出站禁止自动跟随重定向。
2. **NEW-K（26）**、**NEW-L（25）**、**NEW-M（24）**。
3. **UI-25（27）** 1280px sticky 列遮挡；**UI-22（24）** 内联编辑重叠；
   **UI-26/27/28/29（21-22）**。
4. **SEC-26 + SEC-11** 交 EXPERT_PANEL；**SEC-20/21/22/25** 下一轮小 PR。
5. 下一轮轮转车道 **`quality`**；`architecture` 本轮已跑（ARCH-5/6/30/28 证据仍成立）。

## 2026-10-21（第 57 轮）

- 时间：2026-10-21 16:25 – 17:2x CST。
- 基线：本轮开始时 `origin/main` @ `9cadbf5`（beta.42 记录之后）；main CI success；无 open PR。
- 并发说明：`agent-iteration/.agent-run.lock` 是 15:17 的残留（本轮开始时 69 分钟），但所有会话
  `isRunning=false`，其持有会话 `zealous-golick-714ec2` 自 15:54 起空闲且未提交改动在独立
  `agent/ui-inline-edit-layout` 分支。按「无活跃轮次」判定继续，避开其 UI-22 文件，并在收尾清理锁。
- 类型：非 full-audit（backlog 有多个 ≥27 分候选；最近全量审计仍为第 1 轮，但 backlog 未清空）。
- 车道：`requirements` + `ui-triage` 必跑；`ui-triage` 判定 **`review_now`**，第三名额给
  `ui-review`（UI 评审成为主交付）；`security-exposure` 作为轮转车道补位（requirements 早于
  ui-review 返回，实际并发峰值 3）。
- 车道轮转位置：`requirements` / `ui-triage` / `ui-review` / `security-exposure` 均已完成；
  下一轮非必跑车道为 **`architecture`**（security-exposure 本轮已跑）。
- `ui-triage`：**`review_now`** —— 距上次评审 5h09m（未满 48h），但 #278（目标测试确认对话框）与
  #281（标题/消息一键静默）两个非测试 UI 合并都只有组件测试、无浏览器验证，且上一轮写明
  「再有 1 个非测试 UI 合并」即触发；14 条存量 UI 发现。首查：目标测试弹窗、事件文本静默弹窗。
- `last_ui_review_at`：**2026-10-21 16:50 CST**（本轮真实浏览器评审，隔离实例 6200 + 临时 SQLite）。
- 工作树：`agent-iteration` 仅用于并发锁与基线；实现、验证、浏览器复验均在会话工作树
  `quizzical-ramanujan-19fe45`。收尾删除 `node_modules`、`agent-iteration` 与已合入本地分支。

### 本轮交付

- PR #284 `fix(sources): surface partially blocked route coverage`（rebase 合并 `7fa9603` +
  `8035661`），UI-13。
  - 部分受阻时徽标显示「1/2 条可投递」/「1/2 can send」，不再只在 hover title 里可见。
  - 首版英文 `1/2 deliverable` 在 1280×900 实测溢出 9px（徽标 102px），已改短并复验无裁切。
  - 新增 PRD `docs/prd/source-partial-coverage-visibility.md`；2 条单元格测试 + 更新 1 条列表断言。
  - 浏览器实测：1280×900 中英文均无裁切；截图 `/tmp/tocsin-ui-r57/r57-after-partial-coverage-1280.png`、
    `/tmp/tocsin-ui-r57/r57-after-partial-coverage-zh-1280.png`。
- PR #285 `fix(core): widen redaction key coverage and mark request context server-only`
  （rebase 合并 `3338409`），SEC-13 + SEC-14 + SEC-24。
  - 精确键新增 `secretAccessKey`/`sessionKey`/`sessionId`/`pwd`/`pass`/`dsn`/`connectionString`/
    `accountKey`/`sharedKey`/`subscriptionKey`/`encryptionKey`/`masterKey`/`jwt`/`signature`/
    `X-Signature`；`dbPass`/`bypass`/`dsnName`/`signatureAlgorithm`/`privateKeyId` 保持可见。
  - `read-projection-redaction` 测试覆盖 `appSecret`/`clientSecret`/`apiSecret`/`privateKey`/
    `secretAccessKey`/`X-Auth-Token`。
  - `request-context.ts` 增加 `server-only` 标记，`vp run -r build` 验证 import protection 无客户端链路。

### 专家发现

- `requirements`（五项复核，均未实现）：
  - **REQ-206（28）** 投递按渠道类型筛选：证据仍成立（`packages/api/src/schemas/operations.ts:205-221`、
    `operation-search.ts:13-36`、`history.repository.ts:244` 只投影 kind、`operation-filters.tsx:330-355`）。
  - **REQ-220（28）** 目标行临时静默：`destination-actions.tsx:68-265` 无静默入口，matcher 已支持
    `destinationIds`（`suppression.ts:24-42,186-213`），纯前端可一轮。
  - **REQ-216（28）** Settings 生效运行参数：有效，建议**并入 REQ-84**，避免两个只读投影。
  - **REQ-217（27）** 队列积压年龄与 worker 停顿：有效，建议**并入 REQ-11**（吸收 REQ-169 展示部分）。
  - **REQ-211（27→25）** 历史载荷重解析预览：前提受脱敏限制（`intake.service.ts:81` 入库即脱敏），
    差异可能失真，降为 25。
  - 新增候选：**NEW-I（27）** 出站禁止自动跟随重定向（`transport.ts:56-95` 未设 `redirect`，
    307 会重放签名 body 与自定义头）；**NEW-J（24）** 429/503 遵守 Retry-After（暂缓）。
- `ui-triage`：review_now，理由与首查范围见上。
- `ui-review`（浏览器实测，6200 隔离实例）：
  - **UI-13（中）** 部分受阻只在 hover title 可见——本轮已修复（#284）。
  - **UI-25（高）** 1280px sticky 操作列遮挡最后一列：`/events` 容器 982/1100，接收时间列 118px 被压住；
    `/deliveries` 更新时间整列在视口外。
  - **UI-26（中，新）** 静默术语不一致：「按消息静默」vs 表单「内容包含」
    （`event-detail-summary.tsx:136`、`suppression-from-event-dialog.tsx:179` vs `zh-Hans.json:1054,1131`）。
  - **UI-27（低，新）** 目标测试弹窗历史事件加载中无提示（`destination-test-dialog.tsx:106,124-132`）。
  - **UI-28（低，新）** 测试弹窗样例只有「标题 · 告警源」，无时间上下文（`destination-test-dialog.tsx:55-64`）。
  - **UI-21 复现** 中文界面对话框关闭按钮可访问名仍为英文 `Close`（`dialog.tsx:63`）。
  - **UI-29（低，新）** 标题/消息静默图标按钮仅靠原生 `title`，与目标行 `IconTooltip` 不一致
    （`event-detail-summary.tsx:56,62`）。
  - 已验证正常：目标测试弹窗（默认样例、历史事件、发送中禁用、成功关闭、失败保留、390px 纵向堆叠）、
    文本静默弹窗（预填、脱敏禁用、Escape 焦点归还、390px 无横向溢出）。
- `security-exposure`：SEC-13 / SEC-20 / SEC-21 / SEC-22 / SEC-24 / SEC-25 / SEC-9 / SEC-14 / SEC-11
  均 VALID（含 file:line）；本轮取 SEC-13 + SEC-14 + SEC-24 交付（#285）。
  **SEC-26（MEDIUM）** webhook URL/endpoint 凭据进入浏览器 DTO 与 SSR，且被失败投递详情编辑入口放大；
  **SEC-11（MEDIUM）** 任意认证头名不脱敏；均需 EXPERT_PANEL。
  SEC-20（PEM 线性扫描）与 SEC-25（test/preview 载荷投影）留待下一轮小 PR。

### EXPERT_PANEL

- 本轮功能切片（UI-13）不触碰 schema/迁移/投递/路由/auth 语义，无需 panel。
- 登记下一轮 panel 议题：**SEC-26**（endpoint/webhook URL 掩码模型与「留空=保留」编辑语义）、
  **SEC-11**（任意认证头名 vs parser 需要）。

### 发布

- 发布评估三方专家一致 APPROVE（发布经理 / 阻断审计 / 运维回滚）：自 beta.42 有 3 个用户可见修复，
  main CI 绿，仅本轮的 docs PR 处于 open（豁免），无迁移/配置/启动变化，`v0.1.0-beta.43` 未被占用。
- 版本：`0.1.0-beta.43`；PR #287 `chore(release): v0.1.0-beta.43`（rebase 合并 `f82814b`）；该 commit CI success。
- Tag：`v0.1.0-beta.43`（annotated，指向 `f82814b`）；GitHub Release：
  `https://github.com/xqvvu/tocsin/releases/tag/v0.1.0-beta.43`（prerelease）。
- 镜像：`registry.cn-hangzhou.aliyuncs.com/xqvvu/vane:0.1.0-beta.43`
  - index digest `sha256:986db180b0f2186fcc46d9f87889a3af07f34f0b86214ea387693d73cd9771e4`
  - `linux/amd64` @ `sha256:8f5015b9…`，`linux/arm64` @ `sha256:781634b7…`
  - 构建参数：`--provenance=false --sbom=false`；未推 `latest`；回滚镜像 `0.1.0-beta.42`。
- 运维提示：展示/导出/日志会看到更多 `[REDACTED]`（`sessionId`/`jwt`/`signature` 等），存储不重写；
  回滚只需换回 `0.1.0-beta.42` 镜像。
- 携带项：SEC-26 / SEC-11 仍为已知 MEDIUM（下一轮 EXPERT_PANEL）；REL-13（LICENSE）保持
  `blocked-autonomous`，不阻断预发布。

### 下一轮优先项

1. **REQ-206（28）** 投递按渠道类型筛选；**REQ-220（28）** 目标行临时静默；
   **REQ-216（28，并入 REQ-84）** Settings 运行参数；**REQ-217（27，并入 REQ-11）** 队列积压年龄。
2. **UI-25（27）** 1280px sticky 列遮挡（本轮复测证据更具体）；**UI-26（新）** 静默术语统一；
   **UI-27/28/29（新，低）** 测试弹窗加载提示、样例时间上下文、图标按钮 tooltip；**UI-21** Close 本地化。
3. **SEC-26 / SEC-11** 交 EXPERT_PANEL；**SEC-20 / SEC-21 / SEC-22 / SEC-25** 下一轮小 PR。
4. **NEW-I（27）** 出站禁止自动跟随重定向（安全补丁候选，S）。
5. `architecture` 车道下一轮补跑（ARCH-1/2/5/6/27/28/29/30 待续）。

## 2026-10-21（第 56 轮）

- 时间：2026-10-21 14:20 – 15:2x CST。
- 基线：本轮开始时 `origin/main` @ `0e45bef`（第 55 轮 beta.41 记录之后）；main CI success。
- 触发说明：本轮为 13:25 计划的延迟触发（第 55 轮运行期间排队），与上一轮间隔约 5 分钟。
  为控制重复消耗，只跑必跑车道 + 轮转车道，未做全量审计。
- 类型：非 full-audit（backlog 有多个 ≥27 分候选、无 open PR）；最近全量审计仍为第 1 轮
  （2026-10-18 13:30 CST），但 backlog 未清空，按闸门继续消化候选。
- 车道：`requirements` + `ui-triage` 必跑；第三名额按第 55 轮记录给 `docs-drift`（补跑）。
- 车道轮转位置：`requirements` / `ui-triage` / `docs-drift` 均已完成；下一轮非必跑车道为
  **`security-exposure`**。
- `ui-triage`：**`defer`** —— 距上次评审约 3h（未满 48h）；自 11:54 起非测试 UI 合并 1 个
  （#278，有组件测试但无浏览器实测）；14 条存量 UI 发现零状态变化。下次自然触发：
  再有 1 个非测试 UI 合并、或 UI-18/22/25 任一修复合并、或 2026-10-23 11:54 CST。
  首查：目标「测试」确认对话框、UI-22、UI-18。
- `last_ui_review_at`：**2026-10-21 11:54 CST**（未变）。
- 工作树：`agent-iteration` 仅用于并发锁与基线；实现、验证、PR 在会话工作树
  `optimistic-napier-a12541`。本轮结束已清理 `agent-iteration` 工作树与会话工作树的
  `node_modules`。

### 本轮交付

- PR #281 `feat(events): silence similar alerts by title or message`（rebase 合并 `5cdc68a`），
  REQ-204（28）。
  - 新增 `suppressionDefaultsFromText`：预填 `sourceIds` + 单个 `titleContains` /
    `messageContains`，不触碰指纹。
  - `SuppressionFromEventDialog` 新增 `text` 形态；事件详情摘要标题/消息旁各加图标按钮。
  - 空文本或含 `[REDACTED]` 时禁用并说明原因，避免空匹配器被放大成「静默该告警源全部告警」。
  - 新增 PRD `docs/prd/event-text-silence.md`；新增 2 条模型测试 + 2 条摘要组件测试。
  - 验证：`vp check` 0 errors（12 条既有 warning）；`vp run -r test` 145 files / 784 tests；
    `vp run -r build` 通过；PR CI success。
  - 浏览器验证：未做（本机无 console dev server）；留待下次 UI 评审复验。

### 专家发现

- `requirements`（5 条新候选，已写入 backlog）：
  - **REQ-216（28）** Settings 生效运行参数只读视图（扩展 REQ-84）。
  - **REQ-217（27）** 投递队列积压年龄与 worker 停顿投影（扩展 REQ-11/169）。
  - **REQ-218（26）** 加急接收人预检与呼叫链路演练（演练步骤需 EXPERT_PANEL）。
  - **REQ-219（26）** 路由草稿变更影响预览（扩展 REQ-3）。
  - **REQ-220（27）** 通知目标行临时静默（扩展 REQ-81/61）。
- `docs-drift`（12 条，4 条 STALE-BACKLOG）：
  - 仍有效：DOC-6/23（application-container 与 frontend 树/工厂清单）、DOC-51（页面/
    feature 清单）、DOC-60（server 目录与 procedure 写法）、DOC-27/50（版本与旧路径）、
    DOC-43/45（README 能力与 Roadmap）、DOC-62（`better-auth.schema.ts` 文件名）、
    DOC-56（ADR 0003 的 `server/functions/`）、DOC-24（抑制 PRD 四→五状态与 AC）、
    DOC-40（模板引擎 AC）、DOC-47/59（post-MVP 投递缺口解释）、DOC-48/53/61（PRD 状态头）。
  - STALE-BACKLOG：DOC-33、DOC-37、DOC-39、DOC-46（原断言已被后续提交消除，建议关闭）。
  - `xqvvu/vane` 仅作为 ACR 镜像坐标保留，不是失效 GitHub 链接。
- 已核实 clean：main CI、无 open PR、无迁移改动、无 env/compose/Dockerfile 变化。

### EXPERT_PANEL

- 本轮功能切片无 EXPERT_PANEL 事项：REQ-204 为纯 UI + 预填模型复用，不触碰
  schema/迁移、投递/路由/auth 语义，不扩大 secret 暴露；空文本/脱敏禁用已覆盖。
- 发布评估三方专家：发布经理 APPROVE；阻断审计首次 REJECT（`5cdc68a` 的 main CI 尚在
  in_progress），待该 run success 后条件解除；运维/回滚 APPROVE（无迁移/配置变化）。
  最终三方一致通过。

### 发布

- 版本：`0.1.0-beta.42`；PR #282 `chore(release): v0.1.0-beta.42`（rebase 合并 `e7d2b53`）。
- Tag：`v0.1.0-beta.42`（annotated，指向 `e7d2b53`）；GitHub Release：
  `https://github.com/xqvvu/tocsin/releases/tag/v0.1.0-beta.42`（prerelease）。
- 镜像：`registry.cn-hangzhou.aliyuncs.com/xqvvu/vane:0.1.0-beta.42`
  - index digest `sha256:9a94158e74e47249c390cd6b985ab59814d1d86b7923a2b7624b3afe2fb7dca4`
  - `linux/amd64` @ `sha256:4a6c3883…`，`linux/arm64` @ `sha256:ddbbf220…`
  - 构建参数：`--provenance=false --sbom=false`；未推 `latest`；回滚镜像 `0.1.0-beta.41`。

### 下一轮优先项

1. **REQ-216（28）** Settings 生效运行参数只读视图；**REQ-206（28）** 投递按渠道类型筛选；
   **REQ-211（27，未做）** 历史载荷按当前解析器重解析预览；**REQ-217（27，新）** 队列积压年龄。
2. **REQ-220（27，新）** 目标行临时静默；**UI-25（27）** 1280 sticky 列遮挡；
   **UI-22（24）** 两页内联编辑重叠；**UI-18（24）** 390px 事件详情 Tabs 塌陷。
3. **DOC 批次**：DOC-6/23/51/60（架构树与 procedure 写法）、DOC-43/45（README）、
   DOC-24/27/40/47/48/50/53/56/59/61/62 可拆 2 个 `docs:` PR；DOC-33/37/39/46 关闭。
4. **FIX-4（20）** 三条 delete 回归测试；**SEC-13/SEC-20/SEC-21/SEC-25** 合并为一个小
   AUTO_FIX PR。
5. 车道轮转：下一轮非必跑车道 **`security-exposure`**；`requirements` / `ui-triage` 必跑。

## 2026-10-21（第 55 轮）

- 时间：2026-10-21 13:17 – 14:4x CST。
- 基线：本轮开始时 `origin/main` @ `c6afe17`（第 54 轮清理记录之后）；main CI success。
- 类型：非 full-audit（backlog 有多个 ≥27 分候选、无 open PR）；最近全量审计仍为第 1 轮
  （2026-10-18 13:30 CST），但 backlog 未清空，按闸门继续消化候选。
- 车道：`requirements` + `ui-triage` 必跑；第三名额按第 54 轮记录给 `docs-drift`。
  `docs-drift` 运行 30+ 分钟未返回，按预算终止，留待下一轮补跑。
- 车道轮转位置：`requirements` / `ui-triage` 已完成；`docs-drift` **未完成**，
  下一轮非必跑车道仍为 **`docs-drift`**。
- `ui-triage`：**`defer`** —— 距上次评审 1h24m（未满 48h）；自 11:54 起非测试 UI 合并
  仅 1 个（#272，且已有浏览器实测）；14 条存量 UI 发现均来自刚过去的评审，状态未变化。
  强信号均不成立。下次自然触发：再有 2 个非测试 UI 合并、或 UI-18/22/25 修复合并、
  或 2026-10-23 11:54 CST。首查顺序 UI-18 → UI-25 → UI-22。
- `last_ui_review_at`：**2026-10-21 11:54 CST**（未变）。
- 工作树：`agent-iteration` 仅用于并发锁与基线；实现、验证、PR 在会话工作树
  `exciting-swirles-9be772`。本轮结束已清理 `agent-iteration` 工作树与会话工作树的
  `node_modules`。

### 本轮交付

- PR #278 `feat(destinations): test sends with a historical event sample`（rebase 合并
  `a7c1386`），REQ-203（28）。
  - `TestDestinationCommand` 新增可选 `sampleEventId`；服务复用 `resolvePreviewSample`，
    历史事件模式下使用真实归一化字段、告警源、事件 ID 与已脱敏 raw payload，并传入
    控制台 locale/timeZone；不传时保持内置样例行为。
  - 「测试」动作改为确认对话框（样例选择器：内置样例 / 最近历史事件）；成功后沿用
    toast 并关闭，失败保持打开以便重试。
  - 新增 PRD `docs/prd/destination-test-historical-event.md`；新增 1 条服务集成测试
    （历史载荷、脱敏、presentation、事件不存在不发送）与 3 条对话框测试。
  - 验证：`vp check` 0 errors（12 条既有 warning，新增的 setState-in-effect warning
    已通过 `key` 重挂载消除）；`vp run -r test` 145 files / 780 tests；`vp run -r build`
    通过；PR CI success。
  - 浏览器验证：本机无可用 console dev server（仅 9244 端口无关进程），未做浏览器实测；
    对话框行为由组件测试覆盖，留待下次 UI 评审复验。

### 专家发现

- `requirements`（5 条新候选，已写入 backlog）：
  - **REQ-211（27）** 历史载荷按「当前解析器」重解析预览：只读 `previewEventReparse`，
    对照 stored/reparsed 差异；raw 已清理返回 unavailable（`event-replay.service.ts:129-132,171,208`、
    `history.repository.ts:214`）。
  - **REQ-212（25）** 上游 annotations 保留、展示与模板可引用；需 EXPERT_PANEL 评审
    normalized event 契约与脱敏边界（`normalized-event.ts:22-30`、`grafana/parse.ts:39-50`、
    `template.ts:23,107-140`）。
  - **REQ-213（26）** 多告警载荷的告警组逐条可见，标记用于规范化的那条；不 fan-out
    （`grafana/parse.ts:36-37,63`、`alertmanager-compatible.ts:35-36,63`）。
  - **REQ-214（26）** 事件按上游发生时间筛选（`timeBasis=received|occurred`）；
    `occurred_at` 已有列但未用于筛选（`schema.ts:73-74`、`history.repository.ts:104-106`）。
  - **REQ-215（25）** 可移植配置按对象导出并补齐依赖闭包
    （`config-portability.service.ts:70-91,140-240`）。
- `docs-drift`：超时未返回，无发现，留待下一轮。
- 已核实 clean：main CI、无 open PR、无迁移改动、Dockerfile 仅注释变化。

### EXPERT_PANEL

- 本轮功能切片无 EXPERT_PANEL 事项：REQ-203 为加法式契约字段 + 服务复用，不触碰
  schema/迁移、投递/路由/auth 语义，也不扩大 secret 暴露（历史载荷发送前已脱敏）。
- 发布评估三方专家一致 **APPROVE**：发布经理（用户可见变更 #278 + Nitro v2）、
  阻断审计（main CI success、无 open PR、零迁移、beta.41 未占用）、运维/回滚
  （Dockerfile 注释级变化、无 env/compose 变化、回滚仅换镜像）。专家要求发版前做
  Docker smoke；已在 Nitro v2 产物上实跑 `just docker-smoke` 通过（`/api/ready` 全绿，
  arm64 本机；amd64 仅构建未运行，见镜像验证）。

### 发布

- 版本：`0.1.0-beta.41`；PR #279 `chore(release): v0.1.0-beta.41`（rebase 合并 `3831a06`）。
- Tag：`v0.1.0-beta.41`（annotated，指向 `3831a06`）；GitHub Release：
  `https://github.com/xqvvu/tocsin/releases/tag/v0.1.0-beta.41`（prerelease）。
  Nitro 切换的 PR 号已在 Release note 中更正为 #276。
- 镜像：`registry.cn-hangzhou.aliyuncs.com/xqvvu/vane:0.1.0-beta.41`
  - index digest `sha256:750b38f3a48a6012b6f9f48ca5130319a53e2b1ec081d51f796ee502ad9aa813`
  - `linux/amd64` @ `sha256:6a766a29…`，`linux/arm64` @ `sha256:2c4dc836…`
  - 构建参数：`--provenance=false --sbom=false`；未推 `latest`；回滚镜像 `0.1.0-beta.40`。

### 下一轮优先项

1. **REQ-204（28）** 标题/消息一键静默（连续三轮推荐未做）；**REQ-206（28）** 投递按渠道
   类型筛选；**REQ-211（27，新）** 历史载荷重解析预览；**REQ-213/214（26，新）**。
2. **UI-25（27）** 1280 sticky 列遮挡；**UI-22（24）** 两页内联编辑重叠；
   **UI-18（24）** 390px 事件详情 Tabs 塌陷；**UI-13（26）**、**UI-21（22）**。
3. **FIX-4（20）** 三条 delete 回归测试；**SEC-13/SEC-20/SEC-21/SEC-25** 合并为一个小
   AUTO_FIX PR；**Q-50（24）** Destination/Route 仓储列级更新。
4. 车道轮转：下一轮非必跑车道 **`docs-drift`**（本轮超时未跑，优先补跑）；
   `requirements` 必跑。

## 2026-10-21（第 54 轮）

- 时间：2026-10-21 11:25 – 12:1x CST。
- 基线：本轮开始时 `origin/main` @ `56fef64`（第 53 轮清理记录之后）；main CI success。
- 类型：非 full-audit（backlog 有大量 ≥27 分候选、无 open PR）；最近全量审计仍为第 1 轮
  （2026-10-18 13:30 CST），已超过 6 小时，但 backlog 未清空，继续消化候选。
- 车道：`requirements` + `ui-triage` 必跑，第三名额按第 53 轮记录给 `security-exposure`；
  `ui-triage` 判定 `review_now` 后追加 `ui-review`（全程并发 ≤3）。
- 车道轮转位置：`requirements` / `ui-triage` / `security-exposure` / `ui-review` 均已完成；
  下一轮非必跑车道 **`docs-drift`**，`requirements` 仍需必跑。
- `ui-triage`：**`review_now`** —— 距上次评审 1h51m（未满 48h），但自 09:34 起非测试 UI
  合并达到 **3 个**（#261、#264、#267），其中 #267（投递排序）没有浏览器验证；第 51 轮
  留下的「sticky 列遮挡」待确认项已连续两轮顺延。强信号「≥3 UI 合并」成立，评审有增量价值。
- `last_ui_review_at`：**2026-10-21 11:54 CST**（已更新）。
- 工作树：`agent-iteration` 仅用于并发锁与基线；实现、验证、PR 在会话工作树
  `pensive-feynman-70c8a7`。本轮结束已清理 `agent-iteration` 工作树、本地已合并的
  agent 分支与会话工作树的 `node_modules`。

### 本轮交付

- PR #272 `feat(console): make event delivery errors and retry times readable`（UI-19，
  rebase 合并 `66062d4`）。
  - 事件详情投递表重新分配列宽：「最近错误」23%（1280 下实测 268px），错误最多两行，
    完整文本保留 `title`；新增纯函数 `retryTimestampFormat`（同日只显示时分、跨天显示日期，
    按配置时区判断）；表头改为「下次重试」/「Next retry」。
  - 新增 PRD `docs/prd/event-detail-delivery-readability.md`；新增同日/跨天/时区/非法值
    与错误文本断言。
  - 验证：`vp check` 0 errors（12 条既有 warning）、`vp run -r test` 144 files / 776 tests、
    `vp run -r build` 通过、PR CI success。
  - 浏览器实测（隔离实例 `localhost:6201` + 临时 SQLite，1280×900）：错误列 268px，
    502 错误全文可见；同日重试 `04:05`，2030 重试 `2030/01/01 00:00:00`；排序不变；
    窄视口横向滚动正常（`scrollWidth 776 / clientWidth 432`）。

### 专家发现

- `requirements`（5 条新候选，已写入 backlog）：
  - **REQ-206（28）** 投递按渠道类型筛选：`destinationKind` 已在 DTO 但只用于图标
    （`packages/core/src/operations.ts:106-111`、`delivery-target-cell.tsx:31-41`）；
    URL/仓储/计数均无该维度（`operation-search.ts:13-36`、`history.repository.ts:258-292,358-403`）。
  - **REQ-207（27）** 事件邻域绝对时间窗 + 「前后 15 分钟」入口，吸收 REQ-33；
    仓储只有 `since` 没有上界（`history.repository.ts:104-106`）。
  - **REQ-208（27）** 待重试队列视图：列表按 `created_at desc`，worker 按
    `coalesce(next_attempt_at, created_at)` 升序领取（`history.repository.ts:253-254` vs
    `delivery.repository.ts:238-240`），顺序不一致。
  - **REQ-209（26）** 失败分类落库与展示，升级 Q-6；适配器已返回 `errorKind`
    （`packages/destinations/src/types.ts:61-87`），仓储只写文本（`delivery.repository.ts:377-414`）。
  - **REQ-210（26）** 空结果时间窗诊断与一键放宽（`events-empty-state.tsx:29-43`）。
- `security-exposure`（8 条，均已合并进 backlog 既有 SEC 行或新增 SEC-26）：
  - MEDIUM **SEC-26（新）** 目标 webhook URL/endpoint 作为 bearer 凭据进入浏览器 DTO 与
    SSR loader data，与 `docs/architecture/frontend-architecture.md:350,431` 冲突。
  - MEDIUM **SEC-13 扩充**：`connectionString`/`accountKey`/`sharedKey`/`subscriptionKey`/
    `encryptionKey`/`masterKey`/`x-signature` 仍未命中 `isSensitiveKey`（`redaction.ts:13-37`）。
  - MEDIUM **SEC-20/SEC-11/SEC-23/SEC-22** 均复核仍成立（PEM 正文、任意认证头、
    provider fingerprint、endpoint userinfo）。
  - LOW **SEC-9/SEC-14/SEC-21/SEC-25** 复核仍成立，均为 S 级 AUTO_FIX。
  - 已核实 clean：TOML 导出主链路、日志 sink、Source token/tokenHash、Feishu appSecret、
    旧仓库名、import protection 主链路。
- `ui-review`（浏览器实测，1280×900 与 390×844，7 条）：
  - HIGH **UI-18** 390px 下事件详情 Tabs 只剩约 60px，投递表完全不可见且页面不可滚动。
  - MEDIUM **UI-22** 静默/路由内联编辑把表格压成 0 高，分页条压住表单标题（实测重叠
    15px / 3px）；**UI-25（新）** 1280 下 sticky 操作列遮挡「更新时间/最近错误」，
    `min-w-320`=1280px 大于带侧栏的容器宽度；**UI-23** 390px 行操作不可见；
    **UI-13** 部分阻断只存在于 hover；**UI-21** 关闭按钮仍为英文 `Close`。
  - 已核实正常：#267 排序（失败→运行中→待处理→成功→已抑制，同状态稳定）、空态、
    分页/筛选、表单校验、破坏性操作确认、i18n SRE 术语。

### EXPERT_PANEL

- 本轮无 EXPERT_PANEL 事项：UI-19 为纯前端渲染层改动，不触碰 schema、投递/路由/auth 语义。

### 发布评估与镜像

- 三方专家一致 `APPROVE`（#272 合入后）：
  - 发布经理：自 `v0.1.0-beta.39` 以来唯一用户可见变更为 `66062d4`（#272）；建议
    `0.1.0-beta.40`。
  - 阻断审计：main CI success、无其他 open PR、migration 零 diff、无阻塞回归、
    `v0.1.0-beta.40` 未占用。
  - 运维回滚：Dockerfile/compose/env/依赖/迁移全部零 diff；回滚只需换回
    `0.1.0-beta.39` 镜像，数据卷双向兼容。
- 版本：`0.1.0-beta.40`；PR #274 `chore(release): v0.1.0-beta.40`（rebase 合并 `e8c2c6f`）。
- Tag：`v0.1.0-beta.40`（annotated，指向 `e8c2c6f`）；GitHub Release：
  `https://github.com/xqvvu/tocsin/releases/tag/v0.1.0-beta.40`（prerelease）。
- 镜像：`registry.cn-hangzhou.aliyuncs.com/xqvvu/vane:0.1.0-beta.40`
  - index digest `sha256:6087bd63a158a30cd95f0201b081c6bc4d04c03de8b21a5b193c644ab9d5b5c7`
  - `linux/amd64` @ `sha256:a01a00a5…`，`linux/arm64` @ `sha256:d30c8f50…`
  - 构建参数：`--provenance=false --sbom=false`；未推 `latest`。
- 日志/backlog 的发布信息由后续 `docs(planning)` 小 PR 补充记录。

### 下一轮优先项

1. **REQ-203（28）** 目标测试发送选择真实历史事件（连续两轮推荐未做）；**REQ-204（28）**
   标题/消息一键静默；**REQ-206（28）** 投递按渠道类型筛选。
2. **UI-25（27，新）** 1280 sticky 列遮挡；**UI-22（24）** 两页内联编辑重叠（S）；
   **UI-18（24）** 390px 事件详情 Tabs 塌陷；**UI-13（26）**、**UI-21（22）**。
3. **SEC-13/SEC-20/SEC-21/SEC-25** 可合并为一个小 AUTO_FIX PR；
   **Q-50（24）** Destination/Route 仓储列级更新；**FIX-4（20）** 三条 delete 回归测试。
4. 车道轮转：下一轮非必跑车道 `docs-drift`；`requirements` 必跑。

## 2026-10-21（第 53 轮）

- 时间：2026-10-21 10:29 – 11:0x CST。
- 基线：本轮开始时 `origin/main` @ `86c7fb5`（第 52 轮 beta.38 记录之后）。
- 类型：非 full-audit（backlog 有大量 ≥27 分候选，且无 open PR）；最近全量审计仍为
  第 1 轮（2026-10-18 13:30 CST）。
- 车道：`requirements` + `ui-triage` 必跑，第三名额给 `quality`（第 52 轮记录的
  下一个非必跑车道）。
- 车道轮转位置：`requirements` / `ui-triage` / `quality` 均已完成；下一轮非必跑车道
  **`security-exposure`**（自更早轮次后未跑），`requirements` 仍需必跑。
- `ui-triage`：**`defer`** —— 距第 51 轮评审仅 57 分钟（未满 2 小时门槛）；自 09:34 起
  非测试 UI 合并 2 个（#261 是上轮评审修复产物、#264 已有浏览器实测），未达 3 个阈值；
  UI-22/UI-23 未修复；14 条 candidate 级 UI 发现属稳定基线。下次自然触发：≥11:34 后
  仍有 ≥1 个 UI 合并。建议下次评审首查 Delays/Events 表格 sticky 列遮挡与 UI-22/23 复验。
- `last_ui_review_at`：2026-10-21 09:34 CST（未变）。
- 工作树：`agent-iteration` 仅用于并发锁与基线；实现、验证、PR 在会话工作树
  `nostalgic-babbage-1d61a5`。本轮结束已清理 `agent-iteration` 工作树、本地已合并的
  agent 分支与会话工作树的 `node_modules`。

### 本轮交付

- PR #267 `feat(console): order event deliveries by operational priority`（REQ-199，
  rebase 合并 `217acfe`）。
  - 新增 `features/events/model/delivery-priority.ts`：共享「失败→运行中→待处理→成功→
    已抑制」优先级与稳定排序；事件详情投递表按此排序，同状态保持服务端 `created_at`
    升序，输入数组不被修改；摘要健康徽标改用同一常量。
  - 新增 PRD `docs/prd/event-delivery-priority-sort.md`；模型 3 条 + 组件 1 条测试。
  - 验证：`vp check` 0 errors（12 条既有 warning）、`vp run -r test` 143 files /
    768 tests、`vp run -r build` 通过、PR CI success。
- PR #268 `fix(console): stop source updates from rolling back token rotation`（Q-48）。
  - `SqliteSourceRepository.update` 改为只写调用方显式提供的列（`UpdateObject` 类型），
    不再用 `get` 快照整行写回；404 语义与返回 DTO 不变。
  - 新增 `source.repository.test.ts`：用子类在 `get` 返回后暂停制造「读-并发轮换-写」交错；
    已实测该测试在旧实现上失败（`expected 'old-hash' to be 'rotated-hash'`），修复后通过。
  - 验证：`vp check` 0 errors、`vp run -r test` 4/4 包通过、`vp run -r build` 通过。

### 专家发现

- `requirements`：
  - **REQ-203（28）** 测试发送固定使用合成事件（`destination.service.ts:153-194` →
    `createTestNormalizedEvent`），无法验证真实模板字段/消息格式；可复用 preview 的
    `resolvePreviewSample`（`:341-374`）与 `recentEventsQueryOptions()`；MVP 故事 24。
  - **REQ-204（28）** matcher 已支持 `titleContains`/`messageContains`
    （`suppression.ts:47-48,207-208`），完整表单也可编辑（`suppression-forms.tsx:414-425`），
    但事件详情一键静默只预填 fingerprint/标签（`suppression-from-event-dialog.tsx:24-40`）。
  - **REQ-205（27）** `operations.list` 同一 `q` 已同时返回事件与投递
    （`operations.service.ts:33-60`），但顶栏无搜索入口；建议与 NEW-D 合并为 `/search`。
- `quality`：
  - Q-48 已核实并交付（见上）；同族 **Q-50（24）**：destination/route 仓储整行读改写
    （`destination.repository.ts:77-99`、`route.repository.ts:82-105`）。
  - Q-49 已核实：`invalid_token` 日志只有 sourceId/reason/provider
    （`intake.service.ts:74-76,342-352`），建议只记录请求方 token 哈希前缀与
    「是否携带 token/provider secret header」布尔值，绝不记录 stored hash。
  - FIX-4 已核实：三条 delete 均有 `requireX` 守卫并抛 `RecordNotFoundError`
    （`source.repository.ts:112-116`、`destination.repository.ts:101-105`、
    `route.repository.ts:166-170`），只差 3 条回归测试（`configuration.integration.test.ts`）。
  - 新发现 **MEDIUM**：intake 在事务外读 Source/Route，并发删除会在 `recordEvent` 触发
    FK 约束 500（`intake.service.ts:62,91-104,108`；`connection.ts:27`），并可能接受已停用
    源的请求；修复成本 M。**LOW**：Feishu 配置解析失败时静默跳过紧急呼叫
    （`oncall.service.ts:139-145`），建议补 warn 日志（不含配置值）。
- `ui-triage`：`defer`，理由见上。

### EXPERT_PANEL

- 本轮无 EXPERT_PANEL 事项：REQ-199 为纯前端只读排序，Q-48 为仓储层列级更新，
  均不触碰 schema、投递/路由/auth 语义或 secret 处理。

### 发布评估与镜像

- 三方专家一致 `APPROVE`（#268 合入后）：
  - 发布经理：自 `v0.1.0-beta.38` 以来用户可见变更为 #267（REQ-199）与 #268（Q-48）；
    建议预发布递增 `0.1.0-beta.39`。
  - 阻断审计：main CI success、仅本轮自有 PR、migration 零 diff、无阻塞回归、
    `v0.1.0-beta.39` 未占用；REL-13（LICENSE）为长期法务项，不随本版新增风险。
  - 运维回滚：Dockerfile/compose/env/依赖/迁移全部零 diff；回滚只需换回
    `0.1.0-beta.38` 镜像，数据卷双向兼容。
- 版本：`0.1.0-beta.39`；PR #269 `chore(release): v0.1.0-beta.39`（rebase 合并
  `7f5eea1`）。
- Tag：`v0.1.0-beta.39`（annotated，指向 `7f5eea1`）；GitHub Release：
  `https://github.com/xqvvu/tocsin/releases/tag/v0.1.0-beta.39`（prerelease）。
- 镜像：`registry.cn-hangzhou.aliyuncs.com/xqvvu/vane:0.1.0-beta.39`
  - index digest `sha256:ca2cab500813da0f35f36e9aa3a9ae1906cfd54addb0576884fd539e6cdb77c9`
  - `linux/amd64` @ `sha256:e358b279…`，`linux/arm64` @ `sha256:60cc4a5a…`
  - 构建参数：`--provenance=false --sbom=false`；未推 `latest`。

### 下一轮优先项

1. **REQ-203（28）** 测试发送选择真实历史事件；**REQ-204（28）** 标题/消息一键静默。
2. **Q-50（24）** destination/route 仓储同族整行读改写；**FIX-4（20）** 三条 delete
   回归测试（AUTO_FIX）。
3. **REQ-181（27）** 级联删除数量、**REQ-182（27）** 测试发送确认、**REQ-200（27）**
   投递元数据标注、**REQ-205（27）** 跨实体搜索。
4. 车道轮转：下一轮非必跑车道 `security-exposure`；`requirements` 必跑。

## 2026-10-21（第 52 轮）

- 时间：2026-10-21 09:54 – 10:45 CST。
- 基线：本轮开始时 `origin/main` @ `e3b6dcf`（第 51 轮 beta.37 发布后）。
- 类型：非 full-audit（backlog 有多个 ≥27 分候选，且无 open PR）；最近全量审计仍为
  第 1 轮（2026-10-18 13:30 CST）。
- 车道：`requirements` + `ui-triage` 必跑，第三名额给 `architecture`（第 51 轮记录的
  下一个非必跑车道）。`requirements` 运行 33 分钟仍停在读取基线，按 30 分钟上限终止，
  本轮未产生新需求候选，留待下一轮。
- 车道轮转位置：`ui-triage` / `architecture` 已完成，`requirements` 未完成；下一轮非必跑
  车道为 `quality`，`requirements` 需重跑。
- `ui-triage`：**`defer`** —— 距第 51 轮评审仅 22 分钟，期间 UI 路径 0 个合并；14 条未解决
  UI 发现属稳定基线，重复评审不会产生新信息。下次触发：≥1 个非测试 UI 合并且距 09:34
  满 2 小时，或累计 ≥3 个 UI 合并，或 UI-22/UI-23 修复合并，或 48 小时兜底。
- `last_ui_review_at`：2026-10-21 09:34 CST（未变）。
- 工作树：`agent-iteration` 仅用于并发锁与基线；实现、验证、PR 在会话工作树
  `trusting-torvalds-9d8a18`。

### 本轮交付

- PR #264 `feat(console): load portable config from a file`（REQ-186，rebase 合并
  `5b5019a`）。
  - 设置页可移植配置页脚新增「从文件载入」，选择 `.toml`/`.json` 后读入当前草稿；
    不自动导入，仍需「应用导入」确认。
  - 超过 1 MiB 或空白文件拒绝且不改草稿；`readTextFile` 放入 `#/lib/browser`
    （`createClientOnlyFn`）。
  - 新增中英文案 4 条、PRD `docs/prd/settings-file-import.md`、hook 3 条 + 组件 1 条测试。
  - 浏览器实测（隔离实例 `localhost:6200` + 临时 SQLite）：TOML 页上传文件后编辑器内容
    更新；切回 UI 页保留期仍为 30（未应用文件中的 45）；1280x800 与窄屏布局正常。
  - 验证：`vp check` 0 errors（12 条既有 warning）、`vp run -r test` 142 files / 764 tests、
    `vp run -r build` 通过、PR CI success。
- 自查：`code-review` 低强度逐 hunk 复核，未发现缺陷。

### 专家发现

- `architecture`：
  - 复核 ARCH-5/6/27/28/30 全部仍成立（行号已更新）；ARCH-28 core/api DTO 漂移仍在
    （core `operations.ts:89-92` 无 `destinationKind`，API schema `schemas/operations.ts:51-57`
    有），成本 S。
  - ARCH-23 部分修复：`request-context.ts:91` 已尊重注入 container，默认 session 解析
    `:99-103` 仍固定 `getApplicationContainer()` 且无测试。
  - ARCH-33 部分修复：`destination-kind-badge.tsx` 已删除，`form-text-field.tsx` 仍零 importer。
  - 新增 **ARCH-41（20）**：Event/Delivery 详情 Tab 未进 URL（`event-detail-view.tsx:25-26`、
    `delivery-detail-view.tsx:24-25`，两个详情路由无 `validateSearch`）。
  - 未发现服务纯度、模块级单例、entrypoint 厚度、import 边界的新偏离。
- `requirements`：超时终止，无输出（留待下一轮）。
- `ui-triage`：`defer`，理由见上。

### EXPERT_PANEL

- 本轮无 EXPERT_PANEL 事项；REQ-186 为纯前端布局/交互切片，不触碰 schema、投递、路由或
  auth 语义。

### 发布评估与镜像

- 三方专家一致 `APPROVE`：
  - 发布经理：自 `v0.1.0-beta.37` 以来唯一用户可见变更为 #264（REQ-186），其余为规划文档；
    建议预发布递增 `0.1.0-beta.38`。
  - 阻断审计：5/5 PASS —— `647d21e` main CI success、0 open PR、migration 零 diff、
    无阻塞回归、`v0.1.0-beta.38` 未占用。
  - 运维回滚：Dockerfile/compose/env/依赖/迁移均零 diff；回滚只需换回 `0.1.0-beta.37` 镜像，
    数据卷双向兼容。
- 版本：`0.1.0-beta.38`；PR #265 `chore(release): v0.1.0-beta.38`（rebase 合并
  `894dc16`），合并后 main CI success。
- Tag：`v0.1.0-beta.38`（annotated，指向 `894dc16`）；GitHub Release：
  `https://github.com/xqvvu/tocsin/releases/tag/v0.1.0-beta.38`（prerelease）。
- 镜像：`registry.cn-hangzhou.aliyuncs.com/xqvvu/vane:0.1.0-beta.38`
  - index digest `sha256:7b1a0f3601a65b63a0500ca1d79ef0b23271da4c9fe180f2b9b52099702fb8f1`
  - `linux/amd64` @ `sha256:b39158f2…`，`linux/arm64` @ `sha256:041c2638…`
  - 构建参数：`--provenance=false --sbom=false`；未推 `latest`。

### 文档同步

- `obsidian-vault` skill 未通过 Skill 工具暴露；按 AGENTS.md 从 Obsidian 配置发现 vault 后
  手工同步（见本轮末尾）。

### 下一轮优先项

1. **REQ-199（28）** 事件详情投递表按操作优先级排序；**REQ-181（27）** 删除配置前
   事件/投递级联数；**REQ-182（27）** 目标测试发送前确认；**REQ-200（27）** 投递元数据
   标注当前配置。
2. **Q-48（27）** 告警源更新整行读-改-写并发回滚 `token_hash`（建议小切口 + 交错测试）。
3. **requirements 车道下一轮重跑**（本轮超时，未产生新候选）。
4. **ARCH-41（20）** 详情 Tab 进 URL；**ARCH-28（21）** core/api DTO parity 守卫
   （低成本 AUTO_FIX）。
5. 车道轮转：下一轮非必跑车道 `quality`；`requirements` 必跑。

## 2026-10-21（第 51 轮）

- 时间：2026-10-21 08:54 – 09:45 CST。
- 基线：本轮开始时 `origin/main` @ `15e2e16`（第 50 轮 beta.36 发布后）。
- 类型：非 full-audit（backlog 有多个 ≥27 分候选，且无 open PR）；最近全量审计仍为第 1 轮
  （2026-10-18 13:30 CST）。
- 车道：`requirements` + `ui-triage` 必跑；`ui-triage` 判定 **`review_now`**，第三名额给
  `ui-review`（真实浏览器）；`quality` 车道同时用于 FIX-12 的复现审计（4 条车道，最大并发 3）。
- 车道轮转位置：`requirements` / `ui-triage` / `quality` / `ui-review` 已完成；下一轮非必跑
  车道为 **`architecture`**（自第 38–39 轮后未跑）。
- `ui-triage`：**`review_now`** —— 距第 47 轮评审 5h09m（未满 48h），但自 03:47 起已有
  3 个非测试 UI 合并（#251 `8ba0f75`、#254 `c9df684`、#257 `d218cbd`），触发第 49/50 轮
  triage 自述的「≥3 UI 合并」阈值；且 backlog 仍有 14 条 candidate 级 UI 发现。
- `last_ui_review_at`：2026-10-21 09:34 CST（第 51 轮，含三轮浏览器复验）。
- 工作树：`agent-iteration` 仅用于并发锁与基线；实现、验证、PR 在会话工作树
  `pensive-dubinsky-924ece`。

### 本轮交付

- PR #260 `test(console): cover token rotation at the webhook boundary`（rebase 合并
  `2cab822`）：轮换 Token 后必须能通过真实 `WebhookIntakeService.acceptWebhook`，旧 Token
  必须 `invalid_token`；`vp check` 0 errors，60/60 用例通过，CI success。
- PR #261 `fix(console): keep destination dialog footer reachable`（UI-24）。
  - 根因有两层：目标编辑表单用扣除固定标题高度的 `max-h`，无法容纳 #257 插入的排队投递
    提示；仅改为 `flex-1` 后，弹窗外壳仍是自动高度，且 `EditDestinationForm` 的 `<section>`
    是块级包裹，`flex-1` 无法收缩。
  - 修复：编辑弹窗使用确定高度 `h-[min(760px,calc(100dvh-2rem))]`；dialog 模式下包裹
    `<section>` 改为 `flex min-h-0 flex-1 flex-col`；表单 `min-h-0 flex-1`；提示容器
    `shrink-0`；新增 2 条结构回归测试。
  - 浏览器实测（隔离实例 `localhost:6200` + 临时 SQLite，中文界面）：排队 3 条与 0 条、
    1280x900 与 390x844、新建弹窗、长表单内部滚动共 7 个组合全部 PASS；页脚按钮底部
    814/830（桌面）与 786/802（窄屏），`elementFromPoint` 命中；滚动区
    `clientHeight/scrollHeight = 573/979`（桌面）、`462/1496`（窄屏）。
  - 新增 PRD `docs/prd/destination-dialog-footer-visibility.md`。
- 验证：`vp fmt --write`、`vp check` 0 errors（12 条既有 warning）、`vp run -r test`
  141 files / 761 tests、`vp run -r build` 通过。

### 专家发现

- `quality`（FIX-12 复核）：**FIX-9 不是产品缺陷**。逐字比对两轮复现会话的原始命令，
  Token 前缀被手抄成 `toksin_src_`（第 50 轮）与 `totsin_src_`（第 49 轮），正确为
  `tocsin_src_`；DB `token_hash` 始终等于 `sha256(正确 Token)`，两轮用于对比的
  `printf` 输入都是正确拼写，因此从未哈希真正发送的字符串。轮换写入（`source.service.ts:66-74`）、
  仓储绑定（`source.repository.ts:97`）、哈希函数（`intake.service.ts:354-356`）、
  鉴权（`:363-379`）全部正确。已改为 FIX-12 并结案，补跨边界回归测试。
  - 新增 **Q-48（27）**：`SqliteSourceRepository.update` 整行读-改-写
    （`source.repository.ts:88-105`），并发时可能把 `token_hash` 回写成旧值。
  - 新增 **Q-49（22）**：`invalid_token` 日志无可诊断指纹（`intake.service.ts:74-77,342-352`），
    一字符拼写错误消耗了两轮专家时间。
- `requirements`：复核 REQ-181/182/186/194/195/199/200 七项全部仍有效（行号漂移已更新；
  REQ-181 描述收窄为只剩 Events/Deliveries 级联数）。新增 **REQ-201（27）** 顶栏提示
  scheduled 静默即将生效、**REQ-202（26）** 事件详情「接入快照 vs 当前规则」对照。
- `ui-review`：8 条发现，按影响排序 ——
  1. **UI-24（28，已修）** 有排队投递时目标编辑对话框页脚被裁出弹窗，保存/预览不可点。
  2. **UI-22（24）** 静默编辑面板与分页条重叠，**新发现路由页同样中招**
     （`routes-section.tsx:127-154`）；桌面重叠约 27px。
  3. **UI-23（24）** 390px 静默规则操作列在 x≈930，横滑后规则名滑出屏幕。
  4. **UI-21（22）** 对话框关闭按钮读屏仍为英文 `Close`（`dialog.tsx:63,97`、`sheet.tsx:68`）。
  5. **UI-13（26）** 部分阻断覆盖率仍只在 hover 标题里可见，无 `aria-label`。
  6. 投递抑制证据显示原始 UUID 而非告警源/目标名称与规则名（`delivery-suppression-checks.tsx:50-55`）。
  7. 原因快照为英文内部文本（既有 i18n 债务，不建议本切片处理）。
  8. `zh-Hans.json:740` 的 `Fingerprint` 与列表「告警指纹」不一致。
  - #257 复核：路由/目标/停用确认三处文案层级一致，0 条与 loading/失败静默；#251 的
    390px 启停/删除确认框可用、无回归；#254 徽标无横向溢出。
  - 冒烟：Deliveries 1280px「最近错误/更新时间」列超视口、Events「接收时间」被右侧操作列
    遮挡，疑似既有 sticky 列问题，留待下一轮 UI 评审确认。

### EXPERT_PANEL

- 本轮无 EXPERT_PANEL 事项；UI-24 为纯前端布局修复，不触碰 schema/投递/auth 语义。

### 发布评估与镜像

- 三方专家一致 `APPROVE`：
  - 发布经理：自 `v0.1.0-beta.36` 以来唯一用户可见变更为 #261（UI-24）；其余为测试与
    规划文档；建议预发布递增 `0.1.0-beta.37`。
  - 阻断审计：5/5 PASS —— `13c04f5` main CI success、0 open PR、无阻塞回归
    （FIX-12 已结案为非产品缺陷，Q-48 为既有风险）、migration 零 diff、
    `v0.1.0-beta.37` 未占用。
  - 运维回滚：Dockerfile/compose/env/依赖/迁移均零 diff；回滚只需换回 beta.36 镜像，
    `tocsin-data` 卷保持兼容。
- 版本：`0.1.0-beta.37`；PR #262 `chore(release): v0.1.0-beta.37`（rebase 合并
  `4a5cbd4`），合并后 main CI success。
- Tag：`v0.1.0-beta.37`（annotated，指向 `4a5cbd4`）；GitHub Release：
  `https://github.com/xqvvu/tocsin/releases/tag/v0.1.0-beta.37`（prerelease）。
- 镜像：`registry.cn-hangzhou.aliyuncs.com/xqvvu/vane:0.1.0-beta.37`
  - index digest `sha256:6192ca60ba4ff3636987238f7bba8a14aa5ec7e8dc50a790b664d811972cbc6d`
  - `linux/amd64` @ `sha256:facb870a…`，`linux/arm64` @ `sha256:9e3c96f7…`
  - 构建参数：`--provenance=false --sbom=false`；未推 `latest`。

### 文档同步

- `obsidian-vault` skill 仍不可用；按 AGENTS.md 从 Obsidian 配置发现 vault 后手工同步
  （见本轮末尾）。

### 下一轮优先项

1. **REQ-186（28）** 设置页从文件导入 TOML/JSON；**REQ-199（28）** 事件详情投递表按操作
   优先级排序；**REQ-181（27）** 删除配置前事件/投递级联数；**REQ-182（27）** 目标测试
   发送前确认。
2. **Q-48（27）** 告警源更新整行读-改-写并发回滚 `token_hash`（建议小切口修复 + 交错测试）。
3. **UI-22（24）** 静默/路由编辑面板与分页条重叠（两页同改）；**UI-23（24）** 390px
   行操作不可见；**UI-21（22）** 对话框 `Close` 本地化。
4. **REQ-201（27）** 顶栏 scheduled 静默即将生效；**REQ-202（26）** 事件快照 vs 当前规则。
5. 车道轮转：下一轮 `architecture`（ARCH-1/2/5/6/7/8/27/28/29/30）。

## 2026-10-21（第 50 轮）

- 时间：2026-10-21 07:48 – 08:46 CST。
- 基线：本轮开始时 `origin/main` @ `bf61ba9`（第 49 轮 beta.35 发布后）；需求合入后 @ `751a2d6`。
- 类型：非 full-audit（backlog 有多个 ≥27 分候选，且无 open PR）；最近全量审计仍为第 1 轮
  （2026-10-18 13:30 CST）。
- 车道：`requirements` + `ui-triage` 必跑；`ui-triage` 判定 `defer`，第三名额给轮转的
  `release-infra`。
- 车道轮转位置：`requirements` / `ui-triage` / `release-infra` 已完成；下一轮非必跑车道为
  **`quality`**（architecture 与 quality 自第 38–39 轮后未跑，quality 更久未覆盖）。
- `ui-triage`：**`defer`** —— 距第 47 轮真实浏览器评审（03:47）仅 4h04m；自 03:47 起 UI 路径
  2 个合并（#251、#254），均有浏览器实测；14 条存量 UI 发现均为已编目项；代码快览无新增不一致。
  复查时机：满 48h（2026-10-23 03:47）或 UI 合并累计 ≥3。
- `last_ui_review_at`：2026-10-21 03:47 CST（第 47 轮），本轮未做 UI 评审，不更新。
- 工作树：`agent-iteration` 仅用于并发锁与基线；实现、验证、PR 在会话工作树
  `recursing-clarke-8bb8c5`。

### 本轮交付

- PR #257 `feat(console): disclose queued delivery impact on config edits` —— **REQ-196（28）**。
  - `QueuedDeliveriesNotice` 增加 `description` 与 `hideWhenEmpty`；目标编辑对话框与路由
    内联编辑面板在排队投递 >0 时显示数量与影响说明；加载/失败/0 条不渲染，不阻断保存。
  - 新增 PRD `docs/prd/queued-delivery-config-impact.md`；中英文案各 2 条；新增 4 条通知测试、
    1 条路由测试、1 条对话框测试（共 756 tests）。
  - 验证：`vp check` 0 errors（12 条既有 warning）、`vp run -r test` 140 files / 756 tests、
    `vp run -r build` 通过、CI success、rebase 合并。
  - 浏览器实测（隔离实例 `http://localhost:6199` + 全新 SQLite，中文界面）：创建通知目标/
    路由/告警源并发送 `severity=critical` Webhook，产生 1 条待投递；目标编辑对话框显示
    「已排队的投递会在发送时读取这里保存的最新配置…」+「排队中的投递：1 条」；路由编辑面板
    显示「已排队的投递不会重新匹配路由…」+「排队中的投递：1 条」。截图
    `/tmp/tocsin-r50-queued-impact-route.png`；dev server 与临时库已清理。
  - 自查（code-review）：收紧两处「0 条时静默」测试，先等待计数查询实际执行再断言，
    避免查询未完成时断言提前通过（#257 第二个提交）。

### 专家发现

- `requirements`：复核 REQ-181/182/186/194/195/196/198 七项均仍成立（行号已更新）；新增
  2 条候选：REQ-199（28，事件详情投递表按操作优先级排序）、REQ-200（27，投递详情元数据
  标注为当前目标配置）。确认 REQ-4 已由 #184（= UI-2）交付但 backlog 仍标 candidate，
  本轮已改为 shipped；下一轮优先项列表里已交付的 REQ-193/UI-14 也已清理。
- `release-infra`：E2E 仍未接入 CI（远端只有 `ci.yml`）；REL-21/25/26/27/28、REL-19 均仍成立；
  RC checklist 4 条未勾 gate 均为真缺（dedupe 无界 DELETE、fixtures 目录缺失）。建议的
  `e2e.yml` 最小方案：PR + push main、`playwright install --with-deps chromium`、临时 SQLite、
  失败上传 trace、零 secrets；提交前必须本地跑通（本机缓存 chromium-1234，1.64.1 期望 1248）。
  本轮未实施，留给下一轮 release-infra 或独立小 PR。
- `ui-triage`：`defer`（理由见上）。

### 其他观察

- **FIX-9 再次复现并加强证据**：隔离实例通过 oRPC `sources.rotateToken` 取得新 Token，DB
  `token_hash` 与 `sha256(新Token)` 完全一致；重启 dev server 后 Webhook 仍返回 401
  `invalid_token`；改用 `sqlite3` 把 `token_hash` 直接改为 `sha256("test-token")` 后同一请求
  立即 202。读路径在直接改写后可工作，轮换写入为何未被接收仍需日志/测试定位。已更新 backlog。
- 浏览器验证期间发现：本地 `node_modules` 首次加载缺少 `@vitejs/plugin-react` 等符号链接，
  `vp install --frozen-lockfile --force` 后恢复；不影响仓库。

### EXPERT_PANEL

- 本轮无 EXPERT_PANEL 事项；#257 为纯前端只读投影，不触碰 schema/投递/auth 语义。

### 发布评估与镜像

- 三方专家一致 `APPROVE`：
  - 发布经理：自 `v0.1.0-beta.35` 以来唯一用户可见变更为 #257（REQ-196），其余为测试稳定性
    与规划文档；建议预发布递增 `0.1.0-beta.36`。
  - 阻断审计：6/6 PASS —— `751a2d6` main CI success、0 open PR、无阻塞回归（FIX-9 非本次
    引入且 beta.35 已带同样代码发布）、migration 零 diff、`v0.1.0-beta.36` 未占用、
    唯一 `blocked-autonomous`（REL-13 LICENSE）按惯例不阻断预发布。
  - 运维回滚：Dockerfile/compose/env/依赖/迁移均零 diff；回滚只需换回 beta.35 镜像，
    `tocsin-data` 卷保持兼容。
- 版本：`0.1.0-beta.36`；PR #258 `chore(release): v0.1.0-beta.36`（rebase 合并 `12559e4`），
  合并后 main CI success。
- Tag：`v0.1.0-beta.36`（annotated，指向 `12559e4`）；GitHub Release：
  `https://github.com/xqvvu/tocsin/releases/tag/v0.1.0-beta.36`（prerelease）。
- 镜像：`registry.cn-hangzhou.aliyuncs.com/xqvvu/vane:0.1.0-beta.36`
  - index digest `sha256:19f4811413b797e0b92aec62734d89d13cf357dddf3d6b11ea3813633543f35d`
  - `linux/amd64` @ `sha256:d9c42922…`，`linux/arm64` @ `sha256:d34ecdd8…`
  - 构建参数：`--provenance=false --sbom=false`；未推 `latest`。

### 文档同步

- `obsidian-vault` skill 在本会话不可用；按 AGENTS.md 从 Obsidian 配置发现 vault
  （`~/Library/Mobile Documents/iCloud~md~obsidian/Documents`），沿用既有 `Vane` 笔记风格
  手工同步：更新 `Vane Iteration Log`、`Vane Iteration Backlog`，新增
  `Vane Queued Delivery Config Impact` 并加入 `Vane Index`。

## 2026-10-21（第 49 轮）

- 时间：2026-10-21 06:36 – 08:05 CST。
- 基线：本轮开始时 `origin/main` @ `e7ba81c`（第 48 轮 beta.34 发布后）；需求合入后 @ `3e2de89`。
- 类型：非 full-audit（backlog 有多个 ≥27 分候选，且无 open PR）；最近全量审计仍为第 1 轮
  （2026-10-18 13:30 CST）。
- 车道：`requirements` + `ui-triage` 必跑；`ui-triage` 判定 `defer`，第三名额给轮转的
  `docs-drift`。
- 车道轮转位置：`requirements` / `ui-triage` / `docs-drift` 已完成；下一轮非必跑车道为
  **`release-infra`**（REL-2/4/7/9/21/25–28 均为 candidate，自第 47 轮未跑）。
- `ui-triage`：**`defer`** —— 距第 47 轮真实浏览器评审仅 2h53m；自 03:47 起 UI 路径仅 1 个
  合并（#251，已有浏览器实测），低于 ≥3 阈值；14 条存量 UI 发现均为上一轮编目；代码快览
  无新增不一致。复查时机：满 48h（2026-10-23 03:47）或 UI 合并累计 ≥3。
- `last_ui_review_at`：2026-10-21 03:47 CST（第 47 轮），本轮未做 UI 评审，不更新。
- 工作树：`agent-iteration` 仅用于并发锁与基线；实现、验证、PR 在会话工作树
  `recursing-yalow-aa5573`。

### 本轮交付

- PR #254 `feat(console): show per-condition suppression evidence on delivery detail` ——
  **REQ-193（28）**。
  - 新增 `DeliverySuppressionChecks`（`features/deliveries/ui/delivery-suppression-checks.tsx`）：
    规则仍存在时用 core `evaluateSuppressionMatch` 按当前规则重算，复用
    `RouteMatchCheckBadges` / `RouteMatchResultBadge`；标注「按当前规则重算」，当前规则不再
    匹配时提示「投递是在当时生效的规则下被抑制」。
  - 规则已删除不发起查询；查询失败/加载中不渲染，不影响原因快照与规则链接。
  - 新增 3 条中英文案 + 4 条组件测试；notice 测试补「规则存在才挂载证据、删除后不挂载」断言。
  - 新增 PRD `docs/prd/delivery-suppression-check-evidence.md`。
  - 验证：`vp fmt --write`、`vp check` 0 errors（12 条既有 warning）、
    `vp run -r test` 139 files / 751 tests、`vp run -r build` 通过、CI success、rebase 合并。
  - 浏览器实测（隔离实例 `http://localhost:6198` + 全新 SQLite，中文界面）：创建告警源/
    通知目标/路由/静默规则并发送 Webhook，产生 suppressed 投递；详情页显示
    「匹配条件（当前规则）」「命中」、8 项条件徽标（通知目标显示期望/实际）与重算说明。
    截图 `/tmp/tocsin-r49-suppression-checks.png`。dev server 已停止、临时库已删除。
  - 自查（code-review skill）：发现并修复 1 条 test-coverage 发现——notice 测试此前把新组件
    mock 成 null，挂载行被删也不会失败；已改为断言挂载/不挂载。

### 专家发现

- `requirements`：复核 REQ-181/182/186/193/194/195 六项均仍成立，仅行号漂移；新增 3 条候选：
  - REQ-196（28）配置编辑对已排队投递的实际影响披露
    （`delivery.repository.ts:323-325`、`delivery-execution.ts:82-100`、
    `destination-edit-dialog.tsx:112`、`routes-section.tsx:141-145`）。
  - REQ-197（27）静默规则创建/编辑披露对已排队投递的再判定
    （`delivery.repository.ts:248-291`、`suppression-forms.tsx:427`）。
  - REQ-198（26）投递列表直接展示静默原因与规则
    （`history.repository.ts:238-254`、`deliveries-table.tsx:87-90`）。
- `docs-drift`：16 条已核实漂移，新增 backlog DOC-59–DOC-62；最值得修的三组：
  - `post-mvp-planning.md:233-234` 剩余项与同文件 `:97,141-144` 自相矛盾；
  - `frontend-architecture.md:242-245,314-315` 服务目录与 `withDashboardService` 写法过期；
  - 七个已交付 mini-PRD 缺状态头 + `sqlite-store.md:369,483` 文件名拼写 +
    RC checklist provider guide gate。
- `ui-triage`：`defer`（理由见上）。

### 其他观察

- 浏览器验证时发现：轮换接入 Token 后立即用新 Token 调用 Webhook 连续返回 401
  `invalid_token`，而 DB `token_hash` 与 `sha256(新Token)` 一致；直接改写
  `token_hash=sha256("test-token")` 后同一请求立即成功。疑似 SQLite 读连接快照或轮换写入
  时机问题，未能在本轮定性，已记为 **FIX-9** 待 quality lane 用测试/日志复现。

### EXPERT_PANEL

- 本轮无 EXPERT_PANEL 事项；#254 为纯前端只读投影，不触碰 schema/投递/auth 语义。

### 发布评估与镜像

- 三方专家一致 APPROVE：
  - 发布经理：自 `v0.1.0-beta.34` 以来唯一用户可见变更为 #254（REQ-193），其余为 docs/test；
    建议预发布递增。
  - 阻断审计：5/5 PASS —— `3e2de89` main CI success、0 open PR、无阻塞回归
    （唯一 `blocked-autonomous` 为 REL-13 法律决策）、migration 零 diff、`v0.1.0-beta.35` 未占用。
  - 运维回滚：Dockerfile/compose/env/scripts/migrate 均零 diff；回滚只需换回 beta.34 镜像。
- 版本：`0.1.0-beta.35`；PR #255 `chore(release): v0.1.0-beta.35`（rebase 合并 `e86b49d`），
  main CI success。
- Tag：`v0.1.0-beta.35`（annotated，指向 `e86b49d`）；GitHub Release：
  https://github.com/xqvvu/tocsin/releases/tag/v0.1.0-beta.35
- 镜像：`registry.cn-hangzhou.aliyuncs.com/xqvvu/vane:0.1.0-beta.35` **已推送**，
  linux/amd64 + linux/arm64，index digest `sha256:1899a398…`（`imagetools inspect` 已核实双平台）。
- 回滚镜像：`0.1.0-beta.34`；本版本无迁移/配置变化。
- Obsidian 同步：本会话未提供 `obsidian-vault` skill，且第 43 轮已确认 vault 中无 Tocsin
  既有笔记，本轮**同步已跳过**。

### 下一轮优先项

1. **REQ-196（28）** 配置编辑排队影响；**REQ-186（28）** 文件导入；
   **REQ-181（27）** 删除级联数量；**REQ-182/194/195（27）**。
2. **SEC-22（27）** endpoint userinfo 投影；**FIX-9** 复现轮换 Token。
3. **UI-22（24）** 编辑面板与分页重叠；**UI-23（24）** 390px 行操作不可见；
   **UI-21（22）** `Close` 本地化。
4. 车道轮转：`requirements` + `ui-triage` 必跑；非必跑车道下一轮 **`release-infra`**。

## 2026-10-21（第 48 轮）

- 时间：2026-10-21 05:58 – 06:35 CST。
- 基线：本轮开始时 `origin/main` @ `5d2b41d`（main CI success，0 open agent PR）。
- 类型：非 full-audit（backlog 有多个 ≥27 分候选，且无 open PR）；最近全量审计仍为第 1 轮
  （2026-10-18 13:30 CST）。
- 车道：`requirements` + `ui-triage` 必跑；`ui-triage` 判定 `defer`，第三名额给轮转的
  `security-exposure`。
- 车道轮转位置：`requirements` / `ui-triage` / `security-exposure` 已完成；下一轮非必跑车道为
  **`docs-drift`**（自第 46 轮起两轮未跑）。
- `ui-triage`：**`defer`** —— 距第 47 轮真实浏览器评审仅 2h12m（远未满 48h）；自 03:47 起
  UI 路径合并 0 个（`git log --since` 只返回 `5d2b41d` 的 docs 改动）；15 条存量 UI 发现
  刚在第 47 轮逐一编目/复现，数量多是常态；留到 UI 路径再合并 ≥2–3 个或满 48h
  （2026-10-23 03:47）。
- `last_ui_review_at`：2026-10-21 03:47 CST（第 47 轮），本轮未做 UI 评审，不更新。
- 工作树：`agent-iteration` 仅用于并发锁与基线；实现、验证、PR 均在会话工作树
  `hopeful-mccarthy-199e97`。

### 本轮交付

- PR #251 `feat(console): confirm suppression toggles with delivery consequences` ——
  **UI-14（25）+ REQ-190（27）** 合并为一个连贯切片。
  - 静默规则行内启停改为 shadcn `AlertDialog` 确认，确认后才调用 `onToggle`；取消不改状态
    （`apps/console/src/features/suppressions/ui/suppressions-section.tsx`）。
  - 文案按 `suppressionStateAt` 投影：生效中 / 待开始 / 已结束；被关闭规则用
    `enabled: true` 投影时间窗，准确回答「启用后会不会生效」。生效中关闭 →
    立即停止生效并恢复发送（含自动电话提醒）；已结束启用 → 不会生效，提示先编辑结束时间。
  - 删除确认在规则当前生效时改用 `confirmDescriptionActive`，说明立即恢复发送；非生效
    状态保留原文案。
  - 新增 11 个 `suppressions.toggle.*` 键与 `suppressions.delete.confirmDescriptionActive`；
    新增 PRD `docs/prd/suppression-toggle-confirmation.md`；新增 7 条组件测试。
  - 验证：`vp fmt --check`、`vp check` 0 errors（12 条既有 warning）、
    `vp run -r test` 138 files / 747 tests、`vp run -r build` 通过。
  - 浏览器实测（隔离实例 `http://localhost:6197` + 全新 SQLite，中文界面）：创建全量静默
    规则 → 关闭确认显示「关闭后…立即停止生效，后续符合条件的告警会恢复发送通知，包括自动
    电话提醒」；取消后规则保持「已关闭」；启用确认文案正确；删除生效中规则显示恢复发送说明。
    截图 `/tmp/tocsin-r48-suppression-disable-confirm.png`、
    `/tmp/tocsin-r48-suppression-delete-active.png`。dev server 已停止、临时库已删除。

### 专家发现

- `requirements`：复核 REQ-190/181/182/186、SEC-22 均仍成立（REQ-190 行号已漂移，本轮已修）；
  REQ-55 已由 #230 实现，本轮标 shipped；新增 3 条候选：
  - REQ-193（28）投递详情展示静默判定逐项证据：PRD 承诺 checks
    （`docs/prd/alert-suppression.md:72,111-121`），core 已返回
    `SuppressionMatchResult.checks`（`packages/core/src/suppression/suppression.ts:165-170,186-218`），
    但 console 无消费者（`delivery-suppression-notice.tsx:18-65`、`delivery-detail-view.tsx:13-63`）。
  - REQ-194（27）Raw payload 保留天数 0 的语义与确认：0 合法但表示清理所有更早
    raw payload/headers（`intake.service.ts:428-430`、`intake.repository.ts:105-134`），
    UI 只写「0 到 3650 天」（`settings-preferences-panel.tsx:160-201`）。
  - REQ-195（27）新建通知目标后引导真实测试发送：创建成功即关闭对话框
    （`destination-add-dialog.tsx:79-93`），测试入口只有列表行图标。
  - 扫描结论：post-MVP 方向 4 与 RC 未勾 gate 均已被既有候选覆盖，无其他漏报。
- `security-exposure`：**未发现新问题**。核实：脱敏测试已按 destination registry kind
  参数化（`configuration.integration.test.ts:1363` 且 `:158-164` 断言与
  `DestinationKindSchema.options` 等价）；26 个 server-ish 模块 marker 齐全（唯一已知缺口
  `server/runtime/request-context.ts:1`，SEC-14）；Source/Destination/Feishu/Event/Delivery/
  Session DTO 均无秘密外泄；`xqvvu/vane` 仅剩 ACR 镜像坐标与历史日志。已知未闭合项：
  SEC-22（endpoint userinfo 密码进入 list/metadata/editor draft，`destination.helpers.ts:63,84,116,129,156`）、
  SEC-11、SEC-23、SEC-13、SEC-20、SEC-25、SEC-9、SEC-14。
- `ui-triage`：`defer`（理由见上）。

### EXPERT_PANEL

- 本轮无 EXPERT_PANEL 事项；#251 为纯前端只读投影，不触碰 schema/投递/auth 语义。

### 发布评估与镜像

- 三位专家（发布经理 / 阻断审计 / 运维回滚）一致 APPROVE：
  - 发布经理：自 `v0.1.0-beta.33` 以来 1 个用户可见 feat（#251），建议预发布号递增。
  - 阻断审计：6/6 PASS —— `c78acd7` 与 `fc36f48` main CI success、0 open PR、无阻塞回归、
    migration 零 diff、`v0.1.0-beta.34` 未占用、依赖锁零 diff。
  - 运维回滚：Dockerfile/compose/env/runtime/SQLite 均零 diff；回滚只需换回旧镜像。
- 版本：`0.1.0-beta.34`；PR #252 `chore(release): v0.1.0-beta.34`（rebase 合并 `fc36f48`），
  main CI success。
- Tag：`v0.1.0-beta.34`（annotated，指向 `fc36f48`）；GitHub Release：
  https://github.com/xqvvu/tocsin/releases/tag/v0.1.0-beta.34
- 镜像：`registry.cn-hangzhou.aliyuncs.com/xqvvu/vane:0.1.0-beta.34` **已推送**，
  linux/amd64 + linux/arm64，index digest `sha256:69b479ab…`（`imagetools inspect` 已核实双平台）。
- 回滚镜像：`0.1.0-beta.33`；本版本无迁移/配置变化。

### 下一轮优先项

1. **REQ-193（28）** 投递详情静默判定逐项证据；**REQ-181（27）** 删除配置前事件/投递级联
   数量；**REQ-182（27）** 目标测试发送前确认；**REQ-186（28）** 文件导入；**REQ-194/195（27）**。
2. **SEC-22（27）** endpoint userinfo 投影（security lane 首推，覆盖 operational config 与
   editor draft，发送路径保持原值）；**SEC-13/SEC-24/SEC-25** 测试与精确键加固。
3. **UI-22（24）** 编辑面板与分页重叠；**UI-23（24）** 390px 行操作不可见；
   **UI-21（22）** `Close` 本地化。
4. 车道轮转：`requirements` + `ui-triage` 必跑；非必跑车道下一轮 **`docs-drift`**。

## 2026-10-21（第 47 轮）

- 时间：2026-10-21 03:26 – 04:00 CST。
- 基线：本轮开始时 `origin/main` @ `7f5139c`；需求合入后 @ `9f1784d`；发布后 @ `1a38599`。
- 类型：非 full-audit（backlog 有多个 ≥27 分候选，且无 open PR）；最近全量审计仍为第 1 轮
  （2026-10-18 13:30 CST）。
- 车道：`requirements` + `ui-triage` 必跑；`ui-triage` 判定 `review_now`，第三名额给
  `ui-review`；`ui-triage` 返回后补跑第 46 轮预承诺的 `release-infra`（并发峰值仍为 3）。
- 车道轮转位置：`requirements` / `ui-triage` / `release-infra` / `ui-review` 已完成；
  下一轮非必跑车道为 **`security-exposure`**（自第 45 轮起两轮未跑）。
- `ui-triage`：**`review_now`** —— 自 01:00 CST 真实浏览器评审以来 UI 路径合并 3 个
  （`b6b9dc6`、`f028db4`、`7e39424`），达到 ≥3 强信号；13 条未解决 UI 发现；第 46 轮两个
  UI 合并无浏览器验证记录；48h 信号未中但其余强信号成立。
- `last_ui_review_at`：2026-10-21 03:47 CST（第 47 轮完整浏览器评审）。
- 工作树：`agent-iteration` 仅用于并发锁与基线；实现、验证、PR、镜像构建均在会话工作树
  `sleepy-ptolemy-23b503`。

### 本轮交付

- PR #248 `feat(console): show queued deliveries before disabling config` —— **REQ-185（29）**。
  - 新增 `pendingDeliveriesQueryOptions(scope)`：复用 `operations.list`
    的 `deliveryState=pending` + `sourceId|routeId|destinationId`，读 `deliveries.total`，
    `limit: 1`、`staleTime: 15s`（`features/operations/api/operations.queries.ts`）。
  - 新增 `QueuedDeliveriesNotice`：确认框打开时才挂载查询；加载/失败不渲染、不阻塞；
    `aria-live="polite"`（`features/operations/ui/queued-deliveries-notice.tsx`）。
  - 告警源/路由/通知目标三个停用确认框显示「排队中的投递：N 条」；中英文 ICU 0/1/N 复数。
  - 新增 PRD `docs/prd/queued-deliveries-before-disable.md`；4 条组件测试覆盖 0/1/N/失败；
    三个列表页测试以 mock 隔离计数组件。
  - 验证：`vp fmt --write`、`vp check` 0 errors（12 条既有 warning）、
    `vp run -r test` 137 files / 740 tests、`vp run -r build` 通过；CI success；rebase 合并。
  - 浏览器实测（隔离实例 `http://localhost:6196` + 全新 SQLite，中文界面）：创建告警源/
    通知目标/路由并发送真实 Webhook 产生 1 条 pending 投递；三个确认框均显示「1 条」；
    新建无事件告警源显示「0 条」，证明按 id 作用域过滤。截图
    `/tmp/tocsin-r47-{source,route,destination}-disable.png`、`/tmp/tocsin-r47-source-disable-zero.png`。
    dev server 已停止、临时库已删除。
- PR #249 `chore(release): v0.1.0-beta.33`（rebase 合并 `1a38599`），发布见下。

### 专家发现

- `requirements`：复核 REQ-185/186/181/182 均仍准确；新增 3 条候选：
  - REQ-190（27）删除静默规则前的恢复影响确认（`suppressions-section.tsx:340-359`、
    `zh-Hans.json:995`、`packages/core/src/suppression.ts:79-96`）。
  - REQ-191（22）补发指定目标与显式重发（语义变更需 EXPERT_PANEL）。
  - REQ-192（22）列表查询失败的就地重试（`events-page.tsx:33`、`_dashboard.tsx:49,82`）。
  - 来源扫描结论：post-MVP 方向 4 与 RC 未勾 gate 均已由既有候选覆盖，无漏报。
- `ui-triage`：`review_now`（理由见上）。
- `ui-review`（真实浏览器，6195 + 全新库，中文，1280×900 与 390×844）：
  - **UI-14 确认**：静默规则启停单击即发出 `setEnabled`，全量静默规则无二次确认
    （`suppressions-section.tsx:296-311`）；本轮 UI 首推。
  - **UI-22（新，24）**：编辑静默规则时表格行隐藏但分页条仍绘制在编辑面板顶部
    （分页 y=148、标题 y=154），页面看起来错位（`suppressions-section.tsx:145-173`）。
  - **UI-23（新，24）**：390px 下静默规则状态与行操作位于 x≈902-982，屏幕外且无提示
    （`suppressions-section.tsx:401-417` + `operations-table` 最小宽 980px）。
  - **UI-21 确认**：中文界面 Dialog sr-only 文案仍为英文 `Close`（`components/ui/dialog.tsx:63`）；
    `Failed to fetch` 分支未复现，仅代码核实。
  - 正向验证：证据包下载（事件/投递）工作正常；静默影响预览的 `{count}` 插值与「范围无启用目标」
    文案正确；390px 筛选浮层完全在视口内；UI-18 的 tab 重叠未再出现（表格仍为横向滚动）；
    UI-19 因无可用投递数据未复现。
- `release-infra`：REL-21（E2E 未接 CI）、REL-22（spec 覆盖）、REL-2/24（fixtures）、
  REL-6（重启持久化断言）、REL-9（仅 `:memory:` 迁移测试）、REL-7（ready/端口/locale）
  均仍准确。新增候选 REL-25（`/api/ready` 无行为测试）、REL-26（smoke 不检查 HEALTHCHECK）、
  REL-27（smoke 固定宿主机端口 3100）、REL-28（E2E 双入口）。

### EXPERT_PANEL

- 本轮无 EXPERT_PANEL 事项；REQ-185 为纯前端只读投影，不触碰 schema/投递/auth 语义。

### 发布评估与镜像

- 三位专家（发布经理 / 阻断审计 / 运维回滚）一致 APPROVE：
  - 发布经理：自 `v0.1.0-beta.32` 以来 1 个用户可见 feat（其余为 docs），建议预发布号递增。
  - 阻断审计：6/6 PASS —— `9f1784d` 与 `1a38599` main CI success、0 open PR、无阻塞回归、
    migration 零变化、beta.33 tag 未占用。
  - 运维回滚：Dockerfile/compose/env/runtime/SQLite 均零 diff；回滚只需换回镜像，无需数据恢复。
- 版本：`0.1.0-beta.33`；PR #249 `chore(release): v0.1.0-beta.33`（rebase 合并 `1a38599`），
  main CI success。
- Tag：`v0.1.0-beta.33`（annotated，指向 `1a38599`）；GitHub Release：
  https://github.com/xqvvu/tocsin/releases/tag/v0.1.0-beta.33
- 镜像：`registry.cn-hangzhou.aliyuncs.com/xqvvu/vane:0.1.0-beta.33` **已推送**，
  linux/amd64 + linux/arm64，index digest `sha256:12d21abe…`（`imagetools inspect` 已核实双平台）。
- 回滚镜像：`0.1.0-beta.32`（`sha256:3f1409d2…`）；本版本无迁移/配置变化。
- Obsidian 同步：本会话未提供 `obsidian-vault` skill，且第 43 轮已确认 vault 中无 Tocsin
  既有笔记，本轮**同步已跳过**。

### 下一轮优先项

1. **REQ-190（27）** 删除静默规则恢复影响确认；**REQ-181（27）** 删除级联数量；
   **REQ-182（27）** 目标测试确认；**REQ-186（28）** 文件导入。
2. **UI-14（25）** 静默启停确认（浏览器已复现，ui-review 首推）；**UI-22（24）** 编辑面板
   与分页重叠（约 30 分钟）；**UI-23（24）** 390px 行操作不可见；**UI-21（22）** `Close` 本地化。
3. **SEC-22（27）** endpoint userinfo 投影；**SEC-24（25）** 补脱敏 key 测试；
   **SEC-25（25）** test/preview 载荷投影。
4. 车道轮转：`requirements` + `ui-triage` 必跑；非必跑车道下一轮 **`security-exposure`**。
   `last_ui_review_at` = 2026-10-21 03:47。

## 2026-10-21（第 46 轮）

- 时间：2026-10-21 02:26 – 03:10 CST。
- 基线：本轮开始时 `origin/main` @ `3caf2c6`；两个 PR 合入后 @ `60e0a17`。
- 类型：非 full-audit（backlog 有多个 ≥27 分候选，且无 open PR）；最近全量审计仍为第 1 轮
  （2026-10-18 13:30 CST）。
- 车道：`requirements` + `ui-triage` 必跑；`ui-triage` 判定 `defer`，第三个并发名额给轮转的
  `docs-drift`（与第 45 轮的 `security-exposure` 交替）。
- 车道轮转位置：下次非必跑车道为 **`release-infra`**（REL-2/REL-4/REL-7/REL-9/REL-21 均为
  candidate；security-exposure 与 docs-drift 已连续两轮占用第三名额）。
- `ui-triage`：**`defer`** —— 距第 44 轮真实浏览器评审约 1.4 小时；自上次评审以来 UI 路径仅
  1 个合并（证据包导出），低于 3 个阈值；13 条未解决 UI 发现均为上一轮编目的存量；
  第 45 轮的 UI 合并已有浏览器实测记录。建议下次触发：UI 路径再合并 ≥2 个且无浏览器验证，
  或距第 44 轮满 48h。
- `last_ui_review_at`：2026-10-21 01:00（第 44 轮）；本轮未做 UI 评审，不更新。
- 工作树：`agent-iteration` 仅用于并发锁与基线；实现、验证、PR 均在会话工作树
  `objective-darwin-b8f498`。

### 本轮交付

- PR #243 `feat(console): disclose the silenced scope in the suppression impact preview` ——
  **REQ-180（28）**。
  - 影响面板复用模型已算的 `scopedCount`（`urgent-impact.ts:43`），按三分支渲染：
    无启用目标（规则当前不生效）、有启用目标但无自动呼叫、有自动呼叫并追加范围汇总。
  - 英文标题补 ICU 单复数；新增 `zeroScopedTitle/zeroScopedDescription/scopedSummary` 三键，
    `noneDescription` 改为带 `{count}`；中英文同步。
  - 新增 `urgent-impact-preview.test.tsx` 5 条组件测试；同步修正 `suppression-forms.test.tsx`
    对标题的断言；新增 PRD `docs/prd/suppression-scope-disclosure.md`。
  - 自查发现并修正一处文案准确性：范围为空也可能是引用目标被删除，而非「全部停用」，
    改为「范围内当前没有启用的目标」。
  - 验证：`vp fmt --write`、`vp check` 0 errors（12 条既有 warning）、`vp run -r test`
    136 files / 736 tests、`vp run -r build` exit 0；CI success；rebase 合并。
- PR #244 `docs(prd): reconcile roadmap and suppression status with shipped code` ——
  **DOC-11 + DOC-21（26）**。
  - `post-mvp-planning.md` 方向 2/4/5/6 增加复核注记：route explain、组合过滤、CI/docker-smoke、
    发布文档、destination guide/scaffold/test-kit/registry audit 已交付；剩余 REQ-3/6/22/33/34、
    provider fixtures 与 REL-1。
  - `adapter-contribution-experience.md`：状态注记；F2 改写为 F2'（穷尽 switch 已落地，
    剩余两处手写 secret 路径）；基线表更新。
  - `alert-suppression.md`：状态头补未交付增量（REQ-25/REQ-29）、五状态、真实 oRPC 面
    （`list/get/hits/create/update/setEnabled/delete`，无 `preview`）。
  - `mvp-rc-checklist.md`：补 Suppressions/Integrations 页面与 `suppressed` 状态，
    dedupe prune 行号改为 `delivery.helpers.ts:107-108`、`delivery.repository.ts:99`。
  - 验证：`vp fmt --check` 通过；纯文档；CI success；rebase 合并。

### 专家发现

- `requirements`：新增 REQ-185..189（见 backlog）。最高分：
  - REQ-185（29）停用配置前展示排队投递数与实际发送行为：源停用不阻止已入队投递，
    路由/目标停用会暂停（`delivery.repository.ts:219-231`）；复用 `operations.list`
    的 `deliveryState=pending` + `total`，纯前端。
  - REQ-186（28）设置页从文件导入 TOML/JSON：恢复文档要求重新导入，但只能粘贴
    （`portable-config-form.tsx:123-172`）；全仓无 `type="file"`/`FileReader`。
  - REQ-187（27）签名密钥显式清除；REQ-188（26）配置编辑器未保存草稿保护；
    REQ-189（24）取消 pending 投递（需 EXPERT_PANEL 裁决终态）。
- `docs-drift`：10 条过期断言，本轮交付 4 个文件（PR #244）；剩余：
  - DOC-6（架构文档 `application-container.md`、`frontend-architecture.md` 的文件树/页面清单
    仍缺 suppressions/integrations/operations）。
  - 过期交叉引用与版本号（ADR 0008 的 vite-plus 1.0.0、`route-authoring-current-state.md:3`
    的本机路径、`devs/vane` 路径）——低风险，下一轮 docs 批次处理。

### EXPERT_PANEL

- 本轮无 EXPERT_PANEL 事项；REQ-180 为纯前端只读投影，DOC 批次为纯文档。

### 发布评估与镜像

- 三位专家（发布经理 / 阻断审计 / 运维回滚）一致 APPROVE：
  - 发布经理：自 `v0.1.0-beta.31` 以来 1 feat + 1 fix 为用户可见变更，建议预发布号递增。
  - 阻断审计：6/6 PASS —— `60e0a17` main CI success、0 open PR、无未修复回归、
    migration 零变化、beta.32 tag 未占用。
  - 运维回滚：Dockerfile/compose/env/端口/卷/启动命令与 `packages/core` 均零 diff，
    回滚只需换回旧镜像；条件为 tag 必须指向含版本递增的 commit。
- 版本：`0.1.0-beta.32`；PR #246 `chore(release): v0.1.0-beta.32`（rebase 合并 `8b423a8`），
  main CI success。
- Tag：`v0.1.0-beta.32`（annotated，指向 `8b423a8`）；GitHub Release：
  https://github.com/xqvvu/tocsin/releases/tag/v0.1.0-beta.32
- 镜像：`registry.cn-hangzhou.aliyuncs.com/xqvvu/vane:0.1.0-beta.32` **已推送**，
  linux/amd64 + linux/arm64，index digest `sha256:3f1409d2…`。
- 回滚镜像：`0.1.0-beta.31`（`sha256:2c61014e…`）；本版本无迁移/配置变化，无需数据恢复。

### 下一轮优先项

1. **REQ-185（29）** 停用前排队投递披露；**REQ-186（28）** 文件导入 TOML/JSON。
2. **SEC-22（27）** endpoint userinfo 密码投影；**SEC-24（25）** 补脱敏 key 形态测试。
3. **REQ-181（27）** 删除级联数量；**REQ-182（27）** 目标测试确认。
4. **DOC-6** 架构文档文件树；docs 过期交叉引用批次。
5. **UI-14（25）** 静默启停确认；**UI-21（22）** Dialog `Close` 本地化。

## 2026-10-21（第 45 轮）

- 时间：2026-10-21 01:35 – 02:20 CST。
- 基线：本轮开始时 `origin/main` @ `c7d14b8`；需求合入后 @ `b6b9dc6`；发布后 @ `327666a`。
- 类型：非 full-audit（backlog 有多个 ≥27 分候选）；最近全量审计仍为第 1 轮
  （2026-10-18 13:30 CST）。
- 车道：`requirements` + `ui-triage` 必跑；`ui-triage` 判定 `defer`，
  第三个并发名额给轮转的 `security-exposure`。
- `ui-triage`：**`defer`** —— 距第 44 轮真实浏览器评审仅约 30–60 分钟
  （`iteration-log.md:17-22`），评审后 UI 路径合并 0 个；11 条未解决 UI 发现均是
  上一轮刚编目的存量，按车道间歇性原则不重复触发。建议下次触发条件：UI 路径再合并
  ≥2 个，或 UI-14 落地后一并做一次短评审。
- `last_ui_review_at`：2026-10-21 01:00（第 44 轮）；本轮未做 UI 评审，不更新。
- 工作树：`agent-iteration` 仅用于并发锁与基线；实现、验证、PR、镜像构建均在会话工作树
  `fervent-pascal-ac79d7`。

### 本轮交付

- PR #240 `feat(console): export redacted event and delivery evidence bundles` ——
  **REQ-175（29）**。
  - 新增 `features/operations/model/evidence-bundle.ts`：`buildEventEvidenceBundle` /
    `buildDeliveryEvidenceBundle` 输出带 `schemaVersion`、`kind`、`subjectId`、`exportedAt`
    的 JSON 文档；导出前对整份文档再执行一次 `redactJsonText`（纵深防御）。
  - 事件/投递详情页工具栏新增「下载证据包」；文件名
    `tocsin-<kind>-<id>-<UTC 时间戳>.json`，复用既有 `downloadTextFile`。
  - 中英文文案同步；新增中文 PRD `docs/prd/evidence-bundle-download.md`；9 条新测试。
  - 验证：`vp fmt --write`、`vp check` 0 errors（12 条既有 warning）、
    `vp run -r test` 135 files / 731 tests、`vp run -r build` exit 0；CI success；rebase 合并。
  - 浏览器实测：隔离实例 `http://localhost:6194` + 全新 SQLite，创建 owner、告警源并发送
    真实 webhook，中文界面点击下载；捕获 `tocsin-event-<id>-20261020T175149Z.json`，
    `kind=event`、`schemaVersion=1`，标题中的 `token=abcd1234` 已为 `[REDACTED]`。
    dev server 已停止、临时库已删除。
- 自查（code-review，low）：2 条非阻断发现 —— 两个下载组件有少量重复；详情为 null 时
  隐藏按钮的分支无组件测试。已记录，未在本轮返工。

### 专家发现

- `requirements`：新增 REQ-180..184（见 backlog）。最高分：
  - REQ-180（28）静默创建/编辑披露将被静默的目标数：`urgentImpactPreview` 已算
    `scopedCount` 但 UI 未用，无加急目标时只显示「不影响自动电话提醒」
    （`urgent-impact.ts:43`、`urgent-impact-preview.tsx:28-44`）。
  - REQ-181（27）删除配置前披露将级联删除的事件与投递数；REQ-182（27）目标测试发送前
    确认去向；REQ-183（26）飞书应用测试结果可复核；REQ-184（25）静默列表命中数。
- `security-exposure`：**0 HIGH / 0 MEDIUM / 4 LOW**。读边界主链路、import protection、
  `xqvvu/vane` 残留均 clean。新增 SEC-22..25：
  - SEC-22（27）目标 endpoint 的 URL userinfo 密码进入浏览器 DTO
    （`destination.helpers.ts:63,84,162`）。
  - SEC-23（24）provider 可控 fingerprint 未脱敏进入列表/详情/外发
    （`redaction.ts:231-246`）。
  - SEC-24（25）读边界脱敏测试未覆盖 `appSecret`/`privateKey`/`X-Auth-Token` 等 key 形态。
  - SEC-25（25）test/preview 的 renderedPayload 未套最终 `redactJsonText` 投影。

### EXPERT_PANEL

- 本轮无 EXPERT_PANEL 事项；REQ-175 为纯前端只读导出，不触碰 schema/投递/auth 语义。

### 发布评估与镜像

- 三位专家（发布经理/阻断审计/运维回滚）一致 APPROVE：CI success（`b6b9dc6`）、
  0 open PR、无 migration/部署配置变更、`v0.1.0-beta.31` 未占用。
- 版本：`0.1.0-beta.31`；PR #241 `chore(release): v0.1.0-beta.31`（rebase 合并
  `327666a`），main CI success。
- Tag：`v0.1.0-beta.31`（annotated，指向 `327666a`）；GitHub Release：
  https://github.com/xqvvu/tocsin/releases/tag/v0.1.0-beta.31
- 镜像：`registry.cn-hangzhou.aliyuncs.com/xqvvu/vane:0.1.0-beta.31` **已推送**，
  linux/amd64 + linux/arm64，index digest `sha256:2c61014e…`。
- **Docker Hub 不可达的长期问题已解决**：给 `tocsin-multi` builder 增加
  `[registry."docker.io"] mirrors = ["docker.m.daocloud.io"]` 后构建成功；本轮同时补推
  `0.1.0-beta.30`（`sha256:5a81e7de…`）与 `0.1.0-beta.29`（`sha256:c77a920a…`），
  均为双平台，并更新了两个 GitHub Release 的说明。
- 回滚镜像：`0.1.0-beta.30`（现已在 ACR 可用；更保守可回 `0.1.0-beta.28`）。

### 下一轮优先项

1. **REQ-180（28）** 静默创建/编辑披露目标数；**REQ-181（27）** 删除级联数量；
   **REQ-182（27）** 目标测试确认。
2. **SEC-22（27）** endpoint userinfo 密码投影；**SEC-24（25）** 补脱敏 key 形态测试。
3. docs-drift 批次（README/RC 清单、抑制 PRD 状态、post-MVP 方向 2/5、架构文件树）。
4. **UI-14（25）** 静默启停确认；**UI-21（22）** Dialog `Close` 本地化。

## 2026-10-21（第 44 轮）

- 时间：2026-10-21 00:25 – 01:05 CST。
- 基线：本轮开始时 `origin/main` @ `450005d`；需求合入后 @ `63f77ff`。
- 类型：非 full-audit（backlog 有多个 ≥27 分候选）；最近全量审计仍为第 1 轮
  （2026-10-18 13:30 CST）。
- 车道：`requirements` + `ui-triage` 必跑；`ui-triage` 判定 `review_now`，
  第三个并发名额给 `ui-review`（第 43 轮预承诺的 `docs-drift` 也同时运行，
  三者并发未超过 3）。
- `ui-triage`：**`review_now`** —— 距上次真实浏览器评审约 3h17m（未达 48h），
  自 21:10 起 UI 路径合并 2 个（未达 3），但 13 条未解决 UI 发现（≥2）且两次 UI
  合并均无浏览器验证，强信号成立。
- `ui-review`：隔离实例 `http://localhost:6193` + `/tmp/tocsin-ui-r44` 全新库，
  创建 owner、告警源并发送 2 条真实 webhook，切换中文，在 1280×900 与 390×844
  实测；dev server 已停止。**独立推荐 REQ-164 为本轮最佳切片**（唯一不可逆数据
  丢失场景），与 orchestrator 选题一致。其余发现：UI-14 代码确认、UI-21 浏览器
  确认中文界面 DOM 仍为英文 `Close`、UI-19 无数据未复现、UI-18 空数据下 390px
  无整页横向溢出（降级待验证）。
- `docs-drift`：12 组仍过期的断言，最高价值为 README/RC 清单漏列
  Integrations/Suppressions（`README.md:34-36`、`mvp-rc-checklist.md:27-28`）、
  抑制 PRD 仍写四状态（`alert-suppression.md:43,338`）、post-MVP 方向 5 仍写成
  未做（`post-mvp-planning.md:156-174`）、架构文件树与 ADR 版本过期。
  详见下方「专家发现」。
- `requirements`：新增 REQ-175..179 五条候选（见 backlog），最高分
  REQ-175 事件/投递证据包下载（29）、REQ-176 事件投递表抑制原因（29）。
- 工作树：`agent-iteration` 仅用于并发锁；实现、验证、PR 均在会话工作树
  `agitated-euclid-8e60b6`。

### 本轮交付

- PR #236 `feat(console): disclose route cascade before deleting sources and destinations` ——
  **REQ-164（29）**。
  - 新增纯函数 `routeReferenceImpact`（`features/routes/model/route-reference-impact.ts`），
    按 `rule.sourceIds` / `destinationIds` 计算「将连带删除 N 条路由」与「将收窄 M 条路由」；
    判定与仓储 `removeSourceReference`/`removeDestinationReference` 一致，重复 id 按仓储
    语义计为删除。
  - 删除告警源/通知目标确认框分别展示 destructive Alert（整条删除）与普通 Alert（仅收窄）；
    无影响时不渲染。
  - 中英文文案同步；新增中文 PRD `docs/prd/source-destination-delete-cascade-impact.md`。
  - 单元测试覆盖删除/收窄/无影响/重复 id；两个列表页组件测试覆盖确认框与回调。
  - 验证：`vp fmt --write`、`vp check` 0 errors（12 条既有 warning）、
    `vp run -r test` 132 files / 721 tests、`vp run -r build` 通过；CI success；rebase 合并。
- 发布评估与镜像：见下文。

### 专家发现

- `requirements`：
  - REQ-175 证据包下载（29）：两个详情页无导出出口，DTO 数据齐全，`downloadTextFile`
    已存在；纯前端。
  - REQ-176 事件投递表抑制原因（29）：DTO 已有 suppressionId/reason，UI 未用；
    文档 `alert-suppression.md:117` 明确要求。
  - REQ-177 保留窗口结束时间（28）、REQ-178 路由目标列展开（27）、
    REQ-179 模板载荷体积预算（25）。
- `docs-drift`（均可直接改写，留待下轮 docs 批次）：
  - README/RC 清单漏列 Integrations/Suppressions、worker 状态缺 `suppressed`
    （`README.md:34-36`、`mvp-rc-checklist.md:27-28,41-42`）。
  - 抑制 PRD 仍写四状态（`docs/prd/alert-suppression.md:43,289,338`）；`preview`
    oRPC 被写成已交付（`:238`），实际契约无此 procedure。
  - post-MVP 方向 5 仍写成未做（`docs/prd/post-mvp-planning.md:156-174`），
    实际 CI、Docker smoke、发布文档、脱敏日志均已落地，仅 E2E 未接 CI。
  - 方向 2 仍称缺「投递缺口解释」（`:214-215`），实际已实现
    （`route-match-gaps.ts:57`、`event-detail-route-gaps.tsx`）。
  - 架构文件树/工厂清单过期（`frontend-architecture.md:17-19,37-48`、
    `application-container.md:35,50,57`）；ADR 0008 版本号过期
    （`0008-migrate-to-vite-plus.md:16,19,20`）。
  - 未发现新的 `xqvvu/vane` 仓库链接残留；ACR 镜像坐标属发布目标，不应改。
- `ui-review`：REQ-164 最高优先；UI-14/UI-21 仍有效；UI-19/UI-18 本轮无法复现，
  保持待验证。

### EXPERT_PANEL

- 本轮无 EXPERT_PANEL 事项；REQ-164 为纯前端只读投影，不触碰 schema/投递/auth 语义。

### 发布评估与镜像

- 三位专家（发布经理/阻断审计/运维回滚）一致 APPROVE：7/7 门槛 PASS
  （main CI success `0edd56f`、0 open PR、无 migration/锁文件/部署配置变更、
  `v0.1.0-beta.30` 未占用）。
- 版本：`0.1.0-beta.30`；PR #238 `chore(release): v0.1.0-beta.30`（rebase 合并
  `0edd56f`），main CI success。
- Tag：`v0.1.0-beta.30`（annotated，指向 `0edd56f`）；GitHub Release：
  https://github.com/xqvvu/tocsin/releases/tag/v0.1.0-beta.30
- 镜像：`registry.cn-hangzhou.aliyuncs.com/xqvvu/vane:0.1.0-beta.30` **未推送** ——
  构建在解析 `docker/dockerfile:1` 时再次因 `registry-1.docker.io ... EOF` 失败；
  tag 与 Release 保留，下一轮重试（不 force、不删 tag）。
- 回滚镜像：`0.1.0-beta.29`（若镜像缺失则 `0.1.0-beta.28`）。
- `0.1.0-beta.29` 多平台镜像重试同样失败（Docker Hub 不可达），tag/Release 保留。
- 收尾 PR #237 `docs(planning): record round 44`（rebase 合并 `ffcbdf6`）。

### 下一轮优先项

1. **REQ-175（29）** 证据包下载；**REQ-176（29）** 事件投递表抑制原因；
   **REQ-171（28）** 补投加急披露；**REQ-172（27）** 列表静默引用。
2. docs-drift 批次：README/RC 清单、抑制 PRD 状态、post-MVP 方向 2/5、
   架构文件树与 ADR 版本（建议拆 `docs:` PR）。
3. **UI-14（25）** 静默启停确认；**UI-21（22）** Dialog `Close` 本地化（浏览器已确认）。
4. 重试 `0.1.0-beta.29` 镜像推送；验证两个平台 digest。
5. 无新的 `planned` 项；`blocked-autonomous` 项（LICENSE 等）继续不自动处理。
- Obsidian 同步：沿用第 43 轮发现，vault 中无 Tocsin 既有笔记，本轮**同步已跳过**。

## 2026-10-20（第 43 轮）

- 时间：2026-10-20 22:25 – 2026-10-21 00:30 CST。
- 基线：本轮开始时 `origin/main` @ `aa9c17a`；需求合入后 @ `8659e02`，发布合入后
  `origin/main` @ `eea856f`。
- 类型：非 full-audit（backlog 有大量 ≥27 分候选，按第 1.5 步继续）；最近全量审计仍为
  第 1 轮（2026-10-18 13:30 CST）。
- 车道轮转位置：本轮跑 `requirements` + `ui-triage` + `docs-drift`（第 42 轮预承诺）。
  `requirements` 与 `docs-drift` 运行约 33 分钟未产出报告，按车道限时规则终止，
  发现留待下一轮重跑；下一轮非必跑车道仍为 **`docs-drift`**。
- `ui-triage`：**`defer`** —— 距上次真实浏览器评审（21:10）仅约 40 分钟；自 21:10 起
  UI 路径合并 0 个；backlog 13 条未解决 UI 发现属稳定基线，非新增信号。last_ui_review_at
  保持 2026-10-20 21:10 CST。
- 工作树：`agent-iteration` 仅用于并发锁；实现、验证、PR 均在会话工作树
  `nervous-keller-bb6752`。

### 本轮交付

- PR #233 `feat(console): link the dedupe winner from event route gaps` —— **REQ-173（29）**。
  - 事件详情「未投递的原因」表中，`duplicate_within_window` 且 `firstEventId` 非空时，
    把 ID 渲染为指向 `/events/$eventId` 的类型化 `Link`；中英文文案改用 `<event>`
    富文本标签包裹 `{eventId}`，句子结构不变。
  - 去重证据被清理（`firstEventId = null`）时保持既有「原因无法复原」，不造链接。
  - 新增 4 条组件测试：链接目标与句子、证据已清理、其他原因、英文界面。
  - 新增中文 PRD `docs/prd/delivery-gap-first-event-link.md`。
  - 验证：`vp check` 0 errors（12 条既有 warning）；`vp run -r test` 4/4（console
    131 files / 716 tests）；`vp run -r build` 通过；CI success；rebase 合并。
- docs(planning) 收尾 PR：更新 backlog（REQ-173 shipped、beta.29 发布记录）与本日志。

### 专家发现

- `ui-triage`：`defer`（理由见上）。
- `requirements` / `docs-drift`：约 33 分钟未返回报告，终止后无发现可写；下一轮重跑，
  不要重复本轮未落盘的工作。
- 环境记录：`docker buildx imagetools inspect docker/dockerfile:1` 与构建均报
  `registry-1.docker.io ... EOF`，而 `ghcr.io` 可达；判定为 Docker Hub 网络不可达，
  非仓库问题。
- Obsidian 同步：已从 `~/Library/Application Support/obsidian/obsidian.json` 发现 vault
  `/Users/chuanhu9/Library/Mobile Documents/iCloud~md~obsidian/Documents`，但其中没有
  Tocsin 既有笔记；本轮**Obsidian 同步已跳过**，未在 vault 中新建目录。

### EXPERT_PANEL 与发布

- 发布评估：3 位专家一致 APPROVE。
  - 发布经理：beta.28..main 仅 1 个用户可见提交（#233）；建议递增预发布计数器。
  - 阻断审计：7/7 PASS（main CI success `8659e02`、0 open PR、最近 8 次 main 全绿、
    无 migration、锁文件未变、`v0.1.0-beta.29` 未被占用；REL-13 为长期挂起项不阻断）。
  - 运维/回滚：Dockerfile/compose/lock/migration/env 零改动；升级换镜像，回滚换回
    beta.28 镜像，无需恢复数据库。
- 版本：`0.1.0-beta.29`；PR #234 `chore(release): v0.1.0-beta.29`（rebase 合并
  `eea856f`），main CI success。
- Tag：`v0.1.0-beta.29`（annotated，指向 `eea856f`）；GitHub Release：
  https://github.com/xqvvu/tocsin/releases/tag/v0.1.0-beta.29
- 镜像：`registry.cn-hangzhou.aliyuncs.com/xqvvu/vane:0.1.0-beta.29` **未推送** ——
  多平台构建在解析 `docker/dockerfile:1` 时因 Docker Hub EOF 失败；tag 与 Release 保留，
  下一轮重试推送（不 force、不删 tag）。
- 回滚镜像：`0.1.0-beta.28`。

### 下一轮优先项

1. 重试 `0.1.0-beta.29` 多平台镜像构建与推送；验证两个平台 digest。
2. **REQ-164（29）** 删除告警源/通知目标前显示路由级联影响；**REQ-171（28）** 补投加急披露；
   **REQ-172（27）** 列表静默引用。
3. 重跑 `docs-drift` 车道；`requirements` + `ui-triage` 必跑。
4. **UI-21（22）** 对话框关闭按钮本地化；**UI-14（25）** 静默启停确认。

## 2026-10-20（第 42 轮）

- 时间：2026-10-20 20:14 – 21:20 CST。
- 基线：本轮开始时 `origin/main` @ `25b8227`；合入后 `origin/main` @ `86ddfb5`（#230）。
- 类型：非 full-audit（backlog 有大量 ≥27 分候选，按第 1.5 步继续）；最近全量审计仍为
  第 1 轮（2026-10-18 13:30 CST）。
- 车道：`requirements` + `ui-triage` + `security-exposure`（第 41 轮预承诺轮转）；
  `ui-triage` 判定 `review_now` 后追加 `ui-review`。
- `ui-triage`：**`review_now`** —— 距上次真实浏览器评审仅 2h20m（48h 信号未中），自 17:57
  以来 UI 路径合并 2 个（#220、#225，未达 3），但 14 条未解决 UI 发现（≥2 强信号）与
  「两次 UI 合并均无浏览器验证」成立，且 #225 已随 beta.27 发版。
- `ui-review`：隔离实例 `http://localhost:6191` + `/tmp/tocsin-ui-r42` 全新库，
  `/setup` 创建 `admin@example.test` 并切换 zh-Hans。**确认 UI-20 为最优切片**；
  正面验证 #225 停用确认框在 1280×900 与 390×844 下的加急披露、焦点与取消行为；
  复现 UI-21（共享 Dialog 关闭按钮读屏为英文 `Close`）。未造出 pending/suppressed 事件，
  UI-20 以代码 + 数据路径核实；#220 徽标仅代码推断。dev server 已停止。
- `last_ui_review_at`：2026-10-20 21:10 CST（部分覆盖的真实浏览器评审）。
- 工作树：`agent-iteration` 仅用于并发锁；实现、验证、PR 均在会话工作树
  `wonderful-poincare-6299d7`。结束后删除并发锁。

### 本轮交付

- PR #230 `fix(console): count every delivery state in the event health badge` —— **UI-20（26）**。
  - 事件详情摘要按操作优先级展示所有非零投递状态：失败 → 运行中 → 待处理 → 成功 → 已抑制；
    失败使用 destructive、进行中使用 secondary、成功/已抑制使用 outline；无投递显示「无投递」。
  - 移除只含 `succeeded/failed` 的 `events.detail.summary.deliveryHealth` 键，新增 6 个
    中英文计数键；新增 4 条组件测试覆盖混合状态、失败态、空投递与英文界面。
  - 新增中文 PRD `docs/prd/event-delivery-health-badges.md`。
  - 验证：`vp check` 0 errors（12 条既有 warning）；`vp run -r test` 4/4（console
    130 files / 712 tests）；`vp run -r build` 通过；CI success。

### 专家发现

**requirements（需求发现）**

- REQ-173（29）：去重缺口的首发事件可直达。PRD 承诺 `first_event_id` 可点击
  （`docs/prd/route-explain-delivery-gap.md:62,84`），实际只渲染文本
  （`event-detail-route-gaps.tsx:88-96`），DTO 已有 `firstEventId`
  （`packages/core/src/route/route.ts:156`）。纯前端，下一轮首选。
- REQ-174（25）：失败投递重试前的可执行性预检。`retryNow` 仅校验 failed
  （`delivery.repository.ts:417-440`），但 `claimNext` 要求目标/路由启用（`:229-230`）；
  停用目标/路由上重试会提示「已重新入队」却永不投递。低于门槛，建议并入 REQ-60/REQ-89。

**security-exposure（安全与数据暴露）**

- **SEC-1 已修复（代码核实）**：`isSensitiveKey` 已覆盖 `appSecret/clientSecret/apiSecret/
  privateKey/X-Auth-Token` 及分隔符变体（`redaction.ts:13-46,168-171`），测试
  `redaction.test.ts:94-104`、`redaction.scan.test.ts:134-149`。
- 新增 SEC-20（LOW，22）：`privateKeyPem`（归一 `privatekeypem`）与 `tls.key`
  （归一 `tlskey`）不命中精确键/后缀规则，PEM 正文也没有值形态规则
  （`redaction.ts:13,46,63,637`）；建议 AUTO_FIX 补 PEM 值形态与回归测试。
- oRPC DTO、import protection、日志脱敏均无 HIGH/MEDIUM 发现；脱敏回归测试已用
  `it.each(registeredDestinationKinds)` 覆盖全部 4 个 kind，并断言 registry 与
  `DestinationKindSchema.options` 一致（`configuration.integration.test.ts:1363,162-164`）。
- 旧仓库名 `xqvvu/vane` 仅剩 ACR 镜像坐标与历史日志，属真实发布目标，不改；本地路径
  `devs/vane` 属既有 DOC-27。

**ui-review（真实浏览器）**

- UI-20（26，本轮交付）：见上。
- UI-21 复核：`components/ui/dialog.tsx:69,97` 硬编码 `sr-only` `Close`，浏览器快照确认
  中文界面读屏为英文；`destination-edit-dialog-loader.tsx:115-117` 直接透出
  `Failed to fetch`。
- #225 正面验证：自动加急开启 + 3 个呼叫对象时，Alert 在桌面与 390px 均完整显示，
  默认焦点在「保留通知目标」，取消后目标保持启用、焦点回到停用按钮。
- #220 风险点（未实测）：无 `condition` 的历史快照回退到英文 `check.detail`
  （`route-match-check-badges.tsx:101`），中文界面可能出现英文证据。

### EXPERT_PANEL 与发布

- 发布评估：3 位专家一致 APPROVE。
  - 发布经理：beta.27..main 仅 1 个用户可见提交（#230）；建议递增预发布计数器。
  - 阻断审计：6/6 PASS（main CI success `86ddfb5`、0 open PR、最近 8 次 main 全绿、
    无 migration、锁文件未变、`v0.1.0-beta.28` 未占用）。
  - 运维/回滚：Dockerfile/compose/Justfile/scripts 零改动，无 schema 变更；
    升级换镜像，回滚换回 beta.27 镜像，无需恢复数据库。
- 版本：`0.1.0-beta.28`；PR #231 `chore(release): v0.1.0-beta.28`（rebase 合并
  `c70e8f7`），main CI success。
- Tag：`v0.1.0-beta.28`（annotated，指向 `c70e8f7`）；GitHub Release：
  https://github.com/xqvvu/tocsin/releases/tag/v0.1.0-beta.28
- 镜像：`registry.cn-hangzhou.aliyuncs.com/xqvvu/vane:0.1.0-beta.28`
  （linux/amd64 + linux/arm64，index digest
  `sha256:5b30d4519013b66887eb5a79b519441ffdc3dd1eabf156aa7113b128753c20b4`）；
  回滚镜像 `0.1.0-beta.27`。
- 用户可见依据：#230 事件详情投递健康徽标补齐全部状态（UI-20）。

### 下一轮优先项

1. **REQ-173（29）** 去重缺口首发事件链接。
2. **REQ-164（29）** 删除级联影响；**REQ-171/172（27-28）**。
3. **UI-21（22）** 对话框关闭按钮本地化与错误文案；**UI-14（25）** 静默启停确认；
   **UI-19/18** 投递列与 390px 布局。
4. **SEC-20** PEM 脱敏 AUTO_FIX；**Q-43/Q-47/Q-45/Q-46**；**ARCH-36..40**。
5. 车道轮转：`requirements` + `ui-triage` 必跑；非必跑车道下一轮 **`docs-drift`**。

## 2026-10-20（第 41 轮）

- 时间：2026-10-20 18:55 – 20:00 CST。
- 基线：本轮开始时 `origin/main` @ `ce36e75`；合入后 `origin/main` @ `7eb219c`
  （#225、#226）。
- 类型：非 full-audit（backlog 仍有大量 ≥27 分候选，按第 1.5 步继续）；最近全量审计仍为
  第 1 轮（2026-10-18 13:30 CST）。
- 车道：`requirements` + `ui-triage` + `security-exposure`（第 40 轮预承诺轮转）。
  `ui-triage` 正常返回 `defer`；`requirements` 与 `security-exposure` 运行 41 分钟未返回
  报告，按限时规则终止，留待下一轮重跑。
- `ui-triage`：**`defer`** —— 距上次真实浏览器评审（17:57）仅约 58 分钟；上次评审后
  UI 路径合并 1 个（#220）；14 条未解决 UI 发现属长期基线，无新增强信号。下次触发：
  自 17:57 起再合入 2 个 UI 路径提交，或 2026-10-22 17:57 硬上限；建议 2026-10-21
  08:00 前后主动排一次。
- `last_ui_review_at`：2026-10-20 17:57（未变）。
- 工作树：`agent-iteration` 仅用于并发锁；实现、验证、PR 均在会话工作树
  `nice-heyrovsky-1a14aa`。

### 本轮交付

- PR #225 `feat(console): disclose urgent paging when disabling a destination` ——
  **REQ-170（29）**。
  - 停用确认框在 `operationalConfig.urgentAutoEnabled === true` 时追加 destructive 警示：
    「停用后自动加急也会停止」+ 呼叫对象人数；无对象时使用不含数量的文案。
  - 新增 `destinations.disable.urgentAutoTitle/urgentAutoDescription/urgentAutoDescriptionNoReceivers`
    中英文键；2 条组件测试覆盖开启与关闭分支。
  - 新增中文 PRD `docs/prd/destination-disable-urgent-disclosure.md`。
  - 验证：`vp check` 0 errors（12 条既有 warning）；`vp run -r test` 4/4（console
    129 files / 708 tests）；`vp run -r build` exit 0；CI success（1m55s）。
- PR #226 `docs(release): list every remaining RC gate in the overview` —— **DOC-49**。
  - RC checklist 概览从「只差 E2E」更正为四类剩余 gate：E2E 接入 CI、dedupe cleanup
    成本上限、provider fixture 化与多版本 payload、provider 侧 contributor guide。
  - 仅文档；`vp fmt --check` 通过；CI success（2m4s）。

### 专家发现

- `ui-triage`：`defer`（理由见上）。
- `requirements` / `security-exposure`：41 分钟未产出报告，终止后无发现可写；下一轮重跑
  这两个车道，不要重复本轮未落盘的工作。
- 环境记录：会话工作树的 `node_modules` 链接残缺，且 zsh 对不存在的 glob 会让整条
  `rm -rf` 中止。按记忆做法用 `setopt nullglob` 后彻底删除再 `vp install --frozen-lockfile`
  修复（2.5s，store 已热）。

### EXPERT_PANEL 与发布

- 发布评估：3 位专家一致 APPROVE。
  - 发布经理：beta.26..main 只有 1 个用户可见提交（#225），其余为文档/规划；建议递增预发布计数器。
  - 阻断审计：6/6 PASS（main CI success `e8afbce`、0 open PR、无阻塞回归、无 migration、
    锁文件未变、`v0.1.0-beta.27` 未被占用）；REL-13（LICENSE）按既有裁决不阻断。
  - 运维/回滚：Dockerfile/compose/lock/migration 零改动；升级换镜像，回滚换回 beta.26 镜像，
    无需恢复数据库。
- 版本：`0.1.0-beta.27`；PR #228 `chore(release): v0.1.0-beta.27`（rebase 合并 `e8afbce`），
  main CI success。
- Tag：`v0.1.0-beta.27`（annotated，指向 `e8afbce`）；GitHub Release：
  https://github.com/xqvvu/tocsin/releases/tag/v0.1.0-beta.27
- 镜像：`registry.cn-hangzhou.aliyuncs.com/xqvvu/vane:0.1.0-beta.27`
  （linux/amd64 + linux/arm64，index digest
  `sha256:724ac01445e29a0d8844e0e017e963c108023ac00d9765ca95316667d67a43d0`）；
  回滚镜像 `0.1.0-beta.26`。

### 下一轮优先项

1. **REQ-164（29）** 删除级联影响；**REQ-171/172（27-28）** 补投加急披露、列表静默引用；
   **REQ-165/166/168（28）**、**REQ-167/169（27）**。
2. **UI-20（26）** 投递健康徽标补齐 pending/suppressed；**UI-14（25）** 静默启停确认；
   **UI-19/18** 投递列与 390px 布局；**UI-21** 对话框本地化。
3. **docs-drift 批次**：DOC-23/24/37、DOC-43/45、DOC-22/36、DOC-46/41。
4. 车道轮转：`requirements` + `ui-triage` 必跑；非必跑车道下一轮重跑 **`security-exposure`**
   （本轮未产出）。
5. **Q-43/Q-47/Q-45/Q-46**；**ARCH-36..40** 低风险批次。

## 2026-10-20（第 40 轮）

- 时间：2026-10-20 17:24 – 18:52 CST。
- 基线：本轮开始时 `origin/main` @ `1e95925`；合入后 `origin/main` @ `5c34ac2`（#220）。
- 类型：非 full-audit（backlog 有大量 ≥27 分候选，按第 1.5 步继续）；最近全量审计仍为
  第 1 轮（2026-10-18 13:30 CST）。
- 车道：`requirements` + `ui-triage` + `docs-drift`（第 39 轮预承诺轮转）；`ui-triage`
  判定 `review_now` 后追加 `ui-review`。
- `ui-triage`：**`review_now`** —— 距上次真实浏览器评审仅约 3 小时（48h 信号未中），但自
  14:27 起 UI 路径合并 3 个（#211、#214、#217，达到 ≥3 强信号），未解决 UI 发现 13 条
  （≥2 强信号），且两个行为性 UI 变更均无浏览器验证记录；第 39 轮预承诺的「再合入 1 个
  UI 合并即触发」已命中。
- `ui-review`：本轮执行完整真实浏览器评审（隔离 6190 实例 + 全新临时库，`/setup` 创建
  文档凭据）。确认 UI-3/4/6/8/14/17/18/19；推翻「静默排序跨页失效」假设（`list` 返回
  全部规则、客户端分页，排序是全局的）；#211 编辑目标流程通过（加载失败 / 目标已删除 /
  390px 均可用）。新发现两条：事件详情投递健康徽标忽略 pending/suppressed；共享 Dialog
  关闭按钮硬编码英文 `Close`，错误态透出 `Failed to fetch`。
- `last_ui_review_at`：2026-10-20 17:57 CST（完整真实浏览器评审）。
- 工作树：`agent-iteration` 仅用于并发锁；实现、验证、PR 均在会话工作树
  `quizzical-goldstine-5f5bb6`。结束后删除并发锁。

### 本轮交付

- PR #220 `fix(console): localize route match evidence and let badges wrap` ——
  **UI-17（26）**。
  - severity/status 的 `actual` 复用 `common.severity.*` / `common.alertStatus.*`，
    中文界面不再出现 `critical/firing` 等英文枚举。
  - 徽标高度自适应并允许换行，去掉 `truncate`，长证据不再只能 hover。
  - `routeChecks.label` / `labelMissing` 去掉重复的「标签 / label」前缀。
  - 新增 5 条组件测试；更新两处共用该组件的既有断言；PRD
    `docs/prd/route-match-check-localization.md`。
  - 验证：`vp check` 0 errors（12 条既有 warning）；`vp run -r test` 129 files / 706
    tests；`vp run -r build` 通过；CI success（2m8s）。

### 专家发现

**requirements（需求发现，新增 REQ-170..172）**

- REQ-170（29）：通知目标停用确认披露自动加急影响。停用确认只讲路由与排队投递，
  但目标开启自动加急时会同时停掉电话呼叫；静默表单已有等价披露
  （`features/suppressions/model/urgent-impact.ts:30-47`），停用确认缺失
  （`destination-actions.tsx:124-131`、`zh-Hans.json:279-283`）。纯前端。
- REQ-171（28）：补投预览披露将触发的自动加急呼叫。补投预览 DTO 无加急字段
  （`packages/core/src/operations.ts:196-255`），确认框无警告
  （`route-replay-prompt.tsx:100-112`），实操可能未经同意重新呼叫全员。
- REQ-172（27）：告警源/通知目标列表显示生效中的静默引用。两页都不加载静默规则，
  排障需跳页确认（`sources-page.tsx:25-27`、`destinations-page.tsx:47-60`）。
- REQ-164 更优切片：仓储已精确返回 `RouteReferenceCleanupResult { updated, deleted }`
  （`route.interface.ts:28-31`、`route.repository.ts:111-169`），但 service 丢弃返回值
  （`source.service.ts:76-85`、`destination.service.ts:120-129`）；建议删除结果携带
  `routeCleanup`，确认框前端推导、结果 toast 用服务端计数校准。

**docs-drift（文档漂移）**

- DOC-49（高）：RC checklist 概览仍称「只差 E2E 接入 CI」
  （`docs/release/mvp-rc-checklist.md:18-21,104`），实际还有 dedupe cleanup（`:167`）、
  provider fixtures（`:173`）、多版本 payload（`:174`）三类未勾选 gate，会误导发布就绪判断。
- DOC-24/37：抑制 PRD 仍承诺不存在的 `preview`（`alert-suppression.md:238`），AC 全未勾选
  （`:275-294`），仍称四状态（`:43,338`）；代码已五状态且 preview 属于 REQ-25。
- DOC-47/25：post-MVP 方向 2 的缺口解释与多条件编辑均已交付
  （`route-match-gaps.ts:57`、`route-forms.tsx:284,583`），retention 已决定不自动清理。
- DOC-46/41、DOC-43/45、DOC-23/51/6、DOC-22/36：方向 5/6 缺状态头、README 能力/结构/
  Roadmap 过期、架构文件树与工厂清单过期、`next-round.md` 基线落后 124 提交。
- DOC-57、DOC-58 建议关闭（前者是死代码而非文档漂移，后者措辞已正确）。

**ui-review（真实浏览器）**

- UI-17（26，本轮交付）：见上。
- UI-14（25）：静默规则启停仍单击即生效（`suppressions-section.tsx:302-313`），
  与源/路由/目标停用确认不一致；误点会立即恢复告警并可能触发呼叫。
- UI-19（25）：事件详情「下次」用 `format="time"` 显示成 `00:00`
  （`event-detail-deliveries-table.tsx:70-75`）；最近错误列被截断（`:77-79`）；
  重试后 UI 停在 pending 不刷新（`delivery-retry-button.tsx:34-44`）。
- UI-18（24）：390px 下路由匹配表格实际不可用（滚动容器 `clientHeight=2px`，
  `event-detail-view.tsx:18,45-62`）。
- 新增 UI-20（26）：事件详情投递健康徽标只统计 succeeded/failed，有 pending/suppressed
  时显示「成功 0 / 失败 0」（`event-detail-summary.tsx:52-57`），与旁边「通知投递 2 条」
  矛盾。
- 新增 UI-21（22）：共享 Dialog 关闭按钮硬编码英文 `Close`
  （`components/ui/dialog.tsx:63`），编辑目标加载失败直接显示 `Failed to fetch`。
- UI-4/6/8/3/15 复核仍成立，均属低成本文案/属性批次。

### EXPERT_PANEL

- 发布评估：3 位专家一致 APPROVE。
  - 发布经理：beta.25..main 仅 1 个用户可见提交（#220）；建议递增预发布计数器。
  - 阻断审计：6/6 PASS（main CI success、0 open PR、无阻塞回归、无 migration、
    锁文件未变、tag 未占用）；REL-13（LICENSE）按既有裁决不阻断。
  - 运维/回滚：纯前端 + i18n + docs，Dockerfile/compose/lock/migration 零改动；
    升级换镜像，回滚换回 beta.25 镜像，无需恢复数据库。
  - 版本：`0.1.0-beta.26`；tag `v0.1.0-beta.26`；镜像
    `registry.cn-hangzhou.aliyuncs.com/xqvvu/vane:0.1.0-beta.26`（amd64+arm64）；
    回滚镜像 `0.1.0-beta.25`。

### 发布

- 版本：`0.1.0-beta.26`；PR #222 `chore(release): v0.1.0-beta.26`（rebase 合并
  `2af4669`），main CI success。
- Tag：`v0.1.0-beta.26`（annotated，指向 `2af4669`）；GitHub Release：
  https://github.com/xqvvu/tocsin/releases/tag/v0.1.0-beta.26
- 镜像：`registry.cn-hangzhou.aliyuncs.com/xqvvu/vane:0.1.0-beta.26`
  （linux/amd64 + linux/arm64，index digest
  `sha256:ab90df83b5be041d486ecefbc61c8ca71922dc9d87783914c67341b2a69287f9`）；
  回滚镜像 `0.1.0-beta.25`。
- 用户可见依据：路由匹配证据本地化与换行（#220，UI-17）。

### 下一轮优先项

1. **REQ-170（29）** 目标停用确认披露自动加急；**REQ-164（29）** 删除级联影响
   （服务端计数 + 确认框）；**REQ-171/172（27-28）**。
2. **UI-14（25）** 静默启停确认；**UI-20（26）** 投递健康徽标补齐状态；
   **UI-19/18** 投递列与 390px 布局；**UI-21** 对话框本地化。
3. **DOC-49（高）** RC checklist 四类 gate 概览；DOC-24/37、DOC-43/45、DOC-22/36
   文档批次。
4. 车道轮转：`requirements` + `ui-triage` 必跑，非必跑车道下一轮 **`security-exposure`**。
5. 质量项 **Q-43/Q-47/Q-45/Q-46**；**ARCH-36..40** 低风险批次。

## 2026-10-20（第 39 轮）

- 时间：2026-10-20 16:42 – 17:35 CST。
- 基线：本轮开始时 `origin/main` @ `a66b51f`；合入后 `origin/main` @ `4f548d0`
  （#217 `e4d6877`、release #218 `4f548d0`）。
- 类型：非 full-audit（backlog 有大量 ≥27 分候选，按第 1.5 步继续）；最近全量审计仍为
  第 1 轮（2026-10-18 13:30 CST）。
- 车道：`requirements` + `ui-triage` + `architecture`（第 38 轮预承诺轮转）。
- `ui-triage`：**`defer`** —— 距上次真实浏览器评审（14:27）仅 2h15m；自那以后 UI 路径
  合并 2 个（#211、#214），未达 ≥3；13 条未解决 UI 发现均为既有清单，无新增强信号。
  下一次建议 **2026-10-21 08:00 前后**完整评审；硬性最晚 **2026-10-22 14:27**；
  若 08:00 前再合入 1 个 UI 合并（累计 3 个）立即触发。
- `last_ui_review_at`：2026-10-20 14:27（未变）。
- 工作树：`agent-iteration` 仅用于并发锁；实现、验证、PR 均在会话工作树
  `priceless-taussig-69ab77`；发布镜像在 tag 的独立干净检出 `release-build-r39` 构建。
  结束后删除并发锁并清理临时工作树。

### 本轮交付

- PR #217 `feat(console): order suppressions by operational state priority` ——
  **REQ-155（28）**。
  - 新增 `features/suppressions/model/suppression-order.ts`：按 `suppressionStateAt`
    分档 fixed operational priority：`active`（`endsAt` 升序）→ `scheduled`
    （`startsAt` 升序）→ `disabled`（`updatedAt` 降序）→ `expired`（`endsAt` 降序）；
    同档兜底 `createdAt desc`、`id desc`。
  - `SuppressionsSection` 用排序结果渲染表格；仓储 `list()` 顺序不变，分页与行 id 不变。
  - 新增中文 PRD `docs/prd/suppression-state-ordering.md`；单元测试覆盖四档、档内方向、
    时区瞬时比较、不可解析时间戳、输入不可变；jsdom 用例固定系统时间验证渲染顺序。
  - 验证：`vp check` 0 errors（12 条既有 warning）；`vp run -r test` 4/4
    （console 128 files / 701 tests）；`vp run -r build` 通过；CI success。
- PR #218 `chore(release): v0.1.0-beta.25`（rebase 合并 `4f548d0`）。

### 发布

- 发布小组三项评估一致通过：用户可见变更为 #217；`4f548d0` main CI success、0 open PR、
  无 migration/锁文件变化；回滚只需换回旧镜像。
- Tag：`v0.1.0-beta.25`（annotated，指向 `4f548d0`）；GitHub Release 已创建（prerelease）：
  https://github.com/xqvvu/tocsin/releases/tag/v0.1.0-beta.25
- 镜像：`registry.cn-hangzhou.aliyuncs.com/xqvvu/vane:0.1.0-beta.25`
  （linux/amd64 + linux/arm64，index digest `sha256:29108b4c…`）；回滚镜像
  `0.1.0-beta.24`。

### 专家发现

**requirements（需求发现，新增 REQ-164..169）**

- REQ-164（29）：删除告警源/通知目标前显示路由级联影响。确认框只提「清理路由引用」
  （`zh-Hans.json:277,893`），实际最后一个 source/destination 被移除时删除整条路由并
  级联删除该路由投递（`route.repository.ts:111-164`、`schema.ts:116-119`）。本轮推荐项，
  但已被 REQ-155 选为交付，顺延下一轮。
- REQ-165（28）：路由列表显示源停用导致的不可达（`routes-section.tsx:337-368` 不看源启停，
  目标侧却显示停用数量 `:382-394`）。
- REQ-166（28）：顶栏投递失败指示器（`dashboard-header.tsx:30-32` 只有静默指示器）。
- REQ-168（28）：加急呼叫失败原因完整查看（`delivery-pings-table.tsx:104-105` 只有
  `truncate`；attempts 已有对话框 `delivery-attempt-detail-dialog.tsx:23-30`）。
- REQ-167（27）：事件详情显示同指纹最新状态（`event-detail-summary.tsx:27-35`）。
- REQ-169（27）：手动 Worker 显示积压与批次上限（`deliveries-page.tsx:100-107` 固定 10 条）。

**architecture（架构一致性，新增 ARCH-36..40，均为低严重度）**

- ARCH-36：设置页 Tab 用 `useState` 而非 URL（`use-settings-workspace.ts:35`、
  `_dashboard.settings.tsx:10-22`）。
- ARCH-37：便携配置编辑器绕过 TanStack Form（`portable-config-form.tsx:31-34`）。
- ARCH-38：目标预览编排在 `destinations-page.tsx:127-155` 与
  `destination-edit-dialog-loader.tsx:72-99` 重复。
- ARCH-39：纯视图模型落在 `ui/`（`event-detail-route-delivery-outcomes.ts:1-32`）。
- ARCH-40：feature model 测试直连 infra（`urgent-ping-explanation.test.ts:7`）。
- 复核已知项：ARCH-2/12/23/33 仍成立，仅行号漂移；服务端分层、容器装配、oRPC 边界、
  DTO 保密、adapter 形状未发现新的确定性高/中严重度违规。

### EXPERT_PANEL

- 发布评估：3 位专家（发布经理 / 阻断审计 / 运维回滚）一致 APPROVE，结论与证据见
  PR #218 正文与本轮发布记录；无其它 EXPERT_PANEL 事项。

### 下一轮优先项

1. **REQ-164（29）** 删除配置前显示路由级联影响；**REQ-165/166/168（28）**；
   **REQ-167/169（27）**。
2. **REQ-159（28）** 通用 Webhook 字段映射；**REQ-160/161/163（27）**；
   **REQ-138/137（28）**。
3. **UI-17（26）**、**UI-19（25）**、**UI-18（24）**；完整 UI 评审安排在
   2026-10-21 08:00 前后（硬性最晚 2026-10-22 14:27）。
4. 车道轮转：`requirements` + `ui-triage` 必跑，非必跑车道下一轮 **`docs-drift`**。
5. 质量项 **Q-43/Q-47/Q-45/Q-46**；**ARCH-36..40** 可在低风险批次中一起处理。

## 2026-10-20（第 38 轮）

- 时间：2026-10-20 16:02 – 16:40 CST。
- 基线：本轮开始时 `origin/main` @ `730316b`；合入后 `origin/main` @ `97434ce`（#214）。
- 类型：非 full-audit（backlog 有大量 ≥27 分候选，按第 1.5 步继续）；最近全量审计仍为
  第 1 轮（2026-10-18 13:30 CST）。
- 车道：`requirements` + `ui-triage` + `quality`（第 37 轮超时后的窄范围补跑）。
- `ui-triage`：**`defer`** —— 距上次真实浏览器评审（14:27）仅约 1h43m；自那以后仅 1 个
  行为性 UI 合并（#211），未触发 48h / ≥3 合并 / 新增高严重度发现任一强信号。维持
  2026-10-21 08:00 前后安排完整评审，硬性最晚 2026-10-22 14:27。
- `last_ui_review_at`：2026-10-20 14:27（未变）。
- 工作树：`agent-iteration` 仅用于并发锁；实现、验证、PR 均在会话工作树
  `friendly-colden-2cfbd8`。结束后已删除并发锁；本会话 `node_modules` 于收尾时清理。

### 本轮交付

- PR #214 `feat(console): search events and deliveries by label and upstream metadata` ——
  **REQ-154（28）**。
  - 事件/投递搜索谓词新增 `events.labels_json` 与 `events.provider_metadata_json` 的
    字面子串匹配，沿用 `escapeLikeTerm`；列表与 `total` 继续共用同一谓词。
  - `raw_payload_json` / `raw_headers_json` 保持不可搜；新增回归用例固定「敏感 label 值
    可被搜索命中，但详情投影仍为 `[REDACTED]`」的边界（与既有 title/message 规则一致）。
  - 中英文占位文案补充「标签、上游元数据」；PRD `docs/prd/operation-search-labels.md`。
  - 验证：`vp check` 0 errors（12 条既有 warning）；`vp run -r test` 4/4
    （console 126 files / 690 tests）；`vp run -r build` 通过；CI success。
  - 备注：环境 `node_modules` 再次出现「Already up to date 但缺包」，按既有记忆清理后重装。

### requirements 车道（5 个新候选）

- **REQ-159（28）** 通用 Webhook 源可配置字段映射：generic schema 为空
  （`packages/providers/src/generic/schema.ts:3`），解析只猜固定顶层键
  （`parse.ts:22-53`），而中文界面已宣称支持字段映射且入口指向路由
  （`zh-Hans.json:929-931`）。
- **REQ-160（27）** 事件列表显示命中路由名称：列表已选出 `route_matches_json`
  （`history.repository.ts:60-68`）且快照含 `routeName`（`route.ts:162-168`），
  DTO 却只投影数量（`operations.ts:50-60`）。
- **REQ-161（27）** 接入 Token 支持 HTTP Basic：Webhook 只认 Bearer 与
  `x-tocsin-source-token`（`request-context.ts:82,109-117`）。
- **REQ-162（25）** 出站投递按目标限速：worker 串行且无目标维度限速
  （`delivery-worker.service.ts:59-77`）；飞书错误文案已提示降速
  （`feishu-errors.ts:105`）但无设置项。
- **REQ-163（27）** 维护窗口批量排期（复制顺延）：静默只有单组绝对起止
  （`suppression.ts:51-64`），行操作无复制（`suppressions-section.tsx:274-300`）。

### quality 车道（窄范围补跑）

- Q-43/Q-45/Q-46/Q-12/Q-13/Q-5 **全部仍有效**，已按第 38 轮代码位置更新 backlog：
  - Q-43：Events 列表会因 `route_matches_json` 损坏整页失败
    （`history.repository.ts:126,406-414`）；`raw_payload_json`/`provider_metadata_json`/
    `labels_json` 影响详情与 worker claim（`intake.helpers.ts:55-100`）。
  - Q-46：实现主体漂移到 `operation-filters.tsx:569-613`，测试仍无尾随空格提交、
    无 `unmount()`、无 fake timers。
  - Q-12/Q-13：失败分支与脱敏断言仍未被真正触发。
- 新发现 **Q-47（24）**：oncall 失败路径的 `markFailed` 未兜底
  （`oncall-execution.ts:106-122,214`），持久化失败会中止整批 worker；与 Q-45 同批处理。

### 发布（第 9.5 步）

三位发布专家独立返回，结论一致 **RELEASE**：

- **发布经理**：beta.23..main 仅 1 个用户可见提交（#214 搜索覆盖标签与上游元数据）；
  其余为测试/注释/规划文档。建议预发布计数器递增。
- **阻断审计**：六项 gate 全 PASS —— `97434ce` main CI success、0 open PR、无
  migration/部署/env 变化、无未修复回归、`v0.1.0-beta.24` 未占用、最近 10 次 main CI 全绿。
- **运维/回滚**：无 schema/依赖/compose 变化，换镜像即可升级；回滚换回 beta.23 镜像，
  无需恢复数据库。

- 版本：`0.1.0-beta.24`；PR #215 `chore(release): v0.1.0-beta.24` rebase 合并 `866eeb9`，
  main CI success。
- Tag：`v0.1.0-beta.24`（annotated，指向 `866eeb9`）；GitHub Release 已创建（prerelease）：
  https://github.com/xqvvu/tocsin/releases/tag/v0.1.0-beta.24
- 镜像：`registry.cn-hangzhou.aliyuncs.com/xqvvu/vane:0.1.0-beta.24`，index digest
  `sha256:c3b7326c47424f50bf9fb1a967ab0dc59ac80aa733e7221b533ce72ab33ee09a`，
  含 `linux/amd64` 与 `linux/arm64`；构建于 tag 的干净检出，
  `--provenance=false --sbom=false`。
- 回滚镜像：`0.1.0-beta.23`。
- 用户可见依据：Events/Deliveries 可按事件标签与上游 provider metadata 搜索。

### 下一轮优先项

1. **REQ-155（28）** 静默规则按生效状态置顶；**REQ-159（28）** 通用 Webhook 字段映射；
   **REQ-160/161/163（27）** 事件列表路由名、Basic 认证、维护窗口批量排期。
2. **完整 UI 评审**（2026-10-21 08:00 前后，真实浏览器）：重点 #211 编辑目标流程、
   UI-17/19/18、UI-13/14。
3. **Q-47 + Q-45** 同批、Q-43、Q-46/Q-12/Q-13/Q-5 测试补齐。
4. 车道轮转（第 39 轮）：`requirements` + `ui-triage` + `architecture`（上次第 35 轮）。

## 2026-10-20（第 37 轮）

- 时间：2026-10-20 14:45 – 16:05 CST。
- 基线：本轮开始时 `origin/main` @ `b122539`；合入后 `origin/main` @ `8a36238`
  （#211 `38d43ed`、发布 #212 `8a36238`）。
- 类型：非 full-audit（backlog 有大量 ≥27 分候选，按第 1.5 步继续）；最近全量审计仍为
  第 1 轮（2026-10-18 13:30 CST）。
- 车道：`requirements` + `ui-triage` + `quality`（第 36 轮预承诺轮转）。`quality` 车道
  运行超时被停止，本轮未产出；下一轮以更窄范围补跑。
- `ui-triage`：**`defer`** —— 距上次真实浏览器评审（14:27）仅 20 分钟，自那以后
  `features/*/ui`、`routes`、`shell`、`components` 下 0 个提交；13 条未解决 UI 发现均为
  既有清单。建议下一轮（2026-10-21 08:00 前后）安排完整评审；硬性最晚 2026-10-22 14:27。
- `last_ui_review_at`：2026-10-20 14:27（未变）。
- 工作树：`agent-iteration` 仅用于并发锁；实现、验证、PR 均在会话工作树
  `laughing-bohr-0f4937`；发布镜像在 tag 的独立干净检出 `release-build-0f4937` 构建。
  结束后删除并发锁并清理两个临时工作树。

### 本轮交付

- PR #211 `feat(console): edit a failed delivery's destination in place` —— **REQ-150（27）**。
  - 失败投递详情工具栏新增「编辑目标」，复用 `DestinationEditDialog`（字段预填、密钥留空即
    保留、模板预览与历史事件样例）；保存后关闭对话框、失效目标/路由查询与当前投递详情。
  - 新增 `DestinationEditDialogLoader` 按需加载目标列表/目录/飞书应用；`DestinationEditDialog`
    增加加载中、加载失败可重试、目标已删除三种状态与可选 `onSaved` 回调。
  - 重试仍为显式第二击（符合 AGENTS 对投递动作必须显式的要求）；无 endpoint/迁移。
  - PRD `docs/prd/delivery-detail-edit-destination.md`；新增 6 个组件测试。
  - 验证：`vp check` 0 errors（12 条既有 warning）；`vp run -r test` 4/4
    （console 126 files / 686 tests）；`vp run -r build` 通过；CI success。
  - 备注：本轮未做浏览器实测（UI 评审 defer、时间预算）；组件测试覆盖可见性/打开/保存
    失效/加载状态，编辑对话框本体沿用第 36 轮已浏览器验证的组件。

### requirements lane（5 个新候选）

- **REQ-154（28）** 搜索覆盖标签与上游告警标识：`labels_json`/`provider_metadata_json`
  已落库却不可搜（`history.repository.ts:423-441,449-470`、`schema.ts:74,76`）；
  列表与 total 同谓词、转义 LIKE、不搜敏感原文；无迁移。本轮推荐第一名。
- **REQ-155（28）** 静默规则按生效状态置顶：决策承诺置顶防遗忘
  （`alert-suppression-decisions.md:74`），仓储固定 `created_at desc`
  （`suppression.repository.ts:19-25`）；纯前端排序。
- **REQ-156（27）** 手动加急可指定接收人（`oncall.service.ts:91-104`、
  `delivery-buzz-button.tsx:20-26`）；契约增可选 `receiverIds`，无迁移。
- **REQ-157（26）** 自动加急去重跳过可解释（`oncall.service.ts:168-190`、
  `oncall.repository.ts:42-53`）；只读投影 skippedReceivers。
- **REQ-158（25）** 路由规则排除条件（`route/route.ts:18-25`）；结构化声明式，无用户代码。

### quality lane

- 车道运行超过 70 分钟被停止，未返回发现；Q-43/Q-45/Q-46/Q-12/Q-13/Q-5 的复核顺延到
  下一轮（缩小范围：只核实这 6 项 + 最多 2 条新发现）。

### 发布（第 9.5 步）

三位发布专家独立返回：发布经理 **RELEASE**（beta.22..main 唯一用户可见变更是 #211）、
阻断审计 **APPROVE**（38d43ed CI success、0 open PR、敏感路径零变更、tag 未占用）、
运维/回滚 **SAFE**（无 migration/Dockerfile/compose/env 变化，回滚只需换回 beta.22 镜像）。

- 版本：`0.1.0-beta.23`；PR #212 rebase 合并 `8a36238`，main CI success。
- Tag：`v0.1.0-beta.23`（annotated，指向 `8a36238`）；GitHub Release 已创建（prerelease）：
  https://github.com/xqvvu/tocsin/releases/tag/v0.1.0-beta.23
- 镜像：`registry.cn-hangzhou.aliyuncs.com/xqvvu/vane:0.1.0-beta.23`，index digest
  `sha256:7240a4afcf747a18bbba19192a347ee3701eb4bd5c5c08f7902e187c88295029`，
  含 `linux/amd64` 与 `linux/arm64`；构建于 tag 的干净检出，
  `--provenance=false --sbom=false`。
- 回滚镜像：`0.1.0-beta.22`。
- 用户可见依据：失败投递详情内直接编辑目标配置并继续重试。

### 下一轮优先项

1. **REQ-154（28）** 搜索覆盖标签与上游告警标识（requirements 推荐第一名）。
2. **REQ-155（28）** 静默规则按生效状态置顶。
3. **UI-17（26）/ UI-19（25）/ UI-18（24）**；下一轮安排完整 UI 评审（真实浏览器）。
4. **REQ-138（28）/ REQ-137（28）/ REQ-147（27）**。
5. **quality 补跑（窄范围）**：Q-43/Q-45/Q-46/Q-12/Q-13/Q-5。
6. 车道轮转（第 38 轮）：`requirements` + `ui-triage` + `quality`（补跑）；之后
   `architecture`。

## 2026-10-20（第 36 轮）

- 时间：2026-10-20 13:26 – 14:47 CST。
- 基线：本轮开始时 `origin/main` @ `4755933`；合入后 `origin/main` @ `6c237fc`
  （#207 `e64cbef`、#208 `dffb791`、发布 #209 `6c237fc`）。
- 类型：非 full-audit（backlog 有大量 ≥27 分候选，按第 1.5 步继续）；最近全量审计仍为
  第 1 轮（2026-10-18 13:30 CST）。
- 车道：`Q-42 EXPERT_PANEL`（3 位专家）+ `requirements` + `ui-triage`（判定
  `review_now` → 追加 `ui-review`）+ `release-infra`（轮转）+ 发布小组（3 位）。
- `ui-triage`：**`review_now`** —— 自上次真实浏览器评审（07:56）以来有 3 个行为性 UI
  合并（#198、#206、#207），达到第 35 轮预承诺的「≥2 个」提前触发条件；10 条未解决
  UI 发现；#206/#207 均无浏览器验证记录。
- `last_ui_review_at`：**2026-10-20 14:27 CST**（本轮已完成隔离实例真实浏览器评审）。
- 工作树：`agent-iteration` 仅用于并发锁；实现、验证、浏览器评审、构建均在会话工作树
  `peaceful-bartik-cd7a90`。结束后已删除并发锁；本会话 `node_modules` 于收尾时清理。

### EXPERT_PANEL（Q-42）

三位专家独立返回，结论一致选择 **A：空 severity 列表等价于 `["critical"]`**。

- **安全与可靠性**：A 的失效方向 fail-closed，最坏只是非 critical 漏呼且可被说明面板
  发现；B（拒绝）会同时打断卡片投递、预览、编辑与加急（adapter 发送前同一 schema），
  C（不限）会把 info/unknown 变成电话风暴。规范化必须收敛到 schema 单一出口。
- **产品与运维**：加急 severity 是计费、扰民的「叫醒许可名单」，不能套用路由/抑制的
  「空 = 不过滤」；表单、DTO、i18n 与 PRD/ADR 早已写定 critical 默认，Q-42 是让运行时
  向既有产品意图看齐。
- **独立评估者**：A 可测试性最好；指出表单空 severity 用例因 receivers 为空提前返回、
  schema/投影/触发均未测显式 `[]`，并给出层 × 用例矩阵。
- 决策记录：`docs/planning/decisions/feishu-urgent-empty-severities.md`。

### 本轮交付

- PR #207 `feat(console): show per-route delivery outcomes in event detail` —— **REQ-135（28）**。
  - 路由匹配表新增「投递结果」列，按 `routeId` 聚合成功/失败/运行中/待处理/已抑制；
    命中无投递显示「无投递」，未命中显示「未命中」；手工补投 `routeId=null` 不计入。
  - 新增 `routeDeliveryOutcomes` 纯函数与 `RouteDeliveryOutcomeCell`；PRD
    `docs/prd/event-route-delivery-outcomes.md`；纯前端，无 DTO/服务端/迁移变化。
  - 验证：`vp check` 0 errors（11 条既有 warning）；`vp run -r test` 4/4
    （console 124 files / 673 tests）；`vp run -r build` 通过；CI success。
- PR #208 `fix(destinations): normalise an empty urgent severity list to critical` ——
  **Q-42（26）**。
  - `FeishuConfigSchema` 把显式 `[]` 归一为 `["critical"]`；触发层删除
    `length > 0` 逃生口；编辑草稿与投递元数据共用 `normalizedUrgentSeverities`。
  - schema/触发/DTO/草稿/说明/表单/写路径/配置更新共 13 个文件、8 组回归用例；无迁移。
  - 验证：`vp check` 0 errors；`vp run -r test` 4/4（console 124 files / 676 tests）；
    `vp run -r build` 通过；CI success。
- PR #209 `chore(release): v0.1.0-beta.22` —— 版本递增与发布文档同步。

### requirements 车道（4 个新候选）

- **REQ-150（27）** 投递详情内修复目标配置并立即重试：失败详情工具栏无编辑入口，
  必须在 Destinations 找同一目标再回来（`delivery-detail-page.tsx:56-66`、
  `destinations-page.tsx:221-252`）；复用 `DestinationEditDialog`，纯前端。
- **REQ-151（26）** 值班交接摘要：三页手工拼装静默/失败/待重试
  （`active-suppression-indicator.tsx:38-56`、两个工具栏）；只读 Sheet + 复制。
- **REQ-152（26）** 首次部署引导检查清单：setup 后落到 Events 空态
  （`-setup-form-impl.tsx:61-64`、`events-empty-state.tsx:23-40`）；四步派生 + localStorage；
  吸收 REQ-115 的 CTA 部分。
- **REQ-153（24）** 告警恢复后取消未执行的自动加急呼叫：resolved 只停止新入队，
  已 scheduled 的 auto ping 仍会拨出（`oncall.service.ts:151-160`、
  `oncall.repository.ts:137-153`、`oncall-execution.ts:63-95`）；需 EXPERT_PANEL。

### release-infra 车道

- 四个未勾 gate：E2E 接入 CI **FAIL**（远端仍只有 `ci.yml`）、dedupe cleanup **FAIL**
  （`delivery.helpers.ts:107-108`、`oncall.repository.ts:38-41` 无 LIMIT）、provider fixture
  **FAIL**（19 个内联 payload、28 个 `it` 块、6 个拒绝用例）、多版本 payload **PARTIAL**。
- REL-5/8/9/11/16/19 仍有效；REL-6 收窄为「重启持久化断言」；REL-9 收窄为
  「WAL/文件库 migration/checksum」；REL-18 证据迁到 `docker-production-deployment.md:56`。
- 四组重复项已在 backlog 标注合并：REL-1→21、REL-4→22、REL-5/8、REL-2/24、REL-16/23。
- 本轮不做 AUTO_FIX：时间预算用于两个交付与发布；fixture 抽取、artifact smoke、
  E2E workflow 均需本地实跑，留待后续轮次。

### ui-review 车道（隔离实例 localhost:6196 + 临时 SQLite）

- 真实浏览器验证通过：#207 路由匹配投递结果列（状态顺序、无投递/未命中区分、手工补投
  不计入）；#206 投递表仅 failed 行显示重试、点击后刷新。桌面 1440 与移动 390 均截图。
- 新发现：**UI-17（26）** checks 实际值未本地化、出现「标签 标签」重复、长 badge 截断且
  完整信息只在 title；**UI-18（24）** 390px 下路由匹配 tab 标题重叠、表格裁切；
  **UI-19（25）** 投递「下次」只显示时间（2030 年显示 00:00）、最近错误列约 10% 只剩
  省略号、重试后后台已 failed 但界面停在 pending。
- UI-14 浏览器复现；UI-13/UI-8/UI-3/UI-12 未全部复核（时间预算）。

### 发布（第 9.5 步）

三位发布专家独立返回：发布经理 **RELEASE**（beta.21..main 3 个用户可见变更：#206、#207、
#208）；阻断审计 **APPROVE（补 release-prep 后）**（main CI success、0 open PR、无
migration/Docker/env/锁文件变化、tag 未占用）；运维/回滚 **SAFE**（无迁移，换镜像即可，
回滚 `0.1.0-beta.21`）。

- 版本：`0.1.0-beta.22`；PR #209 rebase 合并 `6c237fc`，main CI success。
- Tag：`v0.1.0-beta.22`（annotated，指向 `6c237fc`）；GitHub Release 已创建（prerelease）：
  https://github.com/xqvvu/tocsin/releases/tag/v0.1.0-beta.22
- 镜像：`registry.cn-hangzhou.aliyuncs.com/xqvvu/vane:0.1.0-beta.22`，
  index digest `sha256:a01471cb98bf56963acfe6352b16994be3496771c6baa5dda4ee8064713efd78`，
  含 `linux/amd64` 与 `linux/arm64`；构建于 tag 的干净检出，
  `--provenance=false --sbom=false`。
- 回滚镜像：`0.1.0-beta.21`。
- 用户可见依据：事件详情内联重试、按路由投递结果、飞书加急空 severity 语义收紧。

### 下一轮优先项

1. **REQ-150（27）** 投递详情内修复目标配置并立即重试。
2. **UI-17（26）** checks 本地化；**UI-19（25）** 投递列可读性与重试刷新；
   **UI-18（24）** 移动端路由匹配布局。
3. **REQ-138（28）** 目标覆盖率计入告警源启停；**REQ-137（28）** 解析器变更确认；
   **REQ-147（27）** 目标批量连通性自检。
4. **REQ-125/130/131/139/140/141（27）**；**REQ-151/152（26）**。
5. **Q-43（25）**、Q-45/Q-46、SEC-13、SEC-20/21 的 AUTO_FIX 批次。
6. **REL-21（26）** 独立 `e2e.yml`（先本地跑通 `playwright install chromium` + test）；
   REL 重复项合并后的 fixture / artifact smoke / required checks。
7. 车道轮转（第 37 轮）：`requirements` 必跑 + `ui-triage` + **`quality`**（上次第 32 轮）。

## 2026-10-20（第 35 轮）

- 时间：2026-10-20 12:45 – 13:25 CST。
- 基线：本轮开始时 `origin/main` @ `191e47c`；发布合入后 `origin/main` @ `5932245`。
- 类型：非 full-audit（backlog 有多个 ≥27 分候选，按第 1.5 步继续）；最近全量审计仍为第 1 轮
  （2026-10-18 13:30 CST）。
- 车道：`release panel`（发布经理 + 阻断审计 + 运维/回滚，3 位专家）+ `requirements` +
  `architecture` + `ui-triage`。`architecture` 补跑第 33 轮未完成的轮转。
- `ui-triage`：**`defer`** —— 距上次真实浏览器评审（2026-10-20 07:56）约 5 小时；自那以后
  只有 1 个行为性 UI 提交（#198，已有隔离实例浏览器验证）；8 条未解决 UI 发现均为已排期旧项。
  硬性最晚 **2026-10-22 07:56 CST**；建议下一轮（2026-10-21 08:00 前后）主动安排一次完整
  UI 评审。
- `last_ui_review_at`：2026-10-20 07:56（未变）。
- 工作树：`agent-iteration` 仅用于并发锁；实现、验证、PR 均在会话工作树
  `busy-wilson-fdb79a`。结束后已删除并发锁、`agent-iteration` 临时工作树与本会话
  `node_modules`。
- 环境备注：本轮开始时会话工作树 `node_modules` 链接残缺（缺 `@types/react` 与 workspace
  link），`vp check` 误报 3396 个类型错误；按记忆中的清理方式重装后恢复 0 errors / 11 warnings。

### EXPERT_PANEL（发布 v0.1.0-beta.21）

三位专家独立返回，结论一致 **RELEASE**：

- **发布经理**：beta.20..main 共 7 个提交，唯一用户可见变更是 `e5de4f6`（SEC-19 线性脱敏，
  HIGH 性能/安全修复）；`e5265e4` 为同语义流式重构，其余为 test/docs。建议预发布号递增。
- **阻断审计**：5 项 gate 全 PASS —— main HEAD `e5265e4` CI success；0 个 open PR；
  beta.20..main 无 migration/schema/Dockerfile/compose/env 变化；最近 20 次 main CI 无失败；
  `v0.1.0-beta.21` 未被占用。唯一非阻断遗留是 REL-13（LICENSE，法律/产品决策）。
- **运维/回滚**：Dockerfile、compose、环境变量、SQLite schema 均未变化；回滚只需换回
  `0.1.0-beta.20` 镜像，无需恢复数据；镜像仓库约定为
  `registry.cn-hangzhou.aliyuncs.com/xqvvu/vane:<version>`，只推版本 tag、不推 `latest`。
  回滚会重新引入 beta.20 的超线性脱敏行为，属运维性能回退而非数据兼容问题。

### 发布（第 9.5 步）

- 版本：`0.1.0-beta.21`；PR #205 `chore(release): v0.1.0-beta.21` rebase 合并 `5932245`，
  main CI success。
- Tag：`v0.1.0-beta.21`（annotated，指向 `5932245`）；GitHub Release 已创建（prerelease）：
  https://github.com/xqvvu/tocsin/releases/tag/v0.1.0-beta.21
- 镜像：`registry.cn-hangzhou.aliyuncs.com/xqvvu/vane:0.1.0-beta.21`，
  index digest `sha256:4295956ed849d322578abc7803c926a9be03119f0647c75ab2f112bfce902b0a`，
  含 `linux/amd64` 与 `linux/arm64`；构建于 tag 的干净检出，`--provenance=false --sbom=false`。
- 回滚镜像：`0.1.0-beta.20`。
- 用户可见依据：SEC-19 修复后，大载荷（含 1 MiB 默认上限）的脱敏从分钟级降到毫秒级，
  同步接入与详情/投递证据展示不再被阻塞；脱敏覆盖不变。

### 专家发现

**requirements（需求发现）** —— 5 个新候选，均带代码核实证据：

- REQ-147（27）通知目标批量连通性自检：工具栏只有新增/刷新，测试只能逐行
  （`destination-actions.tsx:61-72`、`destinations-page.tsx:159-183,209-215`）；复用
  `destinations.test`，顺序执行并汇总失败，无新 endpoint。
- UI-15（26）路由级浏览器标题：所有页面共用静态 `<title>Tocsin</title>`
  （`__root.tsx:22-27`），事件/投递详情未把 ID 写进标题；多标签排障无法区分。
- REQ-148（26）投递详情展示同事件其他目标投递：详情只加载当前 job
  （`delivery-detail-page.tsx:25-35`），事件详情表格行不可点；可复用
  `eventDetailQueryOptions`，无新 DTO。
- UI-16（26）列表内联徽标一键筛选：severity/status/delivery state 徽标是静态的
  （`severity-badge.tsx:6-22`、`event-state-cell.tsx:12-16`、`deliveries-table.tsx:87-90`），
  但对应 URL 筛选已存在（`operation-filters.tsx:267-325`）。
- REQ-149（26）目标预览历史事件选择器支持搜索与时间范围：固定最近 20 条
  （`destination-notices.tsx:101-141`、`operations.queries.ts:48-55`），PRD 明确把搜索/时间
  范围列为后续（`destination-historical-event-preview.md:46-47`）。

**architecture（架构一致性）** —— 架构基本干净，无 High/Medium；3 条 Low 均为已跟踪项：

- ARCH-5 复核：service 仍直接抛 `RecordNotFoundError`（`destination.service.ts:138,158,202,250,374`、
  `oncall.service.ts:59,73`），仓储已有 `requireDestination`。
- SEC-21 复核：`auth.client.ts:4` 以 type import 引用 `.server`。
- ARCH-6 复核：`routes/api/ready.ts:9-49` 入口内联 readiness 状态机。
- 其余检查（domain error、容器装配、entrypoint 薄度、feature 形状、`components/common` 纯度、
  alias、marker、禁用模式、contract/implementer parity、DTO 保密）全部通过；最近 10 个提交
  未引入新违规。

**ui-triage**：`defer`（理由见上）。

### 本轮交付

- PR #205 `chore(release): v0.1.0-beta.21` —— 发布准备与文档版本同步。
- PR #206 `feat(console): retry failed deliveries from the event detail table` —— **REQ-136**。
  - 事件详情投递表格新增「操作」列，仅 `failed` 行显示重试按钮；`DeliveryRetryButton`
    入参收敛为 `{ id, state }`，详情页与事件表格共用。
  - 新增 `event-detail-deliveries-table.test.tsx`（失败/成功行、点击重试、空态跨列）与
    `docs/prd/event-detail-inline-retry.md`。
  - 验证：`vp check` 0 errors（11 条既有 warning）；`vp run -r test` 4/4 成功
    （console 124 files / 669 tests）；`vp run -r build` 通过。

### 下一轮优先项

1. **Q-42（26）EXPERT_PANEL**：空 severity 的加急语义（规范化/拒绝/视为不限）。
2. 发布收尾已闭环；下一轮不再评估同一个 tag，除非有新的用户可见变更。
3. REQ-138（28）、REQ-135（28）、REQ-137（28）；REQ-147（27）、REQ-125/130/131/139/140/141（27）。
4. 新候选 UI-15/REQ-148/UI-16/REQ-149（26）按评分与依赖续做。
5. Q-43（25）、Q-45/Q-46、SEC-13、SEC-20/21 的 AUTO_FIX 批次；UI-13/UI-14。
6. **UI 评审**：硬性最晚 2026-10-22 07:56 CST，建议 2026-10-21 08:00 前后主动安排。
7. 车道轮转：`requirements` 必跑 + `ui-triage`；轮转车道下一轮为 **`release-infra`**
   （本轮补跑 `architecture`）。

## 2026-10-20（第 34 轮）

- 时间：2026-10-20 11:22 – 12:35 CST。
- 基线：`origin/main` @ `191e47c`；本轮交付 PR #204。
- 类型：非 full-audit（backlog 有多个 ≥27 分候选）；最近全量审计仍为第 1 轮
  （2026-10-18 13:30 CST）。
- 车道：`SEC-19 EXPERT_PANEL`（3 位专家全部返回，结论一致 A+）+ `ui-triage`（`defer`）。
  `requirements` / `architecture` 未展开：本轮预算被 HIGH 安全修复占用，留待下一轮。
- `ui-triage`：**`defer`** —— 距上次真实浏览器评审（07:56）约 4h35m；自那以后 `apps/console/src`
  只有 1 个行为性 UI 提交（#198，已在隔离实例做过浏览器验证）；8 条未解决 UI 发现均为已排期
  的旧产物。硬性最晚 **2026-10-22 07:56 CST**；提前触发：再有 2 个行为性 UI 合并，或
  2026-10-21 08:00 前后那一轮主动安排。
- `last_ui_review_at`：2026-10-20 07:56（未变）。
- 工作树：`agent-iteration` 仅用于并发锁；实现、验证、PR 均在会话工作树
  `eloquent-carson-e5a496`。结束后已删除并发锁与 `agent-iteration` 临时工作树，并清理
  本会话 `node_modules`。

### EXPERT_PANEL（SEC-19）

三位专家独立返回，结论一致推荐 A+：手写线性 assignment 扫描器 + 线性 URL userinfo。

- **安全与可靠性**：新发现 userinfo 分支在 1 MiB 上实测 **233 s**，且位于同步 intake
  （`intake.service.ts:79-81`）；只修 assignment 无法关闭 SEC-19。否决有界量词、分块与
  按大小跳过（缩小覆盖 / 不可证明）。
- **产品与运维**：覆盖不变是硬条件；按载荷大小区别对待不可接受；纯 core 函数替换，
  无 schema/迁移/配置，符合 charter，可回滚。
- **评估者**：冻结旧正则作为测试内 oracle；钉死 `web__hookurl` 可见、`foo.webhook_url`
  仅未加引号时脱敏、`".token"` 与 `"_token"` 的差异、`token="abc" ` 的未加引号回退、
  `\s+KEY` 跨行截断；不新增「全局幂等」门槛（旧实现本身并非全局幂等）。
- 决策记录：`docs/planning/decisions/linear-redaction-scan.md`。

### 本轮交付

- PR #204 `fix(core): redact sensitive text in linear time` —— **SEC-19（HIGH）**。
  - `redactSensitiveAssignments` 改为单向前进扫描器；键匹配复刻旧语义：精确键字符间至多
    一个 `[._-]`、后缀前缀长度无上限、`_` 不构成 `\b`、引号键闭合、quoted/unquoted 值
    回退、Unicode `\s`、`\s+KEY` 跨行截断；每个空白 run 只前瞻一次。
  - URL userinfo 改为线性扫描器，只替换 password span；redactor 顺序保持
    slack → feishu → xox → userinfo → authscheme。
  - 新增 `redaction.scan.test.ts`（冻结 oracle + 10,000 例确定性差分 + 语义钉死）与
    `redaction.perf.test.ts`（40 KiB ≤100 ms、1 MiB ≤2 s，实测毫秒级）。
  - 验证：`vp check` 0 errors（11 条既有 warning）；`vp run -r test` 4/4 成功
    （core 127 tests、console 123 files / 666 tests）；`vp run -r build` 通过。

### 发布（第 9.5 步）

- **本轮不发布**：唯一交付是安全/性能修复，PR 在时间预算末尾才进入 CI；按「超出 75 分钟
  不再启动新的实现/评审工作」规则，不仓促召开发布小组。下一轮第一优先评估
  `v0.1.0-beta.21`（用户可见依据：1 MiB 以上载荷不再阻塞接入/详情/投递），并补
  tag、GitHub Release 与多平台镜像。

### 下一轮优先项

1. 评估并发布 `v0.1.0-beta.21`（若 main CI 绿、无阻断 PR）。
2. **Q-42（26）EXPERT_PANEL**：空 severity 的加急语义（规范化 / 拒绝 / 视为不限）。
3. 重跑 `requirements` + `architecture` 车道（第 33 轮因配额饥饿无产出）。
4. REQ-138（28）、REQ-135（28）、REQ-137（28）；REQ-125/130/131/136/139/140/141（27）。
5. Q-43（25）、Q-45/Q-46、SEC-13、SEC-20/21 的 AUTO_FIX 批次；UI-13/UI-14。

## 2026-10-20（第 33 轮）

- 时间：2026-10-20 09:25 – 11:15 CST（严重超出 75 分钟预算，原因是 subagent 车道被配额饥饿）。
- 基线：`origin/main` @ `12e8393`；本轮交付 PR #202。
- 类型：非 full-audit（backlog 有多个 ≥27 分候选，按第 1.5 步继续）；最近全量审计仍为第 1 轮
  （2026-10-18 13:30 CST）。
- 车道：`requirements` + `architecture` + `ui-triage`。
  - `requirements` 与 `architecture` 在 100 分钟后仍停留在读取基线阶段、无任何发现返回，
    按「单车道超过约 30 分钟无结果即停止」的记忆规则被终止；本轮无新增需求候选与架构发现，
    留待下一轮重跑（下一轮仍从 `architecture` 继续轮转）。
  - `ui-triage` 正常返回：**`defer`**。
- `ui-triage` 理由：距上次真实浏览器评审（07:56）仅约 90 分钟；自那以后只有 1 个行为性 UI
  合并（#198 时区修复）且有隔离实例浏览器验证记录；8 条未解决 UI 发现全部来自上一轮且已排期；
  硬性最晚 **2026-10-22 07:56 CST**，提前触发条件为再合入 ≥2 个行为性 UI 改动。
- `last_ui_review_at`：2026-10-20 07:56（未变）。
- 工作树：`agent-iteration` 仅用于并发锁；实现、验证、PR 均在会话工作树
  `funny-boyd-c81eb8`。结束后已删除并发锁、`agent-iteration` 临时工作树与本会话的
  `node_modules`，并删除已合并的本地分支；其余 worktree 占用的遗留 `agent/*` 分支保留。

### 专家发现

- **SEC-19（HIGH，复核）**：亲自复刻同一正则实测，确认超线性：
  8KB→49.5ms、16KB→124.5ms、40KB→641.5ms、80KB→2533.5ms；默认
  `TOCSIN_MAX_WEBHOOK_BYTES` 为 1 MiB（`apps/console/src/env.ts:33-37`），外推 CPU 占用
  约 400 秒以上。安全专家在被终止前确认核心攻击面：parser 归一化字段原样入库
  （`intake.service.ts:113`），读取/发送边界再跑慢正则。
- **候选修复实测**：把后缀分支改为 `[A-Za-z0-9._-]{1,64}` 后为线性
  （40KB→6.4ms、256KB→37.7ms、1MiB→154.9ms），但会放弃「>64 字符前缀 + 敏感后缀」的
  文本键匹配，属于**缩小脱敏覆盖**，触碰第 5 步红线；因此不能由编排者直接实施，
  必须由下一轮 EXPERT_PANEL 在「手写线性扫描器（覆盖不变）」与有界量词之间裁决。
- **EXPERT_PANEL 未能召开**：安全专家与两个审计车道一样被配额饥饿，运行 67 分钟只返回
  「已确认攻击面、正在做语义差分」；产品与 evaluator 两位因并发名额被饥饿车道占满而未启动。
  为避免继续烧配额已终止，本轮**没有**做出 SEC-19/Q-42 裁决，两项保持 candidate。
- 需求/架构车道无产出；backlog 既有候选未被重复发现。

### 本轮交付

- PR #202 `test(core): cover label-key credential redaction in route evidence` —— **Q-44**。
  - `redactRouteMatchResults` 的 `labelKey` 分支此前无测试：删除后 core 60 条测试仍绿，
    `{authorization:"plain-secret"}` 会原样显示（`redaction.ts:226-229`）。
  - 新增两条用例：凭据形态 labelKey（`authorization`/`apiToken`）隐藏 actual；普通
    labelKey（`service`）保留 actual，且仍对其值做形态脱敏（`token=upstream-secret` →
    `token=[REDACTED]`）。
  - 变异验证：临时删除 `labelKey` 分支后新增用例失败，恢复后通过。
  - 验证：`vp check` 0 errors（11 条既有 warning）；`vp run -r test` 123 files / 666 tests；
    `vp run -r build` 通过。

### 发布（第 9.5 步）

- 本轮不发布：唯一交付是测试覆盖，无用户可见变更；按门槛「纯 test 变更不触发发版」跳过。

### 下一轮优先项

1. **SEC-19（HIGH）EXPERT_PANEL 第一件事**：3 位专家必须在轮次开始后尽早启动；裁决
   「手写线性扫描器」vs「有界量词」，任何方案都不得缩小脱敏覆盖，并必须带 40KB ≤100ms
   性能回归与 1MiB 有界测试。若车道再次被配额饥饿，记录并保持 candidate，不自行降级修复。
2. **Q-42（26）EXPERT_PANEL**：空 severity 的加急语义（规范化/拒绝/视为不限）。
3. 重跑 `requirements` + `architecture` 车道（本轮因饥饿无产出）。
4. REQ-138（28）、REQ-135（28）、REQ-137（28）；REQ-125/130/131/136/139/140/141（27）。
5. Q-43（25）、Q-45/Q-46、SEC-13、SEC-20/21 的 AUTO_FIX 批次。

## 2026-10-20（第 32 轮）

- 时间：2026-10-20 08:25 – 08:53 CST。
- 基线：`origin/main` @ `3a5414c`；本轮合并 #198（rebase `983f68a`）与 #199（rebase `d44d14b`）。
- 类型：非 full-audit（backlog 有多个 ≥27 分候选，按第 1.5 步继续）；最近全量审计仍为第 1 轮
  （2026-10-18 13:30 CST）。
- 车道：`requirements` + `quality` + `ui-triage`（判定 `defer`）。
  下一轮建议 `requirements` + `architecture` + `ui-triage`（`architecture` 第 28 轮后未跑）。
- `ui-triage`：`defer` —— 距第 31 轮真实浏览器评审（07:56）约 34 分钟；自那以后 main 上
  0 个行为性 UI 合并（只有 `docs(planning)`）；9 条未解决 UI 发现全部来自上一轮且已排期。
  硬性最晚 **2026-10-22 07:56 CST**；期间若再合入 ≥2 个行为性 UI 改动则提前触发。
- `last_ui_review_at`：2026-10-20 07:56（未变）。
- 工作树：`agent-iteration` 仅用于并发锁；实现、验证、浏览器验证均在会话工作树
  `modest-bun-edbc30`。

### 本轮交付

- PR #198 `fix(console): interpret suppression windows in the console time zone` ——
  **UI-9（27）+ REQ-73（28）**。
  - 根因：`datetime-local` 输入经 `new Date(value)` 按**浏览器时区**解释，而列表/详情用
    设置时区渲染；浏览器上海 + 设置 UTC 时输入 10:00 保存后显示 02:00。
  - `suppression-form.ts` 新增显式 IANA 换算：`datetimeLocalFromIso(iso, timeZone)` /
    `isoFromDatetimeLocal(value, timeZone)`；逐瞬时计算 DST 偏移，拒绝 `2026-02-31` 与
    被春季调时跳过的时间；无法解析/不存在时返回 `null`。
  - 新建、编辑、事件/标签一键静默三个入口统一传入 `useTimeZone() ?? fallbackTimeZone`；
    时间窗字段下方显示「时间按控制台时区 {timeZone} 解释和显示」（中英文）。
  - 校验拆成「请选择有效的开始和结束时间」与「结束必须晚于开始」两条文案。
  - 测试：模型 7 条（时区往返、NY 冬夏偏移、非法日期、DST 跳过、默认窗口）、组件 2 条
    （时区提交 + DST 错误文案）；console 123 files / 666 tests。
  - 隔离实例（临时 SQLite，`localhost:6192`）真实浏览器验证：设置 Asia/Shanghai 时默认
    窗口为上海墙上时间；切回 UTC 后输入 `2026-10-21T10:00–12:00`，列表显示 10:00–12:00、
    库中为 `10:00Z–12:00Z`，编辑回填一致。
- PR #199 `fix(core): compare suppression window bounds as instants` —— **Q-26（25）**。
  - `suppressionStateAt` 由字符串比较改为 `Date.parse` 后按瞬时比较，保持
    `[startsAt, endsAt)`；带 `+08:00` 偏移的窗口不再多静默 8 小时。
  - 无法解析的行/时钟回退到原字典序，避免损坏行因 `NaN` 比较被判成 `active`。
  - 新增 3 条 core 测试（偏移窗口、混合表示、损坏边界）；`packages/core` suppression 22 条。
- 验证：`vp check` 0 errors（11 条既有 warning）；`vp run -r test` 4/4 成功；
  `vp run -r build` 通过；两个 PR CI success。

### requirements 车道（第 32 轮新增 6 条候选）

- **REQ-141（27）** 通知目标测试结果可复核：测试只弹瞬时 toast，丢弃
  `DestinationTestResult.renderedPayload`（`destinations-page.tsx:209-217`、
  `destination-notices.tsx:40-66`）。
- **REQ-142（26）** 事件列表按路由筛选：接入已写 `route_matches_json`
  （`intake.service.ts:92-104`），但事件筛选无路由维度（`operation-filters.tsx:37-42`）；
  建议由 REQ-21 吸收。
- **REQ-143（26）** 一次性接入 Token 离开保护：Token 只在组件状态
  （`sources-page.tsx:29,92-94`），关闭/导航即永久丢失（`source-token-notice-panel.tsx:77-87`）。
- **REQ-144（26）** 投递详情补齐告警身份：详情无严重度/状态/发生时间
  （`delivery-detail-summary.tsx:27-33,43-68`），DTO 已有字段。
- **REQ-145（25）** 列表主标识可点击进入详情（`event-title-cell.tsx:14-24`、
  `deliveries-table.tsx:73-85`）。
- **REQ-146（25）** 补投结果可下钻验证：DTO 已带 `createdDeliveryIds`
  （`event-replay-action.tsx:74-79`、`route-replay-prompt.tsx:69-75`）。

### quality 车道（8 条发现）

- **SEC-19（升级 HIGH）** 脱敏正则二次复杂度仍无性能回归：实测 8KB≈45–60ms、16KB 181ms、
  80KB 4045ms（`redaction.ts:55-64,260`）；`redaction.test.ts` 无 timing/大输入用例。
  下一轮 EXPERT_PANEL。
- **Q-42（26，新）** 空 severity 列表语义三层不一致：schema 允许 `[]`，触发层按「不限级别」
  呼叫（`oncall.service.ts:155-160`），DTO 投影映射为 `["critical"]`
  （`destination.helpers.ts:194-205`），说明面板据此给出相反原因；需 EXPERT_PANEL。
- **Q-43（25，新）** 损坏 JSON 毒死接入/worker 热路径：`rule_json`/`matcher_json`/
  `config_json` 严格解析且位于 `routes.list()`、enqueue/claim 事务内
  （`intake.service.ts:91`、`delivery.repository.ts:97,248,320-326`）。
- **Q-44/Q-45/Q-46（新，AUTO_FIX）**：路由证据 labelKey 脱敏分支无测试；OncallExecution
  两个 catch 分支无测试；#171 防抖尾随空格/卸载取消无测试。
- 复核确认：Q-13 的断言不可能失败；Q-15 仍有效（行号更新）；Q-27、Q-4、Q-5 仍开放；
  SEC-13 追加 `sessionId`/`jwt`/`signature`。
- #194/#195/#191 三个近期功能的回归保护有效，未发现「删实现仍绿」的新缺口。

### EXPERT_PANEL

本轮无新增裁决。SEC-19 升级为 HIGH，与 Q-42 一起排入第 33 轮专家小组。

### 发布（第 9.5 步）

- 三位专家评估（并发、互不共享结论）：
  - 发布经理 **RECOMMEND**：`v0.1.0-beta.19..origin/main` 有 2 个用户可见修复（#198、#199）
    与 3 个 docs 提交；建议预发布号递增为 `0.1.0-beta.20`。
  - 阻断审计 **APPROVE（7/7）**：main CI success @ `d44d14b`、无 open PR、唯一
    `blocked-autonomous`（REL-13 LICENSE）不阻断、迁移与锁文件零 diff、无 auth/secret
    回归、`v0.1.0-beta.20` 未被占用。
  - 运维/回滚 **SAFE**：Dockerfile/compose/entrypoint/环境变量/端口/卷零差异；SQLite
    schema 未变；升级只需替换镜像 tag，回滚只需换回 beta.19、无需恢复数据。
- 版本：`0.1.0-beta.20`；PR #200 `chore(release): v0.1.0-beta.20` rebase 合并 `9c93e03`，
  main CI success。
- Tag：`v0.1.0-beta.20`（annotated，指向 `9c93e03`）；GitHub Release 已创建（prerelease）：
  https://github.com/xqvvu/tocsin/releases/tag/v0.1.0-beta.20
- 镜像：`registry.cn-hangzhou.aliyuncs.com/xqvvu/vane:0.1.0-beta.20`
  （linux/amd64 + linux/arm64，index digest
  `sha256:23f1efdc092491afeee5258095cd7d93985ba82e0194c8fad65df3921340378a`）。
- 构建：在 tag `v0.1.0-beta.20` 的干净检出上执行
  `docker buildx build --builder tocsin-multi --platform linux/amd64,linux/arm64 --provenance=false --sbom=false --push`；
  `imagetools inspect` 已确认两个平台。
- 回滚镜像：`0.1.0-beta.19`（index digest `sha256:01f2bf26…`）。
- 过程注记：版本递增提交意外带入了本轮的 planning 文档（含占位符），随后由 docs PR 修正；
  tag 指向的仍是同一份代码，不影响镜像与运行行为。
- 工作树：本轮实现与验证使用会话工作树 `modest-bun-edbc30`；结束后已清理其
  `node_modules`，并删除 `agent-iteration` 并发锁。

### 下一轮优先项

1. SEC-19（HIGH）与 Q-42（26）交 EXPERT_PANEL；两条都必须带回归测试。
2. REQ-138（28）、REQ-135（28）、REQ-137（28）。
3. REQ-125/130/131/136/139/140（27）、REQ-141（27）。
4. Q-43（25）失败策略；Q-44/Q-45/Q-46 + SEC-13 + SEC-20/21 的 AUTO_FIX 批次。
5. REQ-142/143/144/145/146（25-26）；UI-13/UI-14；docs-drift 批次。

## 2026-10-20（第 31 轮）

- 时间：2026-10-20 07:25 – 08:xx CST。
- 基线：`origin/main` @ `16ec891`；本轮合并 #194（rebase `6e10073`）与 #195（rebase `0b63bc0`）。
- 类型：非 full-audit（backlog 有多个 ≥27 分候选，按第 1.5 步继续）；最近全量审计仍为第 1 轮
  （2026-10-18 13:30 CST）。
- 车道：`requirements` + `security-exposure` + `ui-triage`（判定 `review_now` → `ui-review`）。
  下一轮建议 `requirements` + `quality` + `ui-triage`（`quality` 第 24 轮后未跑）。
- `ui-triage`：`review_now` —— 距第 27 轮真实浏览器评审（04:05）约 3h22m，但自 04:05 起有
  3 个行为性 UI 合并（`c001414` #184 空态/分页、`d19728b` #187 停用确认、`101a91a` #191
  加急解释）与 8 条未解决 UI 发现，两项强信号成立；#187/#191 均缺浏览器复验。
- `last_ui_review_at`：**2026-10-20 07:56 CST**（本轮已做真实浏览器深度评审）。
- 工作树：`agent-iteration` 仅用于并发锁；实现、验证、构建均在会话工作树
  `angry-franklin-ccc447`。

### 本轮交付

- PR #194 `feat(console): show deliverable source coverage, not just enabled routes` ——
  **REQ-129**（28）。
  - `sourceRouteCoverage(sourceId, routes, destinations)` 增加目标输入，派生
    `deliverableRouteCount` / `blockedRouteCount` / `blockedRouteNames`；已启用路由只有在
    至少关联一个已启用目标时才计入可投递，目标全部停用或引用不存在的路由计为阻断
    （`source-route-coverage.ts:12-55`）。
  - Sources「命中路由」列改为展示实际可投递数；0 条可投递但有匹配路由时显示 destructive
    「目标全停用」，部分阻断在悬浮说明里列出阻断路由并说明投递会排队但不会发送
    （`source-route-coverage-cell.tsx:7-61`）。
  - Sources 页面与 route loader 复用既有 `destinationsQueryOptions()`，不新增服务端过程或
    DTO（`sources-page.tsx:24-27`、`_dashboard.sources.tsx:11-18`）。
  - 中英文 i18n 同步；新增中文 mini-PRD `docs/prd/source-deliverable-coverage.md`。
  - 测试：模型 4 条（全部可投递、部分目标停用、目标不存在、路由停用）、列表 2 条阻断态渲染、
    可访问名称；console 123 files / 658 tests。
- PR #195 `fix(console): name the suppression in its enable and disable controls` —— **UI-11**（24）。
  - 静默规则启停按钮传入 `suppressionName`，tooltip/aria-label 不再显示未插值占位符；
    新增可访问名称回归测试（`suppressions-section.tsx:272-275`）。
  - console 123 files / 659 tests。
- 验证：`vp check` 0 errors（11 条既有 warning）；`vp run -r test` 4/4 包成功；
  `vp run -r build` 通过；两个 PR CI success，main CI success。

### requirements 车道

新增 6 条候选（已写入 backlog，均无迁移/新依赖）：

- **REQ-135（28）** 事件详情按路由显示投递结果：路由匹配表只显示目标数，投递结果在另一个
  标签页（`event-detail-route-matches-table.tsx:51,63,71`、`event-detail-deliveries-table.tsx:31-42`）；
  `EventDetailDelivery` 已带 `routeId/destinationId/state`，纯前端按 routeId 聚合。
- **REQ-136（27）** 事件详情投递表内联重试失败投递（`event-detail-deliveries-table.tsx:31-42`）。
- **REQ-137（28）** 告警源解析器变更确认：编辑源时解析器可直接切换并保存
  （`source-form.tsx:128-163`、`edit-source-form.tsx:42-53`），历史事件不会重解析。
- **REQ-138（28）** 通知目标覆盖率计入告警源启停（REQ-129 的镜像）：
  `destination-route-coverage.ts:11-24` 只看路由启用，停用源的路由永不产生事件。
- **REQ-139（27）** 通知目标草稿配置测试发送：`destinations.test` 只接受已存 id
  （`destination.service.ts:153-194`），保存坏配置前无法验证。
- **REQ-140（27）** 事件列表多选批量静默：告警风暴需逐条打开详情
  （`events-table.tsx:50-96`、`event-actions.tsx:19-33`），可复用 matcher 多指纹预填。

### security-exposure 车道（第 23 轮后首次）

- **SEC-19（24，MEDIUM，新）** 脱敏正则二次复杂度可被 Webhook 触发：后缀分支
  `[A-Za-z0-9._-]*` 在每个词边界回溯（`packages/core/src/redaction.ts:55-64,260`），
  40KB 点分词实测 922ms，按平方推算 1MB ≈ 10 分钟 CPU；调用点
  `intake.service.ts:81,195`、`delivery-execution.ts:152`、`log-safety.ts:94`。单进程同时
  承载 HTTP 与 worker，会整体失联。需 EXPERT_PANEL 在有界量词与扫描式实现间裁决，
  必须带性能回归测试且不得缩小脱敏覆盖。
- **SEC-20（20，新）** `configurationToTomlDocument` 无自防护（`packages/core/src/config.ts:184-202`）；
  当前调用链已 sanitize，无实际泄漏，建议断言拒绝未 sanitize 输入。
- **SEC-21（18，新）** `auth.client.ts:4` 以 type import 引用 `.server`；无运行时泄漏，
  违反 AGENTS 字面规则，建议类型下沉共享模块。
- 复核确认干净：导出/导入遮蔽、`include_secrets` 恒 false、SEC-2 参数化脱敏测试已闭环、
  存储/读取/发送边界投影、import protection、`xqvvu/vane` 无失效引用。
- 既有 SEC-9/11/12/13/14、Q-33、ARCH-14/17/35 仍开放，与 backlog 重复；ARCH-17 补充
  `operation-filters.tsx:599,644` 使用 `window.setTimeout`。

### ui-review 车道（真实浏览器，隔离实例 6191 + 临时 SQLite）

- **UI-9（27，已复现）** 静默时间时区错位：浏览器 Asia/Shanghai、设置 UTC，输入
  `10:00–12:00` 后列表显示 `02:00–04:00`，差 8 小时且无时区标注；截图
  `/tmp/tocsin-r31-suppression-form-tz.png`、`/tmp/tocsin-r31-suppression-list-tz-after.png`；
  证据 `suppression-form.ts:118-127,192-206`、`suppression-forms.tsx:312-336`、
  `operation-format.ts:8-15`。这是本轮唯一正确性级 UI 问题，建议下一轮优先修。
- **UI-4/5/6** 移动端 Sheet 无可见关闭按钮（`sidebar.tsx:209-229`）、折叠侧栏首屏闪动
  1 秒（`sidebar.tsx:86-98`）、两个同名侧栏开关（`dashboard-header.tsx:17` +
  `sidebar.tsx:307-319`）均浏览器复现。
- **UI-11** 已随 #195 修复；**UI-3/8/12** 文案问题分别复现（Payload 标签、中文混用
  dashboard、空态称「右侧表单」）。
- **UI-13（26，新）** REQ-129 部分阻断只在原生 `title` 可见，徽标仍显示「1 条可投递」，
  读屏与触屏无法感知；建议「1/2 可投递」或警示图标 + 可视隐藏文本。
- **UI-14（25，新）** 静默规则启停仍单击立即执行，与 #187 给告警源/路由/目标加的确认不一致。
- **REQ-138** 补充浏览器证据：已停用目标行仍显示「N 条生效」。
- 复验无回归：#191 加急解释面板（非飞书/无 ping 分支）、#187 三个停用确认的影响面数字、
  #184 空态/分页/390px 空态。**REQ-129 不阻塞发版**；整体视觉一致性可接受本版本发布。

### EXPERT_PANEL

本轮无新裁决；SEC-19 已进入 backlog 并排入下一轮专家小组（有界量词 vs 扫描式实现）。

### 发布（第 9.5 步）

- 三位专家一致通过：
  - 发布经理 **RECOMMEND**：`v0.1.0-beta.18..origin/main` 有 2 个用户可见变更（#194 feat、#195 fix）
    与 1 个 docs；建议预发布号递增为 `0.1.0-beta.19`，无同名 tag 冲突。
  - 阻断审计 **APPROVE（6/6）**：main CI success、无 open PR、唯一 `blocked-autonomous`
    REL-13（LICENSE）不阻断、无新增迁移、无依赖/锁文件变更、两个 PR 无 secret/auth 回归。
  - 运维/回滚 **SAFE**：Dockerfile/compose/entrypoint/端口/卷/环境变量零差异，SQLite schema
    与 beta.18 相同，回滚只需换回 beta.18 镜像、无需恢复数据。
- 版本：`0.1.0-beta.19`；PR #196 `chore(release): v0.1.0-beta.19` rebase 合并 `9f40eef`，
  main CI success。
- Tag：`v0.1.0-beta.19`（annotated，指向 `9f40eef`）；GitHub Release 已创建（prerelease）：
  https://github.com/xqvvu/tocsin/releases/tag/v0.1.0-beta.19
- 镜像：`registry.cn-hangzhou.aliyuncs.com/xqvvu/vane:0.1.0-beta.19`
  （linux/amd64 + linux/arm64，index digest
  `sha256:01f2bf2649cf13980fd46c8ebad555d62b95f15590f2cc3aea9120396d8fb29b`）。
- 构建：在 tag `v0.1.0-beta.19` 的干净检出上执行
  `docker buildx build --builder tocsin-multi --platform linux/amd64,linux/arm64 --provenance=false --sbom=false --push`。
- 回滚镜像：`0.1.0-beta.18`（index digest `sha256:b41ad663…`）。

### 下一轮优先项

1. UI-9（27）静默时间时区；UI-13（26）部分阻断可见性；UI-14（25）静默启停确认。
2. REQ-138（28）目标侧覆盖率；REQ-135（28）事件详情逐路由投递；REQ-137（28）解析器变更确认。
3. SEC-19（24）EXPERT_PANEL；SEC-20/21 AUTO_FIX。
4. REQ-125/130/131/136/139/140（27）。

## 2026-10-20（第 30 轮）

- 时间：2026-10-20 06:25 – 07:05 CST。
- 基线：`origin/main` @ `8be0faa`；本轮合并 #191（rebase `101a91a`）与 #192（rebase `d353c60`）。
- 类型：非 full-audit（backlog 有多个 ≥27 分候选，按第 1.5 步继续）；最近全量审计仍为第 1 轮
  （2026-10-18 13:30 CST）。
- 车道：`requirements` + `docs-drift` + `ui-triage`（判定 `defer`）。
  下一轮建议 `requirements` + `security-exposure` + `ui-triage`（`security-exposure` 第 23 轮后未跑）。
- `ui-triage`：`defer` —— 距第 27 轮真实浏览器评审（04:05）约 2h21m；04:05 后只有 2 个行为性
  UI 合并（#184 空态/分页、#187 停用确认），未达 3 个；8 条未解决 UI 发现全部是第 23/27 轮
  已定级并排期的旧项；#187 缺浏览器复验但只是既有表格上的确认对话框。硬性最晚
  **2026-10-22 04:05 CST**。
- `last_ui_review_at`：2026-10-20 04:05（未变）。
- 工作树：`agent-iteration` 仅用于并发锁；实现、验证、构建均在会话工作树
  `gallant-heisenberg-6a9864`。

### 本轮交付

- PR #191 `feat(console): explain why automatic urgent paging did not fire` —— **REQ-124**（28）。
  - 投递详情 `destinationMetadata` 投影自动加急判定所需的只读字段：
    `urgentAutoEnabled`、`urgentReceiverCount`（缺失时显式 0）、`urgentSeverities`
    （无 urgent 块为 `[]`，有块但未写级别按 schema 默认 `["critical"]`）
    （`destination.helpers.ts:190-206`）。
  - 新增纯函数 `explainMissingUrgentPings`，按触发链路顺序返回首个阻断原因：非飞书、
    投递未成功（带状态）、Webhook 模式、缺少飞书消息引用、未开启自动加急、无呼叫对象、
    告警非 firing（带状态）、级别被排除（带级别与允许列表）、其余归为「去重或触发失败」
    （`features/deliveries/model/urgent-ping-explanation.ts`）。
  - 「电话加急」标签无记录时渲染说明面板，并提示说明依据目标当前配置、配置变更后历史投递
    可能不同；有记录时表格不变（`delivery-urgent-ping-explanation.tsx`、
    `delivery-pings-table.tsx:26-28`）。
  - 中英文 i18n 同步；新增中文 mini-PRD `docs/prd/delivery-urgent-ping-explanation.md`。
  - 测试：新增 20 条（原因判定与顺序、元数据投影及凭据不外泄、两种渲染分支）；
    `vp check` 0 errors（11 条既有 warning）；`vp run -r test` 4/4、console 123 files /
    653 tests；`vp run -r build` 通过；PR CI success。
  - 未做浏览器实测：本机 6180 是主 checkout 的开发服务器，不提供本分支代码；本轮改动是
    既有 Alert 原语上的条件面板，组件测试覆盖了两种分支。若下一轮做 UI 批次，一并复验
    #187 的停用确认与该面板。
  - 环境注记：本工作树 `node_modules` 再次出现链接残缺（缺 `@rolldown/plugin-babel` 等），
    按既有记忆整体删除后 `vp install --frozen-lockfile` 解决。

### requirements 车道

新增 6 条候选（已写入 backlog，评分 /30）：

- **REQ-129（28）** 告警源覆盖率按「可投递性」计算：覆盖率只看启用路由、不看目标启用
  （`source-route-coverage.ts:12-26`），目标全停用时仍显示「已覆盖 N」，而 worker 不 claim
  （`delivery.repository.ts:228-230`）；纯 feature 派生 + 复用 destinations 查询。
- **REQ-130（27）** 补投可显式包含已静默目标：`skipExistingForEvent` 在抑制判断前执行且不筛
  状态（`delivery.repository.ts:91-110,553-562`），补投把 suppressed 目标静默算作 existing
  （`event-replay.service.ts:271-283`）；命令增 `includeSuppressed`，无迁移。
- **REQ-131（27）** 失败投递保留最近一次渲染载荷：adapter 失败结果已带 `renderedPayload`
  （`packages/destinations/src/types.ts:63-79`）但 `markFailed` 丢弃
  （`delivery-execution.ts:149-157`），载荷页失败投递永远显示 `{}`；DTO 已有字段。
- **REQ-132（26）** 路由补投按时间窗口选择事件：预览只扫最近 20 条
  （`event-replay.service.ts:196-201`、`intake.repository.ts:76-87`）；增 `range` 与
  `truncated`，复用 `OperationTimeRangeSchema`。
- **REQ-133（25）** 控制台可访问性收尾：zh-Hans aria 名称仍是英文
  （`zh-Hans.json:859`）、Sidebar 快捷键不可发现（`sidebar.tsx:39,280-304`）、投递错误全文
  只在不可聚焦 `title`（`deliveries-table.tsx:106-113`）。
- **REQ-134（22）** 自托管 Owner 离线恢复：只有邮件/密码且无 SMTP、无重置入口
  （`auth-options.ts:67-69`、`dashboard-user-menu-impl.tsx:174-182`）；实现前须 EXPERT_PANEL
  （安全与架构），优先容器内维护脚本而非匿名 HTTP 入口。

### docs-drift 车道

逐条复核了 DOC-23/24/36/37/39/40/41/42/43/44/45/46/47/48/49/50/51/52 并抽查 15 处其他断言。
最高价值发现：

- **DOC-49**：RC 清单开头称「仍然缺的只剩 E2E」，但同文件仍有 4 个未勾 gate：E2E
  （`:125`）、dedupe cleanup（`:167`）、provider fixtures（`:173`）、多版本 payload（`:174`）；
  `ci.yml` 无 E2E job。
- **DOC-37**：抑制 PRD 三处仍写「四个状态」（`:43,289,338`），实际 `DeliveryStateSchema`
  已是五状态含 `suppressed`（`packages/core/src/delivery/delivery.ts:5-11`）。
- **DOC-43**：README 页面/仓储/入口清单缺 Suppressions、Integrations，仍写 server functions
  （`README.md:34,36,55`）；实际入口是 oRPC router。
- **DOC-46/47**：post-MVP 方向 5 整段仍列为候选、方向 2 称缺投递缺口解释，但 CI、Docker smoke、
  发布文档、`route-match-gaps.ts:57` 均已落地。
- **DOC-36/50/51**：next-round 的 D2/D5、ADR 0008 工具链版本与命令、frontend-architecture
  页面/feature 清单均过期。
- 新增候选 **DOC-53..DOC-58**：模板引擎 PRD 问题陈述、MVP PRD 状态、模板编辑器 UX 评审状态头、
  ADR 0003 `server/functions/`、application-container 的无 importer `store.ts`、
  import-boundaries 的 `auth` namespace。
- DOC-52 经复核不可复现（文档无该「剩余范围」清单），建议关闭；DOC-24 的 `preview` 缺口仍成立。

### EXPERT_PANEL

本轮无新裁决；未触碰 schema、投递/路由/auth 语义或 secret 处理。REQ-134 标记为
「实现前须 EXPERT_PANEL」。

### 发布（第 9.5 步）

- 三位专家一致通过：发布经理 RELEASE（beta.17 后唯一用户可见变更 #191）；
  阻断审计 APPROVE（6/6：main CI 绿、无 open PR、无回归、无高优 `blocked-autonomous`、
  无 migration、无依赖/锁文件变更）；运维/回滚 SAFE（镜像配置、环境变量、端口、卷、
  entrypoint 未变；schema 相同，回滚只需换镜像）。
- 版本：`0.1.0-beta.18`；PR #192 `chore(release): v0.1.0-beta.18` rebase 合并 `d353c60`，
  main CI success。
- Tag：`v0.1.0-beta.18`（annotated，指向 `d353c60`）；GitHub Release 已创建（prerelease）：
  https://github.com/xqvvu/tocsin/releases/tag/v0.1.0-beta.18
- 镜像：`registry.cn-hangzhou.aliyuncs.com/xqvvu/vane:0.1.0-beta.18`
  （linux/amd64 + linux/arm64，index digest
  `sha256:b41ad66313045163d81ebb4ec2995e3fed620a37ebed354949a0f069f769d2b8`）。
- 回滚镜像：`0.1.0-beta.17`（index digest `sha256:ed2076d8…`）。

### 下一轮优先项

1. REQ-129（28）告警源可投递覆盖率；REQ-125（27）共享密钥显式清除；
   REQ-130/131（27）补投包含已静默目标、失败投递保留渲染载荷。
2. UI 批次（UI-9/UI-4/UI-8/UI-11/UI-12），并复验 #187 停用确认与 #191 加急说明；
   深度 UI 评审最晚 2026-10-22 04:05 CST。
3. docs-drift 两个 `docs:` PR（第 30 轮已刷新证据）。
4. REL-21（本地跑通 Playwright 后新增 `e2e.yml`）、SEC-9/13/14、REQ-119/120。

## 2026-10-20（第 29 轮）

- 时间：2026-10-20 05:41 – 06:05 CST。
- 基线：`origin/main` @ `f00cf8e`；本轮交付 #187（rebase 合并 `d19728b`）。
- 类型：非 full-audit（backlog 有多个 ≥27 分候选，按第 1.5 步继续）；最近全量审计仍为第 1 轮
  （2026-10-18 13:30 CST）。
- 车道：`requirements` + `release-infra` + `ui-triage`（判定 `defer`）。
  下一轮建议 `requirements` + `docs-drift` + `ui-triage`（`docs-drift` 第 26 轮后未跑）。
- `ui-triage`：`defer` —— 距第 27 轮真实浏览器评审（04:05）仅 1h37m；04:05 后只有 1 个行为性
  UI 合并（#184 空态/分页）和 1 个注释提交；8 条未解决 UI 发现全部是第 23/27 轮已定级并排期的
  旧项，无新增未分诊发现；第 28 轮有隔离实例浏览器验证记录。硬性最晚 2026-10-22 04:05。
- `last_ui_review_at`：2026-10-20 04:05（未变）。
- 工作树：`agent-iteration` 仅用于并发锁；实现、验证、构建均在会话工作树
  `awesome-lumiere-3bdb4e`。

### 本轮交付

- PR #187 `feat(console): confirm disable actions with blast-radius copy` —— **NEW-A**（29）。
  - 告警源/路由/通知目标三个行内启停按钮：仅在「启用 → 停用」方向弹 `AlertDialog`，
    「停用 → 启用」保持单击立即执行。
  - 影响面复用既有前端派生函数：告警源显示匹配的已启用路由数（含 catch-all），
    通知目标显示引用它的已启用路由数，路由显示 `destinationIds.length`。
  - 文案说明排队投递的去向：停用告警源后已入队投递仍会发送（`delivery.repository.ts:222-234`
    不按 source 过滤）；停用路由/目标后排队投递暂停到重新启用。
  - 新增中文 mini-PRD `docs/prd/disable-config-confirmation.md`；中英文 i18n 同步。
  - 测试：新增告警源「有路由/无路由/启用不弹窗」、路由「目标数」与目标「无路由」确认用例；
    更新既有目标行操作测试为先确认后回调。
  - 验证：`vp check` 0 errors（11 条既有 warning）；`vp run -r test` 121 files / 636 tests；
    `vp run -r build` 通过；PR CI success。
- 未做 REL-21（新增 `e2e.yml`）：本地 Playwright 1.64.1 期望 Chromium 1248，缓存只有 1234，
  必须先下载；按 SKILL「新增 workflow 必须本地跑通」的要求，本轮不冒险交付未验证 workflow。
  下一轮按 backlog 的验证清单执行。

### requirements 车道

新增 5 条候选：REQ-124（28）投递详情解释「加急为什么没有发生」；REQ-125（27）告警源额外
共享密钥显式清除；REQ-126（26）飞书应用凭证变更前验证；REQ-127（26）加急呼叫新鲜度上限；
REQ-128（26）手动加急披露去重跳过。方向从「搜索/过滤」转向值班协作与凭据生命周期；均通过
Product charter，且与既有 REQ-17/63/71/76/106、NEW-F/NEW-H 做了边界划分。

### release-infra 车道

- REL-21/REL-1 仍未关闭：远端 workflow 只有 `ci.yml`（`total_count=1`）；`playwright.config.ts:22-29`
  已配好 CI retries/reporter/trace；`playwright.config.ts:7-9` 注释却声称已有独立 workflow。
- REL-22：现有 spec 只覆盖 setup/Source/Destination/webhook/Event；Route、Destination test/preview、
  Delivery、过滤、失败 retry 均缺；`alert-flow.spec.ts:9-16` 的测试名声称覆盖 route/deliver，属注释漂移。
- REL-24：仍无 fixture 目录；6 个 adapter 共 19 个代表性 payload、32 个用例（旧记 31 已过期）。
- REL-5/8：`scripts/` 仍无 `artifact-smoke.sh`；生产 bundle 启动只被手工 Docker smoke 覆盖。
- REL-9：`migrate.test.ts` 6 处建库全部 `:memory:`；runner 台账无 checksum。
- REL-16/23：`branches/main/protection` 404、`rulesets` 为空，红 CI 仍可合并。
- 发布文档当前与「E2E 未接入 CI」的现状一致，无虚假声明；若未来加 `e2e.yml`，需同步 8 处断言。

### EXPERT_PANEL

本轮无新裁决；未触碰 schema、投递/路由/auth 语义或 secret 处理。

### 发布（第 9.5 步）

- 三位专家一致通过：发布经理 RELEASE（beta.16 后 1 个用户可见 feat + 1 个 docs，建议
  `0.1.0-beta.17`）；阻断审计 APPROVE（6/6：main CI 绿、无 open PR、无新增回归、无高优
  `blocked-autonomous` 阻断、无 migration/schema、无依赖变更、版本号可用）；运维/回滚 SAFE
  （镜像配置、环境变量、migration plan、依赖均未变；升级只需换镜像重启，回滚换回 beta.16）。
- 版本：`0.1.0-beta.17`；PR #189 `chore(release): v0.1.0-beta.17` rebase 合并 `58dd692`，
  main CI success。
- Tag：`v0.1.0-beta.17`（annotated，指向 `58dd692`）；GitHub Release 已创建（prerelease）：
  https://github.com/xqvvu/tocsin/releases/tag/v0.1.0-beta.17
- 镜像：`registry.cn-hangzhou.aliyuncs.com/xqvvu/vane:0.1.0-beta.17`
  （linux/amd64 + linux/arm64，index digest
  `sha256:ed2076d80f4458a93e893fa073a572c48625e9c60098bca7f4f93f2f9f92def5`）。
- 回滚镜像：`0.1.0-beta.16`（index digest `sha256:9788b4b8…`）。

### 下一轮优先项

1. REQ-124（28）加急未发生解释；REQ-125（27）共享密钥显式清除。
2. `docs-drift` 车道（轮转）+ REL-21（本地跑通后新增 `e2e.yml`）。
3. UI 小成本批次 UI-9/UI-4/UI-8/UI-11/UI-12。
4. NEW-B/NEW-C（27）与 REQ-119/120（27）设置项。

## 2026-10-20（第 28 轮）

- 时间：2026-10-20 04:25 – 05:00 CST。
- 基线：`origin/main` @ `a985f53`；本轮交付 #184。
- 类型：非 full-audit（backlog 有多个 ≥27 分候选，按第 1.5 步继续）；最近全量审计仍为第 1 轮
  （2026-10-18 13:30 CST）。
- 车道：`requirements` + `architecture` + `ui-triage`（判定 `defer`）。
  下一轮建议 `requirements` + `release-infra` + `ui-triage`（`docs-drift` 顺延）。
- `ui-triage`：`defer` —— 距第 27 轮真实浏览器评审（04:05）仅 21 分钟；04:05 后只有 1 个 docs
  提交、0 个 UI 变更；11 条未解决 UI 发现全部是刚排期的已知项且有验证记录。建议本轮做既定
  UI 切片，不重复深度评审。
- `last_ui_review_at`：2026-10-20 04:05（未变；本轮做了浏览器复验，但不是完整 UI 评审）。
- 工作树：`agent-iteration` 仅用于并发锁；实现、验证、构建均在会话工作树 `zen-darwin-1a09af`。

### 本轮交付

- PR #184 `feat(console): tell empty lists apart from empty filters` —— **UI-2 + UI-7 + UI-10**。
  - 空态接收 `hasActiveFilters`，区分「还没有数据」与「筛选无匹配」，后者提供内联「重置筛选」；
    新增 `hasOperationFilters(search)`（`operation-search.ts:69`）。
  - 分页条只在有行时渲染（`operations-table.tsx:177`、`events-table.tsx:122`、
    `deliveries-table.tsx:159`、`suppression-hits-table.tsx:130`）；删除随之失效的
    `emptyRangeLabel` 入参（8 个调用点）。
  - 空态外层固定为视口宽度并保持粘性（`operations-table.tsx:148`），表头保留最小宽度可横向滚动。
  - 删除无 importer 的 `operations-panel.tsx` / `detail-panel.tsx`（FIX-5 的一半）。
  - 新增中文 mini-PRD `docs/prd/operations-empty-state.md`。
  - 验证：`vp check` 0 errors（11 条既有 warning）；`vp run -r test` 4/4（console 636 tests）；
    `vp run -r build` 通过；CI 见 PR。
  - 浏览器实测：隔离实例 `localhost:6190` + 临时 SQLite，桌面 1440 与移动 390；
    Events/Deliveries/Sources 空态可见、筛选空态与重置生效、空表无分页条；
    截图 `/tmp/tocsin-r28-*.png`（未提交二进制）。
  - 环境注记：本工作树 `node_modules` 链接残缺（`@types/node` 缺失）使 `vp check` 报
    「Invalid tsconfig」与 3376 个伪错误；按既有记忆整体删除 `node_modules` 后
    `vp install --frozen-lockfile` 解决。

### requirements 车道

新增 5 条需求与 2 条缺陷候选：REQ-119（27）接入去重窗口可配置、REQ-120（27）投递最大尝试次数
可配置、REQ-121（24）Source Token 轮换宽限期、REQ-122（23）领域错误文案本地化、
REQ-123（25）配置列表最近更新时间；Q-40（24）语言解析顺序与注释/文案不一致、
Q-41（22）配置名 UNIQUE 冲突返回不透明 500。方向 4（搜索/过滤/排障）已饱和，本轮候选转向
运维控制、凭据轮换与配置一致性。

### architecture 车道

无新增违规：services 不抛 `ORPCError`、容器是唯一装配点、entrypoint 厚度、feature 形状、
`components/common` 纯度、import 保护、路由职责、queryOptions 均与 AGENTS.md 一致；
已知 ARCH-1/2/3/5/14/15 未恶化。新增一条低优先候选 ARCH-35（16）：5 个模块过度使用
`client-only` 标记（`components/ui/dropdown-menu.tsx:1`、`routes/-login-form-impl.tsx:1`、
`routes/-setup-form-impl.tsx:1`、`i18n/language-switcher-impl.tsx:1`、
`shell/dashboard-user-menu-impl.tsx:1`）。

### EXPERT_PANEL

本轮无新裁决；未触碰 schema、投递/路由/auth 语义或 secret 处理。

### 发布（第 9.5 步）

- 三位专家一致通过：发布经理 RELEASE（自 beta.15 起 1 个 feat + 3 个 docs，建议 beta.16）；
  阻断审计 APPROVE（6/6：main CI 绿、无 open PR、无回归、无阻塞 blocked-autonomous、
  无 migration、无依赖变更）；运维/回滚 SAFE（镜像配置与 SQLite 兼容）。
- PR #185 `chore(release): v0.1.0-beta.16` rebase 合并 `2d4247b`；main CI success。
- Tag：`v0.1.0-beta.16`（annotated，指向 `2d4247b`）；GitHub Release 已创建（prerelease）：
  https://github.com/xqvvu/tocsin/releases/tag/v0.1.0-beta.16
- 镜像：`registry.cn-hangzhou.aliyuncs.com/xqvvu/vane:0.1.0-beta.16`
  （linux/amd64 + linux/arm64，index digest
  `sha256:9788b4b86bc55a0cbd576142313ff3855131a3386ae4bd9b7db0720ecb1d2e47`）。
- 回滚镜像：`0.1.0-beta.15`（index digest `sha256:a63d5cb9…`）。

### 下一轮优先项

1. UI-9 静默时间时区错位（27）+ UI-4/UI-8/UI-11/UI-12 小成本批次。
2. NEW-A（29）+ REQ-111（27）；REQ-119/120（27）设置项。
3. `release-infra` 车道（轮转）+ REL-21 独立 `e2e.yml`。
4. docs-drift 批次 DOC-46..52 顺延。

## 2026-10-20（第 27 轮）

- 时间：2026-10-20 03:25 – 04:35 CST。
- 基线：`origin/main` @ `0d87db0`；本轮合并 #180（`29c0745`）与发布 PR #181（`9871a5a`）。
- 类型：EXPERT_PANEL 既定事项落地（PR B）+ requirements/docs-drift/ui-review 三车道（非
  full-audit）；最近全量审计仍为第 1 轮（2026-10-18 13:30 CST）；backlog 有 ≥27 分候选，
  按第 1.5 步继续。
- 车道：`requirements` + `docs-drift` + `ui-triage`（判定 `review_now` → 追加 `ui-review`）；
  下一轮建议 `requirements` + `architecture` + `ui-triage`，UI 切片优先。
- `ui-triage`：`review_now` —— 距上次评审约 3.1h（<48h）、评审后 2 个 UI 合并（<3），但
  7 条未解决 UI 发现（≥2）与 0 次浏览器验证记录构成强信号。
- `last_ui_review_at`：2026-10-20 04:05（本轮完成浏览器实测）。
- 工作树：`agent-iteration` 仅用于并发锁；实现、验证、构建均在会话工作树
  `gallant-feynman-ade31f`。

### 本轮交付

- PR #180 `fix(console): redact event copy at read and send boundaries` —— **SEC-7 + SEC-17**
  （第 25 轮 EXPERT_PANEL 决策 PR B，rebase 合并 `29c0745`）。
  - `packages/core/src/redaction.ts` 新增 `redactNormalizedEvent`、
    `redactRouteMatchResults`、`redactEventRecord`、`redactJsonText`；`redactHeaders`
    对非敏感头值也跑 `redactText`。
  - 读取边界：`history.listEvents`（title）、`history.getEventDetail`（事件 + 路由证据 +
    providerMetadata + raw payload/headers + idempotencyKey）、`history.listDeliveries`
    （eventTitle）、`deliveries.get`（事件 + 历史 rendered payload）。
  - 发送边界：`delivery-execution` 用投影后的 normalized event 与 deep-redacted payload
    渲染通知/模板；`event-replay` 预览标题与命中证据投影，匹配/补投仍读原值。
  - UI：脱敏标签禁用「按值静默」并说明原因；投递详情在事件内容已脱敏时不再重算当前
    路由证据，改为提示以接入快照为准。
  - 验证：`vp check` 0 errors（11 条既有 warning）；`vp run -r test` 4/4（console 626
    tests）；`vp run -r build` 通过；CI success。
  - 决策记录更新：`docs/planning/decisions/credential-redaction-boundaries.md`。

### requirements 车道

新增 5 个候选（均通过 charter）：NEW-D（27）顶栏全局 ID 快速查找；NEW-E（27）通知目标
只读配置详情；NEW-F（27）飞书应用删除/换密前影响面预检；NEW-G（26）详情复制直达链接；
NEW-H（25）一键检测全部飞书应用凭证。

### docs-drift 车道

新增 7 条：DOC-46 方向 5 仍整段列为候选；DOC-47 方向 2 缺口描述过期；DOC-48 四个已交付
mini-PRD 缺状态头；DOC-49 RC 概览漏列三类剩余 gate；DOC-50 ADR 0008/restructure-plan
版本与命令过期；DOC-51 frontend-architecture 清单不全；DOC-52 adapter-extensibility
剩余范围漏 F3。

### ui-review（浏览器实测）

隔离实例（localhost:6190 + 独立临时 SQLite，`/setup` 建房），桌面 1440 与移动 390 实测；
6180 未触碰。截图：`/tmp/tocsin-ui-review-r27/shots/`。
- 高：静默时间时区错位（UI-9，表单本地时间 vs 列表 UTC 差 8 小时）。
- 中高：移动端空态被横向卷出屏幕（UI-10）；UI-2、UI-4、UI-7 复现。
- 中：静默停用按钮显示原始 i18n key（UI-11）；登录/初始化/toast 混用 dashboard（UI-8
  扩展）；空态文案与实际交互不符（UI-12）；payload 大小写不一致（UI-3 扩展）。
- UI-5、UI-6 仍存在；搜索防抖与 URL 同步未回归。
- 本轮未实现 UI 切片（时间预算用于 PR B 与发布），下一轮优先闭环 UI-2 + UI-7 + UI-10
  的空态/分页一体化修复。

### 独立 diff 评审

`code-review`（低 effort）返回 5 条，均已在 #180 第二个 commit 修复或记录：
1. 脱敏标签预填静默规则永不命中 → 禁用该动作。
2. 投递页用脱敏事件重算当前规则会误报 → 改为快照为准。
3. 历史 rendered payload 字符串叶子未做赋值脱敏 → 新增 `redactJsonText`。
4. provider 控制的 idempotencyKey 未纳入投影 → 已纳入；fingerprint 按决策保持原文。
5. 非敏感头值未做值形态脱敏 → `redactHeaders` 补齐。

### EXPERT_PANEL

本轮无新裁决；执行第 25 轮 `credential-redaction-boundaries` 的 PR B，决策事项已闭环。
仍待后续裁决：REQ-93、Q-8、REQ-107。

### 发布（第 9.5 步）

- 三位专家一致通过：发布经理 RELEASE（建议 beta.15）；阻断审计 APPROVE（7/7）；
  运维/回滚 SAFE（仅换镜像，回滚 beta.14）。
- PR #181 `chore(release): v0.1.0-beta.15` rebase 合并 `9871a5a`；main CI success。
- Tag：`v0.1.0-beta.15`（annotated，指向 `9871a5a`）；GitHub Release 已创建
  （prerelease）：https://github.com/xqvvu/tocsin/releases/tag/v0.1.0-beta.15
- 镜像：`registry.cn-hangzhou.aliyuncs.com/xqvvu/vane:0.1.0-beta.15`
  （linux/amd64 + linux/arm64，index digest
  `sha256:a63d5cb9db5dfdcef8530b3d7eb8c829a0792611fe30e18969ba3be113e0c1da`）。
- 回滚镜像：`0.1.0-beta.14`（digest `sha256:3fcdfd18…`）。

### 其他

- Obsidian 同步：`obsidian-vault` skill 未在当前会话暴露，按 AGENTS.md fallback
  记录并跳过。
- 工作树：结束前删除会话工作树 `node_modules` 与 `agent-iteration` 锁目录。

### 下一轮优先项

1. **UI 空态/分页切片**：UI-2 + UI-7 + UI-10 一次闭环（区分筛选无匹配、空表隐藏分页、
   移动端空态移出横向滚动），配浏览器验证。
2. **NEW-A（29）+ REQ-111（27）**：停用断流影响确认、Owner 密码确认。
3. **UI-9（27）** 静默时间时区错位；**UI-4/UI-11/UI-12** 小成本修复。
4. **docs-drift 批次** DOC-46..52（单 docs PR）。
5. 其余见 backlog「下一轮优先项」。

## 2026-10-20（第 26 轮）

- 时间：2026-10-20 02:26 – 03:10 CST。
- 基线：`origin/main` @ `db3ef12`；本轮合并 #176（`999252b`、`4c08f5d`）、#177
  （`8dcff41`）、#178（`ed700d7`）。
- 类型：EXPERT_PANEL 裁决落地（PR A）+ release-infra AUTO_FIX + 三车道审计（非
  full-audit）；最近全量审计仍为第 1 轮（2026-10-18 13:30 CST）；backlog 有 ≥27 分
  候选，按第 1.5 步继续。
- 车道：`requirements` + `release-infra` + `ui-triage`（决策 `defer`）；下一轮建议
  `requirements` + `docs-drift` + `ui-triage`。
- `ui-triage`：`defer` —— 距第 23 轮浏览器实测约 2.1 小时，自评审后仅 2 个 UI 合并；
  7 条未解决 UI 发现均为既有项；0 次浏览器验证记录。建议直接实现 UI-2/UI-4。
- `last_ui_review_at`：2026-10-20 00:18（未变）。
- 工作树：`agent-iteration` 仅用于并发锁；实现与验证在会话工作树
  `fervent-newton-85c914`。`node_modules` 链接残缺，整体删除后
  `vp install --frozen-lockfile` 解决。

### 本轮交付

- PR #176 `fix(core): redact credential-shaped text and re-check rows on read` ——
  **SEC-8 + SEC-10/15/16/18（第 25 轮 EXPERT_PANEL 决策 PR A）**。
  - 新增 `redactCredentialText`：认证 scheme（Bearer/Basic/Token，值须 ≥8 字符且含
    数字或符号）、`xox[baprs]-`、URL userinfo 密码、Slack/飞书/Lark webhook path；
    组合进 `redactText` 与 `redactJsonValue`。
  - 读取层在 `delivery.helpers`、`oncall.helpers`、`history.repository` 幂等复核旧行；
    不做历史回填。parser 仍读原值，解析/匹配/去重/回放语义不变。
  - 修复既有误伤：赋值正则补左词边界（`max_tokens: 4096`）；收紧认证值形态
    （`Basic authentication failed` 保持可读）。
  - 验证：`vp check` 0 errors（11 条既有 warning）；`vp run -r test` 4/4
    （console 621 tests）；`vp run -r build` exit 0。
- PR #177 `chore(docker): exclude e2e artifacts from the build context` —— **REL-17**。
  - `.dockerignore` 增加 `**/test-results`、`**/playwright-report`、`**/blob-report`、
    `**/.playwright`、`.wt`，与 `.gitignore` 对齐；防止本地 trace（可能含 token）
    进入镜像。
  - 验证：`vp fmt --check`、`vp check` 0 errors。

### requirements 车道

新增 8 个候选（均通过 charter）：
- REQ-111（27）初始化 Owner 密码确认与不可恢复提示；REQ-112（26）事件投递计数下钻；
  REQ-113（26）复制筛选视图链接；REQ-114（25）重试前预览；REQ-115（25）首次部署空态与
  「右侧栏」过期文案；REQ-116（25）每页条数；REQ-117（23）路由/静默创建失败保留表单；
  REQ-118（22）provider 贡献指南与 scaffold。
- 附带缺陷候选：Q-38（24）Source token 复制失败仍弹成功 toast
  （`source-token-notice-panel.tsx:48-55,65-72`）；Q-39（20）错误页把
  `[REDACTED_TRACE_ID: generated_server_side]` 当 trace ID 展示
  （`dashboard-error.tsx:61-63`）。

### release-infra 车道

- RC gate 复核：E2E workflow FAIL（`.github/workflows` 仅 `ci.yml`）；E2E 覆盖 PARTIAL
  （无 Route/Delivery/retry）；provider fixture FAIL；dedupe cleanup 无界 DELETE 仍成立；
  Docker smoke 作为本地人工 gate PASS；main 无 required checks（ruleset 为空）。
- E2E 接入 CI 可行且无需 service/secret：`playwright.config.ts` 已有 webServer/retries/
  reporter；需显式安装 Chromium 1248，并在测试前清理 `/tmp/tocsin-e2e.sqlite`。
- 建议独立 `e2e.yml`；提交前必须本地跑通 `playwright install chromium` +
  `playwright test`。新增 REL-21/22/23/24 候选。

### ui-triage

`defer`，信号：距上次评审 2.1h（<48h）、评审后 2 个 UI 合并（<3）、7 条既有 UI 发现、
0 次浏览器验证。建议直接实现 UI-2/UI-4，而不是重开评审。

### EXPERT_PANEL

本轮无新裁决；执行第 25 轮 `credential-redaction-boundaries` 的 PR A，PR B
（SEC-7 + SEC-17）排入第 27 轮。

### 发布（第 9.5 步）

- 三位专家一致通过发布：
  - **发布经理**：RELEASE；#176 属用户可见安全修复（诊断文本与 raw payload 字符串变化，
    旧行读取即生效）；#177 仅构建上下文。建议 `0.1.0-beta.14`。
  - **阻断审计**：APPROVE；main CI success、0 open PR、迁移零 diff、无 secret 误提交、
    版本无冲突；`blocked-autonomous` 仅 LICENSE（非运行时）。
  - **运维/回滚**：SAFE；镜像配置/SQLite/依赖零 diff；替换镜像即可；回滚
    `0.1.0-beta.13`。
- PR #178 `chore(release): v0.1.0-beta.14` rebase 合并 `ed700d7`；main CI success。
- Tag：`v0.1.0-beta.14`（annotated，指向 `ed700d7`）；GitHub Release 已创建
  （prerelease）。
- 镜像：`registry.cn-hangzhou.aliyuncs.com/xqvvu/vane:0.1.0-beta.14`
  （linux/amd64 + linux/arm64，index digest
  `sha256:3fcdfd188c05a55acefc019cf02205998845cc53515a7cb091822a5b55df8d3c`）。
- 回滚镜像：`0.1.0-beta.13`（digest `sha256:3501c616…`）。

### 其他

- 本轮未做浏览器验证：改动为服务端脱敏与构建上下文，由 core/console 测试覆盖。
- Obsidian 同步：`obsidian-vault` skill 未在当前会话暴露，按 AGENTS.md fallback
  记录并跳过。
- 工作树：结束前删除会话工作树 `node_modules` 与 `agent-iteration` 锁目录。

### 下一轮优先项

见 backlog「下一轮优先项」第 1–16 项；首位为 SEC-7 + SEC-17（PR B），其次 NEW-A、
REQ-111。

## 2026-10-20（第 25 轮）

- 时间：2026-10-20 01:37 – 03:05 CST。
- 基线：`origin/main` @ `5edc94c`；本轮合并 #171（`4bfed71`）、#172（`2807ce7`）。
- 类型：需求切片 + 高危修复 + 三车道审计 + EXPERT_PANEL（非 full-audit）；最近全量审计仍为
  第 1 轮（2026-10-18 13:30 CST）；backlog 有大量 ≥27 分候选，按第 1.5 步继续。
- 车道：`requirements` + `security-exposure` + `ui-triage`（决策 `defer`）；下一轮建议
  `requirements` + `release-infra`。
- `ui-triage`：`defer` —— 距第 23 轮浏览器实测（2026-10-20 00:18）仅约 80 分钟，
  自评审后零 UI 合并（6 个提交全是 docs/release/服务端修复）；建议直接实现已确认的 UI-1。
- `last_ui_review_at`：2026-10-20 00:18（未变）。
- 工作树：`agent-iteration` 仅用于并发锁；实现与验证在会话工作树
  `epic-carson-28ba8c`。依赖链接再次残缺，整体删除后 `vp install --frozen-lockfile` 解决。

### 本轮交付

- PR #171 `fix(console): keep operation search text local until typing pauses` —— **UI-1 + REQ-78**。
  - 搜索框改为本地草稿 + 300ms 防抖后才写 URL；`pruneSearch` 保留输入中的空格，仅
    `operationFiltersFromSearch` 在构造服务端谓词时 trim；重置筛选与搜索 chip 清除会取消
    未提交草稿。修复快速输入 `Disk usage` 只剩 `se`、慢速输入丢空格、逐键请求三个问题。
  - 验证：`vp check` 0 errors（11 条既有 warning）；`vp run -r test` 4/4（console 616 tests）；
    `vp run -r build` 通过。
- PR #172 `feat(console): silence an event label from the label list` —— **REQ-109**。
  - 每个标签旁新增图标按钮「静默标签 key=value」，复用既有创建静默对话框；新增
    `suppressionDefaultsFromLabel`（source + `equals` 标签，指纹为空）；PRD
    `docs/prd/event-label-silence.md`。
  - 验证：`vp check` 0 errors；`vp run -r test` 4/4（console 614 tests）；
    `vp run -r build` 通过。
- 两个 PR 均 rebase 合并且 CI success，无 migration/contract 变化。

### requirements 车道

- REQ-109/108/110 复核仍成立；REQ-109 本轮已交付。
- 新候选：
  - **NEW-A（29）** 停用 Source/Route/Destination 前的断流影响确认：三个启停按钮单击即执行
    （`source-actions.tsx:105-117`、`destinations-actions.tsx:94-106`、
    `routes-section.tsx:208-217`），停用后接入拒绝（`intake.service.ts:69-72`）、路由停止匹配
    （`:98-99`）、pending 投递不再 claim（`delivery.repository.ts:228-229`），控制台只会变安静。
  - **NEW-B（27）** 静默窗口快捷时长：仅有 `datetime-local` 与固定 2 小时默认
    （`suppression-form.ts:118-128`、`suppression-forms.tsx:310-338`）。
  - **NEW-C（27）** 路由保存前「目标全停用」警示：选择器不显示启停状态
    （`route-forms.tsx:987-1018`），全停用时路由可保存但永不投递。

### security-exposure 车道

- 复核 SEC-7/8/9/11/12/13/14/15/16 全部仍成立；SEC-10 与 SEC-16 实质重复，已合并。
- 新发现：
  - **SEC-17（24）** providerMetadata 入库/出站前无统一脱敏兜底：文档称已兜底
    （`adapter-extensibility.md:260-261`），实际 `intake.service.ts:114` 原样落库；
    grafana/alertmanager 的 `externalURL` 可含 userinfo 且 DTO 直接返回。
  - **SEC-18（22）** raw payload 字符串叶子不做值形态扫描：`redaction.ts:74-86` 只按 key 判断。
- per-kind 脱敏覆盖：kind 维度已由 registry parity 与导出测试锁住；缺口在「表面」——
  列表 DTO 只测 slack、编辑草稿只测 feishu/generic、attempt/preview 无 per-kind 参数化。
- 结论：本轮最值得的安全改动是 SEC-8 高置信值形态 helper，并可一并收敛
  SEC-10/11/12/13/15/16 与两条新发现。

### EXPERT_PANEL：SEC-7 + SEC-8

- **安全与可靠性专家**：两项均成立；SEC-7 出站传播风险略高；必须补
  `routeMatches[].checks[].actual` 投影；拒绝解析期脱敏与历史行回填。
- **产品与运维专家**：两项都值得现在做，SEC-8 先行（只影响诊断信息）；接受「存储/备份
  仍是原文」的残余风险，防护目标是通知外发与屏幕共享；误伤反例必须锁死。
- **独立评估者**：SEC-8 可独立落地且可测；SEC-7 在补齐 8 类边界清单前不是可执行规格；
  旧 `rendered_payload_json` 必须读取投影；配置导出/编辑器草稿必须显式排除。
- **分歧处理**：PR 组织存在分歧（一个 PR 两 commit vs 两个 PR）。按最保守且可逆原则选择
  **两个 PR、SEC-8 先行**；两项都只做读取/发送边界投影，不改存储。
- 决策记录：`docs/planning/decisions/credential-redaction-boundaries.md`。
- 实现排期：第 26 轮先 PR A（SEC-8 + SEC-10/15/16/18），再 PR B（SEC-7 + SEC-17）。

### 发布（第 9.5 步）

- 三位专家一致通过发布：
  - **发布经理**：自 beta.12 以来有 2 个用户可见变更（#171、#172），RELEASE，
    建议 `0.1.0-beta.13`。
  - **阻断审计**：main CI success、无其他 open PR、migrations 零 diff、无 secret 误提交；
    唯一 FAIL 是版本未 bump，PR #174 修复后转 APPROVE。
  - **运维/回滚**：SAFE；Dockerfile/compose/env/schema 零 diff，回滚只需换回 beta.12 镜像。
- PR #174 `chore(release): v0.1.0-beta.13` rebase 合并 `9232200`；main CI success。
- Tag：`v0.1.0-beta.13`（annotated，指向 `9232200`）；GitHub Release 已创建（prerelease）。
- 镜像：`registry.cn-hangzhou.aliyuncs.com/xqvvu/vane:0.1.0-beta.13`
  （linux/amd64 + linux/arm64，index digest
  `sha256:3501c616418ec1772b3bef00dd4222803550bb26a16b3612e56299af500ade4b`）。
- 回滚镜像：`0.1.0-beta.12`（digest `sha256:552e3590…`）。

### 其他

- Q-30 已于第 24 轮闭环；本轮未新增 migration、未改投递/路由/auth 语义。
- 本轮未做浏览器验证：改动为搜索交互与标签静默，由组件测试覆盖；UI-1 的浏览器证据来自
  第 23 轮实测。
- Obsidian 同步：**本轮跳过** —— `obsidian-vault` skill 未在当前会话暴露；按 AGENTS.md
  的 fallback 规则记录后继续，不在没有 skill 的情况下手工猜测 vault 结构。
- 工作树：结束前删除本会话工作树 `node_modules` 与 `agent-iteration` 锁目录。

### 下一轮优先项

1. SEC-8 / SEC-7 按决策记录实现（PR A → PR B）。
2. NEW-A（29）停用配置前的断流影响确认。
3. REQ-108（28）、REQ-73（28）、REQ-48（28）、REQ-52（28）、REQ-110（28）。
4. NEW-B/NEW-C（27）、REQ-103/104（27）。
5. SEC-9/SEC-13/SEC-14 等 AUTO_FIX 小项。
6. 车道轮转：`requirements` + `release-infra` + `ui-triage`；`docs-drift`/`architecture`
   留待第 27 轮。

## 2026-10-20（第 24 轮）

- 时间：2026-10-20 00:39 – 01:20 CST。
- 基线：`origin/main` @ `ee86534`；本轮合并 #168，并发布 #169（`0.1.0-beta.12`）。
- 类型：EXPERT_PANEL 语义修复 + 三车道审计（非 full-audit）；最近全量审计仍为
  第 1 轮（2026-10-18 13:30 CST）；backlog 有大量 ≥27 分候选，按第 1.5 步继续。
- 车道：`requirements` + `quality` + `ui-triage`（决策 `defer`）；下一轮建议
  `requirements` + `security-exposure` + `release-infra`。
- `ui-triage`：`defer` —— 距第 23 轮浏览器实测仅约 24 分钟，自评审后无 UI 合并；
  建议直接实现 UI-1（搜索吞字符），而不是再次评审。
- `last_ui_review_at`：2026-10-20 00:18（未变）。
- 工作树：`agent-iteration` 仅用于并发锁；实现与验证在会话工作树
  `zen-panini-2e1e3e`。依赖 `vp install --frozen-lockfile` 后完整可用。

### 本轮交付

- PR #168 `fix(console): stop repeating urgent calls when persistence fails` —— **Q-30**。
  - 服务商已受理加急呼叫后，`markFired` 写库失败不再落入可重试分支；幂等重试一次，
    仍失败则写终态 `retryAt: null`，错误文案明确「呼叫已发出、状态写入失败」。
  - 兜底写入也失败时只记录日志并返回 `failed`，不抛错中断批次；不修改
    `reclaimStaleRunning`、不新增状态或 schema。
  - 新增 `oncall-execution.test.ts` 覆盖三条路径；决策记录
    `docs/planning/decisions/oncall-fired-persistence-failure.md`。
  - 验证：`vp check` 0 errors（11 条既有 warning）；`vp run -r test` 4/4
    （console 117 files / 612 tests）；`vp run -r build` 通过。

### EXPERT_PANEL：Q-30

- **安全与可靠性专家**：重复电话为 P0；受理后的持久化必须移出重试路径，兜底写入也
  必须被捕获；`markFired` 幂等可重试一次；不建议把 `reclaimStaleRunning` 改为终态
  （会把重复呼叫换成漏呼）。建议 Q-8 同批修复。
- **产品与运维专家**：重复电话 P0、重复聊天 P2；终态 `failed` 可能误导值班手动再呼，
  因此错误文案必须写明已呼叫；Q-8 应单独处理（投递成功还承载自动加急语义）。
- **独立评估者**：方案可测；只作用于 `result.ok` 分支，呼叫前失败仍可重试；残留的
  崩溃窗口需记录、不能宣称严格 at-most-once；回滚为单提交 revert。
- **分歧处理**：Q-8 是否同批存在分歧，按最保守且可逆原则选择单独处理。三位专家对
  「已呼叫则不得重排、不得抛错」一致。
- 决策记录：`docs/planning/decisions/oncall-fired-persistence-failure.md`。

### 车道发现

- **requirements**：复核 REQ-73（28）、REQ-48（25）、REQ-52（28）仍有效；新增
  REQ-108（多值属性筛选，28）、REQ-109（事件标签一键静默，29）、REQ-110（静默即将
  到期提示，28）。首选 REQ-109：纯前端、复用现有静默表单与 matcher、无契约/迁移。
- **quality**：确认 Q-30/Q-8/Q-26/Q-31/Q-10/Q-27/Q-28 仍有效；补充 Q-10 的新证据
  （`settings.get()` 在 `claimNext` 之后，读取失败会让整批滞留 `running`）；新增
  Q-36（自动加急部分入队被静默吞掉，22）、Q-37（oncall dedupe cleanup 无界 DELETE，
  20）；第 23 轮新增的抑制命中列表未发现新缺陷。
- **ui-triage**：`defer`，理由见上。

### 发布（第 9.5 步）

- 三位专家一致通过发布：
  - **发布经理**：自 beta.11 以来有用户可见变更（#166）与修复（#168），RELEASE，
    建议 `0.1.0-beta.12`。
  - **阻断审计**：五道门禁 PASS（main CI 绿、无其他 open PR、migrations 仍为
    0001–0003、REL-13 属已知非阻断、无 secret/占位符）。
  - **运维/回滚**：SAFE；无 Dockerfile/compose/env/schema 变化，SQLite 双向兼容，
    回滚只需换回 `0.1.0-beta.11`。
- PR #169 `chore(release): v0.1.0-beta.12` rebase 合并 `1725ac7`；main CI success。
- Tag：`v0.1.0-beta.12`（annotated，指向 `1725ac7`）；GitHub Release 已创建（prerelease）。
- 镜像：`registry.cn-hangzhou.aliyuncs.com/xqvvu/vane:0.1.0-beta.12`
  （linux/amd64 + linux/arm64，index digest
  `sha256:552e35904c94fcca09fb857264b70d038798f43a4859d9e062fea862f8feddb4`）。
- 回滚镜像：`0.1.0-beta.11`（digest `sha256:2c338841…`）。

### 其他

- 本轮未执行浏览器验证：改动为服务端 oncall 语义，由新增执行层测试覆盖。
- Obsidian 同步：已按 Obsidian 配置发现真实 vault
  （`~/Library/Mobile Documents/iCloud~md~obsidian/Documents/Vane`），同步 backlog / log /
  release checklist / backup 文档，新增「Vane Oncall Fired Persistence Failure」并更新
  `Vane Index`；未使用硬编码 WSL 路径。
- 工作树：结束前删除会话工作树 `node_modules` 与 `agent-iteration`。

## 2026-10-19（第 23 轮）

- 时间：2026-10-19 18:25 – 21:20 CST。严重超出 75 分钟预算（车道合计运行约 99 分钟），
  本轮未启动 EXPERT_PANEL 与发布评估。
- 基线：`origin/main` @ `7bf1e59`；本轮合并 #166。
- 类型：UI 切片 + 三车道审计（非 full-audit）；最近全量审计仍为第 1 轮（2026-10-18 13:30 CST）。
- 车道：`requirements` + `security-exposure` + `ui-triage`/`ui-review`；下一轮建议
  `requirements` + `quality` + `release-infra`。
- `ui-triage`：`review_now`（三强信号全中：无 UI 评审记录、48h 内 26 个 UI 路径提交、
  ≥2 个未解决纯 UI 发现；15 处日志记录浏览器验证未执行）。
- `last_ui_review_at`：2026-10-20 00:18（浏览器实测完成；6180 文档凭据失效，改用隔离临时
  实例 localhost:6190 + `/tmp` 空库，6180 与主库未触碰）。
- 工作树：`agent-iteration` 仅用于并发锁与车道只读审计；实现与验证在会话工作树
  `upbeat-tereshkova-a77d9a`。

### 本轮交付

- PR #166 `feat(console): show alert identity in suppression hit list` —— NEW-1（28）。
  - 静默命中表事件列改为 severity 徽标 + 标题（链接事件）+ 告警源 · 状态 · 事件 ID；
    新增 feature-local `suppression-hit-event-cell.tsx`，调整列宽；PRD
    `docs/prd/suppression-hit-event-identity.md`。
  - 无 contract/DTO/仓储变化：`DeliveryListItem` 已有 eventTitle/eventSeverity/eventStatus。
  - 验证：`vp check`（0 errors）、`vp run -r test`（console 609 + 其余包全绿）、
    `vp run -r build`；组件测试覆盖新字段与空态。

### requirements 车道

- REQ-73 成立未实现（28）：表单按浏览器时区解释 `datetime-local`
  （`suppression-form.ts:118-128,160-184`），展示按设置时区（`operation-format.ts:11-28`）；
  建议 `Intl.DateTimeFormat.formatToParts` 双向转换 + DST 修正，无存储变化。
- REQ-48 + REQ-105 成立未实现（全量 25，仅 Source+Destination 约 27）：删除只清路由引用
  （`source.service.ts:76-85`、`destination.service.ts:120-129`），suppression JSON 引用
  不检查；不得自动删除失效 ID（可能放宽为无条件静默），只做可见 + 预检。
- REQ-52 成立未实现（27）：`tocsin.eventUrl` 生产恒为空（`template.ts:369-399`、
  `types.ts:33-40`）；建议新增 `TOCSIN_PUBLIC_URL` 并回退 BETTER_AUTH_URL/SERVER_URL。
- 新候选：NEW-1（已交付 #166）、NEW-2（Source 接入 URL 用部署公开地址，25，
  建议与 REQ-52 共用 `TOCSIN_PUBLIC_URL`）。

### security-exposure 车道

- SEC-7 真实 MEDIUM：raw 先脱敏、normalized 原样落库并出站
  （`intake.service.ts:79-81,262-264`、`intake.repository.ts:48-51`、
  `providers/generic/parse.ts:25-27`）→ EXPERT_PANEL。
- SEC-8 真实 MEDIUM：`redactText` 仅键值式，裸 token/URL userinfo/webhook URL 穿透
  （`redaction.ts:56-59`）→ EXPERT_PANEL。
- SEC-9 LOW 加固：不得直接把 `headersRecord` 全量脱敏，shared-secret 认证需要原值
  （`intake.service.ts:392-402`）；应拆窄字段。
- SEC-10 LOW：读取层不复核；tagged release 无旧明文行。
- 新增 SEC-11~SEC-16 已写入 backlog（任意认证头名、endpoint userinfo、isSensitiveKey
  残留键、server-only 标记、文档漂移、读取层复核）。
- 已核实无问题：Source/Feishu app DTO 无 secret、配置导出拒绝 includeSecrets、
  header 只回显名称、session 投影剔除 token。

### ui-review（浏览器实测）

- **UI-1 HIGH**：搜索框吞字符与空格。快速键入 `Disk usage` 后只剩 `se`，URL `?q=se`；
  慢速键入仍得到 `diskusage`。每次 onChange 立即导航（`operation-filters.tsx:92-105`），
  `pruneSearch` 的 `trim` 吃掉尾随空格（`operation-search.ts:74`），loaderDeps 逐键触发
  （`routes/_dashboard.events.tsx:16,43-47`）；一次键入 ≥10 次 `POST /api/operations/list`。
  修复：本地草稿 + 300ms 防抖后写 URL，空格只在查询构造处处理。
- **UI-2 MEDIUM**：筛选无匹配与无数据空态完全相同（`events-empty-state.tsx:12-26`、
  `deliveries-empty-state.tsx:12-26`），运维可能误判为接入中断 = REQ-4。
- **UI-3 MEDIUM**：Delivery Payload 标签名仍为「渲染 Payload」，页面已是左右对照
  （`delivery-detail-view.tsx:34`、`en-US.json:195`、`zh-Hans.json:195`）。
- **UI-4 MEDIUM**：移动端 Sheet 隐藏了关闭按钮（`sidebar.tsx:206-231`）。
- **UI-5 MEDIUM**：折叠侧栏首屏先展开后收起（`sidebar.tsx:80-98`）。
- **UI-6 LOW**：两个同名 “Toggle sidebar” 控件（`dashboard-header.tsx:17`、
  `sidebar.tsx:307-334`）。
- **UI-7 LOW**：空表仍渲染分页条（`table-pagination.tsx:48-118`）。
- **UI-8 LOW**：中文登录页混用英文 “dashboard”（`zh-Hans.json`）。
- 已完成：登录页 EN/ZH 桌面与 375px、axe（0 violations）、Events 有数据/筛选空态、
  Deliveries 成功/失败列表、筛选 Popover；未完成：Route 筛选完整链路、Payload 窄屏、
  静默指示器四态、移动端 Sheet/CLS 实测。
- 推荐下一轮切片：UI-1（唯一浏览器实测确认的高危缺陷，30–45 分钟，同时消灭 REQ-78）。

### EXPERT_PANEL

- 未展开（预算用尽）。排队：Q-30 + Q-8（同一类：成功结果持久化失败触发重复外部副作用）、
  SEC-7、SEC-8、REQ-93、SEC-11/12/16。

### 其他

- FIX-4 复核为过期：仓储 delete 已先 require*，事务向上抛 RecordNotFoundError；
  剩余工作仅为补回归测试（backlog 已降为 20）。
- 发布：本轮不发布（时间预算不足，且未做发布评估）。
- Obsidian 同步：本轮跳过（预算用尽）。

### 下一轮优先项

1. EXPERT_PANEL：Q-30 + Q-8、SEC-7、SEC-8；决策记录落盘后再实现。
2. 补做 UI 浏览器评审（隔离实例方案已跑通，记录端口/凭据/清理方式），更新
   `last_ui_review_at`。
3. REQ-73（28）、REQ-52 + NEW-2（27）、REQ-48 子集（27）。
4. 安全小项：SEC-9 拆窄字段、SEC-13 精确键、SEC-14 标记、SEC-15 文档。
5. docs-drift 批次与 FIX-4 回归测试。

## 2026-10-19（第 22 轮）

- 时间：2026-10-19 17:27 – 18:15 CST。
- 基线：`origin/main` @ `2cdaee1`；本轮合并后为 `f2a2ef6`（#161）、`e5947f6`（#162）、
  `3295013`（#163 release）。
- 本轮类型：**需求切片 + P0 小修复 + 三车道审计 + 发布**（非 full-audit）。最近全量审计仍为
  第 1 轮（2026-10-18 13:30 CST）；backlog 有大量 ≥27 分候选，按第 1.5 步继续。
- 车道轮转位置：本轮跑 `requirements` + `release-infra` + `docs-drift`，三条车道均返回。
  下一轮建议 `requirements` + `security-exposure` + `quality`。
- 工作树：`agent-iteration` 仅用于并发锁；实现与验证在会话工作树
  `sharp-chatterjee-8bb6fe`；依赖链接再次残缺，整体删除后 `vp install --frozen-lockfile` 解决。
- 验证：两个代码 PR 均通过 `vp check`（0 errors，11 条既有 warning）、`vp run -r test`
  （console 116 files / 611 tests）与 `vp run -r build`；Docker smoke 本地完整实跑通过。

### 本轮交付

- PR #161（`feat(console): surface active suppressions in the dashboard header`）—— **REQ-65**。
  - Dashboard header 新增静默状态指示器：只统计 `active` 规则，显示「生效中的静默：N 条」并
    链接 `/suppressions`；存在无条件规则时显示 destructive「全量静默生效中」，避免值班人员把
    全量静默误判为系统健康。
  - 状态每 30 秒按当前时间重算；加载中或查询失败时隐藏，不影响 dashboard。
  - 纯派生逻辑在 `features/suppressions/model/suppression-summary.ts`，组件在
    `features/suppressions/ui/active-suppression-indicator.tsx`，header 只做布局组合。
  - PRD `docs/prd/active-suppression-indicator.md`；模型/组件测试覆盖空态、普通生效、全量静默、
    查询失败与跳转目标。rebase 合并 `f2a2ef6`。
  - 评审修复（`4e03231`）：把 catch-all 判定收敛到 core 的
    `isUnconditionalSuppressionMatcher`，避免新增匹配维度时误标全量静默。
- PR #162（`fix(release): isolate the docker smoke stack from production data`）——
  **REL-3（P0）/ REL-20 / REL-15 / REL-10（部分）/ DOC-35 / DOC-42**。
  - 新增 `docker-compose.smoke.yml`：smoke 使用独立的 `tocsin:smoke` 镜像与
    `tocsin-smoke-data` 卷；脚本启动前后断言解析配置与 `/data` 实际挂载源，`down -v` 不再
    可能删除生产 `tocsin-data`。
  - 失败日志改为 teardown 前采集；curl 增加连接/总超时；根路径跟随 307 重定向并断言 HTML。
  - `just docker-buildx` 增加 `--provenance=false --sbom=false`，修复阿里云 ACR 拒绝
    BuildKit OCI attestation manifest；发布文档同步 registry/tag 约定、回滚镜像与
    `up -d --build` 修正。rebase 合并 `e5947f6`。
- PR #163（`chore(release): v0.1.0-beta.11`）：版本递增与发布文档同步，rebase 合并 `3295013`。

### requirements / release-infra / docs-drift 车道

- **requirements**：确认 REQ-65/73/48/52 仍有效；新增候选 REQ-103（27，生产 compose 默认安全
  启动）、REQ-104（27，备份恢复演练脚本）、REQ-105（25，静默规则的失效引用）、REQ-106（24，
  加急 ping 取消）、REQ-107（22，删除归档化，需 EXPERT_PANEL）。
- **release-infra**：确认 REL-3 仍为 P0 并当轮修复；新增 REL-20（`just docker-buildx` 缺
  `--provenance=false`，已修）；REL-6/REL-15/REL-18/REL-10/DOC-42 仍有效，其中
  REL-15/REL-10（部分）/DOC-35/DOC-42 随 #162 修复；REL-1（E2E 接入 CI）、REL-8（生产构建
  E2E）留待 EXPERT_PANEL；REL-4/5/7/17/11/19 待后续。
- **docs-drift**：`xqvvu/vane` 文档引用已清理（仅保留真实 ACR 命名空间）；新增 DOC-43
  （README 能力/结构）、DOC-44（投递搜索占位文案）、DOC-45（README Roadmap）；DOC-34/11/22/
  23/24/25/26/27/36/37/38/39/40/41 仍有效，建议下一轮拆两个 `docs:` PR 分批清理。

### EXPERT_PANEL

- 本轮优先处理 P0 REL-3 与 REQ-65，未展开 Q-30 / SEC-7 / REQ-93；三项继续排在下一轮优先项。
- REQ-107（配置删除归档化）涉及 schema/删除语义，转为 EXPERT_PANEL 候选，需先写决策记录。
- REL-13（LICENSE）继续 `blocked-autonomous`。

### 发布（第 9.5 步）

- 三位专家一致通过发布：
  - **发布经理**：自 beta.10 以来有 1 项用户可见变更（#161），RELEASE，建议 `0.1.0-beta.11`。
  - **阻断审计**：main CI 绿（`e5947f6`）、无 open PR、migration 仍为 0001–0003 且无 schema
    变更、目标 tag 未占用，PASS。
  - **运维/回滚**：生产 compose/Dockerfile/env 未变化；SQLite 兼容；回滚只需换回
    `0.1.0-beta.10` 镜像，SAFE。
- Tag：`v0.1.0-beta.11`（annotated，指向 `3295013`）；GitHub Release 已创建（prerelease）。
- 镜像：`registry.cn-hangzhou.aliyuncs.com/xqvvu/vane:0.1.0-beta.11`
  （linux/amd64 + linux/arm64，index digest
  `sha256:2c338841085b5fd7a36e19ca59165fd71e829613ffe58bf8f92c348120707fab`）。
  - `docker login` 用 keychain 凭据返回 `unauthorized: authentication required`，但 buildx
    `--push` 直接使用 credential store 成功；未把 Secret 写入命令、日志或文件。
  - `docker buildx imagetools inspect` 已确认双平台。
  - 回滚镜像：`0.1.0-beta.10`（digest `sha256:6acac322…`）。

### 其他

- 浏览器验证：未执行；指示器由 jsdom 组件测试与 model 单测覆盖。
- Obsidian 同步：已按 AGENTS.md 从 Obsidian 配置发现真实 vault
  （`~/Library/Mobile Documents/iCloud~md~obsidian/Documents/Vane`），同步 backlog/log/PRD/
  release 文档并更新 `Vane Index`；未使用硬编码 WSL 路径。
- 本轮 backlog/log 随 `docs(planning)` PR 提交。
- 工作树已清理：删除会话工作树 `node_modules` 与 `agent-iteration`。

### 下一轮优先项

1. **EXPERT_PANEL**：Q-30、SEC-7、REQ-93；新增 REQ-107 需先出决策记录。
2. **REQ-73（28）+ REQ-48（28）**：静默时间窗时区语义、配置删除影响预检（并入 REQ-105）。
3. **REQ-52（28）**：模板 `tocsin.eventUrl` 与公开访问地址配置。
4. **REQ-103/104（27）**：生产 compose 默认安全启动、备份/恢复演练脚本。
5. **REL-1/REL-8**：E2E 接入 CI / 生产构建 E2E 的 panel 决策；REL-4/5/7 先扩 spec 与修 harness。
6. **docs-drift 批次**：DOC-34/11/22/23/24/25/26/27/36/37/38/39/40/41/43/44/45，拆两个
   `docs:` PR。
7. **SEC-9 + Q-32 + Q-26**：构造时脱敏 `headersRecord`、`toLowerCase` 归一化、抑制窗口比较。
8. **车道轮转（第 23 轮）**：`requirements` + `security-exposure` + `quality`。

## 2026-10-19（第 21 轮）

- 时间：2026-10-19 16:58 – 17:25 CST。
- 基线：`origin/main` @ `59e195b`；本轮合并后为 `ce7ccaf`（#157）、`dca8056`（#158）、
  `6bbef05`（#159 release）。
- 本轮类型：**需求切片 + 小修复 + 三车道审计 + 发布**（非 full-audit）。最近全量审计仍为
  第 1 轮（2026-10-18 13:30 CST）；backlog 有大量 ≥27 分候选，按第 1.5 步继续。
- 车道轮转位置：本轮跑 `requirements` + `quality` + `architecture`，三条车道均返回
  （第 20 轮三条均超时未返回）。下一轮优先 `release-infra` + `docs-drift`。
- 工作树：`agent-iteration` 仅用于并发锁；实现与验证在会话工作树
  `nice-kapitsa-fdae7a`；收尾时删除其 `node_modules` 与 `agent-iteration`。
- 依赖：会话工作树 `node_modules` 链接再次残缺，整体删除后 `vp install --frozen-lockfile`
  解决（与第 18/19/20 轮相同）。

### 本轮交付

- PR #157（`feat(console): search deliveries by provider message reference`）—— **REQ-66**。
  - `deliverySearchPredicate` 增加 `deliveries.provider_ref_value LIKE`；列表与 `total`
    继续共用同一谓词，计数查询不新增 join。
  - Deliveries 页搜索占位文案补充「外部消息引用」；Events 范围与文案不变。
  - 仓储测试覆盖按引用命中、`total` 一致、事件列表不命中；组件测试同步文案。
  - PRD `docs/prd/delivery-provider-reference-search.md`；rebase 合并 `ce7ccaf`。
- PR #158（`fix(console): restore the collapsed sidebar state after reload`）—— **FIX-11**。
  - `SidebarProvider` 挂载后读取 `sidebar_state` cookie 恢复状态；受控模式不干预；
    读取放在 effect 以避免 hydration 不一致。
  - 新增 `sidebar.test.tsx` 覆盖折叠恢复与默认展开；rebase 合并 `dca8056`。
- 验证（两个 PR 各自）：`vp check` 0 errors（11 条既有 warning）；`vp run -r test` 4/4
  （console 114 files / 602 tests）；`vp run -r build`；PR CI green。

### requirements / quality / architecture 车道

- **requirements**：逐条核实 REQ-66/65/58/73 仍有效；新增候选 REQ-100（搜索结果解释命中字段）、
  REQ-101（时间显示标注当前时区）、REQ-102（pending 投递等待退避期间立即重试）；
  REQ-58 收窄为「列表展示 `2/3` 与退避/耗尽文案」，评分 28 → 27。
- **quality**：Q-30/Q-31/Q-25/Q-23/Q-26/Q-32 全部 [代码已核实] 仍有效；新发现并当轮修复
  N1（侧边栏折叠状态永不恢复，`sidebar.tsx:70,82`）。未发现其他可确证的新回归；
  Q-32 为最省 AUTO_FIX。
- **architecture**：ARCH-20/27/28/29/30、SEC-9 均仍有效；ARCH-28 已实际漂移
  （core `EventDetailDelivery` 缺 `destinationKind`，API schema 有）；ARCH-17 补充
  侧边栏提交新增浏览器 API 模块缺 TanStack 标记（`use-mobile.ts`、`sidebar.tsx`、`sheet.tsx`）。

### EXPERT_PANEL

- 本轮无新的 EXPERT_PANEL 决策；Q-30、SEC-7、REQ-93 继续留待下一轮优先处理。
- REL-13（LICENSE）继续 `blocked-autonomous`。

### 发布（第 9.5 步）

- 三位专家结论：
  - **发布经理**：自 `v0.1.0-beta.9` 以来有 3 项用户可见变更，RELEASE，建议 `0.1.0-beta.10`。
  - **阻断审计**：迁移仍为 0001–0003、无破坏性变更、无遗留 open PR；
    仅要求等待 #158 与 release commit 的 main CI 变绿后打 tag。
  - **运维/回滚**：无新增环境变量/配置/镜像变化；回滚只需换回 `0.1.0-beta.9`；
    ACR 凭据可从 macOS keychain 取得。
- PR #159（`chore(release): v0.1.0-beta.10`）rebase 合并 `6bbef05`；main CI success。
- Tag：`v0.1.0-beta.10`（annotated，指向 `6bbef05`）。
- 镜像：`registry.cn-hangzhou.aliyuncs.com/xqvvu/vane:0.1.0-beta.10`
  （linux/amd64 + linux/arm64，index digest `sha256:6acac3229178ae4006f0199f7c4266d0f550919f0f76cced044ba448a6a763ce`）。
  - 首次 `--push` 被 ACR 拒绝：`denied: unknown manifest class for
    application/vnd.oci.empty.v1+json`（BuildKit provenance 附带的空 descriptor）。
  - 加 `--provenance=false` 重试成功；`docker buildx imagetools inspect` 确认双平台。
  - `0.1.0-beta.9` 镜像已确认存在于 ACR（digest `sha256:b861d9cf…`），无需重推。
  - 回滚镜像 tag：`0.1.0-beta.9`。

### 其他

- 浏览器验证：未执行；两个切片由 jsdom 组件测试与 SQLite 仓储测试覆盖。
- Obsidian 同步已跳过：`obsidian-vault` skill 不在本会话可用 skill 列表中。
- 本轮 backlog/log 随 `docs(planning)` PR 提交。
- 工作树已清理：删除会话工作树 `node_modules` 与 `agent-iteration`。

### 下一轮优先项

1. **EXPERT_PANEL**：Q-30、SEC-7、REQ-93。
2. **REQ-65/73**（28）、REQ-58（27）、REQ-48（28）、REQ-52（28）。
3. **车道**：`requirements` + `release-infra` + `docs-drift`。

## 2026-10-19（第 20 轮）

- 时间：2026-10-19 16:00 – 17:00 CST。
- 基线：`origin/main` @ `4897749`；本轮合并后为 `3511ec4`（#153）、`30ad630`（#154）。
  执行期间另一会话把 main 推进到 `2666702`（`feat(console): move dashboard navigation into a
  collapsible sidebar`，CI 绿）；发布 tag 仍指向打 tag 时的 CI 绿提交 `30ad630`。
- 本轮类型：**需求切片 + 发布**（非 full-audit）。最近全量审计仍为第 1 轮
  （2026-10-18 13:30 CST）；backlog 有大量 ≥27 分候选，按第 1.5 步继续。
- 车道轮转位置：本轮启动 `requirements` + `quality` + `architecture` 三条车道，
  均超过 30 分钟无输出，按车道限时规则停止，发现留待第 21 轮补跑。下一轮重跑同样三条。
- 工作树：`agent-iteration` 仅用于并发锁；实现与验证在会话工作树
  `vibrant-newton-1dec39`；收尾时删除其 `node_modules` 与 `agent-iteration`。
- 依赖：会话工作树 `node_modules` 链接再次残缺，整体删除后 `vp install --frozen-lockfile`
  解决（与第 18/19 轮相同）。

### 本轮交付

- PR #153（`feat(console): compare raw and rendered payloads on delivery detail`）—— **REQ-87**。
  - `DeliveryDetail` 新增派生字段 `rawPayloadPruned`（core 类型 + API schema），
    仓储详情投影复用 `isPrunedRawPayload`，客户端不自行猜测。
  - 「载荷」标签页改为原始告警载荷与渲染载荷左右对照；原始载荷已清理时左栏显示说明，
    右栏仍保留渲染载荷；新增 `delivery-payload-tab` 与 `delivery-payload-pruned-notice`，
    同步更新页面描述与中英文案。
  - PRD `docs/prd/delivery-payload-comparison.md`；组件测试覆盖保留/已清理两态，
    仓储测试覆盖清理前后 `rawPayloadPruned` 与渲染载荷不变。
  - 验证：`vp check` 0 errors（11 条既有 warning）；`vp run -r test` 4/4
    （console 112 files / 594 tests）；`vp run -r build`；PR CI green；rebase 合并 `3511ec4`。

### requirements / quality / architecture 车道

- 三条车道均超过 30 分钟无输出，按第 7 轮起的车道限时规则停止；本轮未新增候选，
  backlog 既有候选项未变动，留待第 21 轮重跑。
- 已确认 backlog 中无 `planned` / `in-progress` 项，REQ-87 为当时最高分候选（28）。

### EXPERT_PANEL

- 本轮无新的 EXPERT_PANEL 决策；Q-30、SEC-7、REQ-93 仍排在下一轮优先项。
- REL-13（LICENSE）继续 `blocked-autonomous`。

### 发布（第 9.5 步）

- 三位专家一致同意发布：
  - **发布经理**：自上次发布以来有 25 条 `feat`/`fix` 用户可见变更，建议 `0.1.0-beta.9`。
  - **阻断审计**：main CI 绿、无 open PR、无 `in-progress` 回归、无破坏性迁移、版本无冲突，PASS。
  - **运维/回滚专家**：无新增必填环境变量；迁移 forward-only；新增可选
    `TOCSIN_DESTINATION_TIMEOUT_MS`（默认 10s）是行为变化；回滚默认需恢复冷备份
    （旧镜像可能不认识 0002/0003）。
- PR #154（`chore(release): v0.1.0-beta.9`）：根 `package.json` 递增，同步
  `docs/release/release-checklist.md` 与 `docs/release/backup-restore-upgrade.md` 的版本引用；
  rebase 合并 `30ad630`。
- Tag：`v0.1.0-beta.9`（annotated，指向 `30ad630`，仓库首个 tag；
  `0.1.0-beta.8` 无对应 tag）。
- 镜像：`registry.cn-hangzhou.aliyuncs.com/xqvvu/vane:0.1.0-beta.9`
  （linux/amd64 + linux/arm64，不推 latest）。
  - 默认 `docker` driver 不支持多平台构建，已创建 `docker-container` driver 的
    `tocsin-multi` builder；镜像与 manifest list 构建成功。
  - **推送失败**：`insufficient_scope: authorization failed`。本机 docker credential store
    只有 docker.io / dhi.io，没有 ACR 条目，环境中也没有 `ACR_USERNAME` / `ACR_PASSWORD`。
    按规则保留 tag、不 force、不删除；下一轮重试推送（builder 已保留，可复用）。
  - 回滚镜像 tag：`0.1.0-beta.8`（若 ACR 中存在）或恢复冷备份。

### 其他

- 浏览器验证：未执行；本切片行为由 jsdom 组件测试与 SQLite 仓储测试覆盖。
- Obsidian 同步已跳过：`obsidian-vault` skill 不在本会话可用 skill 列表中。
- 本轮 backlog/log 随 PR #156（`docs(planning)`）提交。
- 工作树已清理：删除会话工作树 `node_modules` 与 `agent-iteration`。

### 下一轮优先项

1. **ACR 镜像推送**：补齐 ACR 登录（`ACR_USERNAME`/`ACR_PASSWORD` 或 credential store）后，
   复用 `tocsin-multi` builder 重推 `0.1.0-beta.9`，并用 `docker buildx imagetools inspect` 验证双平台。
2. **EXPERT_PANEL**：Q-30（加急持久化失败重复呼叫）、SEC-7（归一化字段绕过脱敏）、
   REQ-93（在线快照下载的敏感边界）。
3. **REQ-65/66/73/58**（28）：全局静默提示、外部消息引用反查、静默时间窗时区语义、
   失败投递区分等待重试与重试耗尽。
4. **REQ-48**（28）：配置删除影响预检。
5. **车道**：重跑 `requirements` + `quality` + `architecture`。

## 2026-10-19（第 19 轮）

- 时间：2026-10-19 14:44 – 15:50 CST。
- 基线：`origin/main` @ `17d5066`；main 最近一次 CI 为 success，无遗留 open PR。
- 本轮类型：**需求切片 + 小修复 + 三车道审计**（非 full-audit）。最近全量审计仍为第 1 轮
  （2026-10-18 13:30 CST）；backlog 有大量 ≥27 分候选，按第 1.5 步继续。
- 车道轮转位置：本轮跑 `requirements` + `docs-drift` + `security-exposure`，三条车道均返回。
  下一轮建议 `requirements` + `quality` + `architecture`。
- 工作树：`agent-iteration` 仅用于并发锁；实现与验证在会话工作树
  `distracted-raman-4ccb21`；收尾时删除其 `node_modules` 与 `agent-iteration`。
- 依赖：会话工作树 `node_modules` 再次缺 `@rolldown/plugin-babel`，整体删除后
  `vp install --frozen-lockfile` 解决。

### 本轮交付

- PR #149（`feat(console): link events back to their upstream alert`）—— **REQ-86**。
  - 事件详情「标准化」页新增「上游告警」区块：`externalURL`/`generatorURL` 渲染为外链，
    仅接受 `http(s)`、剥离 userinfo、`target="_blank"` + `rel="noopener noreferrer"`。
  - 其余标量元数据按固定顺序展示；已知键使用中英文文案，未知键回退原始键名；空元数据不渲染。
  - PRD `docs/prd/event-upstream-source.md`；模型/组件用例覆盖协议白名单、凭据剥离、排序、空态。
  - 验证：`vp check` 0 errors；`vp run -r test` 4/4 包（console 111 files / 590 tests）；
    `vp run -r build`；rebase 合并 `025ad42`。
  - 合并后补 `test(console): assert the refined upstream generator label`（`9bf52df`），
    修正改文案后未同步的测试断言。
- PR #150（`fix(security): harden redaction coverage and server-only boundaries`）——
  **SEC-2/3/4/6**。
  - Feishu app 测试错误消息过 `redactText`；`tokenHash` 加入精确敏感键集合
    （`payloadHash`/`hash` 保持可见）；`env.ts` 加 server-only 标记；registry kind 与
    `DestinationKindSchema.options` 的 parity 断言；修正 `template.ts` 旧产品名注释。
  - 验证：同上门禁（console 111 files / 592 tests）；rebase 合并 `7c2691f`。

### requirements lane（新增 7 条，已写入 backlog）

- **REQ-93（27）**：Settings 在线数据库快照下载；文档要求在线备份用 SQLite 在线接口，
  但镜像无 `sqlite3` CLI、仓库无实现（`backup-restore-upgrade.md:77-82`、`connection.ts:23-32`）。
  快照含敏感配置，实施前需 EXPERT_PANEL。
- **REQ-94（26）**：raw payload 保留策略只在 webhook 路径触发，无流量时不收敛
  （`intake.service.ts:179-190`、`intake.repository.ts:136-156`）。
- **REQ-95（26）**：模板编辑器切换模式会静默注入 starter、来源切换强改 mode；
  空/非空 body 语义不可见（`destination-form.tsx:311-318,454-470`）。
- **REQ-96（25）**：路由重叠与重复投递风险预览；去重键含 `route_id`，同事件同目标
  不同路由会重复投递（`delivery.helpers.ts:80-86`、`intake.service.ts:98-125`）。
- **REQ-97（24）**：告警源级默认标签；可复用既有 `sources.config_json`，无迁移。
- **REQ-98（23）**：投递历史显式 opt-in 清理；决策要求「预览 N 条再确认」形态
  （`history-retention-and-snapshots.md:14-23`）。
- **REQ-99（23）**：Events/Deliveries 命名筛选视图（localStorage，复用 URL schema）。

### docs-drift lane（新增 8 条，关闭 1 条）

- 新增 **DOC-34..41**：`route-authoring-current-state.md` 结论段仍称能力不存在；
  README/发布文档仍把 Docker smoke 未进 CI 当缺口；`next-round.md` 仍列已交付的 D2/D5；
  抑制 PRD 另有两处「四个状态」；`delivery-route-match-evidence.md` 缺状态头；
  RC 清单漏记 `suppressed` 与抑制/集成页面；模板引擎 issues 未勾选项已交付；
  post-MVP adapter 问题陈述仍覆盖已交付的 destination 侧。
- **关闭 DOC-29**：backlog「已知过期输入」与 `next-round.md` 基线矛盾已统一。
- 复核确认 DOC-2/5/14/28/30 已闭环无需再动；DOC-6/11/23/24/25/26/27/33 仍成立。
- `next-round.md` 基线仍落后 32 提交（以 `git rev-list --count` 为准），由 DOC-22 继续跟踪。

### security-exposure lane（新增 4 条）

- **SEC-7（MEDIUM）**：归一化 `title/message/labels` 未脱敏，绕过 raw payload 脱敏，
  并可随 generic webhook 默认载荷出站（`intake.repository.ts:49-51`、
  `generic-webhook/payload.ts:37`）。修复读取/发送边界会触碰匹配与投递语义 → EXPERT_PANEL。
- **SEC-8**：attempt 响应体/错误只做键值模式脱敏，裸 `Bearer`/webhook URL 可穿透
  （`redaction.ts:56-59`）；模式清单需权衡误伤 → EXPERT_PANEL。
- **SEC-9（24，AUTO_FIX）**：`request-context.headersRecord` 保留原始 Authorization/Cookie，
  当前唯一消费者会再脱敏；建议构造时即 `redactHeaders`（`request-context.ts:87-97`）。
- **SEC-10**：旧库存量行只在写入时脱敏，读取不复核；是否存在旧部署无法从仓库判定。
- SEC-1/SEC-5 已核实闭环；SEC-2/3/4/6 已由 PR #150 修复。

### EXPERT_PANEL

- 本轮无 EXPERT_PANEL 决策事项；Q-30、SEC-7、REQ-93 已排入下一轮 panel。
- REL-13（LICENSE）继续 `blocked-autonomous`。

### 其他

- 浏览器验证：未执行；本切片行为由 jsdom 组件测试与模型测试覆盖。
- Obsidian 同步：从 `~/Library/Application Support/obsidian/obsidian.json` 发现 vault
  `~/Library/Mobile Documents/iCloud~md~obsidian/Documents`，同步 `Vane Iteration Backlog.md`、
  `Vane Iteration Log.md`，新增 `Vane Event Upstream Source.md`，并更新 `Vane Index.md`。
- 本轮 backlog/log 随 PR #151（`docs(planning)`）提交。

### 下一轮优先项

1. **REQ-87（28）**：投递原始/渲染载荷对照。
2. **EXPERT_PANEL**：Q-30、SEC-7、REQ-93。
3. **REQ-65/66/73/58**（28）：静默提示、外部消息引用反查、时区语义、重试耗尽。
4. **REQ-48**（28）：配置删除影响预检。

## 2026-10-19（第 18 轮）

- 时间：2026-10-19 13:27 – 14:30 CST。
- 基线：`origin/main` @ `ab3a4c4`；main 最近一次 CI 为 success，无遗留 open PR。
- 本轮类型：**需求切片 + 三车道审计**（非 full-audit）。最近全量审计仍为第 1 轮
  （2026-10-18 13:30 CST）；backlog 有大量 ≥27 分候选，按第 1.5 步继续消化。
- 车道轮转位置：本轮跑 `requirements` + `quality` + `architecture`，三条车道均返回。
  下一轮建议 `requirements` + `docs-drift` + `security-exposure`。
- 工作树：`agent-iteration` 仅用于并发锁；实现与验证在会话工作树
  `determined-hopper-bc917b`；工作树已清理：收尾时删除其 `node_modules` 与 `agent-iteration`。
- 依赖：会话工作树 `node_modules` 链接残缺，`vp install` 报 “Already up to date” 后仍缺
  `@rolldown/plugin-babel`；按既有经验整体删除后重装解决。

### 本轮交付

- PR #146（`feat(console): explain why a route selected a delivery`）—— **REQ-80**。
  - 投递详情摘要页并列展示「接入时快照」与「当前规则」，逐项检查徽章复用同一组件；
    区分无快照、快照不含该路由、快照未命中三种事实；当前规则不再命中时显式提示。
  - 手动投递不渲染该区块；摘要页改为可滚动容器。
  - 路由检查/命中徽章抽到 `features/routes/ui/`，事件详情页同步复用；文案迁到
    `routeChecks.*` 命名空间。
  - PRD `docs/prd/delivery-route-match-evidence.md`；新增 8 条组件用例。
  - 合并后补 `fix(console): describe a disabled route as disabled`：停用路由不再显示
    「无此条件」。
  - 验证：`vp check` 0 errors；`vp run -r test` 4/4 包（console 109 files / 578 tests）；
    `vp run -r build`；PR CI green；rebase 合并 `f0456f5`。

### requirements lane（新增 7 条，已写入 backlog）

- **REQ-86（28）**：事件详情展示上游告警回链与接入元数据；`providerMetadata` 已含
  `externalURL`/`generatorURL`（`alertmanager-compatible.ts:59-76`、`grafana/parse.ts:59-71`），
  但事件页只渲染 normalized 与 raw，需 URL 协议白名单与 `noopener`。
- **REQ-87（28）**：投递详情原始事件载荷与渲染载荷对照；`DeliveryDetail` 已含两端
  （`delivery.repository.ts:445-483`），需派生 `rawPayloadPruned` 并过滤清理哨兵。
- **REQ-88（27）**：事件列表显示 `occurredAt` 与接入延迟；列表 DTO 只有 `receivedAt`
  （`schemas/operations.ts:37-49`），详情已有发生时间。
- **REQ-89（27）**：投递重试二次确认；列表/详情一次点击即发送
  （`delivery-actions.tsx:25-37`、`delivery-retry-button.tsx:27-31`）。
- **REQ-90（27）**：自托管指标 scrape 端点；只有 health/ready
  （`health.ts:5-13`、`ready.ts:6-53`），建议只读 `GET /api/metrics`、无新依赖。
- **REQ-91（26）**：操作列表相对时间与数据新鲜度；全站绝对时间
  （`operation-format.ts:31-47`），含 `dataUpdatedAt`。
- **REQ-92（25）**：配置表单未保存离开护栏；四个对话框只检查 pending
  （`destination-edit-dialog.tsx:49-55` 等）。
- 配置列表分页入 URL 未单列：与 ARCH-30 重复，已在 ARCH-30 备注中合并证据。

### quality lane（新增 6 条 + 3 处证据更新）

- **Q-30（26，HIGH）**：加急呼叫 `markFired` 持久化失败会落可重试分支
  （`oncall-execution.ts:98,115-130,161-180`），电话已拨出仍会重复呼叫；无失败注入测试。
- **Q-31（23）**：`buzzDelivery` 逐条入队无事务（`oncall.service.ts:91-109`），部分失败时
  已入队 ping 仍会被呼叫。
- **Q-32（22）**：`toLocaleLowerCase()` 依赖宿主 locale（`normalization.ts:5,23`、
  `route.ts:325,330`、`intake.service.ts:406,409`），土耳其语环境会漏投。
- **Q-33（23）**：Webhook 先查 source/启停再验 token（`intake.service.ts:62-77`），
  可区分未知/已知/停用。
- **Q-34（20）**：`formatTime` 对损坏时间戳抛 `RangeError`
  （`operation-format.ts:31-47`），单条脏数据会让整页不可用。
- **Q-35（17）**：ping 表测试用破折号数量代理列完整性
  （`delivery-pings-table.test.tsx:45`）。
- 证据更新：Q-10 同构于 oncall worker（`oncall-worker.service.ts:77-79,87-95`）；
  Q-5 的损坏 JSON 还覆盖 raw/provider/labels/rendered 列；Q-8 的加急对应物单列为 Q-30。

### architecture lane（新增 8 条）

- **ARCH-27（24）**：Provider catalog/`iconName` 无消费者，Source UI 硬编码
  （`source-provider-icon.tsx:1-40`、`source-form.tsx:57-67,149-158`）。
- **ARCH-28（21）**：Operations DTO 在 core 与 api 双份定义，无 parity 守卫
  （`packages/core/src/operations.ts:120,132`、`packages/api/src/schemas/operations.ts:37-111`）。
- **ARCH-29（21）**：`configuration-support.ts` 成为跨能力 helper 集散地，被 7 个服务导入。
- **ARCH-30（21）**：`OperationsTable` 分页固定在本地 state（`operations-table.tsx:58-62`），
  配置列表刷新/后退回第 1 页。
- **ARCH-31（20）**：契约与 runtime 的 auth 错误文案双份维护（`dashboard-auth.ts:5-15`）。
- **ARCH-32（19）**：Events/Deliveries 无自有 api/model 边界，`operations` 成为数据中枢。
- **ARCH-33（19）**：两个新增死组件（`form-text-field.tsx`、`destination-kind-badge.tsx`）。
- **ARCH-34（19）**：Scaffold 模板与 generic-webhook 能力分叉
  （`scaffold/schema.ts:8-13`、`generic-webhook/schema.ts`）。
- 证据更新：FIX-5/9/10 仍成立；ARCH-1/2/10 规模未变；ARCH-26 引用面扩大。

### EXPERT_PANEL

- 本轮无 EXPERT_PANEL 事项。REL-13（LICENSE）继续 `blocked-autonomous`。
- Q-30 建议下一轮交 EXPERT_PANEL：涉及加急呼叫语义（已拨出后的持久化失败处理），
  需要安全与可靠性专家裁决。

### 其他

- 浏览器验证：未执行；本机 6180 的 dev server 运行主 checkout 的上一版代码，
  本切片行为已由 jsdom 组件测试覆盖。
- Obsidian 同步：从 `~/Library/Application Support/obsidian/obsidian.json` 发现 vault
  `~/Library/Mobile Documents/iCloud~md~obsidian/Documents`，同步 `Vane Iteration Backlog.md`、
  `Vane Iteration Log.md`，新增 `Vane Delivery Route Match Evidence.md`，并更新 `Vane Index.md`。
- 本轮 backlog/log 随 PR #147（`docs(planning)`）提交。

### 下一轮优先项

1. **REQ-86（28）**：事件详情上游告警回链与接入元数据。
2. **REQ-87（28）**：投递原始/渲染载荷对照。
3. **Q-30（26，HIGH）**：加急呼叫持久化失败重复呼叫；EXPERT_PANEL。
4. **REQ-65/66/73/58**（28）：静默提示、外部消息引用反查、时区语义、重试耗尽。
5. **REL-3 + REL-15/18**：Docker smoke 隔离与发布手册。
6. **Q-32**（22）：`toLowerCase` 归一化与边界用例。
7. **SEC-2/3/4/6**：可合并一个安全小修复 PR。

## 2026-10-19（第 17 轮）

- 时间：2026-10-19 12:40 – 13:30 CST。
- 基线：`origin/main` @ `9a4013c`；main 最近一次 CI 为 success，无遗留 open PR。
- 本轮类型：**需求切片 + 小修复 + 三车道审计**（非 full-audit）。最近全量审计仍为
  第 1 轮（2026-10-18 13:30 CST）；backlog 有大量 ≥27 分候选，按第 1.5 步继续消化。
- 车道轮转位置：本轮跑 `requirements` + `docs-drift` + `security-exposure`，三条车道均返回。
  下一轮建议 `requirements` + `quality` + `architecture`。
- 工作树：`agent-iteration` 仅用于并发锁；实现与验证在会话工作树
  `peaceful-perlman-1093ae`；收尾时删除其 `node_modules` 与 `agent-iteration`。

### 本轮交付

- PR #143（`feat(console): confirm manual urgent calls with receiver count`）—— **REQ-72**。
  - 确认对话框展示接收人数与「立即拨号、不可撤销」；取消不产生请求；接收人数为 0 时
    按钮禁用并说明；保留「非飞书应用投递不可加急」文案。
  - PRD `docs/prd/oncall-buzz-confirmation.md`；5 条组件测试覆盖确认/取消/无接收人/非应用/失败。
  - 验证：`vp check` 0 errors；`vp run -r test` 108 files / 570 tests；`vp run -r build`。
- PR #144（`fix(console): share the intake prune sweep across requests`）—— **Q-24**。
  - 单飞状态移至 container 持有的 `RawPayloadSweepGate`，注入每个按请求创建的实例；
    双实例并发只触发一次后台清理，释放后下一个 webhook 可再次触发。
  - 验证：同上门禁。

### requirements lane（新增 6 条，已写入 backlog）

- **REQ-80（29）**：投递详情解释「为什么命中这条路由」；DTO 已含 `route.rule` 与
  `event.routeMatches[].checks`（`packages/core/src/operations.ts:132-144`、
  `packages/core/src/event/event.ts:7-17`），页面只渲染路由名
  （`delivery-summary-tab.tsx:24-27`）；需并列「接入时快照」与「当前规则」。
- **REQ-81（27）**：告警源行一键临时静默；`source-actions.tsx:21-34` 只有编辑/轮换/启停/删除，
  matcher 原生支持 `sourceIds`（`suppression.ts:155-179`）。
- **REQ-82（25）**：详情页跨域引用可导航并定位配置行；
  `delivery-summary-tab.tsx:16-31`、`event-detail-route-matches-table.tsx:62-66` 均为纯文本。
- **REQ-83（26）**：补投预览标注将被静默的目标；预览不判断抑制
  （`event-replay.service.ts:173-186,246-281`），实际入队会落 `suppressed`。
- **REQ-84（26）**：Settings 展示版本与 schema 版本；`system-information.ts:10-45` 已收集，
  但 `/api/health` 仅 `{status:"ok"}`（`health.ts:5-11`）。
- **REQ-85（21）**：配置变更审计；无审计表（`schema.ts:7-111`）、service 无 actor；
  需 forward-only migration，建议先写决策记录并交 EXPERT_PANEL。

### docs-drift lane

- **DOC-28**：`mvp-rc-checklist.md:18-20,103` 称 E2E/compose smoke 未接入 CI，`:125` 又勾选
  「故意不进 ci.yml」；实际 `.github/workflows/ci.yml` 只有 quality job，属表述冲突。
- **DOC-31**：retention 仍缺（`:18-20,107-109`）与 `:163` 已决定不自动清理矛盾。
- **DOC-30**：`route-authoring-current-state.md:101-118,224` 称无缺口解释/无 route×destination
  视图/多条件只能导入；`route-match-gaps.ts:57`、`event-detail-route-matches-table.tsx`、
  `route-forms.tsx:284+` 均已落地。
- **DOC-22**：`next-round.md` 正文仍把已完成的 S0、registry audit、test-kit 写成未决。
- 证据刷新：DOC-11/23/24/25/26/27/29/32；新发现
  `adapter-extensibility.md:118-119` 称脱敏由 `secretFields` 决定，实际仍由 console 手写
  （`destination.helpers.ts:233-260`、`config-portability.ts:442-455`），manifest 派生未落地。

### security-exposure lane

- **SEC-5 已完整落地**：导出整表删除 `config.headers` 并生成 refs
  （`config-portability.ts:344-381`）、不可表达名称 fail-closed、env 名冲突拒绝、
  陈旧 refs 裁剪、编辑 DTO 只返回名称、导入拒绝 `[REDACTED]`、preview/test 不含明文。
- 无 HIGH/MEDIUM。LOW 项：
  - SEC-6：`tokenHash` 未命中 `isSensitiveKey`（`redaction.ts:10-43`），当前无输出路径。
  - SEC-4：Feishu app test 错误未过 `redactText`（`feishu-app.service.ts:100-113`）。
  - SEC-3：`env.ts:9-12` 读 `process.env` 但无 server-only 标记。
  - SEC-2：脱敏测试按 registry 派生 kind（`configuration.integration.test.ts:18-20`）。
- 旧仓库名 `xqvvu/vane` 已无有效链接；仅 `route-authoring-current-state.md:3` 本地路径残留。

### EXPERT_PANEL

- 本轮无 EXPERT_PANEL 事项。REL-13（LICENSE）继续 `blocked-autonomous`。

### 其他

- 浏览器验证：未执行；本机 6180 的 dev server 运行在主 checkout 的上一版代码，
  组件行为已由 jsdom 测试覆盖（含 Radix AlertDialog 交互）。
- Obsidian 同步：从 `~/Library/Application Support/obsidian/obsidian.json` 发现 vault
  根目录 `~/Library/Mobile Documents/iCloud~md~obsidian/Documents`，现有 Tocsin 笔记在
  `Vane/` 下；本轮同步 iteration backlog/log 与新增 PRD 笔记。
- 本轮 backlog/log 随 PR #145（`docs(planning): record the seventeenth iteration round`）
  提交，并顺手更正 DOC-28/30/31/32 四处已漂移的文档断言。

### 下一轮优先项

1. **REQ-80（29）**：投递详情解释路由命中。
2. **REQ-65（28）**：全局静默生效提示。
3. **REQ-66（28）**：按外部消息引用反查投递。
4. **REQ-73（28）**：静默时间窗时区语义。
5. **REQ-58（28）**：失败投递等待重试/重试耗尽。
6. **REL-3 + REL-15/18**：Docker smoke 隔离与发布手册。
7. **Q-26（25）**：抑制窗口时间比较。
8. **SEC-2/3/4/6**：可合并一个安全小修复 PR。

## 2026-10-19（第 16 轮）

- 时间：2026-10-19 08:59 – 12:40 CST（会话中途被系统挂起约 2.5 小时，车道在恢复后返回）。
- 基线：`origin/main` @ `27114f8`；main 最近一次 CI 为 success，无遗留 open PR。
- 本轮类型：**需求切片 + 小修复 + 三车道审计**（非 full-audit）。最近全量审计仍为
  第 1 轮（2026-10-18 13:30 CST）；backlog 仍有大量 ≥27 分候选，按第 1.5 步继续消化。
- 车道轮转位置：本轮跑 `requirements` + `architecture` + `release-infra`，三条车道均返回。
  下一轮建议 `requirements` + `docs-drift` + `security-exposure`。
- 工作树：`agent-iteration` 仅用于并发锁；实现与验证在会话工作树
  `elastic-hopper-f97c51`；收尾时删除其 `node_modules` 与 `agent-iteration`。

### 本轮交付

- PR #140（`feat(console): show oncall ping audit fields`）—— **REQ-53**。
  - 触发方式单元格显示 `initiatedBy`；新增呼叫时间（`firedAt`）与下次重试
    （`nextAttemptAt`）两列；空值统一 `—`；时间悬浮显示完整日期时间。
  - PRD `docs/prd/oncall-ping-audit-fields.md`；新增组件测试覆盖手动/自动/空列表。
  - 验证：`vp check` 0 errors；`vp run -r test` 4/4（console 565）；`vp run -r build`。
- PR #141（`fix(console): cap operation search at the contract limit`）—— **Q-21**。
  - `@tocsin/core` 导出 `OPERATION_SEARCH_MAX_LENGTH`，contract 与前端共用。
  - 搜索框 `maxLength` + `pruneSearch` 截断，覆盖手工编辑 URL；新增 3 条用例。
  - 验证：同上门禁。

### requirements lane（新增 8 条，已写入 backlog）

- **REQ-72（29）**：手动加急一键呼叫无确认；单击即呼叫目标全部接收人。
- **REQ-73（28）**：静默时间窗表单按浏览器时区解释，列表按设置时区显示，跨时区会偏数小时。
- **REQ-74（27）**：Events/Deliveries 排序方向。
- **REQ-75（26）**：静默详情页缺启停/编辑/删除/续期入口。
- **REQ-76（25）**：加急可用性预判（无 urgent 接收人时仍可点）。
- **REQ-77（25）**：投递诊断摘要一键复制。
- **REQ-78（25）**：列表搜索逐键请求，无防抖。
- **REQ-79（24）**：设置保存无条件整页刷新。

### architecture lane（新增 ARCH-20..26）

- **ARCH-20（25）**：Destination secret path 策略在 manifest、repository、portability
  三处重复，manifest `secretFields` 未被消费（`destination.helpers.ts:233`、
  `config-portability.ts:428`）。
- **ARCH-21（21）**：编辑器草稿映射（header 行、收件人拼接）落在 SQLite repository helper。
- **ARCH-22（21）**：纯领域逻辑 `route-match-gaps.ts` 落在 repository 目录。
- **ARCH-23（20）**：注入的 container 在 dashboard 会话解析中被绕过。
- **ARCH-24（17）**：core 模块契约仍在包根，与 AGENTS 的 `<module>/` 约定不一致。
- **ARCH-25（18）**：空条件确认对话框在 routes/suppressions 重复实现。
- **ARCH-26（18）**：feature `model/` 混入 React hook 与 i18n 上下文。
- ARCH-1 证据更新：`route-forms.tsx` 已增至 1027 行。

### release-infra lane（新增 REL-15..19、DOC-33）

- REL-3/6/7 证据未变；实测 `docker compose -p tocsin-smoke config` 仍解析为
  `tocsin:local` / `tocsin-data`；Playwright 期望 1248、缓存 1234。
- **REL-15（24）**：发布手册的手工 Docker 冒烟直接作用于正常栈。
- **REL-16（21）**：main 无 branch protection/ruleset，CI 不是强制门禁。
- **REL-17（22）**：`.dockerignore` 漏掉 Playwright 产物与 `.wt/`，trace 可能含 Source token。
- **REL-18（23）**：发布手册 readiness 无重试。
- **REL-19（23）**：本地 E2E `retries=0` + `trace: on-first-retry`，失败无 trace。
- **DOC-33（21）**：RC 未勾选 gate 实为 4 条，历史记录漏算 provider 多版本 payload。

### EXPERT_PANEL

- 本轮无 EXPERT_PANEL 事项。
- REL-13（LICENSE）继续 `blocked-autonomous`。

### 其他

- 浏览器验证：未执行。本机 6180 端口的 console dev server 运行在主 checkout
  `27114f8`（不含本轮改动），且 dev 配置 `strictPort`；组件行为已由 jsdom 测试覆盖。
- Obsidian 同步：从 `~/Library/Application Support/obsidian/obsidian.json` 发现 vault
  根目录 `~/Library/Mobile Documents/iCloud~md~obsidian/Documents`，沿用 `Vane/` 下的
  `Vane <Title>.md` 命名与 `## Related` wikilink 风格。已同步 `Vane Iteration Log`、
  `Vane Iteration Backlog`，新建 `Vane Oncall Ping Audit Fields` 并更新 `Vane Index`。
- 本轮 backlog/log 随 `docs(planning):` PR 提交。

### 下一轮优先项

1. **REQ-72（29）**：手动加急确认。
2. **REQ-65（28）**：全局静默生效提示。
3. **REQ-66（28）**：按外部消息引用反查投递。
4. **REQ-73（28）**：静默时间窗时区语义。
5. **REQ-58（28）**：失败投递等待重试/重试耗尽。
6. **REL-3 + REL-15/18**：Docker smoke 隔离与手册。
7. **Q-24（27）**：prune sweep 单飞跨请求失效（真实缺陷）。
8. **Q-26（25）**：抑制窗口时间比较。

## 2026-10-19（第 15 轮）

- 时间：2026-10-19 07:42 – 09:00 CST。
- 基线：`origin/main` @ `5d49502`；main 最近一次 CI 为 success，无遗留 open PR。
- 本轮类型：**安全修复 + 需求切片 + 三车道审计**（非 full-audit）。最近全量审计仍为
  第 1 轮（2026-10-18 13:30 CST）；backlog 仍有大量 ≥27 分候选，按第 1.5 步继续消化。
- 车道轮转位置：本轮跑 `requirements` + `docs-drift` + `quality`，三条车道全部返回。
  下一轮建议 `requirements` + `architecture` + `release-infra`。
- 工作树：`agent-iteration` 仅用于并发锁与基线读取；实现与验证在会话工作树
  `nervous-varahamihira-86cc30`；收尾时删除其 `node_modules` 与 `agent-iteration`。

### 本轮交付

- PR #137（`fix(console): redact every destination header value from exports`）—— **SEC-5**。
  - 导出整表删除 `config.headers`，为每个 header 生成
    `secret_refs["headers.<Name>"]` 环境变量引用；编辑 DTO 只返回 `Name:`。
  - 不可表达为 secret path 的 header 名（`.`、`$`、空格）fail-closed；
    `slugEnvPart` 归一化后的 env 名冲突拒绝导出；陈旧 `headers.*` refs 导出前裁剪；
    导入侧拒绝 header 值等于 `[REDACTED]`。
  - 决策记录：`docs/planning/decisions/destination-header-redaction.md`。
  - 验证：`vp check` 0 errors；`vp run -r test` 107 files / 559 tests；`vp run -r build`。
- PR #138（`feat(console): confirm routes that match every alert`）—— **REQ-57**。
  - `routeRuleIsEmpty` 按归一化后的保存规则判定；新建/编辑路由提交前弹出
    catch-all 确认对话框，取消不提交。
  - PRD：`docs/prd/route-catchall-confirmation.md`。
  - 验证：`vp check` 0 errors；`vp run -r test` 107 files / 561 tests；`vp run -r build`。

### requirements lane

新增 6 条候选（已写入 backlog）：

- **REQ-65（28）**：全局静默生效提示；其他页面会把 catch-all 静默误判为系统健康
  （`dashboard-header.tsx:29-47`、`suppression.ts:82-105`）。
- **REQ-66（28）**：按外部消息引用反查投递；搜索谓词不含 `provider_ref_value`
  （`history.repository.ts:435-455`、`schema.ts:126-127`）。
- **REQ-67（27）**：事件列表解释「命中路由但 0 投递」
  （`event-delivery-counts-cell.tsx:35-55`、`events-table.tsx:72-80`）。
- **REQ-68（26）**：路由一键复制（`routes-section.tsx:161-223`、`route-forms.tsx:50-87`）。
- **REQ-69（25）**：新建/编辑静默时提示重叠规则（`suppression-forms.tsx:209-228`）。
- **REQ-70（25）**：出站投递支持 `HTTP_PROXY/HTTPS_PROXY/NO_PROXY`
  （`transport.ts:72-77`、`Dockerfile:75`）；涉及启动参数，需 EXPERT_PANEL。

### docs-drift lane

新增 DOC-29..DOC-32，并补充 DOC-11/22/23：

- `next-round.md:3` 基线 `2f48153`（落后 18 提交），backlog「已知过期输入」仍写
  `7b5d501`（DOC-29）。
- `route-authoring-current-state.md:101,103-118,224` 仍称无缺口解释/无 route×destination
  视图/多条件只能导入，实际已落地（`route-match-gaps.ts:57`、
  `event-detail-route-matches-table.tsx:35-40`）（DOC-30）。
- RC checklist `:18-20,107-109` 与 `:163` 对 delivery history retention 自相矛盾（DOC-31）。
- `alert-suppression-decisions.md:167-168` 称参数化脱敏测试未补，实际已存在
  （`configuration.integration.test.ts:18-19,29-45,1175-1212`）（DOC-32）。
- 另确认 SEC-5（`mvp-rc-checklist.md:41-42` 的「无明文 secret」断言在修复前不成立）。

### quality lane

新增 Q-24..Q-29：

- **Q-24（27）**：`pruneSweepRunning` 是 per-request service 实例字段，单飞从未跨请求
  生效；并发 webhook 会叠加无界 `pruneAllRawPayloads`
  （`intake.service.ts:49-50,176-192`、`container.ts:268-274`、`webhook.ts:55`）。
- **Q-25（26）**：重放与历史样例预览把 `{"retentionPruned":true}` 当真实载荷
  （`event-replay.service.ts:49-81`、`delivery-execution.ts:95`、
  `destination.service.ts:371-390`）。
- **Q-26（25）**：抑制窗口用字符串字典序比较，带偏移 ISO 时间会超期静默或提前失效
  （`suppression.ts:82-97`、`suppression.service.ts:50-57`）。
- **Q-27（24）**：告警源覆盖率把条件路由算成全覆盖（`source-route-coverage.ts:16-31`）。
- **Q-28（22）**：oncall worker 批次共用开始时间，`fired_at` 与退避基准偏早
  （`oncall-worker.service.ts:77-79`、`oncall-execution.ts:97-98,138-143`）。
- **Q-29（20）**：历史样例选择器 pending/error/empty 三态无测试
  （`destination-notices.tsx:131,150-158`）。

### EXPERT_PANEL（SEC-5）

- 安全与可靠性专家、产品与运维专家、独立评估者三人一致推荐 **方案 A：全量遮蔽 +
  fail-closed**。
- 关键约束（均已实施）：不能按点路径逐条删除 header 值（header 名可含 `.`/`$`）；
  env 名冲突必须拒绝；陈旧 refs 必须裁剪；编辑留空=保留的 merge 语义不能破坏。
- 决策记录：`docs/planning/decisions/destination-header-redaction.md`。
- 回滚：`git revert`，无迁移、无数据改写。
- 残余项：编辑表单仍无法删除已有 header，已记入 `REQ-71`。
- REL-13（LICENSE）继续 `blocked-autonomous`。

### 其他

- Obsidian 同步：从 `~/Library/Application Support/obsidian/obsidian.json` 发现 vault
  根目录 `~/Library/Mobile Documents/iCloud~md~obsidian/Documents`，现有 Tocsin 笔记在
  `Vane/` 下，沿用 `Vane <Title>.md` 命名与底部 `## Related` wikilink 风格。本轮同步
  `Vane Iteration Backlog`、`Vane Iteration Log`，新建
  `Vane Destination Header Redaction` 与 `Vane Route Catchall Confirmation`，并更新
  `Vane Index`。
- 本轮 backlog/log 与决策记录随本 `docs(planning):` PR 提交。

### 下一轮优先项

1. **REQ-53（29）**：加急记录审计字段；纯 UI。
2. **REQ-65（28）**：全局静默生效提示。
3. **REQ-66（28）**：按外部消息引用反查投递。
4. **Q-21（28）**：搜索输入 120 字符上限。
5. **Q-24（27）**：prune sweep 单飞跨请求失效；这是真实缺陷，建议优先于普通功能项。
6. 其余见 `iteration-backlog.md` 的「下一轮优先项」。

## 2026-10-19（第 14 轮）

- 时间：2026-10-19 01:25 – 04:15 CST。
- 基线：`origin/main` @ `871c629`；main 最近一次 CI 为 success，无遗留 open PR。
- 本轮类型：**需求发现 + 小修复 + 三车道审计**（非 full-audit）。最近全量审计仍为
  第 1 轮（2026-10-18 13:30 CST，距今约 12 小时）；backlog 仍有大量 ≥27 分候选，
  按第 1.5 步继续消化。
- 车道轮转位置：本轮跑 `requirements` + `release-infra` + `security-exposure`，
  三条车道全部返回（requirements 约 12 分钟、release-infra 约 6.5 分钟、
  security-exposure 约 8 分钟）。下一轮建议 `requirements` + `docs-drift` + `quality`。
- 工作树：`agent-iteration` 仅用于并发锁；实现与验证在会话工作树
  `festive-fermat-7d78d0`；收尾时删除其 `node_modules` 与 `agent-iteration`。

### 本轮交付

- PR #136（`fix(console): rebuild legacy normalized events on read`）—— **Q-20**。
  - `0003` 用 `ADD COLUMN normalized_json TEXT NOT NULL DEFAULT '{}'` 修复旧库，
    历史事件的规范化对象恒为 `{}`，`eventFromRow` 解析抛 ZodError。
  - 受影响：事件/投递详情、事件重放、路由重放预览、oncall；更严重的是
    `claimNext` 在事务内解析事件，一条旧 pending 会让整批回滚并在每个 tick 重复，
    永久饿死新告警。
  - 修复：`normalized_json` 精确等于 `'{}'` 时，用 ingest 同一 INSERT 写入的
    `title/message/severity/status/fingerprint/labels_json/occurred_at` 重建；
    其它非法 JSON 仍抛错。无写库、无迁移、完全可逆。
  - 新增 `docs/planning/decisions/legacy-normalized-event-repair.md`，并在
    `docs/architecture/sqlite-store.md` 记录占位符语义。
  - 验证：`vp check` 0 errors（12 条既有 warning，新增 warning 已修）；`vp run -r test`
    4/4（console 555）；`vp run -r build` 通过；CI 绿后 rebase 合并。

### requirements lane

新增 8 条候选（已写入 backlog）：

- **REQ-57（29）**：Route 全空条件（catch-all）保存护栏。空规则会匹配所有告警，
  表单没有任何确认；抑制表单已有同类先例（`route.ts:17-49`、`route-form.ts:8-15`、
  `route-forms.tsx:231-238,463-470`、`suppression-forms.tsx:224-226,467-488`）。
- **REQ-58（28）**：失败投递区分「等待重试」与「重试耗尽」。列表 DTO 缺
  `maxAttempts`；`operations.ts:86-113`、`history.repository.ts:224-244,284-297`。
- **REQ-59（27）**：配置对象 → 过滤后历史一键钻取；复用现有 URL 参数
  （`operation-search.ts:12-23`、`source-actions.tsx:46-160`、`routes-section.tsx:185-265`）。
- **REQ-60（26）**：停用对象滞留投递的列表可见性与恢复预警
  （`delivery.repository.ts:215-232`、`delivery-retention-notice.tsx:1-20`）。
- **REQ-61（26）**：从投递详情按目标一键静默
  （`delivery-detail-page.tsx:38-60`、`suppression-from-event-dialog.tsx:38-68`）。
- **REQ-62（25）**：Dashboard 账户安全：修改密码与会话撤销
  （`dashboard-user-menu-impl.tsx:80-111`、`auth-options.ts:67-69`）。
- **REQ-63（25）**：Source 接入鉴权状态可见（仅派生布尔值）
  （`source.ts:9-14`、`edit-source-form.tsx:38-52`、`intake.service.ts:344-374`）。
- **REQ-64（25）**：Event/Delivery 详情 Tab 写入 URL
  （`event-detail-view.tsx:25-27`、`delivery-detail-view.tsx:23-25`）。

### release-infra lane

- REL-3/6/7/10/2/5 状态未变。新证据：
  - `docker compose -p tocsin-smoke config` 实测仍解析为 `image: tocsin:local`、
    `source: tocsin-data`；`-p` 不隔离显式卷名和镜像 tag（`docker-compose.yml:7,35-37`、
    `docker-smoke.sh:16-17,29,37`）。
  - `scripts/docker-smoke.sh:37` 先 `down -v`、`:42` 才抓日志，失败时日志必丢；
    三处 curl 无超时；`:92` 只用 `test -f`（REL-6 补充）。
  - E2E 实测：`playwright test --list` 通过，但完整运行因缺
    `chromium_headless_shell-1248`（缓存为 1234）立即失败；`just e2e` 没有安装步骤
    （`Justfile:78-79`）。Playwright 1.64.1 先启动 webServer 再跑 globalSetup，
    `global-setup.ts:13-18` 在服务已打开并迁移后删库（REL-7 补充）。
  - `backup-restore-upgrade.md:123` 的 registry 升级路径使用 `--build`，与 `:170`
    检查表矛盾（REL-10 补充）。
  - **DOC-28（24，新增）**：`mvp-rc-checklist.md:18-19,125,216` 对 E2E/compose smoke
    是否进 CI 的表述互相矛盾。
- CI flaky 核查：main 近 25 次 24 success + 1 cancelled（concurrency），无 failure/rerun。

### security-exposure lane

- **SEC-5（HIGH，新增）**：自定义 header 值在配置导出中明文出现。
  `destinationSecretPaths` 只把 `isSensitiveKey(headerName)` 命中的 header 加入 secret
  path（`config-portability.ts:334-347,391-404`），而 manifest 把整个 header map 声明为
  `valueSensitive` / `secretFields.path = "headers"`（`generic-webhook/manifest.ts:32-38,63-68`）。
  `X-Custom-Auth: Bearer ...` 会明文进入导出文件；编辑 DTO 同样回显
  （`destination.helpers.ts:395-413`）。需 EXPERT_PANEL 决定导出语义。
- **SEC-6（23，新增）**：`tokenHash` 不在 `isSensitiveKey` 覆盖内（纵深防御，当前无输出路径）。
- SEC-2/3/4 状态未变；import protection 构建无违规；其余 DTO、webhook 输入边界未发现新缺口；
  `xqvvu/vane` 仅存在于历史日志/backlog 文本，无有效链接。

### EXPERT_PANEL

- **Q-20**：安全与可靠性专家、产品与运维专家均推荐 A（仅读取容错）；独立评估者推荐
  C（回填 + 容错），备选 A。按「有分歧选最保守且可逆」实施 A。
  决策记录：`docs/planning/decisions/legacy-normalized-event-repair.md`。
  - 回滚：`git revert`，无数据库操作。
  - 残余风险：未来若出现直读 `normalized_json` 的消费者，需重新评估回填。
- **SEC-5** 于第 15 轮进入 EXPERT_PANEL（导出文件兼容性 + 脱敏语义），本轮不动。
- REL-13（LICENSE）继续 `blocked-autonomous`。

### 其他

- Obsidian 同步：从 `~/Library/Application Support/obsidian/obsidian.json` 发现 vault
  根目录 `~/Library/Mobile Documents/iCloud~md~obsidian/Documents`，现有 Tocsin 笔记在
  `Vane/` 下，沿用 `Vane <Title>.md` 命名与底部 `## Related` wikilink 风格。已同步
  `Vane SQLite 存储层`（仓库文档的中文镜像）、`Vane Iteration Backlog`、
  `Vane Iteration Log`，并新建 `Vane Legacy Normalized Event Repair`、更新
  `Vane Index`。过期的英文摘要 `Vane SQLite Store` 已改为指向中文镜像的指针。
- 本轮文档变更（决策记录、架构说明、backlog/log）随 PR #136 提交。

### 下一轮优先项

1. **SEC-5（HIGH）**：自定义 header 导出泄露；先跑 EXPERT_PANEL 再实现。
2. **REQ-57（29）**：Route catch-all 保存护栏。
3. **REQ-53（29）**：加急记录审计字段。
4. **Q-21（28）**：搜索输入上限。
5. 其余见 `iteration-backlog.md` 的「下一轮优先项」。

## 2026-10-19（第 13 轮）

- 时间：2026-10-19 00:25 – 01:05 CST。
- 基线：起始 `origin/main` @ `b05e4a3`；执行中 main 前进到 `d0f80e5`
  （`chore: bump deps`），两个交付分支均已 rebase 到 `d0f80e5`。main 最近一次 CI 为
  success，无遗留 open PR。
- 本轮类型：**需求切片 + 小修复**（非 full-audit）。最近全量审计仍为第 1 轮
  （2026-10-18 13:30 CST，距今约 11.5 小时）；backlog 仍有大量 ≥27 分候选，按第 1.5 步
  继续消化，不重跑全量审计。
- 车道轮转位置：本轮跑 `requirements` + `architecture` + `quality`，三条车道均返回
  （requirements 约 31 分钟、architecture 约 21 分钟、quality 约 31 分钟，后两者经催办
  返回）。下一轮建议 `requirements` + `release-infra` + `security-exposure`。
- 工作树：`agent-iteration` 仅用于并发锁；实现与验证在会话工作树
  `goofy-bun-444b40`；收尾时删除该工作树的 `node_modules` 与 `agent-iteration`。

### 本轮交付

- PR #134（`feat(console): show alert identity in the deliveries list`）—— **REQ-27**。
  - `DeliveryListItem` / `DeliveryListItemSchema` 新增 `eventTitle`、`eventSeverity`、
    `eventStatus`；仓储复用既有 `events` join，不新增查询。
  - 投递列表「事件」列改为：严重程度徽标 + 告警标题；告警源 · 状态 · 事件 ID
    （`firing` 用语义 `text-destructive` 强调，`resolved` 中性）。
  - 新增中文 mini-PRD `docs/prd/delivery-event-identity.md`；新增仓储投影、schema
    枚举拒绝与单元格渲染测试；更新抑制命中与既有 schema fixture。
  - 验证：`vp check` 0 errors（11 条既有 warning）；`vp run -r typecheck` 2/2；
    `vp run -r test` 4/4（console 552 + providers 183 + destinations 31 + 7）；
    `vp run -r build` 通过；CI green。
  - 自查（code-review low）发现并修复 1 条 conventions 问题：`firing` 状态从原生
    `text-red-700` 改为语义 token `text-destructive`。
- PR #135（`docs(release): separate dedupe cleanup from bounded raw pruning`）—— **DOC-21**。
  - RC checklist 的已勾选 gate 收窄为 raw payload pruning；新增未勾选的 dedupe cleanup
    gate（`pruneDedupeKeys` 仍是无界 `DELETE`，且在每次 `enqueueForEvent` 内执行）。
  - `history-retention-and-snapshots.md` §2 增加「本节不覆盖 dedupe cleanup」说明。
  - 验证：`vp fmt --check` 通过；CI green。

### requirements lane

- **REQ-52（28）**：模板 `tocsin.eventUrl` 生产路径恒为空。所有渲染调用点未传
  `eventUrl`，且没有公开访问地址配置（`packages/destinations/src/template.ts:369-399`、
  `feishu/payload.ts:18`、`generic-webhook/payload.ts:18,41`、`slack/payload.ts:24,34`、
  `email/payload.ts:22,84,135`、`destination.service.ts:299`）。
- **REQ-53（29）**：加急记录缺 `initiatedBy` / `firedAt` / `nextAttemptAt` 展示；DTO 已有
  字段，纯 UI（`delivery-pings-table.tsx:28-41`、`oncall.ts:39-50`）。
- **REQ-54（27）**：告警源覆盖无法区分「没有路由」与「只有停用路由」
  （`source-route-coverage.ts:11-27`、`source-route-coverage-cell.tsx:22-30`）。
- **REQ-55（27）**：全静默事件摘要显示 0 成功 / 0 失败，未计入已抑制
  （`event-detail-stats.ts:3-15`、`event-detail-summary.tsx:43-49`）。
- **REQ-56（25）**：被抑制投递无逐项 match checks（PRD 故事 26；
  `suppression.ts:134-141,155-186`、`delivery-suppression-notice.tsx:20-60`）。
- 复核：REQ-48 / REQ-27 / REQ-32 / REQ-22 / REQ-24 / REQ-12 / REQ-13 均仍成立；
  DOC-11 剩余范围收窄为 F5；REQ-13 的 `testPayload` 是能力位而非样例 payload。

### architecture lane

- **ARCH-15（23）**：`runDeliveryWorker` 在 oRPC router 内编排 worker 与 health
  （`server/orpc/features/operations/router.ts:64-77`），应下沉为 service。
- **ARCH-16（22）**：auth 复杂表单仍在 `routes/-login-form-impl.tsx:27-173`、
  `routes/-setup-form-impl.tsx:23-207`，`features/auth` 只有 `api/`。
- **ARCH-17（23）**：`route-forms.tsx:809-811` 与 `components/ai-elements/code-block.tsx:404-423`
  直接使用 `document`/`navigator`/`window`，但无 client-only 标记；`code-block` 另有一套
  剪贴板路径，绕过 `#/lib/browser`。
- **ARCH-18（24）**：抑制详情命中分页保存在 React state
  （`suppression-detail-page.tsx:34,39,119`），未进 URL，刷新回第 1 页。
- **ARCH-19（25）**：Event/Delivery `DetailTerm` 近同构重复；delivery 版本用
  `wrap-break-word`，可能裁切 `fastgpt:<hex>:green:<iso>` 这类长引用
  （`delivery-detail-term.tsx:59`、`event-detail-term.tsx:52-59`）。
- 复核 ARCH-5 / 6 / 7 / 8 / 9 / 12 / 13 / 14、FIX-5 / FIX-9 / FIX-10、DOC-23 均仍成立；
  其余契约维度（service 纯度、容器、repository 拆分、包边界、i18n、import protection）
  clean。

### quality lane

- **Q-20（高）**：旧库升级后 `normalized_json` 未回填。`ensureOlderNullableColumns`
  仅执行 `ADD COLUMN ... DEFAULT '{}'`（`ensure-complete-schema.ts:114-120`），
  `eventFromRow` 直接 `decodeSchemaJson(NormalizedEventSchema, ...)`
  （`intake.helpers.ts:46-59`）。历史事件详情、引用旧事件的投递详情、含旧事件的路由
  重放预览都会因 ZodError 整页失败；列表页不受影响。迁移测试只检查列存在
  （`migrate.test.ts:227,333`），从未读回旧事件。需要 forward-only `0004` 回填 +
  迁移读回测试（下一轮 EXPERT_PANEL）。
- **Q-21（中，28）**：搜索框无 120 字符上限。`q` 的 schema 上限为 120
  （`packages/api/src/schemas/operations.ts:208`），但输入框无 `maxLength`，URL 归一化
  也不截断（`operation-filters.tsx:87-99`、`operations.queries.ts:87-102`）；超长粘贴或
  旧链接会让 loader 校验失败，整个列表变成错误页。
- **Q-22（低）**：外部引用/诊断复制按钮只测「存在」，不测复制内容；非 JSON 响应体回退
  分支无测试（`delivery-summary-tab.test.tsx:52-67`、`delivery-attempts-table.test.tsx:47-78`、
  `delivery-attempt-detail-dialog.tsx:151-185`）。
- 复核 Q-4 / 5 / 12 / 13 / 14 / 15 / 16 / 17 / 18 / 19 均仍成立。
- 另新增 **Q-23（25）**：DOC-21 暴露的 dedupe cleanup 无界 `DELETE` 仍在
  `enqueueForEvent` 热路径（`delivery.helpers.ts:98-99`、`delivery.repository.ts:95`）。

### EXPERT_PANEL

- 本轮无新增 EXPERT_PANEL 决策；未触碰 schema/迁移、secret 处理、投递/路由/auth 语义。
- **Q-20 建议下一轮进入 EXPERT_PANEL**：三位专家评估 forward-only `0004` 回填 +
  `eventFromRow` 降级策略。这是升级路径上的高严重度问题，但不在本轮交付范围内。
- REL-13（LICENSE）继续 `blocked-autonomous`。

### 其他

- Obsidian 同步已跳过：`obsidian-vault` skill 不在本会话可用 skill 列表中；本轮文档变更
  为发布与规划文档，已随 PR #135 提交。

### 下一轮优先项

1. **Q-20（高，P0）**：旧库 `normalized_json` 回填；先跑 EXPERT_PANEL，再实现
   forward-only `0004` 与迁移读回测试。
2. **REQ-53（29）**：加急记录审计字段，纯 UI。
3. **Q-21（28）**：搜索输入上限，含 URL 归一化与 121 字符用例。
4. **REQ-48（28）** / **REQ-52（28）**。
5. 补跑 `release-infra` + `security-exposure` 车道（`requirements` 每轮必跑）。
6. 其余见 `iteration-backlog.md` 的「下一轮优先项」。

## 2026-10-18（第 12 轮）

- 时间：2026-10-18 23:25 – 2026-10-19 00:10 CST（15:25–16:10Z）。
- 基线：`origin/main` @ `d09c5e2`；main 最近一次 CI 为 success，无遗留 open PR。
- 本轮类型：**需求切片 + 小修复**（非 full-audit）。最近全量审计仍为第 1 轮
  （2026-10-18 13:30 CST）；backlog 仍有多个 ≥27 分候选，按第 1.5 步继续消化，
  不重跑全量审计。
- 车道轮转位置：本轮跑 `requirements` + `docs-drift` + `architecture`。
  `docs-drift` 返回 19 条发现；`requirements` 与 `architecture` 运行约 35 分钟无输出，
  按车道限时规则停止，留待下一轮补跑。下一轮建议 `requirements` + `architecture`
  + `quality`（`requirements` 每轮必跑）。
- 工作树：`agent-iteration` 仅用于并发锁；实现与验证在会话工作树
  `eloquent-heyrovsky-98a971`；收尾时删除该工作树的 `node_modules` 与 `agent-iteration`。

### 本轮交付

- PR #131（rebase 合并 `04a408e`）`feat(console): show external message reference on delivery detail`。
  - **REQ-47**：投递详情「摘要」新增「外部消息引用」，展示可复制的
    `providerReference.value` 与机器类型（如 `feishu_message_id`）；无引用显示 `-`
    且不渲染复制按钮。扩展 `DeliveryDetailTerm` 的 `copyValue/copyLabel/hint`，
    复用 `CopyableCodeLine`。
  - 新增中文 mini-PRD `docs/prd/delivery-provider-reference.md`；中英文案同步；
    新增 2 条摘要测试。
  - 验证：`vp check` 0 errors（11 条既有 warning）；`vp run -r test`
    console 546 + providers 183 + destinations 31 全绿；`vp run -r build` 通过。
- PR #132（rebase 合并 `605cb13`）`fix(console): use 告警源 consistently in Chinese source copy`。
  - **FIX-7**：事件列头、路由来源条件、抑制匹配器、通知目标模板变量分组共 10 处
    中文文案统一为「告警源」；保留「模板来源/样例来源」。
  - 验证：`vp check` 0 errors；`vp run -r test` 4/4 通过（console 544）。
  - 纯文案改动，无行为变更。

### docs-drift lane

共 19 条，已整理为 backlog `DOC-21..DOC-27` 并复核 `DOC-11`：

- **HIGH DOC-21（27）**：`docs/release/mvp-rc-checklist.md:164` 声称 dedupe cleanup
  已改为有界批；实际 `delivery.helpers.ts:98-99` 的 `pruneDedupeKeys` 无 `LIMIT`，
  仍是无界 `DELETE`，且与同文件 `:108-109` 自相矛盾。
- **DOC-22（25）**：`docs/planning/next-round.md` 仍把 S0 与抑制写成未决缺口；
  S0 已在 `config-portability.ts:358-370` 修复，抑制已于 2026-10-12 拍板并落地。
- **DOC-23（24）**：`frontend-architecture.md:37-108` 与 `application-container.md:57`
  的文件树/路由/工厂清单过期（缺 suppressions/integrations/oncall、csrf；
  `auth/router.ts` 实为 `session/router.ts`）。
- **DOC-24（24）**：`alert-suppression.md:238` 承诺不存在的 `preview` 过程
  （contract `suppressions.ts:21-63` 无此项，实为 REQ-25）；`:275-294` AC 全未勾选；
  `:289` 仍写「四状态」。
- **DOC-25（23）**：`post-mvp-planning.md:215` 称缺投递缺口解释，实际
  `routeMatchGaps` + `event-detail-route-gaps.tsx` 已上线；retention 已决定不自动清理。
- **DOC-26（22）**：`delivery-retention-notice.md:10-12`（#111）、
  `event-fingerprint-silence.md:5-7`（#116）、`raw-payload-pruned-state.md:9-12`（#118）
  仍用现在时描述已修复的问题。
- **DOC-27（20）**：ADR 0008 的 setup-vp/vite-plus 版本、ADR 0003 与 restructure-plan
  的 `server/functions/`、`route-authoring-current-state.md:3` 的旧 `devs/vane` 路径过期。
- 已确认：`docs/**` 中不再有 `xqvvu/vane` 链接；RC checklist 其余 `[x]` 均有代码支撑；
  两个未勾选项（E2E 接入 CI、provider fixtures）仍准确。

`requirements` 与 `architecture` 车道本轮未返回结果，未新增 REQ/ARCH 候选；
backlog 中既有候选全部复核为仍成立（`requirements` 车道因超时未能逐条复核）。

### EXPERT_PANEL

- 本轮无新增 EXPERT_PANEL 事项；未触碰 schema/迁移、secret 处理、投递/路由/auth 语义。
- REL-13（LICENSE）继续 `blocked-autonomous`。

### 下一轮优先项

1. **REL-3**（28，P0）：Docker smoke 隔离。
2. **REQ-48**（28）：配置删除影响预检。
3. **DOC-21**（27）：RC checklist 的 dedupe cleanup 断言；纯文档更正。
4. **补跑 requirements + architecture 车道**（本轮均超时无输出）。
5. 其余见 `iteration-backlog.md` 的「下一轮优先项」。

## 2026-10-18（第 11 轮）

- 时间：2026-10-18 22:32–23:17 CST（14:32–15:17Z）。
- 基线：`origin/main` @ `31627be`；main 最近一次 CI 为 success，无遗留 open PR。
- 本轮类型：**需求切片**（非 full-audit）。最近全量审计仍为第 1 轮（13:30 CST）；
  backlog 有多个 ≥27 分候选，按第 1.5 步继续消化高价值候选。
- 车道轮转位置：本轮按第 10 轮建议跑 `requirements` + `docs-drift` + `release-infra`。
  `release-infra` 返回完整结果；`requirements` 与 `docs-drift` 运行约 37 分钟仍无输出，
  按车道限时规则停止，留待下一轮补跑。
- 工作树：`agent-iteration` 仅用于并发锁；实现与验证在会话工作树
  `upbeat-wilbur-5e6119`；收尾时删除该工作树的 `node_modules` 与 `agent-iteration`。

### 本轮交付

- PR #130 `feat(console): search deliveries by error, destination, and route`。
  - **REQ-37**：`deliverySearchPredicate` 增加 `deliveries.last_error` 与目标/路由名称的
    关联 `EXISTS` 子查询；列表与计数继续共用同一谓词，计数不新增 join。
  - 搜索框占位文案按页面区分：Events 保持事件字段，Deliveries 承诺「错误、通知目标或路由」。
  - 新增中文 mini-PRD `docs/prd/delivery-search-fields.md`；同步修正旧 PRD 的非目标说明与
    RC checklist 的搜索状态。
  - 新增 3 条仓储搜索用例（失败原因、目标名、路由名 + 手工投递不误伤）与 2 条占位文案用例。
  - 验证：`vp check` 0 errors（11 条既有 warning）；`vp run -r test` 4/4 通过
    （console 544 + providers 183 + destinations 31 + 7/31）；`vp run -r build` 通过。
  - 前置：本轮会话工作树的 `node_modules` 不完整，先执行 `vp install --frozen-lockfile`
    才恢复测试能力。

### release-infra lane

`gh auth status` 确认 token 已含 `workflow` scope；main 最近 5 次 CI 全 success，
最近 50 次 46 success / 1 failure / 3 cancelled，唯一失败已由 `517ecd0f` 修复，非 flaky。

- **REL-3（P0，已核实）**：`docker-compose.yml:7,32-37` 固定镜像与全局卷名；
  `scripts/docker-smoke.sh:16-17,29,37` 复用同一 compose 且无条件 `down -v`。
  新证据：`docker-smoke.sh:35-42` 先 `down -v` 再抓日志，失败时日志必丢；
  `:67,83,96` 的 curl 无连接/总超时。
- **REL-6**：`test -f` 无法区分命名卷/匿名卷，`curl -f` 不校验 HTML，无 restart 持久化验证。
- **REL-7**：除已知问题外，Playwright 先启动 webServer 再跑 globalSetup，
  `e2e/global-setup.ts:13-18` 在服务已打开并迁移数据库之后才删库；host 使用 `127.0.0.1`。
- **REL-5**：CI 只 build，`.output/server/index.mjs` 从未在 CI 启动；建议先加
  `scripts/artifact-smoke.sh`（临时目录/DB + 固定 secret + `/api/ready` 断言）。
- **REL-9/REL-10/REL-11**：migration 测试全为 `:memory:`；恢复 runbook 未清理旧
  `-wal/-shm`；`.github/**` 被 fmt/lint 排除且无 actionlint/shellcheck。均仍成立。
- **REL-4**：`alert-flow.spec.ts:27-119` 未创建 Route、未断言 Delivery，测试名却写
  “set up, route, and deliver”。
- **REL-1**：CI 无 e2e job、无 `playwright install`、无失败 artifact 上传；权限已具备。
- **REL-13**：仓库 public 且 `licenseInfo: null`，维持 `blocked-autonomous`。
- **REL-12**：已确认修复（Node `26.12.0` 与 `.node-version` 一致）。

### EXPERT_PANEL

- 本轮无新增 EXPERT_PANEL 事项。REL-13（LICENSE）继续 `blocked-autonomous`，
  决策材料已在 backlog；后续轮次换组重评。
- 安全红线未触碰：无 schema/迁移、无 secret 处理变化、无投递/路由语义变化。

### 下一轮优先项

1. REQ-47（29）：投递详情展示外部消息引用，纯前端。
2. REL-3（28，P0）：Docker smoke 隔离。
3. 补跑 requirements + docs-drift 车道。
4. REQ-48 / REQ-27 / REQ-32 / REQ-22 / REQ-24 / REQ-12 / REQ-13 等既有高价值候选。
5. REL-6 + REL-7 的 harness/断言增强；REL-5 的 artifact smoke。

## 2026-10-18（第 10 轮）

- 时间：2026-10-18 21:26–22:30 CST（13:26–14:30Z）。
- 基线：`origin/main` @ `d465145`（main CI 最近一次 success）。
- 本轮类型：**需求切片 + 小修复**（非 full-audit）。最近全量审计仍是第 1 轮（13:30 CST）；
  backlog 有多个 ≥27 分候选且无遗留 open PR，按第 1.5 步优先消化高价值候选。
- 车道轮转位置：本轮跑 `requirements` + `architecture` + `quality`，三条均返回。
  下一轮建议 `docs-drift` + `release-infra`（`requirements` 每轮必跑）。
- 工作树：`agent-iteration` 仅用于并发锁；实现与验证使用会话工作树
  `great-davinci-b285f3`；收尾时删除该工作树的 `node_modules` 与 `agent-iteration`。

### 本轮交付

- PR #128 `feat(console): show delivery timing and full attempt diagnostics`。
  - **REQ-42**：投递详情摘要新增创建/结束时间与排队、发送、端到端耗时；
    attempts 表新增「耗时」列。纯派生自既有 `DeliveryDetail` DTO。
  - **REQ-43**：尝试记录的错误/响应单元格改为可点开对话框，完整展示已脱敏
    `error` / `responseBody`；JSON 响应格式化高亮，错误与响应体均可复制。
  - **Q-9（顺带修复）**：`DeliveryExecution.execute` 增加实时时钟，
    `markSucceeded/markFailed` 持久化真实 `startedAt`；attempt 的起止时间不再等于批次时间，
    退避也以真实完成时间为基准。否则新增耗时列会恒为 `0ms`。
  - 新增中文 mini-PRD `docs/prd/delivery-detail-diagnostics.md`；中英文案同步。
  - 新增/更新测试：耗时格式化 7 条、耗时派生 7 条、详情摘要 2 条、attempts 表 4 条、
    执行器时钟 2 条、store 持久化断言 1 条。
  - 验证：`vp check` 0 errors（11 条既有 warning）；`vp run -r test`
    console 539 tests + providers 183 + destinations 31 全绿；`vp run -r build` 通过。
  - 未做浏览器实测：本机没有运行中的 Tocsin console dev server。

### requirements lane

新增 5 条候选（已写入 backlog）：

- **REQ-47（29）**：投递详情展示外部消息引用。DTO 已返回 `providerReference`
  且注明非 secret（`packages/api/src/schemas/operations.ts:115-117`），详情页未渲染；
  纯前端 + 复制。
- **REQ-48（28）**：配置删除影响预检。删除确认只有静态文案
  （`source-actions.tsx:143-146`、`destination-actions.tsx:132-137`、
  `routes-section.tsx:249-252`），而删除会级联清理历史与路由引用；需只读 preview procedure。
- **REQ-49（27）**：可移植配置覆盖抑制规则。`ConfigurationSchema` 只含
  settings/feishuApps/sources/destinations/routes（`packages/core/src/config.ts:85-90`），
  备份/迁移会静默丢失静默窗口。
- **REQ-50（26）**：投递详情内联目标诊断与测试。详情工具栏只有重试/返回
  （`delivery-detail-page.tsx:46-64`），可复用 `destinations.test` 与 `destinationMetadata`。
- **REQ-51（23）**：接入侧拒绝与鉴权失败可观测。`invalid_token`/`source_disabled` 等只写日志
  （`intake.service.ts:64-76,317-327`）；需 forward-only 0004 + 有界遥测 + Sources 列。
- 已确认「补发被抑制投递」仍是 PRD 明确非目标，不立项。

### architecture lane

- 新增 **ARCH-13（22）**：`ConfigPortabilityService` 在 `:99,109` 直接写死 `process.env`，
  options 无 `readEnv`，container 无法注入测试环境；与显式依赖约定不符。
- 新增 **ARCH-14（18）**：`migrate/runner.ts:1` 的 `server-only` 标记冗余；该文件自身不使用
  服务端 API，约束已由上层传递，按 AGENTS 应移除。
- 复核：ARCH-1..12、FIX-5/FIX-9/FIX-10、DOC-6、SEC-3 全部仍成立。
- 已核实清洁：service 无 `ORPCError`/无单例/显式构造、客户端无 server 导入、
  11 个 router 与 contract 名称一致、repository 三件套齐全、container 无请求级数据。

### quality lane

- 复核：Q-5 影响面比原记录更大（损坏 `route_matches_json` 会让 Events 与 Deliveries
  双列表 500，worker claim 与投递详情同样受影响）；Q-7/Q-8/Q-9/Q-10/Q-13 仍成立；
  Q-11 已由 #119 修复。Q-13 的断言实际恒真（驱动错误文本本身不含 secret）。
- 新增 6 条候选：
  - **Q-14（24）**：退避翻倍与上限分支未测（`delivery-execution.ts:219-222`）。
  - **Q-15（24）**：重试/加急按钮完成后未断言恢复可用（`finally` 无守护）。
  - **Q-16（23）**：分页 parity 测试自证（`deliveries-pagination-parity.test.tsx:44-45,64-66`,
    两次渲染同一 helper，EventsTable 从未渲染）。
  - **Q-17（25）**：投递详情页 null / 重试门槛无测试（`delivery-detail-page.tsx:25-35,58`）。
  - **Q-18（22）**：抑制提示降级数据分支未测（`delivery-suppression-notice.tsx:33,36-45`）。
  - **Q-19（24）**：列表页重试/手动 worker 错误路径无测试（`deliveries-page.tsx:75-90`）。
- 次要观察：worker `getHealth()` 失败后保留上一次成功的 `lastRun`，建议明确语义；
  `history.helpers.ts` 的 cursor 编解码已无引用，可随 Q-5 一并清理。

### 本轮未做 / 备注

- 无 EXPERT_PANEL 事项。Q-9 属「修正与契约不一致的行为」，已带回归测试随主 PR 交付。
- 主交付只开一个 PR；收尾另有一条 `docs(planning):` 记录本轮结束时间与工作树清理。
- 工作树已清理：`agent-iteration` 已删除，会话工作树的 `node_modules` 已删除，
  已合并的本地 agent 分支已删除。
- Obsidian 同步跳过：本会话没有 `obsidian-vault` skill。
- 仓库禁止 squash merge，PR 以 rebase 合并。

### 下一轮优先项

1. **REQ-47**（29）：投递详情展示外部消息引用。
2. **REQ-37**（29）：投递搜索覆盖失败原因/目标/路由。
3. **REQ-48**（28）：配置删除影响预检。
4. **REQ-27**（28）：Deliveries 列表告警身份。
5. **REQ-32**（28）：解析失败事件的诊断可见性。
6. **REL-3**（28）：Docker smoke 卷/镜像/项目/端口隔离。
7. 补跑 `docs-drift` + `release-infra` 车道。
8. **Q-14..Q-19 + Q-12/Q-13 + Q-4/Q-5**：合并一个 `test:` PR。

## 2026-10-18（第 9 轮）

- 时间：2026-10-18 20:34–21:15 CST（12:34–13:15Z）。
- 基线：`origin/main` @ `2b6422e`（main CI 最近一次 success）。
- 本轮类型：**需求切片 + 文档修复**（非 full-audit）。最近全量审计仍是第 1 轮（13:30 CST），已超过
  6 小时；但 backlog 有多个 ≥27 分候选且无遗留 open PR，按第 1.5 步优先消化高价值候选。
- 车道轮转位置：本轮跑 `requirements` + `docs-drift` + `architecture`。
  `requirements` 与 `docs-drift` 已返回；`architecture` 超过 30 分钟仍无输出，按记忆中的
  车道限时停止，发现留待下一轮补跑。下一轮建议 `architecture` + `quality`
  （`requirements` 每轮必跑）。
- 工作树：写入隔离仍禁止本会话修改 `agent-iteration`；`agent-iteration` 仅用于并发锁，
  实现与验证使用会话工作树 `heuristic-elgamal-310055`；收尾时删除该工作树的
  `node_modules` 与 `agent-iteration` 工作树。

### 本轮交付

- PR #126 `feat(console): retry failed deliveries from the detail page`（open，CI green 后 rebase 合并）。
  - 详情页工具栏新增 `DeliveryRetryButton`：仅 `failed` 态渲染，复用
    `operations.retryDelivery`；成功后提示「投递已重新入队」并失效 operations 查询，
    失败时展示服务端可读原因；请求进行中禁用。
  - 非失败状态不渲染，避免用户点击后才收到状态错误（仓储只允许失败态重试，
    `delivery.repository.ts:417-419`）。
  - 新增中文 mini-PRD `docs/prd/delivery-detail-retry.md`；中英文案同步。
  - 新增 4 条组件测试；console 517 tests 全绿；`vp check` 0 errors（11 条既有 warning）；
    `vp run -r build` 通过。
  - 未做浏览器实测：本机 5173 端口属于其他项目，没有运行中的 Tocsin console dev server。
- PR #127 `docs: correct stale architecture, search, and release claims`（open，CI green 后 rebase 合并）。
  - 更正 DOC-13（import boundaries 4 处）、DOC-14（suppressions schema/id 工厂）、
    DOC-12（去重证据拆行）、DOC-19（RC checklist 排障候选状态）、DOC-20（历史预览 PRD
    现状陈述）、DOC-4（next-round 基线与 S0 状态）、REL-12（Node 版本）。
  - `vp fmt --check` 通过；纯文档改动，无行为变更。
  - DOC-6（文件树）与 DOC-11（adapter PRD 状态注记）范围较大，留在 backlog 下一轮。

### requirements lane

新增 5 条候选（已写入 backlog）：

- **REQ-42（29）**：告警送达时效剖面。详情摘要与 attempts 表只有原始时间戳，没有排队/
  发送/端到端耗时；DTO 已含 `createdAt/finishedAt`（`operations.ts:107-126`、
  `delivery-summary-tab.tsx:13-66`、`delivery-attempts-table.tsx:29-45`）。纯前端派生。
- **REQ-43（29）**：attempt 响应体/错误全文查看。响应体被截到 120 字并塞进 tooltip
  （`delivery-attempts-table.tsx:56,75-77`、`operation-format.ts:49-56`），而 DTO 已有
  完整且已脱敏的 `error`/`responseBody`（`operations.ts:109-116`）。
- **REQ-44（27）**：未匹配路由事件直接补路由。事件详情只有静默/重放/返回
  （`event-detail-page.tsx:57-71`）；新建路由表单没有初始 rule 入口
  （`route-forms.tsx:50-90`）；明确不追溯 intake 快照。
- **REQ-45（27）**：当前筛选窗口内的投递失败聚合。只有逐行列表；需只读 summary
  procedure + Top N 目标/错误分组（`operations.ts:36-88`、`history.repository.ts:212-290`）。
- **REQ-46（27）**：事件排障摘要一键复制。当前只能复制单个标识符
  （`event-detail-term.tsx:7-44`）；摘要字段均已在页面
  （`event-detail-summary.tsx:11-71`）。

### docs-drift lane

8 处断言过期（前 7 条为已存在的 DOC/REL 项复核）；除 DOC-6/DOC-11 外均已在 #127 更正：

- **DOC-11（高）**：`adapter-contribution-experience.md` 的「不存在」盘点大面积过期：
  contributor guide/scaffold 已存在（`docs/contributing/destination-adapter.md:1`、
  `scripts/new-destination-adapter.mjs:1`、`justfile:71-72`），test-kit 已导出
  （`packages/destinations/src/test-kit/index.ts:1`），registry audit 已消费 `secretFields`
  （`registry.ts:83,103`），`iconName` 已被 console 消费
  （`destination-kind-icon.tsx:26-30`），S0 已改为穷尽 switch（`config-portability.ts:358-370`）。
- **DOC-4（高）**：`next-round.md:3` 基线 `7b5d501` 与工作树路径过期；`:206-221` 仍把 S0
  列为待做第一步，实际已由 `a460a6f` 修复。
- **DOC-13（高）**：import boundaries 文档 4 处与代码不一致：procedure 示例应使用
  `withDashboardService`（`sources/router.ts:5,9-11`）；core operations 路径应为
  `packages/core/src/operations.ts:39`；public probe 使用 `findDashboardContext()`
  （`session/router.ts:26`）；middleware 是 3 个文件而非 4 个。
- **DOC-6（高）**：`application-container.md:56-69` 与 `frontend-architecture.md:37-108`
  文件树仍缺 session/suppressions router、dashboard-context middleware、auth/integrations/
  suppressions feature 与三个 repository。
- **REL-12（中）**：`docker-production-deployment.md:28` 写 Node `26.11.1`，实际
  `.node-version` 为 `26.12.0`。
- **DOC-12（中）**：`route-authoring-current-state.md:120,189` 称去重证据不落库；
  实际 `delivery_dedupe_keys` 已持久化（`schema.ts:164-185`、
  `delivery.repository.ts:95,109`）。`skipExisting` 仍只回传计数，需要拆成两行。
- **DOC-14（中）**：`sqlite-store.md:138-155` 的 schema 列表缺 `suppressions`，
  `:189-198` 的 id 工厂缺 `suppression`（`schema.ts:33`、`store.ts:45`）。
- **DOC-19（新，26）**：`mvp-rc-checklist.md:188` 仍把时间范围、ID 搜索、route explain
  列为下一轮候选，实际均已落地；fingerprint 视图仍未做。
- **DOC-20（新，22）**：`destination-historical-event-preview.md:24` 仍称控制台从未传
  `sampleEventId`，与顶部「已实现」矛盾（PR #122 后遗留）。

### architecture lane

超过 30 分钟仍无输出，按车道限时停止，发现留待下一轮补跑（连续第 3 个未返回的车道）。

### 本轮未做 / 备注

- Obsidian 同步跳过：本会话没有 `obsidian-vault` skill。
- 无 EXPERT_PANEL 事项。
- 仓库禁止 squash merge，PR 以 rebase 合并。

### 下一轮优先项

1. **REQ-42/REQ-43**（29）：投递详情时效剖面、attempt 响应体全文；同一页面、纯前端。
2. **REQ-37**（29）：投递搜索覆盖失败原因/目标/路由。
3. **REQ-27**（28）：Deliveries 列表告警身份。
4. **REQ-32**（28）：解析失败事件的诊断可见性。
5. **REL-3**（28）：Docker smoke 卷/镜像/项目/端口隔离。
6. **REQ-22/REQ-24/REQ-12/REQ-13**（28）：既有高价值切片。
7. 补跑 `architecture` + `quality` 车道。
8. DOC-4/6/11/12/13/14/19/20 + REL-12：文档批量更正，可合并一个 `docs:` PR。

## 2026-10-18（第 8 轮）

- 时间：2026-10-18 20:04–20:35 CST（12:04–12:35Z）。
- 基线：`origin/main` @ `9981b89`（main CI 最近三次全绿）。
- 本轮类型：**需求切片**（非 full-audit）。backlog 有多个 ≥27 分候选，按第 1.5 步继续；
  最近全量审计仍是第 1 轮，已超过 6 小时，但 backlog 未清空，优先消化高价值候选。
- 车道轮转位置：本轮跑 `requirements` + `quality` + `release-infra`。
  `requirements` 与 `release-infra` 已返回；`quality` 收尾时仍在运行，留待下一轮补记。
  下一轮建议 `architecture` + `docs-drift`（`requirements` 每轮必跑）。
- 工作树：写入隔离仍禁止本会话修改 `agent-iteration`；`agent-iteration` 仅用于并发锁，
  实现与验证使用会话工作树 `xenodochial-volhard-09db85`。

### 本轮交付

- PR #125 `feat(console): search events and deliveries by identifier`（open，CI green 后合并）。
  - `eventSearchPredicate` 增加 `events.id`，并用 `EXISTS` 子查询匹配所属投递的
    `deliveries.id`；事件列表粘贴投递 ID 可反查来源事件。
  - 新增 `deliverySearchPredicate`：匹配 `deliveries.id`、`events.id` 及原有事件字段，
    投递列表粘贴事件 ID 可拉出整组投递；列表与计数共用同一谓词。
  - 搜索占位文案更新为中英文「标题、消息、指纹或 ID」。
  - 新增中文 mini-PRD `docs/prd/operation-search-identifiers.md`；新增 2 条仓储测试，
    用互不包含的 opaque ID 隔离四条查找分支并断言 `total` 一致。
  - 验证：`vp check` 0 errors（11 条既有 warning）；`vp run -r test` console 513 tests
    及其余 3 个包全绿；`vp run -r build` 通过。

### requirements lane

新增 5 条候选（已写入 backlog）：

- **REQ-37（29）**：投递搜索覆盖失败原因/目标/路由。`lastError`、目标名、路由名已在表格
  展示（`deliveries-table.tsx:97-101`）但不可搜（`history.repository.ts:425-435`）。
- **REQ-38（29）**：投递详情页重试闭环。RC checklist `:152` 声称详情可 retry，实际只有列表
  有（`delivery-actions.tsx:20-33`、`delivery-detail-page.tsx:47-56`）。
- **REQ-39（27）**：静默窗口剩余时间与一键续期。列表/详情只显示起止时间
  （`suppressions-section.tsx:247-258`、`suppression-detail-page.tsx:83-92`）。
- **REQ-40（26）**：详情返回保留列表筛选。返回固定跳 `/events`、`/deliveries`
  （`event-detail-page.tsx:63-69`、`delivery-detail-page.tsx:49-55`）。
- **REQ-41（26）**：告警源接入指引。创建提示只有 URL/Token
  （`source-token-notice-panel.tsx:16-79`），provider catalog 无接入步骤/示例；
  Generic 文案还声称支持 JSON 字段映射。

### release-infra lane

REL-1..14 均仍成立；RC checklist 只有 3 条未勾选，全是真缺（E2E workflow、provider
fixtures；Docker smoke 属「形式满足、语义未满足」）。本机 `docker`、`just` 均可用。

- **REL-3/6/7 复核**：显式卷名 + 固定镜像 tag 使 `docker-smoke.sh` 的 `-p tocsin-smoke`
  失效，`down -v` 会删除正常栈数据卷；`test -f` 分不清卷类型；E2E 等静态 `/api/health`
  而非 `/api/ready`，端口/DB 路径固定且未固定 locale。
- **REL-1 最小 CI 方案**（已核实可行，无新服务/secret）：`ci.yml` 增加独立 `e2e` job →
  setup-vp（`.node-version` + cache）→ 安装 node-gyp 依赖 → `vp install --frozen-lockfile`
  → `playwright install --with-deps chromium` → `CI=true playwright test`。
- **REL-9/10/11/12/14** 仍成立；`docker-production-deployment.md:28` 的 Node 版本
  （`26.11.1` vs `.node-version` `26.12.0`）可直接修。
- **REL-13**（LICENSE）保持 `blocked-autonomous`，需专家小组做法律/产品决策。

### 本轮未做 / 备注

- `quality` 车道收尾时仍在运行，未返回；下一轮继续并补记发现。
- 未做浏览器实测：本机没有运行中的 Tocsin console dev server。
- Obsidian 同步跳过：本会话没有 `obsidian-vault` skill。
- 无 EXPERT_PANEL 事项。
- 仓库禁止 squash merge，PR 以 rebase 合并。

### 下一轮优先项

1. REQ-38（29）：投递详情页重试闭环。
2. REQ-37（29）：投递搜索覆盖失败原因/目标/路由。
3. REQ-27（28）：Deliveries 列表告警身份。
4. REQ-32（28）：解析失败事件的诊断可见性。
5. REL-3（28）：Docker smoke 隔离。
6. 补记 quality lane 发现（第 7、8 轮连续未返回）。

## 2026-10-18（第 7 轮）

- 时间：2026-10-18 19:12–20:00 CST（11:12–12:00Z）。
- 基线：`origin/main` @ `0fda95c`；本轮合并后为 `65e6f33`（#122）、`2d73ec6`（#123）。
- 本轮类型：**需求切片 + 文档修复**（非 full-audit）。最近全量审计为第 1 轮（13:30 CST），
  距本轮开始 5 小时 42 分，仍不足 6 小时；backlog 有多个 ≥27 分候选，按第 1.5 步继续。
- 车道轮转位置：本轮跑 `requirements` + `quality` + `docs-drift`（承接第 6 轮建议）。
  `requirements` 与 `docs-drift` 已返回；`quality` 在收尾时仍在运行，发现留待下一轮记录。
  下一轮建议 `release-infra` + `architecture`（`requirements` 每轮必跑）。
- 工作树：写入隔离仍禁止本会话修改 `agent-iteration`；`agent-iteration` 仅用于并发锁，
  实现与验证使用会话工作树 `exciting-chandrasekhar-f60fca`，收尾时删除其 `node_modules`。

### 本轮交付

- PR #122 `feat(console): preview destinations with a historical event sample`
  （rebase 合并 `65e6f33`）。
  - 预览对话框新增「样例来源」选择器：内置样例 + 最近 20 条历史 Event；选择后按同一份预览
    请求（已保存 Destination / 新增草稿 / 编辑草稿）重放 `sampleEventId`。
  - 对话框展示当前样例来源与接收时间；空态、加载失败与清除后回退内置样例均有提示。
  - 新增 `recentEventsQueryOptions`（复用 `operations.list`，对话框打开时才加载）；
    无服务端 procedure、schema 或持久化变更。
  - 新增中文 mini-PRD `docs/prd/destination-historical-event-preview.md`；中英文案同步。
  - 新增 2 条对话框测试；console 511 tests 全绿；`vp check` 0 errors、`vp run -r build` 通过。
- PR #123 `docs: correct stale auth, template, and release claims`（rebase 合并 `2d73ec6`）。
  - 更正「应用没有内置登录限流」：Better Auth production 默认启用（10s/100，登录 10s/3）。
  - 补 `TOCSIN_DESTINATION_TIMEOUT_MS` 环境变量；RC checklist 顶部与已勾选 smoke gate 对齐。
  - post-MVP、template follow-up、adapter-extensibility 更新为四种模板模式已交付。
  - 更正 destination registry audit 缺失、console `typecheck` 命令、`auth`→`session` 命名空间、
    ADR 0007 命名空间清单。
  - `vp fmt --check` 通过。

### requirements lane

新增 6 条候选（已写入 backlog），本轮最高分 **REQ-31（29）**：

- **REQ-31（29）**：排障搜索覆盖事件/投递 ID。`eventSearchPredicate` 只匹配
  title/message/fingerprint，列表与 total 共用（`history.repository.ts:397-410`）；URL `q` 已存在。
- **REQ-32（28）**：解析失败事件的诊断可见性。审计事件已写 providerMetadata
  （`intake.service.ts:191-239`），但列表、详情、筛选均不可见
  （`event-raw-tab.tsx:13-28`、`EventListItem` 无该字段）。
- **REQ-33（27）**：绝对时间窗口过滤；仓储只有 `since` 没有上界（`history.interface.ts:23-49`）。
- **REQ-34（27）**：筛选结果导出 CSV；只读 export procedure + CSV 注入转义，上限 5000 行。
- **REQ-35（27）**：运维列表自动刷新；全仓无 `refetchInterval`，Deliveries 连手动刷新都没有
  （`deliveries-page-toolbar.tsx:21-46`）。
- **REQ-36（27）**：事件列表标签可见性；`EventListItem` 不含 labels（`history.repository.ts:52-77`）。
- 附带核实：RC checklist 声称 Delivery 详情可 retry，实际只在列表有
  （`delivery-actions.tsx:25-38`、`delivery-detail-page.tsx:48-56`），留作文档/质量项。

### docs-drift lane

10 处断言过期，全部已在 #123 更正：

- HIGH：`docker-production-deployment.md:114` 称没有内置登录限流，实际 Better Auth production
  默认启用（`auth-options.ts:47-52` 未关闭）。
- MEDIUM：RC checklist 顶部仍称缺 compose smoke automation（同文 `:124` 已勾选）。
- MEDIUM：post-MVP 规划仍把模板引擎、抑制、时间范围列为待讨论方向。
- MEDIUM：template follow-up issues 称三种模式未实现；adapter-extensibility 称模板只覆盖 Feishu、
  destinations registry 无 audit。
- MEDIUM：两处 `vp -C apps/console run typecheck` 不存在（console 无该 script）。
- LOW：`auth.getDashboardSession` 应为 `session.*`（frontend-architecture、
  import-boundaries、application-container）；ADR 0007 命名空间清单缺
  `integrations`/`suppressions`；部署文档缺 `TOCSIN_DESTINATION_TIMEOUT_MS`。

### quality lane

本轮结束时该车道仍在运行，未返回结果；不阻塞交付，下一轮继续并补记发现。

### 本轮未做 / 备注

- 未做浏览器实测：本机 5173 端口是另一个 Nuxt 项目，没有运行中的 Tocsin console dev server。
- Obsidian 同步跳过：本会话没有 `obsidian-vault` skill。
- 无 EXPERT_PANEL 事项。
- 仓库禁止 squash merge，两个 PR 均以 rebase 合并。

### 下一轮优先项

1. REQ-31（29）：搜索覆盖事件/投递 ID。
2. REQ-27（28）：Deliveries 列表告警身份。
3. REQ-32（28）：解析失败事件的诊断可见性。
4. REL-3（28）：Docker smoke 卷/镜像/项目/端口隔离。
5. REQ-22/REQ-24/REQ-12/REQ-13（28）：既有高价值切片。
6. REQ-25（27）、REQ-33/34/35/36（27）。
7. 补齐 quality lane 发现并记录。

## 2026-10-18（第 6 轮）

- 时间：2026-10-18 18:16–19:00 CST（10:16–11:00Z）。
- 基线：`origin/main` @ `e4dcab9`；本轮合并后为 `73e0691`（#118）、`ecb8a8e`（#119）。
- 本轮类型：**需求切片 + 小修复**（非 full-audit）。最近全量审计为第 1 轮（13:30 CST），
  距本轮开始不足 6 小时；backlog 有多个 ≥27 分候选，按第 1.5 步规则继续。
- 车道轮转位置：本轮跑 `requirements` + `release-infra` + `architecture`。`requirements`
  与 `release-infra` 先返回，`architecture` 在收尾阶段返回；下一轮建议
  `quality` + `docs-drift`（`requirements` 每轮必跑）。
- 工作树：写入隔离仍禁止本会话修改 `agent-iteration`；`agent-iteration` 仅用于并发锁，
  实现与验证使用会话工作树 `compassionate-blackburn-817360`。工作树已清理：
  `agent-iteration` 已删除，会话工作树的 `node_modules` 已删除，本轮三个 agent 分支已删除。

### 本轮交付

- PR #118 `feat(console): surface retention-pruned raw payloads explicitly`
  （rebase 合并 `73e0691`）。
  - `EventDetail` 新增派生字段 `rawPayloadPruned`；`isPrunedRawPayload` 精确匹配
    `{retentionPruned:true}` 哨兵，真实载荷带同名字段不误判。
  - Raw 标签页在已清理时显示「原始数据已按保留策略清理」说明，不再把哨兵当 JSON 渲染。
  - 新增中文 mini-PRD `docs/prd/raw-payload-pruned-state.md`；中英文案同步。
  - 新增 6 条测试；console 507 tests 全绿；`vp check` 0 errors、build 通过。
- PR #119 `test(console): cover resolver failures on the delivery send path`
  （rebase 合并 `ecb8a8e`）。
  - 覆盖 `resolveDestinationConfig` 的 `DomainValidationError`（最终失败、不重试）与
    未知异常（脱敏后记录）两条此前无测试的分支。
  - 新增 2 条测试；console 509 tests 全绿；`vp check` 0 errors、build 通过。

### requirements lane

新增 6 条候选（已写入 backlog），本轮最高分 **REQ-26（29）**：

- **REQ-26（29）**：Destination 用真实历史 Event 预览。服务端 `previewDestination` 已接受
  `sampleEventId` 并能读取历史事件（`destination.service.ts:197-212`），但控制台从未传参
  （`destinations-page.tsx:179-188`）；预览对话框也不显示样例来源。纯前端切片。
- **REQ-27（28）**：Deliveries 列表只显示 source + eventId，不显示告警标题/严重程度/状态，
  而筛选面板允许按 severity/status 过滤（`delivery-event-cell.tsx:1-18`、
  `history.repository.ts:218-237`、`operation-filters.tsx:248-308`）。
- **REQ-25（27）**：抑制规则试跑预览。PRD 承诺 `preview` 与范围预览
  （`alert-suppression.md:97,209,238`），代码只有 list/get/hits；
  `urgent-impact-preview.tsx` 只按 destinationIds 缩小目标，不评估事件。
- 中长期：REQ-28（21，投递历史名称快照，需 forward-only 0004）、REQ-29（24，抑制保留期清理）、
  REQ-30（25，配置页搜索/过滤）。
- 合并建议：REQ-21 扩为 `deliveryOutcome + routeMatch=none|any`；REQ-9/REQ-12/Route 最近活动
  共用 `ConfigurationActivitySummary` DTO。已写入对应 backlog 备注。
- 附带确认：FIX-8（抑制 `createdBy` 永远为空）仍是 REQ-25 的前置项。

### release-infra lane

复核 REL-1..5 仍存在，修正一处旧结论：**当前 token 已有 `workflow` scope**，
REL-1 的阻碍是发布 gate 设计与 spec 覆盖，不是权限。新增发现：

- **N2（升级 REL-3 到 28）**：`docker-compose.yml:7,32-37` 固定镜像 `tocsin:local` 与全局卷名
  `tocsin-data`；`docker-smoke.sh:16-17,29,37` 固定项目名/端口并复用同一 compose 文件。
  正常栈运行时 smoke 会挂载真实 SQLite 卷（双 worker 竞争）并覆盖镜像 tag，
  `down -v` 会删除真实数据卷。应先加 `docker-compose.smoke.yml` override。
- **N1（REL-6，26）**：smoke 断言弱于 checklist：`test -f` 无法区分命名卷与匿名卷；
  `curl -f` 不校验 HTML；没有 restart 持久化验证（`docker-smoke.sh:91-98`）。
- **N3（REL-7，26）**：E2E 等 `/api/health` 而非 `/api/ready`；固定 4173 端口与
  `/tmp/tocsin-e2e.sqlite`；`global-setup.ts:14-21` 重复默认值；未固定 locale。
- **N4（REL-8，23）**：没有任何门禁同时覆盖「生产构建 + 真实操作链路」。
- **N5（REL-9，25）**：migration 测试全部使用 `:memory:`，文件库/WAL/校验和未覆盖。
- **N6（REL-10，25）**：备份恢复 runbook 未删除快照中不存在的旧 `-wal`/`-shm`。
- **N7（REL-11，22）**、**N9（REL-12，24）**、**N10（REL-13，blocked-autonomous）**、
  **N8/N11（REL-14，20）**：workflow 校验、Node 版本文档、LICENSE 缺失、发布卫生项。
- 已核实非问题：CI 权限最小化、Node 版本接线、migration 升级单测、health/ready 语义。

### architecture lane

未发现 HIGH 级一致性缺口；REQ-5/REQ-7/REQ-16 均未破坏分层与导入边界。ARCH-1..9 全部
仍成立，FIX-5、DOC-6 仍成立。新增：

- **NEW-1（ARCH-10，23）**：`destination-form.tsx:82-1292` 单体 1390 行，适配器/模板/预览
  区域全部内联；建议与模板编辑器改造一起拆。
- **NEW-2（ARCH-11，24）**：抑制表单仍是 `useState` + 手写校验
  （`suppression-forms.tsx:193-236`），不符合 AGENTS 的 TanStack Form 约定。
- **NEW-3（FIX-9，24）**：`server/runtime/store.ts` 无生产 importer，唯一引用是自身测试；
  `application-container.md:50` 仍声称它存在。
- **NEW-4**：`OperationFilters` 的 `rail`/`grid` 布局分支只剩测试可达
  （`operation-filters.tsx:58,64-77`），建议并入 FIX-5 删除。
- **NEW-5（ARCH-12，22）**：`hashSourceToken` 定义在 `intake.service.ts`，被 source 与
  config-portability service 直接导入，建议移到窄模块。
- **NEW-6/NEW-7（DOC-13/DOC-14，24/23）**：import boundaries 文档 4 处不一致
  （`auth.getDashboardSession`、`context.dashboardRequest` 示例、namespace 列表、
  `operations.ts` 路径）；sqlite-store 文档缺 `suppressions` 表与 `suppression` id 工厂。
- **NEW-8（FIX-10，20）**：`@faker-js/faker`、`@tanstack/match-sorter-utils` 无 import。
- **NEW-9 / NEW-10（仅记录）**：`route-match-gaps.ts` 领域逻辑放在 repository 目录；
  `features/configuration` 缺 `model/`，`use-settings-workspace.ts` 放在 `ui/`。
- 已核实清洁：service 无 `ORPCError`、无模块级 service 单例、container 无请求级数据、
  entrypoint 薄、contract/implementer 11 个 namespace 同步、repository 三件套齐全、
  包边界与前端边界干净。

### 本轮未做 / 备注

- 未做浏览器实测：本机没有运行中的 Tocsin console dev server。
- Obsidian 同步跳过：本会话没有 `obsidian-vault` skill。
- 无 EXPERT_PANEL 事项；REL-13（LICENSE）记录为 `blocked-autonomous`，需后续专家小组
  做法律/产品决策。
- 仓库禁止 squash merge，两个 PR 均以 rebase 合并。

### 下一轮优先项

1. REQ-26（29）：Destination 历史 Event 预览（纯前端）。
2. REQ-27（28）：Deliveries 列表告警身份。
3. REL-3（28）：Docker smoke 卷/镜像/项目/端口隔离。
4. REQ-25（27）：抑制规则试跑预览。
5. REL-6 + REL-7（26/26）：smoke 断言与 E2E harness 隔离。
6. Q-12/Q-13/Q-4/Q-5：纯测试补齐。
7. FIX-8（26）、DOC-4/6/11/12/13/14 + REL-12。
8. 低风险 chore：FIX-5 + FIX-9 + NEW-4 + FIX-10（删除死代码/死分支/未用依赖）。
9. REL-1/REL-4 在扩 spec 后再接 CI；ARCH-10/ARCH-11 等再次触碰对应文件时做。

## 2026-10-18（第 5 轮）

- 时间：2026-10-18 17:25–18:05 CST（09:25–10:05Z）。
- 基线：`origin/main` @ `3e62eb7`；本轮合并后为 `a563ff7`（#116），#117 待合并。
- 本轮类型：**需求切片 + 小修复**（非 full-audit）。最近全量审计为第 1 轮（13:30 CST），
  距今 < 6 小时；backlog 有 ≥27 分候选，按第 1.5 步规则继续。
- 车道轮转位置：本轮跑 `requirements` + `quality`（拆窄后首次返回）+ `docs-drift`。
  下一轮建议 `release-infra` + `architecture`（`quality` 已覆盖，按 6 小时窗口轮转）。
- 工作树：写入隔离仍禁止本会话修改 `agent-iteration`，实现使用会话工作树
  `practical-shannon-179ae9`；`agent-iteration` 的并发锁已获取，收尾时删除。

### 本轮交付

- PR #116 `feat(console): silence an event fingerprint from its detail page`
  （rebase 合并 `a563ff7`）。
  - 事件详情工具栏新增「静默此指纹」，打开复用 `CreateSuppressionForm` 的对话框，
    预填当前告警源 + 指纹 + 两小时窗口；告警源/目标按需加载，失败有可读提示。
  - 新增纯函数 `suppressionDefaultsFromEvent` 与 `CreateSuppressionForm.defaultValues`。
  - 新增中文 mini-PRD `docs/prd/event-fingerprint-silence.md`；中英文案同步。
  - 新增 2 条测试；console 501 tests 全绿；`vp check` 0 errors、build 通过。
- PR #117 `docs: correct migration, suppression, and release status claims`（待合并）。
  - 更正 DOC-1/2/3/5/7/8/9/10：抑制已实现、migration 为 0001–0003、E2E/smoke 脚本存在但未接
    CI、route explain 已实现、4 处仓库链接、pnpm 版本。
  - 同步修正 `AGENTS.md` 的 migration 契约与不存在的 `migrate.ts` 入口。

### requirements lane

新增 5 条候选（已写入 backlog）：

- **REQ-20（27）**：配置导入预检与变更摘要；导入实际是 upsert，UI 文案却称“替换”
  （`config-portability.service.ts:140-245`、`portable-config-form.tsx:47-54`）。
- **REQ-21（27）**：Events 按投递结果筛选（无投递/失败/被抑制）；事件列表已 join deliveries
  统计（`history.repository.ts:47-77`），但查询契约无此维度。
- **REQ-22（28）**：补投预览目标级明细与执行范围一致；Event 预览已有 `targets` 未渲染，
  Route 预览只显示前 10 条却执行全部（`event-replay-action.tsx:153-175`、
  `route-replay-prompt.tsx:161-162`）。
- **REQ-23（28）**：Raw payload 保留策略清理的显式状态；哨兵 `{retentionPruned:true}` 被当普通
  JSON 展示（`intake.helpers.ts:23-25`、`event-raw-tab.tsx:10-17`）。
- **REQ-24（28）**：抑制窗口影响面汇总；详情页只有 `hits.total`，无事件/目标/最近命中汇总
  （`suppression-detail-page.tsx:35-43`、`suppressions.ts:24-30`）。

### quality lane（拆窄后返回）

6 条新发现（Q-8–Q-13，已写入 backlog），并修正 Q-4 为 6 个 NOT_FOUND 分支：

- **Q-8（26）**：`markSucceeded` 抛错被当成发送失败并重试，可能重复发送/重复 page
  （`delivery-execution.ts:72,93-102,142-159`）。
- **Q-9（24）**：同批 attempt 共用 run 开始时间，`finishedAt == startedAt`，退避可能已过期
  （`delivery-worker.service.ts:48,76,79`）。
- **Q-10（24）**：claim 后单条 execute 抛错会中断整批，剩余投递滞留 `running`
  （`delivery-worker.service.ts:55-77,85-93`）。
- **Q-11/Q-12/Q-13（24/24/20）**：resolver 错误分支、destination test 失败脱敏、worker
  脱敏测试注入不足；均为 AUTO_FIX 补测试候选。

### docs-drift lane

- DOC-1/2/3/5/7/8/9/10 复核为已过期并已在本轮 #117 更正。
- DOC-6 部分完成（`sqlite-store.md` 迁移与仓库树）；`application-container.md`、
  `frontend-architecture.md` 的文件树仍待改。
- 新增 **DOC-11（24）**（`adapter-contribution-experience.md` 的“不存在”盘点部分过期）与
  **DOC-12（23）**（`route-authoring-current-state.md` 去重证据断言过期）。

### 本轮未做

- 未做浏览器实测：本机只有无关的 5173 监听，没有 Tocsin console dev server。
- Obsidian 同步跳过：本会话没有 `obsidian-vault` skill。
- 无 EXPERT_PANEL 事项。

### 下一轮优先项

1. REQ-23（28）：Raw payload 保留策略清理状态。
2. REQ-22（28）：补投预览目标级明细与执行范围一致。
3. REQ-24 / REQ-12 / REQ-13（28）：三选一的新 summary/service 切片。
4. REQ-8（28）：Deliveries 按最后活动过滤/排序。
5. Q-11/Q-12/Q-13 + Q-4/Q-5：合并一个 `test:` PR。
6. DOC-4/DOC-6/DOC-11/DOC-12：剩余文档漂移。
7. REL-3（27）：Docker smoke 卷隔离。

## 2026-10-18（第 4 轮）

- 时间：2026-10-18 15:54–17:20 CST（07:54–09:20Z）。
- 基线：`origin/main` @ `364270b`；本轮合并后为 `6002c9f`（#113）、`f21ccb6`（#114）。
- 本轮类型：**需求切片 + 小修复**（非 full-audit）。最近全量审计为第 1 轮（13:30 CST），
  距今 < 6 小时；backlog 有 ≥27 分候选，按第 1.5 步规则继续，不重跑全量审计。
- 车道轮转位置：本轮跑 `requirements` + `quality` + `release-infra`。`requirements`、
  `release-infra` 已返回；`quality` 超时未返回（连续第 2 轮），下一轮补跑或拆小任务。
- 工作树：写入隔离仍禁止本会话修改 `agent-iteration`，改用会话工作树
  `elated-franklin-f012b3`；`agent-iteration` 的并发锁已获取，收尾时删除工作树与锁。

### 本轮交付

- PR #113 `feat(console): scope operation filters and add route filtering`
  （rebase 合并 `6002c9f`）。
  - `OperationFilters` 新增 `scope`：Events 只渲染搜索、告警源、严重程度、状态、时间范围；
    Deliveries 额外渲染目标、路由、投递状态。修复 Events 页两个静默 no-op。
  - Deliveries 新增 URL `routeId`，贯穿 contract → service → repository 的列表与计数谓词；
    路由下拉复用 `routesQueryOptions()`，保留停用路由以便查历史投递。
  - 新增中文 mini-PRD `docs/prd/operation-filter-scope.md`；中英文文案同步。
  - 新增 7 条测试；console 498 tests 全绿；`vp check` 0 errors、build 通过。
- PR #114 `fix(console): reject redacted placeholders when importing configuration`
  （rebase 合并 `f21ccb6`）。
  - 导入在 feishu appSecret、source/destination `secret_refs` 环境值、kind-owned secret 路径、
    source 顶层敏感键四个位置拒绝字面量 `[REDACTED]`；抛错回滚事务。
  - 新增集成测试覆盖四类位置并断言 sources/destinations/feishu apps/settings 均未被修改；
    console 499 tests 全绿。

### requirements lane

新增 4 条候选（已写入 backlog）：

- **REQ-16（28）**：Event 详情一键按 fingerprint 静默；纯前端切片，复用抑制表单预填与
  claim-time 抑制校验（`event-detail-page.tsx:49-59`、`suppression-forms.tsx:67-100`）。
- **REQ-17（27）**：加急呼叫失败的全局可观测与再呼叫；投递成功但电话全失败时没有任何信号
  （`oncall-execution.ts:136-159`、`delivery-execution.ts:104-118`）。
- **REQ-18（27）**：按当前失败筛选批量重试投递；复用 `retryNow` 语义
  （`delivery.repository.ts:411-440`），需确认框与硬上限。
- **REQ-19（26）**：Events/Deliveries 按标签键值过滤；`json_each(labels_json)` 精确匹配，
  建议 REQ-5 合入后再做（同文件）。
- 附带 **FIX-8（26）**：抑制 `createdBy` 永远为空（`suppression.service.ts:53-71`）。

### release-infra lane

- **REL-3 升级到 27**：`docker-compose.yml:32-37` 显式全局卷名，配合
  `docker-smoke.sh:16,36-37` 的 `down -v`，会删除正常部署的 `tocsin-data` 卷；
  应在任何 Docker smoke 接入 CI 之前修复。
- **REL-1 证据补全**：`ci.yml:16-51` 无 e2e job；`vite.config.ts:51` 排除 `e2e/**`；
  全仓无 `playwright install`；`playwright.config.ts:7-9` 注释误称已有 workflow。
- 新增 **REL-4（25）**：E2E spec 只覆盖 setup/source/destination/webhook/events，
  未创建 Route、未验证 Delivery/retry/filter/重启/导出（`alert-flow.spec.ts:27`）。
- 新增 **REL-5（24）**：build 产物启动与文件型 SQLite migration 无 CI smoke。
- 新增 **DOC-9（27）**：发布文档声称没有 E2E/smoke、迁移只有 0001，与代码不符。
- **REL-2 规模量化**：6 个 adapter 测试文件、19 个内联 payload、31 个用例。

### 本轮未做

- `quality` 车道超时未返回（连续第 2 轮）。
- 未做浏览器实测：本机无运行中的 Tocsin console dev server。
- Obsidian 同步跳过：本会话没有 `obsidian-vault` skill。

### 下一轮优先项

1. REQ-16（28）：Event 详情一键静默。
2. REQ-8（28）：Deliveries 按最后活动过滤/排序。
3. REQ-12 / REQ-13（28）：Destination 最近投递健康或 Source 接入自检。
4. REL-3（27）：Docker smoke 卷隔离（需本地 Docker 实测）。
5. DOC-9 + DOC-1..5/10：发布与架构文档批量更正。
6. 补跑 quality lane（拆小任务避免再次超时）。

## 2026-10-18（第 3 轮）

- 时间：2026-10-18 14:52–16:00 CST（06:52–08:00Z）。
- 基线：`origin/main` @ `4abcfe7`；本轮合并后为 `1458a7a`。
- 本轮类型：**需求切片 + 小修复**（非 full-audit）；最近全量审计为第 1 轮（13:30 CST），
  但 backlog 有 ≥27 分候选，按第 1.5 步规则继续。
- 车道轮转位置：本轮跑 `requirements` + `quality` + `architecture`。`requirements` 与
  `architecture` 已返回；`quality` 超时未返回，下一轮补跑 `quality` → `release-infra` →
  `docs-drift` → `security-exposure`。
- 工作树：写入隔离仍禁止本会话修改 `agent-iteration`，改用会话工作树
  `great-darwin-b34359`；`agent-iteration` 的并发锁已获取，结束前删除。

### 本轮交付

- PR #110 `fix(console): honor fingerprint search and escape LIKE wildcards`
  （rebase 合并 `dcfced9`）。
  - 搜索谓词统一覆盖 `title` / `message` / `fingerprint`，四处列表/计数共用；
    `%`、`_`、`\` 转义并 `ESCAPE '\'`。
  - 新增 `search.test.ts`（5 条），验证指纹命中、`%`/`_` 字面量与 total 一致性。
- PR #111 `feat(console): warn when disabled targets hold deliveries`
  （rebase 合并 `1458a7a`）。
  - 新增 `DeliveryRetentionNotice`：pending 投递在目标/路由停用时说明滞留原因并给出配置页链接。
  - 路由列表通知目标列显示「N 个目标已停用」徽标。
  - 新增中文 mini-PRD `docs/prd/delivery-retention-notice.md`；中英文文案同步。
- 验证：两个 PR 均通过 `vp check`（0 errors）、`vp run -r test`（console 491 tests）、
  `vp run -r build`，CI green 后合并。

### requirements lane

新增 4 条候选（已写入 backlog）：

- **REQ-12（28）**：Destination 列表最近投递健康；`DestinationListItemSchema:64-66` 无健康字段，
  `destinations-section.tsx:56-104` 无投递结果列；AGENTS.md 要求先有 server-side summary DTO。
- **REQ-13（28）**：告警源接入自检 dry-run；所有 provider manifest 声明 `testPayload: true`
  （`packages/providers/src/types.ts:62`）但无消费者，Sources 只有编辑/轮换/启停/删除
  （`source-actions.tsx:21-163`）。
- **REQ-14（27）**：Raw/debug JSON 搜索与折叠；`event-json-block.tsx:14-47` 与
  `delivery-json-block.tsx:14-47` 仅渲染 + 复制；post-MVP 方向 4 `:133` 已列入。
- **REQ-15（26）**：存储容量与历史增长信号；Settings 只有 locale/timeZone/retention
  （`packages/api/src/schemas/settings.ts:5-9`），无行数/体积；`history-retention-and-snapshots.md:22,90` 列为未做。

### architecture lane

新增 5 条候选：

- **ARCH-5（24）**：service 直接构造并抛 `RecordNotFoundError`
  （`destination.service.ts:35,138,158,202,250,374`、`oncall.service.ts:7,59,73`），
  仓库已有 `requireDestination`（`destination.helpers.ts:224`）。
- **ARCH-6（24）**：`/api/ready` 直接访问 SQLite store（`routes/api/ready.ts:10,19,22,26`），
  入口过厚，缺 readiness service。
- **ARCH-7（23）**：`routes-section.tsx`、`suppressions-section.tsx` 内联多个 cell/actions/empty state。
- **ARCH-8（22）**：public i18n router 内联 cookie/header locale 解析
  （`server/orpc/features/i18n/router.ts:13-25`）。
- **ARCH-9（23）**：`locale-cookie.ts:29-35,37-47` 直接使用 `document`/`navigator`，
  无 client-only 标记且被 server router 导入。
- 其余契约项（容器装配、无 service 单例、无 DI、`withDashboardService`、core 环境中性、
  route loader 边界、`vp` 工具链）均 clean。

### 本轮未做

- `quality` 车道超时未返回；未发现需要 EXPERT_PANEL 的新事项。
- 浏览器验证：本机无运行中的 Tocsin console dev server（5173 属于其他项目），未做浏览器实测。

### 下一轮优先项

1. REQ-8 或 REQ-5（28）：Deliveries 按最后活动过滤/排序，或按路由过滤 + 筛选面板按页面能力渲染。
2. REQ-12 或 REQ-13（28）：Destination 最近投递健康，或 Source 接入自检 dry-run。
3. FIX-6（27）：导入配置拒绝字面量 `[REDACTED]`。
4. DOC-1/2/3/4/5：一批高价值文档更正，可合并为一个 `docs:` PR。
5. REL-1（24）：交 EXPERT_PANEL 裁决 E2E / Docker smoke 接入 CI。
6. 补跑 quality lane。

## 2026-10-18（第 2 轮）

- 时间：2026-10-18 14:30–14:40 CST（06:30–06:40Z）。
- 基线：`origin/main` @ `6ea9ec1`；本轮合并后为 `411846e`。
- 工作树：`/Users/chuanhu9/devs/tocsin/.claude/worktrees/cranky-bell-ed610f`。
- 本轮类型：**escalated-fix + requirements**（非 full-audit）。
- 最近全量审计：2026-10-18 第 1 轮（约 13:30 CST）；下次全量审计最早在 19:30 CST 之后。
- 车道轮转位置：本轮已跑 `requirements`；下轮从 `quality` → `architecture` 继续，之后
  `release-infra` → `docs-drift` → `security-exposure`。
- 并发锁：未使用。routine 指定的 `agent-iteration` 工作树被本会话写入隔离拦截，
  改用会话独占工作树 `cranky-bell-ed610f`；下一轮仍应在可用工作树内先检查/创建锁。

### EXPERT_PANEL：SEC-1

- 三位专家（安全与可靠性 / 产品与运维 / 独立评估者）独立评审后一致同意实施。
- 最终选择：`isSensitiveKey` 归一化键名 + 精确集合 + 凭据词尾规则；`redactText`
  的正则由同一规则程序化生成，支持带引号 JSON；保留 `tokenCount` / `maxTokens` /
  `privateKeyId` 可见。
- 决策记录：`docs/planning/decisions/secret-redaction-coverage.md`。
- 附带发现：FastGPT 探测错误在逐键脱敏后仍会暴露上游 code/message，改为原始错误
  呈凭据形状时整体隐藏（`packages/providers/src/fastgpt/parse.ts`）。
- 证据：`packages/core/src/redaction.ts:5-8`、`config-portability.ts:302-326`、
  `configuration.integration.test.ts:29-89`。

### EXPERT_PANEL：Q-1

- 三位专家一致同意实施。
- 最终选择：共享层 `createTimeoutFetch`（10s 默认，传 signal + race deadline，
  覆盖响应体），`DestinationErrorKind` 产生 `timeout` + `retryable`；环境变量
  `TOCSIN_DESTINATION_TIMEOUT_MS`（1–30000ms）注入 worker、destination test 与
  Feishu app 测试。
- 取舍：上限取 30s（产品/运维专家）而非 60s（安全专家），保守且低于 5 分钟 stale 窗口。
- 决策记录：`docs/planning/decisions/outbound-http-timeout.md`。
- 证据：`packages/destinations/src/utils.ts:75-82`、`types.ts:51-57`、
  `delivery-worker.service.ts:40,75-77`。

### requirements lane

新增 5 条候选（已写入 backlog）：

- **REQ-7（29）**：停用目标造成投递静默滞留。`claimNext` 跳过停用目标/路由
  （`delivery.repository.ts:219-226`），但 enqueue 不检查（`:97-168`）；投递 DTO 已有
  `destination.enabled` / `route.enabled`（`packages/core/src/operations.ts:110-121`），
  UI 未展示（`delivery-summary-tab.tsx:14-65`；`routes-section.tsx:319-338`）。
- **REQ-8（28）**：Deliveries 按 `created_at` 排序/过滤（`history.repository.ts:240,269-271`），
  表格却展示 `updated_at`（`deliveries-table.tsx:106-108`），重试后的旧投递会从时间窗口消失。
- **REQ-9（27）**：告警源缺少「最近接收时间」，无法区分上游安静与 Webhook 失效
  （`packages/core/src/source/source.ts:13-18`；`sources-section.tsx:38-77`）。
- **REQ-10（27）**：Event/Delivery 详情互链缺失，三处入口都是纯文本
  （`delivery-summary-tab.tsx:30-43`；`event-detail-deliveries-table.tsx:52-77`；
  `delivery-event-cell.tsx:9-17`）。
- **REQ-11（25）**：Worker/队列健康只有手动运行响应可见（`packages/api/src/contract/operations.ts:84-87`），
  RC checklist `:160` 声称已有 health/last-run，但后台 runner 状态不可见。

附带发现：`next-round.md` 的 A/B/D2/D3/F3/F4/F7 切片已在当前代码落地，续做 DOC-4 时一并更新；
`zh-Hans.json:545` 的「来源」与 AGENTS.md「告警源」不一致（FIX-7）；RC 剩余 gate 主要是
E2E（REL-1）、provider fixtures（REL-2）与备份恢复演练。

### 本轮交付

- PR #107 `fix(core): widen secret redaction coverage`（rebase 合并 `03caa9b`）。
  - 验证：`vp check` 0 errors；`vp run -r test` 全绿；`vp run -r build` 通过。
- PR #108 `fix(destinations): bound outbound requests with a deadline`（rebase 合并 `411846e`）。
  - 验证：`vp check` 0 errors；`vp run -r test` 全绿；`vp run -r build` 通过。

### 下一轮优先项

1. FIX-2 + FIX-3：搜索覆盖 fingerprint，并转义 LIKE 通配符。
2. REQ-5：Deliveries 按路由过滤 + 筛选面板按页面能力渲染。
3. DOC-1/2/3/4/5：一批高价值文档更正。
4. FIX-6：导入配置拒绝字面量 `[REDACTED]`。
5. REL-1：下一轮交 EXPERT_PANEL 裁决 E2E / Docker smoke 接入 CI。

## 2026-10-18（第 1 轮）

- 基线：`origin/main` @ `db54860`（本轮开始时为 `2c10265`，期间主分支合入依赖升级）。
- 工作树：`/Users/chuanhu9/devs/tocsin/.claude/worktrees/agent-iteration`。
- 并发锁：已获取并在结束时删除。

### 专家发现

**requirements（需求发现）**

- REQ-1 时间范围过滤：搜索 schema / contract / 仓储均无时间字段
  （`operation-search.ts:7-25`、`packages/api/src/schemas/operations.ts:190-202`、
  `history.interface.ts:23-43`）；方向见 `docs/prd/post-mvp-planning.md:124-135`。评分 29。
- REQ-5 Deliveries 按路由过滤：`listDeliveries` 已 join `routes` 并投影 `route_name`
  （`history.repository.ts:218-232`），但筛选面板无路由条件。评分 28。
- REQ-2/3/4/6 见 backlog。

**docs-drift（文档漂移）**

- 23 处断言过期，最高优先级：
  - `docs/release/mvp-rc-checklist.md:55-56` 称抑制「没有 service、oRPC、页面」，实际全栈已存在
    （`server/suppressions/suppression.service.ts`、`server/orpc/features/suppressions/router.ts`、
    `features/suppressions/ui/`、`routes/_dashboard.suppressions*.tsx`）。
  - `docs/adr/0010-...:79`、`docs/release/mvp-rc-checklist.md:87`、
    `docs/prd/destination-template-engine.md:72`、`docs/prd/destination-template-follow-up-review.md:118`
    仍指向 `xqvvu/vane`，实际仓库为 `xqvvu/tocsin`。
  - 模板表单限制、`next-round.md` 基线、迁移计划、架构文件树、抑制 PRD 状态均过期。
  - 已核实 `config-portability.ts:311-325` 的穷尽 switch 与参数化脱敏测试已存在（`a460a6f`），
    `next-round.md` §1.1 的结论不再成立。

**security-exposure（安全与数据暴露）**

- 已关闭：destination kind 穷尽 switch 及其参数化测试存在
  （`config-portability.ts:311-325`、`configuration.integration.test.ts:1173-1211`）。
- MEDIUM（ESCALATE）：`isSensitiveKey` 漏掉 `appSecret`/`clientSecret`/`apiSecret`/`privateKey`/
  `X-Auth-Token`（`packages/core/src/redaction.ts:3-9`），source config 与 destination header
  可能明文导出。
- 无真实 secret 进入 oRPC DTO；import protection 标记无违规；日志脱敏已接线并有测试。

**release-infra（发布基建）**

- E2E 脚本与 Docker smoke 已存在，但 CI 未接入；`ESCALATE(需 workflow scope)`。
- E2E spec 覆盖面小于 RC checklist A 的要求（未创建 Route、未验证 Delivery/retry）。
- provider 无 fixture 目录，payload 仍内联于六个 `index.test.ts`。
- `scripts/docker-smoke.sh` 使用全局卷名，`down -v` 会删除正常数据卷。

**architecture（架构一致性）**

- service 纯度、容器装配、repository 拆分、feature 边界、`components/common` 纯度、import 约定、
  i18n 约定、adapter 形状均 clean。
- 大文件：`route-forms.tsx` 965 行、`suppression-forms.tsx` 699 行各含两个导出组件；
  `delivery-state-badge.tsx` 三个导出组件。
- `system-information.ts` 五层相对路径导入根 `package.json`。

**quality（质量与回归）**

- HIGH（ESCALATE）：出站 HTTP 无超时（`packages/destinations/src/utils.ts:42-57` 等），
  单个挂起目标会卡住单进程 worker；改变投递失败语义，需人工拍板。
- MEDIUM：删除不存在的 Source/Destination/Route 返回成功而非 NOT_FOUND
  （`source.service.ts:76-85`、`destination.service.ts:120-129`、`route.service.ts:61-67`）。
- MEDIUM：搜索未转义 LIKE 通配符（`history.repository.ts:95-101` 等）。
- MEDIUM：history repository 查询覆盖薄；destination service NOT_FOUND 分支缺测试。
- LOW：出站响应体无上限；provider `*Result` 对非对象 payload 抛错；若干前端模块无测试。

### 本轮交付

- PR #104 `feat(console): add time range filters to events and deliveries`
  - 新增 URL `range`（15m/1h/6h/24h/7d），Events 按 `received_at`、Deliveries 按 `created_at`，
    列表与 `total` 同谓词；服务端解析相对窗口，时钟可注入。
  - 新增 `docs/prd/operations-time-range.md`。
  - 验证：`vp check`、`vp run -r test`（477 tests）、`vp run -r build`；
    浏览器实测请求体 `{"limit":20,"eventPage":1,"range":"1h"}`，服务端 200。
- PR #105 `test(console): pin the virtualizer viewport in the time zone test`
  - 依赖升级后 `@tanstack/react-virtual` 改用 `clientHeight` 测量，jsdom 默认 0 导致虚拟列表不渲染。
  - 仅测试改动；修复后 main 恢复绿灯。

### 上报事项

- `SEC-1`：扩展 `isSensitiveKey` denylist（secret 处理，需人工拍板）。
- `Q-1`：为出站 HTTP 增加超时与失败分类（改变投递语义，需人工拍板）。
- `REL-1`：把 E2E / Docker smoke 接入 CI（当前 token 缺 `workflow` scope，无法推送 workflow 改动）。

### 下一轮优先项

1. FIX-2 + FIX-3：搜索覆盖 fingerprint，并转义 LIKE 通配符。
2. REQ-5：Deliveries 按路由过滤 + 筛选面板按页面能力渲染。
3. DOC-1/2/3/4/5：一批高价值文档更正。
4. 复核 `docs/planning/next-round.md` 的过期基线后再决定是否续做其中的切片。
