import { assert } from "chai";
import type { ContentItem } from "../src/modules/contentExtractor";
import { buildOutlinePrompt } from "../src/modules/promptBuilder";

function makeItems(count: number): ContentItem[] {
  const items: ContentItem[] = [];
  for (let i = 0; i < count; i++) {
    const page = Math.floor(i / 12) + 1;
    if (i % 300 === 0) {
      items.push({
        text: `实施例${i / 300 + 1} 一种化合物`,
        page,
        textLevel: 1,
      });
    } else if (i === count - 5) {
      items.push({ text: "权利要求书", page });
    } else {
      items.push({
        text: `本发明提供了一种用于治疗疾病的化合物及其制备方法，具体涉及${i}号化合物的合成路线与药理数据。`,
        page,
        textLevel: 0,
      });
    }
  }
  return items;
}

describe("promptBuilder", function () {
  it("keeps every item when the document fits", function () {
    const items = makeItems(20);
    const prompt = buildOutlinePrompt(items, { maxChars: 60000 });

    assert.isFalse(prompt.stats.truncated);
    assert.equal(prompt.stats.selected, items.length);
    assert.include(prompt.user, "本发明提供了一种");
  });

  it("downsamples long documents to the budget", function () {
    const items = makeItems(6000);
    const budget = 20000;
    const prompt = buildOutlinePrompt(items, { maxChars: budget });

    assert.isTrue(prompt.stats.truncated);
    assert.isBelow(prompt.stats.selected, items.length);
    assert.isAtMost(prompt.user.length, budget + 2000);
  });

  it("keeps headings from the beginning and the end of the document", function () {
    const items = makeItems(6000);
    const prompt = buildOutlinePrompt(items, { maxChars: 20000 });

    // First chapter and the claims section near the end must both survive
    assert.include(prompt.user, "实施例1");
    assert.include(prompt.user, "权利要求书");
  });

  it("keeps page numbers unchanged", function () {
    const items = makeItems(6000);
    const prompt = buildOutlinePrompt(items, { maxChars: 20000 });
    const content = JSON.parse(prompt.user.slice(prompt.user.indexOf("[")));

    assert.isArray(content);
    for (const entry of content) {
      assert.isNumber(entry.page);
      assert.isAtLeast(entry.page, 1);
    }
  });
});
