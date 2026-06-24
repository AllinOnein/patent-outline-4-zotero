import type { ContentItem } from "./contentExtractor";
import type { AIClientConfig } from "./aiClient";
import { callAI } from "./aiClient";
import { buildOutlinePrompt } from "./promptBuilder";
import {
  saveRawContentSample,
  savePrompt,
  saveAIResponse,
  saveFinalOutline,
} from "../utils/debug";

export interface OutlineNode {
  title: string;
  page: number;
  level: number;
}

export interface OutlineResult {
  outline: OutlineNode[];
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
  const { system, user } = buildOutlinePrompt(contentItems);

  const rawContentPath = await saveRawContentSample(itemId, contentItems);
  const promptPath = await savePrompt(itemId, system, user);

  const aiResponseText = await callAI(
    aiConfig,
    [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    signal,
  );

  const aiResponsePath = await saveAIResponse(itemId, aiResponseText);

  const outline = parseAIResponse(aiResponseText);

  const outlinePath = await saveFinalOutline(itemId, outline);

  return {
    outline,
    debugFiles: {
      rawContentSample: rawContentPath,
      prompt: promptPath,
      aiResponse: aiResponsePath,
      finalOutline: outlinePath,
    },
  };
}

function parseAIResponse(raw: string): OutlineNode[] {
  let cleaned = raw.trim();

  const codeBlockMatch = cleaned.match(
    /```(?:json)?\s*([\s\S]*?)```/,
  );
  if (codeBlockMatch) {
    cleaned = codeBlockMatch[1].trim();
  }

  try {
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed)) {
      return parsed as OutlineNode[];
    }
  } catch {
    // fall through
  }

  const arrayMatch = cleaned.match(/\[[\s\S]*\]/);
  if (arrayMatch) {
    try {
      const parsed = JSON.parse(arrayMatch[0]);
      if (Array.isArray(parsed)) {
        return parsed as OutlineNode[];
      }
    } catch {
      // fall through
    }
  }

  throw new Error(
    `Failed to parse AI response as JSON:\n${raw.slice(0, 500)}`,
  );
}