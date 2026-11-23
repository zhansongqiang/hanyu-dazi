/**
 * 本地时间工具(避免 UTC 偏差, 同 SmartCampus holiday 实践)
 *
 * 时间戳存储约定（全项目唯一）：
 *   所有 created_at / updated_at 一律存 TEXT 'YYYY-MM-DD HH:mm:ss'（本地时间）。
 *   不要存 Date 对象 —— better-sqlite3 会把它落成整数毫秒，直接查库看不懂，
 *   前端拿到的也是 1795418305926 这种数字（Day 1 上午踩过）。
 *   不要存 ISO 带 T 和 Z —— 那是 UTC，跟 checkins.check_date 的本地日期对不上。
 */

export function localNow(): Date {
  return new Date();
}

/** 当前本地时间，格式 'YYYY-MM-DD HH:mm:ss'，写库用这个 */
export function localNowStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} `
    + `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
}

export function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** 两个 YYYY-MM-DD 之间的天数(end - start, 含端可自行+1) */
export function daysBetween(start: string, end: string): number {
  const s = new Date(start + 'T00:00:00').getTime();
  const e = new Date(end + 'T00:00:00').getTime();
  return Math.round((e - s) / 86400000);
}

/** YYYY-MM-DD 加 n 天 */
export function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
