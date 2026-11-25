// 文案页自检 —— 借用 SmartCampus 的 playwright-core + chromium-1208，不装任何依赖
// 用法: node copy-shoot.cjs   输出: _copy-check.txt + _copy-desktop.png + _copy-mobile.png
const path = require('path');
const fs = require('fs');

const PW = 'D:/coding/SmartCampus/web/node_modules/playwright-core';
const CHROME = 'C:/Users/Admin/AppData/Local/ms-playwright/chromium-1208/chrome-win64/chrome.exe';

const { chromium } = require(PW);

const DIR = __dirname;
const PAGE = 'file:///' + path.join(DIR, 'xiaohongshu-copy.html').replace(/\\/g, '/');
const out = [];

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });

  // Vue 之外的渲染期错误只走 console.error，两个都要监
  page.on('console', m => { if (m.type() === 'error') out.push('  [console.error] ' + m.text()); });
  page.on('pageerror', e => out.push('  [pageerror] ' + e.message));

  await page.goto(PAGE, { waitUntil: 'load' });
  try { await page.evaluate(() => document.fonts.ready); } catch (e) {}
  await page.waitForTimeout(600);

  const probe = await page.evaluate(() => {
    const imgs = [...document.images];
    const bodyIds = ['body-1','body-2','body-3','body-4','body-5','body-6'];
    const bodies = bodyIds.map(id => {
      const el = document.getElementById(id);
      if (!el) return { id, ok: false };
      const t = el.textContent.replace(/^\s*\n/, '').replace(/\s+$/, '');
      return {
        id,
        ok: true,
        chars: t.length,
        lines: t.split('\n').length,
        asterisk: t.includes('**'),          // 必须为 false：星号已转 <strong>
        tags: (t.match(/#\S+/g) || []).length,
        first: t.split('\n')[0].slice(0, 18),
        last: t.split('\n').filter(Boolean).pop().slice(0, 18),
      };
    });
    return {
      cards: document.querySelectorAll('article.card').length,
      titleBtns: document.querySelectorAll('button.title-btn').length,
      copyBtns: document.querySelectorAll('[data-copy^="#body-"]').length,
      slots: document.querySelectorAll('.slot').length,
      imgs: imgs.length,
      broken: imgs.filter(i => !i.complete || i.naturalWidth === 0).map(i => i.getAttribute('src')),
      coverDims: imgs.map(i => i.naturalWidth + 'x' + i.naturalHeight),
      scrollW: document.documentElement.scrollWidth,
      innerW: window.innerWidth,
      pageH: document.documentElement.scrollHeight,
      hasToast: !!document.getElementById('toast'),
      bodies,
    };
  });

  out.push('cards        = ' + probe.cards + '   (期望 6)');
  out.push('titleBtns    = ' + probe.titleBtns + '   (期望 18)');
  out.push('copyBtns     = ' + probe.copyBtns + '   (期望 6)');
  out.push('schedule     = ' + probe.slots + ' 个时段');
  out.push('toast        = ' + probe.hasToast);
  out.push('imgs         = ' + probe.imgs + '  broken=' + probe.broken.length +
           (probe.broken.length ? '  -> ' + probe.broken.join(', ') : ''));
  out.push('cover尺寸    = ' + probe.coverDims.join(' | '));
  out.push('桌面横向滚动 = scrollW ' + probe.scrollW + ' vs innerW ' + probe.innerW +
           (probe.scrollW > probe.innerW ? '  ✗ 溢出' : '  ✓ 无溢出'));
  out.push('整页高度     = ' + probe.pageH + ' px');
  out.push('');
  out.push('--- 六篇正文抽取 ---');
  for (const b of probe.bodies) {
    out.push(`${b.id}: ok=${b.ok} chars=${b.chars} lines=${b.lines} 星号=${b.asterisk} 标签=${b.tags}`);
    if (b.ok) out.push(`      首行「${b.first}…」 末行「…${b.last}」`);
  }

  await page.screenshot({ path: path.join(DIR, '_copy-desktop.png'), fullPage: true });
  // 首屏（头部 + 节奏 + 第一张卡片）单独抓一张，fullPage 太高会被缩得看不清
  await page.screenshot({ path: path.join(DIR, '_copy-top.png'), clip: { x: 0, y: 0, width: 1280, height: 1500 } });
  await (await page.$('article.card:nth-of-type(1)')).screenshot({ path: path.join(DIR, '_copy-card1.png') });

  // 手机宽度：不应出现整页横向滚动
  const m = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  await m.goto(PAGE, { waitUntil: 'load' });
  await m.waitForTimeout(400);
  const mprobe = await m.evaluate(() => ({
    scrollW: document.documentElement.scrollWidth,
    innerW: window.innerWidth,
    cols: getComputedStyle(document.querySelector('article.card')).gridTemplateColumns,
  }));
  out.push('');
  out.push('手机 390px   = scrollW ' + mprobe.scrollW + ' vs innerW ' + mprobe.innerW +
           (mprobe.scrollW > mprobe.innerW ? '  ✗ 溢出' : '  ✓ 无溢出'));
  out.push('手机卡片列   = ' + mprobe.cols);
  await m.screenshot({ path: path.join(DIR, '_copy-mobile.png'), fullPage: false });

  await browser.close();
  fs.writeFileSync(path.join(DIR, '_copy-check.txt'), out.join('\n'), 'utf8');
})().catch(e => {
  fs.writeFileSync(path.join(__dirname, '_copy-check.txt'), 'THROW\n' + (e && e.stack || e), 'utf8');
  process.exit(1);
});
