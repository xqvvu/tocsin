import type {
  AlertStatus,
  DestinationListItem,
  DestinationPreviewResult,
  DestinationTestResult,
  JsonObject,
} from "@tocsin/core";

import type {
  DestinationFormKind,
  DestinationTemplateFormState,
} from "#/features/destinations/model/destination-form";

export type {
  DestinationCatalog,
  DestinationListItem,
  DestinationSummary,
} from "#/features/destinations/model/destination-types";

export type DestinationFormMode = "create" | "edit";

export type DestinationFeishuSendMode = "webhook" | "app";

export type DestinationFormValues = DestinationTemplateFormState & {
  name: string;
  kind: DestinationFormKind;
  endpointUrl: string;
  to: string;
  from: string;
  replyTo: string;
  subjectPrefix: string;
  /** Email template slots that sit next to `template` rather than being a mode. */
  subjectTemplate: string;
  htmlTemplate: string;
  headers: string;
  /**
   * Webhook address for every webhook-style kind. The generic-webhook manifest
   * calls its config key `url`, but the form field is `webhookUrl` — having both
   * names in this type is what let the builder and the input disagree.
   */
  webhookUrl: string;
  method: string;
  signSecret: string;
  /** Feishu send mode and app-mode target fields. */
  sendMode: DestinationFeishuSendMode;
  appRef: string;
  chatId: string;
  /** Feishu urgent paging fields; receivers comma or newline separated. */
  urgentAutoEnabled: boolean;
  urgentSeverities: string[];
  urgentUserIdType: string;
  urgentReceivers: string;
};

export type DestinationFormSubmitInput = {
  name: string;
  kind: DestinationFormKind;
  config: JsonObject;
};

export type DestinationFormPreviewInput = DestinationFormSubmitInput & {
  sampleStatus: AlertStatus;
};

export type CreateDestinationFormInput = DestinationFormSubmitInput;
export type PreviewDestinationFormInput = DestinationFormPreviewInput;
export type PreviewEditDestinationFormInput = DestinationFormPreviewInput & {
  id: string;
};

export type EditDestinationFormInput = DestinationFormSubmitInput & {
  id: string;
};

/**
 * Form action return values.
 * - DTO results come from server functions / `@tocsin/core`
 * - `false` keeps create forms open after a handled failure
 * - `null` / `undefined` / `void` are treated as non-blocking completion
 */
export type DestinationSubmitResult =
  | DestinationListItem
  | DestinationPreviewResult
  | DestinationTestResult
  | false
  | null
  | undefined
  | void;

export type DestinationSubmitHandler<TInput> = (
  input: TInput,
) => DestinationSubmitResult | Promise<DestinationSubmitResult>;
