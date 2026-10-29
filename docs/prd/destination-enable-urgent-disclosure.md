# 重新启用通知目标前披露排队中的加急呼叫

## 问题

停用通知目标会同时冻结两条队列：投递 worker 只领取启用目标的待发送投递，加急 worker
也只领取「目标已启用」的定时呼叫（`infra/sqlite/repositories/oncall/oncall.repository.ts`
的 `claimNext`，`innerJoin destinations ... where destinations.enabled = 1`）。因此目标停用
期间，命中加急条件的告警不会丢，呼叫会以 `scheduled` 状态在库里累积。

停用确认框已经把风险说清楚：路由影响、受影响告警源、排队投递数、自动加急会停止
（`features/destinations/ui/destination-actions.tsx` 的停用分支）。但**重新启用**的分支
只有一个图标按钮，点击立即生效（同文件启用分支）。启用后下一次 worker tick 会把这些积压
呼叫全部领取并拨打，而电话一旦拨出无法撤回——这正是值班工程师在凌晨最需要提前知道的事。

文档已经写明该行为（`apps/docs/operations/incident-playbook.md` 的停用/恢复小节），
UI 没有兑现。

## 用户故事

作为值班 SRE，我在重新启用一个停用过的通知目标前，希望确认框直接告诉我「启用后会立即
派发多少条排队中的加急呼叫」，以及队列里还有多少待发送投递，这样我可以选择先处理积压
（例如先手动确认告警已恢复）再启用，而不是在毫无提示的情况下让一批电话同时打出去。

## 范围

- 仓储：`OncallRepository.countScheduledForDestination(destinationId)`，只读，统计
  `state = 'scheduled'` 且 `attempt_count < max_attempts` 的 ping（与 `claimNext` 的领取条件
  对齐），SP 无迁移。
- 服务：`DestinationService.previewEnableDestination`，先校验目标存在（不存在抛
  `RecordNotFoundError`），再返回 `{ scheduledUrgentCallCount }`。
- 契约：`packages/core` 新增 `PreviewDestinationEnableCommandSchema` 与
  `DestinationEnablePreviewSchema`；`@tocsin/api` 新增
  `destinations.previewEnable`（只读，声明 `NOT_FOUND`）。
- UI：启用分支改为确认对话框，复用现有 `QueuedDeliveriesNotice` 展示排队投递，新增
  `DestinationScheduledUrgentNotice` 展示排队中的加急呼叫；计数为 0 或读取失败时不渲染，
  不阻塞启用。中英文案各 6 条。
- 测试：服务/仓储行为测试（停用期间累积、已拨出不计数、领取后清零、未知目标 404）、
  组件测试（复数/单数/0/失败）、Destinations 表格的启用确认流程测试。

## 非目标

- 不改变启用/停用的写入语义，不改 `claimNext` 的领取条件，不改加急派发流程。
- 不做「取消排队中的 ping」或批量启用（另见 backlog 中加急相关候选）。
- 不展示接收人名单或按严重级别拆分；只给一个可执行的等待数量。
- 无 schema、无迁移、无新依赖。

## 验收标准

1. 停用目标在库里有 N 条 `scheduled` 加急呼叫时，启用确认框显示 N；N=0 时不渲染该区块。
2. 已拨出（`fired`）或正在拨打（`running`）的呼叫不计入；已被 worker 领取后计数回落。
3. 停用期间调用 `claimNext` 不会领取任何 ping，计数持续累积（测试固定该前提）。
4. 目标不存在时 `destinations.previewEnable` 返回 404，而不是空计数。
5. 启用必须经确认：打开确认框不会触发更新，确认后才调用 `onToggle`。
6. 读取失败或尚未返回时，确认框仍可正常启用，不出现错误提示即阻塞。
7. 中英文案键位对齐；不加 destructive 底色，保持 11px 文案的对比度。

## 架构边界

- 计数留在仓储层（SQL 只读），服务只做存在性校验与 DTO 组装，符合「entrypoint 薄、
  service 表达领域错误、repository 拥有持久化」的分层。
- `previewEnable` 是只读 procedure，经 `withDashboardService` 取服务，不接触容器内部。
- 新组件放在 `features/destinations/ui/`，自持查询（与 `QueuedDeliveriesNotice` 相同的
  advisory 约定），不进入 `components/common`。
- 计数是即时问题，查询 `gcTime: 0`，关闭确认框即丢弃缓存。
