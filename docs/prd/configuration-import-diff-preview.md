# 可移植配置导入：应用前差异预览

## 问题

设置页「可移植配置」的确认弹层承诺「替换当前配置」
（`apps/console/src/i18n/messages/zh-Hans.json:118,120`，英文同键），但服务端导入
（`apps/console/src/server/configuration/config-portability.service.ts:127-217`）实际只按 id
upsert：文件里出现的告警源、通知目标、路由、飞书应用会被新增或覆盖，文件里没出现的现有条目
则原样保留，从不删除。文案与行为相反，运维在两种情况会踩坑：

- 以为导入会清空旧配置而不敢导入，或在另一个环境复制配置时误以为「先清库」。
- 粘贴了一份不完整的配置就点「确认导入」，事后才发现旧条目既没被删、也没被更新，实际状态
  与预期不一致。

导入结果只回显新生成的告警源 Token（`apps/console/src/features/configuration/ui/import-notice-panel.tsx:10-30`），
应用前没有任何变更摘要；而当前配置本身已经加载在编辑器里（
`use-settings-workspace.ts:72-97`），足以在浏览器侧算出差异。

## 用户故事

作为值班工程师，我在应用一份导出的配置前，希望确认框直接告诉我：会新增哪些告警源/目标/路由、
会更新哪些、哪些现有条目因为没出现在文件里而保持原样；如果编辑器内容根本解析不了，希望在
点击确认前就被拦住，而不是等服务端报错。

## 范围

纯前端一个切片：

- 新增环境中立的纯函数 `apps/console/src/features/configuration/model/portable-config-diff.ts`：
  用已有的 `smol-toml` 与 `@tocsin/core` 的 `tomlDocumentToConfiguration` 解析编辑器内容，
  与「上次导出的当前配置」按 id 比对，得到四类结果：新增 / 更新 / 未变化 / 未列出（保持不变），
  并单独标记基础设置（语言、时区、原始载荷保留天数）是否变化。对象键顺序不影响判定。
- `use-settings-workspace.ts` 为每个格式额外保存 `baseline`（上次导出的当前配置），
  载入文件或手动编辑只改编辑器内容，不覆盖 baseline。
- `portable-config-form.tsx` 的确认弹层打开时展示差异摘要
  （`portable-config-diff-summary.tsx`）：新增/更新条目列出名称（最多 4 个，其余折叠计数），
  未列出条目按数量提示「保持不变」；合计无变化时显示「导入内容与当前配置一致」。
- 编辑器内容解析失败时，弹层内给出紧凑错误（路径 + 首条校验消息）并禁用「确认导入」。
- 同步修正中英文案：确认描述改为「更新文件中列出的配置，未列出的现有配置保持不变」。

## 非目标

- 不改服务端导入语义（仍然 upsert，不删除文件未列出的条目），不新增 oRPC 过程或 DTO。
- 不做逐字段 diff、颜色高亮或并排文本比较。
- 不自动清空或重置编辑器；导入成功后 baseline 清空，预览自然消失。
- 不覆盖导入结果面板与一次性 Token 提示条的现有行为。

## 验收标准

1. `previewPortableConfigChange` 的单元测试覆盖：新增/更新/未变化/未列出分类、设置变更、
   JSON 键顺序不误判、无 baseline 时返回 `no-baseline`、解析失败返回 `unparsable` 且不抛错。
2. 组件测试断言：确认弹层展示新增/更新摘要与「未列出…保持不变」提示；编辑器内容不可解析时
   出现 `alert` 且确认按钮禁用；无 baseline 时仍可导入。
3. 中英文案键保持一一对应（`messages.test.ts` 通过），中文文案不含「替换当前配置」。
4. `vp check`、`vp run -r test`、`vp run -r build` 全绿。

## 架构边界

- 纯函数落在 `features/configuration/model/`，只依赖 `smol-toml`（已在 `apps/console` 依赖中）
  与 `@tocsin/core` 的环境中立导出，不引入新依赖、不触碰 `node:*`。
- UI 落在 `features/configuration/ui/`；不新增服务端端点，不改 SQLite schema、auth、
  路由/投递语义或 secret 处理。
- 变更摘要只展示条目名称与数量，不回显 `config`、`secretRefs` 或任何密钥值。
