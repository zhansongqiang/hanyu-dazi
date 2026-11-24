/**
 * 每日打卡 —— 契约 §4.6
 * 归属：**fe-game**
 *
 * ⚠️ 打卡是**幂等**的：今天已经打过 → `created:false` 且 `xpEarned:0`，但**不是错误**，
 *    页面照样要把 currentStreak 画出来，不要弹「打卡失败」。
 * ⚠️ 完成课时时后端会**自动**打卡（`POST /lessons/:id/finish` 内部调用），
 *    所以「我的」页看到今天已打卡，可能用户一次都没点过打卡按钮 —— 这是正常的。
 */
import { request } from '../utils/request'

/** 契约 §4.6 POST /checkin → data */
export interface CheckinResult {
  /** 本次是否真的新建了一条记录（false = 今天早打过） */
  created: boolean
  /** 打卡日期 YYYY-MM-DD */
  checkDate: string
  currentStreak: number
  maxStreak: number
  /** 本次获得的 XP；已打过则 0 */
  xpEarned: number
}

/** 契约 §4.6 GET /checkin/status → data（字段由 services/checkin.getStatus 决定） */
export interface CheckinStatus {
  /** 今天是否已打卡（注意字段名是 checkedIn，不是 todayCheckedIn） */
  checkedIn: boolean
  checkDate: string | null
  currentStreak: number
  maxStreak: number
  lastCheckinDate: string | null
}

export const checkinApi = {
  /** 手动打卡（幂等）。带上 lessonId 时后端会校验课时存在 */
  check: (lessonId?: number) =>
    request<CheckinResult>({ url: '/checkin', method: 'POST', data: lessonId ? { lessonId } : {} }),

  status: () => request<CheckinStatus>({ url: '/checkin/status' }),
}