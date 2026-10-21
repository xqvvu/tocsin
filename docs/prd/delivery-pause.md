# 出站投递全局暂停（运维急停）

- 状态：已实现（第 64 轮，NEW-AA）
- 相关代码：`apps/console/src/server/deliveries/delivery-worker.service.ts`、
  `apps/console/src/infra/sqlite/repositories/settings/settings.repository.ts`、
  `apps/console/src/features/configuration/ui/settings-delivery-pause-panel.tsx`、
  `apps/console/src/features/deliveries/ui/deliveries-paused-notice.tsx`

## 问题

投递 Worker 每个 tick 无条件回收卡住任务并领取新任务
（`delivery-worker.service.ts:47-62`），实例级设置只有语言、时区和 Raw payload
保留天数（`configuration-results.ts:7-11`）。当下游大面积故障、通知目标被上游限流，
或运维正在改路由/目标配置时，值班工程师只能逐个停用通知目标：

- 停用目标只覆盖被该目标引用的投递，仍会命中其他目标；
- 逐个停用容易漏，且恢复时要再逐个启用；
- 用「全局静默」会改变告警匹配语义，被静默命中的投递会直接进入终态，**排队中的
  任务被丢弃**，恢复后也无法补发。

缺少一个「停止出站、但保留积压」的实例级急停开关。

## 用户故事

作为值班工程师，在下游故障或配置变更窗口内，我能一键暂停出站投递，Worker 不再
领取任何排队任务、也不改动已有投递状态；故障恢复后我一键恢复，积压的投递继续
按原计划发送。

## 范围

- `AppSettings` 增加 `deliveryPaused` / `deliveryPausedAt`，以 settings 表的键值对
  持久化（`delivery_paused`、`delivery_paused_at`），**无 schema 迁移**。
- `UpdateAppSettingsCommand` 增加可选 `deliveryPaused`：省略时保持现状，避免其它设置
  保存动作意外恢复投递。
- 暂停时保留首次暂停时间：重复下发暂停不会重写 `deliveryPausedAt`；恢复时清空。
- 投递 Worker 在 `runOnce` 开头读取设置：暂停时直接返回 `paused: true` 的零结果，
  **不回收、不领取、不改任何投递状态**。
- 读取设置移动到 reclaim/claim 之前：设置读取失败时不会留下刚被 claim 的
  `running` 投递（顺带收窄 Q-10 的失效面）。
- Settings「界面」页签新增「暂停出站投递」控制，切换即生效，不需要保存。
- Deliveries 页顶部显示暂停横幅（含暂停起始时间）与「恢复投递」按钮；暂停期间
  「运行 Worker」按钮禁用。
- 手动运行 Worker 的返回结果与健康快照带上 `paused`，Toast 明确提示「本次未领取任务」。

## 非目标

- 不改变加急呼叫（on-call）Worker 的调度语义：加急是呼叫通道，暂停投递不等于停止
  呼叫；两者保持独立。
- 不把暂停状态写入便携配置（TOML/JSON 导入导出）：它是实例运行态，不是可搬运配置。
- 不提供定时暂停、自动恢复或按目标/路由的细粒度暂停。
- 不改变投递重试、退避、终态或加急触发的既有语义。

## 验收标准

- 未设置时 `settings.get()` 返回 `deliveryPaused: false`、`deliveryPausedAt: null`。
- 暂停后 Worker `runOnce()` 返回 `claimed/reclaimed/succeeded/failed/retrying` 全为 0
  且 `paused: true`；排队投递仍为 `pending`，发送端未被调用。
- 恢复后下一次 `runOnce()` 正常领取并发送积压投递，结果 `paused: false`。
- 重复暂停不改变 `deliveryPausedAt`；恢复后 `deliveryPausedAt` 为 `null`。
- Settings 切换与 Deliveries 横幅走同一 oRPC `settings.update`，刷新后状态一致。
- 暂停期间 Deliveries 页「运行 Worker」不可点击。
- `vp check`、`vp run -r test`、`vp run -r build` 通过。

## 架构边界

- 持久化沿用 settings 键值表，由 `SqliteSettingsRepository` 负责，无迁移、无破坏性变更。
- 暂停判断放在 `DeliveryWorker.runOnce`，不改变 `DeliveryRepository` 的 claim/reclaim
  契约；服务层与 oRPC 边界沿用既有 `AppSettingsService` 与 `settings.update`。
- 前端只在 `features/configuration/ui` 与 `features/deliveries/ui` 增加组件，不新增
  全局状态库；状态走 TanStack Query 的 `appSettingsQueryOptions`。
- 不新增运行时依赖，不引入新服务，不改变投递/路由/auth 的核心语义。
