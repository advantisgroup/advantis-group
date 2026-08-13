import { Anthropic } from "@anthropic-ai/sdk";

import { requireEnv } from "./env.js";
import { ProviderError } from "./errors.js";

export class AnthropicClient {
  #client: Anthropic | undefined;

  async createMessage(
    params: Anthropic.MessageCreateParamsNonStreaming,
  ): Promise<Anthropic.Message> {
    try {
      return await this.client.messages.create(params);
    } catch (error) {
      throw this.toProviderError("messages.create", error);
    }
  }

  streamMessages(params: Anthropic.MessageStreamParams) {
    try {
      return this.client.messages.stream(params);
    } catch (error) {
      throw this.toProviderError("messages.stream", error);
    }
  }

  private get client(): Anthropic {
    if (!this.#client) {
      this.#client = new Anthropic({ apiKey: requireEnv("ANTHROPIC_API_KEY") });
    }
    return this.#client;
  }

  private toProviderError(operation: string, error: unknown): ProviderError {
    if (error instanceof Anthropic.APIError) {
      return new ProviderError({
        provider: "anthropic",
        operation,
        code: error.status === 429 ? "rate_limited" : "upstream",
        status: error.status === 429 ? 429 : 502,
        retryable: error.status === 429 || error.status === 408 || error.status >= 500,
        providerRequestId: error.requestID ?? undefined,
        detail: `${error.name}: ${error.message}`,
      });
    }
    return new ProviderError({
      provider: "anthropic",
      operation,
      detail: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
    });
  }
}

export const anthropic = new AnthropicClient();
