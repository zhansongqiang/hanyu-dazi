// 独立核对 PLAN/txt/ 的产物 —— 重新从磁盘读文件，与 md 源文件逐字比对
// 用法: node check-txt.cjs   输出: _txt-check.txt
const path = require('path');
const fs = require('fs');

const DIR = __dirname;
const OUT = path.join(DIR, 'txt');
const out = [];

const MD = fs.readFileSync(path.join(DIR, 'xiaohongshu-launch.md'), 'utf8').replace(/\r\n/g, '\n');

// 直接从 md 抽第 n 篇正文（忽略 ** ），作为唯一真相源
function mdBody(n) {
  const seg = MD.split(/^### 篇 /m)[n];
  const m = seg.match(/```\n([\s\S]*?)\n```/);
  return m ? m[1].replace(/\*\*/g, '') : null;
}
function mdTitles(n) {
  const seg = MD.split(/^### 篇 /m)[n];
  const tm = seg.match(/\*\*标题备选\*\*[\s\S]*?\n\n/);
  const re = /^\d+\.\s+`([^`]+)`/gm, r = [];
  let m; while (tm && (m = re.exec(tm[0])) !== null) r.push(m[1]);
  return r;
}

const META = {
  1: { day: 'D3',  short: '痛点洞察' },
  2: { day: 'D9',  short: '错题本'   },
  3: { day: 'D5',  short: '五天故事' },
  4: { day: 'D1',  short: '声调'     },
  5: { day: 'D11', short: '写字'     },
  6: { day: 'D7',  short: '不惩罚'   },
};

const files = fs.readdirSync(OUT).sort();
out.push('目录 ' + OUT);
out.push('文件数 = ' + files.length + '（期望 8）');
files.forEach(f => out.push('  ' + f + '   ' + fs.statSync(path.join(OUT, f)).size + ' B'));
out.push('');

// ---- A. 单篇文件：逐字等于 md 正文 ----
out.push('=== A. 单篇文件 vs md 正文（逐字，忽略 ** ）===');
let bad = 0;
for (let i = 1; i <= 6; i++) {
  const fn = `篇${i}-${META[i].short}-${META[i].day}发.txt`;
  const p = path.join(OUT, fn);
  if (!fs.existsSync(p)) { out.push(`篇 ${i}: ✗ 文件不存在 (${fn})`); bad++; continue; }
  const rawBytes = fs.readFileSync(p);
  const txt = rawBytes.toString('utf8').replace(/\r\n/g, '\n').replace(/\n+$/, '');
  const src = mdBody(i);
  const bom = rawBytes[0] === 0xEF && rawBytes[1] === 0xBB && rawBytes[2] === 0xBF;
  const crlf = (rawBytes.toString('latin1').match(/\r\n/g) || []).length;
  const lf = (rawBytes.toString('latin1').match(/\n/g) || []).length;

  const flags = [];
  flags.push(bom ? '✗ 有 BOM' : '✓ 无 BOM');
  flags.push(crlf === lf ? `✓ 全 CRLF (${crlf} 行)` : `✗ 行尾混乱 CRLF=${crlf} LF总=${lf}`);
  flags.push(txt.includes('**') ? '✗ 残留 **' : '✓ 无 **');
  flags.push(/\*\*/.test(txt) ? '' : '');
  // 多余内容检查：正文之外不该有任何东西
  flags.push(/^(===|──|【|提示：|汉语搭子)/.test(txt) ? '✗ 混入说明文字' : '✓ 只有正文');

  if (txt === src) {
    out.push(`篇 ${i}: ✓ 逐字相同  ${txt.length} 字 / ${txt.split('\n').length} 行   ${flags.filter(Boolean).join('  ')}`);
    out.push(`        首行「${txt.split('\n')[0]}」`);
    out.push(`        末行「${txt.split('\n').filter(Boolean).pop()}」`);
  } else {
    bad++;
    out.push(`篇 ${i}: ✗ 不一致  文件 ${txt.length} 字 / md ${src ? src.length : 'null'} 字`);
    const a = txt.split('\n'), b = (src || '').split('\n');
    for (let k = 0; k < Math.max(a.length, b.length); k++) {
      if (a[k] !== b[k]) out.push(`        第${k + 1}行 文件「${a[k]}」 vs md「${b[k]}」`);
    }
  }
}

// ---- B. 标题备选：18 条一条不少、逐字相同 ----
out.push('');
out.push('=== B. 标题备选（00-说明与标题备选.txt）===');
const guide = fs.readFileSync(path.join(OUT, '00-说明与标题备选.txt'), 'utf8').replace(/\r\n/g, '\n');
const guideLines = guide.split('\n');
let tHit = 0, tMiss = [];
for (let i = 1; i <= 6; i++) {
  for (const t of mdTitles(i)) {
    if (guideLines.includes(t)) tHit++; else tMiss.push(`篇${i}: ${t}`);
  }
}
out.push(`18 条标题里命中 ${tHit} 条，缺失 ${tMiss.length} 条`);
tMiss.forEach(x => out.push('  ✗ ' + x));

// ---- C. 合并版：六篇正文都完整在里面，且逐字相同 ----
out.push('');
out.push('=== C. 全部文案-按发布顺序.txt ===');
const all = fs.readFileSync(path.join(OUT, '全部文案-按发布顺序.txt'), 'utf8').replace(/\r\n/g, '\n');
const order = [4, 1, 3, 6, 2, 5];
const pos = order.map(i => ({ i, at: all.indexOf(mdBody(i)) }));
out.push('发布顺序 = ' + order.map(i => `D${META[i].day.slice(1)}·篇${i}`).join(' → '));
let cOk = 0;
for (const { i, at } of pos) {
  const ok = at >= 0;
  if (ok) cOk++;
  out.push(`  篇 ${i} (${META[i].day}): ${ok ? '✓ 正文完整存在，起始位置 ' + at : '✗ 找不到正文'}`);
}
// 顺序是否正确（位置递增）
let asc = true;
for (let k = 1; k < pos.length; k++) if (pos[k].at < pos[k - 1].at) asc = false;
out.push('  顺序按发布日递增 = ' + (asc ? '✓ 是' : '✗ 否'));
out.push(`  含 ** 的次数 = ${(all.match(/\*\*/g) || []).length}（期望 0）`);

// ---- D. 编码检查：中文非 ASCII 字符数（确认没被写成 ANSI/gb2312） ----
out.push('');
out.push('=== D. 编码 ===');
for (const f of files) {
  const t = fs.readFileSync(path.join(OUT, f), 'utf8');
  const han = (t.match(/[一-龥]/g) || []).length;
  const repl = (t.match(/�/g) || []).length;
  const mojibake = /[ÃÂåæçèéêëìíîï][\u0080-¿]/.test(t);
  out.push(`  ${f.padEnd(28)} 汉字 ${String(han).padStart(4)}  替换符 ${repl}  ${mojibake ? '✗ 疑似乱码' : '✓ 正常'}`);
}

out.push('');
out.push(bad === 0 && tHit === 18 && cOk === 6
  ? '结论：全部通过（6/6 正文逐字相同，18/18 标题在册，合并版 6/6 完整）'
  : `结论：存在问题（正文差异 ${bad} 篇，标题缺 ${tMiss.length} 条，合并版缺 ${6 - cOk} 篇）`);

fs.writeFileSync(path.join(DIR, '_txt-check.txt'), out.join('\n'), 'utf8');
console.log(out.join('\n'));
