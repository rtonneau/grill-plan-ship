const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const p = await b.newPage({ viewport: { width: 1600, height: 1680 }, deviceScaleFactor: 1.5 });
  await p.goto('file://' + process.argv[2]);
  await p.screenshot({ path: process.argv[3], omitBackground: true });
  await b.close();
})();
