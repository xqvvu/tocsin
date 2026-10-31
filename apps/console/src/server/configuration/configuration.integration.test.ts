import { parse as parseToml } from "smol-toml";
import { describe, expect, it } from "vite-plus/test";

import {
  DestinationKindSchema,
  type DestinationKind,
  type JsonObject,
  type TomlDocument,
} from "@tocsin/core";
import { createDefaultDestinationRegistry } from "@tocsin/destinations";
import type { DestinationSendContext } from "@tocsin/destinations";
import { createDefaultProviderRegistry } from "@tocsin/providers";

import { openSqliteStore } from "#/infra/sqlite/store";
import { AppSettingsService } from "#/server/configuration/app-settings.service";
import { ConfigPortabilityService } from "#/server/configuration/config-portability.service";
import { DestinationService } from "#/server/destinations/destination.service";
import { hashSourceToken, WebhookIntakeService } from "#/server/intake/intake.service";
import { RouteService } from "#/server/routes/route.service";
import { SourceService } from "#/server/sources/source.service";

const now = "2026-06-09T08:00:00.000Z";

const registeredDestinationKinds: DestinationKind[] = createDefaultDestinationRegistry().list.map(
  (adapter) => adapter.manifest.kind,
);

/**
 * One secret-bearing config per destination kind, keyed by kind so that adding
 * a kind without adding a fixture here fails typecheck as well as the
 * parameterized redaction test below. `secretValues` are the plaintext values
 * that must never reach an exported document, `secretPaths` the config paths
 * that must be replaced by environment references.
 */
const destinationSecretCases: Record<
  DestinationKind,
  { config: JsonObject; preserved: JsonObject; secretValues: string[]; secretPaths: string[] }
> = {
  generic_webhook: {
    config: {
      url: "https://relay.example.test/generic-webhook-secret",
      method: "PATCH",
      headers: {
        Authorization: "Bearer generic-webhook-header-secret",
        "X-Auth-Token": "generic-webhook-x-auth-token-secret",
        "X-Custom-Auth": "generic-webhook-custom-auth-secret",
      },
    },
    preserved: { method: "PATCH" },
    secretValues: [
      "https://relay.example.test/generic-webhook-secret",
      "Bearer generic-webhook-header-secret",
      "generic-webhook-x-auth-token-secret",
      "generic-webhook-custom-auth-secret",
    ],
    secretPaths: ["url", "headers.Authorization", "headers.X-Auth-Token", "headers.X-Custom-Auth"],
  },
  feishu: {
    config: {
      sendMode: "webhook",
      webhookUrl: "https://open.feishu.cn/open-apis/bot/v2/hook/feishu-secret",
      signSecret: "feishu-sign-secret",
    },
    preserved: { sendMode: "webhook" },
    secretValues: [
      "https://open.feishu.cn/open-apis/bot/v2/hook/feishu-secret",
      "feishu-sign-secret",
    ],
    secretPaths: ["webhookUrl", "signSecret"],
  },
  slack: {
    config: {
      webhookUrl: "https://hooks.slack.com/services/slack-secret",
      template: {
        mode: "text",
        text: "{{event.title}}",
      },
    },
    preserved: { template: { mode: "text", text: "{{event.title}}" } },
    secretValues: ["https://hooks.slack.com/services/slack-secret"],
    secretPaths: ["webhookUrl"],
  },
  email: {
    config: {
      endpointUrl: "https://mail-gateway.example.test/email-gateway-secret",
      to: ["sre@example.test"],
      from: "tocsin@example.test",
      headers: {
        "X-Api-Key": "email-gateway-header-secret",
        "X-Custom-Auth": "email-custom-auth-secret",
      },
    },
    preserved: { to: ["sre@example.test"], from: "tocsin@example.test" },
    secretValues: [
      "https://mail-gateway.example.test/email-gateway-secret",
      "email-gateway-header-secret",
      "email-custom-auth-secret",
    ],
    secretPaths: ["endpointUrl", "headers.X-Api-Key", "headers.X-Custom-Auth"],
  },
};

/**
 * One rendered-payload secret marker per destination kind. Preview and test
 * results are dashboard DTOs, so the rendered outbound body must come back as
 * a redacted projection even when the marker sits in an operator-shaped JSON
 * payload or in a secret-shaped assignment inside a custom template. Keyed by
 * kind so adding a destination kind fails typecheck until its rendered-payload
 * redaction case exists.
 */
const destinationRenderedPayloadSecretCases: Record<
  DestinationKind,
  { config: JsonObject; marker: string }
> = {
  generic_webhook: {
    config: {
      url: "https://example.test/webhook",
      template: {
        mode: "json_payload",
        payload: {
          event: "{{event.title}}",
          apiSecret: "generic-rendered-payload-secret",
        },
      },
    },
    marker: "generic-rendered-payload-secret",
  },
  feishu: {
    config: {
      sendMode: "webhook",
      webhookUrl: "https://open.feishu.cn/open-apis/bot/v2/hook/example",
      template: {
        source: "custom",
        mode: "text",
        text: "token=feishu-rendered-payload-secret",
      },
    },
    marker: "feishu-rendered-payload-secret",
  },
  slack: {
    config: {
      webhookUrl: "https://hooks.slack.com/services/example",
      template: {
        source: "custom",
        mode: "text",
        text: "token=slack-rendered-payload-secret",
      },
    },
    marker: "slack-rendered-payload-secret",
  },
  email: {
    config: {
      endpointUrl: "https://mail-gateway.example.test/send",
      to: ["sre@example.test"],
      from: "tocsin@example.test",
      subjectTemplate: "token=email-rendered-payload-secret",
    },
    marker: "email-rendered-payload-secret",
  },
};

/**
 * One persisted destination per kind for the test-send redaction suite. The
 * configs reuse the rendered-payload markers above, so the assertion covers
 * the DTO boundary rather than the adapter's template shape. Slack only treats
 * an exact `ok` body as success; the other senders accept any 2xx.
 */
const destinationTestTransportCases: Record<
  DestinationKind,
  { config: JsonObject; expectedUrl: string; responseBody: string }
> = {
  generic_webhook: {
    config: destinationRenderedPayloadSecretCases.generic_webhook.config,
    expectedUrl: "https://example.test/webhook",
    responseBody: "accepted token=downstream-token password: downstream-password",
  },
  feishu: {
    config: destinationRenderedPayloadSecretCases.feishu.config,
    expectedUrl: "https://open.feishu.cn/open-apis/bot/v2/hook/example",
    responseBody: "accepted token=downstream-token password: downstream-password",
  },
  slack: {
    config: destinationRenderedPayloadSecretCases.slack.config,
    expectedUrl: "https://hooks.slack.com/services/example",
    responseBody: "ok",
  },
  email: {
    config: destinationRenderedPayloadSecretCases.email.config,
    expectedUrl: "https://mail-gateway.example.test/send",
    responseBody: "accepted token=downstream-token password: downstream-password",
  },
};

async function createStore() {
  return openSqliteStore({
    databasePath: ":memory:",
    now: () => now,
  });
}

function createTestContexts(
  store: Awaited<ReturnType<typeof createStore>>,
  destinationSendContext?: DestinationSendContext,
  generateSourceToken: () => string = () => "tocsin_src_test_token",
) {
  const destinationRegistry = createDefaultDestinationRegistry();

  const sources = new SourceService({ store, generateSourceToken });
  const destinations = new DestinationService({
    store,
    destinations: destinationRegistry,
    destinationSendContext,
    // Pinned so previews and test sends can assert `tocsin.eventUrl` without
    // depending on the ambient environment.
    publicBaseUrl: "https://tocsin.example.test",
  });
  const routes = new RouteService({ store });
  const settings = new AppSettingsService({ store });
  const portability = new ConfigPortabilityService({
    store,
    destinations: destinationRegistry,
    generateSourceToken,
  });

  return {
    sources,
    destinations,
    routes,
    settings,
    portability,
  };
}

async function createTestContext(
  store?: Awaited<ReturnType<typeof createStore>>,
  generateSourceToken?: () => string,
) {
  store ??= await createStore();

  return {
    store,
    services: createTestContexts(store, undefined, generateSourceToken),
  };
}

async function createTestContextWithDestinationFetch(fetch: DestinationSendContext["fetch"]) {
  const store = await createStore();

  return {
    store,
    services: createTestContexts(store, { fetch }),
  };
}

describe("configuration capabilities", () => {
  it("keeps the destination registry in step with the core kind schema", () => {
    // The redaction suite below is parameterized by the registry, so a kind
    // that exists in the schema but was never registered would silently skip
    // its secret-leak coverage instead of failing here.
    expect([...registeredDestinationKinds].sort()).toEqual(
      [...DestinationKindSchema.options].sort(),
    );
  });

  it("creates sources with one-time plaintext tokens and persisted token hashes", async () => {
    const { store, services } = await createTestContext();

    const created = await services.sources.createSource({
      name: "Generic source",
      provider: "generic",
      config: {
        team: "sre",
      },
    });
    const stored = await store.sources.get(created.source.id);

    expect(created.source).toMatchObject({
      name: "Generic source",
      provider: "generic",
      enabled: true,
    });
    expect(created.token).toBe("tocsin_src_test_token");
    expect(stored?.tokenHash).toBe(hashSourceToken("tocsin_src_test_token"));
    expect(stored?.config).toEqual({ team: "sre" });

    await store.close();
  });

  it("rotates source tokens without returning the hash", async () => {
    const { store, services } = await createTestContext();
    const created = await services.sources.createSource({
      name: "Generic source",
      provider: "generic",
    });

    const rotated = await services.sources.rotateSourceToken({ id: created.source.id });

    expect(rotated.token).toBe("tocsin_src_test_token");
    expect((await store.sources.get(created.source.id))?.tokenHash).toBe(
      hashSourceToken("tocsin_src_test_token"),
    );

    await store.close();
  });

  // The rotation write and the webhook read are separate boundaries; asserting
  // the stored hash against the same constant the test issued is self-proving
  // and would not catch a return/persist mismatch or a double generation. This
  // drives the rotated token through the real intake verification path.
  it("accepts the rotated token at the webhook boundary and rejects the previous one", async () => {
    let issued = 0;
    const { store, services } = await createTestContext(
      undefined,
      () => `tocsin_src_test_token_${++issued}`,
    );
    const created = await services.sources.createSource({
      name: "Rotating source",
      provider: "generic",
    });
    const rotated = await services.sources.rotateSourceToken({ id: created.source.id });
    const intake = new WebhookIntakeService({
      store,
      providers: createDefaultProviderRegistry(),
      now: () => now,
    });

    expect(rotated.token).not.toBe(created.token);

    const accepted = await intake.acceptWebhook({
      sourceId: created.source.id,
      token: rotated.token,
      headers: {},
      payload: {
        title: "Checkout unavailable",
        message: "checkout returned 503",
        severity: "critical",
      },
      receivedAt: now,
    });

    expect(accepted.accepted).toBe(true);

    await expect(
      intake.acceptWebhook({
        sourceId: created.source.id,
        token: created.token,
        headers: {},
        payload: {
          title: "Checkout unavailable",
          message: "checkout returned 503",
          severity: "critical",
        },
        receivedAt: now,
      }),
    ).rejects.toMatchObject({ reason: "invalid_token" });

    await store.close();
  });

  it("updates source metadata without exposing or changing the token hash", async () => {
    const { store, services } = await createTestContext();
    const created = await services.sources.createSource({
      name: "Generic source",
      provider: "generic",
      config: {
        signingSecret: "old-secret",
        team: "sre",
      },
    });
    const before = await store.sources.get(created.source.id);

    const updated = await services.sources.updateSource({
      id: created.source.id,
      name: "Grafana prod",
      provider: "grafana",
      config: {
        signingSecret: "new-secret",
      },
    });

    expect(updated).toEqual({
      id: created.source.id,
      name: "Grafana prod",
      provider: "grafana",
      enabled: true,
    });
    expect(updated).not.toHaveProperty("tokenHash");
    expect((await store.sources.get(created.source.id))?.tokenHash).toBe(before?.tokenHash);
    expect((await store.sources.get(created.source.id))?.config).toEqual({
      signingSecret: "new-secret",
      team: "sre",
    });

    await store.close();
  });

  it("validates destination config through the registered destination sender", async () => {
    const { store, services } = await createTestContext();

    const destination = await services.destinations.createDestination({
      name: "Ops webhook",
      kind: "generic_webhook",
      config: {
        url: "https://example.test/webhook",
        method: "PATCH",
        headers: {
          "x-team": "sre",
        },
      },
    });
    const stored = await store.destinations.get(destination.id);

    expect(destination).toMatchObject({
      name: "Ops webhook",
      kind: "generic_webhook",
      enabled: true,
    });
    expect(stored?.config).toEqual({
      url: "https://example.test/webhook",
      method: "PATCH",
      idempotencyKey: false,
      headers: {
        "x-team": "sre",
      },
    });

    await expect(
      services.destinations.createDestination({
        name: "Broken webhook",
        kind: "generic_webhook",
        config: {
          url: "not a url",
        },
      }),
    ).rejects.toThrow("Invalid URL");
    await expect(
      services.destinations.createDestination({
        name: "Broken template webhook",
        kind: "generic_webhook",
        config: {
          url: "https://example.test/webhook",
          template: { mode: "text", text: "{{event.title.toUpperCase}}" },
        },
      }),
    ).rejects.toThrow("Destination template contains unknown variable: event.title.toUpperCase");
    await expect(
      services.destinations.updateDestination({
        id: destination.id,
        config: {
          template: { mode: "text", text: "{{process.env.SECRET}}" },
        },
      }),
    ).rejects.toThrow("Destination template contains unknown variable: process.env.SECRET");

    await store.close();
  });

  it("stores an empty urgent severity list as the critical gate", async () => {
    const { store, services } = await createTestContext();
    const app = await store.feishuApps.create({
      name: "SRE pager",
      appId: "cli_sre",
      appSecret: "secret-1",
    });

    const destination = await services.destinations.createDestination({
      name: "Feishu on-call",
      kind: "feishu",
      config: {
        sendMode: "app",
        app: { appRef: app.id, chatId: "oc_group" },
        urgent: {
          autoEnabled: true,
          severities: [],
          userIdType: "open_id",
          receivers: ["ou_1"],
        },
      },
    });
    const stored = await store.destinations.get(destination.id);

    expect(stored?.config).toMatchObject({ urgent: { severities: ["critical"] } });

    await store.close();
  });

  it("normalises a legacy empty severity list when the destination config is updated", async () => {
    const { store, services } = await createTestContext();
    const app = await store.feishuApps.create({
      name: "SRE pager",
      appId: "cli_sre",
      appSecret: "secret-1",
    });
    const legacy = await store.destinations.create({
      name: "Legacy Feishu",
      kind: "feishu",
      config: {
        sendMode: "app",
        app: { appRef: app.id, chatId: "oc_group" },
        urgent: {
          autoEnabled: true,
          severities: [],
          userIdType: "open_id",
          receivers: ["ou_1"],
        },
      },
    });

    // A config patch goes through merge + parse, which is the moment a legacy
    // row is rewritten with the normalised gate. A name-only update leaves the
    // stored JSON untouched by design.
    await services.destinations.updateDestination({
      id: legacy.id,
      config: { urgent: { autoEnabled: true } },
    });

    const stored = await store.destinations.get(legacy.id);

    expect(stored?.config).toMatchObject({ urgent: { severities: ["critical"] } });

    await store.close();
  });

  it("validates email destination config through the registered destination sender", async () => {
    const { store, services } = await createTestContext();

    const destination = await services.destinations.createDestination({
      name: "Email SRE",
      kind: "email",
      config: {
        endpointUrl: "https://mail-gateway.example.test/send",
        to: ["sre@example.test"],
        from: "tocsin@example.test",
        replyTo: "ops@example.test",
        subjectPrefix: "[Tocsin]",
        headers: {
          Authorization: "Bearer mail-gateway-secret",
        },
      },
    });
    const stored = await store.destinations.get(destination.id);

    expect(destination).toMatchObject({
      name: "Email SRE",
      kind: "email",
      enabled: true,
    });
    expect(stored?.config).toEqual({
      endpointUrl: "https://mail-gateway.example.test/send",
      to: ["sre@example.test"],
      from: "tocsin@example.test",
      replyTo: "ops@example.test",
      subjectPrefix: "[Tocsin]",
      headers: {
        Authorization: "Bearer mail-gateway-secret",
      },
    });

    await expect(
      services.destinations.createDestination({
        name: "Broken email",
        kind: "email",
        config: {
          endpointUrl: "https://mail-gateway.example.test/send",
          to: ["not-an-email"],
          from: "tocsin@example.test",
        },
      }),
    ).rejects.toThrow("Invalid email address");

    await store.close();
  });

  it("lists configuration without source token hashes or destination secrets", async () => {
    const { store, services } = await createTestContext();
    const source = await services.sources.createSource({
      name: "Grafana prod",
      provider: "grafana",
      config: {
        team: "sre",
      },
    });
    const destination = await services.destinations.createDestination({
      name: "Slack SRE",
      kind: "slack",
      config: {
        webhookUrl: "https://hooks.slack.com/services/secret",
      },
      secretRefs: {
        webhookUrl: "SLACK_WEBHOOK_URL",
      },
    });

    const sources = await services.sources.listSources();
    const destinations = await services.destinations.listDestinations();

    expect(sources).toEqual([
      {
        id: source.source.id,
        name: "Grafana prod",
        provider: "grafana",
        enabled: true,
      },
    ]);
    expect(destinations).toEqual([
      {
        id: destination.id,
        name: "Slack SRE",
        kind: "slack",
        enabled: true,
        operationalConfig: {
          endpoint: "https://hooks.slack.com/services/secret",
          host: "hooks.slack.com",
          templateConfigured: false,
          templateMode: null,
          templateSource: null,
          signingConfigured: false,
          method: null,
          to: null,
          from: null,
          replyTo: null,
          subjectPrefix: null,
          headerNames: null,
          secretFieldPaths: ["webhookUrl"],
          sendMode: null,
          appRef: null,
          chatId: null,
          urgentAutoEnabled: null,
          urgentReceivers: null,
        },
      },
    ]);
    const listedConfiguration = JSON.stringify({ sources, destinations });
    // Self-hosted: operational endpoints are visible to dashboard operators.
    expect(listedConfiguration).toContain("https://hooks.slack.com/services/secret");
    // True secrets still stay out of list DTOs.
    expect(listedConfiguration).not.toContain("tocsin_src_test_token");
    expect(listedConfiguration).not.toContain(hashSourceToken("tocsin_src_test_token"));
    expect(listedConfiguration).not.toContain("SLACK_WEBHOOK_URL");
    expect(listedConfiguration).not.toContain("signSecret");

    await store.close();
  });

  it("returns an authenticated editor draft with operational fields but without signing secrets", async () => {
    const { store, services } = await createTestContext();
    const destination = await services.destinations.createDestination({
      name: "Feishu SRE",
      kind: "feishu",
      config: {
        webhookUrl: "https://open.feishu.cn/open-apis/bot/v2/hook/private-token",
        signSecret: "private-signing-secret",
      },
    });

    const draft = await services.destinations.getDestinationTemplateDraft({
      id: destination.id,
    });

    expect(draft).toMatchObject({
      destinationId: destination.id,
      kind: "feishu",
      form: {
        webhookUrl: "https://open.feishu.cn/open-apis/bot/v2/hook/private-token",
      },
      operationalConfig: {
        endpoint: "https://open.feishu.cn/open-apis/bot/v2/hook/private-token",
        host: "open.feishu.cn",
        signingConfigured: true,
        secretFieldPaths: ["webhookUrl", "signSecret"],
      },
      template: {
        source: "builtin",
        id: "feishu.alert-card",
        version: 1,
        bindings: {
          statusColor: {
            select: "event.status",
            cases: {
              firing: "red",
              resolved: "green",
              unknown: "grey",
            },
            fallback: "grey",
          },
        },
      },
    });
    // Operational webhook is visible; signing secret value is not.
    expect(JSON.stringify(draft)).toContain("private-token");
    expect(JSON.stringify(draft)).not.toContain("private-signing-secret");
    expect(JSON.stringify(draft)).not.toMatch(/"signSecret"\s*:\s*"/);

    await store.close();
  });

  it("returns an editor draft with destination header names but no values", async () => {
    const { store, services } = await createTestContext();
    const destination = await services.destinations.createDestination({
      name: "Relay with auth",
      kind: "generic_webhook",
      config: {
        url: "https://relay.example.test/tocsin",
        headers: {
          Authorization: "Bearer relay-secret",
          "X-Custom-Auth": "Bearer custom-auth-secret",
          "X-Team": "sre",
        },
      },
    });

    const draft = await services.destinations.getDestinationTemplateDraft({
      id: destination.id,
    });

    // Names stay visible so the operator can replace a value; the values
    // themselves never leave the server.
    expect(draft.form.headers).toBe("Authorization:\nX-Custom-Auth:\nX-Team:");
    const serialized = JSON.stringify(draft);
    expect(serialized).not.toContain("Bearer relay-secret");
    expect(serialized).not.toContain("Bearer custom-auth-secret");
    expect(serialized).not.toContain("X-Team: sre");

    await store.close();
  });

  it("refuses to export a header name that cannot be a secret reference", async () => {
    const { store, services } = await createTestContext();

    await services.destinations.createDestination({
      name: "Relay with dotted header",
      kind: "generic_webhook",
      config: {
        url: "https://relay.example.test/tocsin",
        headers: {
          "X.Custom": "dotted-secret",
        },
      },
    });

    await expect(
      services.portability.exportToml({
        now: () => now,
      }),
    ).rejects.toThrow('header "X.Custom" cannot be exported');

    await store.close();
  });

  it("refuses to export header names that collide after env normalization", async () => {
    const { store, services } = await createTestContext();

    await services.destinations.createDestination({
      name: "Relay with colliding headers",
      kind: "generic_webhook",
      config: {
        url: "https://relay.example.test/tocsin",
        headers: {
          "X-Auth": "first-secret",
          X_Auth: "second-secret",
        },
      },
    });

    await expect(
      services.portability.exportToml({
        now: () => now,
      }),
    ).rejects.toThrow("map to the same secret environment name");

    await store.close();
  });

  it("drops header secret references for headers that no longer exist", async () => {
    const { store, services } = await createTestContext();

    await services.destinations.createDestination({
      name: "Relay with stale header ref",
      kind: "generic_webhook",
      config: {
        url: "https://relay.example.test/tocsin",
        headers: {
          "X-Team": "sre",
        },
      },
      secretRefs: {
        "headers.X-Removed": { env: "REMOVED_HEADER" },
      },
    });

    const toml = await services.portability.exportToml({
      now: () => now,
    });

    expect(toml).not.toContain("headers.X-Removed");
    expect(toml).not.toContain("REMOVED_HEADER");

    await store.close();
  });

  it("previews resolved Feishu cards with resolved bindings", async () => {
    const { store, services } = await createTestContext();
    const destination = await services.destinations.createDestination({
      name: "Feishu SRE",
      kind: "feishu",
      config: {
        webhookUrl: "https://open.feishu.cn/open-apis/bot/v2/hook/example",
      },
    });

    const result = await services.destinations.previewDestination({
      id: destination.id,
      sampleStatus: "resolved",
    });

    expect(result.normalizedEvent.status).toBe("resolved");
    expect(result.context.bindings).toEqual({ statusColor: "green" });
    expect(result.renderedPayload).toMatchObject({
      msg_type: "interactive",
      card: {
        header: {
          template: "green",
        },
      },
    });

    await store.close();
  });

  it("returns unused binding warnings without blocking preview rendering", async () => {
    const { store, services } = await createTestContext();
    const result = await services.destinations.previewDestinationDraft({
      name: "Webhook draft",
      kind: "generic_webhook",
      config: {
        url: "https://example.test/webhook",
        template: {
          mode: "text",
          text: "{{event.title}}",
          bindings: {
            unusedColor: {
              select: "event.status",
              cases: { firing: "red" },
              fallback: "grey",
            },
          },
        },
      },
    });

    expect(result.renderedPayload).toMatchObject({
      message: "Tocsin destination test",
    });
    expect(result.diagnostics).toEqual([
      {
        severity: "warning",
        path: "template.bindings.unusedColor",
        variable: "bindings.unusedColor",
        message: "Destination template binding is not referenced: unusedColor",
      },
    ]);

    await store.close();
  });

  it("previews Slack blocks with resolved bindings and rejects unsafe references", async () => {
    const { store, services } = await createTestContext();
    const webhookUrl = "https://hooks.slack.com/services/secret-token-path";

    const result = await services.destinations.previewDestinationDraft({
      name: "Slack SRE draft",
      kind: "slack",
      config: {
        webhookUrl,
        template: {
          mode: "slack_blocks",
          payload: {
            text: "{{bindings.statusLabel}}",
            blocks: [{ type: "section", text: { text: "{{bindings.providerLabel}}" } }],
          },
          bindings: {
            statusLabel: {
              select: "event.status",
              cases: { firing: "FIRING" },
              fallback: "UNKNOWN",
            },
            providerLabel: {
              select: "source.provider",
              cases: { generic: "GENERIC" },
              fallback: "OTHER",
            },
          },
        },
      },
    });

    expect(result.diagnostics).toEqual([]);
    expect(result.context.bindings).toEqual({
      statusLabel: "FIRING",
      providerLabel: "GENERIC",
    });
    expect(result.renderedPayload).toMatchObject({
      text: "FIRING",
      blocks: [{ type: "section", text: { text: "GENERIC" } }],
    });
    expect(JSON.stringify(result)).not.toContain("secret-token-path");

    const unsafe = await services.destinations.previewDestinationDraft({
      name: "Slack SRE draft",
      kind: "slack",
      config: {
        webhookUrl,
        template: {
          mode: "slack_blocks",
          payload: { url: "{{config.webhookUrl}}", auth: "{{headers.authorization}}" },
        },
      },
    });

    expect(unsafe.diagnostics).toEqual([
      {
        severity: "error",
        path: "template.payload.url",
        variable: "config.webhookUrl",
        message: "Destination template contains unknown variable: config.webhookUrl",
      },
      {
        severity: "error",
        path: "template.payload.auth",
        variable: "headers.authorization",
        message: "Destination template contains unknown variable: headers.authorization",
      },
    ]);
    expect(JSON.stringify(unsafe)).not.toContain("secret-token-path");

    await store.close();
  });

  it("tests destinations through registered senders without returning rendered payloads", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const { store, services } = await createTestContextWithDestinationFetch(async (url, init) => {
      calls.push({ url, init });
      return {
        ok: true,
        status: 202,
        text: async () => "accepted token=downstream-token password: downstream-password",
      };
    });
    const destination = await services.destinations.createDestination({
      name: "Ops webhook",
      kind: "generic_webhook",
      config: {
        url: "https://example.test/webhook",
      },
    });

    const result = await services.destinations.testDestination({ id: destination.id });

    expect(result).toMatchObject({
      destination: {
        id: destination.id,
        name: destination.name,
        kind: destination.kind,
        enabled: destination.enabled,
      },
      success: true,
      statusCode: 202,
      responseBody: "accepted token=[REDACTED] password: [REDACTED]",
      error: null,
    });
    expect(result.renderedPayload).toBeDefined();
    expect(JSON.stringify(result)).not.toContain("downstream-token");
    expect(JSON.stringify(result)).not.toContain("downstream-password");
    expect(calls[0]?.url).toBe("https://example.test/webhook");
    expect(JSON.parse(calls[0]?.init.body as string)).toMatchObject({
      eventId: expect.stringMatching(/^test-/),
      alert: {
        title: "Tocsin destination test",
        severity: "info",
      },
    });

    await store.close();
  });

  it("redacts test-send DTOs for every destination kind", async () => {
    for (const kind of DestinationKindSchema.options) {
      const fixture = destinationTestTransportCases[kind];
      const calls: Array<{ url: string; init: RequestInit }> = [];
      const { store, services } = await createTestContextWithDestinationFetch(async (url, init) => {
        calls.push({ url, init });
        return {
          ok: true,
          status: 202,
          text: async () => fixture.responseBody,
        };
      });
      const destination = await services.destinations.createDestination({
        name: `${kind} test destination`,
        kind,
        config: fixture.config,
      });

      const result = await services.destinations.testDestination({ id: destination.id });

      expect({
        kind,
        success: result.success,
        statusCode: result.statusCode,
        calledUrl: calls[0]?.url,
      }).toEqual({
        kind,
        success: true,
        statusCode: 202,
        calledUrl: fixture.expectedUrl,
      });

      // Both the rendered payload and the upstream reply cross the dashboard
      // DTO boundary, so neither the template marker nor a credential echoed
      // by the target may survive.
      const serialized = JSON.stringify(result);
      expect({
        kind,
        markerLeaked: serialized.includes(destinationRenderedPayloadSecretCases[kind].marker),
        tokenLeaked: serialized.includes("downstream-token"),
        passwordLeaked: serialized.includes("downstream-password"),
      }).toEqual({
        kind,
        markerLeaked: false,
        tokenLeaked: false,
        passwordLeaked: false,
      });

      await store.close();
    }
  });

  it("tests destinations with a historical Event sample, redaction, and console presentation", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const { store, services } = await createTestContextWithDestinationFetch(async (url, init) => {
      calls.push({ url, init });
      return { ok: true, status: 202, text: async () => "accepted" };
    });
    const currentSettings = await services.settings.getAppSettings();
    await services.settings.updateAppSettings({
      locale: "en-US",
      timeZone: "UTC",
      rawPayloadRetentionDays: currentSettings.rawPayloadRetentionDays,
    });
    const source = await services.sources.createSource({
      name: "SigNoz",
      provider: "signoz",
    });
    const event = await store.intake.recordEvent({
      id: "event-test-sample",
      sourceId: source.source.id,
      idempotencyKey: null,
      normalized: {
        title: "High CPU",
        message: "CPU above threshold",
        severity: "critical",
        status: "firing",
        fingerprint: "signoz:cpu:api",
        labels: { service: "api" },
        occurredAt: "2026-06-09T07:59:00.000Z",
      },
      providerMetadata: { alertCount: 2 },
      rawPayload: {
        alertname: "HighCPU",
        token: "raw-token",
      },
      rawHeaders: {
        authorization: "Bearer source-token",
      },
    });
    const destination = await services.destinations.createDestination({
      name: "Ops webhook",
      kind: "generic_webhook",
      config: {
        url: "https://example.test/webhook",
        template: {
          mode: "text",
          text: "{{event.title}} {{event.fingerprint}} {{payload.alertname}} token={{payload.token}} locale={{presentation.locale}} tz={{presentation.timeZone}} alerts={{tocsin.alertCount}}",
        },
      },
    });

    const result = await services.destinations.testDestination({
      id: destination.id,
      sampleEventId: event.id,
    });

    expect(result).toMatchObject({
      destination: { id: destination.id, name: destination.name },
      success: true,
      statusCode: 202,
      error: null,
    });
    expect(JSON.parse(calls[0]?.init.body as string)).toMatchObject({
      eventId: event.id,
      source: { id: source.source.id, name: source.source.name },
      alert: { title: "High CPU", fingerprint: "signoz:cpu:api" },
      message: "High CPU signoz:cpu:api HighCPU token=[REDACTED] locale=en-US tz=UTC alerts=2",
    });
    expect(JSON.stringify(result)).not.toContain("raw-token");
    expect(JSON.stringify(result)).not.toContain("source-token");

    await store.close();
  });

  it("links previews back to the dashboard event", async () => {
    const { store, services } = await createTestContext();
    const source = await services.sources.createSource({ name: "Grafana", provider: "grafana" });
    const event = await store.intake.recordEvent({
      id: "event-url-sample",
      sourceId: source.source.id,
      idempotencyKey: null,
      normalized: {
        title: "Disk almost full",
        message: "/var at 98%",
        severity: "warning",
        status: "firing",
        fingerprint: "grafana:disk:node-1",
        labels: {},
        occurredAt: "2026-06-09T07:59:00.000Z",
      },
      rawPayload: {},
      rawHeaders: {},
    });
    const destination = await services.destinations.createDestination({
      name: "Ops webhook",
      kind: "generic_webhook",
      config: {
        url: "https://example.test/webhook",
        template: { mode: "text", text: "{{event.title}} {{tocsin.eventUrl}}" },
      },
    });

    const result = await services.destinations.previewDestination({
      id: destination.id,
      sampleEventId: event.id,
    });

    expect(result.context.tocsin.eventUrl).toBe(
      "https://tocsin.example.test/events/event-url-sample",
    );

    // The built-in sample is not a stored Event, so it must not produce a link
    // that would 404 in a real notification.
    const builtIn = await services.destinations.previewDestination({ id: destination.id });

    expect(builtIn.context.tocsin.eventUrl).toBe("");

    await store.close();
  });

  it("previews the upstream group size a delivery would carry", async () => {
    const { store, services } = await createTestContext();
    const source = await services.sources.createSource({ name: "Grafana", provider: "grafana" });
    const event = await store.intake.recordEvent({
      id: "event-group-sample",
      sourceId: source.source.id,
      idempotencyKey: null,
      normalized: {
        title: "Disk almost full",
        message: "/var at 98%",
        severity: "warning",
        status: "firing",
        fingerprint: "grafana:disk:node-1",
        labels: {},
        occurredAt: "2026-06-09T07:59:00.000Z",
      },
      providerMetadata: { alertCount: 3 },
      rawPayload: {},
      rawHeaders: {},
    });
    const destination = await services.destinations.createDestination({
      name: "Ops webhook",
      kind: "generic_webhook",
      config: {
        url: "https://example.test/webhook",
        template: { mode: "text", text: "{{event.title}} ({{tocsin.alertCount}})" },
      },
    });

    const historical = await services.destinations.previewDestination({
      id: destination.id,
      sampleEventId: event.id,
    });

    expect(historical.context.tocsin.alertCount).toBe("3");

    // The built-in sample has no upstream group, so the variable stays empty
    // instead of pretending the group carried one alert.
    const builtIn = await services.destinations.previewDestination({ id: destination.id });

    expect(builtIn.context.tocsin.alertCount).toBe("");

    await store.close();
  });

  it("previews destination templates without sending or returning config", async () => {
    const { store, services } = await createTestContext();
    const destination = await services.destinations.createDestination({
      name: "Ops webhook",
      kind: "generic_webhook",
      config: {
        url: "https://example.test/webhook",
        template: { mode: "text", text: "{{event.title}} from {{source.name}}" },
      },
    });

    const result = await services.destinations.previewDestination({ id: destination.id });

    expect(result.destination).toEqual({
      id: destination.id,
      name: destination.name,
      kind: destination.kind,
      enabled: destination.enabled,
    });
    expect(result.sample).toEqual({
      kind: "built_in",
      eventId: "preview-event",
      source: {
        id: "preview-source",
        name: "Tocsin preview",
        provider: "generic",
        enabled: true,
      },
      receivedAt: null,
    });
    expect(result.context.event.title).toBe("Tocsin destination test");
    expect(result.context.source.name).toBe("Tocsin preview");
    expect(result.normalizedEvent.title).toBe("Tocsin destination test");
    expect(result.diagnostics).toEqual([]);
    expect(result.rawPayloadReference).toBeNull();
    expect(result.renderedPayload).toMatchObject({
      eventId: "preview-event",
      message: "Tocsin destination test from Tocsin preview",
    });
    expect(result).not.toHaveProperty("config");
    expect(JSON.stringify(result)).not.toContain("https://example.test/webhook");

    const emailDestination = await services.destinations.createDestination({
      name: "Email SRE",
      kind: "email",
      config: {
        endpointUrl: "https://mail-gateway.example.test/send",
        to: ["sre@example.test"],
        from: "tocsin@example.test",
        replyTo: "ops@example.test",
      },
    });
    const emailPreview = await services.destinations.previewDestination({
      id: emailDestination.id,
    });

    expect(emailPreview.renderedPayload).toMatchObject({
      subject: "[Info Firing] Tocsin destination test",
    });
    expect(emailPreview.renderedPayload).not.toHaveProperty("to");
    expect(emailPreview.renderedPayload).not.toHaveProperty("from");
    expect(emailPreview.renderedPayload).not.toHaveProperty("replyTo");
    expect(JSON.stringify(emailPreview)).not.toContain("https://mail-gateway.example.test/send");
    expect(JSON.stringify(emailPreview)).not.toContain("sre@example.test");

    await store.close();
  });

  it("redacts rendered payloads for every destination kind", async () => {
    const { store, services } = await createTestContext();

    for (const kind of DestinationKindSchema.options) {
      const { config, marker } = destinationRenderedPayloadSecretCases[kind];
      const result = await services.destinations.previewDestinationDraft({
        name: `${kind} redaction draft`,
        kind,
        config,
      });
      const rendered = JSON.stringify(result.renderedPayload);

      expect({
        kind,
        containsSecret: rendered.includes(marker),
        redacted: rendered.includes("[REDACTED]"),
      }).toEqual({ kind, containsSecret: false, redacted: true });
    }

    await store.close();
  });

  it("previews destination templates with historical event samples and redacted raw reference", async () => {
    const { store, services } = await createTestContext();
    const source = await services.sources.createSource({
      name: "SigNoz",
      provider: "signoz",
    });
    const event = await store.intake.recordEvent({
      id: "event-template-preview",
      sourceId: source.source.id,
      idempotencyKey: null,
      normalized: {
        title: "High CPU",
        message: "CPU above threshold",
        severity: "critical",
        status: "firing",
        fingerprint: "signoz:cpu:api",
        labels: {
          service: "api",
          environment: "prod",
        },
        occurredAt: "2026-06-09T07:59:00.000Z",
      },
      rawPayload: {
        alertname: "HighCPU",
        token: "raw-token",
        nested: {
          signingSecret: "raw-signing-secret",
          safe: "visible",
        },
      },
      rawHeaders: {
        authorization: "Bearer source-token",
        "x-signoz": "visible-header",
      },
    });
    const destination = await services.destinations.createDestination({
      name: "Ops webhook",
      kind: "generic_webhook",
      config: {
        url: "https://example.test/webhook-secret",
        template: {
          mode: "text",
          text: "{{event.title}} {{payload.alertname}} {{payload.nested.safe}} token={{payload.token}}",
        },
      },
    });

    const result = await services.destinations.previewDestination({
      id: destination.id,
      sampleEventId: event.id,
    });

    expect(result.sample).toEqual({
      kind: "historical_event",
      eventId: event.id,
      source: source.source,
      receivedAt: now,
    });
    expect(result.context.event.id).toBe(event.id);
    expect(result.context.event.labels.service).toBe("api");
    expect(result.context.payload).toEqual({
      alertname: "HighCPU",
      token: "[REDACTED]",
      nested: {
        signingSecret: "[REDACTED]",
        safe: "visible",
      },
    });
    expect(result.normalizedEvent.title).toBe("High CPU");
    expect(result.renderedPayload).toMatchObject({
      eventId: event.id,
      message: "High CPU HighCPU visible token=[REDACTED]",
    });
    expect(result.rawPayloadReference).toEqual({
      eventId: event.id,
      payload: {
        alertname: "HighCPU",
        token: "[REDACTED]",
        nested: {
          signingSecret: "[REDACTED]",
          safe: "visible",
        },
      },
      headers: {
        authorization: "[REDACTED]",
        "x-signoz": "visible-header",
      },
    });
    expect(JSON.stringify(result)).not.toContain("raw-token");
    expect(JSON.stringify(result)).not.toContain("raw-signing-secret");
    expect(JSON.stringify(result)).not.toContain("source-token");
    expect(JSON.stringify(result)).not.toContain("https://example.test/webhook-secret");

    await store.close();
  });

  it("previews Feishu card destination templates without signing fields", async () => {
    const { store, services } = await createTestContext();
    const destination = await services.destinations.createDestination({
      name: "Ops Feishu",
      kind: "feishu",
      config: {
        webhookUrl: "https://open.feishu.cn/webhook/secret-url",
        signSecret: "feishu-sign-secret",
        template: {
          mode: "feishu_card",
          card: {
            header: {
              title: {
                tag: "plain_text",
                content: "[{{event.severity}}] {{event.title}}",
              },
            },
            elements: [
              {
                tag: "div",
                text: {
                  tag: "lark_md",
                  content: "{{event.message}}\nsource={{source.name}}",
                },
              },
            ],
          },
        },
      },
    });

    const result = await services.destinations.previewDestination({ id: destination.id });

    expect(result.renderedPayload).toEqual({
      msg_type: "interactive",
      card: {
        header: {
          title: {
            tag: "plain_text",
            content: "[info] Tocsin destination test",
          },
        },
        elements: [
          {
            tag: "div",
            text: {
              tag: "lark_md",
              content: "This is a test alert generated from Tocsin Console.\nsource=Tocsin preview",
            },
          },
        ],
      },
    });
    expect(JSON.stringify(result)).not.toContain("https://open.feishu.cn/webhook/secret-url");
    expect(JSON.stringify(result)).not.toContain("feishu-sign-secret");
    expect(result.renderedPayload).not.toHaveProperty("timestamp");
    expect(result.renderedPayload).not.toHaveProperty("sign");

    await store.close();
  });

  it("returns template diagnostics when draft preview rendering fails", async () => {
    const { store, services } = await createTestContext();
    const result = await services.destinations.previewDestinationDraft({
      name: "Ops Feishu",
      kind: "feishu",
      config: {
        webhookUrl: "https://open.feishu.cn/webhook/secret-url",
        template: {
          mode: "feishu_card",
          card: {
            elements: [
              {
                tag: "div",
                text: {
                  tag: "lark_md",
                  content: "{{raw.secret}}",
                },
              },
            ],
          },
        },
      },
    });

    expect(result.diagnostics).toEqual([
      {
        severity: "error",
        path: "template.card.elements.0.text.content",
        variable: "raw.secret",
        message: "Destination template contains unknown variable: raw.secret",
      },
    ]);
    expect(result.renderedPayload).toEqual({
      templateError: {
        diagnostics: [
          {
            severity: "error",
            path: "template.card.elements.0.text.content",
            variable: "raw.secret",
            message: "Destination template contains unknown variable: raw.secret",
          },
        ],
      },
    });
    expect(JSON.stringify(result)).not.toContain("https://open.feishu.cn/webhook/secret-url");

    await store.close();
  });

  it("previews draft destination templates before saving config", async () => {
    const { store, services } = await createTestContext();

    const result = await services.destinations.previewDestinationDraft({
      name: "Unsaved webhook",
      kind: "generic_webhook",
      config: {
        url: "https://relay.example.test/draft-secret",
        template: { mode: "text", text: "{{event.title}} from {{source.name}}" },
      },
    });

    expect(result.destination).toEqual({
      id: "preview-destination",
      name: "Unsaved webhook",
      kind: "generic_webhook",
      enabled: true,
    });
    expect(result.renderedPayload).toMatchObject({
      message: "Tocsin destination test from Tocsin preview",
    });
    expect(await services.destinations.listDestinations()).toEqual([]);
    expect(result).not.toHaveProperty("config");
    expect(JSON.stringify(result)).not.toContain("https://relay.example.test/draft-secret");

    await store.close();
  });

  it("updates destination metadata and template patches without clearing server-side secrets", async () => {
    const { store, services } = await createTestContext();
    const destination = await services.destinations.createDestination({
      name: "Ops webhook",
      kind: "generic_webhook",
      config: {
        url: "https://example.test/webhook-secret",
        method: "PATCH",
        headers: {
          Authorization: "Bearer relay-secret",
          "X-Team": "sre",
        },
        template: { mode: "text", text: "{{event.title}}" },
      },
    });

    const preview = await services.destinations.previewDestinationUpdate({
      id: destination.id,
      name: "Renamed webhook",
      config: {
        headers: {
          "X-Team": "platform",
        },
        template: { mode: "text", text: "{{event.title}} from {{destination.name}}" },
      },
    });
    const updated = await services.destinations.updateDestination({
      id: destination.id,
      name: "Renamed webhook",
      config: {
        headers: {
          "X-Team": "platform",
        },
        template: { mode: "text", text: "{{event.title}} from {{destination.name}}" },
      },
    });

    expect(preview.destination).toEqual({
      id: destination.id,
      name: "Renamed webhook",
      kind: "generic_webhook",
      enabled: true,
    });
    expect(preview.renderedPayload).toMatchObject({
      message: "Tocsin destination test from Renamed webhook",
    });
    expect(JSON.stringify(preview)).not.toContain("https://example.test/webhook-secret");
    expect(JSON.stringify(preview)).not.toContain("Bearer relay-secret");
    expect(updated.name).toBe("Renamed webhook");
    expect((await store.destinations.get(destination.id))?.config).toEqual({
      url: "https://example.test/webhook-secret",
      method: "PATCH",
      idempotencyKey: false,
      headers: {
        Authorization: "Bearer relay-secret",
        "X-Team": "platform",
      },
      template: { mode: "text", text: "{{event.title}} from {{destination.name}}" },
    });

    await store.close();
  });

  it("rejects destination kind changes that do not provide compatible config", async () => {
    const { store, services } = await createTestContext();
    const destination = await services.destinations.createDestination({
      name: "Ops webhook",
      kind: "generic_webhook",
      config: {
        url: "https://example.test/webhook-secret",
      },
    });

    await expect(
      services.destinations.updateDestination({
        id: destination.id,
        kind: "slack",
      }),
    ).rejects.toThrow("Invalid input");
    expect(await store.destinations.get(destination.id)).toMatchObject({
      kind: "generic_webhook",
      config: {
        url: "https://example.test/webhook-secret",
        method: "POST",
      },
    });

    await store.close();
  });

  it("updates app settings through the configuration service", async () => {
    const { store, services } = await createTestContext();

    expect((await services.settings.getAppSettings()).rawPayloadRetentionDays).toBe(30);

    const settings = await services.settings.updateAppSettings({
      rawPayloadRetentionDays: 7,
    });

    expect(settings.rawPayloadRetentionDays).toBe(7);
    expect((await services.settings.getAppSettings()).rawPayloadRetentionDays).toBe(7);

    await store.close();
  });

  it("keeps the stored retention window when a pause toggle omits it", async () => {
    const { store, services } = await createTestContext();

    await services.settings.updateAppSettings({ rawPayloadRetentionDays: 7 });

    // Pause/resume entry points render from a settings snapshot and send only
    // the pause flag. A retention change made in another tab must survive them
    // instead of being written back from the stale snapshot.
    const paused = await services.settings.updateAppSettings({ deliveryPaused: true });
    expect(paused.rawPayloadRetentionDays).toBe(7);
    expect(paused.deliveryPaused).toBe(true);

    const resumed = await services.settings.updateAppSettings({ deliveryPaused: false });
    expect(resumed.rawPayloadRetentionDays).toBe(7);
    expect(resumed.deliveryPaused).toBe(false);

    // An explicit retention update still applies without touching the pause.
    const updated = await services.settings.updateAppSettings({ rawPayloadRetentionDays: 14 });
    expect(updated.rawPayloadRetentionDays).toBe(14);
    expect(updated.deliveryPaused).toBe(false);

    await store.close();
  });

  it("records who paused and resumed delivery, and the completed interval", async () => {
    const { store, services } = await createTestContext();

    const paused = await services.settings.updateAppSettings(
      { deliveryPaused: true },
      { actor: "oncall@example.test" },
    );
    expect(paused).toMatchObject({
      deliveryPaused: true,
      deliveryPausedBy: "oncall@example.test",
      lastDeliveryPause: null,
    });

    const resumed = await services.settings.updateAppSettings(
      { deliveryPaused: false },
      { actor: "lead@example.test" },
    );
    expect(resumed).toMatchObject({
      deliveryPaused: false,
      deliveryPausedBy: null,
      lastDeliveryPause: {
        startedAt: expect.any(String),
        endedAt: expect.any(String),
        pausedBy: "oncall@example.test",
        resumedBy: "lead@example.test",
      },
    });

    // An unattributed write (configuration import or an in-process caller) still
    // records the interval, just without naming an operator.
    await services.settings.updateAppSettings({ deliveryPaused: true });
    const unattributed = await services.settings.updateAppSettings({ deliveryPaused: false });
    expect(unattributed.lastDeliveryPause).toMatchObject({
      pausedBy: null,
      resumedBy: null,
    });

    await store.close();
  });

  it("exports portable TOML without plaintext destination secrets by default", async () => {
    const { store, services } = await createTestContext();
    const source = await services.sources.createSource({
      name: "Grafana prod",
      provider: "grafana",
      config: {
        team: "sre",
      },
    });
    const destination = await services.destinations.createDestination({
      name: "Slack SRE",
      kind: "slack",
      config: {
        webhookUrl: "https://hooks.slack.com/services/secret",
      },
    });
    await services.routes.createRoute({
      name: "Critical route",
      rule: {
        sourceIds: [source.source.id],
        severities: ["critical"],
      },
      destinationIds: [destination.id],
    });

    const toml = await services.portability.exportToml({
      now: () => now,
    });

    expect(toml).toContain("[settings]");
    expect(toml).toContain("raw_payload_retention_days = 30");
    expect(toml).toContain("[[sources]]");
    expect(toml).toContain("[[destinations]]");
    expect(toml).toContain("[[routes]]");
    expect(toml).not.toContain("https://hooks.slack.com/services/secret");
    expect(toml).toContain("TOCSIN_DEST_");
    expect(toml).toContain("webhookUrl");
    expect(parseToml(toml)).toMatchObject({
      settings: {
        schema_version: "tocsin.config.v1",
        raw_payload_retention_days: 30,
      },
    });
    expect(toml).not.toContain("tocsin_src_test_token");
    expect(toml).not.toContain(hashSourceToken("tocsin_src_test_token"));

    await store.close();
  });

  it("exports portable JSON without plaintext secrets by default", async () => {
    const { store, services } = await createTestContext();
    const source = await services.sources.createSource({
      name: "Signed upstream",
      provider: "generic",
      config: {
        signingSecret: "source-signing-secret",
        team: "sre",
      },
    });
    const destination = await services.destinations.createDestination({
      name: "Slack SRE",
      kind: "slack",
      config: {
        webhookUrl: "https://hooks.slack.com/services/secret",
      },
    });
    await services.routes.createRoute({
      name: "Critical route",
      rule: {
        sourceIds: [source.source.id],
        severities: ["critical"],
      },
      destinationIds: [destination.id],
    });

    const json = await services.portability.exportJson({
      now: () => now,
    });

    expect(json.endsWith("\n")).toBe(true);
    expect(json).not.toContain("source-signing-secret");
    expect(json).not.toContain("https://hooks.slack.com/services/secret");
    expect(json).not.toContain("tocsin_src_test_token");
    expect(json).not.toContain(hashSourceToken("tocsin_src_test_token"));
    expect(JSON.parse(json)).toMatchObject({
      settings: {
        schema_version: "tocsin.config.v1",
        exported_at: now,
        include_secrets: false,
        raw_payload_retention_days: 30,
      },
      sources: [
        {
          id: source.source.id,
          config: { team: "sre" },
          secret_refs: {
            signingSecret: {
              env: expect.stringContaining("TOCSIN_SOURCE_"),
            },
          },
        },
      ],
      destinations: [
        {
          id: destination.id,
          config: {},
          secret_refs: {
            webhookUrl: {
              env: expect.stringContaining("TOCSIN_DEST_"),
            },
          },
        },
      ],
      routes: [
        {
          name: "Critical route",
          destination_ids: [destination.id],
        },
      ],
    });

    await store.close();
  });

  it.each(registeredDestinationKinds)(
    "omits secret fields of every %s destination from exported configuration",
    async (kind) => {
      const { store, services } = await createTestContext();
      const fixture = destinationSecretCases[kind];
      const destination = await services.destinations.createDestination({
        name: `${kind} destination`,
        kind,
        config: fixture.config,
      });

      const toml = await services.portability.exportToml({
        now: () => now,
      });
      const json = await services.portability.exportJson({
        now: () => now,
      });
      const document = JSON.parse(json) as TomlDocument;
      const exported = document.destinations.find((entry) => entry.id === destination.id);

      expect(exported).toMatchObject({
        kind,
        config: fixture.preserved,
        secret_refs: Object.fromEntries(
          fixture.secretPaths.map((path) => [
            path,
            { env: expect.stringContaining("TOCSIN_DEST_") },
          ]),
        ),
      });

      for (const secret of fixture.secretValues) {
        expect(toml).not.toContain(secret);
        expect(json).not.toContain(secret);
      }

      await store.close();
    },
  );

  it("round-trips sources, routes, destinations, and settings through TOML", async () => {
    const first = await createTestContext();
    const source = await first.services.sources.createSource({
      name: "Grafana prod",
      provider: "grafana",
      config: {
        team: "sre",
      },
    });
    const destination = await first.services.destinations.createDestination({
      name: "Slack SRE",
      kind: "slack",
      config: {
        webhookUrl: "https://hooks.slack.com/services/secret",
      },
      secretRefs: {
        webhookUrl: {
          env: "SLACK_WEBHOOK_URL",
        },
      },
    });
    await first.services.routes.createRoute({
      name: "Critical route",
      rule: {
        sourceIds: [source.source.id],
        severities: ["critical"],
        labels: [{ key: "service", operator: "equals", value: "api" }],
      },
      destinationIds: [destination.id],
    });
    await first.services.settings.updateAppSettings({
      locale: "zh-Hans",
      timeZone: "Asia/Shanghai",
      rawPayloadRetentionDays: 7,
    });

    const toml = await first.services.portability.exportToml({
      now: () => now,
    });
    const second = await createTestContext();
    const result = await second.services.portability.importToml(toml, {
      env: {
        SLACK_WEBHOOK_URL: "https://hooks.slack.com/services/imported",
      },
    });

    expect(result.generatedSourceTokens).toEqual([
      {
        sourceId: source.source.id,
        sourceName: "Grafana prod",
        token: "tocsin_src_test_token",
      },
    ]);
    expect(await second.store.settings.get()).toEqual({
      locale: "zh-Hans",
      timeZone: "Asia/Shanghai",
      rawPayloadRetentionDays: 7,
      deliveryPaused: false,
      deliveryPausedAt: null,
      deliveryPausedBy: null,
      lastDeliveryPause: null,
    });
    expect(await second.store.sources.get(source.source.id)).toMatchObject({
      name: "Grafana prod",
      provider: "grafana",
      config: {
        team: "sre",
      },
    });
    expect(await second.store.destinations.get(destination.id)).toMatchObject({
      name: "Slack SRE",
      kind: "slack",
      config: {
        webhookUrl: "https://hooks.slack.com/services/imported",
      },
      secretRefs: {
        webhookUrl: {
          env: "SLACK_WEBHOOK_URL",
        },
      },
    });
    expect(await second.store.routes.list()).toEqual([
      expect.objectContaining({
        name: "Critical route",
        rule: expect.objectContaining({
          sourceIds: [source.source.id],
          severities: ["critical"],
          labels: [{ key: "service", operator: "equals", value: "api" }],
        }),
        destinationIds: [destination.id],
      }),
    ]);

    await first.store.close();
    await second.store.close();
  });

  it("round-trips Feishu dynamic template bindings through TOML", async () => {
    const first = await createTestContext();
    const destination = await first.services.destinations.createDestination({
      name: "Feishu SRE",
      kind: "feishu",
      config: {
        webhookUrl: "https://open.feishu.cn/open-apis/bot/v2/hook/private",
        template: {
          mode: "feishu_card",
          bindings: {
            statusColor: {
              select: "event.status",
              cases: {
                firing: "orange",
                resolved: "green",
                unknown: "grey",
              },
              fallback: "grey",
            },
          },
          card: {
            header: {
              template: "{{bindings.statusColor}}",
            },
          },
        },
      },
      secretRefs: {
        webhookUrl: {
          env: "FEISHU_WEBHOOK_URL",
        },
      },
    });
    const toml = await first.services.portability.exportToml({ now: () => now });
    const second = await createTestContext();

    await second.services.portability.importToml(toml, {
      env: {
        FEISHU_WEBHOOK_URL: "https://open.feishu.cn/open-apis/bot/v2/hook/imported",
      },
    });

    expect(await second.store.destinations.get(destination.id)).toMatchObject({
      kind: "feishu",
      config: {
        webhookUrl: "https://open.feishu.cn/open-apis/bot/v2/hook/imported",
        template: {
          mode: "feishu_card",
          bindings: {
            statusColor: {
              select: "event.status",
              cases: {
                firing: "orange",
                resolved: "green",
                unknown: "grey",
              },
              fallback: "grey",
            },
          },
          card: {
            header: {
              template: "{{bindings.statusColor}}",
            },
          },
        },
      },
    });

    await first.store.close();
    await second.store.close();
  });

  it("round-trips sources, routes, destinations, and settings through JSON", async () => {
    const first = await createTestContext();
    const source = await first.services.sources.createSource({
      name: "Grafana prod",
      provider: "grafana",
      config: {
        team: "sre",
      },
    });
    const destination = await first.services.destinations.createDestination({
      name: "Slack SRE",
      kind: "slack",
      config: {
        webhookUrl: "https://hooks.slack.com/services/secret",
      },
      secretRefs: {
        webhookUrl: {
          env: "SLACK_WEBHOOK_URL",
        },
      },
    });
    await first.services.routes.createRoute({
      name: "Critical route",
      rule: {
        sourceIds: [source.source.id],
        severities: ["critical"],
        labels: [{ key: "service", operator: "equals", value: "api" }],
      },
      destinationIds: [destination.id],
    });
    await first.services.settings.updateAppSettings({
      locale: "zh-Hans",
      timeZone: "Asia/Shanghai",
      rawPayloadRetentionDays: 7,
    });

    const json = await first.services.portability.exportJson({
      now: () => now,
    });
    const second = await createTestContext();
    const result = await second.services.portability.importJson(json, {
      env: {
        SLACK_WEBHOOK_URL: "https://hooks.slack.com/services/imported",
      },
    });

    expect(result.generatedSourceTokens).toEqual([
      {
        sourceId: source.source.id,
        sourceName: "Grafana prod",
        token: "tocsin_src_test_token",
      },
    ]);
    expect(await second.store.settings.get()).toEqual({
      locale: "zh-Hans",
      timeZone: "Asia/Shanghai",
      rawPayloadRetentionDays: 7,
      deliveryPaused: false,
      deliveryPausedAt: null,
      deliveryPausedBy: null,
      lastDeliveryPause: null,
    });
    expect(await second.store.sources.get(source.source.id)).toMatchObject({
      name: "Grafana prod",
      provider: "grafana",
      config: {
        team: "sre",
      },
    });
    expect(await second.store.destinations.get(destination.id)).toMatchObject({
      name: "Slack SRE",
      kind: "slack",
      config: {
        webhookUrl: "https://hooks.slack.com/services/imported",
      },
      secretRefs: {
        webhookUrl: {
          env: "SLACK_WEBHOOK_URL",
        },
      },
    });
    expect(await second.store.routes.list()).toEqual([
      expect.objectContaining({
        name: "Critical route",
        rule: expect.objectContaining({
          sourceIds: [source.source.id],
          severities: ["critical"],
          labels: [{ key: "service", operator: "equals", value: "api" }],
        }),
        destinationIds: [destination.id],
      }),
    ]);

    await first.store.close();
    await second.store.close();
  });

  it("rejects plaintext destination secret exports", async () => {
    const { store, services } = await createTestContext();

    await services.destinations.createDestination({
      name: "Slack SRE",
      kind: "slack",
      config: {
        webhookUrl: "https://hooks.slack.com/services/secret",
      },
    });

    await expect(
      services.portability.exportToml({
        includeSecrets: true,
        now: () => now,
      }),
    ).rejects.toThrow("Plaintext secret export is not supported");
    await expect(
      services.portability.exportJson({
        includeSecrets: true,
        now: () => now,
      }),
    ).rejects.toThrow("Plaintext secret export is not supported");

    await store.close();
  });

  it("exports every destination header as an environment reference", async () => {
    const { store, services } = await createTestContext();

    await services.destinations.createDestination({
      name: "Relay with auth",
      kind: "generic_webhook",
      config: {
        url: "https://relay.example.test/tocsin",
        headers: {
          Authorization: "Bearer relay-secret",
          "X-Custom-Auth": "Bearer custom-auth-secret",
          "X-Team": "sre",
        },
      },
    });

    const toml = await services.portability.exportToml({
      now: () => now,
    });

    expect(toml).not.toContain("https://relay.example.test/tocsin");
    expect(toml).not.toContain("Bearer relay-secret");
    expect(toml).not.toContain("Bearer custom-auth-secret");
    expect(toml).not.toContain('X-Team = "sre"');
    expect(toml).toContain("headers.Authorization");
    expect(toml).toContain("headers.X-Custom-Auth");
    expect(toml).toContain("headers.X-Team");
    expect(toml).toContain("TOCSIN_DEST_");

    await store.close();
  });

  it("exports source config and Feishu signing secrets without plaintext secret values", async () => {
    const { store, services } = await createTestContext();

    await services.sources.createSource({
      name: "Signed upstream",
      provider: "generic",
      config: {
        signingSecret: "source-signing-secret",
        team: "sre",
      },
    });
    await services.destinations.createDestination({
      name: "Feishu SRE",
      kind: "feishu",
      config: {
        webhookUrl: "https://open.feishu.cn/open-apis/bot/v2/hook/secret",
        signSecret: "feishu-signing-secret",
      },
    });

    const toml = await services.portability.exportToml({
      now: () => now,
    });

    expect(toml).not.toContain("source-signing-secret");
    expect(toml).not.toContain("https://open.feishu.cn/open-apis/bot/v2/hook/secret");
    expect(toml).not.toContain("feishu-signing-secret");
    expect(toml).toContain('team = "sre"');
    expect(toml).toContain("[sources.secret_refs.signingSecret]");
    expect(toml).toContain("TOCSIN_SOURCE_");
    expect(toml).toContain("signSecret");
    expect(toml).toContain("TOCSIN_DEST_");

    await store.close();
  });

  it("imports portable TOML and resolves destination secret references from env", async () => {
    const { store, services } = await createTestContext();
    const toml = [
      "[settings]",
      'schema_version = "tocsin.config.v1"',
      'exported_at = "2026-06-09T08:00:00.000Z"',
      "include_secrets = false",
      "raw_payload_retention_days = 14",
      "",
      "[[sources]]",
      'id = "source-imported"',
      'name = "Imported source"',
      'provider = "generic"',
      "enabled = true",
      "",
      "[[destinations]]",
      'id = "destination-imported"',
      'name = "Imported Slack"',
      'kind = "slack"',
      "enabled = true",
      "",
      "[destinations.secret_refs.webhookUrl]",
      'env = "SLACK_WEBHOOK_URL"',
      "",
      "[[routes]]",
      'id = "route-imported"',
      'name = "Imported critical route"',
      "enabled = true",
      'destination_ids = ["destination-imported"]',
      "",
      "[routes.rule]",
      'source_ids = ["source-imported"]',
      'severities = ["critical"]',
      "",
    ].join("\n");

    const result = await services.portability.importToml(toml, {
      env: {
        SLACK_WEBHOOK_URL: "https://hooks.slack.com/services/imported",
      },
    });

    expect(result.generatedSourceTokens).toEqual([
      {
        sourceId: "source-imported",
        sourceName: "Imported source",
        token: "tocsin_src_test_token",
      },
    ]);
    expect(await store.sources.get("source-imported")).toMatchObject({
      name: "Imported source",
      provider: "generic",
      tokenHash: hashSourceToken("tocsin_src_test_token"),
    });
    expect(await store.destinations.get("destination-imported")).toMatchObject({
      name: "Imported Slack",
      kind: "slack",
      config: {
        webhookUrl: "https://hooks.slack.com/services/imported",
      },
      secretRefs: {
        webhookUrl: {
          env: "SLACK_WEBHOOK_URL",
        },
      },
    });
    expect(await store.routes.get("route-imported")).toMatchObject({
      name: "Imported critical route",
      destinationIds: ["destination-imported"],
      rule: {
        sourceIds: ["source-imported"],
        severities: ["critical"],
      },
    });
    expect((await store.settings.get()).rawPayloadRetentionDays).toBe(14);

    await store.close();
  });

  it("imports portable TOML and resolves source secret references from env", async () => {
    const { store, services } = await createTestContext();
    const toml = [
      "[settings]",
      'schema_version = "tocsin.config.v1"',
      'exported_at = "2026-06-09T08:00:00.000Z"',
      "include_secrets = false",
      "raw_payload_retention_days = 14",
      "",
      "[[sources]]",
      'id = "source-signed"',
      'name = "Signed source"',
      'provider = "generic"',
      "enabled = true",
      "",
      "[sources.config]",
      'team = "sre"',
      "",
      "[sources.secret_refs.signingSecret]",
      'env = "SOURCE_SIGNING_SECRET"',
      "",
    ].join("\n");

    await services.portability.importToml(toml, {
      env: {
        SOURCE_SIGNING_SECRET: "provider-shared-secret",
      },
    });

    expect(await store.sources.get("source-signed")).toMatchObject({
      name: "Signed source",
      provider: "generic",
      config: {
        team: "sre",
        signingSecret: "provider-shared-secret",
      },
    });

    await store.close();
  });

  it("imports nested destination header secret references from env", async () => {
    const { store, services } = await createTestContext();
    const toml = [
      "[settings]",
      'schema_version = "tocsin.config.v1"',
      'exported_at = "2026-06-09T08:00:00.000Z"',
      "include_secrets = false",
      "raw_payload_retention_days = 14",
      "",
      "[[destinations]]",
      'id = "destination-relay"',
      'name = "Relay with auth"',
      'kind = "generic_webhook"',
      "enabled = true",
      "",
      "[destinations.config.headers]",
      'X-Team = "sre"',
      "",
      "[destinations.secret_refs.url]",
      'env = "RELAY_URL"',
      "",
      '[destinations.secret_refs."headers.Authorization"]',
      'env = "RELAY_AUTH"',
      "",
    ].join("\n");

    await services.portability.importToml(toml, {
      env: {
        RELAY_URL: "https://relay.example.test/tocsin",
        RELAY_AUTH: "Bearer relay-secret",
      },
    });

    expect(await store.destinations.get("destination-relay")).toMatchObject({
      name: "Relay with auth",
      kind: "generic_webhook",
      config: {
        url: "https://relay.example.test/tocsin",
        method: "POST",
        headers: {
          Authorization: "Bearer relay-secret",
          "X-Team": "sre",
        },
      },
      secretRefs: {
        url: {
          env: "RELAY_URL",
        },
        "headers.Authorization": {
          env: "RELAY_AUTH",
        },
      },
    });

    await store.close();
  });

  it("rejects imported destination configs that fail adapter validation before changing stored configuration", async () => {
    const { store, services } = await createTestContext();
    const toml = [
      "[settings]",
      'schema_version = "tocsin.config.v1"',
      "include_secrets = false",
      "raw_payload_retention_days = 14",
      "",
      "[[sources]]",
      'id = "source-imported"',
      'name = "Imported source"',
      'provider = "generic"',
      "enabled = true",
      "",
      "[[destinations]]",
      'id = "destination-broken"',
      'name = "Broken Slack"',
      'kind = "slack"',
      "enabled = true",
      "",
      "[destinations.config]",
      'webhookUrl = "not a url"',
      "",
    ].join("\n");

    await expect(services.portability.importToml(toml)).rejects.toThrow("Invalid URL");
    expect((await store.settings.get()).rawPayloadRetentionDays).toBe(30);
    expect(await store.sources.list()).toEqual([]);
    expect(await store.destinations.list()).toEqual([]);

    await store.close();
  });

  it("rejects imported routes without destinations before changing stored configuration", async () => {
    const { store, services } = await createTestContext();
    const toml = [
      "[settings]",
      'schema_version = "tocsin.config.v1"',
      'exported_at = "2026-06-09T08:00:00.000Z"',
      "include_secrets = false",
      "raw_payload_retention_days = 14",
      "",
      "[[routes]]",
      'id = "route-without-destinations"',
      'name = "Broken route"',
      "enabled = true",
      "destination_ids = []",
      "",
      "[routes.rule]",
      'severities = ["critical"]',
      "",
    ].join("\n");

    await expect(services.portability.importToml(toml)).rejects.toThrow("Too small");
    expect(await store.routes.list()).toEqual([]);
    expect((await store.settings.get()).rawPayloadRetentionDays).toBe(30);

    await store.close();
  });

  it("rejects portable TOML that claims to include plaintext secrets", async () => {
    const { store, services } = await createTestContext();
    const toml = [
      "[settings]",
      'schema_version = "tocsin.config.v1"',
      'exported_at = "2026-06-09T08:00:00.000Z"',
      "include_secrets = true",
      "raw_payload_retention_days = 14",
      "",
    ].join("\n");

    await expect(services.portability.importToml(toml)).rejects.toThrow("Invalid input");
    expect((await store.settings.get()).rawPayloadRetentionDays).toBe(30);

    await store.close();
  });

  it("rejects invalid TOML before changing stored configuration", async () => {
    const { store, services } = await createTestContext();

    await expect(services.portability.importToml("[settings")).rejects.toThrow(
      "Invalid TOML document",
    );
    expect((await store.settings.get()).rawPayloadRetentionDays).toBe(30);
    expect(await store.sources.list()).toEqual([]);

    await store.close();
  });

  it("rejects unknown TOML keys before changing stored configuration", async () => {
    const { store, services } = await createTestContext();
    const toml = [
      "[settings]",
      'schema_version = "tocsin.config.v1"',
      "include_secrets = false",
      "raw_payload_retention_days = 14",
      "unexpected = true",
      "",
    ].join("\n");

    await expect(services.portability.importToml(toml)).rejects.toThrow("Unrecognized key");
    expect((await store.settings.get()).rawPayloadRetentionDays).toBe(30);

    await store.close();
  });

  it("rejects unknown providers and destination kinds before changing stored configuration", async () => {
    const { store, services } = await createTestContext();
    const unknownProviderToml = [
      "[settings]",
      'schema_version = "tocsin.config.v1"',
      "include_secrets = false",
      "raw_payload_retention_days = 14",
      "",
      "[[sources]]",
      'id = "source-unknown"',
      'name = "Unknown"',
      'provider = "pagerduty"',
      "enabled = true",
      "",
    ].join("\n");
    const unknownDestinationToml = [
      "[settings]",
      'schema_version = "tocsin.config.v1"',
      "include_secrets = false",
      "raw_payload_retention_days = 14",
      "",
      "[[destinations]]",
      'id = "destination-unknown"',
      'name = "Unknown"',
      'kind = "sms"',
      "enabled = true",
      "",
    ].join("\n");

    await expect(services.portability.importToml(unknownProviderToml)).rejects.toThrow(
      "Invalid option",
    );
    await expect(services.portability.importToml(unknownDestinationToml)).rejects.toThrow(
      "Invalid option",
    );
    expect((await store.settings.get()).rawPayloadRetentionDays).toBe(30);
    expect(await store.sources.list()).toEqual([]);
    expect(await store.destinations.list()).toEqual([]);

    await store.close();
  });

  it("rejects missing environment variables for secret references before changing stored configuration", async () => {
    const { store, services } = await createTestContext();
    const toml = [
      "[settings]",
      'schema_version = "tocsin.config.v1"',
      "include_secrets = false",
      "raw_payload_retention_days = 14",
      "",
      "[[destinations]]",
      'id = "destination-slack"',
      'name = "Slack SRE"',
      'kind = "slack"',
      "enabled = true",
      "",
      "[destinations.secret_refs.webhookUrl]",
      'env = "SLACK_WEBHOOK_URL"',
      "",
    ].join("\n");

    await expect(services.portability.importToml(toml, { env: {} })).rejects.toThrow(
      "Missing environment variable for destination secret: SLACK_WEBHOOK_URL",
    );
    expect(await store.destinations.list()).toEqual([]);
    expect((await store.settings.get()).rawPayloadRetentionDays).toBe(30);

    await store.close();
  });

  it("rejects missing source secret environment variables before changing stored configuration", async () => {
    const { store, services } = await createTestContext();
    const toml = [
      "[settings]",
      'schema_version = "tocsin.config.v1"',
      "include_secrets = false",
      "raw_payload_retention_days = 14",
      "",
      "[[sources]]",
      'id = "source-signed"',
      'name = "Signed source"',
      'provider = "generic"',
      "enabled = true",
      "",
      "[sources.secret_refs.signingSecret]",
      'env = "SOURCE_SIGNING_SECRET"',
      "",
    ].join("\n");

    await expect(services.portability.importToml(toml, { env: {} })).rejects.toThrow(
      "Missing environment variable for source secret: SOURCE_SIGNING_SECRET",
    );
    expect(await store.sources.list()).toEqual([]);
    expect((await store.settings.get()).rawPayloadRetentionDays).toBe(30);

    await store.close();
  });

  it("rejects the redaction placeholder wherever a credential would be stored", async () => {
    const { store, services } = await createTestContext();
    const settings = [
      "[settings]",
      'schema_version = "tocsin.config.v1"',
      "include_secrets = false",
      "raw_payload_retention_days = 14",
      "",
    ];

    // A redacted export renders the secret as `[REDACTED]`; importing that
    // literal would replace the stored credential and break delivery later.
    const envPlaceholder = [
      ...settings,
      "[[destinations]]",
      'id = "destination-slack"',
      'name = "Slack SRE"',
      'kind = "slack"',
      "enabled = true",
      "",
      "[destinations.secret_refs.webhookUrl]",
      'env = "SLACK_WEBHOOK_URL"',
      "",
    ].join("\n");

    await expect(
      services.portability.importToml(envPlaceholder, {
        env: { SLACK_WEBHOOK_URL: "[REDACTED]" },
      }),
    ).rejects.toThrow("destination secret at webhookUrl is the redaction placeholder [REDACTED]");

    const configPlaceholder = [
      ...settings,
      "[[destinations]]",
      'id = "destination-slack"',
      'name = "Slack SRE"',
      'kind = "slack"',
      "enabled = true",
      "",
      "[destinations.config]",
      'webhookUrl = "[REDACTED]"',
      "",
    ].join("\n");

    await expect(services.portability.importToml(configPlaceholder)).rejects.toThrow(
      "destination secret at webhookUrl is the redaction placeholder [REDACTED]",
    );

    const sourcePlaceholder = [
      ...settings,
      "[[sources]]",
      'id = "source-1"',
      'name = "Signed source"',
      'provider = "generic"',
      "enabled = true",
      "",
      "[sources.config]",
      'signingSecret = "[REDACTED]"',
      "",
    ].join("\n");

    await expect(services.portability.importToml(sourcePlaceholder)).rejects.toThrow(
      "source secret at signingSecret is the redaction placeholder [REDACTED]",
    );

    const feishuAppPlaceholder = [
      ...settings,
      "[[feishu_apps]]",
      'id = "app-1"',
      'name = "Feishu bot"',
      'app_id = "cli_test"',
      'app_secret = "[REDACTED]"',
      "",
    ].join("\n");

    await expect(services.portability.importToml(feishuAppPlaceholder)).rejects.toThrow(
      'Feishu app "Feishu bot" secret is the redaction placeholder [REDACTED]',
    );

    expect(await store.sources.list()).toEqual([]);
    expect(await store.destinations.list()).toEqual([]);
    expect(await store.feishuApps.list()).toEqual([]);
    expect((await store.settings.get()).rawPayloadRetentionDays).toBe(30);

    await store.close();
  });

  it("rejects route configuration that references unknown destinations", async () => {
    const { store, services } = await createTestContext();
    const destination = await services.destinations.createDestination({
      name: "Ops webhook",
      kind: "generic_webhook",
      config: {
        url: "https://example.test/webhook",
      },
    });
    const route = await services.routes.createRoute({
      name: "Known destination route",
      destinationIds: [destination.id],
    });

    await expect(
      services.routes.createRoute({
        name: "Broken route",
        destinationIds: ["destination-missing"],
      }),
    ).rejects.toThrow("Unknown destination IDs: destination-missing");
    await expect(
      services.routes.updateRoute({
        id: route.id,
        destinationIds: [destination.id, "destination-missing"],
      }),
    ).rejects.toThrow("Unknown destination IDs: destination-missing");
    expect((await store.routes.get(route.id))?.destinationIds).toEqual([destination.id]);

    await store.close();
  });

  it("rejects route configuration with duplicate destinations", async () => {
    const { store, services } = await createTestContext();
    const destination = await services.destinations.createDestination({
      name: "Ops webhook",
      kind: "generic_webhook",
      config: {
        url: "https://example.test/webhook",
      },
    });

    await expect(
      services.routes.createRoute({
        name: "Duplicate destination route",
        destinationIds: [destination.id, destination.id],
      }),
    ).rejects.toThrow("Route destination IDs must be unique");
    expect(await store.routes.list()).toEqual([]);

    await store.close();
  });

  it("deletes source references without widening route matching", async () => {
    const { store, services } = await createTestContext();
    const grafana = await services.sources.createSource({
      name: "Grafana prod",
      provider: "grafana",
    });
    const signoz = await services.sources.createSource({
      name: "SigNoz prod",
      provider: "signoz",
    });
    const destination = await services.destinations.createDestination({
      name: "Ops webhook",
      kind: "generic_webhook",
      config: {
        url: "https://example.test/webhook",
      },
    });
    const directRoute = await services.routes.createRoute({
      name: "Grafana only",
      rule: {
        sourceIds: [grafana.source.id],
      },
      destinationIds: [destination.id],
    });
    const sharedRoute = await services.routes.createRoute({
      name: "Grafana and SigNoz",
      rule: {
        sourceIds: [grafana.source.id, signoz.source.id],
      },
      destinationIds: [destination.id],
    });
    const catchAllRoute = await services.routes.createRoute({
      name: "Catch all",
      destinationIds: [destination.id],
    });

    await services.sources.deleteSource({ id: grafana.source.id });

    expect(await store.sources.get(grafana.source.id)).toBeNull();
    expect(await store.routes.get(directRoute.id)).toBeNull();
    expect(await store.routes.get(sharedRoute.id)).toMatchObject({
      rule: expect.objectContaining({
        sourceIds: [signoz.source.id],
      }),
    });
    expect(await store.routes.get(catchAllRoute.id)).toMatchObject({
      rule: expect.objectContaining({
        sourceIds: [],
      }),
    });

    await store.close();
  });

  it("deletes destination references and drops routes with no remaining targets", async () => {
    const { store, services } = await createTestContext();
    const primary = await services.destinations.createDestination({
      name: "Primary webhook",
      kind: "generic_webhook",
      config: {
        url: "https://example.test/primary",
      },
    });
    const audit = await services.destinations.createDestination({
      name: "Audit webhook",
      kind: "generic_webhook",
      config: {
        url: "https://example.test/audit",
      },
    });
    const directRoute = await services.routes.createRoute({
      name: "Primary only",
      destinationIds: [primary.id],
    });
    const sharedRoute = await services.routes.createRoute({
      name: "Primary and audit",
      destinationIds: [primary.id, audit.id],
    });

    await services.destinations.deleteDestination({ id: primary.id });

    expect(await store.destinations.get(primary.id)).toBeNull();
    expect(await store.routes.get(directRoute.id)).toBeNull();
    expect(await store.routes.get(sharedRoute.id)).toMatchObject({
      destinationIds: [audit.id],
    });

    await store.close();
  });

  it("previews the history a delete cascades and rejects unknown ids", async () => {
    const { store, services } = await createTestContext();
    const source = await services.sources.createSource({
      name: "Grafana prod",
      provider: "grafana",
    });
    const destination = await services.destinations.createDestination({
      name: "Ops webhook",
      kind: "generic_webhook",
      config: {
        url: "https://example.test/webhook",
      },
    });
    const route = await services.routes.createRoute({
      name: "Grafana only",
      rule: {
        sourceIds: [source.source.id],
      },
      destinationIds: [destination.id],
    });

    // Fresh configuration has nothing to disclose, but the preview still runs.
    expect(await services.sources.previewDeleteSource({ id: source.source.id })).toEqual({
      eventCount: 0,
      deliveryCount: 0,
      attemptCount: 0,
      oncallPingCount: 0,
    });
    expect(await services.routes.previewDeleteRoute({ id: route.id })).toEqual({
      eventCount: 0,
      deliveryCount: 0,
      attemptCount: 0,
      oncallPingCount: 0,
    });
    expect(await services.destinations.previewDeleteDestination({ id: destination.id })).toEqual({
      eventCount: 0,
      deliveryCount: 0,
      attemptCount: 0,
      oncallPingCount: 0,
    });

    // A preview for a row that is already gone has to be as loud as the delete.
    await expect(services.sources.previewDeleteSource({ id: "source-missing" })).rejects.toThrow(
      "Source not found: source-missing",
    );
    await expect(services.routes.previewDeleteRoute({ id: "route-missing" })).rejects.toThrow(
      "Route not found: route-missing",
    );
    await expect(
      services.destinations.previewDeleteDestination({ id: "destination-missing" }),
    ).rejects.toThrow("Destination not found: destination-missing");

    await store.close();
  });

  it("rejects route configuration that references unknown sources", async () => {
    const { store, services } = await createTestContext();
    const source = await services.sources.createSource({
      name: "Grafana prod",
      provider: "grafana",
    });
    const destination = await services.destinations.createDestination({
      name: "Ops webhook",
      kind: "generic_webhook",
      config: {
        url: "https://example.test/webhook",
      },
    });
    const route = await services.routes.createRoute({
      name: "Known source route",
      rule: {
        sourceIds: [source.source.id],
      },
      destinationIds: [destination.id],
    });

    await expect(
      services.routes.createRoute({
        name: "Broken route",
        rule: {
          sourceIds: ["source-missing"],
        },
        destinationIds: [destination.id],
      }),
    ).rejects.toThrow("Unknown source IDs: source-missing");
    await expect(
      services.routes.updateRoute({
        id: route.id,
        rule: {
          sourceIds: [source.source.id, "source-missing"],
        },
      }),
    ).rejects.toThrow("Unknown source IDs: source-missing");
    expect((await store.routes.get(route.id))?.rule.sourceIds).toEqual([source.source.id]);

    await store.close();
  });

  it("rejects imported routes with unknown destinations before changing stored configuration", async () => {
    const { store, services } = await createTestContext();
    const toml = [
      "[settings]",
      'schema_version = "tocsin.config.v1"',
      'exported_at = "2026-06-09T08:00:00.000Z"',
      "include_secrets = false",
      "raw_payload_retention_days = 14",
      "",
      "[[routes]]",
      'id = "route-missing-destination"',
      'name = "Broken route"',
      "enabled = true",
      'destination_ids = ["destination-missing"]',
      "",
      "[routes.rule]",
      'severities = ["critical"]',
      "",
    ].join("\n");

    await expect(services.portability.importToml(toml)).rejects.toThrow(
      "Unknown destination IDs: destination-missing",
    );
    expect(await store.routes.list()).toEqual([]);
    expect((await store.settings.get()).rawPayloadRetentionDays).toBe(30);

    await store.close();
  });

  it("rejects imported routes with unknown sources before changing stored configuration", async () => {
    const { store, services } = await createTestContext();
    const toml = [
      "[settings]",
      'schema_version = "tocsin.config.v1"',
      'exported_at = "2026-06-09T08:00:00.000Z"',
      "include_secrets = false",
      "raw_payload_retention_days = 14",
      "",
      "[[destinations]]",
      'id = "destination-imported"',
      'name = "Imported webhook"',
      'kind = "generic_webhook"',
      "enabled = true",
      "",
      "[destinations.config]",
      'url = "https://example.test/webhook"',
      "",
      "[[routes]]",
      'id = "route-missing-source"',
      'name = "Broken route"',
      "enabled = true",
      'destination_ids = ["destination-imported"]',
      "",
      "[routes.rule]",
      'source_ids = ["source-missing"]',
      "",
    ].join("\n");

    await expect(services.portability.importToml(toml)).rejects.toThrow(
      "Unknown source IDs: source-missing",
    );
    expect(await store.destinations.list()).toEqual([]);
    expect(await store.routes.list()).toEqual([]);
    expect((await store.settings.get()).rawPayloadRetentionDays).toBe(30);

    await store.close();
  });

  it("rejects imported routes with duplicate destinations before changing stored configuration", async () => {
    const { store, services } = await createTestContext();
    const toml = [
      "[settings]",
      'schema_version = "tocsin.config.v1"',
      'exported_at = "2026-06-09T08:00:00.000Z"',
      "include_secrets = false",
      "raw_payload_retention_days = 14",
      "",
      "[[destinations]]",
      'id = "destination-imported"',
      'name = "Imported webhook"',
      'kind = "generic_webhook"',
      "enabled = true",
      "",
      "[destinations.config]",
      'url = "https://example.test/webhook"',
      "",
      "[[routes]]",
      'id = "route-duplicate-destination"',
      'name = "Broken route"',
      "enabled = true",
      'destination_ids = ["destination-imported", "destination-imported"]',
      "",
      "[routes.rule]",
      'severities = ["critical"]',
      "",
    ].join("\n");

    await expect(services.portability.importToml(toml)).rejects.toThrow(
      "Route destination IDs must be unique",
    );
    expect(await store.destinations.list()).toEqual([]);
    expect(await store.routes.list()).toEqual([]);
    expect((await store.settings.get()).rawPayloadRetentionDays).toBe(30);

    await store.close();
  });

  it("creates and updates routes through route schemas", async () => {
    const { store, services } = await createTestContext();
    const source = await services.sources.createSource({
      name: "Grafana prod",
      provider: "grafana",
    });
    const destination = await services.destinations.createDestination({
      name: "Ops webhook",
      kind: "generic_webhook",
      config: {
        url: "https://example.test/webhook",
      },
    });
    const auditDestination = await services.destinations.createDestination({
      name: "Audit email",
      kind: "email",
      config: {
        endpointUrl: "https://mail.example.test/send",
        to: ["audit@example.test"],
        from: "tocsin@example.test",
      },
    });

    const route = await services.routes.createRoute({
      name: "Critical alerts",
      rule: {
        sourceIds: [source.source.id],
        severities: ["critical"],
        statuses: ["firing"],
        labels: [{ key: "service", operator: "equals", value: "checkout" }],
        titleContains: ["LatencyHigh"],
        messageContains: ["timeout"],
      },
      destinationIds: [destination.id, auditDestination.id],
    });
    const updated = await services.routes.updateRoute({
      id: route.id,
      enabled: false,
      rule: {
        statuses: ["resolved"],
      },
    });

    expect(route.destinationIds).toEqual([destination.id, auditDestination.id]);
    expect(route.rule).toMatchObject({
      sourceIds: [source.source.id],
      severities: ["critical"],
      statuses: ["firing"],
      labels: [{ key: "service", operator: "equals", value: "checkout" }],
      titleContains: ["LatencyHigh"],
      messageContains: ["timeout"],
    });
    expect(route.rule.severities).toEqual(["critical"]);
    expect(updated.enabled).toBe(false);
    expect(updated.rule).toMatchObject({
      statuses: ["resolved"],
    });
    expect(await services.routes.listRoutes()).toHaveLength(1);

    await store.close();
  });
});
