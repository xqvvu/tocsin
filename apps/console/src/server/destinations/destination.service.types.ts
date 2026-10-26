import type {
  DestinationDeleteResult,
  DestinationEditorDraftResult,
  DestinationListItem,
  DestinationPreviewResult,
  DestinationTestResult,
} from "@tocsin/core";
import type { DestinationRegistry, DestinationSendContext } from "@tocsin/destinations";

import type { SqliteStore } from "#/infra/sqlite/store";
import type { DestinationConfigResolver } from "#/server/integrations/destination-config-resolver";

export interface DestinationServiceOptions {
  store: SqliteStore;
  destinations: DestinationRegistry;
  destinationSendContext?: DestinationSendContext;
  /** Resolves server-side references (for example a Feishu app credential) before a test send. */
  resolveDestinationConfig?: DestinationConfigResolver;
  /** Injectable clock so tests can pin the delivery-health window boundary. */
  now?: () => string;
}

/** Re-exported dashboard DTOs — source of truth is `@tocsin/core`. */
export type {
  DestinationDeleteResult,
  DestinationEditorDraftResult,
  DestinationListItem,
  DestinationPreviewResult,
  DestinationTestResult,
};

/** Edit dialog draft: operational form fields + template (no signing secrets). */
export type DestinationTemplateDraft = DestinationEditorDraftResult;
