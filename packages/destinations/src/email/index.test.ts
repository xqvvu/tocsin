import { destinationSendInput, fakeFetch } from "@tocsin/destinations/test-kit";
import { describe, expect, it } from "vite-plus/test";

import { emailSender, EmailConfigSchema, renderEmailPayload } from "#destinations/email/index";
import type { EmailConfig } from "#destinations/email/index";
import { createDefaultDestinationRegistry } from "#destinations/registry";
import { DestinationTemplateEngine } from "#destinations/template";
import type { DestinationSendInput } from "#destinations/types";

const input = destinationSendInput<EmailConfig>({
  destination: { kind: "email", name: "Email SRE" },
  source: { name: "Uptime Kuma prod", provider: "uptime_kuma" },
  normalizedEvent: {
    title: "Checkout API unavailable",
    message: "health check failed",
    fingerprint: "checkout-api",
  },
  config: {
    endpointUrl: "https://mail-gateway.example.test/send",
    to: ["sre@example.test"],
    from: "tocsin@example.test",
    subjectPrefix: "[Tocsin]",
    headers: {
      Authorization: "Bearer test-token",
    },
  },
});

describe("email sender", () => {
  it("sends rendered email payloads through an injected transport", async () => {
    const fetcher = fakeFetch(() => ({ status: 202, body: "queued" }));

    const result = await emailSender.send(input, { fetch: fetcher });

    expect(result.ok).toBe(true);
    expect(result.statusCode).toBe(202);
    expect(fetcher.calls).toHaveLength(1);
    expect(fetcher.calls[0]?.url).toBe("https://mail-gateway.example.test/send");
    expect(fetcher.calls[0]?.init.headers).toEqual({
      "Content-Type": "application/json",
      Authorization: "Bearer test-token",
    });
    const body = JSON.parse(fetcher.calls[0]?.init.body as string) as {
      to: string[];
      from: string;
      subject: string;
      text: string;
      html: string;
      metadata: Record<string, string>;
    };
    expect(body.to).toEqual(["sre@example.test"]);
    expect(body.from).toBe("tocsin@example.test");
    expect(body.subject).toBe("[Tocsin] [Critical Firing] Checkout API unavailable");
    expect(body.text).toContain("health check failed");
    expect(body.text).toContain("Labels: service=checkout");
    expect(body.html).toContain("Checkout API unavailable");
    expect(body.metadata).toMatchObject({
      eventId: "event-1",
      fingerprint: "checkout-api",
      severity: "critical",
      status: "firing",
    });
    expect(result.renderedPayload).toMatchObject({
      subject: "[Tocsin] [Critical Firing] Checkout API unavailable",
    });
    expect(result.renderedPayload).not.toHaveProperty("to");
    expect(result.renderedPayload).not.toHaveProperty("from");
    expect(result.renderedPayload).not.toHaveProperty("replyTo");
  });

  it("reports non-2xx email gateway responses as delivery failures", async () => {
    const fetcher = fakeFetch(() => ({ ok: false, status: 502, body: "bad gateway" }));

    const result = await emailSender.send(input, { fetch: fetcher });

    expect(result.ok).toBe(false);
    expect(result).toMatchObject({
      errorKind: "http_error",
      retryHint: "retryable",
      errorMessage: "Email gateway returned HTTP 502",
    });
    expect(result.responseBody).toBe("bad gateway");
  });

  it("registers email in the default destination registry", () => {
    const adapter = createDefaultDestinationRegistry().get("email");

    expect(adapter.manifest.kind).toBe("email");
  });
});

describe("email subject template", () => {
  it("interpolates allow-listed variables into the subject", async () => {
    const body = await sendBody({ subjectTemplate: "{{event.title}} @ {{source.name}}" });

    expect(body.subject).toBe("Checkout API unavailable @ Uptime Kuma prod");
  });

  it("ignores the subject prefix once a subject template is set", async () => {
    const body = await sendBody({
      subjectPrefix: "[Tocsin]",
      subjectTemplate: "{{event.severityDisplay}} {{event.statusDisplay}} {{event.title}}",
    });

    expect(body.subject).toBe("Critical Firing Checkout API unavailable");
    expect(body.subject).not.toContain("[Tocsin]");
  });

  it("keeps the built-in subject and prefix when no subject template is set", async () => {
    const body = await sendBody({ subjectPrefix: "[Ops]" });

    expect(body.subject).toBe("[Ops] [Critical Firing] Checkout API unavailable");
  });

  it("renders missing allow-listed labels as empty strings", async () => {
    const body = await sendBody({
      subjectTemplate: "[{{event.labels.environment}}] {{event.title}}",
    });

    expect(body.subject).toBe("[] Checkout API unavailable");
  });

  it("reuses the body template bindings for the subject and html templates", async () => {
    const bindings = {
      level: {
        select: "event.severity" as const,
        cases: { critical: "SEV-1" },
        fallback: "SEV-OTHER",
      },
    };
    const body = await sendBody({
      subjectTemplate: "{{bindings.level}} {{event.title}}",
      htmlTemplate: "<em>{{bindings.level}}</em>",
      template: { mode: "text", text: "{{bindings.level}} {{event.message}}", bindings },
    });

    expect(body.subject).toBe("SEV-1 Checkout API unavailable");
    expect(body.text).toBe("SEV-1 health check failed");
    expect(body.html).toBe("<em>SEV-1</em>");
  });

  it("rejects unknown and unsafe subject variables without calling the gateway", async () => {
    const fetcher = fakeFetch(() => ({ status: 202, body: "queued" }));
    const result = await emailSender.send(
      {
        ...input,
        config: {
          ...input.config,
          subjectTemplate: "{{event.nope}} {{raw.title}} {{headers.authorization}}",
        },
      },
      { fetch: fetcher },
    );

    expect(result.ok).toBe(false);
    expect(result).toMatchObject({
      errorKind: "configuration_error",
      retryHint: "not_retryable",
    });
    expect(fetcher.calls).toHaveLength(0);
    expect(diagnosticVariables(result.renderedPayload)).toEqual([
      "event.nope",
      "raw.title",
      "headers.authorization",
    ]);
    expect(JSON.stringify(result.renderedPayload)).not.toContain("test-token");
  });
});

describe("email html template", () => {
  it("replaces the generated pre block", async () => {
    const body = await sendBody({ htmlTemplate: "<h1>{{event.title}}</h1>{{event.message}}" });

    expect(body.html).toBe("<h1>Checkout API unavailable</h1>health check failed");
    expect(body.html).not.toContain("<pre>");
  });

  it("escapes interpolated variable values and keeps template markup as written", async () => {
    const body = await sendBody(
      { htmlTemplate: "<b>{{event.title}}</b>" },
      { title: "<script>alert(1)</script>" },
    );

    expect(body.html).toBe("<b>&lt;script&gt;alert(1)&lt;/script&gt;</b>");
    expect(body.html).not.toContain("<script>");
  });

  it("escapes every unsafe character in interpolated values", async () => {
    const body = await sendBody(
      { htmlTemplate: '<a href="{{event.labels.url}}">{{event.title}}</a>' },
      { labels: { service: "checkout", url: `"&'` } },
    );

    expect(body.html).toBe('<a href="&quot;&amp;&#39;">Checkout API unavailable</a>');
  });

  it("still escapes the generated pre block when no html template is set", async () => {
    const body = await sendBody({}, { title: "<img src=x>" });

    expect(body.html).toContain("&lt;img src=x&gt;");
    expect(body.html.startsWith("<pre>")).toBe(true);
  });

  it("leaves the text body and subject unescaped while the html body escapes values", async () => {
    const body = await sendBody(
      { htmlTemplate: "<b>{{event.title}}</b>" },
      { title: 'Disk & "raid" <b>lost</b>' },
    );

    // The subject keeps raw text (the gateway owns header encoding), only the
    // HTML body run goes through escapeHtml.
    expect(body.subject).toBe('[Tocsin] [Critical Firing] Disk & "raid" <b>lost</b>');
    expect(body.text).toContain('Disk & "raid" <b>lost</b>');
    expect(body.html).toBe("<b>Disk &amp; &quot;raid&quot; &lt;b&gt;lost&lt;/b&gt;</b>");
  });

  it("rejects unknown and unsafe html variables without calling the gateway", async () => {
    const fetcher = fakeFetch(() => ({ status: 202, body: "queued" }));
    const result = await emailSender.send(
      {
        ...input,
        config: {
          ...input.config,
          htmlTemplate:
            "{{event.nope}} {{raw.title}} {{headers.authorization}} {{config.endpointUrl}}",
        },
      },
      { fetch: fetcher },
    );

    expect(result.ok).toBe(false);
    expect(result).toMatchObject({
      errorKind: "configuration_error",
      retryHint: "not_retryable",
    });
    expect(fetcher.calls).toHaveLength(0);
    expect(diagnosticVariables(result.renderedPayload)).toEqual([
      "event.nope",
      "raw.title",
      "headers.authorization",
      "config.endpointUrl",
    ]);
    expect(JSON.stringify(result.renderedPayload)).not.toContain("mail-gateway.example.test");
  });
});

describe("email template config guard", () => {
  it("turns unsafe template variables into config issues at the offending field path", () => {
    const parsed = EmailConfigSchema.safeParse({
      ...input.config,
      subjectTemplate: "{{event.nope}}",
      htmlTemplate: "{{raw.title}}",
    });

    if (parsed.success) {
      throw new Error("Expected the email config guard to reject unsafe template variables");
    }

    const paths = parsed.error.issues
      .filter(
        (issue) =>
          issue.path.join(".") === "subjectTemplate" || issue.path.join(".") === "htmlTemplate",
      )
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`);

    expect(paths).toEqual([
      "subjectTemplate: Destination template contains unknown variable: event.nope",
      "htmlTemplate: Destination template contains unknown variable: raw.title",
    ]);
  });

  it("keeps a renderer validation error recoverable as a configuration failure", async () => {
    const unvalidatedConfig = {
      ...input.config,
      subjectTemplate: "{{event.nope}}",
    } as EmailConfig;

    let renderError: unknown;

    try {
      renderEmailPayload({ ...input, config: unvalidatedConfig }, unvalidatedConfig);
    } catch (error) {
      renderError = error;
    }

    expect(DestinationTemplateEngine.isValidationError(renderError)).toBe(true);

    const fetcher = fakeFetch(() => ({ status: 202, body: "queued" }));
    const result = await emailSender.send(
      { ...input, config: unvalidatedConfig },
      { fetch: fetcher },
    );

    expect(result.ok).toBe(false);
    expect(result).toMatchObject({
      errorKind: "configuration_error",
      retryHint: "not_retryable",
    });
    expect(fetcher.calls).toHaveLength(0);
  });
});

describe("email secret safety", () => {
  it("omits the gateway url and sensitive headers from previews and rendered payloads", async () => {
    const preview = emailSender.preview(input);

    expect(JSON.stringify(preview)).not.toContain("mail-gateway.example.test");
    expect(JSON.stringify(preview)).not.toContain("Bearer test-token");
    expect(preview).not.toHaveProperty("headers");
    expect(preview).not.toHaveProperty("endpointUrl");

    const result = await emailSender.send(input, {
      fetch: fakeFetch(() => ({ status: 202, body: "queued" })),
    });

    expect(result.ok).toBe(true);
    expect(JSON.stringify(result.renderedPayload)).not.toContain("mail-gateway.example.test");
    expect(JSON.stringify(result.renderedPayload)).not.toContain("Bearer test-token");
  });
});

async function sendBody(
  configOverrides: Partial<EmailConfig>,
  eventOverrides: Partial<DestinationSendInput<EmailConfig>["normalizedEvent"]> = {},
): Promise<{ subject: string; text: string; html: string }> {
  const fetcher = fakeFetch(() => ({ status: 202, body: "queued" }));
  const result = await emailSender.send(
    {
      ...input,
      normalizedEvent: { ...input.normalizedEvent, ...eventOverrides },
      config: { ...input.config, ...configOverrides },
    },
    { fetch: fetcher },
  );

  expect(result.ok).toBe(true);

  return JSON.parse(fetcher.calls[0]?.init.body as string) as {
    subject: string;
    text: string;
    html: string;
  };
}

function diagnosticVariables(renderedPayload: unknown): string[] {
  const payload = renderedPayload as {
    templateError?: { diagnostics?: Array<{ variable?: string | null }> };
  };

  return (payload.templateError?.diagnostics ?? []).map((diagnostic) => diagnostic.variable ?? "");
}
