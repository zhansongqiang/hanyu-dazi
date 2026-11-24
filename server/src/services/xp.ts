import db from '../config/database';
import { localNowStr, todayLocal } from '../utils/datetime';
import { weekRange } from '../utils/week';

/**
 * XP 流水 —— `xp_events` 的唯一写入口（归属 be-api，契约 §5 的 services/**）。
 *
 * 铁律：**累计 XP 永远等于 `xp_events.amount` 的求和**，不存在 users.xp 这种缓存列。
 * 理由：缓存列一定会和流水对不上（本项目在 SmartCampus 上已经栽过一次
 * "冗余字段与实际记录不一致"），而 xp_events 的行数量级很小，求和毫无压力。
 */

export interface GrantXpInput {
  userId: number;
  amount: number;
  /** correct | wrong | lesson_done | streak | seal | duel */
  reason: string;
  /** item | lesson | achievement | duel | checkin（§4.2 指定用 'item'） */
  refType?: string | null;
  refId?: number | null;
  note?: string | null;
}

/** 写一条 XP 流水，返回实际入账数额（0 不写行，避免刷出一堆 amount=0 的噪声） */
export async function grantXp(input: GrantXpInput): Promise<number> {
  const amount = Math.trunc(Number(input.amount) || 0);
  if (amount === 0) return 0;
  await db('xp_events').insert({
    user_id: input.userId,
    amount,
    reason: input.reason,
    ref_type: input.refType ?? null,
    ref_id: input.refId ?? null,
    note: input.note ?? null,
    created_at: localNowStr(),
  });
  return amount;
}

/** 累计 XP */
export async function totalXp(userId: number): Promise<number> {
  return sumRange(userId);
}

/**
 * 区间求和。
 * `created_at` 是定宽字符串 'YYYY-MM-DD HH:mm:ss'，**字典序 == 时间序**，
 * 所以直接拿字符串比较即可，不需要转 Date（转 Date 反而要处理时区）。
 */
async function sumRange(userId: number, startAt?: string, endAtExclusive?: string): Promise<number> {
  const q = db('xp_events').where('user_id', userId).whereNotNull('created_at');
  if (startAt) q.where('created_at', '>=', startAt);
  if (endAtExclusive) q.where('created_at', '<', endAtExclusive);
  const row: any = await q.sum({ s: 'amount' }).first();
  return Number(row?.s ?? 0) || 0;
}

/** 本周 XP（周一 00:00:00 起，到下周一 00:00:00 止） */
export async function weekXp(userId: number): Promise<number> {
  const { startAt, nextStartAt } = weekRange();
  return sumRange(userId, startAt, nextStartAt);
}

/** 今日 XP */
export async function todayXp(userId: number): Promise<number> {
  const today = todayLocal();
  return sumRange(userId, `${today} 00:00:00`, `${today} 23:59:60`);
}

/**
 * 一次性取「周 + 今日 + 累计」，省掉三次串行查询。
 * §4.5 的 `/profile/summary` 就要这三档，别分三次查。
 */
export async function xpBuckets(userId: number): Promise<{ total: number; week: number; today: number }> {
  const { startAt, nextStartAt } = weekRange();
  const today = todayLocal();
  const rows: any[] = await db('xp_events')
    .where('user_id', userId)
    .whereNotNull('created_at')
    .select(
      db.raw('COALESCE(SUM(amount), 0) AS total'),
      db.raw('COALESCE(SUM(CASE WHEN created_at >= ? AND created_at < ? THEN amount ELSE 0 END), 0) AS week', [startAt, nextStartAt]),
      db.raw('COALESCE(SUM(CASE WHEN created_at >= ? AND created_at < ? THEN amount ELSE 0 END), 0) AS today', [`${today} 00:00:00`, `${today} 23:59:60`]),
    );
  const r = rows[0] ?? {};
  return { total: Number(r.total) || 0, week: Number(r.week) || 0, today: Number(r.today) || 0 };
}

/**
 * 多个用户的累计 XP（成就/排行用）。
 * 返回 Map，查不到的用户不在 Map 里（调用方用 `?? 0` 兜）。
 */
export async function totalXpByUser(userIds: number[]): Promise<Map<number, number>> {
  const map = new Map<number, number>();
  if (!userIds.length) return map;
  const rows: any[] = await db('xp_events')
    .whereIn('user_id', userIds)
    .groupBy('user_id')
    .select('user_id')
    .sum({ s: 'amount' });
  for (const r of rows) map.set(Number(r.user_id), Number(r.s) || 0);
  return map;
}
