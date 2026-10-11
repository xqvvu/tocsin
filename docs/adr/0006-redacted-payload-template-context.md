# Destination 模板允许读取脱敏 Payload 标量路径

状态：接受。

## 背景

不同 Provider 的 Webhook payload 结构差异很大。Normalized Event 适合承载 title、message、severity、
status、fingerprint、labels 和 occurredAt 等稳定语义，但无法穷举 Uptime Kuma 的响应耗时、监控树路径，
或其他 Provider 的任意扩展字段。要求每个 Provider adapter 把所有可能用于通知展示的字段提升为 label，
会让规范化模型不断膨胀，也会把展示需求反向耦合到接入解析器。

此前模板只允许读取 normalized Event，并把 raw payload 限制为预览参考。这个边界足够保守，但导致用户
看得到已脱敏 payload，却无法在自定义飞书卡片或文本通知中引用其中的安全字段。

## 决定

Destination render input 增加可选的 provider payload。模板上下文把它作为 `payload` 暴露，并支持确定性
标量路径插值：

```text
{{payload.monitor.name}}
{{payload.heartbeat.ping}}
{{payload.items[0].value}}
{{payload.commonLabels["threshold.name"]}}
```

规则如下：

1. Payload 在 Webhook 入库前执行递归脱敏，进入模板上下文时再次执行同一脱敏函数。
2. 普通字段使用由字母、数字、下划线和连字符组成的点分路径；数组支持数字下标；包含点号等特殊字符的
   key 使用 JSON 双引号 bracket 语法，例如 `payload.commonLabels["threshold.name"]`。
3. 字符串、数字和布尔值转换为文本；对象、数组、null、缺失路径和非法数组下标渲染为空字符串。
4. 模板继续禁止表达式、函数、条件、循环、动态代码和整段对象序列化。
5. Raw headers 不加入 Destination render input。Source token、认证 Header、Destination config、签名密钥、
   路由内部信息和 Delivery 尝试状态均不可访问。
6. Preview 与真实 Delivery 使用同一个 render context 和脱敏规则。历史 Event preview 同时展示脱敏 payload
   参考，便于用户找到可引用路径。
7. `event.*` 与 `event.labels.*` 仍是稳定语义面；`payload.*` 明确属于 provider-specific 接口，上游升级
   改变 payload 结构时，用户自定义模板可能需要同步调整。
8. Raw payload retention 清理后，相关 `payload.*` 路径按缺失值处理并渲染为空字符串。

## 结果

- 用户可以为不同告警源制作信息完整的飞书卡片和文本通知，不需要等待 Tocsin 为每个字段增加 label。
- Provider adapter 只提升路由和通用展示真正需要的稳定字段，避免 normalized labels 变成 payload 镜像。
- Payload 的结构不稳定性由模板作者显式承担，Preview 提供真实历史样本用于验证。
- 脱敏 Header 与未脱敏 payload 仍不可达；模板能力没有扩张为脚本或通用表达式语言。

## 不采用的方案

### 把所有 Provider 字段提升为 Labels

它会污染稳定领域模型，并要求 adapter 持续追随上游所有字段。Labels 应服务路由和常用规范化语义，
而不是复制原始 payload。

### 允许模板直接读取 Raw Headers

Headers 经常包含 Authorization、Cookie、Source token、代理地址和基础设施信息。即使进行脱敏，也没有
足够的通知展示价值来证明扩大攻击面是合理的。

### 允许对象或数组整体插值

整体 JSON 序列化容易生成超大通知、绕过字段级审阅，并受到目标平台长度限制。首版只支持标量叶子；
未来如需安全的 JSON 格式化，应另行设计大小限制和诊断行为。

## 相关文档

- `docs/prd/destination-template-engine.md`
- `docs/architecture/adapter-extensibility.md`
- `docs/adr/0005-destination-template-dynamic-bindings.md`
