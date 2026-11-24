import db from '../config/database';
import { localNowStr } from '../utils/datetime';
import { currentStreak } from './checkin';
import { totalXp } from './xp';

/**
 * 印章 —— 发章规则的**唯一实现**（契约 §4.7，归属 be-api 的 services/**）。
 *
 * 谁调用：
 *  - `POST /attempts`（be-api）—— 答对描红题可能触发 `kind='stroke'`
 *  - `POST /lessons/:id/finish`（be-api）—— 课时完成可能触发 `kind='unit'`
 *  - `POST /stamps/check`（fe-game）—— 手动结算一次
 *  - `GET /stamps`（fe-game）—— 调 `list()` 拿定义 + 是否已得
 *
 * `achievements` 是种子数据（由 content 侧写入 `seeds/stamps.seed.ts`，≥12 枚）。
 * **表空时本模块全部函数必须静默返回空**，不能抛错 —— 否则 content 的种子还没跑，
 * 就把 be-api 的答题接口一起打成 500（跨 agent 落地顺序不确定，必须双向容错）。
 *
 * `kind='speak'`（跟读）收尾日才有，**本次不实现**：遇到直接跳过，但仍会出现在
 * `GET /stamps` 列表里（灰态），这样前端不用为它写特例。
 */

export interface UnlockedStamp {
  code: string;
  name: string;
}

interface StampDef {
  id: number;
  code: string;
  name: string;
  description: string | null;
  kind: string;
  ref_key: string | null;
  threshold: number | null;
  sort: number;
}

async function allDefs(): Promise<StampDef[]> {
  try {
    return (await db('achievements').orderBy('sort', 'asc').orderBy('id', 'asc')) as StampDef[];
  } catch {
    return [];
  }
}

/** 该单元**全部课时**都 done */
async function unitAllDone(userId: number, unitKey: string): Promise<boolean> {
  const unit: any = await db('units').where({ key: unitKey }).first();
  if (!unit) return false;
  const lessonIds = (await db('lessons').where({ unit_id: unit.id }).pluck('id')) as number[];
  if (!lessonIds.length) return false;
  const row: any = await db('lesson_progress')
    .where({ user_id: userId, status: 'done' })
    .whereIn('lesson_id', lessonIds)
    .count({ c: '*' })
    .first();
  return Number(row?.c ?? 0) >= lessonIds.length;
}

/** 该单元**全部描红题**都答对过（每道题至少对过一次） */
async function unitAllStrokesCorrect(userId: number, unitKey: string): Promise<boolean> {
  const unit: any = await db('units').where({ key: unitKey }).first();
  if (!unit) return false;
  const itemIds = (await db('items as i')
    .join('lessons as l', 'l.id', 'i.lesson_id')
    .where('l.unit_id', unit.id)
    .andWhere('i.kind', 'stroke')
    .pluck('i.id')) as number[];
  if (!itemIds.length) return false;
  const okIds = (await db('attempts')
    .where({ user_id: userId })
    .andWhere('is_correct', 1)
    .whereIn('item_id', itemIds)
    .distinct('item_id')
    .pluck('item_id')) as number[];
  return okIds.length >= itemIds.length;
}

/**
 * 结算一次：把「当前已满足条件、但还没发过」的章发出去。
 * 幂等 —— 已得的章不会再发（`uq_user_achievement` 兜底，重复插入被吞掉）。
 * 返回**本次新解锁**的章（`POST /attempts` 的 `badge` 字段取这里）。
 */
export async function evaluate(userId: number): Promise<UnlockedStamp[]> {
  const defs = await allDefs();
  if (!defs.length) return [];

  const owned = new Set(
    ((await db('user_achievements').where({ user_id: userId }).pluck('achievement_id')) as number[]).map(Number),
  );
  const todo = defs.filter((d) => !owned.has(Number(d.id)));
  if (!todo.length) return [];

  const unlocked: UnlockedStamp[] = [];
  const now = localNowStr();

  // 懒加载 + 缓存：一次结算里同类事实只查一次库
  let xpCache: number | null = null;
  let streakCache: number | null = null;
  const unitDone = new Map<string, boolean>();
  const unitStroke = new Map<string, boolean>();

  for (const d of todo) {
    let ok = false;
    const key = d.ref_key ?? '';

    switch (d.kind) {
      case 'unit': {
        if (key) {
          if (!unitDone.has(key)) unitDone.set(key, await unitAllDone(userId, key));
          ok = unitDone.get(key) === true;
        }
        break;
      }
      case 'stroke': {
        if (key) {
          if (!unitStroke.has(key)) unitStroke.set(key, await unitAllStrokesCorrect(userId, key));
          ok = unitStroke.get(key) === true;
        }
        break;
      }
      case 'streak': {
        if (d.threshold != null) {
          if (streakCache === null) streakCache = await currentStreak(userId);
          ok = streakCache >= Number(d.threshold);
        }
        break;
      }
      case 'xp': {
        if (d.threshold != null) {
          if (xpCache === null) xpCache = await totalXp(userId);
          ok = xpCache >= Number(d.threshold);
        }
        break;
      }
      case 'speak':
      default:
        ok = false; // §4.7：本次不实现
        break;
    }

    if (!ok) continue;
    try {
      await db('user_achievements').insert({
        user_id: userId,
        achievement_id: d.id,
        unlocked_at: now,
      });
      unlocked.push({ code: d.code, name: d.name });
    } catch {
      // 唯一键冲突：并发下已被发过。当成已拥有，不算本次新解锁。
    }
  }

  return unlocked;
}

/** `GET /stamps`（fe-game）—— 全部印章定义 + 我是否已得。未得的也返回（灰态） */
export async function list(userId: number): Promise<
  Array<{ code: string; name: string; description: string | null; kind: string; sort: number; earned: boolean; unlockedAt: string | null }>
> {
  const defs = await allDefs();
  if (!defs.length) return [];

  const rows = (await db('user_achievements as ua')
    .join('achievements as a', 'a.id', 'ua.achievement_id')
    .where('ua.user_id', userId)
    .select('ua.achievement_id', 'ua.unlocked_at')) as any[];
  const ownedAt = new Map(rows.map((r) => [Number(r.achievement_id), r.unlocked_at as string | null]));

  return defs.map((d) => ({
    code: d.code,
    name: d.name,
    description: d.description ?? null,
    kind: d.kind,
    sort: d.sort,
    earned: ownedAt.has(Number(d.id)),
    unlockedAt: ownedAt.get(Number(d.id)) ?? null,
  }));
}

/** `/profile/summary` 的 `stamps: { total, earned }` */
export async function counts(userId: number): Promise<{ total: number; earned: number }> {
  const t: any = await db('achievements').count({ c: '*' }).first();
  const e: any = await db('user_achievements').where({ user_id: userId }).count({ c: '*' }).first();
  return { total: Number(t?.c ?? 0), earned: Number(e?.c ?? 0) };
}
