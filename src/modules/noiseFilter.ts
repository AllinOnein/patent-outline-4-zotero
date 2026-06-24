import type { ContentListEntry } from "./zipReader";

const PAGE_NUMBER_RE = /^\d+$/;

const WO_NUMBER_RE = /^WO\s*\d{2}\s*\d+/i;

const PCT_NUMBER_RE = /^PCT\s*\/\s*(CN|US|EP|JP|KR)\s*\d+/i;

const PATENT_NUMBER_RE = /^(US|CN|EP|JP|KR|AU|CA)\d{6,}/i;

const TRANSLATION_NOTICE_RE =
  /(this translation|for reference|reference purpose|仅供参考|供参考)/i;

const COPYRIGHT_RE =
  /(copyright|©|all rights reserved|著作权|版权|保留所有权利)/i;

const ADMIN_TEXT_RE =
  /^(filing date|priority date|inventor|applicant|filing\s*:|priority\s*:|inventor\s*:|applicant\s*:)/i;

const PAGE_HEADER_FOOTER_RE =
  /^\s*(page|页|第\s*\d+\s*页)\s*$/i;

const INID_CODE_RE = /^\(\d{2}\)/;

const WIPO_PARAGRAPH_ONLY_RE = /^\[\d+\]$/;

const PAGE_COUNT_RE =
  /^(权利要求书|说明书|附图|序列表).*\d+\s*页/;

const LIST_ITEM_RE = /^[a-z]\)\s/;

const SHORT_BRACKET_RE = /^【[^】]+】$/;

export function isNoise(entry: ContentListEntry): boolean {
  const text = entry.text?.trim();
  if (!text) return true;

  if (PAGE_NUMBER_RE.test(text) && text.length <= 4) return true;

  if (PAGE_HEADER_FOOTER_RE.test(text)) return true;

  if (WO_NUMBER_RE.test(text)) return true;

  if (PCT_NUMBER_RE.test(text)) return true;

  if (PATENT_NUMBER_RE.test(text)) return true;

  if (COPYRIGHT_RE.test(text)) return true;

  if (ADMIN_TEXT_RE.test(text)) return true;

  if (TRANSLATION_NOTICE_RE.test(text) && text.length > 40) return true;

  if (SHORT_BRACKET_RE.test(text)) return true;

  if (INID_CODE_RE.test(text) && text.length < 40) return true;

  if (WIPO_PARAGRAPH_ONLY_RE.test(text)) return true;

  if (PAGE_COUNT_RE.test(text)) return true;

  if (LIST_ITEM_RE.test(text) && text.length < 100) return true;

  return false;
}
