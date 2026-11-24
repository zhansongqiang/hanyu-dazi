/**
 * XP 流水 / 排行 / 印章 —— 契约 §4.6 §4.7
 * 归属：**fe-game**
 *
 * ⚠️ 周榜：周起点是**周一**，用 utils/week.ts 的 weekRange()；
 *    周 XP 从 xp_events.created_at 求和，**不要**用 user_streaks 或任何缓存列。
 * ⚠️ 段位用 constants 的 rankNameOf()，不要自己写阈值。
 * ⚠️ 发章规则只在 services/stamps.ts 实现一处（被 attempts 与 finish 内部调用）。
 * ⚠️ 路由顺序：/rank/rank-of/:userId 是静态前缀段，若日后新增 /rank/week 之类的固定段，
 *    必须排在参数段之前，否则会被 :xxx 抢走。
 *
 * 本文件**只做 I/O 编排**：分页、取参、把结果塞进 §4 规定的形状。
 * 排行与印章的判定全在 services/（be-api 独占目录，契约 §5）——
 * §4.5 的 `/profile/summary` 也要同一份周榜与印章计数，两边各写一份必然分叉。
 */
import { Router, Request, Response } from 'express';
import db from '../config/database';
import { authMiddleware, AuthedRequest } from '../middleware/auth';
import { fail, paginate, success } from '../utils/response';
import { rankLevelOf, rankNameOf } from '../constants';
import { weeklyRanking, rankOf } from '../services/rank';
import { counts as stampCounts, evaluate as evaluateStamps, list as listStamps } from '../services/stamps';
import { totalXpByUser } from '../services/xp';

const router = Router();

/** 包一层 try/catch：Express 4 不会接住 async handler 抛出的错，不包就是静默 unhandledRejection */
function handle(fn: (req: AuthedRequest, res: Response) => Promise<unknown>) {
  return async (req: Request, res: Response) => {
    try {
      await fn(req as AuthedRequest, res);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[xp] 处理失败:', e);
      if (!res.headersSent) fail(res, (e as Error)?.message || '服务器内部错误', 500);
    }
  };
}

function num(v: unknown, def: number): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : def;
}

function displayName(u: { nickname?: string | null; username?: string | null } | undefined): string {
  return (u?.nickname || u?.username || '同学') as string;
}

// ===== §4.6 XP 流水 =====
router.get(
  '/xp/ledger',
  authMiddleware,
  handle(async (req, res) => {
    const userId = req.userId as number;
    const page = Math.max(1, Math.floor(num(req.query.page, 1)));
    const pageSize = Math.min(100, Math.max(1, Math.floor(num(req.query.pageSize, 20))));

    const base = db('xp_events').where({ user_id: userId });
    const countRow = (await base.clone().count({ c: '*' }).first()) as { c?: number } | undefined;
    const total = Number(countRow?.c ?? 0);

    const rows = (await base
      .clone()
      .orderBy('id', 'desc')
      .limit(pageSize)
      .offset((page - 1) * pageSize)) as Array<Record<string, unknown>>;

    const list = rows.map((r) => ({
      id: r.id,
      amount: r.amount,
      reason: r.reason,
      refType: r.ref_type ?? null,
      refId: r.ref_id ?? null,
      note: r.note ?? null,
      createdAt: r.created_at ?? null,
    }));

    return paginate(res, list, total, page, pageSize);
  })
);

// ===== §4.6 周榜 =====
router.get(
  '/rank/week',
  authMiddleware,
  handle(async (req, res) => {
    const userId = req.userId as number;
    const limit = Math.min(200, Math.floor(num(req.query.limit, 50)));
    return success(res, await weeklyRanking(userId, limit));
  })
);

// ===== §4.6 某人的名次（默认自己）=====
router.get(
  '/rank/rank-of/:userId',
  authMiddleware,
  handle(async (req, res) => {
    const meId = req.userId as number;
    const targetId = Number(req.params.userId);
    const userId = Number.isFinite(targetId) && targetId > 0 ? targetId : meId;

    const user = (await db('users').where({ id: userId }).first()) as
      | { id: number; nickname?: string | null; username?: string | null }
      | undefined;
    if (!user) return fail(res, '用户不存在', 404);

    // rankOf 未上榜时返回 null；此时仍要把段位（按累计 XP）给出来，
    // 不然前端"我的名次"卡片会既没名次也没段位，只剩空白。
    const me = await rankOf(userId);
    const acc = await totalXpByUser([userId]);
    const totalXp = acc.get(userId) ?? 0;

    return success(res, {
      userId,
      nickname: displayName(user),
      rank: me?.rank ?? null,
      weekXp: me?.weekXp ?? 0,
      rankName: me?.rankName || rankNameOf(totalXp),
      rankLevel: rankLevelOf(totalXp),
    });
  })
);

// ===== §4.7 印章清单（未得的也要返回，前端画灰态）=====
router.get(
  '/stamps',
  authMiddleware,
  handle(async (req, res) => {
    const userId = req.userId as number;
    return success(res, await listStamps(userId));
  })
);

// ===== §4.7 主动结算 =====
router.post(
  '/stamps/check',
  authMiddleware,
  handle(async (req, res) => {
    const userId = req.userId as number;

    const unlocked = await evaluateStamps(userId);
    const c = await stampCounts(userId);

    return success(res, { unlocked, total: c.total, earned: c.earned });
  })
);

export default router;
