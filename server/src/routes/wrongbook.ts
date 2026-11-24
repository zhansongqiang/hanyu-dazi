/**
 * 错题本 —— 契约 §4.3
 * 归属：**be-api**
 *
 * ⚠️ wrong_book 是**视图**，不含 items 的列，必须 JOIN items 取题干/选项/答案。
 * ⚠️ 已掌握的题**仍留在视图里**（视图不过滤 correct_since）：
 *    "还欠着的" = WHERE correct_since < WRONG_MASTERED_AT，**在接口层过滤，不要改视图**。
 *    视图是「错过的题」的单一真源，改视图会影响别处对它的理解；欠不欠是业务判断。
 * ⚠️ POST /wrongbook/practice 必须复用 POST /attempts 的复判+落库 service 函数，不要复制代码。
 */
import { Router, Request, Response } from 'express';
import db from '../config/database';
import { authMiddleware, AuthedRequest } from '../middleware/auth';
import { WRONG_MASTERED_AT } from '../constants';
import { fail, success } from '../utils/response';
import { JudgeError, judgeAndPersist } from '../services/attempt';
import { evaluate as evaluateStamps } from '../services/stamps';
import { hasHintColumn, parseOptions } from '../services/item';

const router = Router();

/** 未掌握的错题条数：视图 ∪ items 的过滤条件写在**一处**，list 与 remaining 共用 */
function owedQuery(userId: number) {
  return db('wrong_book as wb')
    .join('items as i', 'i.id', 'wb.item_id')
    .where('wb.user_id', userId)
    .andWhere('wb.correct_since', '<', WRONG_MASTERED_AT);
}

/** 还没掌握的错题数（practice 结束后回报 remaining） */
async function owedCount(userId: number): Promise<number> {
  const row: any = await owedQuery(userId).count({ c: '*' }).first();
  return Number(row?.c ?? 0);
}

/**
 * GET /wrongbook?limit=20&lessonId=
 * 返回**对象**（不是数组）：`{ list, total, byLesson }`（§4.3）
 *
 * `total` 与 `byLesson` 都针对**过滤后的全集**算，`list` 才受 limit 截断 ——
 * 否则「共 37 道待复习」会显示成 20，筛选标签上的计数也会跟着 limit 缩水。
 */
router.get('/wrongbook', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthedRequest).userId!;

    const rawLimit = Number(req.query.limit);
    const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(Math.trunc(rawLimit), 100) : 20;

    const lessonId = Number(req.query.lessonId);
    const filterLesson = Number.isInteger(lessonId) && lessonId > 0 ? lessonId : null;

    const wantHint = await hasHintColumn();

    const cols = [
      'wb.item_id',
      'wb.wrong_times',
      'wb.correct_since',
      'wb.last_wrong_at',
      'i.prompt',
      'i.prompt_en',
      'i.kind',
      'i.options',
      'i.answer',
      'i.audio_url',
      'i.char',
      'i.lesson_id',
      'l.title as lesson_title',
      'u.title as unit_title',
    ];
    if (wantHint) cols.push('i.hint');

    const q = owedQuery(userId)
      .join('lessons as l', 'l.id', 'i.lesson_id')
      .join('units as u', 'u.id', 'l.unit_id')
      // 排序照 §4.3：最欠练的（correct_since 小）在前，同档错得多的在前，最后按最近错的时间倒序
      .orderBy('wb.correct_since', 'asc')
      .orderBy('wb.wrong_times', 'desc')
      .orderBy('wb.last_wrong_at', 'desc')
      .select(cols);

    if (filterLesson) q.andWhere('i.lesson_id', filterLesson);

    const rows = (await q) as any[];

    // byLesson：按课时汇总（用全集算，不受 limit 影响）。顺序沿用 rows 的顺序 ——
    // 首次出现的顺序 = 最欠练的课时排在最前，正是前端标签想强调的。
    const byLessonMap = new Map<number, { lessonId: number; lessonTitle: string; count: number }>();
    for (const r of rows) {
      const lid = Number(r.lesson_id);
      const cur = byLessonMap.get(lid);
      if (cur) cur.count += 1;
      else byLessonMap.set(lid, { lessonId: lid, lessonTitle: r.lesson_title ?? '', count: 1 });
    }

    const list = rows.slice(0, limit).map((r) => ({
      itemId: Number(r.item_id),
      wrongTimes: Number(r.wrong_times ?? 0),
      correctSince: Number(r.correct_since ?? 0),
      lastWrongAt: r.last_wrong_at ?? null,
      prompt: r.prompt,
      promptEn: r.prompt_en ?? null,
      kind: r.kind,
      options: parseOptions(r.options),
      answer: r.answer,
      audioUrl: r.audio_url ?? null,
      char: r.char ?? null,
      lessonId: Number(r.lesson_id),
      lessonTitle: r.lesson_title ?? null,
      unitTitle: r.unit_title ?? null,
      hint: wantHint ? (r.hint ?? null) : null,
    }));

    return success(res, {
      list,
      total: rows.length,
      byLesson: [...byLessonMap.values()],
    });
  } catch (e) {
    return fail(res, (e as Error).message, 500);
  }
});

/**
 * POST /wrongbook/practice —— 错题重练批量提交
 * 请求 `{results:[{itemId,userAnswer,durationMs}]}`
 * 响应 `{results:[{itemId,isCorrect,answer,wrongTimes,correctSince}], cleared, remaining}`
 *
 * 落库**完全复用** `judgeAndPersist()`（§4.3 明文「复用同一个 service 函数」）——
 * 所以重练同样会计 XP、同样进 attempts、同样推进 lesson_progress。
 * 差别只有两点：批量时不逐题结算印章（`withStamp:false`，末尾结算一次），
 * 以及响应里额外回报 `cleared` / `remaining` 给前端画「本次清掉几道」。
 */
router.post('/wrongbook/practice', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthedRequest).userId!;
    const input = req.body?.results;

    if (!Array.isArray(input)) return fail(res, 'results 必须是数组');
    if (input.length === 0) return fail(res, 'results 不能为空');
    if (input.length > 100) return fail(res, '一次最多提交 100 题');

    const out: Array<{
      itemId: number;
      isCorrect: boolean;
      answer: string;
      wrongTimes: number;
      correctSince: number;
    }> = [];
    let cleared = 0;

    for (const one of input) {
      try {
        const r = await judgeAndPersist({
          userId,
          itemId: one?.itemId,
          userAnswer: one?.userAnswer,
          durationMs: one?.durationMs,
          withStamp: false,
        });
        // 「本次清掉」= 这道题的 correct_since 已达到掌握线
        if (r.correctSince >= WRONG_MASTERED_AT) cleared += 1;
        out.push({
          itemId: r.itemId,
          isCorrect: r.isCorrect,
          answer: r.answer,
          wrongTimes: r.wrongTimes,
          correctSince: r.correctSince,
        });
      } catch (e) {
        // 单题失败（题目被删掉等）不该让整批失败：明确回报这一题没成，其余照常
        if (e instanceof JudgeError) {
          out.push({
            itemId: Math.trunc(Number(one?.itemId)) || 0,
            isCorrect: false,
            answer: '',
            wrongTimes: 0,
            correctSince: 0,
          });
          continue;
        }
        throw e;
      }
    }

    // 批量做完再结算一次印章（答对描红题可能解锁）
    await evaluateStamps(userId);

    return success(res, {
      results: out,
      cleared,
      remaining: await owedCount(userId),
    });
  } catch (e) {
    return fail(res, (e as Error).message, 500);
  }
});

export default router;