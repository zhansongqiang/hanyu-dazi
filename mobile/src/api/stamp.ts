/**
 * 印章 —— 契约 §4.7
 * 归属：**fe-game**
 *
 * ⚠️ `GET /stamps` **未得的章也会返回**（`earned:false`）—— 这是 §8 的验收项：
 *    印章页要画灰态，不是只列已经得的。只列已得的话，用户看到的是空页面，
 *    不知道自己还能去挣什么。
 * ⚠️ `kind='speak'`（跟读）本次不实现：它照样出现在列表里，永远 earned=false。
 *    前端**不要**为它写特例，灰着就行。
 */
import { request } from '../utils/request'

/** 印章种类（契约 §4.7 发章规则） */
export type StampKind = 'unit' | 'streak' | 'xp' | 'stroke' | 'speak'

/** 契约 §4.7 GET /stamps 的数组元素 */
export interface Stamp {
  code: string
  name: string
  description: string | null
  kind: StampKind
  sort: number
  earned: boolean
  /** 已得才有；未得为 null */
  unlockedAt: string | null
}

/** 契约 §4.7 POST /stamps/check → data */
export interface StampCheckResult {
  /** **本次新解锁**的章（不是全部已得） */
  unlocked: Array<{ code: string; name: string }>
  /** achievements 总枚数 */
  total: number
  /** 我已得枚数 */
  earned: number
}

export const stampApi = {
  /** 全部印章 + 我是否已得（含未得的灰态） */
  list: () => request<Stamp[]>({ url: '/stamps' }),

  /** 主动结算一次（幂等）：返回本次新解锁的章，用来弹「恭喜解锁」。 */
  check: () => request<StampCheckResult>({ url: '/stamps/check', method: 'POST', data: {} }),
}
