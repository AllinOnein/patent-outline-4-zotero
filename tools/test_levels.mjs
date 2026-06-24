import fs from 'fs';
import { PDFDocument, PDFName, PDFHexString, PDFArray, PDFNull, PDFNumber, PDFDict } from 'pdf-lib';

async function testLevels(scenario) {
  const doc = await PDFDocument.create();
  for (let i = 1; i <= 10; i++) doc.addPage([612, 792]);
  const pageRefs = doc.getPages().map(p => p.ref);
  const { titles } = scenario;

  // Build bookmark tree
  function buildNodes(items, parentRef) {
    const refs = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      item.ref = doc.context.nextRef();
      item.parentRef = parentRef;
      if (item.children) buildNodes(item.children, item.ref);
      refs.push(item.ref);
    }
    return refs;
  }

  // assign refs
  function assignRefs(items) {
    for (const item of items) {
      item.ref = doc.context.nextRef();
      if (item.children) assignRefs(item.children);
    }
  }
  assignRefs(scenario.tree);

  const outlinesDictRef = doc.context.nextRef();

  function createItems(items, parentRef) {
    const refs = [];
    for (let i = 0; i < items.length; i++) {
      const n = items[i];
      const da = PDFArray.withContext(doc.context);
      da.push(pageRefs[n.page - 1]);
      da.push(PDFName.of('XYZ'));
      da.push(PDFNull); da.push(PDFNull); da.push(PDFNull);

      const m = new Map();
      m.set(PDFName.of('Title'), PDFHexString.fromText(n.title));
      m.set(PDFName.of('Parent'), parentRef);
      m.set(PDFName.of('Dest'), da);
      if (i > 0) m.set(PDFName.of('Prev'), items[i - 1].ref);
      if (i < items.length - 1) m.set(PDFName.of('Next'), items[i + 1].ref);

      if (n.children && n.children.length > 0) {
        const childRefs = createItems(n.children, n.ref);
        m.set(PDFName.of('First'), childRefs[0]);
        m.set(PDFName.of('Last'), childRefs[childRefs.length - 1]);
        m.set(PDFName.of('Count'), PDFNumber.of(countDesc(n.children)));
      }

      doc.context.assign(n.ref, PDFDict.fromMapWithContext(m, doc.context));
      refs.push(n.ref);
    }
    return refs;
  }

  function countDesc(nodes) {
    let c = nodes.length;
    for (const n of nodes) if (n.children) c += countDesc(n.children);
    return c;
  }

  const topRefs = createItems(scenario.tree, outlinesDictRef);

  const olM = new Map();
  olM.set(PDFName.of('Type'), PDFName.of('Outlines'));
  if (topRefs.length > 0) {
    olM.set(PDFName.of('First'), topRefs[0]);
    olM.set(PDFName.of('Last'), topRefs[topRefs.length - 1]);
  }
  doc.context.assign(outlinesDictRef, PDFDict.fromMapWithContext(olM, doc.context));
  doc.catalog.set(PDFName.of('Outlines'), outlinesDictRef);

  const bytes = await doc.save({ useObjectStreams: false });
  const outPath = `tools/output/test_${scenario.name}.pdf`;
  fs.writeFileSync(outPath, Buffer.from(bytes));

  // Verify
  try {
    const verify = await PDFDocument.load(bytes);
    const out = verify.catalog.get(PDFName.of('Outlines'));
    console.log(`${scenario.name}: ${bytes.length}B, Outlines: ${!!out}, pages: ${verify.getPageCount()} ✓`);
    
    // Check for NULL bytes
    if (bytes.includes(0)) {
      // NULL byte in hex string is OK (it's ASCII '0') -- check specifically for NULL byte \x00
      for (let i = 0; i < bytes.length; i++) {
        if (bytes[i] === 0) {
          // Check context: is this inside a hex string?
          const ctx = bytes.slice(Math.max(0, i - 10), Math.min(bytes.length, i + 10)).toString('latin1');
          if (!ctx.includes('<') && !ctx.includes('>')) {
            console.log(`  ✗ NULL byte at offset ${i} outside hex string: ${ctx}`);
          }
        }
      }
    }
  } catch (e) {
    console.log(`${scenario.name}: FAILED: ${e.message} ✗`);
    process.exit(1);
  }
}

const scenarios = [
  {
    name: '01_ascii_flat',
    tree: [
      { title: 'Test1', page: 1, level: 1, children: [] },
      { title: 'Test2', page: 2, level: 1, children: [] },
    ],
  },
  {
    name: '02_chinese_flat',
    tree: [
      { title: '摘要', page: 1, level: 1, children: [] },
      { title: '权利要求', page: 2, level: 1, children: [] },
    ],
  },
  {
    name: '03_chinese_parent_parens',
    tree: [
      { title: '摘要(一)', page: 1, level: 1, children: [] },
      { title: '说明书(二)', page: 2, level: 1, children: [] },
    ],
  },
  {
    name: '04_level2',
    tree: [
      { title: '第一章', page: 1, level: 1, children: [
        { title: '第一节', page: 2, level: 2, children: [] },
        { title: '第二节', page: 3, level: 2, children: [] },
      ]},
      { title: '第二章', page: 4, level: 1, children: [] },
    ],
  },
  {
    name: '05_level4',
    tree: [
      { title: 'Chapter 1', page: 1, level: 1, children: [
        { title: 'Section 1.1', page: 2, level: 2, children: [
          { title: 'Subsection 1.1.1', page: 3, level: 3, children: [
            { title: 'Detail 1.1.1.1', page: 4, level: 4, children: [] },
          ]},
        ]},
      ]},
    ],
  },
  {
    name: '06_chinese_all',
    tree: [
      { title: '第一章 总则', page: 1, level: 1, children: [
        { title: '第一条（适用范围）', page: 1, level: 2, children: [] },
        { title: '第二条（定义）', page: 2, level: 2, children: [
          { title: '第二款（术语解释）', page: 2, level: 3, children: [] },
        ]},
      ]},
      { title: '第二章 申请', page: 3, level: 1, children: [
        { title: '第三条（申请文件）', page: 3, level: 2, children: [] },
        { title: '第四条（优先权）', page: 4, level: 2, children: [
          { title: '第1款（外国优先权）', page: 4, level: 3, children: [] },
          { title: '第2款（本国优先权）', page: 5, level: 3, children: [] },
        ]},
      ]},
    ],
  },
];

async function main() {
  for (const s of scenarios) {
    await testLevels(s);
  }
  console.log('\nAll scenarios passed.');
}

main().catch(e => { console.log('ERROR:', e.message, e.stack); process.exit(1); });
