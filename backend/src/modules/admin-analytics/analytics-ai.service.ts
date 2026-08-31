import { createHash } from "node:crypto";

import { env } from "../../config/env.js";
import {
  AIProviderError,
  type AIProvider,
  type ResilientAIResult,
  type StructuredAIRequest,
} from "./analytics-ai.provider.js";
import { OpenRouterProvider } from "./analytics-openrouter.provider.js";

export class AnalyticsAIService {
  constructor(private readonly provider: AIProvider) {}

  status() {
    return {
      ...this.provider.status(),
      fallbackAvailable: true,
    };
  }

  async generateStructured<T>(
    request: StructuredAIRequest<T>,
    fallbackFactory: () => T | Promise<T>,
  ): Promise<ResilientAIResult<T>> {
    const status = this.provider.status();
    if (status.configured) {
      try {
        const result = await this.provider.generateStructured(request);
        return {
          value: result.value,
          source: "AI",
          provider: result.provider,
          model: result.model,
          attempts: result.attempts,
          repairAttempted: result.repairAttempted,
          responseSha256: result.responseSha256,
          usage: result.usage,
          fallbackReason: null,
        };
      } catch (error) {
        if (
          error instanceof AIProviderError &&
          error.code === "AI_REQUEST_ABORTED"
        ) {
          throw error;
        }
        return this.fallback(
          request,
          fallbackFactory,
          error instanceof AIProviderError
            ? error.code
            : "AI_INTERNAL_ERROR",
          error instanceof AIProviderError ? error.attempts : 0,
          error instanceof AIProviderError ? error.repairAttempted : false,
        );
      }
    }
    return this.fallback(
      request,
      fallbackFactory,
      "AI_PROVIDER_UNAVAILABLE",
      0,
      false,
    );
  }

  private async fallback<T>(
    request: StructuredAIRequest<T>,
    fallbackFactory: () => T | Promise<T>,
    reason: string,
    attempts: number,
    repairAttempted: boolean,
  ): Promise<ResilientAIResult<T>> {
    const candidate = await fallbackFactory();
    const validated = request.schema.safeParse(candidate);
    if (!validated.success) {
      throw new AIProviderError(
        "AI_FALLBACK_INVALID",
        "Deterministic fallback did not satisfy the response schema",
        false,
        "FALLBACK",
      );
    }
    const serialized = JSON.stringify(validated.data);
    return {
      value: validated.data,
      source: "FALLBACK",
      provider: null,
      model: null,
      attempts,
      repairAttempted,
      responseSha256: createHash("sha256").update(serialized).digest("hex"),
      usage: {
        promptTokens: null,
        completionTokens: null,
        totalTokens: null,
      },
      fallbackReason: reason,
    };
  }
}

const openRouterProvider = new OpenRouterProvider({
  apiKey: env.openRouterApiKey,
  model: env.openRouterModel,
  baseUrl: env.openRouterBaseUrl,
  timeoutMs: env.openRouterTimeoutMs,
  maxRetries: env.openRouterMaxRetries,
  maxOutputTokens: env.openRouterMaxOutputTokens,
  appName: env.openRouterAppName,
  siteUrl: env.openRouterSiteUrl,
});

export const analyticsAIService = new AnalyticsAIService(openRouterProvider);
