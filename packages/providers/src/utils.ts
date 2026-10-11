import type { SourceProvider } from "@tocsin/core";
import type { z } from "zod";

import type {
  ProviderAdapter,
  ProviderAdapterDefinition,
  ProviderParseFailure,
  ProviderParseInput,
  ProviderParseOutput,
  ProviderParseResult,
  ProviderStandaloneParseInput,
} from "#providers/types";

type ProviderParseSuccessResult = Extract<ProviderParseResult, { ok: true }>;
type ProviderParseFailureResult = Extract<ProviderParseResult, { ok: false }>;

export class Adapter {
  static define<Provider extends SourceProvider, Schema extends z.ZodType>(
    adapter: ProviderAdapterDefinition<Provider, Schema>,
  ): ProviderAdapter<Provider, z.output<Schema>> {
    return adapter as ProviderAdapter<Provider, z.output<Schema>>;
  }
}

export class ParseInput {
  static fromStandalone<Provider extends SourceProvider, Config>(
    provider: Provider,
    input: ProviderStandaloneParseInput<Config>,
    config: Config,
  ): ProviderParseInput<Config> {
    return {
      source: input.source ?? {
        id: input.sourceId,
        name: input.sourceName,
        provider,
        enabled: true,
      },
      sourceId: input.sourceId,
      sourceName: input.sourceName,
      receivedAt: input.receivedAt,
      headers: input.headers,
      payload: input.payload,
      config,
    };
  }
}

export class ParseResult {
  static ok(input: ProviderParseOutput): ProviderParseSuccessResult {
    return {
      ok: true,
      ...input,
    };
  }

  static fail(input: Omit<ProviderParseFailure, "ok">): ProviderParseFailureResult {
    return {
      ok: false,
      ...input,
    };
  }

  static invalidPayload(input: {
    error: unknown;
    provider: SourceProvider;
    parserVersion: number;
  }): ProviderParseFailureResult {
    return this.fail({
      reason: "invalid_payload",
      message: input.error instanceof Error ? input.error.message : String(input.error),
      providerMetadata: {
        provider: input.provider,
        parserVersion: input.parserVersion,
      },
    });
  }

  static unwrap(result: ProviderParseResult): ProviderParseOutput {
    if (result.ok) {
      return {
        normalized: result.normalized,
        providerMetadata: result.providerMetadata,
        idempotencyKey: result.idempotencyKey,
      };
    }

    throw new Error(result.message);
  }
}
