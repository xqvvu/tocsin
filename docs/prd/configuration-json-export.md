# 设置页 JSON 配置导入导出

## 状态

已实现，2026-07-10。

## 背景

Tocsin 已通过 Settings 提供 TOML 配置导入导出。运维人员在备份、代码审阅和接入其他工具时，
还需要结构化 JSON 配置编辑与迁移能力，但不希望出现第二套配置投影或 secret 处理规则。

## 产品行为

- Settings 在 `UI`、`TOML` 之外增加 `JSON` 标签页。
- 进入 JSON 标签页时按需读取当前配置，刷新配置后重新生成快照。
- JSON 与 TOML 基于同一份可移植配置快照，覆盖 Settings、Sources、Destinations 和 Routes。
- JSON 保留 TOML 外部文档的字段名，例如 `schema_version`、`secret_refs` 和
  `destination_ids`，便于逐字段比对两种格式。
- JSON 使用与 TOML 对齐的 CodeMirror 编辑器、折叠 gutter、主题、尺寸和确认导入流程。
- 用户可以编辑并导入 JSON，也可以下载 UTF-8 编码的 `tocsin.json` 文件。
- TOML 仍是 Tocsin 首选的 config-as-code 格式；JSON 是使用相同 schema 的替代可移植格式。

## 安全边界

- JSON 与 TOML 默认导出都不包含明文 secret、Source token 或 token hash。
- 已配置的 Source/Destination secret 使用相同的环境变量引用表示。
- JSON 导入与 TOML 导入使用同一事务应用配置，并从 env 解析 secret refs。
- JSON 导出必须通过 dashboard oRPC procedure 鉴权，浏览器不能直接访问 repository、SQLite
  或 runtime config。

## 验收标准

- JSON 导出能被标准 JSON parser 读取，并以换行结尾。
- JSON 与 TOML 导出包含相同的配置实体和 schema version。
- JSON 导出不包含 Source token、token hash、Destination webhook URL、签名密钥或其他明文
  sensitive config。
- JSON 导出再导入后，Settings、Sources、Destinations 和 Routes 保持结构一致。
- Settings 的 JSON 标签页可以自动加载、编辑、确认导入、刷新和下载配置。
