import type { ZodType } from "zod";

export interface StructuredAIRequest<T> {
  operation: string;
  schemaName: string;
  schema: ZodType<T>;
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
  maxOutputTokens?: number;
  signal?: AbortSignal;
}

export interface AIProviderUsage {
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
}

export interface StructuredAIProviderResult<T> {
  value: T;
  provider: string;
  model: string;
  attempts: number;
  repairAttempted: boolean;
  responseSha256: string;
  usage: AIProviderUsage;
}

export interface AIProviderStatus {
  provider: string;
  configured: boolean;
  model: string | null;
  timeoutMs: number;
  maxRetries: number;
}

export interface AIProvider {
  readonly name: string;
  status(): AIProviderStatus;
  generateStructured<T>(
    request: StructuredAIRequest<T>,
  ): Promise<StructuredAIProviderResult<T>>;
}

export class AIProviderError extends Error {
  attempts = 0;
  repairAttempted = false;

  constructor(
    public readonly code: string,
    message: string,
    public readonly retryable: boolean,
    public readonly provider: string,
    public readonly statusCode?: number,
  ) {
    super(message);
    this.name = "AIProviderError";
  }
}

export interface ResilientAIResult<T> {
  value: T;
  source: "AI" | "FALLBACK";
  provider: string | null;
  model: string | null;
  attempts: number;
  repairAttempted: boolean;
  responseSha256: string | null;
  usage: AIProviderUsage;
  fallbackReason: string | null;
}
