export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatCompletionOptions {
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  model?: string;
  responseFormat?: { type: 'json_object' } | { type: 'text' };
}

export interface ChatCompletionResponse {
  content: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

// Default chosen from the live NVIDIA catalog for this account: reliably
// available, clean instruction output and multilingual. Override with
// NVIDIA_MODEL — the provider is fully env-driven.
const DEFAULT_MODEL = 'meta/llama-3.2-11b-vision-instruct';
const DEFAULT_TEMPERATURE = 0.2;
const DEFAULT_MAX_TOKENS = 2048;

export class NvidiaLlmError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly retryable: boolean = false,
  ) {
    super(message);
    this.name = 'NvidiaLlmError';
  }
}

function getConfig() {
  // Read lazily at request time so the root .env (loaded by @oncobrief/db) is
  // already in process.env. The key never leaves the server.
  const apiKey = process.env.NVIDIA_API_KEY;
  const baseUrl = process.env.NVIDIA_BASE_URL ?? 'https://integrate.api.nvidia.com/v1';
  const model = process.env.NVIDIA_MODEL ?? DEFAULT_MODEL;

  if (!apiKey) {
    throw new NvidiaLlmError('NVIDIA_API_KEY not configured', 500, false);
  }

  return { apiKey, baseUrl, model };
}

export async function chatCompletion(
  options: ChatCompletionOptions,
): Promise<ChatCompletionResponse> {
  const { apiKey, baseUrl, model } = getConfig();
  const actualModel = options.model ?? model;

  const payload = {
    model: actualModel,
    messages: options.messages,
    temperature: options.temperature ?? DEFAULT_TEMPERATURE,
    max_tokens: options.maxTokens ?? DEFAULT_MAX_TOKENS,
    response_format: options.responseFormat ?? { type: 'text' },
    stream: false,
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000);

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      let errorMessage = `NVIDIA API error: ${response.status}`;
      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.error?.message ?? errorMessage;
      } catch {
        errorMessage = errorText || errorMessage;
      }

      const retryable = response.status >= 500 || response.status === 429;
      throw new NvidiaLlmError(errorMessage, response.status, retryable);
    }

    const data = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
      usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
    };
    const choice = data.choices?.[0];
    if (!choice?.message?.content) {
      throw new NvidiaLlmError('Empty response from NVIDIA API', 500, true);
    }

    return {
      content: choice.message.content,
      usage: data.usage
        ? {
            promptTokens: data.usage.prompt_tokens,
            completionTokens: data.usage.completion_tokens,
            totalTokens: data.usage.total_tokens,
          }
        : undefined,
    };
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof NvidiaLlmError) throw error;
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new NvidiaLlmError('Request timeout', 504, true);
    }
    throw new NvidiaLlmError(`Network error: ${error instanceof Error ? error.message : 'unknown'}`, 500, true);
  }
}

export async function chatCompletionWithRetry(
  options: ChatCompletionOptions,
  maxRetries = 1,
): Promise<ChatCompletionResponse> {
  let lastError: Error | undefined;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await chatCompletion(options);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (error instanceof NvidiaLlmError && !error.retryable) {
        throw error;
      }
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
      }
    }
  }
  throw lastError;
}