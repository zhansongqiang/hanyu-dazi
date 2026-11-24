/**
 * 用户公开资料 / 举报 / 「我的」页汇总 —— 契约 §4.5 §4.9
 * 归属：**fe-game**（接口后端在 be-api 的 content.ts / progress.ts，本文件只是前端包装）
 *
 * ⚠️ `GET /users/:id` **不返回** password_hash / status / token —— 后端逐字段手写的。
 *    前端也**不要**把 username 当昵称显示：username 是登录名（xiaoming），
 *    昵称是 nickname（小明）。没昵称时后端给空串，页面要兜一个「同学」。
 * ⚠️ `GET /profile/summary` 是「我的」页**唯一**的数据源（§8 验收项：
 *    「所有数字来自一个 GET /profile/summary，不是 N 个请求凑」）。
 *    页面里**不要**再并发调 /checkin/status、/rank/week、/stamps 去拼这几个数字 ——
 *    那样不但多三个请求，还会出现「同一个数据在两个接口里不一致」。
 *    （印章页、排行页**各自**单独调自己的接口，那是页面主体内容，不算「凑我的页」。）
 */
import { request } from '../utils/request'

/** 契约 §4.9 GET /users/:id → data */
export interface PublicUser {
  id: number
  username: string
  nickname: string
  avatarUrl: string | null
  createdAt: string | null
  /** 段位名（按累计 XP） */
  rankName: string
  xpTotal: number
  lessonDone: number
  stampsEarned: number
}

/** 契约 §4.5 GET /profile/summary → data */
export interface ProfileSummary {
  user: { id: number; username: string; nickname: string; avatarUrl: string | null }
  xp: { total: number; week: number; today: number }
  streak: { current: number; max: number; lastCheckinDate: string | null }
  rank: { rankName: string; level: number; weekRank: number | null; weekXp: number }
  stamps: { total: number; earned: number }
  learn: {
    lessonsDone: number
    lessonsTotal: number
    itemsDone: number
    /** 答对 / 总作答；无作答为 0 */
    accuracy: number
  }
  todayCheckedIn: boolean
}

/** 契约 §4.5 GET /profile/calendar → data */
export interface ProfileCalendar {
  /** 近 N 天的日期序列（含没打卡的日子），前端按顺序铺格子 */
  days: string[]
  /** 其中打过卡的日期 */
  checked: string[]
}

export type ReportTargetType = 'user' | 'duel'

export interface ReportPayload {
  targetType: ReportTargetType
  targetId: number
  /** 必填，≤30 字 */
  reason: string
  /** 选填，≤200 字 */
  detail?: string
}

export const userApi = {
  /** 看别人的公开资料（也适用于自己） */
  profile: (id: number | string) => request<PublicUser>({ url: `/users/${id}` }),

  /** 举报。reason 必填 ≤30 字，detail ≤200 字 —— 前端也要卡一遍长度，别等后端报错 */
  report: (data: ReportPayload) => request<{ id: number }>({ url: '/reports', method: 'POST', data }),
}

export const profileApi = {
  /** 「我的」页一次拿全所有数字 */
  summary: () => request<ProfileSummary>({ url: '/profile/summary' }),

  /** 学习日历，默认近 30 天 */
  calendar: (days = 30) => request<ProfileCalendar>({ url: '/profile/calendar', data: { days } }),
}
