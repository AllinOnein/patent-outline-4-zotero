import { assert } from "chai";
import { parseAIResponse } from "../src/modules/outlineBuilder";

describe("parseAIResponse", function () {
  it("parses a plain JSON array", function () {
    const outline = parseAIResponse(
      '[{"title":"背景技术","page":2,"level":1}]',
    );

    assert.lengthOf(outline, 1);
    assert.equal(outline[0].title, "背景技术");
    assert.equal(outline[0].page, 2);
    assert.equal(outline[0].level, 1);
  });

  it("parses a fenced JSON array", function () {
    const outline = parseAIResponse(
      'Here you go:\n```json\n[{"title":"实施例1","page":9,"level":2}]\n```',
    );

    assert.lengthOf(outline, 1);
    assert.equal(outline[0].title, "实施例1");
  });

  it("recovers entries from an output truncated by max_tokens", function () {
    const outline = parseAIResponse(
      '[{"title":"权利要求书","page":30,"level":1},{"title":"实施',
      "length",
    );

    assert.lengthOf(outline, 1);
    assert.equal(outline[0].title, "权利要求书");
  });

  it("clamps invalid levels and drops unusable entries", function () {
    const outline = parseAIResponse(
      JSON.stringify([
        { title: "A", page: 3, level: 9 },
        { title: "B", page: 4, level: 0 },
        { title: "", page: 5, level: 1 },
        { title: "C", page: 0, level: 1 },
      ]),
    );

    assert.lengthOf(outline, 2);
    assert.equal(outline[0].level, 4);
    assert.equal(outline[1].level, 1);
  });

  it("throws a descriptive error for non-JSON output", function () {
    assert.throws(
      () => parseAIResponse("I cannot help with that.", "stop"),
      /不是有效的 JSON 数组/,
    );
  });
});
