# 告警消息里的事件直链（`tocsin.eventUrl`）

## 问题

模板变量面板一直列出 `tocsin.eventUrl`，但生产路径上它恒为空字符串：

- 模板引擎只在调用方显式传入 `eventUrl` 时才渲染它
  （`packages/destinations/src/template.ts:200,373,400`）。
- 真正发消息的两条路径都没有传：投递执行器与目标服务在组装发送输入时只带
  `eventId`（`apps/console/src/server/deliveries/delivery-execution.ts`、
  `apps/console/src/server/destinations/destination.service.ts`）。
- 部署也没有一个「对外访问地址」被用于这个用途；`SERVER_URL` 已经存在
  （`apps/console/src/env.ts:33`），但只作为 Better Auth base URL 的回落值。

结果是：值班同事在飞书/邮件/Webhook 里收到告警，无法一键跳回 Tocsin 的事件详情，
只能手抄 fingerprint 或事件 id 再去控制台里搜。对排障链路来说这是实打实的摩擦。

## 用户故事

- 作为值班工程师，我在飞书群里看到告警卡片，希望点一下就能打开 Tocsin 里这条事件的
  详情页，直接看到同一指纹的历史、投递结果和静默状态。
- 作为配置通知目标的 SRE，我希望模板里写 `{{tocsin.eventUrl}}` 就能拿到这条事件的绝对
  地址，而不是自己拼主机名。
- 作为自托管部署者，我只需要设置一个已有的 `SERVER_URL`，不需要再学一个新的环境变量。

## 范围

1. `DestinationRenderInput` 增加可选 `eventUrl`；模板上下文优先使用显式传入的
   `options.eventUrl`，其次使用发送输入里的 `eventUrl`，都没有时保持空字符串。
2. 新增纯函数 `eventDetailUrl(baseUrl, eventId)`：去掉 base URL 末尾斜杠，拼
   `/events/<encodeURIComponent(eventId)>`；base URL 缺失或为空白时返回 `undefined`。
3. 用**既有**公开地址配置，不新增环境变量：优先 `SERVER_URL`，缺失时回落到
   `BETTER_AUTH_URL`（生产部署本就要求两者之一，且都指向同一个控制台）。
   - 投递执行器（`DeliveryExecution`）在发送输入里带上事件直链；
   - 目标服务在预览（`previewDestination*`）与测试发送（`testDestination`）里带上；
   - 容器解析该地址并注入这两处（`server/runtime/container.ts`）。
4. 只有**真实入库的事件**才生成直链：内置预览样例与没有样例的测试发送使用合成 id
   （`preview-event`、`test-<时间戳>`），生成链接只会 404，因此这两种情况保持空串。
5. 两个地址都未配置时行为与今天完全一致：变量渲染为空串，消息内容不变。
6. 文档：README 与部署文档补充公开地址也用于生成事件直链。

## 非目标

- 不新增 `TOCSIN_PUBLIC_URL`。`SERVER_URL` / `BETTER_AUTH_URL` 已经是「对外访问 URL」的既有
  配置，再引入一个重叠变量会让部署者困惑。
- 不改 webhook 接收地址的复制逻辑（浏览器 origin 的取舍见 backlog NEW-2，另有候选）。
- 不改内置飞书卡片模板，不给它们默认塞链接；由运营在模板里自行引用变量。
- 不做短链、签名 URL 或对外鉴权。事件详情仍需登录控制台；链接只负责定位。
- 不改投递/路由/加急的任何语义。

## 验收标准

- `DestinationTemplateEngine.createRenderContext` 在发送输入带 `eventUrl` 时渲染出该值；
  两个来源都没有时渲染空串。
- `eventDetailUrl`：处理末尾斜杠、子路径、需要编码的事件 id，以及缺失/空白 base URL。
- `DeliveryExecution` 在配置 `publicBaseUrl` 时把
  `<base>/events/<eventId>` 放进适配器输入；未配置时不设置该字段。
- 目标预览的模板上下文包含同一规则生成的 `tocsin.eventUrl`（集成测试覆盖），而内置样例预览
  仍为空串。
- `vp check`、`vp run -r test`、`vp run -r build` 全绿。
- 未配置任何公开地址的既有部署升级后消息内容不变。

## 架构边界

- `packages/destinations` 只接受一个可选的字符串字段，不读环境变量、不感知部署地址。
- `SERVER_URL` 仍只在 `apps/console/src/env.ts` 解析，由应用容器显式注入服务；
  服务不直接 `process.env`。
- 链接拼接是纯函数（`apps/console/src/lib/event-url.ts`），可被客户端将来复用，
  不含 server-only 导入。
- 无数据库迁移、无新依赖、无新可部署服务。
