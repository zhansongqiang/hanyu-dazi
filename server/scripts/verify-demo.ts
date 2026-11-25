/**
 * 只读核对：灌完数据后，`GET /profile/summary` 会输出什么
 *
 * 为什么不用手写 SQL 核对：数字的来源分散在 xp / checkin / rank / stamps 四个 service 里，
 * 自己重算一遍等于换了个实现，对不上时说不清是数据错还是我算错。
 * 这里**直接调那几个 service 函数**（与 routes/progress.ts 完全相同的调用），
 * 所以打印出来的就是接口会返回的东西。
 *
 * 跑法： DB_FILE=./data/_seedtest.db npx tsx scripts/verify-demo.ts [用户名]
 */
import db from '../src/config/database';
import { rankLevelOf, rankNameOf } from '../src/constants';
import { addDays, todayLocal } from '../src/utils/datetime';
import { xpBuckets } from '../src/services/xp';
import { rankOf, weeklyRanking } from '../src/services/rank';
import { getStatus as checkinStatus } from '../src/services/checkin';
import { counts as stampCounts, list as stampList } from '../src/services/stamps';

const username = process.argv[2] || 'apktest1124';

async function main() {
  const user: any = await db('users').where({ username }).first();
  if (!user) {
    console.error(`找不到账号 ${username}`);
    process.exit(1);
  }
  const uid = Number(user.id);
  console.log(`账号 = ${username} (uid ${uid})  created_at=${user.created_at}\n`);

  const [xp, weekMe, ci, stamps, lessonsTotal, lessonsDone, itemsRow, attRow] = await Promise.all([
    xpBuckets(uid),
    rankOf(uid),
    checkinStatus(uid),
    stampCounts(uid),
    db('lessons').count({ c: '*' }).first() as any,
    db('lesson_progress').where({ user_id: uid, status: 'done' }).count({ c: '*' }).first() as any,
    db('attempts').where({ user_id: uid }).countDistinct({ c: 'item_id' }).first() as any,
    db('attempts')
      .where({ user_id: uid })
      .select(
        db.raw('COUNT(*) AS total'),
        db.raw('COALESCE(SUM(CASE WHEN is_correct = 1 THEN 1 ELSE 0 END), 0) AS correct'),
      )
      .first() as any,
  ]);

  const totalAttempts = Number((attRow as any)?.total ?? 0);
  const correctAttempts = Number((attRow as any)?.correct ?? 0);
  const accuracy = totalAttempts > 0 ? Number((correctAttempts / totalAttempts).toFixed(2)) : 0;

  const board = (await weeklyRanking(uid, 20)).list;

  console.log('== 接口将返回（/profile/summary 同路径）==');
  console.log(`  累计 XP      = ${xp.total}   本周 XP = ${xp.week}   今日 XP = ${xp.today}`);
  console.log(`  段位         = ${rankNameOf(xp.total)} · 第 ${rankLevelOf(xp.total)} 级`);
  console.log(`  本周排名     = ${weekMe?.rank ?? '未上榜'} / 共 ${board.length} 人`);
  console.log(`  连击         = ${ci.currentStreak} 天（最长 ${ci.maxStreak}，最后打卡 ${ci.lastCheckinDate}，今日已打卡 ${ci.checkedIn}）`);
  console.log(`  完成课时     = ${Number((lessonsDone as any)?.c ?? 0)} / ${Number((lessonsTotal as any)?.c ?? 0)}`);
  console.log(`  做过的题     = ${Number((itemsRow as any)?.c ?? 0)} 道`);
  console.log(`  正确率       = ${correctAttempts}/${totalAttempts} = ${accuracy}`);
  console.log(`  印章         = ${stamps.earned} / ${stamps.total} 枚`);

  const all = await stampList(uid);
  console.log('\n== 印章墙（✓ 已得 / · 未得）==');
  for (const s of all) console.log(`  ${s.earned ? '✓' : '·'} ${s.name}  [${s.kind}]`);

  console.log('\n== 本周榜单（前 8）==');
  board.slice(0, 8).forEach((r: any) => {
    console.log(`  #${r.rank}  ${r.nickname || r.userId}  ${r.weekXp} XP  ${r.rankName}${r.isMe ? '  ← 本账号' : ''}`);
  });

  console.log('\n== 学习日历（近 14 天）==');
  const today = todayLocal();
  const from = addDays(today, -13);
  const checked = new Set(
    ((await db('checkins')
      .where('user_id', uid)
      .andWhere('check_date', '>=', from)
      .andWhere('check_date', '<=', today)
      .pluck('check_date')) as string[]).map(String),
  );
  for (let i = 0; i < 14; i += 1) {
    const d = addDays(from, i);
    console.log(`  ${d}  ${checked.has(d) ? '●' : '○'}`);
  }

  console.log('\n== 错题本（在册，correct_since < 2）==');
  const wrong = await db('wrong_book as w')
    .leftJoin('items as i', 'i.id', 'w.item_id')
    .where('w.user_id', uid)
    .andWhere('w.correct_since', '<', 2)
    .orderBy('w.wrong_times', 'desc')
    .select('w.item_id', 'i.kind', 'i.char', 'i.prompt', 'w.wrong_times', 'w.correct_since');
  console.log(`  在册 ${wrong.length} 道`);
  for (const w of wrong as any[]) {
    console.log(`    #${w.item_id} ${w.kind} ${w.char ?? ''} ${w.prompt ?? ''} 错过 ${w.wrong_times} 次`);
  }

  console.log('\n== lesson_progress ==');
  const lp = await db('lesson_progress as p')
    .leftJoin('lessons as l', 'l.id', 'p.lesson_id')
    .where('p.user_id', uid)
    .orderBy('p.lesson_id', 'asc')
    .select('p.lesson_id', 'l.title', 'p.status', 'p.best_score', 'p.best_total', 'p.attempts_count', 'p.completed_at');
  console.table(lp);

  await db.destroy();
}

main().catch(async (e) => {
  console.error(e);
  try {
    await db.destroy();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
