/**
 * PK 对战 —— 契约 §4.4
 * 归属：**fe-game**
 *
 * ⚠️ 路由顺序陷阱：GET /duels/recent 是**静态段**，必须排在 GET /duels/:code **之前**，
 *    否则 recent 会被当成一个 code 吃掉。本文件已按正确顺序写好，不要调换。
 * ⚠️ /duels/:code 与 /duels/:code/submit 是**游客可访问**（不挂 authMiddleware），
 *    分享链接要能在未登录状态打开。submit 时用 code 定位挑战，不信请求体里的 challengerId。
 * ⚠️ 码用 utils/code.ts 的 genUniqueCode()，字符集/长度都在 constants 里。
 *
 * 本文件里"是不是发起人本人"只有一个判据：Authorization 头能解出 userId 且等于
 * duels.challenger_id。请求体里的任何 id 字段都不看 —— 游客能伪造 body，伪造不了签名。
 */
import { Router, Request, Response } from 'express';
import db from '../config/database';
import { authMiddleware, AuthedRequest } from '../middleware/auth';
import { fail, success } from '../utils/response';
import { addDays, localNowStr, todayLocal } from '../utils/datetime';
import { genUniqueCode } from '../utils/code';
import { DUEL_EXPIRE_DAYS } from '../constants';
import { verifyToken } from '../utils/jwt';
import { toItemDto } from '../services/item';

const router = Router();

function handle(fn: (req: AuthedRequest, res: Response) => Promise<unknown>) {
  return async (req: Request, res: Response) => {
    try {
      await fn(req as AuthedRequest, res);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[duel] 处理失败:', e);
      if (!res.headersSent) fail(res, (e as Error)?.message || '服务器内部错误', 500);
    }
  };
}

/** 游客接口用：有合法 token 就给出 userId，没有/过期一律 null（不 401） */
function optionalUserId(req: Request): number | null {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return null;
  try {
    return verifyToken(auth.slice(7)).userId;
  } catch {
    return null;
  }
}

interface DuelRow {
  id: number;
  code: string;
  lesson_id: number;
  challenger_id: number;
  challenger_score: number | null;
  challenger_ms: number | null;
  opponent_name: string | null;
  opponent_score: number | null;
  opponent_ms: number | null;
  status: string;
  expires_at: string | null;
  created_at: string | null;
}

/** 过期是"读的时候算"的，不写库：GET 里做 UPDATE 会让只读请求也拿写锁 */
function effectiveStatus(d: DuelRow): string {
  if (d.status === 'open' && d.expires_at && d.expires_at <= localNowStr()) return 'expired';
  return d.status;
}

function nameOf(u: { nickname?: string | null; username?: string | null } | undefined): string {
  return (u?.nickname || u?.username || '对手') as string;
}

/**
 * 挑战题目 —— **必须走 services/item.ts 的 toItemDto**，不要在这里手搓一份映射。
 *
 * 踩过的坑：这里原本手写了一份 9 字段的 map，漏掉 `lessonId` 与 `pointKey`。
 * 而 §4.4 明文写 `items: [ /* 同 §4.1 的 item 对象 *\/ ]`，§4.1 又要求
 * 「内容接口**一律**返回这套字段」—— 少两个字段就是接口形状不一致，
 * 且前端 `DuelDetail.items` 的类型是 `CourseItem[]`（course.ts 里
 * `pointKey: string` 是必填），类型检查抓不到、运行时却是 undefined。
 * 另外手搓版 `r.options ? JSON.parse : null` 对空串/坏 JSON 的处理也不如
 * `parseOptions()` 稳（坏 JSON 会整个 500）。
 */
async function loadItems(lessonId: number) {
  const rows = await db('items').where({ lesson_id: lessonId }).orderBy('sort', 'asc').orderBy('id', 'asc');
  return rows.map(toItemDto);
}

/**
 * 这一课一共几道题。
 *
 * 为什么需要它（CHANGE-REQUEST，2026-11-24 用户批准）：契约 §4.4 原本只给 `items`，
 * 而 `status != 'open'` 时 `items` 是 `null` —— 于是前端拿不到"一共几道"这个数，
 * 已结束的对战页只能打印 `items.length`，渲染出「出的题，一共 0 道」这种错文案
 * （本地 8091 实测：已结束的 ESPAUM 显示 0 道，进行中的 8Z23N4 显示 12 道）。
 * 前端要的是**题量**，不该依赖**题目内容**是否下发。
 */
async function countItems(lessonId: number): Promise<number> {
  const row = (await db('items').where({ lesson_id: lessonId }).count({ c: '*' }).first()) as
    | { c?: number | string }
    | undefined;
  return Number(row?.c ?? 0);
}

// ⚠️ recent 必须在 :code 之前
router.get(
  '/duels/recent',
  authMiddleware,
  handle(async (req, res) => {
    const userId = req.userId as number;

    const rows = (await db('duels')
      .where({ challenger_id: userId })
      .orderBy('id', 'desc')
      .limit(20)) as DuelRow[];
    if (!rows.length) return success(res, []);

    const lessonIds = Array.from(new Set(rows.map((r) => r.lesson_id)));
    const lessons = (await db('lessons').whereIn('id', lessonIds)) as Array<{ id: number; title: string }>;
    const titleMap = new Map(lessons.map((l) => [Number(l.id), l.title]));

    const list = rows.map((d) => ({
      code: d.code,
      lessonTitle: titleMap.get(Number(d.lesson_id)) ?? '',
      // duels 表只记 challenger_id，所以"我参与的"必然是我发起的
      role: 'challenger',
      status: effectiveStatus(d),
      myScore: d.challenger_score,
      rivalName: d.opponent_name,
      rivalScore: d.opponent_score,
      createdAt: d.created_at,
    }));

    return success(res, list);
  })
);

router.post(
  '/duels',
  authMiddleware,
  handle(async (req, res) => {
    const userId = req.userId as number;

    const lessonId = Number(req.body?.lessonId);
    if (!Number.isFinite(lessonId) || lessonId <= 0) return fail(res, 'lessonId 必填');
    const lesson = (await db('lessons').where({ id: lessonId }).first()) as { id: number; title: string } | undefined;
    if (!lesson) return fail(res, '课时不存在', 404);

    const code = await genUniqueCode(async (c) => {
      const row = await db('duels').where({ code: c }).first();
      return !!row;
    });
    const expiresAt = `${addDays(todayLocal(), DUEL_EXPIRE_DAYS)} 23:59:59`;

    await db('duels').insert({
      code,
      lesson_id: lessonId,
      challenger_id: userId,
      status: 'open',
      expires_at: expiresAt,
      created_at: localNowStr(),
    });

    return success(res, {
      code,
      lessonId,
      lessonTitle: lesson.title,
      expiresAt,
      shareUrl: `/pages/duel/duel?code=${code}`,
    });
  })
);

// 游客可访问（G）—— 刻意不挂 authMiddleware
router.get(
  '/duels/:code',
  handle(async (req, res) => {
    const code = String(req.params.code || '').trim().toUpperCase();
    if (!code) return fail(res, '挑战码必填');

    const d = (await db('duels').where({ code }).first()) as DuelRow | undefined;
    if (!d) return fail(res, '挑战不存在或已失效', 404);

    const status = effectiveStatus(d);
    const lesson = (await db('lessons').where({ id: d.lesson_id }).first()) as { title: string } | undefined;
    const challenger = (await db('users').where({ id: d.challenger_id }).first()) as
      | { nickname?: string | null; username?: string | null }
      | undefined;

    // 只有还能答的时候才给题目；已结束/已过期一律 null（契约 §4.4）
    // ⚠️ `total` 必须在 open 时取自 `items.length` 本身，不能另跑一次 count ——
    //    两道查询分开算，将来任何一个过滤条件改动都会让「一共 N 道」和实际题数对不上。
    const items = status === 'open' ? await loadItems(d.lesson_id) : null;

    return success(res, {
      code: d.code,
      status,
      lessonId: d.lesson_id,
      lessonTitle: lesson?.title ?? '',
      challengerName: nameOf(challenger),
      challengerScore: d.challenger_score,
      challengerMs: d.challenger_ms,
      challengerId: d.challenger_id,
      expiresAt: d.expires_at,
      // 题量：open 时 = 下发的题数，done/expired 时 = 这一课的题数（items 为 null 也要能显示）
      total: items ? items.length : await countItems(d.lesson_id),
      items,
    });
  })
);

// 游客可访问（G）—— 刻意不挂 authMiddleware
router.post(
  '/duels/:code/submit',
  handle(async (req, res) => {
    const code = String(req.params.code || '').trim().toUpperCase();
    const d = (await db('duels').where({ code }).first()) as DuelRow | undefined;
    if (!d) return fail(res, '挑战不存在或已失效', 404);

    const status = effectiveStatus(d);
    if (status === 'expired') return fail(res, '挑战已过期');
    if (status === 'done') return fail(res, '这场对战已经结束了');

    const score = Number(req.body?.score);
    const total = Number(req.body?.total);
    const durationMs = Math.max(0, Math.floor(Number(req.body?.durationMs) || 0));
    if (!Number.isFinite(score) || !Number.isFinite(total)) return fail(res, 'score 与 total 必填');

    const rawName = String(req.body?.name ?? '').trim().slice(0, 50);
    const meId = optionalUserId(req);
    const isChallenger = meId !== null && Number(meId) === Number(d.challenger_id);

    const challengerScore = isChallenger ? score : d.challenger_score;
    const challengerMs = isChallenger ? durationMs : d.challenger_ms;
    const opponentScore = isChallenger ? d.opponent_score : score;
    const opponentMs = isChallenger ? d.opponent_ms : durationMs;
    const opponentName = isChallenger ? d.opponent_name : rawName || d.opponent_name || '对手';

    /**
     * 对手位只写一次：已有人答过，就不许**另一个人**顶掉他。
     *
     * ⚠️ 契约 §4.4 没写这一条，原实现是「后到的覆盖先到的」，实测（本地 8091）：
     *    Guest01 交 7 分 / 42000ms 之后，Guest02 再提交 10 分 / 1ms 同样 code:0，
     *    对手位被改写，发起人 GET /duels/recent 里的 rivalName 也变成 Guest02。
     *    分享链接是要发到班级群里的，谁最后点谁就是"对手"，胜负随时作废 ——
     *    所以这里取 first-write-wins，把这个洞堵上（详见最终报告的 CHANGE-REQUEST）。
     *
     * 例外：带着与已记录 opponent_name **同名**的提交放行，认作同一个人重试/换网补交。
     *    游客没有身份，昵称是唯一能用的把手；代价是别人冒用同名也能覆盖同名条目 ——
     *    比"谁都能覆盖"弱得多，但确实不是强校验。要强校验得加设备指纹/签名，属契约级改动。
     */
    if (!isChallenger && d.opponent_score !== null && opponentName !== d.opponent_name) {
      return fail(res, '这一场已经有人答过了');
    }

    const bothScored = challengerScore !== null && opponentScore !== null;
    const nextStatus = bothScored ? 'done' : 'open';

    await db('duels').where({ id: d.id }).update({
      challenger_score: challengerScore,
      challenger_ms: challengerMs,
      opponent_name: opponentName,
      opponent_score: opponentScore,
      opponent_ms: opponentMs,
      status: nextStatus,
    });

    // 双方都有分才算胜负；一方还没答时 winner 为 null（前端据此显示"等对手"）
    let winner: string | null = null;
    if (bothScored) {
      if ((challengerScore as number) > (opponentScore as number)) winner = 'challenger';
      else if ((opponentScore as number) > (challengerScore as number)) winner = 'opponent';
      else if (challengerMs !== null && opponentMs !== null && challengerMs !== opponentMs) {
        winner = challengerMs < opponentMs ? 'challenger' : 'opponent'; // 同分比用时
      } else {
        winner = 'tie';
      }
    }

    const challenger = (await db('users').where({ id: d.challenger_id }).first()) as
      | { nickname?: string | null; username?: string | null }
      | undefined;

    return success(res, {
      code: d.code,
      role: isChallenger ? 'challenger' : 'opponent',
      challenger: { name: nameOf(challenger), score: challengerScore, ms: challengerMs },
      opponent: { name: opponentName ?? '对手', score: opponentScore, ms: opponentMs },
      winner,
    });
  })
);

export default router;
