import type { DestinationManifest } from "#destinations/types";

export const emailManifest = {
  kind: "email",
  configVersion: 1,
  lifecycle: {
    status: "experimental",
  },
  displayNameKey: "destinations.kinds.email",
  descriptionKey: "destinations.table.safeConfig.email",
  iconName: "mail",
  configFields: [
    {
      type: "url",
      path: "endpointUrl",
      labelKey: "destinations.form.emailGatewayUrl",
      required: true,
      sensitive: true,
    },
    {
      type: "string-list",
      path: "to",
      labelKey: "destinations.form.to",
      descriptionKey: "destinations.form.toDescription",
      required: true,
    },
    {
      type: "text",
      path: "from",
      labelKey: "destinations.form.from",
      descriptionKey: "destinations.form.fromDescription",
      required: true,
    },
    {
      type: "text",
      path: "replyTo",
      labelKey: "destinations.form.replyTo",
      descriptionKey: "destinations.form.replyToDescription",
    },
    {
      type: "text",
      path: "subjectPrefix",
      labelKey: "destinations.form.subjectPrefix",
      descriptionKey: "destinations.form.subjectPrefixDescription",
    },
    {
      type: "text",
      path: "subjectTemplate",
      labelKey: "destinations.form.subjectTemplate",
      descriptionKey: "destinations.form.subjectTemplateDescription",
    },
    {
      type: "text",
      path: "htmlTemplate",
      labelKey: "destinations.form.htmlTemplate",
      descriptionKey: "destinations.form.htmlTemplateDescription",
    },
    {
      type: "key-value",
      path: "headers",
      labelKey: "destinations.form.headers",
      descriptionKey: "destinations.form.headersDescription",
      sensitive: true,
      valueSensitive: true,
    },
    {
      type: "template",
      path: "template",
      labelKey: "destinations.form.template",
      descriptionKey: "destinations.form.templateDescription",
    },
  ],
  secretFields: [
    {
      path: "endpointUrl",
      kind: "endpoint_url",
      envHint: "EMAIL_GATEWAY_URL",
      labelKey: "destinations.form.emailGatewayUrl",
    },
    {
      path: "headers",
      kind: "header",
      envHint: "EMAIL_GATEWAY_HEADERS",
      labelKey: "destinations.form.headers",
    },
  ],
  capabilities: {
    preview: true,
    test: true,
    delivery: true,
  },
} satisfies DestinationManifest<"email">;
