# Destination 模板采用受控动态绑定

状态：接受。

## 背景

Feishu 默认卡片把 `header.template` 固定为 `red`。这适合 `firing` Event，但同一 Destination
收到 `resolved` Event 时仍会发送红色卡片。要求用户为同一个 Source 或 Destination 维护 firing、
resolved 等多份完整模板，会造成结构重复、修改漂移和预览组合膨胀。

现有模板引擎已经把 `event.status` 等安全字段放入 `TemplateContext`，但模板语言只支持安全路径
插值，明确禁止条件、表达式、函数、循环和用户代码。新能力需要让颜色、短文案或图标名称等局部
字符串属性随 Event 变化，同时保持这个安全边界。

模板归 Destination 所有，不归 Source 所有。Source 负责接入和规范化 Event，Route 决定 Event
投递到哪些 Destination，Destination template 决定目标平台的消息表现。

## 决定

在 Destination template config 中增加受控 `bindings`。一个 binding 从一个允许的标量路径读取
值，通过显式 `cases` 映射成字符串；没有匹配项时使用必填的 `fallback`。模板通过
`{{bindings.<name>}}` 在现有字符串插值位置引用解析结果。

```json
{
  "mode": "feishu_card",
  "bindings": {
    "statusColor": {
      "select": "event.status",
      "cases": {
        "firing": "red",
        "resolved": "green",
        "unknown": "grey"
      },
      "fallback": "grey"
    }
  },
  "card": {
    "header": {
      "template": "{{bindings.statusColor}}"
    }
  }
}
```

第一版 binding 规则如下：

1. 每个 binding 只能声明一个 `select`。
2. `select` 只允许 `event.status`、`event.severity`、`source.provider` 和
   `destination.kind`。
3. `cases` 是非空的字符串到字符串映射，`fallback` 是必填字符串。
4. case 和 fallback 输出是字面量，不进行递归模板渲染。
5. binding 只能改变字符串叶子值，不能返回或修改对象、数组、数字、布尔值、null 或模板结构。
6. binding 在普通模板插值前解析，并加入当前模板的允许变量集合。
7. 未知 binding、非法 selector、缺少 fallback、非法名称和 adapter-specific 非法值阻止保存；
   已声明但未使用的 binding 产生 warning。
8. 不允许 `event.labels.*`、多字段 selector、优先级、布尔表达式、嵌套 binding 或条件块。

binding 引擎是 `@tocsin/destinations` 的共享模板基础设施。Adapter 可以对平台属性增加更窄的值
约束，例如 Feishu 颜色控件只接受飞书支持的颜色。第一阶段只有 Feishu `feishu_card` 暴露动态
属性 UI；其他 Destination 不增加 UI 或默认 binding。

新建 Feishu card Destination 显式持久化默认 `statusColor` binding：`firing -> red`、
`resolved -> green`、`unknown -> grey`、`fallback -> grey`。默认卡片的 header 使用
`{{bindings.statusColor}}`。

Feishu 模板编辑器提供紧凑的动态属性区域，包括 selector、case mapping、颜色色板和 fallback，
底层仍保存结构化 JSON。Preview、Destination test 和真实 Delivery 必须复用同一 binding 解析与
模板渲染路径。

## 兼容策略

已有 Feishu card config 不自动改写，避免覆盖用户定制。编辑器识别到已知的硬编码默认颜色路径
时，可以提供“应用动态状态颜色”操作：在本地草稿中加入默认 binding，并替换已知模板引用；用户
Preview 后显式保存才会生效。

“恢复默认模板”是另一个显式操作，必须提示它会覆盖完整 card JSON。运行时不通过旧模板检测、
隐式 fallback 或数据库启动迁移修改已有模板。

## 结果

- 用户只维护一份卡片结构，firing 和 resolved 可以呈现不同颜色。
- 模型可以复用于 severity、provider 或 destination kind 的局部字符串映射。
- 模板语言仍然不是表达式语言或工作流 DSL，保存时可以穷尽验证主要错误。
- 动态结构、组合条件和 label selector 被推迟；如果后续确有需求，需要新的 PRD/ADR，而不是扩张
  `bindings` 的含义。
- 已有 Destination 保持稳定，但需要用户主动应用动态颜色或恢复新默认模板。

## 不采用的方案

### 多份完整模板或 status variants

它会复制完整 card JSON，正是本需求要消除的维护负担；还会引入 variant 选择、结构漂移、批量
预览和兼容问题。

### 通用条件或表达式语言

`if/else`、管道、函数或脚本会扩大安全和调试面，并使 Tocsin 向低代码工作流平台漂移。当前需求
只需要有限的标量映射，不足以证明这类复杂度。

### 硬编码 `event.statusColor`

把 Feishu 的 `red`、`green` 等平台值放入共享 Event 语义会污染 normalized Event，也无法满足
团队自定义颜色规范。颜色映射应留在 Destination template config 和 adapter UI 中。

### 自动迁移已有模板

系统无法可靠区分默认模板与用户有意保留的红色样式。静默重写的破坏风险高于一次显式应用操作
的成本。

## 相关文档

- `docs/prd/destination-template-engine.md`
- `docs/adr/0002-curated-adapter-extension-model.md`
- `docs/architecture/adapter-extensibility.md`
