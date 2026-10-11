import { describe, expect, it } from "vite-plus/test";

import { feishuSender } from "#destinations/feishu/index";
import {
  DestinationTemplateEngine,
  DestinationTemplateSchema,
  type DestinationTemplate,
  type TemplateBindings,
} from "#destinations/template";
import type { DestinationSendInput } from "#destinations/types";

const input: DestinationSendInput<unknown> = {
  eventId: "event-1",
  source: {
    id: "source-1",
    name: "Grafana prod",
    provider: "grafana",
    enabled: true,
  },
  destination: {
    id: "dest-1",
    name: "Ops destination",
    kind: "generic_webhook",
    enabled: true,
  },
  normalizedEvent: {
    title: "Checkout API latency high",
    message: "p95 latency exceeded",
    severity: "critical",
    status: "firing",
    fingerprint: "checkout-latency",
    labels: {
      service: "checkout",
    },
    occurredAt: "2026-06-07T08:00:00.000Z",
  },
  payload: {
    monitor: {
      name: "Checkout API",
      token: "must-not-render",
    },
    heartbeat: {
      ping: 75,
      important: true,
    },
    commonLabels: {
      "threshold.name": "critical",
    },
    incidents: [{ message: "timeout" }],
  },
  config: {},
};

describe("destination templates", () => {
  it("interpolates allow-listed event, source, destination, Tocsin URL, and label fields", () => {
    const context = DestinationTemplateEngine.createRenderContext(input, {
      eventUrl: "https://tocsin.example.test/events/event-1",
    });

    expect(
      DestinationTemplateEngine.renderText(
        context,
        "{{event.severity}} {{event.title}} service={{event.labels.service}} source={{source.name}} url={{tocsin.eventUrl}}",
      ),
    ).toEqual({
      ok: true,
      value:
        "critical Checkout API latency high service=checkout source=Grafana prod url=https://tocsin.example.test/events/event-1",
      diagnostics: [],
    });
  });

  it("rejects unknown variables with path-level diagnostics", () => {
    expect(
      DestinationTemplateEngine.diagnoseTemplateValue(
        "{{event.title.toUpperCase}} {{process.env.SECRET}} {{payload}} {{raw.secret}}",
      ),
    ).toEqual([
      {
        severity: "error",
        path: "template",
        variable: "event.title.toUpperCase",
        message: "Destination template contains unknown variable: event.title.toUpperCase",
      },
      {
        severity: "error",
        path: "template",
        variable: "process.env.SECRET",
        message: "Destination template contains unknown variable: process.env.SECRET",
      },
      {
        severity: "error",
        path: "template",
        variable: "payload",
        message: "Destination template contains unknown variable: payload",
      },
      {
        severity: "error",
        path: "template",
        variable: "raw.secret",
        message: "Destination template contains unknown variable: raw.secret",
      },
    ]);
  });

  it("renders missing allow-listed labels as empty strings", () => {
    const context = DestinationTemplateEngine.createRenderContext(input);

    expect(
      DestinationTemplateEngine.renderText(
        context,
        "service={{event.labels.service}} pod={{event.labels.pod}}",
      ),
    ).toMatchObject({
      ok: true,
      value: "service=checkout pod=",
    });
  });

  it("interpolates nested redacted payload scalar paths and array indexes", () => {
    const context = DestinationTemplateEngine.createRenderContext(input);

    expect(
      DestinationTemplateEngine.renderText(
        context,
        'monitor={{payload.monitor.name}} ping={{payload.heartbeat.ping}} important={{payload.heartbeat.important}} incident={{payload.incidents[0].message}} threshold={{payload.commonLabels["threshold.name"]}} token={{payload.monitor.token}}',
      ),
    ).toMatchObject({
      ok: true,
      value:
        "monitor=Checkout API ping=75 important=true incident=timeout threshold=critical token=[REDACTED]",
    });
  });

  it("renders missing or non-scalar payload paths as empty strings", () => {
    const context = DestinationTemplateEngine.createRenderContext(input);

    expect(
      DestinationTemplateEngine.renderText(
        context,
        "missing={{payload.monitor.missing}} object={{payload.monitor}} array={{payload.incidents}} invalidIndex={{payload.incidents.first.message}}",
      ),
    ).toMatchObject({
      ok: true,
      value: "missing= object= array= invalidIndex=",
    });
  });

  it("recursively renders JSON string fields", () => {
    const context = DestinationTemplateEngine.createRenderContext(input);

    expect(
      DestinationTemplateEngine.renderJson(context, {
        header: {
          title: "{{event.title}}",
        },
        elements: [{ text: "service={{event.labels.service}}" }],
      }),
    ).toEqual({
      ok: true,
      value: {
        header: {
          title: "Checkout API latency high",
        },
        elements: [{ text: "service=checkout" }],
      },
      diagnostics: [],
    });
  });

  it("resolves bindings from each allowed scalar selector", () => {
    const bindings = {
      status: {
        select: "event.status",
        cases: { firing: "status-firing" },
        fallback: "status-fallback",
      },
      severity: {
        select: "event.severity",
        cases: { critical: "severity-critical" },
        fallback: "severity-fallback",
      },
      provider: {
        select: "source.provider",
        cases: { grafana: "provider-grafana" },
        fallback: "provider-fallback",
      },
      destination: {
        select: "destination.kind",
        cases: { generic_webhook: "destination-webhook" },
        fallback: "destination-fallback",
      },
    } satisfies TemplateBindings;
    const context = DestinationTemplateEngine.createRenderContext(input, { bindings });

    expect(
      DestinationTemplateEngine.renderText(
        context,
        "{{bindings.status}} {{bindings.severity}} {{bindings.provider}} {{bindings.destination}}",
        "template.text",
        bindings,
      ),
    ).toEqual({
      ok: true,
      value: "status-firing severity-critical provider-grafana destination-webhook",
      diagnostics: [],
    });
  });

  it("uses a required fallback and does not recursively render binding values", () => {
    const bindings = {
      statusText: {
        select: "event.status",
        cases: { resolved: "recovered" },
        fallback: "{{event.title}}",
      },
    } satisfies TemplateBindings;
    const context = DestinationTemplateEngine.createRenderContext(input, { bindings });

    expect(
      DestinationTemplateEngine.renderText(
        context,
        "value={{bindings.statusText}}",
        "template.text",
        bindings,
      ),
    ).toEqual({
      ok: true,
      value: "value={{event.title}}",
      diagnostics: [],
    });
  });

  it("reports unknown and unused bindings without blocking warning-only rendering", () => {
    const bindings = {
      unusedColor: {
        select: "event.status",
        cases: { firing: "red" },
        fallback: "grey",
      },
    } satisfies TemplateBindings;
    const context = DestinationTemplateEngine.createRenderContext(input, { bindings });

    expect(
      DestinationTemplateEngine.renderText(context, "{{event.title}}", "template.text", bindings),
    ).toEqual({
      ok: true,
      value: "Checkout API latency high",
      diagnostics: [
        {
          severity: "warning",
          path: "template.bindings.unusedColor",
          variable: "bindings.unusedColor",
          message: "Destination template binding is not referenced: unusedColor",
        },
      ],
    });

    expect(
      DestinationTemplateEngine.diagnoseTextTemplate(
        "{{bindings.missing}}",
        "template.text",
        bindings,
      ),
    ).toContainEqual({
      severity: "error",
      path: "template.text",
      variable: "bindings.missing",
      message: "Destination template contains unknown variable: bindings.missing",
    });
  });

  it("validates binding names, selectors, fallbacks, and output types", () => {
    expect(() =>
      DestinationTemplateSchema.parse({
        mode: "text",
        text: "{{bindings.statusColor}}",
        bindings: {
          "invalid.name": {
            select: "event.labels.team",
            cases: { firing: { color: "red" } },
          },
        },
      }),
    ).toThrow();
  });

  it("omits Feishu signing fields from previews", async () => {
    const preview = await feishuSender.preview({
      ...input,
      destination: {
        ...input.destination,
        kind: "feishu",
      },
      config: {
        sendMode: "webhook",
        webhookUrl: "https://open.feishu.cn/open-apis/bot/v2/hook/example",
        signSecret: "secret",
        template: {
          source: "custom",
          mode: "text",
          text: "{{event.title}}",
        },
      },
    });

    expect(preview).toEqual({
      msg_type: "text",
      content: {
        text: "Checkout API latency high",
      },
    });
  });
});

describe("template render escape hook", () => {
  const context = () => DestinationTemplateEngine.createRenderContext(input);

  // Escape the characters that matter for HTML, so a value that came from an
  // event can never close a tag the template author wrote.
  const escapeHtml = (value: string) =>
    value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

  it("escapes interpolated values while leaving the template's own markup intact", () => {
    // The invariant: escape runs inside the replaceAll replacer, so it only
    // ever sees a resolved variable — never the template's literal text.
    const withMarkup: DestinationSendInput<unknown> = {
      ...input,
      normalizedEvent: {
        ...input.normalizedEvent,
        title: '<script>alert("xss")</script>',
      },
    };

    const rendered = DestinationTemplateEngine.renderText(
      DestinationTemplateEngine.createRenderContext(withMarkup),
      "<b>{{event.title}}</b>",
      "text",
      {},
      { escape: escapeHtml },
    );

    expect(rendered.ok).toBe(true);
    expect(rendered.value).toBe('<b>&lt;script&gt;alert("xss")&lt;/script&gt;</b>');
  });

  it("leaves rendering unchanged when no escape hook is supplied", () => {
    const rendered = DestinationTemplateEngine.renderText(context(), "<b>{{event.title}}</b>");

    expect(rendered.value).toBe("<b>Checkout API latency high</b>");
  });

  it("calls the escape hook only for variable values, never for literal text", () => {
    const seen: string[] = [];
    const spy = (value: string) => {
      seen.push(value);
      return value;
    };

    DestinationTemplateEngine.renderText(
      context(),
      "literal {{event.severity}} more literal {{event.title}}",
      "text",
      {},
      { escape: spy },
    );

    expect(seen).toEqual(["critical", "Checkout API latency high"]);
  });

  it("escapes every interpolated value independently", () => {
    const rendered = DestinationTemplateEngine.renderText(
      context(),
      "<i>{{event.severity}}</i>|<i>{{source.name}}</i>",
      "text",
      {},
      { escape: (value) => `[${value}]` },
    );

    expect(rendered.value).toBe("<i>[critical]</i>|<i>[Grafana prod]</i>");
  });

  it("does not apply an escape hook to JSON template rendering", () => {
    // JSON body templates are a different output context; the engine exposes
    // no escape option there on purpose.
    const rendered = DestinationTemplateEngine.renderJson(context(), { title: "{{event.title}}" });

    expect(rendered.value).toEqual({ title: "Checkout API latency high" });
  });
});

describe("template mode dispatch", () => {
  const unknownVariableDiagnostics = (
    template: DestinationTemplate,
  ): Array<{ path: string | undefined }> =>
    DestinationTemplateEngine.diagnoseDestinationTemplate(template).map((diagnostic) => ({
      path: diagnostic.path,
    }));

  it("points each mode's diagnostics at that mode's own body field", () => {
    // A regression guard: the old `mode === "text" ? ... : ...` dispatch sent
    // every non-text mode to `.card`, so json_payload and slack_blocks would
    // have reported paths under a field their schema does not even have.
    expect(unknownVariableDiagnostics({ mode: "text", text: "{{event.nope}}" })).toEqual([
      { path: "template.text" },
    ]);

    expect(
      unknownVariableDiagnostics({ mode: "feishu_card", card: { v: "{{event.nope}}" } }),
    ).toEqual([{ path: "template.card.v" }]);

    expect(
      unknownVariableDiagnostics({ mode: "json_payload", payload: { v: "{{event.nope}}" } }),
    ).toEqual([{ path: "template.payload.v" }]);

    expect(
      unknownVariableDiagnostics({ mode: "slack_blocks", payload: { v: "{{event.nope}}" } }),
    ).toEqual([{ path: "template.payload.v" }]);
  });

  it("addresses nested arrays in a JSON mode's diagnostic path", () => {
    expect(
      unknownVariableDiagnostics({
        mode: "json_payload",
        payload: { alert: [{ text: "{{event.nope}}" }] },
      }),
    ).toEqual([{ path: "template.payload.alert.0.text" }]);
  });

  it("reports the same diagnostics through diagnoseConfig as through direct dispatch", () => {
    const template: DestinationTemplate = {
      mode: "slack_blocks",
      payload: { blocks: [{ text: "{{event.nope}}" }] },
    };

    const expected = [
      {
        severity: "error" as const,
        path: "template.payload.blocks.0.text",
        variable: "event.nope",
        message: "Destination template contains unknown variable: event.nope",
      },
    ];

    expect(DestinationTemplateEngine.diagnoseDestinationTemplate(template)).toEqual(expected);
    // The config-level entry point must agree. It previously parsed first and
    // returned [] here, because the mode schema's superRefine rejects the very
    // variable being diagnosed — the console preview showed nothing (#53).
    expect(DestinationTemplateEngine.diagnoseConfig({ template })).toEqual(expected);
  });

  it("surfaces zod issues when the template is structurally invalid for its mode", () => {
    // A payload mode whose body is not an object: there is no useful mode arm
    // to dispatch on, so the parse issues are the only signal.
    const diagnostics = DestinationTemplateEngine.diagnoseConfig({
      template: { mode: "json_payload", payload: "not-an-object" },
    });

    expect(diagnostics.length).toBeGreaterThan(0);
    expect(diagnostics.every((diagnostic) => diagnostic.severity === "error")).toBe(true);
  });

  it("returns no diagnostics for a config with no template at all", () => {
    expect(DestinationTemplateEngine.diagnoseConfig({})).toEqual([]);
  });
});
