# 投递重试确认框披露「静默规则会再次压住这次重试」

## 问题

重试确认框只回答「重试成功后可能拨打几个加急电话」。但重试只是把任务重新入队，
真正决定结果的判定发生在 worker 领取时：`claimNext` 会重新读取当时生效的静默规则，
命中的投递直接被改写成 `suppressed` 终态——不产生发送尝试、不发送、也不外呼
（`infra/sqlite/repositories/delivery/delivery.repository.ts:265-307`）。

后果：维护窗口里点「立即重试」，界面上一片平静（或提示「可能拨打 2 个加急电话」），
操作者以为已经补发；实际投递被静默规则吃掉，既没有送达也没有电话，且不会有任何
新的失败提示。这是重试路径上唯一没有披露的终态差异。

同一处还有第二个问题：预览成功后如果没有加急电话，界面渲染**什么都不显示**
（`features/deliveries/ui/delivery-retry-confirm.tsx`），与「还没检查完」视觉完全一致。
这条确认框正位于不可撤销外呼之前，空槽位会被读成「没人会被呼叫」。

## 用户故事

作为值班 SRE，我在维护窗口里重试一条失败投递时，希望确认框直接告诉我：这次重试会被
哪条静默规则、在什么时间点之前压住，因此不会真正送达；如果没有静默规则，也请明确
告诉我「这次重试不会触发加急电话」，而不是留一片空白。

## 范围

- `@tocsin/core` 的 `DeliveryRetryPreview` 增加只读 `suppression`：
  `status` 为 `matched` / `none` / `unavailable`，命中时给出 `suppressionId`、
  `suppressionName`、`suppressionKind`、`endsAt`。
- `OperationsService.previewDeliveryRetry` 复用真实链路的
  `selectSuppressionForDelivery` 与 `suppressionIsActive`（`packages/core/src/suppression/suppression.ts:278-297`），
  以服务端时钟求值，不复制匹配逻辑。命中时把 `urgentPaging` 置空：静默在发送之前生效，
  此时再预告电话即是反向误导。
- 确认框把「风险」收进一个固定槽位，四种状态都渲染：加载中 / 读取失败 /
  被静默规则压住 / 无加急电话；该槽位是 live region，状态切换会被读屏播报一次。
- 静默命中时展示规则名、规则类型与窗口结束时间，并说明「窗口在此之前结束则仍会正常送达」。

## 非目标

- 不改变重试、退避、静默、加急外呼的既有语义，不改 `claimNext` 的判定顺序。
- 不做投递去重窗口预判，不在预览里存快照。
- 不展示逐条匹配 `checks`（详情页已有「抑制判定回放」，确认框不重复铺开）。
- 无 schema、无迁移。

## 验收标准

1. 存在生效的静默规则且命中该投递时，预览返回 `suppression.status = "matched"`，
   携带规则 id / name / kind / endsAt，且 `urgentPaging.receiverCount = 0`。
2. 无生效规则或规则不命中时返回 `status = "none"`，`urgentPaging` 与既有行为一致。
3. 投递对应事件记录缺失时返回 `status = "unavailable"`，不谎称「没有规则」。
4. 确认框在四种状态下都有可见文案，且不出现「空槽位」；`receiverCount = 0` 时显示
   「这次重试不会触发加急电话」。
5. 静默命中时不再显示电话人数，改为显示规则名与窗口结束时间。
6. 服务层与组件层测试覆盖 matched / none / unavailable 与零电话分支。

## 架构边界

- 契约与 DTO 在 `packages/core/src/operations.ts` 与 `packages/api/src/schemas/operations.ts`。
- 判定逻辑留在 `@tocsin/core`，服务只做编排（entrypoint → service → store）。
- UI 属于 `features/deliveries/ui/`，不改 oRPC 路由形状；新增文案中英双份。
- 预览仍是只读、可失败、不阻塞重试的投影。
