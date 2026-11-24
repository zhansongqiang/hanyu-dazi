/**
 * 内容浏览 + 用户公开资料 + 举报 —— 契约 §4.1 §4.9
 * 归属：**be-api**
 *
 * 全部路径都是 `/api` 之后的完整路径（见 routes/index.ts 的挂载说明）。
 *
 * 三点约定：
 *  - 一律 camelCase；库里是 snake_case，逐字段显式映射，**不写 `...row`**
 *    （`...row` 会把 password_hash、status 这类内部列一起漏出去）
 *  - 时间戳写入一律 `localNowStr()`
 *  - 每个 handler 自己 try/catch，异常转 `fail(res, msg, 500)` —— 与 auth.ts 同风格
 */
import { Router, Request, Response } from 'express';
import db from '../config/database';
import { authMiddleware, AuthedRequest } from '../middleware/auth';
import { rankNameOf } from '../constants';
import { fail, success } from '../utils/response';
import { itemsOfLesson, itemCountByLesson, toItemDto } from '../services/item';
import { totalXp } from '../services/xp';
import { localNowStr } from '../utils/datetime';

const router = Router();

/** 路径参数里的 id：必须是正整数，否则 400（别让它带着 NaN 去查库） */
function posInt(raw: unknown): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/* ============================ §4.1 内容浏览 ============================ */

/**
 * GET /units —— 单元列表，带进度聚合
 * 返回**数组**（不是分页对象），见 §4.1
 */
router.get('/units', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthedRequest).userId!;

    const units = await db('units').orderBy('sort', 'asc').orderBy('id', 'asc');
    // 一次把「课时 → 所属单元」和「我做完的课时」都取回来，在内存里聚合，
    // 避免每个单元两条查询（N+1）。数据量是 3 单元 / 10 课时，内存聚合完全够。
    const lessons = (await db('lessons').select('id', 'unit_id')) as any[];
    const counts = await itemCountByLesson();
    const doneRows = (await db('lesson_progress')
      .where({ user_id: userId, status: 'done' })
      .pluck('lesson_id')) as number[];
    const doneSet = new Set(doneRows.map(Number));

    const byUnit = new Map<number, any[]>();
    for (const l of lessons) {
      const k = Number(l.unit_id);
      if (!byUnit.has(k)) byUnit.set(k, []);
      byUnit.get(k)!.push(l);
    }

    const data = (units as any[]).map((u) => {
      const ls = byUnit.get(Number(u.id)) ?? [];
      const lessonCount = ls.length;
      const doneCount = ls.filter((l) => doneSet.has(Number(l.id))).length;
      const itemCount = ls.reduce((s, l) => s + (counts.get(Number(l.id)) ?? 0), 0);
      return {
        id: Number(u.id),
        key: u.key ?? null,
        level: u.level,
        type: u.type,
        title: u.title,
        titleEn: u.title_en ?? null,
        intro: u.intro ?? null,
        sort: Number(u.sort ?? 0),
        lessonCount,
        doneCount,
        itemCount,
        // 无课时时为 0（不要 NaN —— 0/0 会 JSON 成 null）
        progress: lessonCount ? Number((doneCount / lessonCount).toFixed(2)) : 0,
      };
    });

    return success(res, data);
  } catch (e) {
    return fail(res, (e as Error).message, 500);
  }
});

/** GET /units/:id/lessons —— 某单元的课时列表，带「当前用户」的进度 */
router.get('/units/:id/lessons', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthedRequest).userId!;
    const unitId = posInt(req.params.id);
    if (!unitId) return fail(res, '单元 id 不合法');

    const unit: any = await db('units').where({ id: unitId }).first();
    if (!unit) return fail(res, '单元不存在', 404);

    const lessons = await db('lessons')
      .where({ unit_id: unitId })
      .orderBy('sort', 'asc')
      .orderBy('id', 'asc');
    const counts = await itemCountByLesson();

    // 该用户在这个单元下的全部进度行
    const lessonIds = (lessons as any[]).map((l) => Number(l.id));
    const progRows = lessonIds.length
      ? ((await db('lesson_progress')
          .where({ user_id: userId })
          .whereIn('lesson_id', lessonIds)) as any[])
      : [];
    const progMap = new Map(progRows.map((p) => [Number(p.lesson_id), p]));

    const data = (lessons as any[]).map((l) => {
      const p = progMap.get(Number(l.id));
      return {
        id: Number(l.id),
        key: l.key ?? null,
        title: l.title,
        titleEn: l.title_en ?? null,
        intro: l.intro ?? null,
        estMinutes: Number(l.est_minutes ?? 0),
        sort: Number(l.sort ?? 0),
        itemCount: counts.get(Number(l.id)) ?? 0,
        // 未开始为 "none"（§4.1 明文）
        status: p?.status ?? 'none',
        bestScore: Number(p?.best_score ?? 0),
        bestTotal: p?.best_total === null || p?.best_total === undefined ? null : Number(p.best_total),
      };
    });

    return success(res, data);
  } catch (e) {
    return fail(res, (e as Error).message, 500);
  }
});

/** GET /lessons/:id —— 课时详情 + 题目 */
router.get('/lessons/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthedRequest).userId!;
    const lessonId = posInt(req.params.id);
    if (!lessonId) return fail(res, '课时 id 不合法');

    const lesson: any = await db('lessons').where({ id: lessonId }).first();
    if (!lesson) return fail(res, '课时不存在', 404);

    const unit: any = await db('units').where({ id: lesson.unit_id }).first();
    const prog: any = await db('lesson_progress')
      .where({ user_id: userId, lesson_id: lessonId })
      .first();
    const items = await itemsOfLesson(lessonId);

    return success(res, {
      id: Number(lesson.id),
      key: lesson.key ?? null,
      title: lesson.title,
      titleEn: lesson.title_en ?? null,
      intro: lesson.intro ?? null,
      estMinutes: Number(lesson.est_minutes ?? 0),
      sort: Number(lesson.sort ?? 0),
      unit: unit
        ? {
            id: Number(unit.id),
            key: unit.key ?? null,
            title: unit.title,
            level: unit.level,
            type: unit.type,
          }
        : null,
      progress: {
        status: prog?.status ?? 'none',
        bestScore: Number(prog?.best_score ?? 0),
        bestTotal: prog?.best_total === null || prog?.best_total === undefined ? null : Number(prog.best_total),
        attemptsCount: Number(prog?.attempts_count ?? 0),
      },
      items,
    });
  } catch (e) {
    return fail(res, (e as Error).message, 500);
  }
});

/** GET /lessons/:id/items —— 只取题目（重练、PK 复用）。返回数组本身 */
router.get('/lessons/:id/items', authMiddleware, async (req: Request, res: Response) => {
  try {
    const lessonId = posInt(req.params.id);
    if (!lessonId) return fail(res, '课时 id 不合法');

    const lesson = await db('lessons').where({ id: lessonId }).first();
    if (!lesson) return fail(res, '课时不存在', 404);

    return success(res, await itemsOfLesson(lessonId));
  } catch (e) {
    return fail(res, (e as Error).message, 500);
  }
});

/* ====================== §4.9 用户公开资料 + 举报 ====================== */

/**
 * GET /users/:id —— 用户公开资料
 * ⚠️ **不返回** password_hash、status、任何 token（§4.9 明文）。
 *    所以这里逐字段手写，绝不 `...user`。
 */
router.get('/users/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const id = posInt(req.params.id);
    if (!id) return fail(res, '用户 id 不合法');

    const u: any = await db('users').where({ id }).first();
    if (!u) return fail(res, '用户不存在', 404);

    const xp = await totalXp(id);
    const lessonDoneRow: any = await db('lesson_progress')
      .where({ user_id: id, status: 'done' })
      .count({ c: '*' })
      .first();
    const stampsRow: any = await db('user_achievements')
      .where({ user_id: id })
      .count({ c: '*' })
      .first();

    return success(res, {
      id: Number(u.id),
      username: u.username,
      nickname: u.nickname,
      avatarUrl: u.avatar_url ?? null,
      createdAt: u.created_at ?? null,
      rankName: rankNameOf(xp),
      xpTotal: xp,
      lessonDone: Number(lessonDoneRow?.c ?? 0),
      stampsEarned: Number(stampsRow?.c ?? 0),
    });
  } catch (e) {
    return fail(res, (e as Error).message, 500);
  }
});

const REPORT_TARGET_TYPES = new Set(['user', 'duel']);

/** POST /reports —— 举报。reason 必填 ≤30 字，detail ≤200 字（§4.9） */
router.post('/reports', authMiddleware, async (req: Request, res: Response) => {
  try {
    const reporterId = (req as AuthedRequest).userId!;
    const { targetType, targetId, reason, detail } = req.body ?? {};

    if (!REPORT_TARGET_TYPES.has(String(targetType))) {
      return fail(res, 'targetType 必须是 user 或 duel');
    }
    const tid = posInt(targetId);
    if (!tid) return fail(res, 'targetId 不合法');

    const r = String(reason ?? '').trim();
    if (!r) return fail(res, 'reason 必填');
    if (r.length > 30) return fail(res, 'reason 不能超过 30 字');

    const d = detail === null || detail === undefined ? null : String(detail).trim();
    if (d && d.length > 200) return fail(res, 'detail 不能超过 200 字');

    const ids = (await db('reports').insert({
      reporter_id: reporterId,
      target_type: String(targetType),
      target_id: tid,
      reason: r,
      detail: d || null,
      status: 'open',
      created_at: localNowStr(),
    })) as unknown as number[];

    return success(res, { id: Number(ids?.[0] ?? 0) });
  } catch (e) {
    return fail(res, (e as Error).message, 500);
  }
});

/* 导出给别处复用（wrongbook.ts 拼错题条目时要同一套 DTO 映射） */
export { toItemDto };

export default router;