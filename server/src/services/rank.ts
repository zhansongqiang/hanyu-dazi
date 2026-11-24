import db from '../config/database';
import { rankNameOf } from '../constants';
import { weekRange } from '../utils/week';
import { totalXpByUser } from './xp';

/**
 * 周榜 —— 契约 §4.6 `GET /rank/week` 的唯一实现（归属 be-api 的 services/**）。
 *
 * 之所以由 be-api 实现而不是 fe-game 在自己路由里写：
 * `§4.5 /profile/summary` 也要 `rank.weekRank`。若两边各写一份，就会出现
 * "我的页显示第 12 名、排行页显示第 15 名"这种只有用户能发现的 bug。
 *
 * 周起点 = **周一**（§4.6 明文）。数据来源只认 `xp_events.created_at`，
 * **不用** `user_streaks` 或任何缓存列。
 */

export interface WeekRankItem {
  rank: number;
  userId: number;
  nickname: string;
  avatarUrl: string | null;
  weekXp: number;
  rankName: string;
  isMe: boolean;
}

export interface WeekRankResult {
  weekStart: string;
  weekEnd: string;
  list: WeekRankItem[];
  me: { rank: number; weekXp: number; rankName: string } | null;
}

/** 本周每人 XP 之和，降序。只有 weekXp > 0 的人上榜 */
async function weekScores(): Promise<Array<{ userId: number; weekXp: number }>> {
  const { startAt, nextStartAt } = weekRange();
  const rows: any[] = await db('xp_events')
    .whereNotNull('created_at')
    .where('created_at', '>=', startAt)
    .where('created_at', '<', nextStartAt)
    .groupBy('user_id')
    .select('user_id')
    .sum({ s: 'amount' });

  return rows
    .map((r) => ({ userId: Number(r.user_id), weekXp: Number(r.s) || 0 }))
    .filter((r) => r.weekXp > 0)
    // 同分按 userId 升序，保证名次稳定（不然每次请求顺序都在抖）
    .sort((a, b) => b.weekXp - a.weekXp || a.userId - b.userId);
}

/**
 * 周榜 + 我的名次。
 * `limit = 0` 表示只要 `me`（`rank-of/:userId` 用，省掉查询用户表）。
 */
export async function weeklyRanking(userId: number, limit = 50): Promise<WeekRankResult> {
  const { start, end } = weekRange();
  const scored = await weekScores();

  const myIndex = scored.findIndex((s) => s.userId === userId);
  const me = myIndex >= 0
    ? { rank: myIndex + 1, weekXp: scored[myIndex].weekXp, rankName: '' }
    : null;

  if (limit <= 0) {
    // 只填 me 的段位名（段位按**累计** XP，见下方注释）
    if (me) {
      const acc = await totalXpByUser([userId]);
      me.rankName = rankNameOf(acc.get(userId) ?? 0);
    }
    return { weekStart: start, weekEnd: end, list: [], me };
  }

  const top = scored.slice(0, limit);
  const ids = top.map((t) => t.userId);

  const users: any[] = ids.length
    ? await db('users').whereIn('id', ids).select('id', 'nickname', 'avatar_url')
    : [];
  const userMap = new Map(users.map((u) => [Number(u.id), u]));

  // ⚠️ 段位（rankName）按**累计** XP 判，不是按周 XP。
  // 契约 §4.5 明文「阈值按累计 XP」，而 §4.6 的行里也带 rankName —— 同一含义
  // 必须同一算法，否则同一用户在两个接口里会显示两个段位。
  // （§4.6 的示例 JSON 里 `weekXp:320 → 秀才` 与阈值表对不上，那是手写示意；
  //   以 §4.5 的规范性文字为准。）
  const accMap = await totalXpByUser([...new Set([...ids, userId])]);

  const list: WeekRankItem[] = top.map((t, i) => {
    const u = userMap.get(t.userId);
    return {
      rank: i + 1,
      userId: t.userId,
      nickname: u?.nickname ?? '',
      avatarUrl: u?.avatar_url ?? null,
      weekXp: t.weekXp,
      rankName: rankNameOf(accMap.get(t.userId) ?? 0),
      isMe: t.userId === userId,
    };
  });

  if (me) me.rankName = rankNameOf(accMap.get(userId) ?? 0);

  return { weekStart: start, weekEnd: end, list, me };
}

/** 某人的本周名次；未上榜返回 null（§4.6 `rank-of/:userId`） */
export async function rankOf(userId: number): Promise<WeekRankResult['me']> {
  const r = await weeklyRanking(userId, 0);
  return r.me;
}
