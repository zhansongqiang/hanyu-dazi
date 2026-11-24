import db from '../config/database';
import { XP_PER_CORRECT, XP_PER_WRONG } from '../constants';
import { localNowStr } from '../utils/datetime';
import { grantXp } from './xp';
import { evaluate as evaluateStamps, UnlockedStamp } from './stamps';
import { hasHintColumn } from './item';

/**
 * 答题复判 + 落库 —— **`POST /attempts` 与 `POST /wrongbook/practice` 的共同实现**
 * （契约 §4.2 §4.3，归属 be-api 的 services/**）。
 *
 * ⚠️ 契约 §4.3 明文：「复用同一个 service 函数，不要复制代码」。所以这里既不做 HTTP，
 * 也不做鉴权，两个路由各自解析完参数后都调 `judgeAndPersist()`。
 *
 * 三件不可省的事：
 *  1. **后端自己判对错**，绝不使用请求体里的 `isCorrect`（§4.2 第 1 条）
 *  2. `lesson_id` **从 item 行取**，不信请求体（§4.2 第 2 条）
 *  3. 时间用 `localNowStr()`，不用 SQLite 的 CURRENT_TIMESTAMP（那是 UTC）
 *
 * `hint` 列由 content 的迁移 `..._items_hint.ts` 负责新增，**落地顺序不确定**，
 * 所以列是否存在由 `services/item.ts` 的 `hasHintColumn()` 统一探测（进程内缓存）：
 * 列在就返回 hint，列不在就返回 null。硬写 `items.hint` 会在迁移尚未执行时把答题
 * 接口打成 500 —— 这是跨 agent 协作的必然风险，必须双向容错。
 */

export interface JudgeInput {
  userId: number;
  itemId: number;
  userAnswer: unknown;
  durationMs?: unknown;
  /** 是否顺手结算印章；批量场景关掉，由路由在最后结算一次 */
  withStamp?: boolean;
}

export interface JudgeResult {
  itemId: number;
  lessonId: number;
  isCorrect: boolean;
  answer: string;
  xpEarned: number;
  hint: string | null;
  wrongTimes: number;
  correctSince: number;
  badge: UnlockedStamp | null;
}

/** 规范化答案：去首尾空白、折叠内部空白、拉丁字母不分大小写 */
function norm(s: unknown): string {
  return String(s ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export class JudgeError extends Error {
  constructor(message: string, public httpStatus = 400) {
    super(message);
  }
}

/**
 * 判一道题并落库（attempts + xp_events + lesson_progress）。
 * 抛 `JudgeError` 表示输入本身有问题（题目不存在等），由路由转成 fail()。
 */
export async function judgeAndPersist(input: JudgeInput): Promise<JudgeResult> {
  const itemId = Math.trunc(Number(input.itemId));
  if (!Number.isFinite(itemId) || itemId <= 0) throw new JudgeError('itemId 不合法');

  const wantHint = await hasHintColumn();
  const item: any = await db('items')
    .where({ id: itemId })
    .first(wantHint ? ['id', 'lesson_id', 'answer', 'hint'] : ['id', 'lesson_id', 'answer']);
  if (!item) throw new JudgeError('题目不存在', 404);

  const answer = String(item.answer ?? '');
  const isCorrect = norm(input.userAnswer) === norm(answer) && answer.length > 0;

  const userAnswer = String(input.userAnswer ?? '').slice(0, 200) || null;
  const rawMs = Number(input.durationMs);
  const durationMs = Number.isFinite(rawMs) && rawMs >= 0 ? Math.min(Math.trunc(rawMs), 3600_000) : null;

  const lessonId = Number(item.lesson_id);
  const now = localNowStr();

  await db('attempts').insert({
    user_id: input.userId,
    item_id: itemId,
    lesson_id: lessonId,
    is_correct: isCorrect ? 1 : 0,
    user_answer: userAnswer,
    duration_ms: durationMs,
    created_at: now,
  });

  const xpEarned = await grantXp({
    userId: input.userId,
    amount: isCorrect ? XP_PER_CORRECT : XP_PER_WRONG,
    reason: isCorrect ? 'correct' : 'wrong',
    refType: 'item',
    refId: itemId,
  });

  /* ---- lesson_progress：attempts_count += 1，last_item_id 更新 ----
   * ⚠️ 这里**不算 best_score** —— 契约 §4.2 第 4 条明文「best_score 在结算时才算」。
   * 不用 upsert 的 `onConflict().merge()` 递增，因为 SQLite 里要做 `attempts_count + 1`
   * 得写成 raw；分两步「有则 update、无则 insert」在本表规模下更清楚且没有并发压力。
   */
  const prog: any = await db('lesson_progress')
    .where({ user_id: input.userId, lesson_id: lessonId })
    .first();
  if (prog) {
    await db('lesson_progress').where({ id: prog.id }).update({
      attempts_count: Number(prog.attempts_count ?? 0) + 1,
      last_item_id: itemId,
      updated_at: now,
    });
  } else {
    await db('lesson_progress').insert({
      user_id: input.userId,
      lesson_id: lessonId,
      status: 'in_progress',
      best_score: 0,
      best_total: null,
      attempts_count: 1,
      last_item_id: itemId,
      created_at: now,
      updated_at: now,
    });
  }

  /* ---- 该题当前错题状态：直接读视图，保证与 /wrongbook 完全一致 ---- */
  const wb: any = await db('wrong_book')
    .where({ user_id: input.userId, item_id: itemId })
    .first();
  const wrongTimes = Number(wb?.wrong_times ?? 0);
  const correctSince = Number(wb?.correct_since ?? 0);

  let badge: UnlockedStamp | null = null;
  if (input.withStamp !== false) {
    const unlocked = await evaluateStamps(input.userId);
    if (unlocked.length) badge = unlocked[0];
  }

  return {
    itemId,
    lessonId,
    isCorrect,
    answer,
    xpEarned,
    hint: wantHint ? ((item as any).hint ?? null) : null,
    wrongTimes,
    correctSince,
    badge,
  };
}