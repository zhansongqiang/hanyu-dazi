/**
 * 答题与课时结算 —— 契约 §4.2
 * 归属：**be-api**
 *
 * ⚠️ 两条铁律（§4.2）：
 *   1. POST /attempts **必须后端复判**，不信前端传来的 isCorrect。
 *   2. lesson_id 从 item 查出来，**不信请求体里的 lessonId**。
 *
 * 这两条都由 `services/attempt.ts` 的 `judgeAndPersist()` 落地 —— 本文件只做
 * 「解析参数 → 调 service → 拼响应」，判题逻辑一行都不在这里。
 * 这样 §4.3 的 `POST /wrongbook/practice` 能复用同一个函数（契约明文要求）。
 */
import { Router, Request, Response } from 'express';
import db from '../config/database';
import { authMiddleware, AuthedRequest } from '../middleware/auth';
import { LESSON_DONE_RATIO, XP_PER_LESSON } from '../constants';
import { fail, success } from '../utils/response';
import { localNowStr } from '../utils/datetime';
import { JudgeError, judgeAndPersist } from '../services/attempt';
import { touch as touchCheckin } from '../services/checkin';
import { grantXp } from '../services/xp';
import { evaluate as evaluateStamps } from '../services/stamps';

const router = Router();

function posInt(raw: unknown): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/* =========================== POST /attempts =========================== */

/**
 * 答一道题。响应字段**逐字**照 §4.2：
 * `{ isCorrect, answer, xpEarned, hint, wrongTimes, badge }`
 */
router.post('/attempts', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthedRequest).userId!;
    const { itemId, userAnswer, durationMs } = req.body ?? {};

    // itemId 合法性交给 service 统一判（它抛 JudgeError → 转 fail）
    const r = await judgeAndPersist({ userId, itemId, userAnswer, durationMs });

    return success(res, {
      isCorrect: r.isCorrect,
      answer: r.answer,
      xpEarned: r.xpEarned,
      hint: r.hint,
      wrongTimes: r.wrongTimes,
      badge: r.badge, // {code,name} | null
    });
  } catch (e) {
    if (e instanceof JudgeError) return fail(res, e.message, e.httpStatus);
    return fail(res, (e as Error).message, 500);
  }
});

/* ====================== POST /lessons/:id/finish ====================== */

/**
 * 课时结算。响应字段**逐字**照 §4.2：
 * `{ lessonId, status, bestScore, bestTotal, firstDone, xpEarned,
 *    checkin:{created,currentStreak,xpEarned}, nextLessonId, unitDone }`
 *
 * 三处刻意的设计，都写在注释里免得后来人"顺手优化"掉：
 *  - `best_score` **只在比例变好时**才写（§4.2 明文）。比较用比例不用绝对分：
 *    8/10 比 6/6 低，只比绝对分会把「做满 6 题的满堂彩」判成最好成绩。
 *  - `xpEarned` **只含课时奖励**，打卡 XP 走 `checkin.xpEarned` 单独报。
 *    这样前端能在结算页分两行显示「课时 +20 / 打卡 +5」，同时天然避免
 *    "反复提交 finish 刷 XP" —— 课时奖励只在 `firstDone` 那一次发。
 *  - `status` 判 done 用 `correctCount / total >= LESSON_DONE_RATIO`（0.6），
 *    阈值来自 constants，**不要在这里写 0.6**。
 */
router.post('/lessons/:id/finish', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthedRequest).userId!;
    const lessonId = posInt(req.params.id);
    if (!lessonId) return fail(res, '课时 id 不合法');

    const lesson: any = await db('lessons').where({ id: lessonId }).first();
    if (!lesson) return fail(res, '课时不存在', 404);

    // ---- 入参清洗 ----
    // total 必须为正 —— 分母为 0 的话比例无意义，直接拒掉而不是算出 Infinity
    const total = Math.trunc(Number(req.body?.total));
    if (!Number.isFinite(total) || total <= 0) return fail(res, 'total 必须是正整数');
    let correctCount = Math.trunc(Number(req.body?.correctCount));
    if (!Number.isFinite(correctCount) || correctCount < 0) return fail(res, 'correctCount 不合法');
    // 前端偶尔会把 correctCount 传成比 total 大（重复计数），夹一下防止比例 > 1
    if (correctCount > total) correctCount = total;

    const now = localNowStr();
    const prev: any = await db('lesson_progress')
      .where({ user_id: userId, lesson_id: lessonId })
      .first();

    const wasDone = prev?.status === 'done';
    const done = correctCount / total >= LESSON_DONE_RATIO;
    // ⚠️ 返回给前端的 status 必须是**落库后**的状态，不是"本次成绩算出来的状态"。
    // 差别在重练时暴露：第一次 8/10 判 done，第二次手滑 2/10 —— 若返回本次算出的
    // 'in_progress'，前端会把学生刚做完的课又画成未完成（进度环回退）。
    // 「做过就是做过」，所以和落库一样：一旦 done 就不回退。
    const status = done || wasDone ? 'done' : 'in_progress';

    // ---- best_score：只在「比例」变好时更新 ----
    const bestScore = Number(prev?.best_score ?? 0);
    const bestTotal: number | null =
      prev?.best_total === null || prev?.best_total === undefined ? null : Number(prev.best_total);
    // 跨乘法比较：correctCount/total > bestScore/bestTotal  ⟺  correctCount*bestTotal > bestScore*total
    const better =
      bestTotal === null || bestTotal <= 0 || correctCount * bestTotal > bestScore * total;
    const nextBestScore = better ? correctCount : bestScore;
    const nextBestTotal = better ? total : bestTotal;

    if (prev) {
      await db('lesson_progress').where({ id: prev.id }).update({
        status: done ? 'done' : prev.status, // 已经 done 的不回退（做过就是做过）
        best_score: nextBestScore,
        best_total: nextBestTotal,
        completed_at: done && !prev.completed_at ? now : prev.completed_at,
        updated_at: now,
      });
    } else {
      await db('lesson_progress').insert({
        user_id: userId,
        lesson_id: lessonId,
        status,
        best_score: nextBestScore,
        best_total: nextBestTotal,
        attempts_count: 0, // 作答次数由 /attempts 记，这里不重复计
        last_item_id: null,
        completed_at: done ? now : null,
        created_at: now,
        updated_at: now,
      });
    }

    // ---- 首次完成才发课时奖励（防刷） ----
    const firstDone = done && !wasDone;
    const xpEarned = firstDone
      ? await grantXp({
          userId,
          amount: XP_PER_LESSON,
          reason: 'lesson_done',
          refType: 'lesson',
          refId: lessonId,
          note: `完成课时「${lesson.title}」`,
        })
      : 0;

    // ---- 打卡（幂等，一天只发一次 XP） ----
    const ci = await touchCheckin(userId, lessonId);

    // ---- 单元是否全部完成 ----
    const unitLessonIds = (await db('lessons').where({ unit_id: lesson.unit_id }).pluck('id')) as number[];
    const doneRow: any = unitLessonIds.length
      ? await db('lesson_progress')
          .where({ user_id: userId, status: 'done' })
          .whereIn('lesson_id', unitLessonIds)
          .count({ c: '*' })
          .first()
      : { c: 0 };
    const unitDone = unitLessonIds.length > 0 && Number(doneRow?.c ?? 0) >= unitLessonIds.length;

    // ---- 下一课：同单元、按 (sort, id) 排序后紧挨着的那一课 ----
    // 用一个单元内的完整有序列表取"下一个"，而不是拼 sort > x OR (sort = x AND id > y)：
    // 单元只有几课，内存里找下标既省事又不会在 sort 重复时挑错人。
    const unitLessons = (await db('lessons')
      .where({ unit_id: lesson.unit_id })
      .orderBy('sort', 'asc')
      .orderBy('id', 'asc')
      .select('id')) as any[];
    const curIdx = unitLessons.findIndex((l) => Number(l.id) === lessonId);
    const next = curIdx >= 0 && curIdx + 1 < unitLessons.length ? unitLessons[curIdx + 1] : null;

    // ---- 结算印章（副作用；本接口不把结果报给前端） ----
    await evaluateStamps(userId);

    return success(res, {
      lessonId,
      status,
      bestScore: nextBestScore,
      bestTotal: nextBestTotal,
      firstDone,
      xpEarned,
      checkin: {
        created: ci.created,
        currentStreak: ci.currentStreak,
        xpEarned: ci.xpEarned,
      },
      nextLessonId: next ? Number(next.id) : null,
      unitDone,
    });
  } catch (e) {
    return fail(res, (e as Error).message, 500);
  }
});

export default router;