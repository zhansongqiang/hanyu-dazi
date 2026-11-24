import db from '../config/database';
import { XP_PER_CHECKIN } from '../constants';
import { daysBetween, localNowStr, todayLocal } from '../utils/datetime';
import { grantXp } from './xp';
import { evaluate as evaluateStamps } from './stamps';

/**
 * 每日打卡 —— 连击算法的**唯一实现**（契约 §4.6，归属 be-api 的 services/**）。
 *
 * 谁调用：
 *  - `POST /lessons/:id/finish`（be-api）—— 完成任意一课即触发，这是主路径
 *  - `POST /checkin`（fe-game 的 routes/checkin.ts）—— 手动打卡，同一函数
 *  - `GET /checkin/status`（fe-game）—— 调 `getStatus()`
 *
 * 铁律：
 *  - **幂等**：一天一条，`checkins` 上有 `uq_checkin_per_day(user_id, check_date)` 兜底，
 *    今天已打过就返回 `created:false` 且**不报错**（§4.6）
 *  - 连击计算**必须用 `daysBetween()`**，不要自己拿毫秒算 —— 跨月跨年、夏令时都会错
 *  - 时间一律本地时区：`todayLocal()` 写 `check_date`，`localNowStr()` 写 `created_at`
 *    （**绝不**用 SQLite 的 CURRENT_TIMESTAMP —— 它是 UTC，会让"今天"变成明天）
 */

export interface CheckinResult {
  created: boolean;
  checkDate: string;
  currentStreak: number;
  maxStreak: number;
  xpEarned: number;
}

/**
 * 打卡（幂等）。`lessonId` 是触发当天打卡的那节课，手动打卡可不传。
 * 返回的 `xpEarned` 只在**本次真的新建**时非 0 —— 重复调用不会重复发 XP。
 */
export async function touch(userId: number, lessonId?: number | null): Promise<CheckinResult> {
  const today = todayLocal();

  const existing: any = await db('checkins').where({ user_id: userId, check_date: today }).first();
  const streakRow: any = await db('user_streaks').where({ user_id: userId }).first();

  if (existing) {
    return {
      created: false,
      checkDate: today,
      currentStreak: Number(streakRow?.current_streak ?? 0),
      maxStreak: Number(streakRow?.max_streak ?? 0),
      xpEarned: 0,
    };
  }

  // ---- 连击 ----
  const last: string | null = streakRow?.last_checkin_date ?? null;
  const prev: number = Number(streakRow?.current_streak ?? 0);
  let current: number;
  if (!last) {
    current = 1;
  } else {
    const gap = daysBetween(last, today);
    if (gap === 1) {
      current = prev + 1; // 昨天打过 → 接上
    } else if (gap <= 0) {
      // 同一天（理论上前面已拦）或 last 落在未来（改过系统时间）→ 当成延续，不清零
      current = Math.max(prev, 1);
    } else {
      current = 1; // 断了一天以上 → 重头开始
    }
  }
  const max = Math.max(Number(streakRow?.max_streak ?? 0), current);
  const now = localNowStr();

  await db('checkins').insert({
    user_id: userId,
    check_date: today,
    lesson_id: lessonId ?? null,
    xp_earned: XP_PER_CHECKIN,
    created_at: now,
  });

  if (streakRow) {
    await db('user_streaks').where({ user_id: userId }).update({
      current_streak: current,
      max_streak: max,
      last_checkin_date: today,
      updated_at: now,
    });
  } else {
    await db('user_streaks').insert({
      user_id: userId,
      current_streak: current,
      max_streak: max,
      last_checkin_date: today,
      updated_at: now,
    });
  }

  const xpEarned = await grantXp({
    userId,
    amount: XP_PER_CHECKIN,
    reason: 'streak',
    refType: 'checkin',
    refId: null,
    note: `连续打卡第 ${current} 天`,
  });

  /* ---- 结算印章（CHANGE-REQUEST CR-01，2026-11-24 用户批准） ----
   *
   * 为什么必须落在**这里**、而不是 `routes/checkin.ts：`current_streak` 是四类印章判定源里
   * 唯一会**倒退**的那个（`lesson_progress.status` 不回退、`attempts` 只增、`totalXp` 只增，
   * 唯独断签后 `current_streak` 归 1），而打卡恰恰是唯一把它推过阈值的动作；契约原先只在
   * `POST /attempts` 与 `POST /lessons/:id/finish` 结算 ⇒ 打卡推过阈值那一刻无人发章，
   * 等下一次别的动作来补发时连击可能已经断了。**三个调用方（手动打卡 / 完成课时 / 答题）
   * 全部经由本函数**，所以修在 service 层一处即全覆盖，且与 `services/attempt.ts:140` 同形。
   * 反例：修在路由层不成立 —— §4.7 的验收脚本 `scripts/check-streak-timing.ts:24` 直接
   * `import { touch }`、不经过 Express，改路由它照样退出码 1（修了也关不掉）。
   *
   * 只走 `created` 这一支：本函数上面已提前 return「今天已打过」的路径，那条路径**连击没动**，
   * 没有新条件被满足，无需结算（补发由 `evaluate()` 的幂等性 + `POST /stamps/check` 兜底）。
   *
   * 位置在 `grantXp` **之后**：本次打卡发的 XP 若正好把 `totalXp` 顶过 XP 章阈值，
   * 也应当在本次一并结算 —— 那是真实达成的条件，不算越权放宽。
   *
   * ⚠️ `checkin ⇄ stamps` 是**循环引用**（`stamps.ts:3` 反过来 import 本文件的 `currentStreak`）。
   * 安全的前提是两边都只在**函数体内**调用对方、不在模块求值期调用 —— module=CommonJS，
   * 属性在调用时解析，此刻两个模块都已完成求值。改动本文件时不要破坏这个前提
   * （别把对方的东西提到顶层来用）。已用两条入口实测：脚本入口（checkin 先加载）与
   * Express 入口（routes 先加载），退出码与响应均正常。
   *
   * 边界（不许读成已修）：仅覆盖「打卡当刻条件已满足」 —— 已错过窗口的（条件满足时无人结算、
   * 之后断签）仍然不可达，因为判定源是 `current_streak` 而非 `max_streak`；
   * 改判定源属改契约 §4.7 的判定规则，超出本次授权面，留作已知残留（探针 C 场景）。 */
  await evaluateStamps(userId);

  return { created: true, checkDate: today, currentStreak: current, maxStreak: max, xpEarned };
}

/** `GET /checkin/status`（fe-game）—— 今天是否已打卡 + 连击现状 */
export async function getStatus(userId: number): Promise<{
  checkedIn: boolean;
  checkDate: string;
  currentStreak: number;
  maxStreak: number;
  lastCheckinDate: string | null;
}> {
  const today = todayLocal();
  const [existing, streakRow] = await Promise.all([
    db('checkins').where({ user_id: userId, check_date: today }).first(),
    db('user_streaks').where({ user_id: userId }).first(),
  ]);
  return {
    checkedIn: !!existing,
    checkDate: today,
    currentStreak: Number((streakRow as any)?.current_streak ?? 0),
    maxStreak: Number((streakRow as any)?.max_streak ?? 0),
    lastCheckinDate: (streakRow as any)?.last_checkin_date ?? null,
  };
}

/** 连续天数现状（段位/印章判定用，不写库） */
export async function currentStreak(userId: number): Promise<number> {
  const row: any = await db('user_streaks').where({ user_id: userId }).first();
  return Number(row?.current_streak ?? 0);
}
