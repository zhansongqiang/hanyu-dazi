/**
 * 内容自检：导入之后跑一遍，看写进库的题是不是都还像回事。
 *
 * 用法：npx tsx scripts/content-audit.ts
 *
 * 为什么不用 `npx tsx -e "..."` 那种一行式：这台机器上多行的 -e 是静默失效的 ——
 * 退出码 0，什么都不打印，很容易被当成「跑过了、没问题」。脚本文件没这个坑。
 *
 * 检查的都是「导入器本该保证、但值得独立复核」的不变量：
 * 选项 4 个、正确答案在选项里、选项不重复、描红有字、听音有音频。
 * 最后打印一个校验和 —— 重跑一次导入再对比，校验和不变就说明
 * 选项是确定性的（同一次内容永远得到同一组选项）。
 */
import crypto from 'crypto';
import db from '../src/config/database';

async function main(): Promise<void> {
  const items = await db('items').select(
    'id',
    'lesson_id',
    'point_key',
    'kind',
    'prompt',
    'prompt_en',
    'options',
    'answer',
    'char',
    'audio_url',
    'sort'
  );

  const byKind: Record<string, number> = {};
  for (const r of items) byKind[r.kind] = (byKind[r.kind] || 0) + 1;
  console.log('按题型：' + Object.entries(byKind).map(([k, v]) => `${k}=${v}`).join('  '));

  const problems: string[] = [];
  for (const r of items) {
    if (r.kind === 'stroke') {
      if (!r.char) problems.push(`#${r.id} 描红题没有 char`);
      if ([...(r.char || '')].length !== 1) problems.push(`#${r.id} 描红题的 char 不是单字：${r.char}`);
      if (r.options) problems.push(`#${r.id} 描红题不该有选项`);
      continue;
    }
    const opts: string[] = JSON.parse(r.options || '[]');
    if (opts.length !== 4) problems.push(`#${r.id} ${r.kind}「${r.prompt}」选项 ${opts.length} 个：${r.options}`);
    if (!opts.includes(r.answer)) problems.push(`#${r.id} ${r.kind}「${r.prompt}」选项里没有正确答案 ${r.answer}`);
    if (new Set(opts).size !== opts.length) problems.push(`#${r.id} ${r.kind}「${r.prompt}」选项有重复：${r.options}`);
    if (r.kind === 'listen' && !r.audio_url) problems.push(`#${r.id} 听音题没有 audio_url`);
    if (r.kind === 'listen' && r.prompt === r.answer) problems.push(`#${r.id} 听音题的题干把答案写出来了`);
    if (!r.prompt_en) problems.push(`#${r.id} ${r.kind} 缺 prompt_en（面向留学生，界面要显示英文提示）`);
  }

  // 每个课时的题数：太少说明 kinds 配漏了
  // 按 units.sort, lessons.sort 排 —— 只按 lessons.sort 会跨单元交错，
  // 因为每个单元的第一个课时 sort 都是 1。
  const perLesson = await db('lessons')
    .join('units', 'units.id', 'lessons.unit_id')
    .leftJoin('items', 'items.lesson_id', 'lessons.id')
    .select('lessons.id', 'lessons.key', 'lessons.title', 'units.title as unit_title', 'units.sort as unit_sort')
    .count({ c: 'items.id' })
    .groupBy('lessons.id')
    .orderBy([{ column: 'units.sort' }, { column: 'lessons.sort' }]);
  console.log('\n每课时题数：');
  let lastUnit = '';
  for (const l of perLesson as any[]) {
    if (l.unit_title !== lastUnit) {
      lastUnit = l.unit_title;
      console.log(`  ${l.unit_title}`);
    }
    console.log(`    ${l.key}（${l.title}）  ${l.c} 题`);
  }

  // 没有题的课时单独点出来
  const empty = (perLesson as any[]).filter((l) => Number(l.c) === 0);
  if (empty.length) {
    console.log(`\n  有 ${empty.length} 个课时一道题都没有：`);
    for (const l of empty) console.log(`    - ${l.key}（${l.title}）`);
  }

  const checksum = crypto
    .createHash('sha256')
    .update(items.map((r) => `${r.point_key}|${r.kind}|${r.options}|${r.answer}`).join('\n'))
    .digest('hex')
    .slice(0, 16);
  console.log(`\n校验和 ${checksum}（重跑导入后应保持不变）`);

  if (problems.length) {
    console.log(`\n发现 ${problems.length} 处问题：`);
    for (const p of problems) console.log(`  - ${p}`);
  } else {
    console.log('\n没有发现问题。');
  }

  await db.destroy();
}

main().catch(async (e) => {
  console.error('自检失败：', e);
  await db.destroy();
  process.exit(1);
});
