const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 860, height: 520 } });
  page.on('console', msg => console.log('console:', msg.type(), msg.text()));
  page.on('pageerror', err => console.log('pageerror:', err.message));
  await page.goto('http://localhost:8000', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  const range = await page.evaluate(() => {
    return window.__chart ? window.__chart.priceScale('right').getVisibleRange() : null;
  });
  console.log('visible range:', JSON.stringify(range));
  await page.screenshot({ path: '/tmp/local-chart4.png' });
  await browser.close();
})();
