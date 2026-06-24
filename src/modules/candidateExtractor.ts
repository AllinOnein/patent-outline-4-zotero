import type { ContentListEntry } from "./zipReader";
import { isNoise } from "./noiseFilter";
import { matchesPatentHeading } from "./patentPatterns";

export interface Candidate {
  title: string;
  page: number;
}

export interface CandidateStats {
  total: number;
  duplicates: number;
  avgPage: number;
  uniqueTitles: string[];
  duplicateTitles: string[];
}

export interface ExtractionResult {
  candidates: Candidate[];
  stats: CandidateStats;
}

const PAGE_OFFSET = 0;

export function extractCandidates(
  entries: ContentListEntry[],
): ExtractionResult {
  const seen = new Set<string>();
  const candidates: Candidate[] = [];
  const titleCount = new Map<string, number>();
  let totalPages = 0;

  for (const entry of entries) {
    if (isNoise(entry)) continue;

    const isHeadingByLevel = entry.text_level > 0;
    const isHeadingByPattern = matchesPatentHeading(entry.text);
    if (!isHeadingByLevel && !isHeadingByPattern) continue;

    const title = entry.text.trim();
    const key = title.toLowerCase();

    titleCount.set(key, (titleCount.get(key) ?? 0) + 1);

    if (seen.has(key)) continue;
    seen.add(key);

    candidates.push({
      title,
      page: entry.page_idx + PAGE_OFFSET,
    });
    totalPages += entry.page_idx + PAGE_OFFSET;
  }

  const duplicateCount = [...titleCount.values()].filter((c) => c > 1).length;
  const avgPage = candidates.length > 0 ? totalPages / candidates.length : 0;

  return {
    candidates,
    stats: {
      total: candidates.length,
      duplicates: duplicateCount,
      avgPage: Math.round(avgPage * 10) / 10,
      uniqueTitles: candidates.map((c) => c.title),
      duplicateTitles: [...titleCount.entries()]
        .filter(([, count]) => count > 1)
        .map(([title]) => title),
    },
  };
}
