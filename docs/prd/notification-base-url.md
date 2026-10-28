# 通知直链基址可见性

- 状态：已实现
- 日期：2026-10-28
- 关联：`docs/prd/settings-runtime-projection.md`、`docs/planning/iteration-backlog.md` 的 REQ-313

## 问题

通知模板可以引用 `tocsin.eventUrl`，它由 `SERVER_URL`（缺失时回落到 `BETTER_AUTH_URL`）拼出事件的绝对地址
（`apps/console/src/server/runtime/container.ts:216`、`apps/console/src/lib/event-url.ts:11-13`）。
两个变量都未设置时该变量渲染为空（`packages/destinations/src/template.ts:403`），
而 Compose 默认把它们设成 `http://localhost:3000`（`docker-compose.yml:16,24`）——收件人点开就是死链。

问题不在拼接逻辑，而在于**当前进程实际使用的基址对运维不可见**：Settings 的运行时投影只列出 12 个字段，
不含它（`packages/api/src/schemas/settings.ts:28-43`），模板变量面板却把它列为常用变量
（`apps/console/src/features/destinations/ui/template-variable-panel.tsx:14-21`）。
运维只能在收到「链接打不开」的反馈后，才回头翻环境变量。

## 用户故事

作为自托管 Tocsin 的值班运维，我希望在 Settings 页直接看到通知直链使用的基址，
并在它为空或指向本机时看到明确提示，以便在首次部署或域名变更后立刻发现死链风险。

## 范围

- `RuntimeInformationOutputSchema` 增加 `publicBaseUrl: string | null`（纯加法字段）。
- `RuntimeInformationService` 通过新的 `links.publicBaseUrl` 依赖逐字段投影，容器层注入
  `env.SERVER_URL ?? env.BETTER_AUTH_URL ?? null`。
- Settings「运行时与生效参数」面板新增事实行「通知直链基址」：未配置时显示「未配置」。
- 面板在两种失效状态下内联提示：
  - 缺失：说明 `tocsin.eventUrl` 会渲染为空；
  - 本机地址（`localhost`、`*.localhost`、`127.0.0.0/8`、`::1`、`::`、`0.0.0.0`）：说明只有控制台所在主机可打开。
- 中英文 i18n 同步新增 key。

## 非目标

- 不新增 `TOCSIN_PUBLIC_URL` 之类的新环境变量，也不改变 `SERVER_URL` / `BETTER_AUTH_URL` 的优先级。
- 不主动探测基址可达性，不阻止回环配置（本地开发合法）。
- 不修改 `tocsin.eventUrl` 的渲染语义或投递内容。
- 无数据库迁移、无新依赖、无新可部署服务。

## 验收标准

- 已登录 dashboard 的 `settings.getRuntime` 返回 `publicBaseUrl`：配置了 `SERVER_URL` 时为其值，
  否则为 `BETTER_AUTH_URL`，两者都缺失时为 `null`。
- 字段仍是白名单投影：上游对象新增字段不会透出（服务测试断言完整 key 集合）。
- 面板在 `publicBaseUrl === null` 时显示「未配置」与缺失提示；在本机地址时显示地址与本机提示；
  公网地址时只显示事实行、不显示提示。
- 中文文案不出现句号结尾的说明句，英文与中文 key 一一对应。
- 公开文档 `apps/docs/operations/configuration.md` 不再声称运行时面板「不显示认证 URL」。

## 架构边界

- 契约：`packages/api/src/schemas/settings.ts`。
- 服务与类型：`apps/console/src/server/runtime/runtime-information.service.ts` 与同名 `.service.types.ts`；
  服务只接收已解析的值，不读环境变量。
- 装配：`apps/console/src/server/runtime/container.ts` 的 `createRuntimeInformationService()`。
- 前端：`features/configuration/model/public-base-url.ts`（状态分类，纯函数）、
  `features/configuration/ui/settings-public-base-url-notice.tsx`、`settings-runtime-panel.tsx`。
- 入口与 oRPC 契约不变；无 schema 迁移。

## 可逆性

删除字段、提示组件与 i18n key 即可回滚；旧的投影字段与查询形状不受影响，`publicBaseUrl` 为加法字段。
