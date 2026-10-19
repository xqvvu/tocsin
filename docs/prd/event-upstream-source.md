# 事件详情：上游告警回链与接入元数据

- 状态：已实现（REQ-86）
- 范围：`apps/console` 事件详情页
- 关联：`docs/prd/post-mvp-planning.md` 方向 4「搜索、过滤与历史排障」

## 问题

Tocsin 把告警标准化后只保留标题、严重程度、标签等字段。值班工程师打开事件详情时，
能看到「Tocsin 认为这条告警是什么」，却看不到「它从哪个上游告警页面来的」。

- Alertmanager / Grafana 的 payload 已经带有 `externalURL`（Alertmanager / Grafana
  实例地址）与 `generatorURL`（触发告警的规则页面），解析器也把它们写进了
  `providerMetadata`；但事件详情页从未渲染这个字段。
- 同一条告警在 Tocsin 里信息不足时（例如需要看原始图表、确认规则表达式、核对分组），
  工程师只能回到上游系统手工搜索标题或 fingerprint。
- `providerMetadata` 里的 `provider`、`receiver`、`groupKey`、`alertCount` 等接入事实
  同样不可见，排障时无法确认「Tocsin 是经哪个 receiver、哪个分组收到的」。

## 用户故事

作为值班工程师，我在 Tocsin 事件详情里追查一条告警时，希望能直接点开上游告警页面，
并看到接入时记录的 provider / receiver / 分组等元数据，这样不必离开 Tocsin 去上游
系统重新搜索。

## 范围

1. 在事件详情「标准化」标签页的左侧字段区底部新增「上游告警」区块。
2. 将 `providerMetadata.externalURL`、`providerMetadata.generatorURL` 渲染为外链：
   - 仅接受 `http:` / `https:`；
   - 剥离 URL 中的用户名与密码；
   - 新标签页打开并带 `rel="noopener noreferrer"`；
   - 链接显示产品文案与目标 host。
3. 其余标量元数据按稳定顺序展示：已知键使用产品文案，未知键显示原始键名。
   非标量值不在此渲染（Raw 标签页仍有完整数据）。
4. 没有任何可展示元数据时不渲染该区块。

## 非目标

- 不新增服务端字段、oRPC 过程或数据库迁移；`providerMetadata` 已在 `EventRecord` DTO 中。
- 不解析或改写 provider payload，不猜测上游链接。
- 不把对象/数组元数据展开成可交互 UI。
- 不改变事件列表、投递或路由语义。

## 验收标准

- [x] Alertmanager 风格元数据同时显示 `externalURL` 与 `generatorURL` 两个链接。
- [x] `javascript:` / `data:` URL 不渲染为链接，但作为普通元数据仍可见。
- [x] 带凭据的 URL 在 DOM 中不含用户名/密码。
- [x] `provider`、`parserVersion`、`alertCount`、`receiver`、`groupKey`、`payloadHash`
      使用中文/英文产品文案；未知键回退为原始键名。
- [x] `providerMetadata` 为空或只含非标量值时区块不渲染。
- [x] 单元测试覆盖 URL 白名单、凭据剥离、排序与空态。

## 架构边界

- 纯前端只读切片：`features/events/model/event-upstream-source.ts` 负责投影与 URL
  净化，`features/events/ui/event-upstream-source.tsx` 负责渲染。
- 模型层不依赖 React，可直接单元测试；不触碰 `server/**`、schema、迁移、auth 或
  投递语义。
- `providerMetadata` 是 provider 作者可控数据，URL 协议白名单是这里的安全边界。
