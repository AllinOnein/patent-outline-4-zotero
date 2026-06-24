import type { ContentItem } from "./contentExtractor";

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
- 不允许输出任何解释文字`;

export function buildOutlinePrompt(
  contentItems: ContentItem[],
): { system: string; user: string } {
  const contentJson = JSON.stringify(contentItems, null, 2);

  const userPrompt = `以下是专利文档的MinerU解析结果，共${contentItems.length}条内容条目。

每个条目格式：{"text":"文本内容","page":"页码","textLevel":"结构层级提示(可选，越大越深层)"}

请分析并生成PDF书签大纲。

内容数据：
${contentJson}`;

  return { system: SYSTEM_PROMPT, user: userPrompt };
}
