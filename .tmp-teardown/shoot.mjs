import { chromium } from 'playwright';

const URL = 'https://taruntanwar42.github.io/robotaxis-in-berlin/';
const OUT = 'C:/Users/KitCat/Desktop/robotaxi-control-room/.tmp-teardown';

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});

async function shootDesktop() {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.__map, null, { timeout: 45000 });
  await page.waitForTimeout(8000);
  await page.screenshot({ path: `${OUT}/d1-hero.png` });

  // results grid
  try {
    await page.locator('.op-results').scrollIntoViewIfNeeded();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${OUT}/d2-results.png` });
  } catch (e) { console.log('results err', e.message); }

  // tour
  try {
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(800);
    await page.locator('.op-chip.tour').click();
    await page.waitForTimeout(6000);
    await page.screenshot({ path: `${OUT}/d3-tour.png` });
    await page.waitForTimeout(5000);
    await page.screenshot({ path: `${OUT}/d3b-tour-later.png` });
  } catch (e) { console.log('tour err', e.message); }
  await page.close();
}

async function shootDeep() {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(URL + '#deep', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(6000);
  await page.screenshot({ path: `${OUT}/d4-deep-top.png` });
  // scroll through deep brief taking shots
  const h = await page.evaluate(() => document.documentElement.scrollHeight);
  console.log('deep scrollHeight', h);
  let i = 0;
  for (let y = 900; y < Math.min(h, 900 * 14) && i < 12; y += 900, i++) {
    await page.evaluate((yy) => window.scrollTo(0, yy), y);
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${OUT}/d5-deep-${String(i).padStart(2, '0')}.png` });
  }
  await page.close();
}

async function shootMobile() {
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  });
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  try {
    await page.waitForFunction(() => !!window.__map, null, { timeout: 45000 });
  } catch { }
  await page.waitForTimeout(8000);
  await page.screenshot({ path: `${OUT}/m1-hero.png` });
  try {
    await page.locator('.op-results').scrollIntoViewIfNeeded();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${OUT}/m2-results.png` });
  } catch (e) { console.log('m results err', e.message); }
  await page.close();
}

await shootDesktop();
await shootDeep();
await shootMobile();
await browser.close();
console.log('done');
