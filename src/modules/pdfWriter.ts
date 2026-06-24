import type { BookmarkNode } from "./treeBuilder";

export interface WriteResult {
  success: boolean;
  pageCount: number;
  itemCount: number;
  error?: string;
}

/**
 * Write a standard PDF Outline Tree (bookmarks) into an existing PDF file.
 *
 * - Uses the PDF Catalog's /Outlines entry
 * - Creates standard outline items with /Title, /Parent, /Dest, /Next, /Prev
 * - Preserves all existing content
 * - Supports levels 1-4
 */
export async function writePdfOutline(
  pdfBytes: Uint8Array,
  tree: BookmarkNode[],
): Promise<{ bytes: Uint8Array; result: WriteResult }> {
  // pdf-lib uses console.warn internally; Zotero sandbox may lack console
  if (typeof console === "undefined") {
    (globalThis as any).console = {
      log() {},
      warn() {},
      error() {},
      info() {},
      group() {},
      groupEnd() {},
    };
  }
  const pdfLib = await importPdfLib();
  const { PDFDocument, PDFName } = pdfLib;

  // Load original to validate pages & get page count
  const originalDoc = await PDFDocument.load(pdfBytes);
  const pageCount = originalDoc.getPageCount();

  if (tree.length === 0) {
    return {
      bytes: pdfBytes,
      result: { success: true, pageCount, itemCount: 0 },
    };
  }

  // Validate page numbers
  const invalidPages: string[] = [];
  function checkPages(nodes: BookmarkNode[]) {
    for (const n of nodes) {
      if (n.page < 1 || n.page > pageCount) {
        invalidPages.push(`"${n.title}" page ${n.page} (doc has ${pageCount})`);
      }
      checkPages(n.children);
    }
  }
  checkPages(tree);

  if (invalidPages.length > 0) {
    return {
      bytes: pdfBytes,
      result: {
        success: false,
        pageCount,
        itemCount: 0,
        error: `Page out of range: ${invalidPages.slice(0, 3).join("; ")}`,
      },
    };
  }

  // Create a fresh document and copy all pages — this strips old /Outlines
  // and avoids re-serializing corrupted unreferenced objects from the original.
  const doc = await PDFDocument.create();
  const copiedPages = await doc.copyPages(originalDoc, originalDoc.getPageIndices());
  for (const page of copiedPages) {
    doc.addPage(page);
  }
  const pageRefs = doc.getPages().map((p: any) => p.ref);

  assignRefs(doc, tree);

  const outlinesDictRef = doc.context.nextRef();
  const topLevelRefs = createOutlineItems(doc, tree, outlinesDictRef, pageRefs, pdfLib);

  const outlinesMap = new Map();
  outlinesMap.set(PDFName.of("Type"), PDFName.of("Outlines"));
  if (topLevelRefs.length > 0) {
    outlinesMap.set(PDFName.of("First"), topLevelRefs[0]);
    outlinesMap.set(PDFName.of("Last"), topLevelRefs[topLevelRefs.length - 1]);
  }
  const outlinesDict = pdfLib.PDFDict.fromMapWithContext(outlinesMap, doc.context);
  doc.context.assign(outlinesDictRef, outlinesDict);

  doc.catalog.set(PDFName.of("Outlines"), outlinesDictRef);

  const bytes = await doc.save({ useObjectStreams: false });

  return {
    bytes,
    result: {
      success: true,
      pageCount,
      itemCount: countAll(tree),
    },
  };
}

function countAll(tree: BookmarkNode[]): number {
  let n = tree.length;
  for (const node of tree) {
    n += countAll(node.children);
  }
  return n;
}

// ── Dynamic import ─────────────────────────────────────────────────────
async function importPdfLib(): Promise<any> {
  try {
    return await import("pdf-lib");
  } catch {
    return require("pdf-lib");
  }
}

// ── PDF object construction ────────────────────────────────────────────
interface InternalNode extends BookmarkNode {
  ref?: any;
}

function assignRefs(doc: any, tree: InternalNode[]): void {
  for (const node of tree) {
    node.ref = doc.context.nextRef();
    if (node.children.length > 0) {
      assignRefs(doc, node.children as InternalNode[]);
    }
  }
}

function createOutlineItems(
  doc: any,
  tree: InternalNode[],
  parentRef: any,
  pageRefs: any[],
  pdfLib: any,
): any[] {
  const { PDFName, PDFHexString, PDFArray, PDFNull, PDFNumber, PDFDict } = pdfLib;

  const refs = tree.map((n) => n.ref);

  for (let i = 0; i < tree.length; i++) {
    const node = tree[i];
    const prevRef = i > 0 ? refs[i - 1] : null;
    const nextRef = i < tree.length - 1 ? refs[i + 1] : null;

    const destArray = PDFArray.withContext(doc.context);
    destArray.push(pageRefs[node.page - 1]);
    destArray.push(PDFName.of("XYZ"));
    destArray.push(PDFNull);
    destArray.push(PDFNull);
    destArray.push(PDFNull);

    const map = new Map();
    map.set(PDFName.of("Title"), PDFHexString.fromText(node.title));
    map.set(PDFName.of("Parent"), parentRef);
    map.set(PDFName.of("Dest"), destArray);
    if (prevRef) map.set(PDFName.of("Prev"), prevRef);
    if (nextRef) map.set(PDFName.of("Next"), nextRef);

    if (node.children.length > 0) {
      const childRefs = createOutlineItems(
        doc,
        node.children as InternalNode[],
        node.ref,
        pageRefs,
        pdfLib,
      );
      map.set(PDFName.of("First"), childRefs[0]);
      map.set(PDFName.of("Last"), childRefs[childRefs.length - 1]);
      map.set(PDFName.of("Count"), PDFNumber.of(countDescendants(node as InternalNode)));
    }

    const dict = PDFDict.fromMapWithContext(map, doc.context);
    doc.context.assign(node.ref, dict);
  }

  return refs;
}

function countDescendants(node: InternalNode): number {
  let count = node.children.length;
  for (const child of node.children) {
    count += countDescendants(child as InternalNode);
  }
  return count;
}
