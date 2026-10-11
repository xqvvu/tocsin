import type { JsonObject, SourceSummary } from "@tocsin/core";

export type { SourceSummary };

export type SourceFormLayout = "compact" | "dialog" | "rail";

export type SourceFormValues = {
  name: string;
  provider: SourceSummary["provider"];
};

export type SourceFormSubmitInput = SourceFormValues & { config?: JsonObject };

export type CreateSourceFormInput = SourceFormSubmitInput;

export type EditSourceFormInput = SourceFormSubmitInput & {
  id: string;
};

export type SourceSubmitResult = boolean | void | Promise<boolean | void>;
