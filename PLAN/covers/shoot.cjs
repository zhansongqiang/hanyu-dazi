// 封面图渲染脚本 —— 借用 SmartCampus 的 playwright-core + chromium-1208，不装任何依赖
// 用法: node shoot.cjs          输出: cover-*.png + shoot-report.txt
const path = require('path');
const fs = require('fs');

const PW = 'D:/coding/SmartCampus/web/node_modules/playwright-core';
const CHROME = 'C:/Users/Admin/AppData/Local/ms-playwright/chromium-1208/chrome-win64/chrome.exe';

const { chromium } = require(PW);

const DIR = __dirname;
const JOBS = ['cover-01', 'cover-02', 'cover-03', 'cover-04', 'cover-05', 'cover-06'];
const W = 1242, H = 1660;

function fileUrl(p) {
  return 'file:///' + p.replace(/\\/g, '/');
}

(async () => {
  const lines = [];
  const fail = [];

  if (!fs.existsSync(CHROME)) fail.push('chromium 不存在: ' + CHROME);
  if (!fs.existsSync(PW)) fail.push('playwright-core 不存在: ' + PW);
  if (fail.length) {
    fs.writeFileSync(path.join(DIR, 'shoot-report.txt'), 'FAIL\n' + fail.join('\n'), 'utf8');
    process.exit(1);
  }

  const browser = await chromium.launch({ executablePath: CHROME });
  const page = await browser.newPage({
    viewport: { width: W, height: H },
    deviceScaleFactor: 1,
  });

  // 页面里的 console 错误也收进来（图片 404 会在这里现形）
  page.on('console', m => {
    if (m.type() === 'error') lines.push('  [console.error] ' + m.text());
  });
  page.on('pageerror', e => lines.push('  [pageerror] ' + e.message));

  for (const job of JOBS) {
    const html = path.join(DIR, job + '.html');
    const png = path.join(DIR, job + '.png');
    if (!fs.existsSync(html)) { lines.push(job + ': HTML 缺失'); continue; }

    await page.goto(fileUrl(html), { waitUntil: 'load' });
    try { await page.evaluate(() => document.fonts.ready); } catch (e) {}

    // 图片是否真的解码成功（避免截到空白占位）
    const imgOk = await page.evaluate(() => {
      const imgs = [...document.images];
      return { count: imgs.length, broken: imgs.filter(i => !i.complete || i.naturalWidth === 0).length };
    });
    await page.waitForTimeout(500);

    await page.screenshot({ path: png, fullPage: false });
    const size = fs.statSync(png).size;
    lines.push(`${job}: ${W}x${H}  img=${imgOk.count}(broken ${imgOk.broken})  ${(size / 1024).toFixed(0)} KB`);
  }

  await browser.close();
  const out = lines.join('\n');
  fs.writeFileSync(path.join(DIR, 'shoot-report.txt'), out, 'utf8');
})().catch(e => {
  fs.writeFileSync(path.join(__dirname, 'shoot-report.txt'), 'THROW\n' + (e && e.stack || e), 'utf8');
  process.exit(1);
});
