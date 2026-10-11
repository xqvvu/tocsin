import type {
  DestinationListItem,
  DestinationPreviewResult,
  DestinationSummary,
  DestinationTestResult,
} from "@tocsin/core";
import type { DestinationCatalogItem } from "@tocsin/destinations";

export type { DestinationListItem, DestinationSummary };

export type DestinationCatalog = DestinationCatalogItem[];

/** Dashboard list/query surface — always includes secret-safe config summary. */
export type DestinationRow = DestinationListItem;

/** Test mutation notice — same contract as `@tocsin/core` DestinationTestResult. */
export type DestinationTestNotice = DestinationTestResult;

/** Preview mutation notice — same contract as `@tocsin/core` DestinationPreviewResult. */
export type DestinationPreviewNotice = DestinationPreviewResult;
