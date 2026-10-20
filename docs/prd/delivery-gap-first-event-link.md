# 去重缺口：首发事件可直达

## 状态

已实现（REQ-173）。本文记录切片范围与验收标准。

## 问题

事件详情的「未投递的原因」表会在 `duplicate_within_window` 行里指出「首次由事件
`first_event_id` 触发」，但该 ID 只是纯文本（`apps/console/src/features/events/ui/event-detail-route-gaps.tsx:88-96`）。
运维看到这条信息后的下一步必然是打开那条真正投递成功的事件，对照它的时间、载荷和投递结果；
现在只能手工复制 ID 再去事件列表查找，或者干脆放弃。

`docs/prd/route-explain-delivery-gap.md:84` 已明确承诺「R6『查得到』态里的
`first_event_id` 应可点击跳转到该事件详情，这是本切片唯一新增的导航动作」。DTO 早已返回
`firstEventId`（`packages/core/src/route/route.ts:156`），缺的只是渲染。

## 用户故事

作为值班 SRE，我在排查「告警明明命中路由却没有投递」时，希望直接点开被去重规则认作
「首发」的那条事件，立刻确认它当时的投递结果，而不是复制 ID 再搜索。

## 范围

- `event-detail-route-gaps.tsx` 的 `duplicate_within_window` 分支：当 `firstEventId`
  非空时，把 ID 渲染为指向 `/events/$eventId` 的链接；文案结构不变，仅把 `{eventId}`
  包进 `<event>` 富文本标签。
- 中英文文案同步（`zh-Hans.json` / `en-US.json`）。
- 链接使用等宽字体与下划线，和历史 ID 的既有视觉语言一致。
- 补充组件测试：链接目标、中文句子、去重证据已清理时不渲染链接、其他原因不渲染链接、
  英文界面。

## 非目标

- 不改变 `firstEventId` 的可空语义；去重行被清理后仍然显示「原因无法复原」。
- 不新增查询、不改 DTO、不改服务端或仓储。
- 不改变 `routeMatchGaps` 的其他原因分支。
- 不做跨页跳转后的高亮或滚动定位。

## 验收标准

1. `reason = duplicate_within_window` 且 `firstEventId` 非空时，事件详情渲染一个可访问
   链接，目标为 `/events/<firstEventId>`，链接文本就是该 ID。
2. 同一行的说明文字仍完整包含「未创建投递」「首次由事件」「触发」。
3. `firstEventId` 为空时，不渲染链接，并显示既有的「无法复原」文案。
4. 其他原因（如 `destination_disabled`）不渲染任何链接。
5. 英文界面下句子与链接同时本地化。
6. `vp check`、`vp run -r test`、`vp run -r build` 通过。

## 架构边界

纯前端切片：只改 `features/events/ui` 的展示组件与 i18n 消息，不触碰 oRPC、service、
repository 或 SQLite。路由目标复用 TanStack Router 的类型化 `Link`，参数来自既有 DTO。
