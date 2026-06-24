import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  PDFDocument,
  PDFName,
  PDFString,
  PDFNumber,
  PDFArray,
  PDFNull,
  PDFDict,
  PDFRef,
  StandardFonts,
  rgb,
} from "pdf-lib";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.resolve(__dirname, "output");

// ── Test Data ──────────────────────────────────────────────────────────
const TEST_OUTLINE = [
  { title: "Chapter 1", page: 1, level: 1 },
  { title: "Section 1.1", page: 2, level: 2 },
  { title: "Section 1.2", page: 3, level: 2 },
];

// ── Outline Node Types ─────────────────────────────────────────────────
/** @typedef {{ title: string; page: number; children: OutlineNode[]; ref?: import('pdf-lib').PDFRef }} OutlineNode */

/**
 * Build a tree from a flat level-indented outline list.
 * @param {{ title: string; page: number; level: number }[]} items
 * @returns {OutlineNode[]}
 */
function buildTree(items) {
  const root = [];
  /** @type {{ node: OutlineNode; level: number }[]} */
  const stack = [];

  for (const item of items) {
    const node = { title: item.title, page: item.page - 1, children: [] };

    while (stack.length > 0 && stack[stack.length - 1].level >= item.level) {
      stack.pop();
    }

    if (stack.length === 0) {
      root.push(node);
    } else {
      stack[stack.length - 1].node.children.push(node);
    }

    stack.push({ node, level: item.level });
  }

  return root;
}

/**
 * Pre-assign indirect references to every node in the tree.
 * @param {import('pdf-lib').PDFDocument} doc
 * @param {OutlineNode[]} tree
 */
function assignRefs(doc, tree) {
  for (const node of tree) {
    node.ref = doc.context.nextRef();
    if (node.children.length > 0) {
      assignRefs(doc, node.children);
    }
  }
}

/**
 * Recursively create outline item PDF objects.
 * Returns an array of PDFRefs in the same order as the input tree.
 *
 * @param {import('pdf-lib').PDFDocument} doc
 * @param {OutlineNode[]} tree
 * @param {import('pdf-lib').PDFRef} parentRef
 * @param {import('pdf-lib').PDFRef[]} pageRefs
 * @returns {import('pdf-lib').PDFRef[]}
 */
function createOutlineItems(doc, tree, parentRef, pageRefs) {
  const refs = tree.map((n) => n.ref);

  for (let i = 0; i < tree.length; i++) {
    const node = tree[i];
    const prevRef = i > 0 ? refs[i - 1] : null;
    const nextRef = i < tree.length - 1 ? refs[i + 1] : null;

    // Build destination array: [pageRef /XYZ left top zoom]
    const destArray = PDFArray.withContext(doc.context);
    destArray.push(pageRefs[node.page]);
    destArray.push(PDFName.of("XYZ"));
    destArray.push(PDFNull); // left — null = current
    destArray.push(PDFNull); // top  — null = top of page
    destArray.push(PDFNull); // zoom — null = current

    const map = new Map();
    map.set(PDFName.of("Title"), PDFString.of(node.title));
    map.set(PDFName.of("Parent"), parentRef);
    map.set(PDFName.of("Dest"), destArray);
    if (prevRef) map.set(PDFName.of("Prev"), prevRef);
    if (nextRef) map.set(PDFName.of("Next"), nextRef);

    if (node.children.length > 0) {
      const childRefs = createOutlineItems(
        doc,
        node.children,
        node.ref,
        pageRefs,
      );
      map.set(PDFName.of("First"), childRefs[0]);
      map.set(PDFName.of("Last"), childRefs[childRefs.length - 1]);
      map.set(PDFName.of("Count"), PDFNumber.of(countDescendants(node)));
    }

    const dict = PDFDict.fromMapWithContext(map, doc.context);
    doc.context.assign(node.ref, dict);
  }

  return refs;
}

/** Count total descendants (children + grandchildren + ...) */
function countDescendants(node) {
  let count = node.children.length;
  for (const child of node.children) {
    count += countDescendants(child);
  }
  return count;
}

/**
 * Write a standard PDF Outline Tree into an existing PDFDocument.
 *
 * @param {import('pdf-lib').PDFDocument} doc
 * @param {{ title: string; page: number; level: number }[]} outlineItems
 * @returns {void}
 */
function writeOutline(doc, outlineItems) {
  // 1. Get page indirect references
  const pages = doc.getPages();
  const pageRefs = pages.map((p) => p.ref);

  // 2. Build hierarchy tree
  const tree = buildTree(outlineItems);

  // 3. Pre-assign refs
  assignRefs(doc, tree);

  // 4. Create root Outlines dictionary
  const outlinesDictRef = doc.context.nextRef();

  // 5. Create all outline items
  const topLevelRefs = createOutlineItems(doc, tree, outlinesDictRef, pageRefs);

  // 6. Build and assign Outlines dict
  const outlinesMap = new Map();
  outlinesMap.set(PDFName.of("Type"), PDFName.of("Outlines"));
  if (topLevelRefs.length > 0) {
    outlinesMap.set(PDFName.of("First"), topLevelRefs[0]);
    outlinesMap.set(PDFName.of("Last"), topLevelRefs[topLevelRefs.length - 1]);
    outlinesMap.set(PDFName.of("Count"), PDFNumber.of(topLevelRefs.length));
  }
  const outlinesDict = PDFDict.fromMapWithContext(outlinesMap, doc.context);
  doc.context.assign(outlinesDictRef, outlinesDict);

  // 7. Wire into catalog
  doc.catalog.set(PDFName.of("Outlines"), outlinesDictRef);
}

// ── Test PDF Generator ─────────────────────────────────────────────────
/**
 * Create a minimal 3-page test PDF with page labels.
 * @returns {Promise<Uint8Array>}
 */
async function createTestPdf() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);

  for (let i = 1; i <= 3; i++) {
    const page = doc.addPage([612, 792]);
    page.drawText(`Page ${i}`, {
      x: 50,
      y: 700,
      size: 24,
      font,
      color: rgb(0, 0, 0),
    });
    page.drawText(`This is the content of page ${i}.`, {
      x: 50,
      y: 650,
      size: 12,
      font,
      color: rgb(0.2, 0.2, 0.2),
    });

    if (i === 1) {
      page.drawText("Chapter 1", {
        x: 50,
        y: 500,
        size: 18,
        font,
        color: rgb(0, 0, 0.6),
      });
    } else if (i === 2) {
      page.drawText("Section 1.1", {
        x: 50,
        y: 500,
        size: 16,
        font,
        color: rgb(0, 0.4, 0),
      });
    } else {
      page.drawText("Section 1.2", {
        x: 50,
        y: 500,
        size: 16,
        font,
        color: rgb(0, 0.4, 0),
      });
    }
  }

  return await doc.save();
}

// ── Main ───────────────────────────────────────────────────────────────
async function main() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  // 1. Create and save original PDF
  console.log("[1/5] Creating test PDF...");
  const originalBytes = await createTestPdf();
  const originalPath = path.join(OUTPUT_DIR, "original.pdf");
  fs.writeFileSync(originalPath, originalBytes);
  console.log(`  → Saved: ${originalPath}`);

  // 2. Load the PDF and write outline
  console.log("[2/5] Loading PDF and writing outline...");
  const doc = await PDFDocument.load(originalBytes);

  console.log(`  Outline data: ${JSON.stringify(TEST_OUTLINE, null, 2)}`);
  writeOutline(doc, TEST_OUTLINE);

  // 3. Save modified PDF
  console.log("[3/5] Saving modified PDF...");
  const modifiedBytes = await doc.save();
  const modifiedPath = path.join(OUTPUT_DIR, "with_outline.pdf");
  fs.writeFileSync(modifiedPath, modifiedBytes);
  console.log(`  → Saved: ${modifiedPath}`);

  // 4. Verify the outline structure by re-reading
  console.log("[4/5] Verifying outline structure...");
  const verifyDoc = await PDFDocument.load(modifiedBytes);

  // Check catalog has /Outlines
  const catalogOutlines = verifyDoc.catalog.get(PDFName.of("Outlines"));
  if (catalogOutlines) {
    console.log(`  ✅ Catalog /Outlines: ${catalogOutlines.toString()}`);

    const outlinesObj = verifyDoc.context.lookup(catalogOutlines);
    if (outlinesObj) {
      const first = outlinesObj.get(PDFName.of("First"));
      const last = outlinesObj.get(PDFName.of("Last"));
      const count = outlinesObj.get(PDFName.of("Count"));

      console.log(`  ├─ First: ${first?.toString()}`);
      console.log(`  ├─ Last:  ${last?.toString()}`);
      console.log(`  └─ Count: ${count?.toString()}`);

      // Traverse the outline tree
      if (first) {
        console.log("\n  Outline tree:");
        traverseOutline(verifyDoc, first, 2);
      }
    }
  } else {
    console.log("  ❌ Catalog has no /Outlines entry!");
  }

  // 5. Save a text dump for deeper inspection
  console.log("\n[5/5] Saving PDF object dump...");
  const dumpPath = path.join(OUTPUT_DIR, "pdf_objects_dump.txt");
  const dump = dumpPdfObjects(verifyDoc);
  fs.writeFileSync(dumpPath, dump);
  console.log(`  → Saved: ${dumpPath}`);

  // Summary
  console.log("\n═══════════════════════════════════════════");
  console.log("  Verification Complete");
  console.log("═══════════════════════════════════════════");
  console.log(`  Original:  ${originalPath}`);
  console.log(`  Modified:  ${modifiedPath}`);
  console.log(`  Dump:      ${dumpPath}`);
  console.log("\n  Open in Adobe Acrobat / Zotero to verify:");
  console.log("  A. Bookmarks panel shows 3 entries");
  console.log("  B. Clicking jumps to correct pages");
  console.log("  C. Original content is preserved");
  console.log("═══════════════════════════════════════════");
}

function traverseOutline(doc, ref, indent) {
  const obj = doc.context.lookup(ref);
  if (!obj) return;

  const title = obj.get(PDFName.of("Title"));
  const dest = obj.get(PDFName.of("Dest"));
  const count = obj.get(PDFName.of("Count"));
  const first = obj.get(PDFName.of("First"));
  const next = obj.get(PDFName.of("Next"));

  const pad = " ".repeat(indent);
  const titleStr = title ? title.toString() : "(no title)";
  const destStr = dest ? dest.toString() : "";
  const countStr = count ? ` count=${count.toString()}` : "";

  console.log(`${pad}├─ ${titleStr}${countStr}`);
  if (destStr) console.log(`${pad}│  Dest: ${destStr.slice(0, 80)}`);

  if (first) {
    traverseOutline(doc, first, indent + 2);
  }

  if (next) {
    traverseOutline(doc, next, indent);
  }
}

function dumpPdfObjects(doc) {
  const lines = [];
  lines.push("PDF Object Structure");
  lines.push("════════════════════\n");

  // Catalog
  lines.push("Catalog:");
  lines.push(`  ${doc.catalog.toString()}\n`);

  // Outlines
  const outlinesRef = doc.catalog.get(PDFName.of("Outlines"));
  if (outlinesRef) {
    lines.push(`Outlines (${outlinesRef.toString()}):`);
    const outlinesObj = doc.context.lookup(outlinesRef);
    if (outlinesObj) {
      lines.push(`  ${outlinesObj.toString()}\n`);
      dumpOutlineRecursive(doc, outlinesObj.get(PDFName.of("First")), lines, 2);
    }
  } else {
    lines.push("No /Outlines in catalog!\n");
  }

  // Pages
  lines.push("\nPages:");
  const pages = doc.getPages();
  for (let i = 0; i < pages.length; i++) {
    lines.push(`  [${i}] ref=${pages[i].ref.toString()}`);
  }

  return lines.join("\n");
}

function dumpOutlineRecursive(doc, ref, lines, indent) {
  if (!ref) return;
  const obj = doc.context.lookup(ref);
  if (!obj) return;

  const pad = " ".repeat(indent);
  lines.push(`${pad}${ref.toString()}:`);
  lines.push(`${pad}  ${obj.toString()}`);

  const first = obj.get(PDFName.of("First"));
  if (first) {
    lines.push(`${pad}  children:`);
    dumpOutlineRecursive(doc, first, lines, indent + 4);
  }

  const next = obj.get(PDFName.of("Next"));
  if (next) {
    dumpOutlineRecursive(doc, next, lines, indent);
  }
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
