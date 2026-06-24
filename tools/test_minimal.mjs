import fs from 'fs';
import { PDFDocument, PDFName, PDFHexString, PDFArray, PDFNull, PDFNumber, PDFDict } from 'pdf-lib';

async function testMinimal() {
  const doc = await PDFDocument.create();
  for (let i = 1; i <= 5; i++) doc.addPage([612, 792]);
  const pageRefs = doc.getPages().map(p => p.ref);

  const tree = [
    { title: 'Test1', page: 1, level: 1, children: [], ref: null },
    { title: 'Test2', page: 2, level: 1, children: [], ref: null },
  ];

  for (const n of tree) n.ref = doc.context.nextRef();
  const outlinesDictRef = doc.context.nextRef();

  for (let i = 0; i < tree.length; i++) {
    const n = tree[i];
    const da = PDFArray.withContext(doc.context);
    da.push(pageRefs[n.page - 1]);
    da.push(PDFName.of('XYZ'));
    da.push(PDFNull); da.push(PDFNull); da.push(PDFNull);

    const m = new Map();
    m.set(PDFName.of('Title'), PDFHexString.fromText(n.title));
    m.set(PDFName.of('Parent'), outlinesDictRef);
    m.set(PDFName.of('Dest'), da);
    if (i > 0) m.set(PDFName.of('Prev'), tree[i - 1].ref);
    if (i < tree.length - 1) m.set(PDFName.of('Next'), tree[i + 1].ref);

    doc.context.assign(n.ref, PDFDict.fromMapWithContext(m, doc.context));
  }

  const olM = new Map();
  olM.set(PDFName.of('Type'), PDFName.of('Outlines'));
  olM.set(PDFName.of('First'), tree[0].ref);
  olM.set(PDFName.of('Last'), tree[tree.length - 1].ref);
  doc.context.assign(outlinesDictRef, PDFDict.fromMapWithContext(olM, doc.context));
  doc.catalog.set(PDFName.of('Outlines'), outlinesDictRef);

  const bytes = await doc.save({ useObjectStreams: false });
  const outPath = 'tools/output/test_minimal.pdf';
  fs.writeFileSync(outPath, Buffer.from(bytes));
  console.log('Wrote', outPath, bytes.length, 'bytes');

  // Verify
  const verify = await PDFDocument.load(bytes);
  const out = verify.catalog.get(PDFName.of('Outlines'));
  console.log('Verify: Outlines present:', !!out);
  console.log('Verify: pages:', verify.getPageCount());

  // Find /Title in raw bytes and dump context
  const text = bytes.toString('latin1');
  let idx = text.indexOf('/Title');
  while (idx >= 0) {
    const start = Math.max(0, idx - 20);
    const end = Math.min(text.length, idx + 80);
    const raw = bytes.slice(start, end);
    console.log('\n/Title at offset', idx);
    console.log('  hex:', Buffer.from(raw).toString('hex'));
    console.log('  txt:', text.slice(start, end).replace(/\n/g, '\\n'));
    idx = text.indexOf('/Title', idx + 1);
  }

  // Check for NULL bytes
  if (bytes.includes(0)) {
    console.log('\n✗ NULL byte found in output!');
  } else {
    console.log('\n✓ No NULL bytes');
  }

  console.log('\n✓ Test minimal complete.');
}

testMinimal().catch(e => { console.log('ERROR:', e.message, e.stack); process.exit(1); });
