/**
 * 印章可达性自检 —— 抓「永远灰着、且不报任何错」的一类印章。
 *
 * 判定全在 be-api 的 `services/stamps.ts`，四类各有各的「恒 false」入口：
 *  - `kind='unit'`   → `ref_key` 不存在，或该单元一节课都没有
 *  - `kind='stroke'` → `ref_key` 不存在，或该单元**一道描红题都没有**
 *                      （`unitAllStrokesCorrect` 里 `itemIds.length === 0` 直接 return false，
 *                        所以「描红章落在没有描红题的单元上」是发不出来的，页面只是灰着）
 *  - `kind='streak'` / `kind='xp'` → `threshold` 为 null，判定分支整个被跳过
 *
 * 这些情况接口一律 200、日志一律干净、用户练一辈子也拿不到，只能靠这种静态比对发现。
 * **改过 `content.json` 的单元/知识点结构，或改过 `seeds/stamps.seed.ts` 之后跑一次。**
 *
 * 用法（先导入，再自检）：
 *   npx tsx scripts/import-content.ts
 *   npx tsx scripts/check-stamps.ts
 * 退出码：有可疑印章 → 1；全部通过 → 0。
 */
import db from '../src/config/database';

async function main() {
  const units = (await db('units').pluck('key')) as string[];
  const unitSet = new Set(units);

  const lessonCount = new Map<string, number>();
  const strokeCount = new Map<string, number>();
  const listenCount = new Map<string, number>();
  for (const k of units) {
    const u: any = await db('units').where({ key: k }).first();
    const lc: any = await db('lessons').where({ unit_id: u.id }).count({ c: '*' }).first();
    const sc: any = await db('items as i')
      .join('lessons as l', 'l.id', 'i.lesson_id')
      .where('l.unit_id', u.id)
      .andWhere('i.kind', 'stroke')
      .count({ c: '*' })
      .first();
    const nc: any = await db('items as i')
      .join('lessons as l', 'l.id', 'i.lesson_id')
      .where('l.unit_id', u.id)
      .andWhere('i.kind', 'listen')
      .count({ c: '*' })
      .first();
    lessonCount.set(k, Number(lc?.c ?? 0));
    strokeCount.set(k, Number(sc?.c ?? 0));
    listenCount.set(k, Number(nc?.c ?? 0));
  }

  const defs = (await db('achievements')
    .whereIn('kind', ['unit', 'stroke', 'streak', 'xp'])
    .orderBy('sort')) as any[];

  let bad = 0;
  for (const d of defs) {
    let verdict: string;
    if (d.kind === 'unit' || d.kind === 'stroke') {
      const key = d.ref_key ?? '';
      if (!key) verdict = 'ref_key 为空 → 恒 false';
      else if (!unitSet.has(key)) verdict = `单元「${key}」不在库里 → 恒 false`;
      else if (d.kind === 'unit' && (lessonCount.get(key) ?? 0) === 0)
        verdict = `单元「${key}」没有课时 → 恒 false`;
      else if (d.kind === 'stroke' && (strokeCount.get(key) ?? 0) === 0)
        verdict = `单元「${key}」没有描红题 → 恒 false`;
      else
        verdict = `命中「${key}」（课时 ${lessonCount.get(key)}／描红 ${strokeCount.get(key)}／听音 ${listenCount.get(key)}）`;
    } else {
      verdict = d.threshold == null ? 'threshold 为空 → 恒 false' : `threshold ${d.threshold}`;
    }

    const isBad = verdict.includes('恒 false');
    if (isBad) bad++;
    console.log(`${isBad ? '⚠' : ' '} ${String(d.kind).padEnd(7)} ${String(d.code).padEnd(30)} ${verdict}`);
  }

  console.log(`\n印章 ${defs.length} 枚，恒 false 的 ${bad} 枚`);
  console.log(`库里单元 ${units.length} 个：${units.join(', ')}`);
  if (!units.length) console.log('（库里没有单元 —— 先跑 import-content.ts）');

  await db.destroy();
  process.exit(bad ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  await db.destroy();
  process.exit(1);
});
