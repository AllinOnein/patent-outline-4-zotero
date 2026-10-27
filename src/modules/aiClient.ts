export interface AIClientConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AIResponse {
  content: string;
  finishReason?: string;
  /** Length of the model's reasoning output, when the provider returns it. */
  reasoningLength?: number;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
}

const AI_TIMEOUT_MS = 300000; // 5 minutes for large patents
const PREFS_PREFIX = "extensions.zotero.patentplus";

export const DEFAULT_MAX_TOKENS = 8192;

export interface CallAIOptions {
  signal?: AbortSignal;
  /** Upper bound for the reply (reasoning tokens included on some models). */
  maxTokens?: number;
}

export async function callAI(
  config: AIClientConfig,
  messages: ChatMessage[],
  options: CallAIOptions = {},
): Promise<AIResponse> {
  const url = `${config.baseUrl.replace(/\/+$/, "")}/chat/completions`;

  if (!config.apiKey) {
    return Promise.reject(new Error("API key is empty"));
  }

  const xhr = new XMLHttpRequest();

  return new Promise<AIResponse>((resolve, reject) => {
    xhr.open("POST", url, true);
    xhr.setRequestHeader("Content-Type", "application/json");
    xhr.setRequestHeader("Authorization", `Bearer ${config.apiKey}`);

    xhr.timeout = AI_TIMEOUT_MS;

    xhr.onload = () => {
      const responseText = xhr.responseText || "";
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const data = JSON.parse(responseText);
          const message = data?.choices?.[0]?.message;
          const content: string = message?.content ?? "";
          const reasoning: string = message?.reasoning_content ?? "";

          if (!content.trim()) {
            // Reasoning models can spend the whole output budget on
            // `reasoning_content` and return an empty `content`
            reject(
              new Error(
                reasoning
                  ? `模型只返回了思考内容（${reasoning.length} 字），content 为空。请关闭思考模式或增大 max_tokens。`
                  : `AI 响应缺少 content：${responseText.slice(0, 200)}`,
              ),
            );
            return;
          }

          resolve({
            content,
            finishReason: data?.choices?.[0]?.finish_reason,
            reasoningLength: reasoning.length || undefined,
            usage: data?.usage,
          });
        } catch (parseErr) {
          reject(
            new Error(
              `Failed to parse AI response: ${(parseErr as Error).message}. Raw: ${responseText.slice(0, 200)}`,
            ),
          );
        }
      } else {
        reject(
          new Error(
            `AI API error (${xhr.status}): ${(responseText || xhr.statusText).slice(0, 300)}`,
          ),
        );
      }
    };

    xhr.onerror = () => {
      reject(new Error(`Network request failed`));
    };

    xhr.ontimeout = () => {
      ztoolkit.log(`[aiClient] request timed out after ${AI_TIMEOUT_MS}ms`);
      reject(new Error(`Request timed out after ${AI_TIMEOUT_MS / 1000}s`));
    };

    xhr.onabort = () => {
      reject(new Error("Request was aborted"));
    };

    const body: Record<string, any> = {
      model: config.model,
      messages,
      temperature: 0.1,
      max_tokens: options.maxTokens ?? DEFAULT_MAX_TOKENS,
    };

    if (shouldDisableThinking(config)) {
      body.enable_thinking = false;
    }

    xhr.send(JSON.stringify(body));
  });
}

/**
 * DashScope/Qwen/DeepSeek models accept `enable_thinking: false`, which stops
 * them from spending the output budget (and a minute of latency) on reasoning
 * before writing the JSON answer. Other OpenAI-compatible providers may reject
 * unknown fields, so the flag is only sent to endpoints known to support it.
 */
function shouldDisableThinking(config: AIClientConfig): boolean {
  try {
    const pref = Zotero.Prefs.get(`${PREFS_PREFIX}.ai.disableThinking`, true);
    if (pref === false) return false;
  } catch {
    // fall through with the default (enabled)
  }

  try {
    const host = new URL(config.baseUrl).hostname;
    return /(^|\.)aliyuncs\.com$|(^|\.)bailian\.aliyun\.com$/i.test(host);
  } catch {
    return false;
  }
}

export function readAIConfig(): AIClientConfig | null {
  const zotero = (globalThis as any).Zotero;
  if (!zotero?.Prefs) return null;

  const prefsPrefix: string =
    (globalThis as any)?.addon?.data?.config?.prefsPrefix ?? PREFS_PREFIX;

  const baseUrl = zotero.Prefs.get(`${prefsPrefix}.ai.baseUrl`, true) || "";
  const apiKey = zotero.Prefs.get(`${prefsPrefix}.ai.apiKey`, true) || "";
  const model = zotero.Prefs.get(`${prefsPrefix}.ai.model`, true) || "";

  if (!baseUrl || !apiKey || !model) return null;

  return { baseUrl, apiKey, model };
}
