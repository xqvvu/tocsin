# 事件详情：Grafana 面板与上游静默页深链

- 状态：已实现（REQ-372）
- 范围：`apps/console` 事件详情页 + `packages/providers` 解析器
- 关联：`docs/prd/event-upstream-source.md`（上游告警回链，REQ-86）、
  `docs/prd/post-mvp-planning.md` 方向 4「搜索、过滤与历史排障」

## 问题

事件详情「标准化字段」已经有「上游告警」区块，把 `providerMetadata` 里的
`externalURL` / `generatorURL` 渲染成外链。但 Grafana 统一告警的 Webhook 载荷在每条
alert 上还带有三个更有用的地址，解析器目前全部丢弃：

- `dashboardURL`：告警所在仪表盘；
- `panelURL`：告警所在面板（带 `viewPanel`，直接定位到出问题的图）；
- `silenceURL`：Grafana 预填好的「新建静默」表单。

Alertmanager 兼容载荷（Alertmanager、SigNoz）的首条 alert 也可能带 `silenceURL`，
共享解析器同样没有写出。结果是值班工程师从 Tocsin 看到告警后，仍要回 Grafana 手工
搜索仪表盘、重新定位面板，或自己拼静默条件。

代码证据：

- `packages/providers/src/grafana/parse.ts:59-71` 只写 `externalURL`；
- `packages/providers/src/shared/alertmanager-compatible.ts:59-76` 写 `externalURL` 与
  `generatorURL`，未写 `silenceURL`；
- `apps/console/src/features/events/model/event-upstream-source.ts:11,16-25` 的
  `LINK_KEYS` 只有两个键，已有的协议白名单与 userinfo 剥离逻辑可直接复用。

## 用户故事

作为值班工程师，我在 Tocsin 事件详情里核对一条 Grafana 告警时，希望能直接打开对应
仪表盘、面板和预填的静默表单，这样不必离开 Tocsin 重新搜索图表或手工拼静默条件。

## 范围

1. Grafana 解析器从首条 alert 写出 `dashboardURL`、`panelURL`、`silenceURL`
   （同时接受 snake_case 别名），仅在值为非空字符串时写入。
2. Alertmanager 兼容解析器从首条 alert 写出 `silenceURL`（同上）。
3. 事件详情「上游告警」区块把这三个键加入可点击链接白名单，沿用现有规则：
   - 仅接受 `http:` / `https:`；
   - 剥离 URL 中的用户名与密码；
   - 新标签页打开并带 `rel="noopener noreferrer"`；
   - 链接显示产品文案与目标 host。
4. 中英文案：仪表盘 / 面板 / 上游静默页（Dashboard / Panel / Silence page）。
5. 补充解析器测试、投影模型测试与组件测试。

## 非目标

- 不解析任意 URL 字段（例如 `imageURL`），不猜测上游链接。
- 不处理相对 URL 或模板变量；只接受绝对 `http(s)` URL。
- 不由 Tocsin 代理或抓取上游页面内容。
- 不新增服务端字段、oRPC 过程或数据库迁移：`providerMetadata` 已在 Event DTO 中。
- 不改变事件列表、路由、投递或静默语义。

## 验收标准

- [x] Grafana 载荷写入 `dashboardURL` / `panelURL` / `silenceURL`，snake_case 别名同样识别。
- [x] Alertmanager 兼容载荷写入首条 alert 的 `silenceURL`。
- [x] 三个新键在事件详情渲染为外链，带真实 host 与产品文案。
- [x] `javascript:` / `data:` 等非 http(s) 值不渲染为链接，但仍作为普通元数据可见。
- [x] 带凭据的 URL 在 DOM 中不含用户名/密码。
- [x] 单元测试覆盖解析器写入、链接顺序、协议白名单与中英文案。

## 架构边界

- 解析器只做加法：新增可选 `providerMetadata` 标量字段，不改变标准化字段、
  fingerprint、幂等键或解析失败语义。
- 展示层继续由 `features/events/model/event-upstream-source.ts` 统一投影与净化 URL，
  `features/events/ui/event-upstream-source.tsx` 只负责渲染。
- `providerMetadata` 是 provider 作者可控数据，URL 协议白名单仍是安全边界。
- 不触碰 `server/**`、schema、迁移、auth 或投递语义。
