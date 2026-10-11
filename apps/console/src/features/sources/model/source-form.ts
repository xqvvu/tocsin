import {
  formTrimmedString,
  nonEmptyObject,
  type JsonObject,
  type SourceProvider,
} from "@tocsin/core";

export function formSourceProvider(data: FormData): SourceProvider {
  return formSourceProviderValue(data.get("provider"));
}

export function formSourceProviderValue(value: FormDataEntryValue | string | null): SourceProvider {
  switch (value) {
    case "signoz":
    case "grafana":
    case "uptime_kuma":
    case "alertmanager":
    case "fastgpt": {
      return value;
    }
    default: {
      return "generic";
    }
  }
}

export function sourceConfigFromForm(data: FormData): JsonObject {
  const signingSecret = formTrimmedString(data, "signingSecret");

  return signingSecret ? { signingSecret } : {};
}

export function sourceConfigPatchFromForm(data: FormData): JsonObject | undefined {
  return nonEmptyObject(sourceConfigFromForm(data));
}
