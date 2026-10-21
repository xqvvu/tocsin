# 事件详情投递表的错误与重试时间可读性

## 问题

事件详情「投递」标签页是值班工程师排障的主界面，但两列信息在 1280px 视口下不可读：

- 「最近错误」列没有显式宽度，只分到约 10% 的表格宽度（1280×900 实测 116px），
  一条 `connect ECONNREFUSED …` 或 `Webhook 返回 …` 只能看到约 10 个字符，
  完整错误必须逐行 hover `title`（`apps/console/src/features/events/ui/event-detail-deliveries-table.tsx:44-46,72-80`）。
  触屏设备没有 hover，等于看不到失败原因。
- 「下次」列固定使用 `format="time"`，只显示时分（实测 2030-01-01 的待重试行显示为 `00:00`），
  日期只存在于 hover `title`；表头「下次」也没有说明这是重试时间
  （`apps/console/src/features/events/ui/event-detail-deliveries-table.tsx:41-43,72-75`、
  `apps/console/src/features/operations/ui/operation-timestamp.tsx:29-48`）。

失败原因与下次重试时间恰好是这张表要在第一屏回答的两个问题，当前却都依赖鼠标悬停。

## 用户故事

作为值班 SRE，我打开一条事件详情时，希望直接看到失败投递的完整错误摘要（至少两行、
约 20 个中文字符），以及明确带日期的下次重试时间，这样我不用 hover 就能判断
「是超时还是凭证失效」以及「修复是否还来得及」。

## 范围

- 重新分配事件详情投递表列宽，「最近错误」获得 ≥ 23% 宽度（1280px 下 ≥ 250px），
  单元格最多两行，完整文本仍通过 `title` 与投递详情页可查。
- 「下次」列按配置时区判断：与当前时间同一日历日时仍只显示时分，跨天时显示完整
  日期与时间。
- 表头「下次」改为「下次重试」/「Next retry」，明确语义。
- 新增纯函数 `nextRetryDateFormat(value, now, timeZone)` 承载跨天判断，便于单测。

## 非目标

- 不改变投递排序（失败 → 运行中 → 待处理 → 成功 → 已抑制）或同状态稳定性。
- 不改变服务端查询、DTO、投递状态机或重试语义。
- 不新增列排序、筛选、URL 参数或详情跳转。
- 不调整 Deliberies 列表页的列宽与 sticky 行为（另见 backlog UI-25）。
- 不引入相对时间库或新依赖。

## 验收标准

1. 1280×900 下「最近错误」列宽 ≥ 250px，失败行可显示约 20 个中文字符或两行英文；
   完整文本仍存在于 `title` 属性。
2. `nextAttemptAt` 与当前时间同一日历日时显示 `HH:mm`；跨天（含跨年）时显示
   包含日期的完整时间。
3. 表头在中文界面显示「下次重试」，英文界面显示「Next retry」。
4. 排序行为与同状态稳定性不变；新增 `running` 状态的排序断言。
5. 390px 视口下表格仍可横向滚动，不引入新的裁切或重叠。
6. 单测覆盖：跨天/同日/非法时间值的格式选择；组件测试覆盖跨天时间可见日期、
   错误文本与 `title`。

## 架构边界

纯前端渲染层改动：

- `apps/console/src/features/operations/model/operation-format.ts`（新增纯函数）
- `apps/console/src/features/events/ui/event-detail-deliveries-table.tsx`
- `apps/console/src/i18n/messages/zh-Hans.json`、`en-US.json`（一条表头文案）

不涉及 schema、迁移、oRPC contract、service、投递/路由/auth 语义。
