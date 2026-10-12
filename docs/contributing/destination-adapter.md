# 新增一个 Destination Adapter

本文是 destination adapter 的**操作手册**（how-to），不是决策记录。设计理由见
`docs/adr/0002-curated-adapter-extension-model.md` 与
`docs/architecture/adapter-extensibility.md`；本方向要解决的问题、盘点与验收标准见
`docs/prd/adapter-contribution-experience.md`。

范围：`@tocsin/destinations` 里对外发送通知的 destination adapter。provider 侧共享同一套模式，
但不在本文范围内（同样地，`packages/destinations/src/urgency/` 是第三类 adapter，也不在本文范围内）。

## 0. 先跑 scaffold

```bash
node scripts/new-destination-adapter.mjs mattermost_bot
# 等价写法：
just new-destination mattermost_bot

# 只想先看会生成什么（写到仓库外的目录，不碰工作区）：
node scripts/new-destination-adapter.mjs mattermost_bot --out /tmp/mattermost-bot
```

`<kind>` 必须是下游 `DestinationKindSchema` 接受的小写蛇形命名。scaffold 会生成第 1 节列出的
六个文件，并在终端打印"接下来必须手工处理哪些注册点、漏了会怎样"的清单。它**不会**替你改注册点：
其中几处会编译失败（fail-loud），也有几处今天仍然是静默失败（fail-silent），只能靠人按清单逐个处理。

## 1. 目标形态

一个 adapter 就是一个独立目录，`package` 根只做聚合与显式注册（ADR 0002 明确不做 glob 自动发现）：

```txt
packages/destinations/src/<kind>/
  schema.ts       typed config schema（zod，strict）
  manifest.ts     JSON-safe manifest：字段描述 / secret / lifecycle / iconName / capabilities
  payload.ts      preview 与 rendered payload 的渲染（纯函数，走模板引擎与 presentation）
  adapter.ts      Adapter.define({ manifest, configSchema, preview, send })
  index.ts        barrel export
  index.test.ts   自测：@tocsin/destinations/test-kit 的 fixture + fakeFetch
```

目录内的相对导入、以及对共享模块（`#destinations/template`、`#destinations/utils` 等）的别名导入都
可以；仓库里已有的四个 adapter 用 `#destinations/<kind>/...` 指向自己的模块，两种写法等价。

## 2. 最短路径（6 步，前 5 步不碰 console）

1. `node scripts/new-destination-adapter.mjs <kind>` 生成骨架。
2. 把 kind 加进 `packages/core/src/destination/destination.ts` 的 `DestinationKindSchema`。
   这是当前唯一"必须先改别的包"的步骤：`DestinationKind` 是封闭枚举（ADR 0002），
   manifest 的 `satisfies DestinationManifest<"<kind>">` 与自测里的 `kind` 字段都要等它生效。
   （F1「消除 4 份 kind 并行真相」尚未落地，见第 6 节。）
3. 改 `manifest.ts`：配置字段、secret 字段、lifecycle、`iconName`。
4. 写 `payload.ts` 的渲染与 `adapter.ts` 的 send 信封（照抄骨架即可，差异只在 URL、请求头、
   body 与成功判据）。
5. 跑自测：`vp -C packages/destinations test run src/<kind>`；自测通过后再跑一次
   `vp -C packages/destinations test run src/registry.test.ts`。
6. 在 `packages/destinations/src/registry.ts` 的 `createDefaultDestinationRegistry` 里显式注册，
   然后处理第 6 节里的 console 注册点；最后跑 `vp check` 与 `vp run -r test`。

### 自测长什么样

用 `@tocsin/destinations/test-kit`，不要自己复制 `DestinationSendInput` 字面量或手写 fetch 记录器：

- `destinationSendInput<TConfig>({ destination, config, ...overrides })`：完整输入 fixture，
  `destination.kind` 必须显式给出，避免测试继承一个误导性的样例 kind。
- `fakeFetch(handler)`：记录每次 `{ url, init }`，默认返回 `200 / ok / "ok"`；handler 里
  `throw` 就等于模拟 transport 失败。

### 提交前自检 audit

`DestinationRegistry.audit()`（F3 落地）把跨 adapter 的软规则变成可执行的检查：kind 枚举与 registry
一致、`sensitive` 字段与 `secretFields` 对齐、manifest 引用的 message key 存在（由调用方传入 key
集合）、catalog 不泄漏运行时内部、`defaultValue` 与 `configSchema` 的默认值一致。默认 registry 的
audit 在 `packages/destinations/src/registry.test.ts` 里强制 `{ warnings: [] }`；注册新 adapter 后，
本地可以直接跑：

```ts
import { createDefaultDestinationRegistry } from "#destinations/registry";

expect(createDefaultDestinationRegistry().audit()).toEqual({ warnings: [] });
```

message key 那一项需要把真实文案 key 传进去，console 侧由
`apps/console/src/i18n/destination-catalog.test.ts` 用 en-US / zh-Hans 两个 key 集合承担。audit
**不覆盖**所有规则（如 deprecated adapter 的 `replacementKind` 校验尚未实现，见第 5 节第 8 条），
它只是把最容易静默漂移的几条固定下来。

## 3. 参考实现

下面是 scaffold 的源文件（`packages/destinations/src/scaffold/`）。它们不是字符串模板，而是**真实的
adapter 模块**：`vp check` 会 typecheck，自测会在 `vp run -r test` 里真实执行，因此本文引用的代码
不会漂移（`packages/destinations/src/scaffold.test.ts` 断言本文的代码块与这些文件逐字一致）。

示例里的 kind 占位符是 `generic_webhook`——`DestinationKind` 是封闭枚举，模板必须挂在一个真实 kind
上才能编译；scaffold 会把 `generic-webhook` / `generic_webhook` / `genericWebhook` / `GenericWebhook` /
`GENERIC_WEBHOOK`（以及错误文案里的 `generic webhook`）整套替换成你的 kind。

`packages/destinations/src/scaffold/schema.ts`

```ts file=packages/destinations/src/scaffold/schema.ts
import { z } from "zod";

import { TextOnlyDestinationTemplateSchema } from "#destinations/template";

/**
 * The adapter's typed config. Keep it strict: the console parses every saved
 * config (and every TOML import) through this schema, so an unknown key fails
 * loudly instead of being silently carried as dead data.
 */
export const GenericWebhookConfigSchema = z.strictObject({
  webhookUrl: z.url(),
  template: TextOnlyDestinationTemplateSchema.optional(),
});

export type GenericWebhookConfig = z.infer<typeof GenericWebhookConfigSchema>;
```

`packages/destinations/src/scaffold/manifest.ts`

```ts file=packages/destinations/src/scaffold/manifest.ts
import type { DestinationManifest } from "#destinations/types";

/**
 * JSON-safe description of the adapter (ADR 0002): the client-safe catalog the
 * console renders is projected from this object, and the registry audit checks
 * it against `configSchema` and the console's i18n keys.
 */
export const genericWebhookManifest = {
  kind: "generic_webhook",
  configVersion: 1,
  lifecycle: {
    status: "experimental",
  },
  displayNameKey: "destinations.kinds.generic_webhook",
  descriptionKey: "destinations.table.safeConfig.generic_webhook",
  iconName: "webhook",
  configFields: [
    {
      type: "url",
      path: "webhookUrl",
      labelKey: "destinations.form.webhookUrl",
      required: true,
      sensitive: true,
    },
    {
      type: "template",
      path: "template",
      labelKey: "destinations.form.template",
      descriptionKey: "destinations.form.templateDescription",
      modes: [
        {
          mode: "text",
          labelKey: "destinations.form.templateModeText",
        },
      ],
    },
  ],
  secretFields: [
    {
      path: "webhookUrl",
      kind: "webhook_url",
      envHint: "GENERIC_WEBHOOK_URL",
      labelKey: "destinations.form.webhookUrl",
    },
  ],
  capabilities: {
    preview: true,
    test: true,
    delivery: true,
  },
} satisfies DestinationManifest<"generic_webhook">;
```

`packages/destinations/src/scaffold/payload.ts`

```ts file=packages/destinations/src/scaffold/payload.ts
import type { JsonValue } from "@tocsin/core";

import { destinationCopy, displaySeverity, displayStatus } from "#destinations/presentation";
import { DestinationTemplateEngine } from "#destinations/template";
import type { DestinationSendInput } from "#destinations/types";

import type { GenericWebhookConfig } from "./schema";

/**
 * Renders the safe debug payload used by preview and Delivery detail. It must
 * never carry secrets: the webhook URL stays out of the payload, and the
 * template engine only resolves allow-listed variables.
 */
export function renderGenericWebhookPayload(
  input: DestinationSendInput<GenericWebhookConfig>,
): JsonValue {
  const event = input.normalizedEvent;
  const template = input.config.template;
  const message =
    template?.mode === "text"
      ? DestinationTemplateEngine.renderTextOrThrow(
          DestinationTemplateEngine.createRenderContext(input),
          template.text,
          "template.text",
          template.bindings,
        )
      : event.message;

  return {
    title: `[${displaySeverity(event.severity, input.presentation)}] ${event.title}`,
    message,
    status: displayStatus(event.status, input.presentation),
    source: input.source.name,
    fingerprint: event.fingerprint,
    occurredAt: event.occurredAt,
    severityLabel: destinationCopy(input.presentation).labels.severity,
  };
}
```

`packages/destinations/src/scaffold/adapter.ts`

```ts file=packages/destinations/src/scaffold/adapter.ts
import type { JsonValue } from "@tocsin/core";

import { zodTemplateDiagnostics } from "#destinations/shared/template-diagnostics";
import { DestinationTemplateEngine } from "#destinations/template";
import { Adapter, R, Send } from "#destinations/utils";

import { genericWebhookManifest } from "./manifest";
import { renderGenericWebhookPayload } from "./payload";
import { GenericWebhookConfigSchema } from "./schema";

/**
 * `Adapter.define` infers the typed config from `configSchema`; the manifest
 * stays a plain JSON-safe object and `preview` / `send` are pure functions.
 */
export const genericWebhookAdapter = Adapter.define({
  manifest: genericWebhookManifest,
  configSchema: GenericWebhookConfigSchema,
  preview(input) {
    const parsedConfig = GenericWebhookConfigSchema.safeParse(input.config);

    if (!parsedConfig.success) {
      // Preview failures are returned as data, never thrown: the console shows
      // these diagnostics next to the field the operator is editing.
      return {
        templateError: {
          diagnostics: zodTemplateDiagnostics(parsedConfig.error),
        },
      };
    }

    return renderGenericWebhookPayload({ ...input, config: parsedConfig.data });
  },
  async send(input, context) {
    const parsedConfig = GenericWebhookConfigSchema.safeParse(input.config);

    if (!parsedConfig.success) {
      return R.fail({
        errorKind: "configuration_error",
        retryHint: "not_retryable",
        errorMessage: "Generic webhook destination configuration is invalid",
        statusCode: null,
        responseBody: null,
        renderedPayload: {
          templateError: {
            diagnostics: zodTemplateDiagnostics(parsedConfig.error),
          },
        },
      });
    }

    const config = parsedConfig.data;
    const { fetch } = Adapter.getTransportContext(context);
    let renderedPayload: JsonValue;

    try {
      renderedPayload = renderGenericWebhookPayload({ ...input, config });
    } catch (error) {
      if (DestinationTemplateEngine.isValidationError(error)) {
        return R.fail({
          errorKind: "configuration_error",
          retryHint: "not_retryable",
          errorMessage: error.message,
          statusCode: null,
          responseBody: null,
          renderedPayload: DestinationTemplateEngine.validationErrorToPayload(error),
        });
      }

      throw error;
    }

    try {
      const response = await fetch(config.webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(renderedPayload),
      });
      const responseBody = await Send.readResponseBody(response);

      if (!response.ok) {
        return R.fail({
          errorKind: "http_error",
          retryHint: Send.httpStatusToRetryHint(response.status),
          errorMessage: `Generic webhook returned HTTP ${response.status}`,
          statusCode: response.status,
          responseBody,
          renderedPayload,
        });
      }

      return R.ok({
        statusCode: response.status,
        responseBody,
        renderedPayload,
      });
    } catch (error) {
      return Send.transportFailureResult({ error, renderedPayload });
    }
  },
});
```

`packages/destinations/src/scaffold/index.ts`

```ts file=packages/destinations/src/scaffold/index.ts
export * from "./adapter";
export * from "./manifest";
export * from "./payload";
export * from "./schema";
```

`packages/destinations/src/scaffold/index.test.ts`

```ts file=packages/destinations/src/scaffold/index.test.ts
import { destinationSendInput, fakeFetch } from "@tocsin/destinations/test-kit";
import { describe, expect, it } from "vite-plus/test";

import { genericWebhookAdapter } from "./adapter";
import type { GenericWebhookConfig } from "./schema";

const input = destinationSendInput<GenericWebhookConfig>({
  destination: { kind: "generic_webhook", name: "Webhook SRE" },
  source: { name: "Alertmanager prod", provider: "alertmanager" },
  config: {
    webhookUrl: "https://hooks.example.test/services/example",
  },
});

describe("generic webhook adapter", () => {
  it("previews the payload without the webhook URL", async () => {
    const preview = await genericWebhookAdapter.preview(input);

    expect(preview).toMatchObject({
      title: expect.stringContaining("Checkout API latency high"),
      message: "p95 latency exceeded",
    });
    expect(JSON.stringify(preview)).not.toContain(input.config.webhookUrl);
  });

  it("sends the rendered payload through the injected transport", async () => {
    const fetcher = fakeFetch();

    const result = await genericWebhookAdapter.send(input, { fetch: fetcher });

    expect(result.ok).toBe(true);
    expect(fetcher.calls).toHaveLength(1);
    expect(fetcher.calls[0]?.url).toBe(input.config.webhookUrl);
    expect(fetcher.calls[0]?.init.headers).toEqual({
      "Content-Type": "application/json",
    });
    expect(fetcher.calls[0]?.init.body).toContain("Checkout API latency high");
  });

  it("classifies a failed request with the shared retry hint", async () => {
    const fetcher = fakeFetch(() => ({ ok: false, status: 503, body: "unavailable" }));

    const result = await genericWebhookAdapter.send(input, { fetch: fetcher });

    expect(result).toMatchObject({
      ok: false,
      errorKind: "http_error",
      retryHint: "retryable",
      statusCode: 503,
    });
  });

  it("reports a template validation failure as a configuration error", async () => {
    const fetcher = fakeFetch();

    const result = await genericWebhookAdapter.send(
      {
        ...input,
        config: {
          webhookUrl: input.config.webhookUrl,
          template: {
            mode: "text",
            text: "{{event.nope}}",
          },
        },
      },
      { fetch: fetcher },
    );

    expect(fetcher.calls).toHaveLength(0);
    expect(result).toMatchObject({
      ok: false,
      errorKind: "configuration_error",
      retryHint: "not_retryable",
    });
  });
});
```

## 4. manifest 契约

`manifest` 必须是 JSON-safe：只有数据，没有函数、class、React 组件、RegExp、fetch。它在注册时被
`DestinationManifestSchema` 解析，然后投影成 client-safe catalog（`toCatalog()`）发给浏览器。

| 字段 | 类型 | 要点 |
| --- | --- | --- |
| `kind` | `DestinationKind` | 封闭枚举；必须与 `DestinationKindSchema` 一致 |
| `configVersion` | `int ≥ 1` | 必填，从 `1` 开始；破坏性配置变化升版本并给迁移路径 |
| `lifecycle` | `{ status, replacementKind?, messageKey? }` | 必填，不默认 `stable`；`stable` 是维护承诺 |
| `displayNameKey` | i18n key | 两个 locale 都必须存在（console 测试 fail-loud） |
| `descriptionKey` | i18n key? | catalog 与表单里的说明 |
| `iconName` | `string`? | F7 起真实生效（见第 5 节） |
| `configFields` | `AdapterConfigField[]` | 字段描述；今天**不驱动**表单渲染（见第 5 节） |
| `secretFields` | `AdapterSecretField[]` | 服务端安全真相；必须覆盖所有 `sensitive: true` 的路径 |
| `capabilities` | `{ preview, test, delivery }` | 封闭 schema，不是开放的 capability bag |

### 字段类型（11 种，封闭集合）

| `type` | 用途 | 额外属性 |
| --- | --- | --- |
| `text` | 单行文本 | — |
| `textarea` | 多行文本 | — |
| `url` | URL | — |
| `secret` | 不回显的 secret 输入 | — |
| `password` | 密码输入 | — |
| `template` | 模板体（文本或平台原生 JSON） | `modes`、`help` |
| `boolean` | 开关 | — |
| `number` | 数字 | `min`、`max`、`step` |
| `string-list` | 字符串列表 | — |
| `key-value` | 键值映射（如 headers） | `valueSensitive` |
| `select` | 枚举选择 | `options`（至少一项） |

公共属性：`path`（安全 dot path，不支持数组下标、通配符、表达式与 `__proto__` 之类的键）、
`labelKey`、`descriptionKey`、`placeholderKey`、`required`、`sensitive`、`defaultValue`。

`defaultValue` 只是 console 的初始化提示：运行时默认值的唯一真相是 `configSchema`，registry audit 会
逐个字段比对两者，不一致就报警。

### secret 字段（7 种 `kind`）

`token`、`webhook_url`、`signing_secret`、`password`、`api_key`、`endpoint_url`、`header`。
分类服务于 env hint、安全摘要与脱敏 helper；不要引入自定义 redaction DSL。`path` 使用与 config
字段相同的安全 dot path，`envHint`、`labelKey` 可选。

### 其他硬性约束

- `path` 与 `configSchema` 必须对得上；audit 会在字段声明了 schema 里没有的路径时报警。
- `preview`、`send`、`configSchema` 放在 manifest **外面**：完整 manifest 含 `secretFields`，
  client catalog 会剥离它；`Adapter.define` 从顶层 `configSchema` 推断 typed config。
- adapter 运行时只接收已解析的 typed config，不读 env / TOML / DB / logger；transport 只通过注入的
  `fetch` 与 `now`。

## 5. 最难自己摸出来的几件事

1. **preview 失败是数据，不是异常**：config 解析失败时返回
   `{ templateError: { diagnostics: zodTemplateDiagnostics(error) } }`，模板渲染失败返回
   `DestinationTemplateEngine.validationErrorToPayload(error)`。
2. **`renderedPayload` 在每个分支都必填**：`R.ok` 与 `R.fail` 都要求一个 secret-safe 的调试载荷，
   即使发送都没发生（如配置错误）也要给。
3. **`errorKind` 是 6 值闭合集合**：`http_error`、`target_rejected`、`network_error`、`timeout`、
   `configuration_error`、`unknown_error`；`retryHint` 是 `retryable` / `not_retryable` / `unknown`。
   目标是"目标系统语义"（如 429、5xx → `retryable`），最终重试策略由 worker 拥有。
4. **取 transport 要解构**：`const { fetch } = Adapter.getTransportContext(context)`。直接用
   `context.fetch` 会绕过 console 注入的策略化 wrapper（超时、user agent、测试 fake）。
5. **`manifest.configFields` 今天不渲染表单**：只有模板字段的 `modes` 从 manifest 读取，
   其余表单仍然按 kind 手写在 `apps/console` 里（PRD 的 F3）。想要新字段出现在 UI 上，必须改
   console 的表单分支；这是现阶段最大的预期落差。
6. **`secretFields` 目前不喂给脱敏逻辑**：`apps/console/src/infra/sqlite/repositories/destination/destination.helpers.ts`
   的 `configuredSecretFieldPaths` 与 `apps/console/src/server/configuration/config-portability.ts`
   的 `destinationKindSecretPaths` 仍然手写每个 kind 的 secret 路径（F2/C4 尚未落地）。两处都是
   exhaustive switch，漏改会 typecheck 失败；但"两处必须与 manifest 一致"目前没有自动校验。
7. **`iconName` 自 F7 起真实生效**：console 按 catalog 的 `iconName` 解析图标，顺序是
   内置 glyph（如 `mail`）→ `packages/destinations/src/icons.ts` 的资产注册表 → 通用兜底 glyph。
   新品牌图标 = 往 `packages/destinations/assets/destination-icons/` 放 `<icon>.svg` + 在
   `icons.ts` 加一条；不注册只会退化成兜底图标，不会 blank，也不会崩。
8. **deprecated 迁移路径尚未被 audit 覆盖**：ADR 0002 要求 audit 校验 deprecated adapter 的
   `replacementKind` 存在，这条规则今天没有实现。写 `deprecated` 时请自觉提供 `replacementKind`
   或 `messageKey`。
9. **message key 的检查依赖调用方**：`registry.audit({ messageKeys })` 只有在传入 key 集合时才校验；
   console 侧由 `apps/console/src/i18n/destination-catalog.test.ts` 用两个 locale 的真实 key 集合承担。

## 6. 新增 kind 的注册点 checklist

`<kind>` 是蛇形 kind，`<kebab>` 是它的连字符形式。**FAIL-LOUD** 表示漏改会编译或测试失败；
**SILENT** 表示漏改不会报错，只会少功能或产生安全隐患，需要人工确认。

| # | 文件 | 要做什么 | 漏了会怎样 |
| --- | --- | --- | --- |
| 1 | `packages/core/src/destination/destination.ts` | `DestinationKindSchema` 加入 kind | FAIL-LOUD |
| 2 | `packages/destinations/src/registry.ts` | `createDefaultDestinationRegistry` 显式注册 | FAIL-LOUD（registry 测试） |
| 3 | `packages/destinations/package.json` | `exports` 加 `"./<kebab>": "./src/<kebab>/index.ts"` | SILENT |
| 4 | `apps/console/src/i18n/messages/en-US.json`、`zh-Hans.json` | manifest 引用的**每个** message key 都有文案 | FAIL-LOUD（`destination-catalog.test.ts`） |
| 5 | `apps/console/src/features/destinations/model/destination-form.ts` | `DestinationFormKind` 联合类型 + `destinationConfigFromForm` / `destinationConfigPatchFromForm` 的字段映射分支 | FAIL-LOUD（联合类型收窄） |
| 6 | `apps/console/src/features/destinations/ui/destination-form.tsx` | kind 下拉选项 + 该 kind 的字段块 | SILENT（只少一个下拉项/一组字段，见第 5.5 条） |
| 7 | `apps/console/src/infra/sqlite/repositories/destination/destination.helpers.ts` | operational config 投影、metadata、`configuredSecretFieldPaths`、`configEndpoint` | FAIL-LOUD（exhaustive switch） |
| 8 | `apps/console/src/server/configuration/config-portability.ts` | `destinationKindSecretPaths` | FAIL-LOUD；漏了会在 portable 导出里泄漏 secret |
| 9 | `apps/console/src/features/destinations/ui/feishu-dynamic-properties-field.tsx` | `BindingSelectorCases["destination.kind"]` | SILENT（模板绑定选择器少一项） |
| 10 | `packages/destinations/assets/destination-icons/` + `packages/destinations/src/icons.ts` | 新图标资产 + 注册表条目（或复用已有 `iconName`） | SILENT（退化为兜底图标） |
| 11 | `packages/destinations/src/registry.test.ts`、`apps/console/src/features/destinations/ui/destination-form.test.tsx` 等 | 更新 kind 列表断言、补该 kind 的表单/适配器测试 | FAIL-LOUD |

第 4-11 条是 F1/F2/F3 尚未收敛前的现实成本：一个"只写 adapter 目录"的贡献路径还需要这些 console
改动。ADR 0002 的分阶段计划（manifest-driven 表单、secret 路径从 manifest 派生）落地后，这张表会变短。

## 7. 提交前验证

```bash
vp -C packages/destinations test run        # adapter 自测 + registry audit + scaffold 契约
vp check                                    # 格式化、lint、typecheck（先格式化再 typecheck）
vp run -r test                              # 全仓测试（含 console 的 i18n / 表单测试）
vp run -r build                             # console 生产构建
```

`vp check` 报格式化问题时先 `vp check --fix`，再跑一次 `vp check`：第一次的失败可能掩盖 typecheck。

## 8. 本文的代码为什么不会漂

- 第 3 节的六个代码块与 `packages/destinations/src/scaffold/` 下的真实文件逐字一致；
  `packages/destinations/src/scaffold.test.ts` 会解析本文的 `file=` 标注代码块并断言相等。
- 这些文件本身在 package 的 tsconfig 里，`vp check` 会 typecheck；`index.test.ts` 也会被
  `vp run -r test` 执行，所以示例里的 preview / send 形状是"编译过且跑过"的，而不是抄在文档里的
  漂移样本。
- scaffold 只是把这组文件改名，`scaffold.test.ts` 还会实际运行 CLI 生成一次目录，断言替换结果里
  不再残留占位 token、且拒绝覆盖已存在的目录。
