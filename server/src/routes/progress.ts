/**
 * 「我的」页汇总 + 学习日历 —— 契约 §4.5
 * 归属：**be-api**
 *
 * ⚠️ GET /profile/summary 是**一个**接口拿全所有数字，不要拆成 N 个请求（§8 fe-game 验收项）。
 * ⚠️ 段位名/等级一律调 constants 里的 rankNameOf / rankLevelOf，不要自己写阈值。
 *
 * 数字的来源必须分散在各 service 里（XP 在 services/xp、连击在 services/checkin、
 * 周名次在 services/rank、印章在 services/stamps）—— 本文件只负责把它们**拼成一个
 * 扁平对象**。任何一处自己重算一遍，都会让「我的页」和对应详情页显示不同数字。
 */
import { Router, Request, Response } from 'express';
import db from '../config/database';
import { authMiddleware, AuthedRequest } from '../middleware/auth';
import { rankLevelOf, rankNameOf } from '../constants';
import { addDays, todayLocal } from '../utils/datetime';
import { fail, success } from '../utils/response';
import { xpBuckets } from '../services/xp';
import { rankOf } from '../services/rank';
import { getStatus as checkinStatus } from '../services/checkin';
import { counts as stampCounts } from '../services/stamps';

const router = Router();

/** GET /profile/summary —— 「我的」页所有数字一次拿全（§4.5） */
router.get('/profile/summary', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthedRequest).userId!;

    const user: any = await db('users').where({ id: userId }).first();
    if (!user) return fail(res, '用户不存在', 404);

    // 这几个互相独立，并行发出去（better-sqlite3 是同步驱动，实际是顺序执行，
    // 但 Promise.all 让「谁先谁后」不影响结果，代码也更短）
    const [xp, weekMe, ci, stamps, lessonsTotalRow, lessonsDoneRow, itemsRow, attemptsRow] =
      await Promise.all([
        xpBuckets(userId),
        rankOf(userId),
        checkinStatus(userId),
        stampCounts(userId),
        db('lessons').count({ c: '*' }).first() as any,
        db('lesson_progress').where({ user_id: userId, status: 'done' }).count({ c: '*' }).first() as any,
        // itemsDone = 做过的**不同**题目数（同一题练十遍仍算 1 题，这才反映"学了多少内容"）
        db('attempts').where({ user_id: userId }).countDistinct({ c: 'item_id' }).first() as any,
        // accuracy = 答对次数 / 总作答次数（§4.5 明文），无作答为 0
        db('attempts')
          .where({ user_id: userId })
          .select(
            db.raw('COUNT(*) AS total'),
            db.raw('COALESCE(SUM(CASE WHEN is_correct = 1 THEN 1 ELSE 0 END), 0) AS correct'),
          )
          .first() as any,
      ]);

    const totalAttempts = Number((attemptsRow as any)?.total ?? 0);
    const correctAttempts = Number((attemptsRow as any)?.correct ?? 0);
    const accuracy = totalAttempts > 0 ? Number((correctAttempts / totalAttempts).toFixed(2)) : 0;

    return success(res, {
      user: {
        id: Number(user.id),
        username: user.username,
        nickname: user.nickname,
        avatarUrl: user.avatar_url ?? null,
      },
      xp,
      streak: {
        current: ci.currentStreak,
        max: ci.maxStreak,
        lastCheckinDate: ci.lastCheckinDate,
      },
      rank: {
        // 段位按**累计** XP（§4.5 规范性文字）；weekRank 未上榜为 null
        rankName: rankNameOf(xp.total),
        level: rankLevelOf(xp.total),
        weekRank: weekMe?.rank ?? null,
        weekXp: xp.week,
      },
      stamps,
      learn: {
        lessonsDone: Number((lessonsDoneRow as any)?.c ?? 0),
        lessonsTotal: Number((lessonsTotalRow as any)?.c ?? 0),
        itemsDone: Number((itemsRow as any)?.c ?? 0),
        accuracy,
      },
      todayCheckedIn: ci.checkedIn,
    });
  } catch (e) {
    return fail(res, (e as Error).message, 500);
  }
});

/**
 * GET /profile/calendar?days=30 → `{ days: [...], checked: [...] }`（§4.5）
 *
 * `days` 是**连续的自然日**，升序，最后一天是今天（前端按这个数组画格子，
 * 所以必须补齐没打卡的日子 —— 只返回打卡日的话日历会塌成一行）。
 * `checked` 是 `days` 的子集，只含真打过卡的日子。
 */
router.get('/profile/calendar', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthedRequest).userId!;

    const rawDays = Number(req.query.days);
    const days = Number.isFinite(rawDays) && rawDays > 0 ? Math.min(Math.trunc(rawDays), 365) : 30;

    const today = todayLocal();
    const from = addDays(today, -(days - 1));

    // 用连续数组而不是 SQL 生成日期序列：跨月跨年由 addDays 处理，SQLite 里手写递归 CTE 反而更易错
    const allDays: string[] = [];
    for (let i = 0; i < days; i += 1) allDays.push(addDays(from, i));

    // check_date 是 'YYYY-MM-DD'，定宽字符串，字典序 == 时间序，直接范围比较（含两端）
    const rows = (await db('checkins')
      .where('user_id', userId)
      .andWhere('check_date', '>=', from)
      .andWhere('check_date', '<=', today)
      .distinct('check_date')
      .pluck('check_date')) as string[];
    const checkedSet = new Set(rows.map(String));

    return success(res, {
      days: allDays,
      checked: allDays.filter((d) => checkedSet.has(d)),
    });
  } catch (e) {
    return fail(res, (e as Error).message, 500);
  }
});

export default router;