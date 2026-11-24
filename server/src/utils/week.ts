/**
 * 周区间计算 —— 波次 0 冻结，**编排者所有，agent 只读不改**。
 *
 * 契约 §4.6：周榜的"周"以**周一**为起点。
 * 周 XP 用 xp_events.created_at 落在 [周一 00:00, 下周一 00:00) 求和，
 * 不依赖 user_streaks 或任何缓存列。
 *
 * created_at 全项目都是 TEXT 'YYYY-MM-DD HH:mm:ss'（见 datetime.ts 的文件头注释），
 * 所以可以直接做字符串比较 —— 字典序与时间序一致，不需要转 Date。
 */
import { addDays, todayLocal } from './datetime';

/** 给定日期所在周的周一（YYYY-MM-DD）。周日算作上一周的末尾 */
export function mondayOf(dateStr: string = todayLocal()): string {
  const d = new Date(dateStr + 'T00:00:00');
  const dow = d.getDay(); // 0=周日, 1=周一, ...
  const back = dow === 0 ? 6 : dow - 1;
  return addDays(dateStr, -back);
}

export interface WeekRange {
  /** 周一 'YYYY-MM-DD' */
  start: string;
  /** 周日 'YYYY-MM-DD' */
  end: string;
  /** 下周一 'YYYY-MM-DD'，用于 created_at 的右开边界 */
  nextStart: string;
  /** SQL 比较用的左闭边界 'YYYY-MM-DD 00:00:00' */
  startAt: string;
  /** SQL 比较用的右开边界 'YYYY-MM-DD 00:00:00' */
  nextStartAt: string;
}

export function weekRange(dateStr: string = todayLocal()): WeekRange {
  const start = mondayOf(dateStr);
  const nextStart = addDays(start, 7);
  return {
    start,
    end: addDays(start, 6),
    nextStart,
    startAt: `${start} 00:00:00`,
    nextStartAt: `${nextStart} 00:00:00`,
  };
}
