# 全局投递暂停的操作者与最近一次暂停区间

> 状态：已交付。以下「问题」段保留交付前的现状记录。

## 问题

全局暂停出站投递是实例级急停：暂停期间 worker 不认领任何队列，恢复后积压会一次性发送，
飞书 app 模式的加急呼叫还可能重新呼叫仍在触发中的告警接收人。它因此是一个需要事后复盘的
运维动作，但当前控制台只回答「现在是否暂停」和「本次暂停从何时开始」，
不回答「是谁停的、谁恢复的、上一次停了多久」。

事后复盘时通常已经恢复投递，`delivery_paused_at` 也被清空
（`apps/console/src/infra/sqlite/repositories/settings/settings.repository.ts`），
控制台上没有任何痕迹能证明这次急停发生过。团队共用 owner 账号时，仅凭时间点也无法归因。

## 用户故事

作为值班 SRE，在事故复盘时我需要看到「这次是谁在几点暂停了出站投递、谁在几点恢复、
暂停持续了多久」，这样我能确认急停是经过授权的操作，并把这段静默窗口与漏发的告警对上。

作为下一个值班的人，我在设置页看到「最近一次暂停」时，需要知道上一位操作者是谁，
以便在交接时询问当时的判断依据。

## 范围

- 暂停时记录操作者（dashboard session 的登录邮箱）与开始时间；重复暂停保留首次的操作者与时间。
- 恢复时记录操作者与结束时间，并把这一区间持久化为「最近一次暂停」。
- `AppSettings` 只读投影新增：
  - `deliveryPausedBy`：当前暂停的操作者；未暂停时为 `null`。
  - `lastDeliveryPause`：最近一次**已完成**的暂停区间
    `{ startedAt, endedAt, pausedBy, resumedBy }`；从未恢复过时为 `null`。
- 设置页暂停面板：
  - 暂停中显示「自 {time} 起暂停 · 操作者 {actor}」；
  - 运行中且存在最近区间时显示「最近一次暂停：{start} – {end} · 操作者 {actor}」；
  - 操作者缺失（旧数据或进程内调用）时退化为不带操作者的文案。
- 操作者只从服务端已验证的 session 读取，浏览器不提交操作者字段。

## 非目标

- 不做完整暂停历史（多次区间），只保留最近一次；完整审计留给账号/操作日志方向。
- 不改变暂停/恢复语义、worker 认领谓词或积压处理方式。
- 不新增暂停原因、工单号或自动恢复时间（后者见 NEW-AR）。
- 不新增表或迁移：沿用 `settings` 键值表。

## 验收标准

1. `settings.deliveryPaused=true` 时写入 `delivery_paused_by`，并在投影中返回 `deliveryPausedBy`。
2. 暂停中再次发送暂停不会覆盖首次的 `delivery_paused_at` 与 `delivery_paused_by`。
3. 恢复时把 `{startedAt, endedAt, pausedBy, resumedBy}` 写入最近区间，并清空实时字段。
4. 恢复后再次修改 locale / 保留天数等无关设置不会清掉最近区间。
5. 进程内调用（配置导入、测试）不提供 actor 时区间仍记录，`pausedBy`/`resumedBy` 为 `null`。
6. 设置页在暂停中与恢复后分别显示操作者与最近区间；中英文案成对存在。
7. 无数据库迁移；回滚只需回退代码，新增的 `settings` 键对旧版本无副作用。

## 架构边界

- `packages/core`：`DeliveryPauseRecord` 类型与 schema、`AppSettings` 投影字段。
- `packages/api`：`AppSettingsOutputSchema` 增加同名字段。
- `apps/console/src/infra/sqlite/repositories/settings`：settings KV 读写；
  `SettingsUpdateInput` 与只读投影分离，避免把派生字段写回。
- `apps/console/src/server/configuration/app-settings.service.ts`：接收 `actor` 选项。
- `apps/console/src/server/orpc/features/settings/router.ts`：从
  `context.dashboardRequest.currentUser.email` 注入 actor。
- `apps/console/src/features/configuration/ui`：仅展示，不推断操作者。
