import type { ContentItem } from "./contentExtractor";
import { matchesPatentHeading } from "./patentPatterns";

const SYSTEM_PROMPT = `你是一名专利文档结构分析专家。

请根据以下MinerU解析结果：

1. 自动识别应进入PDF Bookmark（目录/大纲）的章节标题
2. 删除页眉页脚
3. 删除页码
4. 删除表格标题
5. 删除图片标题
6. 删除专利行政信息（申请号、公开号、INID代码等）
7. 构建层级结构（level 1-4）
8. 只返回JSON，不要输出任何解释文字

返回格式（严格JSON数组，无其他内容）：
[
  {"title":"章节标题","page":1,"level":1},
  {"title":"子章节标题","page":2,"level":2}
]

要求：
- 保留所有重要导航节点
- 优先提高召回率（宁可多留，不可遗漏）
- 不允许修改页码（page字段必须从原文复制）
- level: 1=一级标题, 2=二级标题, 3=三级标题, 4=四级标题
- 不允许输出任何解释文字
- 如果原文为中文，title保留中文；如果原文为其他语言（日文、韩文、德文等），title翻译成中文`;

/** Default size budget for the content block sent to the model. */
export const DEFAULT_MAX_PROMPT_CHARS = 60000;

const TITLE_MAX_LENGTH = 80;
/** "1.", "（二）", "3、" — numbered headings that MinerU didn't tag */
const NUMBERED_TITLE_RE = /^[（(]?[0-9一二三四五六七八九十百]+[）).、]?\s*\S/;
const PAGE_NUMBER_RE = /^\d{1,4}$/;

export interface PromptStats {
  /** Content items extracted from the MinerU output. */
  total: number;
  /** Items actually sent to the model. */
  selected: number;
  /** Whether the document had to be downsampled. */
  truncated: boolean;
}

export interface OutlinePrompt {
  system: string;
  user: string;
  stats: PromptStats;
}

/**
 * How likely an item is a heading worth sending to the model:
 * 3 = MinerU heading or a known patent section, 2 = numbered heading,
 * 1 = short title-like line, 0 = body text.
 */
function scoreItem(item: ContentItem): number {
  const text = item.text.trim();
  if (!text) return 0;

  if (item.textLevel && item.textLevel > 0) return 3;
  if (matchesPatentHeading(text)) return 3;

  if (text.length > TITLE_MAX_LENGTH) return 0;
  if (PAGE_NUMBER_RE.test(text)) return 0;

  // A full sentence is body text, not a heading
  if (/[。；;]$/.test(text)) return 0;

  if (NUMBERED_TITLE_RE.test(text)) return 2;
  if (!/[，,、]$/.test(text)) return 1;
  return 0;
}

function estimateSize(item: ContentItem): number {
  const pretty = JSON.stringify(item, null, 2);
  // Inside the array every line gains two spaces of indentation, and each
  // entry is followed by ",\n"
  const lines = (pretty.match(/\n/g)?.length ?? 0) + 1;
  return pretty.length + lines * 2 + 2;
}

/**
 * Pick the items to send when the whole document does not fit in the prompt.
 *
 * Headings and numbered titles are always kept; the remaining budget is filled
 * with the first item of every page (so no page range disappears from the
 * outline) and then with short title-like lines spread across the document.
 * Items stay in document order, so page numbers keep their meaning.
 */
function selectWithinBudget(
  items: ContentItem[],
  budget: number,
): { selected: ContentItem[]; truncated: boolean } {
  const sizes = items.map(estimateSize);
  const totalSize = sizes.reduce((sum, size) => sum + size, 0);
  if (totalSize <= budget) {
    return { selected: items, truncated: false };
  }

  const picked = new Set<number>();
  let used = 0;

  const add = (index: number): boolean => {
    if (picked.has(index)) return true;
    if (used + sizes[index] > budget) return false;
    picked.add(index);
    used += sizes[index];
    return true;
  };

  // 1. Headings and numbered titles
  for (let i = 0; i < items.length; i++) {
    if (scoreItem(items[i]) >= 2) add(i);
  }

  // 2. First item of every page, so each page range is represented
  const seenPages = new Set<number>();
  for (let i = 0; i < items.length; i++) {
    if (seenPages.has(items[i].page)) continue;
    seenPages.add(items[i].page);
    add(i);
  }

  // 3. Remaining short lines, sampled evenly over the rest of the document
  if (used < budget) {
    const candidates = items
      .map((item, index) => ({ index, score: scoreItem(item) }))
      .filter(({ index, score }) => score === 1 && !picked.has(index));

    if (candidates.length > 0) {
      const perItem = Math.max(
        1,
        Math.floor((budget - used) / (sizes[candidates[0].index] || 1)),
      );
      const stride = Math.max(1, Math.ceil(candidates.length / perItem));
      for (let i = 0; i < candidates.length; i += stride) {
        add(candidates[i].index);
      }
    }
  }

  const selected = [...picked]
    .sort((a, b) => a - b)
    .map((index) => items[index]);

  return { selected, truncated: true };
}

export function buildOutlinePrompt(
  contentItems: ContentItem[],
  options: { maxChars?: number } = {},
): OutlinePrompt {
  const budget = Math.max(4000, options.maxChars ?? DEFAULT_MAX_PROMPT_CHARS);
  // Leave room for the instruction text around the content block
  const contentBudget = Math.max(2000, budget - 1000);
  const { selected, truncated } = selectWithinBudget(
    contentItems,
    contentBudget,
  );

  const contentJson = JSON.stringify(selected, null, 2);

  const hint = truncated
    ? `文档较长，已精简为 ${selected.length} 条候选标题（省略了正文段落），page 仍为原文页码。\n`
    : "";

  const userPrompt = `以下是专利文档的MinerU解析结果，共${selected.length}条内容条目。
${hint}
每个条目格式：{"text":"文本内容","page":"页码","textLevel":"结构层级提示(可选，越大越深层)"}

请分析并生成PDF书签大纲。

内容数据：
${contentJson}`;

  return {
    system: SYSTEM_PROMPT,
    user: userPrompt,
    stats: {
      total: contentItems.length,
      selected: selected.length,
      truncated,
    },
  };
}
