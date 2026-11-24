/**
 * 波次 0 冻结常量 —— **编排者所有，agent 只读不改**。
 *
 * 为什么要有这个文件：契约里有好几条"四路都用同一套、不要各写一份"的规则
 * （段位梯度、课时完成阈值、错题掌握阈值）。如果每个 agent 在自己文件里各抄一份，
 * 波次 2 合并时就会出现两套阈值悄悄分叉 —— 而且不会有任何报错。
 * 所以它们全部集中在这里，一处定义，四处引用。
 *
 * 要增改常量：写进 CONTRACT.md §7 的变更请求，不要直接改本文件。
 */

/** 课时「完成」阈值：correctCount / total >= 0.6（CONTRACT.md §4.2） */
export const LESSON_DONE_RATIO = 0.6;

/** 错题「已掌握」阈值：wrong_book.correct_since 达到这个值即视为掌握（§4.3） */
export const WRONG_MASTERED_AT = 2;

/** 段位梯度：按**累计 XP** 从低到高，`min` 为含（§4.5） */
export const RANK_TIERS = [
  { name: '童生', min: 0 },
  { name: '秀才', min: 500 },
  { name: '举人', min: 1500 },
  { name: '贡士', min: 3000 },
  { name: '进士', min: 6000 },
] as const;

/** 累计 XP → 段位名。任何返回段位的地方都调这里，不要自己写 if-else 链 */
export function rankNameOf(xp: number): string {
  let name: string = RANK_TIERS[0].name;
  for (const t of RANK_TIERS) {
    if (xp >= t.min) name = t.name;
  }
  return name;
}

/** 累计 XP → 段位序号 1..5（前端画进度用） */
export function rankLevelOf(xp: number): number {
  let level = 1;
  RANK_TIERS.forEach((t, i) => {
    if (xp >= t.min) level = i + 1;
  });
  return level;
}

/** 段位下一级的门槛 XP；已满级返回 null */
export function nextRankMin(xp: number): number | null {
  for (const t of RANK_TIERS) {
    if (xp < t.min) return t.min;
  }
  return null;
}

/**
 * XP 数值 —— 一律从 .env 取，代码里不写死。
 * 前端不参与算 XP，只展示后端返回的值（§4.2）。
 */
export const XP_PER_CORRECT = Number(process.env.XP_PER_CORRECT ?? 10);
export const XP_PER_WRONG = Number(process.env.XP_PER_WRONG ?? 2);
export const XP_PER_LESSON = Number(process.env.XP_PER_LESSON ?? 20);
/** 每日打卡奖励（跨课去重，一天只发一次） */
export const XP_PER_CHECKIN = Number(process.env.XP_PER_CHECKIN ?? 5);

/**
 * 邀请码 / 对战码字符集：去掉了易混的 0 O 1 I。
 * duel 与 team 共用（§4.4 §4.8），不要各写一套。
 */
export const CODE_CHARSET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
export const CODE_LENGTH = 6;

/** 对战链接有效期（天），§4.4 */
export const DUEL_EXPIRE_DAYS = 7;

/** 小组人数上限，§4.8 */
export const TEAM_MAX_MEMBERS = 8;
