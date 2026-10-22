# 后台 Worker 健康只读投影

## 问题

Tocsin 是单进程应用，出站投递与加急呼叫分别由进程内的后台 runner 驱动。值班时最关键的
问题「两个队列现在是否还在跑、上一次跑完是什么时候、上次失败原因是什么」目前只在操作员
手动点击「运行 Worker」后的一次性 toast 里出现
（`apps/console/src/features/operations/ui/worker-notice-panel.tsx`）。

这带来两个盲区：

- 后台 runner 静默失败时，控制台没有任何入口能看到 `lastError` 与失败状态。运维只能通过
  外部日志或数据库判断，而单进程部署里日志往往正是最先丢失的东西。
- `OncallWorker.getHealth()` 已经存在
  （`apps/console/src/server/oncall/oncall-worker.service.ts:47`），但没有任何生产消费者；
  加急（电话）队列是否在推进完全不可见。配置了加急目标的实例无法确认「电话真的会打出去」。

`docs/release/mvp-rc-checklist.md` 把 worker health / last-run 视为可观测能力的一部分，
但后台 runner 的状态并未投影到控制台。

## 用户故事

作为值班 SRE，我希望在设置页直接看到投递 Worker 与加急 Worker 的当前状态、上次运行时间、
上次运行计数和上次错误，这样我不用点「运行一次」也知道后台队列在正常工作。

作为交接班的人，我希望确认两个 Worker 都处于 idle 且最近完成时间很新，这样我能判断
「上游安静」和「后台停了」不是同一件事。

## 范围

- 新增只读投影 `settings.getWorkerHealth`，返回：

  ```ts
  {
    delivery: WorkerHealthEntry;
    oncall: WorkerHealthEntry;
  }

  interface WorkerHealthEntry {
    started: boolean;              // 进程内 runner 是否已装配
    state: "idle" | "running" | "failed";
    lastStartedAt: string | null;
    lastFinishedAt: string | null;
    lastError: string | null;      // 已脱敏文本
    lastRun: DeliveryWorkerRunResult | null;
  }
  ```

- `started` 区分「runner 尚未装配」与「已装配但还没跑过」。读取健康不启动 runner：
  投影只观察容器内已存在的 runner，绝不为读健康而创建后台循环。
- 设置页新增「后台 Worker」面板，并排展示投递与加急两侧：状态、上次开始、上次完成、
  上次运行计数（领取 / 回收 / 成功 / 失败 / 重试）、上次错误。
- 未装配时显示「未启动」；已装配但从未运行时显示「尚未运行」；`lastError` 使用等宽、
  可换行但不溢出的文本展示。
- 手动刷新设置页时一并刷新该投影。

## 非目标

- 不做队列深度（待投递 / 待呼叫条数）。加急队列没有现成的聚合查询，新增仓储方法属于
  REQ-11 的剩余部分，单独评估。
- 不改变 Worker 启动时机与容器装配顺序（`ARCH-51` 仍待 EXPERT_PANEL）。
- 不做后台健康检查定时器、不做告警推送、不写入事件或投递表。
- 不暴露数据库路径、环境变量、目标凭据或原始 payload。

## 验收标准

1. `settings.getWorkerHealth` 需要 dashboard 鉴权；未登录返回既有 dashboard 错误。
2. runner 已装配时返回其 `getHealth()` 的五个字段，`started=true`。
3. runner 未装配时返回 `started=false`、`state="idle"`、其余字段为 `null`，且**不**创建 runner。
4. 两个队列互相独立：一侧失败不影响另一侧投影。
5. `lastError` 在服务层与 runner 层都经过 `redactText`，投影原样透传已脱敏文本。
6. 设置页在三种状态下渲染不同文案：未启动、尚未运行、有上次运行；中英文案成对存在。
7. 无数据库迁移；回滚只需回退代码。

## 架构边界

- `packages/api`：`WorkerHealthEntrySchema` / `WorkerHealthOutputSchema` 与
  `settings.getWorkerHealth` 契约；复用 `DeliveryWorkerRunResultSchema`。
- `apps/console/src/server/runtime/worker-health.service.ts`：纯投影服务，注入两个
  「读取 runner 快照」的函数，便于用假 runner 测试；不直接持有容器。
- `apps/console/src/server/runtime/container.ts`：新增 `createWorkerHealthService()`，
  只读取已存在的 `runner` / `oncallRunner`，不调用 `ensure*WorkerRunner()`。
- `apps/console/src/server/orpc/features/settings/router.ts`：薄入口，注册
  `withDashboardService((container) => container.createWorkerHealthService())`。
- `apps/console/src/features/configuration/ui/settings-worker-health-panel.tsx`：设置页区块；
  `api/configuration.queries.ts` 提供 `workerHealthQueryOptions()`。
