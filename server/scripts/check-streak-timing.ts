/**
 * streak 印章「结算时机」探针 —— 复现并验收已上报的 CHANGE-REQUEST（契约 §4.7）。
 *
 * **缺陷**：`current_streak` 是四类印章判定源里**唯一会倒退**的那个 ——
 * `lesson_progress.status` 不回退、`attempts` 只增、`totalXp` 只增，唯独断签后
 * `current_streak` 归 1。而契约目前只在 `POST /attempts` 与 `POST /lessons/:id/finish`
 * 内部结算印章，**打卡写路径（`POST /checkin` → `services/checkin.touch()`）不结算** ——
 * 可打卡恰恰是**唯一会把 `current_streak` 推过阈值**的动作。
 *
 * 判定：
 *   A == PASS ⇔ 打卡那一刻就把该发的 streak 章发出去（= 缺陷已修）
 *   A == FAIL ⇔ 打卡不结算（= 现状；章要等下一次答题/完成课时/点印章页按钮才补发）
 *   C 是说明性的：条件满足时没人结算、之后断签，则该章**永久不可达**，尽管
 *     `max_streak` 里明明记着曾经连续过。
 *
 * ⚠️ 本脚本会写库（users / user_streaks / checkins / user_achievements），
 *    **必须在隔离库上跑**，不要指向 `server/data/hanyu-dazi.db`：
 *     DB_FILENAME=./data/_verify-streak.db npx tsx src/migrate.ts
 *     DB_FILENAME=./data/_verify-streak.db npx tsx scripts/import-content.ts   # 顺带 seed 印章
 *     DB_FILENAME=./data/_verify-streak.db npx tsx scripts/check-streak-timing.ts
 * 退出码：缺陷仍在 → 1；已修 → 0。
 */
import db from '../src/config/database';
import { touch } from '../src/services/checkin';
import { evaluate } from '../src/services/stamps';
import { todayLocal } from '../src/utils/datetime';

function daysAgo(n: number): string {
  const d = new Date(todayLocal() + 'T00:00:00');
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function streakStamps(userId: number): Promise<string[]> {
  return (await db('user_achievements as ua')
    .join('achievements as a', 'a.id', 'ua.achievement_id')
    .where('ua.user_id', userId)
    .andWhere('a.kind', 'streak')
    .pluck('a.code')) as string[];
}

async function makeUser(tag: string): Promise<number> {
  const [id] = await db('users').insert({
    username: `_probe_${tag}_${Date.now()}`,
    password_hash: 'x',
    nickname: '探针用',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
  return Number(id);
}

async function setStreak(userId: number, current: number, lastDate: string) {
  await db('user_streaks').insert({
    user_id: userId,
    current_streak: current,
    max_streak: current,
    last_checkin_date: lastDate,
    updated_at: new Date().toISOString(),
  });
}

async function main() {
  const defs = (await db('achievements').where({ kind: 'streak' }).orderBy('threshold', 'asc')) as any[];
  if (!defs.length) {
    console.log('库里没有 streak 印章 —— 先跑 import-content.ts（它会 seed 印章）');
    await db.destroy();
    process.exit(1);
  }
  console.log('streak 章定义：', defs.map((d) => `${d.code}(≥${d.threshold})`).join('  '));

  let bad = 0;

  /* ---- A：第 3 天打卡那一刻（昨天打过 → 连击 2，今天还没打） ---- */
  const a = await makeUser('a');
  await setStreak(a, 2, daysAgo(1));
  const ra = await touch(a, null); // ← `POST /checkin` 的全部副作用就是这一行
  const aHas = (await streakStamps(a)).includes('streak-3');
  console.log(`\nA. 打卡：连击 2 → ${ra.currentStreak}，XP +${ra.xpEarned}`);
  if (aHas) {
    console.log('   ✅ PASS —— 打卡当场就发出了 streak-3');
  } else {
    bad++;
    console.log('   ⚠ FAIL —— 连击已到 3，打卡后却没发 streak-3（打卡路径不结算印章）');
  }

  /* ---- B：随后有人做了一次结算（答题 / 完成课时 / 点印章页的结算按钮） ---- */
  const got = await evaluate(a);
  console.log(`\nB. 事后调 evaluate()（缓解路径）：新解锁 = ${got.map((g) => g.code).join(', ') || '（无）'}`);
  console.log('   此刻手上的 streak 章：', (await streakStamps(a)).join(', ') || '（无）');
  console.log('   → 若 A 是 FAIL，则 streak 章只能靠「用户之后还做点别的」来补发，打卡本身不负责');

  /* ---- C：条件满足时无人结算，之后断签 —— 永久不可达 ---- */
  const c = await makeUser('c');
  await setStreak(c, 3, daysAgo(3)); // 曾经连续 3 天（max_streak=3），那天没人结算；此后断签
  const rc = await touch(c, null);
  await evaluate(c);
  const cHas = (await streakStamps(c)).includes('streak-3');
  console.log(`\nC. 曾连续 3 天但当时没人结算，之后断签（last=${daysAgo(3)}）再打卡：`);
  console.log(`   touch() 把连击打回 ${rc.currentStreak}（max_streak 仍记着 ${rc.maxStreak}）`);
  console.log(
    `   再 evaluate() 后手上的 streak 章：${(await streakStamps(c)).join(', ') || '（无）'}` +
      (cHas ? '  ← 意外拿到了' : '  ← 永久拿不到，尽管确实连续过 3 天'),
  );

  console.log(`\n结论：${bad ? `缺陷仍在（A 未通过）` : `A 已通过 —— 打卡链路已结算印章`}`);
  await db.destroy();
  process.exit(bad ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  await db.destroy();
  process.exit(1);
});
