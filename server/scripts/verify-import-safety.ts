/**
 * 验证导入器的那条安全声明：内容里已经没有的题，
 * **没人作答过就删，作答过就留**。
 *
 * 用法：npx tsx scripts/verify-import-safety.ts
 *
 * 为什么值得单独一个脚本：接下来五天要反复改 content.json、反复重导入。
 * 万一哪天有人把导入器改成「清空重插」，答题记录会静默指向不存在的题 ——
 * 错题本和课时进度当场变空，且不报任何错。这条不变量是整套设计的地基，
 * 地基不该靠「我记得当时测过」。改过导入器就重跑一次这个。
 *
 * 做法：往库里塞两条内容里不存在的题，其中一条挂一条答题记录，
 * 然后跑真正的导入器，看谁被删、谁留下。跑完自己清理干净。
 */
import { execFileSync } from 'child_process';
import path from 'path';
import db from '../src/config/database';

const TAG = 'zzz-safety-check';

async function main(): Promise<void> {
  const lesson = await db('lessons').orderBy('id').first();
  if (!lesson) {
    console.error('库里没有课时，先跑一次 import-content.ts');
    process.exit(1);
  }

  const cleanup = async () => {
    await db('attempts').whereIn(
      'item_id',
      db('items').where({ point_key: TAG }).select('id')
    ).delete();
    await db('items').where({ point_key: TAG }).delete();
  };
  await cleanup(); // 上次跑剩的先清掉

  const insertFake = async (kind: string) =>
    Number(
      (
        (await db('items').insert({
          lesson_id: lesson.id,
          point_key: TAG,
          kind,
          prompt: '这条题不在 content.json 里',
          prompt_en: 'not in content.json',
          options: JSON.stringify(['a', 'b', 'c', 'd']),
          answer: 'a',
          sort: 999,
        })) as unknown as number[]
      )[0]
    );

  const usedId = await insertFake('recognize'); // 有人作答过 → 应当保留
  const unusedId = await insertFake('pinyin'); // 没人作答过 → 应当删掉
  await db('attempts').insert({
    user_id: 1,
    item_id: usedId,
    lesson_id: lesson.id,
    is_correct: 0,
    user_answer: 'b',
    created_at: '2000-01-01 00:00:00',
  });

  console.log(`塞进两条题：#${usedId}（挂了一条答题记录）、#${unusedId}（没人作答）`);

  // 整条命令写成一个字符串 + shell: true：Windows 上 npx 是 npx.cmd，
  // 不用 shell 会 ENOENT；而「参数数组 + shell」在 Node 22 会报 DEP0190。
  const out = execFileSync('npx tsx scripts/import-content.ts', {
    cwd: path.resolve(__dirname, '..'),
    shell: true,
    encoding: 'utf8',
  });

  const keptRow = await db('items').where({ id: usedId }).first();
  const goneRow = await db('items').where({ id: unusedId }).first();
  const warned = /已被作答过，保留/.test(out);
  const attemptCount = Number(
    ((await db('attempts').where({ item_id: usedId }).count({ c: 'id' }).first()) as any)?.c ?? 0
  );

  const results: [string, boolean][] = [
    ['作答过的那条留下了', !!keptRow],
    ['没人作答的那条被删了', !goneRow],
    ['导入输出里说明了为什么留下', warned],
    ['答题记录没被导入碰过', attemptCount === 1],
  ];

  // 断言全做完再清理（清理本身也会删掉测试用的答题记录）
  await cleanup();
  const leftovers = Number(
    ((await db('items').where({ point_key: TAG }).count({ c: 'id' }).first()) as any)?.c ?? 0
  );
  results.push(['清理干净（没有残留的测试数据）', leftovers === 0]);

  let failed = 0;
  console.log('');
  for (const [name, ok] of results) {
    if (!ok) failed++;
    console.log(`  ${ok ? '✓' : '✗'} ${name}`);
  }

  if (failed) {
    console.log(`\n${failed} 项没通过 —— 导入器可能被改成会删掉有答题记录的题了。`);
    await db.destroy();
    process.exit(1);
  }
  console.log('\n全部通过。');
  await db.destroy();
}

main().catch(async (e) => {
  console.error('验证失败：', e);
  await db.destroy();
  process.exit(1);
});
