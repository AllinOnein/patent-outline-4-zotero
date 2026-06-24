export interface AIClientConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

const AI_TIMEOUT_MS = 300000; // 5 minutes for large patents

export async function callAI(
  config: AIClientConfig,
  messages: ChatMessage[],
  _signal?: AbortSignal,
): Promise<string> {
  const url = `${config.baseUrl.replace(/\/+$/, "")}/chat/completions`;

  if (!config.apiKey) {
    return Promise.reject(new Error("API key is empty"));
  }

  const xhr = new XMLHttpRequest();

  return new Promise<string>((resolve, reject) => {
    xhr.open("POST", url, true);
    xhr.setRequestHeader("Content-Type", "application/json");
    xhr.setRequestHeader("Authorization", `Bearer ${config.apiKey}`);

    xhr.timeout = AI_TIMEOUT_MS;

    xhr.onload = () => {
      const responseText = xhr.responseText || "";
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const data = JSON.parse(responseText);
          if (data?.choices?.[0]?.message?.content) {
            resolve(data.choices[0].message.content);
          } else {
            reject(
              new Error(
                `AI response missing content: ${responseText.slice(0, 200)}`,
              ),
            );
          }
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
            `AI API error (${xhr.status}): ${(responseText || xhr.statusText).slice(0, 200)}`,
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

    const body = JSON.stringify({
      model: config.model,
      messages,
      temperature: 0.1,
      max_tokens: 8192,
    });

    xhr.send(body);
  });
}

export function readAIConfig(): AIClientConfig | null {
  const zotero = (globalThis as any).Zotero;
  if (!zotero?.Prefs) return null;

  const prefsPrefix: string =
    (globalThis as any)?.addon?.data?.config?.prefsPrefix ??
    "extensions.zotero.patentplus";

  const baseUrl =
    zotero.Prefs.get(`${prefsPrefix}.ai.baseUrl`, true) || "";
  const apiKey =
    zotero.Prefs.get(`${prefsPrefix}.ai.apiKey`, true) || "";
  const model =
    zotero.Prefs.get(`${prefsPrefix}.ai.model`, true) || "";

  if (!baseUrl || !apiKey || !model) return null;

  return { baseUrl, apiKey, model };
}
