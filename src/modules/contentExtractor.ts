import type { ContentListEntry } from "./zipReader";

export interface ContentItem {
  text: string;
  page: number;
  textLevel?: number;
}

const IMAGE_FILE_RE = /\.(png|jpe?g|gif|bmp|svg|webp|tiff?)$/i;

export function extractContent(
  entries: ContentListEntry[],
): ContentItem[] {
  return entries
    .filter((e) => e.text && e.text.trim())
    .filter((e) => !IMAGE_FILE_RE.test(e.text.trim()))
    .map((e) => ({
      text: e.text.trim().slice(0, 200),
      page: e.page_idx + 1, // MinerU uses 0-indexed → convert to 1-indexed
      textLevel: e.text_level > 0 ? e.text_level : undefined,
    }));
}
