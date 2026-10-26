import { z } from "zod";

import {
  CreateDestinationCommandSchema,
  DESTINATION_HEALTH_RECENT_FAILURE_HOURS,
  DeleteDestinationCommandSchema,
  GetDestinationTemplateDraftCommandSchema,
  JsonObjectSchema,
  PreviewDestinationDraftCommandSchema,
  PreviewDestinationCommandSchema,
  PreviewDestinationUpdateCommandSchema,
  TestDestinationCommandSchema,
  UpdateDestinationCommandSchema,
  type CreateDestinationCommand,
  type DeleteDestinationCommand,
  type DeletionImpact,
  type GetDestinationTemplateDraftCommand,
  type DestinationDeleteResult,
  type DestinationListItem,
  type DestinationPreviewResult,
  type DestinationPreviewSample,
  type DestinationSummary,
  type DestinationTestResult,
  type JsonObject,
  type PreviewDestinationDraftCommand,
  type PreviewDestinationCommand,
  type PreviewDestinationUpdateCommand,
  type SourceSummary,
  type TestDestinationCommand,
  type UpdateDestinationCommand,
} from "@tocsin/core";
import { redactHeaders, redactJsonText } from "@tocsin/core";
import type { DestinationCatalogItem } from "@tocsin/destinations";
import { DestinationTemplateEngine } from "@tocsin/destinations";
import type { TemplateDiagnostic } from "@tocsin/destinations";

import { RecordNotFoundError } from "#/infra/sqlite/errors";
import {
  destinationEditorFormDraftFromRuntime,
  destinationListItemFromRuntime,
  destinationOperationalConfigFromRuntime,
  destinationSummaryFromRuntime,
} from "#/infra/sqlite/repositories/destination/destination.helpers";
import {
  createTestNormalizedEvent,
  mergeJsonObjects,
  parseDestinationConfig,
  redactNullableText,
  requireExistingFeishuAppRefs,
} from "#/server/configuration/configuration-support";
import type {
  DestinationServiceOptions,
  DestinationTemplateDraft,
} from "#/server/destinations/destination.service.types";

export class DestinationService {
  private readonly store: DestinationServiceOptions["store"];
  private readonly destinations: DestinationServiceOptions["destinations"];
  private readonly destinationSendContext: DestinationServiceOptions["destinationSendContext"];
  private readonly resolveDestinationConfig: DestinationServiceOptions["resolveDestinationConfig"];
  private readonly now: () => string;

  constructor(options: DestinationServiceOptions) {
    this.store = options.store;
    this.destinations = options.destinations;
    this.destinationSendContext = options.destinationSendContext;
    this.resolveDestinationConfig = options.resolveDestinationConfig;
    this.now = options.now ?? (() => new Date().toISOString());
  }

  listDestinationCatalog(): DestinationCatalogItem[] {
    return this.destinations.toCatalog();
  }

  async listDestinations(): Promise<DestinationListItem[]> {
    const since = new Date(
      Date.parse(this.now()) - DESTINATION_HEALTH_RECENT_FAILURE_HOURS * 60 * 60 * 1000,
    ).toISOString();
    const [destinations, healthRows] = await Promise.all([
      this.store.destinations.list(),
      this.store.history.destinationDeliveryHealth({ since }),
    ]);
    const healthByDestination = new Map(healthRows.map((row) => [row.destinationId, row] as const));

    return destinations.map((destination) =>
      destinationListItemFromRuntime(destination, healthByDestination.get(destination.id)),
    );
  }

  async createDestination(command: CreateDestinationCommand): Promise<DestinationListItem> {
    const input = CreateDestinationCommandSchema.parse(command);
    const config = parseDestinationConfig(this.destinations, input.kind, input.config);

    await requireExistingFeishuAppRefs(config, this.store.feishuApps);

    const created = await this.store.destinations.create({
      name: input.name,
      kind: input.kind,
      enabled: input.enabled,
      config,
      secretRefs: input.secretRefs,
    });

    return destinationListItemFromRuntime(created);
  }

  async updateDestination(command: UpdateDestinationCommand): Promise<DestinationListItem> {
    const input = UpdateDestinationCommandSchema.parse(command);
    const current = await this.store.destinations.get(input.id);
    const kind = input.kind ?? current?.kind;
    const config =
      current && (input.config !== undefined || input.kind !== undefined)
        ? mergeJsonObjects(current.config, input.config ?? {})
        : input.config;
    const parsedConfig =
      config && kind ? parseDestinationConfig(this.destinations, kind, config) : config;

    if (parsedConfig) {
      await requireExistingFeishuAppRefs(parsedConfig, this.store.feishuApps);
    }

    const updated = await this.store.destinations.update(input.id, {
      name: input.name,
      kind: input.kind,
      enabled: input.enabled,
      config: parsedConfig,
      secretRefs: input.secretRefs,
    });

    return destinationListItemFromRuntime(updated);
  }

  /**
   * History rows a destination delete would cascade to. Events survive a
   * destination delete, so its impact only covers the deliveries it received.
   */
  async previewDeleteDestination(command: DeleteDestinationCommand): Promise<DeletionImpact> {
    const input = DeleteDestinationCommandSchema.parse(command);
    const destination = await this.store.destinations.get(input.id);

    if (!destination) {
      throw new RecordNotFoundError("Destination", input.id);
    }

    return this.store.history.countDeletionImpact({ destinationId: input.id });
  }

  async deleteDestination(command: DeleteDestinationCommand): Promise<DestinationDeleteResult> {
    const input = DeleteDestinationCommandSchema.parse(command);

    await this.store.transaction(async (tx) => {
      await tx.destinations.delete(input.id);
      await tx.routes.removeDestinationReference(input.id);
    });

    return { id: input.id };
  }

  async getDestinationTemplateDraft(
    command: GetDestinationTemplateDraftCommand,
  ): Promise<DestinationTemplateDraft> {
    const input = GetDestinationTemplateDraftCommandSchema.parse(command);
    const destination = await this.store.destinations.get(input.id);

    if (!destination) {
      throw new RecordNotFoundError("Destination", input.id);
    }

    const config = parseDestinationConfig(this.destinations, destination.kind, destination.config);
    const parsedTemplate = JsonObjectSchema.safeParse(config.template);

    return {
      destinationId: destination.id,
      kind: destination.kind,
      template: parsedTemplate.success ? parsedTemplate.data : null,
      operationalConfig: destinationOperationalConfigFromRuntime(destination),
      form: destinationEditorFormDraftFromRuntime(destination),
    };
  }

  async testDestination(command: TestDestinationCommand): Promise<DestinationTestResult> {
    const input = TestDestinationCommandSchema.parse(command);
    const destination = await this.store.destinations.get(input.id);

    if (!destination) {
      throw new RecordNotFoundError("Destination", input.id);
    }

    // A historical Event makes the test exercise the same template fields and
    // message shape as a real delivery; the built-in sample stays the default
    // so credentials can be verified without any stored history.
    const sample = input.sampleEventId
      ? await this.resolvePreviewSample(input.sampleEventId)
      : null;
    const source: SourceSummary = sample?.metadata.source ?? {
      id: "test-source",
      name: "Tocsin test",
      provider: "generic",
      enabled: true,
    };
    const summary = destinationSummaryFromRuntime(destination);
    const normalizedEvent = sample?.normalizedEvent ?? createTestNormalizedEvent();
    const settings = await this.store.settings.get();
    const config = this.resolveDestinationConfig
      ? await this.resolveDestinationConfig({
          kind: destination.kind,
          config: destination.config,
        })
      : destination.config;
    const result = await this.destinations.send(
      destination.kind,
      {
        eventId: sample?.metadata.eventId ?? `test-${Date.now()}`,
        source,
        destination: summary,
        normalizedEvent,
        ...(sample ? { payload: sample.payload } : {}),
        config,
        presentation: { locale: settings.locale, timeZone: settings.timeZone },
      },
      this.destinationSendContext,
    );

    return {
      destination: summary,
      success: result.ok,
      statusCode: result.statusCode,
      responseBody: redactNullableText(result.responseBody),
      error: redactNullableText(result.ok ? null : result.errorMessage),
      // The adapter renders operator-owned templates and event data. Project
      // the outbound body before it becomes a dashboard DTO, the same way the
      // delivery detail read path does.
      renderedPayload: redactJsonText(result.renderedPayload),
    };
  }

  async previewDestination(command: PreviewDestinationCommand): Promise<DestinationPreviewResult> {
    const input = PreviewDestinationCommandSchema.parse(command);
    const destination = await this.store.destinations.get(input.id);

    if (!destination) {
      throw new RecordNotFoundError("Destination", input.id);
    }

    return this.previewDestinationConfig(
      destinationSummaryFromRuntime(destination),
      destination.config,
      input.sampleEventId,
      {
        sampleStatus: input.sampleStatus,
      },
    );
  }

  async previewDestinationDraft(
    command: PreviewDestinationDraftCommand,
  ): Promise<DestinationPreviewResult> {
    const input = PreviewDestinationDraftCommandSchema.parse(command);
    const destination: DestinationSummary = {
      id: "preview-destination",
      name: input.name,
      kind: input.kind,
      enabled: true,
    };
    const templateDiagnostics = templateDiagnosticsFromConfigParseError(() =>
      parseDestinationConfig(this.destinations, input.kind, input.config),
    );

    if (templateDiagnostics) {
      return this.previewDestinationConfig(destination, input.config, input.sampleEventId, {
        diagnostics: templateDiagnostics,
        sampleStatus: input.sampleStatus,
      });
    }

    const config = parseDestinationConfig(this.destinations, input.kind, input.config);

    return this.previewDestinationConfig(destination, config, input.sampleEventId, {
      sampleStatus: input.sampleStatus,
    });
  }

  async previewDestinationUpdate(
    command: PreviewDestinationUpdateCommand,
  ): Promise<DestinationPreviewResult> {
    const input = PreviewDestinationUpdateCommandSchema.parse(command);
    const current = await this.store.destinations.get(input.id);

    if (!current) {
      throw new RecordNotFoundError("Destination", input.id);
    }

    const mergedConfig = mergeJsonObjects(current.config, input.config);
    const destination: DestinationSummary = {
      id: current.id,
      name: input.name ?? current.name,
      kind: current.kind,
      enabled: current.enabled,
    };
    const templateDiagnostics = templateDiagnosticsFromConfigParseError(() =>
      parseDestinationConfig(this.destinations, current.kind, mergedConfig),
    );

    if (templateDiagnostics) {
      return this.previewDestinationConfig(destination, mergedConfig, input.sampleEventId, {
        diagnostics: templateDiagnostics,
        sampleStatus: input.sampleStatus,
      });
    }

    const config = parseDestinationConfig(this.destinations, current.kind, mergedConfig);

    return this.previewDestinationConfig(destination, config, input.sampleEventId, {
      sampleStatus: input.sampleStatus,
    });
  }

  private async previewDestinationConfig(
    destination: DestinationSummary,
    config: JsonObject,
    sampleEventId?: string,
    options: {
      diagnostics?: TemplateDiagnostic[];
      sampleStatus?: "firing" | "resolved" | "unknown";
    } = {},
  ): Promise<DestinationPreviewResult> {
    const sample = await this.resolvePreviewSample(sampleEventId, options.sampleStatus);
    const settings = await this.store.settings.get();
    const input = {
      eventId: sample.metadata.eventId,
      source: sample.metadata.source,
      destination,
      normalizedEvent: sample.normalizedEvent,
      payload: sample.payload,
      config,
      presentation: { locale: settings.locale, timeZone: settings.timeZone },
    };

    const context = DestinationTemplateEngine.createRenderContext(input);
    const diagnostics = options.diagnostics ?? DestinationTemplateEngine.diagnoseConfig(config);

    if (diagnostics.some((diagnostic) => diagnostic.severity === "error")) {
      return {
        destination,
        renderedPayload: redactJsonText(templateDiagnosticsPayload(diagnostics)),
        sample: sample.metadata,
        context,
        normalizedEvent: sample.normalizedEvent,
        diagnostics,
        rawPayloadReference: sample.rawPayloadReference,
      };
    }

    try {
      return {
        destination,
        renderedPayload: redactJsonText(await this.destinations.preview(destination.kind, input)),
        sample: sample.metadata,
        context,
        normalizedEvent: sample.normalizedEvent,
        diagnostics,
        rawPayloadReference: sample.rawPayloadReference,
      };
    } catch (error) {
      if (!DestinationTemplateEngine.isValidationError(error)) {
        throw error;
      }

      return {
        destination,
        renderedPayload: redactJsonText(DestinationTemplateEngine.validationErrorToPayload(error)),
        sample: sample.metadata,
        context,
        normalizedEvent: sample.normalizedEvent,
        diagnostics: error.diagnostics,
        rawPayloadReference: sample.rawPayloadReference,
      };
    }
  }

  private async resolvePreviewSample(
    sampleEventId?: string,
    sampleStatus?: "firing" | "resolved" | "unknown",
  ) {
    if (!sampleEventId) {
      const source: SourceSummary = {
        id: "preview-source",
        name: "Tocsin preview",
        provider: "generic",
        enabled: true,
      };
      const metadata: DestinationPreviewSample = {
        kind: "built_in",
        eventId: "preview-event",
        source,
        receivedAt: null,
      };

      const normalizedEvent = createTestNormalizedEvent();

      return {
        metadata,
        normalizedEvent: sampleStatus
          ? { ...normalizedEvent, status: sampleStatus }
          : normalizedEvent,
        rawPayloadReference: null,
        payload: {},
      };
    }

    const detail = await this.store.history.getEventDetail(sampleEventId);

    if (!detail) {
      throw new RecordNotFoundError("Preview sample Event", sampleEventId);
    }

    const payload = redactJsonText(detail.event.rawPayload);

    return {
      metadata: {
        kind: "historical_event" as const,
        eventId: detail.event.id,
        source: detail.source,
        receivedAt: detail.event.receivedAt,
      },
      normalizedEvent: detail.event.normalized,
      payload,
      rawPayloadReference: {
        eventId: detail.event.id,
        payload,
        headers: redactHeaders(detail.event.rawHeaders),
      },
    };
  }
}

function templateDiagnosticsFromConfigParseError(
  parse: () => JsonObject,
): TemplateDiagnostic[] | null {
  try {
    parse();
    return null;
  } catch (error) {
    if (!isTemplateZodError(error)) {
      throw error;
    }

    return error.issues.map((issue) => ({
      severity: "error" as const,
      path: issue.path.join("."),
      variable: templateVariableFromMessage(issue.message),
      message: issue.message,
    }));
  }
}

function isTemplateZodError(error: unknown): error is z.ZodError {
  return (
    error instanceof z.ZodError &&
    error.issues.length > 0 &&
    error.issues.every((issue) => issue.path[0] === "template")
  );
}

function templateDiagnosticsPayload(diagnostics: TemplateDiagnostic[]): JsonObject {
  return {
    templateError: {
      diagnostics: diagnostics.map((diagnostic) => ({
        severity: diagnostic.severity,
        path: diagnostic.path ?? null,
        variable: diagnostic.variable ?? null,
        message: diagnostic.message,
      })),
    },
  };
}

function templateVariableFromMessage(message: string): string | undefined {
  return message.replace("Destination template contains unknown variable: ", "") || undefined;
}
