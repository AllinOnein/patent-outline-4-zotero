export type Jurisdiction = "CN" | "US" | "WO" | "PCT";

const CN_PATTERNS: RegExp[] = [
  /^(技术领域|技术方案)$/,
  /^(背景技术)$/,
  /^(发明内容|发明概要)$/,
  /^(附图说明)$/,
  /^(具体实施方式)$/,
  /^实施例/,
  /^实施方式/,
  /^实施方案/,
  /^(权利要求书|权利要求|权项)/,
  /^(摘要)$/,
  /^(技术效果|有益效果)$/,
  /^(序列表)/,
  /^(图\s*\d+)/,
  /^(表\s*\d+)/,
];

const US_PATTERNS: RegExp[] = [
  /^(technical field|field of the invention)$/i,
  /^(background|background of the invention|description of related art)$/i,
  /^(summary|summary of the invention)$/i,
  /^(brief description of the drawings|description of the drawings)$/i,
  /^(detailed description|detailed description of the invention)$/i,
  /^(description of the preferred embodiments)$/i,
  /^examples?/i,
  /^embodiments?/i,
  /^(claims|what is claimed is)/i,
  /^(abstract)$/i,
  /^(best mode|industrial applicability|cross-reference)/i,
  /^(figure\s+\d+|fig\.?\s*\d+)/i,
  /^(table\s+\d+)/i,
];

const WO_PATTERNS: RegExp[] = [
  /^(technical field)$/i,
  /^(background art|background)$/i,
  /^(disclosure of the invention|summary of the invention)$/i,
  /^(brief description of the drawings)$/i,
  /^(detailed description|description of embodiments|mode.*for carrying out)/i,
  /^examples?/i,
  /^embodiments?/i,
  /^(claims)/i,
  /^(abstract)/i,
  /^(industrial applicability)/i,
  /^(sequence listing|sequence table)/i,
];

const NUMBERED_PATTERNS: RegExp[] = [
  /^(实施)?例\s*\d+/,
  /^实施方案\s*\d+/,
  /^实施方式\s*\d+/,
  /^对比例\s*\d+/,
  /^example\s*\d+/i,
  /^embodiment\s*\d+/i,
  /^试验\s*\d+/,
  /^实验\s*\d+/,
  /^样品\s*\d+/,
  /^对比\s*(例|实验|试验)\s*\d+/,
  /^sample\s*\d+/i,
  /^test\s*\d+/i,
  /^trial\s*\d+/i,
];

const allPatterns: {
  pattern: RegExp;
  jurisdictions: Jurisdiction[];
}[] = [
  ...CN_PATTERNS.map((p) => ({
    pattern: p,
    jurisdictions: ["CN"] as Jurisdiction[],
  })),
  ...US_PATTERNS.map((p) => ({
    pattern: p,
    jurisdictions: ["US", "WO", "PCT"] as Jurisdiction[],
  })),
  ...WO_PATTERNS.map((p) => ({
    pattern: p,
    jurisdictions: ["WO", "PCT"] as Jurisdiction[],
  })),
  ...NUMBERED_PATTERNS.map((p) => ({
    pattern: p,
    jurisdictions: ["CN", "US", "WO", "PCT"] as Jurisdiction[],
  })),
];

export function matchesPatentHeading(
  text: string,
  _jurisdiction?: Jurisdiction,
): boolean {
  const trimmed = text.trim();
  return allPatterns.some(({ pattern }) => pattern.test(trimmed));
}
