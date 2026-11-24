/**
 * 打卡 —— 契约 §4.6
 * 归属：**fe-game**
 *
 * ⚠️ 连击算法只写一处（services/checkin.ts 的 touch，幂等，一天一条）：
 *    last_checkin_date === 昨天 → current += 1
 *    === 今天 → 不变
 *    更早或为空 → current = 1
 *    max_streak = max(max_streak, current)
 *    跨月跨年用 daysBetween()，不要自己算。
 *
 * services/** 是 be-api 的独占目录（契约 §5），连击/发 XP 的唯一实现在那儿；
 * 本路由**不含任何连击或 XP 逻辑**，只是把 req.userId 递进去。
 * 逻辑一旦在这里复制一份，就会和 `POST /lessons/:id/finish`（be-api 也调 touch）分叉。
 */
import { Router, Request, Response } from 'express';
import db from '../config/database';
import { authMiddleware, AuthedRequest } from '../middleware/auth';
import { fail, success } from '../utils/response';
import { getStatus, touch } from '../services/checkin';

const router = Router();

function handle(fn: (req: AuthedRequest, res: Response) => Promise<unknown>) {
  return async (req: Request, res: Response) => {
    try {
      await fn(req as AuthedRequest, res);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[checkin] 处理失败:', e);
      if (!res.headersSent) fail(res, (e as Error)?.message || '服务器内部错误', 500);
    }
  };
}

/**
 * 手动打卡。幂等：今天已打过 → created:false + 当前连击，**不报错**（契约 §4.6）。
 * body 里可选 lessonId（完成课时自动触发时带上，手动打卡不传）。
 */
router.post(
  '/checkin',
  authMiddleware,
  handle(async (req, res) => {
    const userId = req.userId as number;

    const rawLesson = Number(req.body?.lessonId);
    const lessonId = Number.isFinite(rawLesson) && rawLesson > 0 ? rawLesson : null;
    if (lessonId !== null) {
      const lesson = await db('lessons').where({ id: lessonId }).first();
      if (!lesson) return fail(res, '课时不存在', 404);
    }

    return success(res, await touch(userId, lessonId));
  })
);

/** 今天是否已打卡 + 连击（字段形状由 services/checkin.getStatus 决定：checkedIn/…） */
router.get(
  '/checkin/status',
  authMiddleware,
  handle(async (req, res) => {
    const userId = req.userId as number;
    return success(res, await getStatus(userId));
  })
);

export default router;
