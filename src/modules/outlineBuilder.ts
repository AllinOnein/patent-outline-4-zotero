import { config } from "../../package.json";
import type { ContentItem } from "./contentExtractor";
import type { AIClientConfig } from "./aiClient";
import { callAI, DEFAULT_MAX_TOKENS } from "./aiClient";
import type { PromptStats } from "./promptBuilder";
import { buildOutlinePrompt, DEFAULT_MAX_PROMPT_CHARS } from "./promptBuilder";
import {
  saveRawContentSample,
  savePrompt,
  saveAIResponse,
  saveFinalOutline,
} from "../utils/debug";

/** Safe logger: the toolkit is undefined when the parser runs in unit tests. */
function debugLog(...args: any[]): void {
  if (typeof ztoolkit !== "undefined") {
    ztoolkit.log(...args);
  }
}

export interface OutlineNode {
  title: string;
  page: number;
  level: number;
}

export interface OutlineResult {
  outline: OutlineNode[];
  stats: PromptStats;
  finishReason?: string;
  debugFiles: {
    rawContentSample: string | null;
    prompt: string | null;
    aiResponse: string | null;
    finalOutline: string | null;
  };
}

export async function buildOutline(
  contentItems: ContentItem[],
  aiConfig: AIClientConfig,
  itemId: number,
  signal?: AbortSignal,
): Promise<OutlineResult> {
  const { system, user, stats } = buildOutlinePrompt(contentItems, {
    maxChars: getMaxPromptChars(),
  });

  if (stats.truncated) {
    debugLog(
      `[outline] prompt downsampled: ${stats.total} → ${stats.selected} items`,
    );
  }

  const rawContentPath = await saveRawContentSample(itemId, contentItems);
  const promptPath = await savePrompt(itemId, system, user);

  const messages = [
    { role: "system" as const, content: system },
    { role: "user" as const, content: user },
  ];
  const maxTokens = getMaxTokens();

  let response = await callAI(aiConfig, messages, { maxTokens, signal });

  if (response.finishReason === "length") {
    // The outline was cut off by the output budget (reasoning models spend part
    // of it on reasoning). Retry once with a bigger budget; if the provider
    // rejects it, the truncated reply is salvaged below.
    debugLog(
      `[outline] output truncated at ${maxTokens} tokens, retrying with a larger budget`,
    );
    try {
      const retry = await callAI(aiConfig, messages, {
        maxTokens: Math.min(Math.max(maxTokens * 4, 32768), 65536),
        signal,
      });
      if (retry.content.length > response.content.length) {
        response = retry;
      }
    } catch (err) {
      debugLog("[outline] retry with a larger output budget failed", err);
    }
  }

  const aiResponsePath = await saveAIResponse(itemId, response.content);

  const outline = parseAIResponse(response.content, response.finishReason);

  const outlinePath = await saveFinalOutline(itemId, outline);

  return {
    outline,
    stats,
    finishReason: response.finishReason,
    debugFiles: {
      rawContentSample: rawContentPath,
      prompt: promptPath,
      aiResponse: aiResponsePath,
      finalOutline: outlinePath,
    },
  };
}

function getMaxTokens(): number {
  try {
    const value = Number(
      Zotero.Prefs.get(`${config.prefsPrefix}.ai.maxTokens`, true),
    );
    if (Number.isFinite(value) && value >= 256) return value;
  } catch {
    // use the default
  }
  return DEFAULT_MAX_TOKENS;
}

function getMaxPromptChars(): number {
  try {
    const value = Zotero.Prefs.get(
      `${config.prefsPrefix}.outline.maxInputChars`,
      true,
    );
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed >= 4000) return parsed;
  } catch {
    // use the default
  }
  return DEFAULT_MAX_PROMPT_CHARS;
}

export function parseAIResponse(
  raw: string,
  finishReason?: string,
): OutlineNode[] {
  let cleaned = raw.trim();

  const codeBlockMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    cleaned = codeBlockMatch[1].trim();
  }

  for (const candidate of [cleaned, matchArray(cleaned)]) {
    if (!candidate) continue;
    try {
      const parsed = JSON.parse(candidate);
      if (Array.isArray(parsed)) {
        const outline = normalizeOutline(parsed);
        if (outline.length > 0) return outline;
      }
    } catch {
      // try the next strategy
    }
  }

  // The model may have been cut off by max_tokens: keep the complete objects
  const repaired = repairTruncatedArray(cleaned);
  if (repaired.length > 0) {
    debugLog(
      `[outline] recovered ${repaired.length} entries from truncated JSON`,
    );
    return repaired;
  }

  throw new Error(
    `AI 返回内容不是有效的 JSON 数组（finish_reason=${finishReason ?? "unknown"}）：${raw.slice(0, 200)}`,
  );
}

function matchArray(text: string): string | null {
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start === -1 || end <= start) return null;
  return text.slice(start, end + 1);
}

/** Salvage complete `{...}` entries from a JSON array cut off mid-object. */
function repairTruncatedArray(text: string): OutlineNode[] {
  const start = text.indexOf("[");
  if (start === -1) return [];

  const body = text.slice(start);
  const lastObjectEnd = body.lastIndexOf("}");
  if (lastObjectEnd === -1) return [];

  try {
    const parsed = JSON.parse(`${body.slice(0, lastObjectEnd + 1)}]`);
    if (Array.isArray(parsed)) return normalizeOutline(parsed);
  } catch {
    // fall through
  }

  return [];
}

function normalizeOutline(nodes: any[]): OutlineNode[] {
  const outline: OutlineNode[] = [];

  for (const node of nodes) {
    if (!node || typeof node !== "object") continue;

    const title = typeof node.title === "string" ? node.title.trim() : "";
    if (!title) continue;

    const page = Number(node.page);
    if (!Number.isFinite(page) || page < 1) continue;

    const level = Number(node.level);
    outline.push({
      title,
      page: Math.round(page),
      level: Number.isFinite(level)
        ? Math.min(4, Math.max(1, Math.round(level)))
        : 1,
    });
  }

  return outline;
}
