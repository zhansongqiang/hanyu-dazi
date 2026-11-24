/**
 * 学习小组 —— 契约 §4.8
 * 归属：**fe-game**
 *
 * ⚠️ 限制：组员上限 TEAM_MAX_MEMBERS(8)；同一用户只能在一个组（加入前先查 team_members）；
 *    邀请码 6 位、字符集同对战码（utils/code.ts）。队长退出则解散。
 * ⚠️ 组内榜按周 XP 降序 —— 与 §4.6 周榜同一套 weekRange() 口径。
 */
import { Router, Request, Response } from 'express';
import db from '../config/database';
import { authMiddleware, AuthedRequest } from '../middleware/auth';
import { fail, success } from '../utils/response';
import { localNowStr } from '../utils/datetime';
import { genUniqueCode } from '../utils/code';
import { weekRange } from '../utils/week';
import { TEAM_MAX_MEMBERS } from '../constants';

const router = Router();

function handle(fn: (req: AuthedRequest, res: Response) => Promise<unknown>) {
  return async (req: Request, res: Response) => {
    try {
      await fn(req as AuthedRequest, res);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[team] 处理失败:', e);
      if (!res.headersSent) fail(res, (e as Error)?.message || '服务器内部错误', 500);
    }
  };
}

interface TeamRow {
  id: number;
  name: string;
  invite_code: string;
  captain_id: number;
  slogan: string | null;
}

/** 我所在的小组（未加入返回 null）—— GET /teams/mine 与建组/加入的响应共用同一形状 */
async function minePayload(userId: number) {
  const mem = (await db('team_members').where({ user_id: userId }).first()) as { team_id: number } | undefined;
  if (!mem) return null;

  const team = (await db('teams').where({ id: mem.team_id }).first()) as TeamRow | undefined;
  if (!team) return null;

  const members = (await db('team_members as m')
    .join('users as u', 'u.id', 'm.user_id')
    .where('m.team_id', team.id)
    .select('m.user_id', 'u.nickname', 'u.username')) as Array<{
    user_id: number;
    nickname?: string | null;
    username?: string | null;
  }>;
  if (!members.length) return null;

  const range = weekRange();
  const ids = members.map((m) => Number(m.user_id));
  const xpRows = (await db('xp_events')
    .whereIn('user_id', ids)
    .where('created_at', '>=', range.startAt)
    .where('created_at', '<', range.nextStartAt)
    .groupBy('user_id')
    .select('user_id')
    .sum('amount as t')) as Array<{ user_id: number; t?: number | null }>;
  const xpMap = new Map(xpRows.map((r) => [Number(r.user_id), Number(r.t ?? 0)]));

  const list = members
    .map((m) => {
      const uid = Number(m.user_id);
      return {
        userId: uid,
        nickname: (m.nickname || m.username || '同学') as string,
        weekXp: xpMap.get(uid) ?? 0,
        isCaptain: uid === Number(team.captain_id),
        isMe: uid === userId,
      };
    })
    .sort((a, b) => b.weekXp - a.weekXp || a.userId - b.userId);

  return {
    id: team.id,
    name: team.name,
    /**
     * 建组时收的 slogan 必须回传，否则它在库里就是**只写不读**的死字段 ——
     * 用户老老实实填了「每天十道题」，此后任何一页都再也看不到它。
     * ⚠️ 契约 §4.8 的 `GET /teams/mine` 示例 payload 里没有列 slogan
     *    （但 §3 的 `teams` 表确实有这一列），属**新增字段**、不改动任何已有字段名，
     *    已写进最终报告的 CHANGE-REQUEST 供编排者裁定；要回退就删这一行。
     */
    slogan: (team.slogan as string | null) ?? null,
    inviteCode: team.invite_code,
    captainId: team.captain_id,
    memberCount: list.length,
    members: list,
  };
}

/** 建组。发起人自动入组并成为队长 */
router.post(
  '/teams',
  authMiddleware,
  handle(async (req, res) => {
    const userId = req.userId as number;

    const name = String(req.body?.name ?? '').trim().slice(0, 40);
    if (!name) return fail(res, '小组名必填');
    const slogan = String(req.body?.slogan ?? '').trim().slice(0, 100) || null;

    // 一人一组：已在组里就报错（不是静默换组，否则原来那个组的成员会突然少一人）
    const existing = await db('team_members').where({ user_id: userId }).first();
    if (existing) return fail(res, '你已经在一个小组里了，先退出再加入');

    const inviteCode = await genUniqueCode(async (c) => {
      const row = await db('teams').where({ invite_code: c }).first();
      return !!row;
    });

    const inserted = (await db('teams').insert({
      name,
      invite_code: inviteCode,
      captain_id: userId,
      slogan,
      created_at: localNowStr(),
    })) as number[];
    const teamId = Number(Array.isArray(inserted) ? inserted[0] : inserted);

    await db('team_members').insert({
      team_id: teamId,
      user_id: userId,
      joined_at: localNowStr(),
    });

    return success(res, await minePayload(userId));
  })
);

/** 用邀请码加入。码统一大写比对（前端可能传小写） */
router.post(
  '/teams/join',
  authMiddleware,
  handle(async (req, res) => {
    const userId = req.userId as number;

    const code = String(req.body?.inviteCode ?? '').trim().toUpperCase();
    if (!code) return fail(res, '邀请码必填');

    const team = (await db('teams').where({ invite_code: code }).first()) as TeamRow | undefined;
    if (!team) return fail(res, '邀请码无效', 404);

    const existing = await db('team_members').where({ user_id: userId }).first();
    if (existing) {
      if (Number((existing as { team_id: number }).team_id) === Number(team.id)) return fail(res, '你已经在这个小组里了');
      return fail(res, '你已经在一个小组里了，先退出再加入');
    }

    const countRow = (await db('team_members').where({ team_id: team.id }).count({ c: '*' }).first()) as
      | { c?: number }
      | undefined;
    if (Number(countRow?.c ?? 0) >= TEAM_MAX_MEMBERS) {
      return fail(res, `小组已满（上限 ${TEAM_MAX_MEMBERS} 人）`);
    }

    await db('team_members').insert({
      team_id: team.id,
      user_id: userId,
      joined_at: localNowStr(),
    });

    return success(res, await minePayload(userId));
  })
);

router.get(
  '/teams/mine',
  authMiddleware,
  handle(async (req, res) => {
    const userId = req.userId as number;
    return success(res, await minePayload(userId));
  })
);

/** 退出。队长退出 = 解散（成员一起散），否则只删自己那条 */
router.delete(
  '/teams/mine/leave',
  authMiddleware,
  handle(async (req, res) => {
    const userId = req.userId as number;

    const mem = (await db('team_members').where({ user_id: userId }).first()) as { team_id: number } | undefined;
    if (!mem) return fail(res, '你还没有加入任何小组');

    const team = (await db('teams').where({ id: mem.team_id }).first()) as TeamRow | undefined;
    if (!team) {
      await db('team_members').where({ user_id: userId }).del();
      return success(res, { left: true, disbanded: false });
    }

    const isCaptain = Number(team.captain_id) === userId;
    if (isCaptain) {
      await db('team_members').where({ team_id: team.id }).del();
      await db('teams').where({ id: team.id }).del();
    } else {
      await db('team_members').where({ team_id: team.id, user_id: userId }).del();
    }

    return success(res, { left: true, disbanded: isCaptain });
  })
);

export default router;
