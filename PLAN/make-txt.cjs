// 从 xiaohongshu-launch.md 生成手机友好的纯文本文案
// 用法: node make-txt.cjs   输出目录: PLAN/txt/
// 原则：单篇文件里只放正文，不放任何多余文字 —— 手机上"全选→复制"即得干净正文
const path = require('path');
const fs = require('fs');

const DIR = __dirname;
const OUT = path.join(DIR, 'txt');
const MD = fs.readFileSync(path.join(DIR, 'xiaohongshu-launch.md'), 'utf8').replace(/\r\n/g, '\n');

// 发布日 / 短名 / 封面 —— 来自 md 第五节与 covers 目录（与 xiaohongshu-copy.html 同一套映射）
const META = {
  1: { day: 'D3',  dayIdx: 3,  short: '痛点洞察', cover: 'cover-01.png' },
  2: { day: 'D9',  dayIdx: 9,  short: '错题本',   cover: 'cover-02.png' },
  3: { day: 'D5',  dayIdx: 5,  short: '五天故事', cover: 'cover-03.png' },
  4: { day: 'D1',  dayIdx: 1,  short: '声调',     cover: 'cover-04.png' },
  5: { day: 'D11', dayIdx: 11, short: '写字',     cover: 'cover-05.png' },
  6: { day: 'D7',  dayIdx: 7,  short: '不惩罚',   cover: 'cover-06.png' },
};

function parsePost(seg) {
  const head = seg.split('\n')[0].trim();                 // "1 ｜痛点洞察（打教育圈）"
  const n = parseInt(head, 10);
  const pillar = head.split('｜')[1] || '';               // "痛点洞察（打教育圈）"

  const titles = [];
  const tm = seg.match(/\*\*标题备选\*\*[\s\S]*?\n\n/);
  if (tm) {
    const re = /^\d+\.\s+`([^`]+)`/gm;
    let m;
    while ((m = re.exec(tm[0])) !== null) titles.push(m[1]);
  }

  const bm = seg.match(/```\n([\s\S]*?)\n```/);
  // 纯文本没有加粗：把 Markdown 的 ** 去掉（与 HTML 版一致，正文语义不变）
  const body = bm ? bm[1].replace(/\*\*/g, '') : '';

  const cm = seg.match(/\*\*封面\*\*：([^\n]+)/);
  const coverNote = cm ? cm[1].trim() : '';

  return { n, pillar, titles, body, coverNote };
}

const posts = {};
const raw = MD.split(/^### 篇 /m);
for (let i = 1; i <= 6; i++) {
  if (!raw[i]) throw new Error('md 里找不到篇 ' + i);
  posts[i] = parsePost(raw[i]);
}

fs.mkdirSync(OUT, { recursive: true });
const written = [];

// \n -> \r\n：手机文本查看器对 CRLF 兼容最好；UTF-8 不带 BOM（避免粘进正文一个不可见字符）
function writeTxt(name, text) {
  const body = text.replace(/\r\n/g, '\n').replace(/\n+$/, '');
  fs.writeFileSync(path.join(OUT, name), body.replace(/\n/g, '\r\n') + '\r\n', 'utf8');
  written.push(name);
}

// ---- 1. 单篇文件：只有正文，全选即复制 ----
for (let i = 1; i <= 6; i++) {
  const p = posts[i], m = META[i];
  writeTxt(`篇${i}-${m.short}-${m.day}发.txt`, p.body);
}

// ---- 2. 说明 + 标题备选 ----
const order = [4, 1, 3, 6, 2, 5];   // 按发布顺序
const L = [];
L.push('汉语搭子 · 小红书成品文案（纯文本版）');
L.push('源头：PLAN/xiaohongshu-launch.md —— 要改文案改那个文件，再跑 node PLAN/make-txt.cjs 重新生成这里');
L.push('');
L.push('【怎么用】');
L.push('1. 单篇文件（篇N-….txt）里只有正文，含话题标签，没有任何多余文字：');
L.push('   手机上打开 → 全选 → 复制 → 直接粘进小红书，不会带上标题/说明/分隔线。');
L.push('2. 标题从下面【标题备选】里挑一条，选中那一行单独复制。');
L.push('3. 封面图：PLAN/covers/ 目录下对应那份 PNG。');
L.push('4. 发之前请按自己的口吻改一遍 —— 这一步别省，AI 味重会被识破。');
L.push('');
L.push('【发布节奏 · 前两周】（按发布顺序，D1 在最上面）');
for (const i of order) {
  const p = posts[i], m = META[i];
  const base = p.pillar.split('（')[0];
  // 中文字是双宽，别用 padEnd 对齐；短名与线名相同时只写一次
  const desc = m.short === base ? m.short : `${m.short}（${base}）`;
  L.push(`${m.day.padEnd(4)} 篇 ${i}  ${desc} · 封面 ${m.cover}`);
}
L.push('D12+ 看数据决定复用哪条线');
L.push('');
L.push('节奏原则：前 3 天不发产品（纯干货/洞察）；每篇发布后 30 分钟内回评；一周至少 3 篇，别断更。');
L.push('');
L.push('【标题备选】一行一条，按篇分组');
for (const i of order) {
  const p = posts[i], m = META[i];
  L.push('');
  L.push(`── 篇 ${i} ｜${p.pillar} ｜ ${m.day} 发 ｜ 封面 ${m.cover} ──`);
  p.titles.forEach(t => L.push(t));
}
writeTxt('00-说明与标题备选.txt', L.join('\n'));

// ---- 3. 合并版：一次性传手机/存档用 ----
const C = [];
C.push('汉语搭子 · 六篇文案（按发布顺序 D1 → D11）');
C.push('提示：要发某篇时，请用对应的单篇文件（全选即复制，不带分隔线）；本文件只图方便一次传完。');
for (const i of order) {
  const p = posts[i], m = META[i];
  C.push('');
  C.push(`════════ ${m.day} · 篇 ${i} ｜${p.pillar} · 封面 ${m.cover} ════════`);
  C.push('');
  C.push(p.body);
}
writeTxt('全部文案-按发布顺序.txt', C.join('\n'));

console.log('已写入 ' + written.length + ' 个文件到 ' + OUT);
written.forEach(w => console.log('  ' + w));
