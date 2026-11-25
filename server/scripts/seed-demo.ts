/**
 * 演示账号灌数据 —— **编造的历史，不是真实使用痕迹**
 *
 * 用途：作品演示录屏。目标账号 `apktest1124`（uid 17）原本是全新的：
 * 0 天连击、完成课时 0/20、印章 0/15、本周第 4 名 —— 印章页是一墙「未」，
 * 「我的」页也偏空，录出来不好看。
 *
 * ⚠️ 因此本脚本写入的是**杜撰的练习记录**。任何对外材料若引用这批数据，
 * 必须同时说明「演示数据」；不得当成真实用户留存来讲。
 *
 * ---- 为什么这么写（数据模型约束，全部来自源码，不是我猜的）----
 *  - **印章是派生的**（`services/stamps.ts`）：`unit` 章 ← 该单元全部课时
 *    `lesson_progress.status='done'`；`stroke` 章 ← 该单元每道 `kind='stroke'`
 *    的题都至少答对过一次；`streak`/`xp` 章 ← 读 `user_streaks` / `SUM(xp_events)`。
 *    所以插记录即可，**不要去写 `user_achievements`**（那是 `evaluate()` 的活）。
 *  - **XP 没有缓存列**（`services/xp.ts` 明写：缓存列在 SmartCampus 上已经错过一次），
 *    一律 `SUM(xp_events.amount)`。所以每一笔都要真的插 `xp_events`。
 *  - **连击存在列里**（`user_streaks.current_streak`），由 `touch()` 按
 *    `daysBetween()` 递推，**不是读时算的**。所以补历史打卡必须**手工维护本表**，
 *    否则连击会是 0。
 *  - **`wrong_book` 的 `correct_since` 用 `id` 比较**，不是 `created_at` ——
 *    「最后一次答错之后又答对了几次」。所以回填时间戳不会影响错题本判定。
 *  - 时间戳一律 `'YYYY-MM-DD HH:mm:ss'` **本地时间**（`utils/datetime.ts`）：
 *    绝不写 ISO-Z，也绝不写 Date 对象（better-sqlite3 会存成整数毫秒）。
 *
 * ---- 走真代码路径，只回填时间 ----
 * 作答一律调 `judgeAndPersist()`（`POST /attempts` 的同一个函数），这样
 * `is_correct` 的归一化、`lesson_id` 的取值、XP 常量都与线上完全一致；
 * 课时结算照抄 `POST /lessons/:id/finish` 的算式（比例比绝对值）；
 * 印章与连击调真的 `evaluate()` / `touch()`。
 * 只有 `created_at` 是插入后按 id 区间回填的 —— 因为服务层只会写「此刻」。
 *
 * ---- 跑法 ----
 *   npx tsx scripts/seed-demo.ts            # 只看计划，不写库
 *   npx tsx scripts/seed-demo.ts --yes      # 真写
 *   npx tsx scripts/seed-demo.ts --undo     # 按 marks 文件回滚
 *
 * 目标库由 `DB_FILENAME` 决定（`config/database.ts`）。**先在副本上试**：
 *   npx tsx scripts/seed-demo.ts --copy     # 用 better-sqlite3 backup 复制一份，
 *                                           # 并打印副本路径（WAL 安全，不必停后端）
 * 然后 `DB_FILENAME=./data/_seedtest.db npx tsx scripts/seed-demo.ts --yes`。
 */
import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import db from '../src/config/database';
import {
  LESSON_DONE_RATIO,
  XP_PER_CHECKIN,
  XP_PER_CORRECT,
  XP_PER_LESSON,
  XP_PER_WRONG,
} from '../src/constants';
import { judgeAndPersist } from '../src/services/attempt';
import { touch as touchCheckin } from '../src/services/checkin';
import { evaluate as evaluateStamps } from '../src/services/stamps';
import { grantXp, totalXp } from '../src/services/xp';
import { currentStreak } from '../src/services/checkin';

const USERNAME = process.env.SEED_USER || 'apktest1124';
const USER_CREATED_AT = '2026-11-23 19:05:00';
const MARKS = path.resolve(__dirname, '.seed-demo-marks.json');

type Day = {
  date: string;
  /** 学习起始时刻 'HH:MM' */
  from: string;
  /** 当天要过一遍的课时 id（按顺序） */
  lessons: number[];
  /** 当天额外重练的题目 id（描红多练几遍，完全正常） */
  repeats: number[];
  /** 当天故意答错的题数（分配到该课时，跳过描红题与已在错题本里的题） */
  wrongs: number[];
};

/**
 * 三天排课。总作答 = 140（单元 1、2 的全部题目各一遍）+ 16（描红再练一遍）= 156。
 * 排布理由：第一天 2 课、第二天单元 1 收尾、第三天单元 2 收尾，
 * 于是「初识汉字／生活词汇」两枚单元章与两枚描红章分两天解锁，看着像真在学。
 */
const SCHEDULE: Day[] = [
  { date: '2026-11-23', from: '19:30', lessons: [1, 2], repeats: [], wrongs: [2, 1] },
  {
    date: '2026-11-24',
    from: '19:20',
    lessons: [3, 20, 4],
    repeats: [4, 8, 12, 16, 20, 24, 28, 32],
    wrongs: [1, 1, 2],
  },
  {
    date: '2026-11-25',
    from: '07:20',
    lessons: [5, 6, 7],
    repeats: [36, 40, 44, 48, 153, 155, 157, 159],
    wrongs: [1, 1, 1],
  },
];

/** 每题之间的间隔（秒），用来把一天的作答摊开 */
const STEP_SEC = 34;

const args = process.argv.slice(2);
const has = (f: string) => args.includes(f);
const YES = has('--yes');
const UNDO = has('--undo');
const COPY = has('--copy');

/** 'YYYY-MM-DD HH:MM:SS' + n 秒 —— 只做本地时间算术，不碰时区 */
function plusSec(date: string, hhmm: string, addSec: number): string {
  const [h, m] = hhmm.split(':').map(Number);
  const base = new Date(`${date}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`);
  const d = new Date(base.getTime() + addSec * 1000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${date} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

async function maxId(table: string): Promise<number> {
  const r: any = await db(table).max({ m: 'id' }).first();
  return Number(r?.m ?? 0);
}

async function main() {
  const dbFile = path.resolve(process.cwd(), process.env.DB_FILENAME || './data/hanyu-dazi.db');
  console.log(`目标库 = ${dbFile}`);

  /* ------------------------- --copy：WAL 安全地复制一份 ------------------------- */
  if (COPY) {
    const dest = path.resolve(process.cwd(), './data/_seedtest.db');
    const src = new Database(dbFile, { readonly: true });
    await src.backup(dest);
    src.close();
    console.log(`已复制到 ${dest}（better-sqlite3 backup，含 WAL 内容）`);
    console.log(`试跑：DB_FILENAME=./data/_seedtest.db npx tsx scripts/seed-demo.ts --yes`);
    await db.destroy();
    return;
  }

  const user: any = await db('users').where({ username: USERNAME }).first();
  if (!user) {
    console.error(`!! 找不到账号 ${USERNAME}`);
    await db.destroy();
    process.exit(1);
  }
  const uid = Number(user.id);
  console.log(`账号 = ${USERNAME} (uid ${uid})  created_at=${user.created_at}`);

  /* ------------------------------- --undo ------------------------------- */
  if (UNDO) {
    if (!fs.existsSync(MARKS)) {
      console.error(`!! 找不到 ${MARKS}，无法回滚`);
      await db.destroy();
      process.exit(1);
    }
    const m = JSON.parse(fs.readFileSync(MARKS, 'utf8'));
    await db('attempts').where('user_id', uid).andWhere('id', '>', m.maxAttempt).del();
    await db('xp_events').where('user_id', uid).andWhere('id', '>', m.maxXp).del();
    await db('checkins').where('user_id', uid).andWhere('id', '>', m.maxCheckin).del();
    await db('lesson_progress').where('user_id', uid).andWhere('id', '>', m.maxLp).del();
    await db('user_achievements').where({ user_id: uid }).del();
    await db('user_streaks').where({ user_id: uid }).del();
    if (m.prevStreak) {
      await db('user_streaks').insert(m.prevStreak);
    }
    await db('users').where({ id: uid }).update({ created_at: m.prevUserCreatedAt });
    // 复原被打回来的 lesson_progress 行（原来两行 in_progress）
    for (const row of m.prevLp as any[]) {
      await db('lesson_progress').where({ id: row.id }).update(row);
    }
    console.log('已回滚。');
    await db.destroy();
    return;
  }

  /* ------------------------- 已经灌过就不许再灌 ------------------------- */
  if (fs.existsSync(MARKS)) {
    const m = JSON.parse(fs.readFileSync(MARKS, 'utf8'));
    const still: any = await db('attempts')
      .where('user_id', uid)
      .andWhere('id', '>', m.maxAttempt)
      .count({ c: '*' })
      .first();
    if (Number(still?.c ?? 0) > 0) {
      console.error(`!! 上次灌的数据还在（${still.c} 条作答）。先 --undo 或删掉 ${MARKS}`);
      await db.destroy();
      process.exit(1);
    }
  }

  /* ------------------------------ 排计划 ------------------------------ */
  const alreadyWrong = new Set(
    ((await db('wrong_book').where({ user_id: uid }).pluck('item_id')) as number[]).map(Number),
  );
  const strokeIds = new Set(
    ((await db('items as i')
      .join('lessons as l', 'l.id', 'i.lesson_id')
      .join('units as u', 'u.id', 'l.unit_id')
      .whereIn('u.key', ['basic-char', 'basic-word'])
      .andWhere('i.kind', 'stroke')
      .pluck('i.id')) as number[]).map(Number),
  );

  type Row = { itemId: number; lessonId: number; answer: string; correct: boolean; ts: string };
  const perDay: Row[][] = [];

  for (const day of SCHEDULE) {
    const rows: Row[] = [];
    let cursor = 0;
    const stamp = () => plusSec(day.date, day.from, cursor * STEP_SEC);

    for (let li = 0; li < day.lessons.length; li += 1) {
      const lid = day.lessons[li];
      const items: any[] = await db('items').where({ lesson_id: lid }).orderBy('id', 'asc').select('id', 'answer');
      // 当天该课时要答错的题：跳过描红题（描红必须全对，否则 stroke 章永远拿不到）
      // 也跳过已在错题本里的题（那只会把 wrong_times 抬高，不增加待复习条目）
      const wrongCount = day.wrongs[li] ?? 0;
      const wrongIds = new Set(
        items
          .filter((it) => !strokeIds.has(Number(it.id)) && !alreadyWrong.has(Number(it.id)))
          .slice(0, wrongCount)
          .map((it) => Number(it.id)),
      );
      for (const it of items) {
        const id = Number(it.id);
        const correct = !wrongIds.has(id);
        rows.push({ itemId: id, lessonId: lid, answer: String(it.answer ?? ''), correct, ts: stamp() });
        cursor += 1;
      }
      for (const id of wrongIds) alreadyWrong.add(id);
    }

    for (const iid of day.repeats) {
      const it: any = await db('items').where({ id: iid }).first('id', 'answer', 'lesson_id');
      rows.push({
        itemId: Number(it.id),
        lessonId: Number(it.lesson_id),
        answer: String(it.answer ?? ''),
        correct: true,
        ts: stamp(),
      });
      cursor += 1;
    }
    perDay.push(rows);
  }

  const all = perDay.flat();
  const totalCorrect = all.filter((r) => r.correct).length;
  console.log(`\n计划：${SCHEDULE.length} 天，共 ${all.length} 条作答（答对 ${totalCorrect} / 答错 ${all.length - totalCorrect}）`);
  for (let i = 0; i < SCHEDULE.length; i += 1) {
    const d = SCHEDULE[i];
    console.log(`  ${d.date}  ${d.from} 起  ${perDay[i].length} 条  课时 ${d.lessons.join(',')}  重练 ${d.repeats.length}`);
  }
  const seedXp =
    totalCorrect * XP_PER_CORRECT +
    (all.length - totalCorrect) * XP_PER_WRONG +
    SCHEDULE.reduce((s, d) => s + d.lessons.length, 0) * XP_PER_LESSON +
    3 * XP_PER_CHECKIN;
  console.log(
    `预期 XP：作答 ${totalCorrect * XP_PER_CORRECT}+${(all.length - totalCorrect) * XP_PER_WRONG}` +
      `  课时 ${SCHEDULE.reduce((s, d) => s + d.lessons.length, 0) * XP_PER_LESSON}` +
      `  打卡 ${3 * XP_PER_CHECKIN}  ⇒ 本次新增 ${seedXp}，加上存量 ${await totalXp(uid)}`,
  );

  if (!YES) {
    console.log('\n（未加 --yes，不写库）');
    await db.destroy();
    return;
  }

  /* ------------------------------ 开写 ------------------------------ */
  const marks = {
    maxAttempt: await maxId('attempts'),
    maxXp: await maxId('xp_events'),
    maxCheckin: await maxId('checkins'),
    maxLp: await maxId('lesson_progress'),
    prevUserCreatedAt: user.created_at,
    prevStreak: (await db('user_streaks').where({ user_id: uid }).first()) ?? null,
    prevLp: (await db('lesson_progress').where({ user_id: uid }).select('*')) as any[],
  };
  // 标记**先落盘再动库** —— 中途炸了才有得回滚（写在最后的话，失败就只剩半灌状态）
  fs.writeFileSync(MARKS, JSON.stringify(marks, null, 2), 'utf8');
  console.log(`\n回滚标记已落盘：${MARKS}`);

  // 1) 账号注册日提前到 11-23（否则「自 X 起在练」与 3 天连击互相打架）
  await db('users').where({ id: uid }).update({ created_at: USER_CREATED_AT });

  // 2) 11-23 / 11-24 的历史打卡 + 连击列
  const histCheckins: Array<{ date: string; ts: string; streak: number }> = [
    { date: '2026-11-23', ts: '2026-11-23 20:12:00', streak: 1 },
    { date: '2026-11-24', ts: '2026-11-24 20:05:00', streak: 2 },
  ];
  for (const h of histCheckins) {
    await db('checkins').insert({
      user_id: uid,
      check_date: h.date,
      lesson_id: null,
      xp_earned: XP_PER_CHECKIN,
      created_at: h.ts,
    });
    const xid = await maxId('xp_events');
    await grantXp({ userId: uid, amount: XP_PER_CHECKIN, reason: 'streak', refType: 'checkin', refId: null, note: `连续打卡第 ${h.streak} 天` });
    await db('xp_events').where('id', '>', xid).update({ created_at: h.ts });
  }
  await db('user_streaks').insert({
    user_id: uid,
    current_streak: 2,
    max_streak: 2,
    last_checkin_date: '2026-11-24',
    updated_at: '2026-11-24 20:05:00',
  });

  // 3) 逐天灌作答（真判题函数），插完立刻按 id 区间回填当天时间
  const lessonDoneAt = new Map<number, string>();
  for (let i = 0; i < SCHEDULE.length; i += 1) {
    const rows = perDay[i];
    const markA = await maxId('attempts');
    const markX = await maxId('xp_events');
    for (const r of rows) {
      await judgeAndPersist({
        userId: uid,
        itemId: r.itemId,
        // 答对的就把答案原样送进去；答错的送一个必然不匹配的串（norm 后不等）
        userAnswer: r.correct ? r.answer : '×××',
        durationMs: 2600 + ((r.itemId * 7919) % 9000),
        withStamp: false, // 全部灌完再统一结算，避免中途反复发章
      });
    }
    // attempts 与 xp_events(correct/wrong) 在本次循环里一一对应、同序插入 ⇒ 可以按序回填
    const aIds = (await db('attempts').where('user_id', uid).andWhere('id', '>', markA).orderBy('id', 'asc').pluck('id')) as number[];
    const xIds = (await db('xp_events').where('user_id', uid).andWhere('id', '>', markX).orderBy('id', 'asc').pluck('id')) as number[];
    if (aIds.length !== rows.length || xIds.length !== rows.length) {
      throw new Error(`回填错位：attempts ${aIds.length} / xp ${xIds.length} / 计划 ${rows.length}`);
    }
    for (let k = 0; k < rows.length; k += 1) {
      await db('attempts').where({ id: aIds[k] }).update({ created_at: rows[k].ts });
      await db('xp_events').where({ id: xIds[k] }).update({ created_at: rows[k].ts });
    }
    for (const lid of SCHEDULE[i].lessons) {
      const t = rows.filter((r) => r.lessonId === lid).map((r) => r.ts);
      lessonDoneAt.set(lid, t[t.length - 1] ?? plusSec(SCHEDULE[i].date, SCHEDULE[i].from, 0));
    }
    console.log(`  ${SCHEDULE[i].date} 写入 ${rows.length} 条`);
  }

  // 4) 课时结算 —— 照抄 POST /lessons/:id/finish 的算式（比例比绝对值，阈值取常量）
  const lessonsTouched = [...new Set(SCHEDULE.flatMap((d) => d.lessons))];
  for (const lid of lessonsTouched) {
    const itemIds = (await db('items').where({ lesson_id: lid }).pluck('id')) as number[];
    const total = itemIds.length;
    const okRow: any = await db('attempts')
      .where({ user_id: uid, lesson_id: lid })
      .andWhere('is_correct', 1)
      .whereIn('item_id', itemIds)
      .countDistinct({ c: 'item_id' })
      .first();
    const correctCount = Number(okRow?.c ?? 0);
    const done = correctCount / total >= LESSON_DONE_RATIO;
    if (!done) throw new Error(`课时 ${lid} 比例 ${correctCount}/${total} 未达阈值，排课有问题`);
    const now = lessonDoneAt.get(lid)!;
    const prev: any = await db('lesson_progress').where({ user_id: uid, lesson_id: lid }).first();
    const patch = {
      status: 'done',
      best_score: correctCount,
      best_total: total,
      completed_at: now,
      updated_at: now,
    };
    if (prev) await db('lesson_progress').where({ id: prev.id }).update(patch);
    else
      await db('lesson_progress').insert({
        user_id: uid,
        lesson_id: lid,
        attempts_count: 0,
        last_item_id: null,
        created_at: now,
        ...patch,
      });
    const lesson: any = await db('lessons').where({ id: lid }).first('title');
    const xid = await maxId('xp_events');
    await grantXp({
      userId: uid,
      amount: XP_PER_LESSON,
      reason: 'lesson_done',
      refType: 'lesson',
      refId: lid,
      note: `完成课时「${lesson?.title ?? lid}」`,
    });
    await db('xp_events').where('id', '>', xid).update({ created_at: now });
  }

  // 5) 今天的打卡：走真 touch()，它会把连击从 2 推到 3，并顺手结算印章
  const ci = await touchCheckin(uid);
  console.log(`\n今日打卡：created=${ci.created} 连击=${ci.currentStreak} 最长=${ci.maxStreak} +${ci.xpEarned} XP`);

  // 6) 兜底再结算一次（touch 已经结算过，幂等）
  const unlocked = await evaluateStamps(uid);

  console.log(`\n=== 灌完 ===`);
  console.log(`连击 = ${await currentStreak(uid)} 天`);
  console.log(`累计 XP = ${await totalXp(uid)}`);
  console.log(`本次新解锁印章 = ${unlocked.map((u) => `${u.name}(${u.code})`).join(', ') || '（无）'}`);
  await db.destroy();
}

main().catch(async (e) => {
  console.error('!! 失败：', e);
  try {
    await db.destroy();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
