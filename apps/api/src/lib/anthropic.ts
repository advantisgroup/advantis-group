import { Anthropic } from "@anthropic-ai/sdk";

import { requireEnv } from "./env.js";
import { ProviderError } from "./errors.js";

/** The SDK's request and response types, for routes that build tool calls —
 * they come through here so the SDK itself is only imported in this file. */
export type { Anthropic };

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

  /** Streams a reply, handing the text so far to `onText` on every delta.
   * Failures mid-stream are converted like a failed create; an abort through
   * `signal` is rethrown untouched so the caller can tell a stop from a fault. */
  async streamText(
    params: Anthropic.MessageStreamParams,
    { signal, onText }: { signal?: AbortSignal; onText?: (soFar: string) => void } = {},
  ): Promise<{ text: string; message: Anthropic.Message }> {
    try {
      const stream = this.client.messages.stream(params, { signal });
      let text = "";
      for await (const event of stream) {
        if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
          text += event.delta.text;
          onText?.(text);
        }
      }
      return { text, message: await stream.finalMessage() };
    } catch (error) {
      if (signal?.aborted) throw error;
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
