/**
 * XP 流水与周榜 —— 契约 §4.6
 * 归属：**fe-game**
 *
 * ⚠️ request.ts 已经拆过一层包：`body.code === 0 → resolve(body.data)`。
 *    所以下面每个泛型写的就是契约里 `data` 本身，页面里写 `res.foo`，
 *    **绝不能**写 `res.data.foo` —— 那是多剥一层，得到 undefined，页面显示空且不报错。
 *
 * ⚠️ 周榜的周起点是**周一**，由后端算好（weekStart/weekEnd 直接展示，前端不要自己推日期，
 *    否则本地时区一歪就和后端对不上）。
 * ⚠️ 段位名（rankName）**按累计 XP** 判，不是按周 XP —— 别看到「周榜」就以为名字是周榜排名。
 */
import { request } from '../utils/request'

/**
 * 段位阶梯 —— 与后端 `server/src/constants/index.ts` 的 RANK_TIERS **同源同值**。
 * 前端需要它只为了画「阶梯」和「还差多少 XP」这种**纯展示**推导；
 * 判定谁是秀才、谁是举人**永远以后端返回的 rankName / rankLevel 为准**，
 * 不要用这里的 min 自己算一遍再拿去显示 —— 后端调了门槛，前端就得跟着改。
 *
 * ⚠️ 只有 5 段。占位版页面里写的 7 级（蒙学…状元）是错的，已按冻结常量改正。
 */
export const RANK_TIERS: ReadonlyArray<{ name: string; min: number }> = [
  { name: '童生', min: 0 },
  { name: '秀才', min: 500 },
  { name: '举人', min: 1500 },
  { name: '贡士', min: 3000 },
  { name: '进士', min: 6000 },
]

/** 当前累计 XP 落在的段位起点（展示用） */
export function rankMinOf(xpTotal: number): number {
  let lo = 0
  for (const t of RANK_TIERS) if (xpTotal >= t.min) lo = t.min
  return lo
}

/** 下一段位的门槛；已到顶返回 null（展示用） */
export function nextRankMin(xpTotal: number): number | null {
  for (const t of RANK_TIERS) if (xpTotal < t.min) return t.min
  return null
}

/** 契约 §4.6 GET /xp/ledger 的分页项 */
export interface XpLedgerItem {
  id: number
  /** 正数加分；负数为将来的扣分预留 */
  amount: number
  /** 事件来源：checkin / attempt / lesson …（后端 xp_events.reason） */
  reason: string
  refType: string | null
  refId: number | null
  /** 人话说明，如「连续打卡第 3 天」；没有就是 null */
  note: string | null
  createdAt: string | null
}

export interface XpLedgerPage {
  list: XpLedgerItem[]
  total: number
  page: number
  pageSize: number
  hasMore: boolean
}

/** 契约 §4.6 GET /rank/week 的榜单行 */
export interface WeekRankItem {
  rank: number
  userId: number
  nickname: string
  avatarUrl: string | null
  weekXp: number
  /** 段位（累计 XP 判定），如「秀才」 */
  rankName: string
  isMe: boolean
}

/** 契约 §4.6 GET /rank/week → data */
export interface WeekRankResult {
  weekStart: string
  weekEnd: string
  list: WeekRankItem[]
  /** 未上榜（本周 0 XP）时为 null —— 前端要能画「本周还没上榜」而不是空白 */
  me: { rank: number; weekXp: number; rankName: string } | null
}

/** 契约 §4.6 GET /rank/rank-of/:userId → data */
export interface RankOfResult {
  userId: number
  nickname: string
  /** 未上榜为 null */
  rank: number | null
  weekXp: number
  rankName: string
  /** 段位序号 1..5，画进度条用 */
  rankLevel: number
}

export const xpApi = {
  /** 契约 §4.6 GET /xp/ledger?page=&pageSize= */
  ledger: (params?: { page?: number; pageSize?: number }) =>
    request<XpLedgerPage>({
      url: '/xp/ledger',
      data: { page: params?.page ?? 1, pageSize: params?.pageSize ?? 20 },
    }),
}

export const rankApi = {
  /** 契约 §4.6 GET /rank/week?limit= —— 周榜 + 我的名次（一次拿全） */
  week: (limit = 50) => request<WeekRankResult>({ url: '/rank/week', data: { limit } }),

  /**
   * 契约 §4.6 GET /rank/rank-of/:userId —— 不传就是自己。
   * 不传时走字面量 `me`：后端拿 Number('me') = NaN 会退回 req.userId。
   * **不能**写 `/rank/rank-of/`（空段）—— Express 匹配不上 `:userId`，直接 404。
   */
  rankOf: (userId?: number | string) =>
    request<RankOfResult>({ url: `/rank/rank-of/${userId ?? 'me'}` }),
}
