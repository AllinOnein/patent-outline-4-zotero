import fs from 'fs';
import { PDFDocument, PDFName, PDFString, PDFArray, PDFNull, PDFNumber, PDFDict } from 'pdf-lib';

async function test() {
  // ── Create a PDF with existing outlines (simulating patent PDF) ──
  const doc1 = await PDFDocument.create();
  for (let i = 1; i <= 10; i++) doc1.addPage([612, 792]);

  const pageRefs1 = doc1.getPages().map(p => p.ref);

  function makeOutlineItem(doc, title, pageIdx, parentRef, prevRef, nextRef) {
    const ref = doc.context.nextRef();
    const destArr = PDFArray.withContext(doc.context);
    destArr.push(pageRefs1[pageIdx]);
    destArr.push(PDFName.of('XYZ'));
    destArr.push(PDFNull); destArr.push(PDFNull); destArr.push(PDFNull);
    const m = new Map();
    m.set(PDFName.of('Title'), PDFString.of(title));
    m.set(PDFName.of('Parent'), parentRef);
    m.set(PDFName.of('Dest'), destArr);
    if (prevRef) m.set(PDFName.of('Prev'), prevRef);
    if (nextRef) m.set(PDFName.of('Next'), nextRef);
    doc.context.assign(ref, PDFDict.fromMapWithContext(m, doc.context));
    return ref;
  }

  const olRef = doc1.context.nextRef();
  const r1 = makeOutlineItem(doc1, '\u6458\u8981', 0, olRef, null, null);
  const r2 = makeOutlineItem(doc1, '\u6743\u5229\u8981\u6c42', 5, olRef, r1, null);
  // Set up prev/next
  const oldItem1 = doc1.context.indirectObjects.get(r1.objectNumber);
  if (oldItem1 && oldItem1.get) {
    const prevMap = new Map();
    for (const k of oldItem1.keys()) prevMap.set(k, oldItem1.get(k));
    if (!prevMap.has(PDFName.of('Prev'))) {
      // already set from makeOutlineItem via prevRef
    }
  }

  const olM = new Map();
  olM.set(PDFName.of('Type'), PDFName.of('Outlines'));
  olM.set(PDFName.of('First'), r1);
  olM.set(PDFName.of('Last'), r2);
  olM.set(PDFName.of('Count'), PDFNumber.of(2));
  doc1.context.assign(olRef, PDFDict.fromMapWithContext(olM, doc1.context));
  doc1.catalog.set(PDFName.of('Outlines'), olRef);

  const origBytes = await doc1.save();
  console.log('1. Original with outlines:', origBytes.length, 'bytes');

  // ── Simulate our approach: copy pages to new doc ──
  const originalDoc = await PDFDocument.load(origBytes);
  console.log('2. Loaded, pages:', originalDoc.getPageCount());

  const doc = await PDFDocument.create();
  const copiedPages = await doc.copyPages(originalDoc, originalDoc.getPageIndices());
  for (const page of copiedPages) {
    doc.addPage(page);
  }
  console.log('3. Copied pages:', doc.getPageCount());

  const pageRefs = doc.getPages().map(p => p.ref);

  // Build new outline tree
  const tree = [{
    title: '\u65b0\u7ae0\u8282', page: 1, level: 1, children: [
      { title: '\u5b50\u8282A', page: 2, level: 2, children: [] },
      { title: '\u5b50\u8282B', page: 3, level: 2, children: [] },
    ]
  }];

  function assignRefs(nodes) {
    for (const n of nodes) {
      n.ref = doc.context.nextRef();
      if (n.children) assignRefs(n.children);
    }
  }
  assignRefs(tree);

  const outlinesDictRef = doc.context.nextRef();

  function escapePdfStr(s) {
    return s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  }

  function createItems(nodes, parentRef, pageRefs) {
    const refs = [];
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      const da = PDFArray.withContext(doc.context);
      da.push(pageRefs[n.page - 1]);
      da.push(PDFName.of('XYZ'));
      da.push(PDFNull); da.push(PDFNull); da.push(PDFNull);

      const m = new Map();
      m.set(PDFName.of('Title'), PDFString.of(escapePdfStr(n.title)));
      m.set(PDFName.of('Parent'), parentRef);
      m.set(PDFName.of('Dest'), da);
      if (i > 0) m.set(PDFName.of('Prev'), refs[i - 1]);
      if (i < nodes.length - 1) m.set(PDFName.of('Next'), nodes[i + 1].ref);

      if (n.children && n.children.length > 0) {
        const childRefs = createItems(n.children, n.ref, pageRefs);
        m.set(PDFName.of('First'), childRefs[0]);
        m.set(PDFName.of('Last'), childRefs[childRefs.length - 1]);
        m.set(PDFName.of('Count'), PDFNumber.of(countAll(n.children)));
      }

      doc.context.assign(n.ref, PDFDict.fromMapWithContext(m, doc.context));
      refs.push(n.ref);
    }
    return refs;
  }

  function countAll(nodes) {
    let c = nodes.length;
    for (const n of nodes) if (n.children) c += countAll(n.children);
    return c;
  }

  const topRefs = createItems(tree, outlinesDictRef, pageRefs);

  const olM2 = new Map();
  olM2.set(PDFName.of('Type'), PDFName.of('Outlines'));
  olM2.set(PDFName.of('First'), topRefs[0]);
  olM2.set(PDFName.of('Last'), topRefs[topRefs.length - 1]);
  olM2.set(PDFName.of('Count'), PDFNumber.of(topRefs.length));
  doc.context.assign(outlinesDictRef, PDFDict.fromMapWithContext(olM2, doc.context));
  doc.catalog.set(PDFName.of('Outlines'), outlinesDictRef);

  const modifiedBytes = await doc.save({ useObjectStreams: false });
  console.log('4. Saved:', modifiedBytes.length, 'bytes');
  fs.writeFileSync('tools/output/test_page_copy.pdf', Buffer.from(modifiedBytes));

  // Verify with pdf-lib
  try {
    const verify = await PDFDocument.load(modifiedBytes);
    console.log('5. pdf-lib verify: OK, pages:', verify.getPageCount());
    const hasOutlines = verify.catalog.get(PDFName.of('Outlines'));
    console.log('6. Outlines present:', !!hasOutlines);
  } catch (e) {
    console.log('5. pdf-lib verify FAILED:', e.message);
    process.exit(1);
  }

  console.log('7. ALL PASS');
}

test().catch(e => { console.log('ERROR:', e.message); process.exit(1); });
