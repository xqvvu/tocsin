# 解析失败事件的兜底标题与消息按界面语言展示

UI-80（第 128 轮 UI 评审浏览器实测发现，第 129 轮实现）

## 问题

接入阶段被 provider 解析器拒绝的载荷，会以一条审计事件入库：`title` 固定写成
`Provider parser rejected webhook payload`，`message` 固定写成
`Webhook payload was stored for inspection but could not be normalized`
（`apps/console/src/server/intake/intake.service.ts:206-207`）。

这两段英文是在**接入时**写入数据库的，那时还不知道谁会以什么语言打开控制台。于是中文界面里
出现了半中半英的一行：列表徽标是「解析失败」，同一行的标题却是英文
（`apps/console/src/features/events/ui/event-title-cell.tsx:38-40`）；详情页 H2 与正文同样
是英文，紧挨着下面的中文「告警解析失败」提示
（`apps/console/src/features/events/ui/event-detail-summary.tsx:56-64`）。

对值班人员来说，最需要一眼看懂的那一行恰恰是英文，而徽标和提示又在用中文重复同一件事。

## 用户故事

作为中文界面的值班工程师，我打开事件列表时，希望解析失败的那一行用中文告诉我
「这条是上游载荷没能解析」，而不是让我在一行中文界面里读英文；我希望点进详情后，
标题与摘要同样是中文。同时我仍然能在「规范化」「原始调试」标签页看到 Tocsin 实际入库的
原始字段。

## 范围

- 新增 i18n 文案 `events.parseFailure.fallbackTitle` 与
  `events.parseFailure.fallbackMessage`（zh-Hans / en-US 各一份）。
- 事件列表标题单元格：`parseFailed` 为真时用本地化标题替换库里的英文兜底标题。
- 事件详情摘要：`providerMetadata` 能解析出解析失败元数据时，H2 与正文改用本地化标题/消息。
- 「按标题/消息静默」动作继续以**入库原值**为匹配值，并加注释说明原因。
- 补组件测试：中文、英文、以及解析成功的普通事件不被替换。

## 非目标

- 不改入库内容与 schema：审计行保留原始英文标题/消息，「规范化」「原始调试」标签页照旧展示。
- 不改「规范化」标签页与同指纹历史列表的字段展示（那是数据视图，不是标题位）。
- 不改投递/通知模板里的 `{{event.title}}`：出站内容属于投递语义，本轮不动。
- 不改解析器、路由匹配、`parseFailed` 标记的提取逻辑。

## 验收标准

1. 中文界面下，解析失败事件在列表与详情中的标题显示「未能解析的上游载荷」，正文显示
   「原始载荷已保留，可在「原始调试」中核对」，不再出现英文兜底文案。
2. 英文界面显示 `Upstream payload could not be parsed` 与对应英文说明。
3. 解析成功的事件标题与消息完全不变。
4. 详情页仍展示「告警解析失败」提示与失败原因/错误类型/载荷哈希。
5. `vp check`、`vp run -r test`、`vp run -r build` 全绿。

## 架构边界

- 只改 `features/events/ui/` 的两个展示组件与 i18n 消息文件，展示层本地化，无服务端改动。
- 复用 `@tocsin/core` 既有的 `parseFailureMetadataFrom` 判定，不新增共享契约。
- 无 schema、无迁移、无依赖变更、无投递/路由/auth 语义变化，可整文件回滚。
