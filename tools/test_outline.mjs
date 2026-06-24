import fs from 'fs';
import { PDFDocument, PDFName, PDFString, PDFArray, PDFNull, PDFNumber, PDFDict } from 'pdf-lib';

async function test() {
  const doc1 = await PDFDocument.create();
  for (let i = 1; i <= 10; i++) doc1.addPage([612, 792]);

  const pages = doc1.getPages();
  const pageRefs = pages.map(p => p.ref);

  function makeOutlineItem(doc, title, pageIdx, parentRef, prevRef, nextRef) {
    const ref = doc.context.nextRef();
    const destArr = PDFArray.withContext(doc.context);
    destArr.push(pageRefs[pageIdx]);
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
  const r1 = makeOutlineItem(doc1, '\u6458\u8981(\u4e00)', 0, olRef, null, null);
  const r2 = makeOutlineItem(doc1, '\u6743\u5229\u8981\u6c42(\u4e8c)', 5, olRef, r1, null);
  const olM = new Map();
  olM.set(PDFName.of('Type'), PDFName.of('Outlines'));
  olM.set(PDFName.of('First'), r1);
  olM.set(PDFName.of('Last'), r2);
  olM.set(PDFName.of('Count'), PDFNumber.of(2));
  doc1.context.assign(olRef, PDFDict.fromMapWithContext(olM, doc1.context));
  doc1.catalog.set(PDFName.of('Outlines'), olRef);

  const origBytes = await doc1.save();
  console.log('1. Created PDF with outlines:', origBytes.length, 'bytes');

  if (typeof console === 'undefined') {
    globalThis.console = { log() {}, warn() {}, error() {}, info() {}, group() {}, groupEnd() {} };
  }

  const doc2 = await PDFDocument.load(origBytes);
  const pages2 = doc2.getPages();
  const pageRefs2 = pages2.map(p => p.ref);
  console.log('2. Loaded, pages:', pages2.length);

  const hasOutlines = doc2.catalog.get(PDFName.of('Outlines'));
  console.log('3. Has Outlines:', !!hasOutlines);

  const tree = [{
    title: '\u65b0\u7ae0\u8282(\u4e00)', page: 1, level: 1, children: [
      { title: '\u5b50\u8282(1)', page: 2, level: 2, children: [] },
      { title: '\u5b50\u8282(2)', page: 3, level: 2, children: [] },
    ]
  }];

  function assignRefs(nodes, pRef) {
    for (const n of nodes) {
      n.ref = doc2.context.nextRef();
      n.parentRef = pRef;
      if (n.children) assignRefs(n.children, n.ref);
    }
  }
  assignRefs(tree, null);

  const outlinesDictRef = doc2.context.nextRef();

  function escapePdfStr(s) {
    return s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  }

  function createItems(nodes, parentRef, pageRefs) {
    const refs = [];
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      const da = PDFArray.withContext(doc2.context);
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

      doc2.context.assign(n.ref, PDFDict.fromMapWithContext(m, doc2.context));
      refs.push(n.ref);
    }
    return refs;
  }

  function countAll(nodes) {
    let c = nodes.length;
    for (const n of nodes) if (n.children) c += countAll(n.children);
    return c;
  }

  const topRefs = createItems(tree, outlinesDictRef, pageRefs2);

  const olM2 = new Map();
  olM2.set(PDFName.of('Type'), PDFName.of('Outlines'));
  olM2.set(PDFName.of('First'), topRefs[0]);
  olM2.set(PDFName.of('Last'), topRefs[topRefs.length - 1]);
  olM2.set(PDFName.of('Count'), PDFNumber.of(topRefs.length));
  doc2.context.assign(outlinesDictRef, PDFDict.fromMapWithContext(olM2, doc2.context));
  doc2.catalog.set(PDFName.of('Outlines'), outlinesDictRef);

  const modifiedBytes = await doc2.save({ useObjectStreams: false });
  console.log('4. Saved modified:', modifiedBytes.length, 'bytes');
  fs.writeFileSync('tools/output/test_with_existing_outlines.pdf', Buffer.from(modifiedBytes));

  try {
    const verify = await PDFDocument.load(modifiedBytes);
    const out = verify.catalog.get(PDFName.of('Outlines'));
    console.log('5. Verify: OK, Outlines:', !!out);
    console.log('6. TEST PASS');
  } catch (e) {
    console.log('5. Verify FAILED:', e.message);
    const text = new TextDecoder().decode(modifiedBytes);
    const idx = text.indexOf('/Outlines');
    if (idx >= 0) {
      console.log('  Context:', text.slice(Math.max(0, idx - 50), idx + 200));
    }
    process.exit(1);
  }
}

test().catch(e => { console.log('ERROR:', e.message, e.stack); process.exit(1); });
