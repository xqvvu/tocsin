# 投递「未被抑制」判定回放

- 状态：已交付（第 161 轮）
- 关联：`docs/prd/alert-suppression.md` 故事 26；backlog `REQ-321`

## 问题

抑制功能只回答了「这条投递为什么被拦下」，没有回答另一半问题：
**「这条投递为什么没有被拦下？」**

- 投递详情仅在 `job.state === "suppressed"` 时渲染抑制说明
  （`apps/console/src/features/deliveries/ui/delivery-detail-view.tsx:21`）；
- 条件证据组件在没有 `suppressionId` 时直接返回 `null`
  （`apps/console/src/features/deliveries/ui/delivery-suppression-checks.tsx:29-31`）。

结果是：值班同学在维护窗口期间收到一条告警时，只能逐条打开「告警静默」页面，
手工比对来源、目标、严重程度、标签，无法在投递现场确认「当时到底有没有规则生效、
哪条规则差一点命中、差在哪个条件」。抑制 PRD 故事 26 明确要求同时回答
「was or was not silenced」（`docs/prd/alert-suppression.md:221`）。

## 用户故事

作为值班 SRE，我希望在投递详情里看到**按当前规则定义回放到该投递创建时刻**的抑制判定，
以便：

1. 确认维护窗口期间「本应被静默却仍然发出来」的告警，到底是规则没覆盖，还是规则写错了；
2. 看到最接近命中的那条规则以及它失败的具体条件，直接修正规则；
3. 发现「规则后来被改宽了，现在会误静默」的漂移风险。

## 范围

- 投递详情「概要」标签页新增只读区块「抑制判定回放」，仅对**非 suppressed** 投递渲染。
- 读取当前抑制规则列表（`suppressions.list`），用 `suppressionStateAt` 过滤出
  **投递创建时刻**处于 `active` 的规则，再用与接入路径相同的
  `evaluateSuppressionMatch` 重算判定。
- 展示：
  - 总体徽标（「未被抑制」/「按当前规则会命中」）；
  - 回放时刻与该时刻生效规则数量；
  - 逐条规则的命中/未命中徽标与**失败条件**，按「错得最少」排序，最可疑的规则排最上；
  - 无条件规则单独标注；
  - 明确写出两条口径限制：规则启用状态取当前值、事件已渲染为脱敏副本时不回放。
- 复用现有组件：`RouteMatchResultBadge`、`RouteMatchCheckBadges`、
  `DeliveryDetailSectionHeader`、`OperationTimestamp`。

## 非目标

- 不修改抑制引擎、接入路径或 worker 的判定语义。
- 不为历史投递补存 matcher 快照（回放用当前规则定义，口径已写在界面上）。
- 不新增 oRPC 过程、DTO 字段或数据库迁移。
- 不改变 `suppressed` 投递现有的说明与条件证据。

## 验收标准

1. 非 suppressed 投递的概要页出现「抑制判定回放」区块；suppressed 投递不出现。
2. 投递创建时没有 active 规则 → 显示「该投递创建时没有生效的抑制规则」，规则数为 0。
3. 有 active 规则但均未命中 → 显示「均未命中」，并列出每条规则的失败条件
   （例如「严重程度：期望 Critical，事件实际为 Warning」）。
4. 当前规则定义现在会命中 → 显示「按当前规则会命中」与漂移提示。
5. 规则窗口在投递创建之后才开始 → 不计入生效规则。
6. 事件内容含 `[REDACTED]` → 显示「无法可靠回放」，不给出命中结论。
7. 规则读取失败 → 显示读取失败，**不得**显示「没有生效规则」。
8. 多条规则时按失败条件数量升序排列。

## 架构边界

- 纯前端切片：只改 `apps/console/src/features/deliveries/**` 与 i18n 文案。
- 语义复用 `@tocsin/core` 的 `suppressionStateAt` / `evaluateSuppressionMatch` /
  `isUnconditionalSuppressionMatcher`，不在 console 重新实现匹配。
- 无 schema、无迁移、无新增运行时依赖；读取走既有 `suppressions.list`。
- 事件已脱敏的判断复用 `containsRedactedValue`（由 `delivery-route-evidence` 导出），
  与路由命中依据面板保持同一口径。
