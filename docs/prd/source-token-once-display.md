# 接入 Token 的一次性可见与复制降级

- 状态：已实现（第 80 轮）
- 关联 backlog：UI-36、Q-38
- 决策记录：EXPERT_PANEL 三位专家一致同意（安全、产品、评估），见
  `docs/planning/iteration-log.md` 第 80 轮

## 问题

创建或轮换告警源成功后，服务端只返回一次明文接入 Token，数据库只保存哈希
（`apps/console/src/server/sources/source.service.ts:40-49,68-73`）。控制台把 Token 存进
页面 state（`apps/console/src/features/sources/ui/sources-page.tsx:29,92-94`），但成功面板
从不渲染 Token 值，只提供「复制 Token」按钮
（`apps/console/src/features/sources/ui/source-token-notice-panel.tsx:43-72`）。

在自托管常见的 `http://<LAN-IP>:<port>` 非安全上下文中，浏览器不提供
`navigator.clipboard`，`copyText` 直接返回 `false`
（`apps/console/src/lib/browser.ts:9-16`），所有调用方都忽略返回值，面板的失败分支甚至用
`toast.success` 提示「复制失败」（`source-token-notice-panel.tsx:45-56,65-72`）。结果是：
操作员看到「已复制」，实际什么都没复制，Token 永久丢失，只能再轮换一次。

## 用户故事

作为自托管部署的值班 SRE，我通过 `http://<LAN-IP>` 打开控制台创建告警源。我需要：
1. 在成功面板里直接看到接入 Token，并能手动选中复制；
2. 如果浏览器不允许自动复制，明确看到失败提示，而不是假的「已复制」；
3. 关闭面板前有明确提示，知道关闭后无法再次查看。

## 范围

- 成功面板渲染一次性 Token：只读、等宽、可全选、不截断，并标注「仅在此处显示」。
- 面板增加「我已保存」显式关闭动作，与右上角关闭按钮并存；不自动关闭、不因点击外部关闭。
- `copyText` 增加降级链路：优先 Clipboard API；不可用或被拒绝时退回隐藏 textarea +
  `document.execCommand("copy")`；两条路径都失败时抛 `Error`，让所有调用方的 `catch`
  显示真实失败提示。
- 面板两个复制动作的失败分支从 `toast.success` 改为 `toast.error`，并给出可操作描述
  「请手动选中内容后复制」。
- 中英文文案同步；修正英文 `createdDescription` 的逗号拼接错误。
- AGENTS.md 的安全边界补一条明确例外：创建/轮换响应的一次性 Token 可以在临时组件
  state 中展示到操作员关闭为止，但不得持久化、写日志、进入 query cache、路由数据、URL
  或浏览器存储。
- 测试：`copyText` 三条路径（Clipboard API、execCommand 降级、全失败）；面板 Token 可见、
  成功/失败提示、两种关闭动作。
- E2E 规范同步：创建成功后断言 Token 在面板中可见。

## 非目标

- 不新增「再次查看 Token」端点，不保存明文或可逆密文；落库仍只有哈希。
- 不把 Token 写进列表/详情 DTO、query cache、路由 loader、URL、localStorage、日志或 toast。
- 不提供二维码、仅下载文件或短时重开展示。
- 不改变 Token 的生成、哈希、轮换或鉴权语义。
- 不扩大到 Destination 签名密钥、SMTP 密码等其它 secret。
- 不引入导航离开保护（REQ-143 单独处理）。

## 验收标准

1. 创建或轮换成功后，面板 DOM 中出现完整 Token，等宽、可选中，且不是密码输入框。
2. `navigator.clipboard` 缺失时，复制走 textarea + `execCommand` 降级；降级成功后提示
   「已复制」，且 DOM 中不残留 textarea。
3. Clipboard API 与降级都失败时，`copyText` 抛错，面板显示「复制失败 / 请手动选中内容后复制」，
   不出现成功提示。
4. 点击「我已保存」或关闭按钮都会调用 `onDismiss`；Token 随面板卸载从 DOM 消失。
5. 中英文案键保持 parity、扁平、无句末句号；`messages.test.ts` 通过。
6. E2E 规范在复制 Token 后断言面板中可见同一字符串。
7. `vp check`、`vp run -r test`、`vp run -r build` 通过。

## 架构边界

- 纯前端 + i18n + 文档；无迁移、无新端点、无新依赖、无服务端语义变化。
- Token 仍只来自创建/轮换响应，停留在页面级临时 state；本改动只改变渲染，不新增传输或
  持久化路径。
- 生产构建仍由 TanStack Start import protection 约束；`copyText` 的 DOM 访问保持在函数体内，
  不影响服务端渲染。
