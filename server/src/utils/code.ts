/**
 * 邀请码 / 对战码生成 —— 波次 0 冻结，**编排者所有，agent 只读不改**。
 *
 * duel（§4.4）与 team（§4.8）都要"6 位、去掉易混字符、查重后重生成"，
 * 这段逻辑只写一处，两边都调它。
 */
import { randomInt } from 'crypto';
import { CODE_CHARSET, CODE_LENGTH } from '../constants';

/** 生成一个 CODE_LENGTH 位的码（字符集见 constants，已去 0/O/1/I） */
export function genCode(length: number = CODE_LENGTH): string {
  let out = '';
  for (let i = 0; i < length; i++) {
    out += CODE_CHARSET[randomInt(CODE_CHARSET.length)];
  }
  return out;
}

/**
 * 生成一个库里不重复的码。
 *
 * 用法（duel 与 team 一致）：
 *   const code = await genUniqueCode(async (c) => {
 *     const row = await db('duels').where({ code: c }).first();
 *     return !!row;
 *   });
 *
 * @param exists 传入"该码是否已存在"的判定函数（由调用方查自己的表）
 * @param maxTries 最多重试次数，默认 10
 * @throws 连续 maxTries 次都撞码时抛错 —— 不要静默返回重复码
 */
export async function genUniqueCode(
  exists: (code: string) => Promise<boolean>,
  maxTries = 10
): Promise<string> {
  for (let i = 0; i < maxTries; i++) {
    const code = genCode();
    if (!(await exists(code))) return code;
  }
  throw new Error(`生成唯一码失败：连续 ${maxTries} 次都重复`);
}
