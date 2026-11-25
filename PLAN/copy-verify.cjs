// 点下去到底复制了什么 —— 真点击 + 读回剪贴板，不靠计数
// 用法: node copy-verify.cjs   输出: _copy-verify.txt
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
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });

  let perms = '未授予';
  try {
    await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'file://' });
    perms = '已授予';
  } catch (e) { perms = '授予失败: ' + e.message.split('\n')[0]; }
  out.push('剪贴板权限 = ' + perms);

  const page = await ctx.newPage();
  page.on('pageerror', e => out.push('  [pageerror] ' + e.message));
  await page.goto(PAGE, { waitUntil: 'load' });
  await page.waitForTimeout(400);

  const hasApi = await page.evaluate(() => !!(navigator.clipboard && navigator.clipboard.writeText));
  out.push('file:// 下 navigator.clipboard 可用 = ' + hasApi);
  out.push('');

  // ---- A. 真实点击：看 toast 说什么（走浏览器真实复制路径） ----
  out.push('=== A. 真实点击（读 toast 与回读剪贴板） ===');
  await page.click('article.card:nth-of-type(1) button.title-btn');
  await page.waitForTimeout(250);
  let toast = await page.textContent('#toast');
  out.push('点标题备选1 → toast: 「' + toast + '」');

  let readback = '（未能回读）';
  try {
    readback = await page.evaluate(() => navigator.clipboard.readText());
  } catch (e) { readback = '（回读被拒: ' + e.message.split('\n')[0] + '）'; }
  out.push('  剪贴板回读  : 「' + readback + '」');

  await page.click('article.card:nth-of-type(4) .btn.primary');
  await page.waitForTimeout(250);
  toast = await page.textContent('#toast');
  out.push('点篇4「复制全文」 → toast: 「' + toast + '」');
  try {
    const t = await page.evaluate(() => navigator.clipboard.readText());
    out.push('  剪贴板回读  : ' + t.length + ' 字，首行「' + t.split('\n')[0] + '」，末行「' + t.split('\n').filter(Boolean).pop() + '」');
    out.push('  含加粗星号  : ' + (t.includes('**') ? '✗ 有 **' : '✓ 无 **'));
    out.push('  (与源文件篇4正文逐字相同 = ' + (t === (await srcBody(4)) ? '✓ 是' : '✗ 否 —— 见下方差异') + ')');
    const s = await srcBody(4);
    if (t !== s) out.push(diff(t, s));
  } catch (e) { out.push('  回读失败: ' + e.message.split('\n')[0]); }

  // ---- B. 打桩：逐条核对 6 篇正文 + 18 个标题的载荷 ----
  out.push('');
  out.push('=== B. 打桩记录每一次复制的载荷 ===');
  const page2 = await ctx.newPage();
  await page2.addInitScript(() => {
    window.__copied = [];
    const stub = { writeText: t => { window.__copied.push(t); return Promise.resolve(); } };
    try { Object.defineProperty(navigator, 'clipboard', { value: stub, configurable: true }); }
    catch (e) { window.__stubErr = String(e); }
  });
  await page2.goto(PAGE, { waitUntil: 'load' });
  await page2.waitForTimeout(300);
  out.push('打桩生效 = ' + await page2.evaluate(() => !!(navigator.clipboard && navigator.clipboard.writeText)));

  await page2.evaluate(async () => {
    for (const b of document.querySelectorAll('[data-copy^="#body-"]')) { b.click(); await new Promise(r => setTimeout(r, 30)); }
    for (const b of document.querySelectorAll('button.title-btn')) { b.click(); await new Promise(r => setTimeout(r, 30)); }
  });
  await page2.waitForTimeout(400);

  const copied = await page2.evaluate(() => window.__copied);
  out.push('共记录 ' + copied.length + ' 次（期望 6 正文 + 18 标题 = 24）');
  out.push('');
  copied.forEach((t, i) => {
    const kind = i < 6 ? '正文' : '标题';
    out.push(`${String(i + 1).padStart(2, '0')}. [${kind}] ${t.length} 字  首行「${t.split('\n')[0].slice(0, 26)}」`);
  });
  out.push('');
  out.push('正文里出现 ** 的次数 = ' + copied.slice(0, 6).filter(t => t.includes('**')).length + '（期望 0）');
  out.push('空载荷 = ' + copied.filter(t => !t.trim()).length + '（期望 0）');

  // ---- C. 页面正文 vs md 源文件逐字比对 ----
  out.push('');
  out.push('=== C. 与 xiaohongshu-launch.md 逐字比对（忽略 ** ）===');
  let bad = 0;
  for (let n = 1; n <= 6; n++) {
    const pageTxt = copied[n - 1];
    const mdTxt = srcBody(n);
    if (!mdTxt) { out.push(`篇 ${n}: ✗ 从 md 抽不出代码块`); bad++; continue; }
    if (pageTxt === mdTxt) {
      out.push(`篇 ${n}: ✓ 逐字相同 (${pageTxt.length} 字)`);
    } else {
      bad++;
      out.push(`篇 ${n}: ✗ 不一致  页面 ${pageTxt.length} 字 / md ${mdTxt.length} 字`);
      out.push(diff(pageTxt, mdTxt));
    }
  }
  out.push('');
  out.push(bad === 0 ? '结论：6 篇正文与源文件完全一致' : `结论：${bad} 篇存在差异（见上）`);

  await browser.close();
  fs.writeFileSync(path.join(DIR, '_copy-verify.txt'), out.join('\n'), 'utf8');
})().catch(e => {
  fs.writeFileSync(path.join(__dirname, '_copy-verify.txt'), 'THROW\n' + (e && e.stack || e), 'utf8');
  process.exit(1);
});

// 从 md 源文件里抽出第 n 篇的代码块正文，用于逐字比对
function srcBody(n) {
  const md = fs.readFileSync(path.join(__dirname, 'xiaohongshu-launch.md'), 'utf8');
  const parts = md.split(/^### 篇 /m);
  const seg = parts[n];
  const m = seg.match(/```\n([\s\S]*?)\n```/);
  return m ? m[1].replace(/\*\*/g, '') : '';
}

function diff(a, b) {
  const la = a.split('\n'), lb = b.split('\n');
  const lines = [];
  for (let i = 0; i < Math.max(la.length, lb.length); i++) {
    if (la[i] !== lb[i]) lines.push(`   第${i + 1}行  页面「${la[i]}」 vs 源文件「${lb[i]}」`);
  }
  return lines.length ? '  差异:\n' + lines.join('\n') : '  （无差异）';
}
