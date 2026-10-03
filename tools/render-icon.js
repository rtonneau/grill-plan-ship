const fs = require('fs');
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const p = await b.newPage({ viewport: { width: 512, height: 512 } });
  await p.goto('file://' + process.argv[2]);
  await p.screenshot({ path: process.argv[3], omitBackground: true });
  const uri = 'data:image/svg+xml;base64,' + fs.readFileSync(process.argv[2]).toString('base64');
  const q = await b.newPage({ viewport: { width: 220, height: 140 } });
  await q.setContent(`<body style="margin:0;padding:12px;background:#f3f3f3;display:flex;gap:16px;align-items:center"><img src="${uri}" width="112"><img src="${uri}" width="48"><img src="${uri}" width="24"></body>`);
  await q.waitForTimeout(200);
  await q.screenshot({ path: process.argv[4] });
  await b.close();
})();
