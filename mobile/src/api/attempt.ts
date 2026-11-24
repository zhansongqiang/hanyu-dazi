/**
 * 答题与课时结算 —— 契约 §4.2
 * 归属：**fe-learn**
 *
 * 判对错是**本地即时**做的（内容接口本来就返回 answer，见 §4.1 的「答案字段的取舍」），
 * 但落库那一次提交**仍由后端复判** —— 前端传的是 userAnswer，**不传 isCorrect**，
 * 传了后端也不会信（契约 §4.2 铁律 1）。所以这个文件里没有 isCorrect 参数，是刻意的。
 */
import { request } from '../utils/request'

export interface AttemptBadge {
  code: string
  name: string
}

/** 契约 §4.2 POST /attempts → data */
export interface AttemptResult {
  isCorrect: boolean
  /** 后端复判用的正确答案，回给前端做展示（与本地比对结果应当一致） */
  answer: string
  xpEarned: number
  /** 知识点提示语，来自 items.hint（content 的迁移在加这一列；还没加时为 null） */
  hint: string | null
  /** 该题当前错过了几次（来自 wrong_book 视图） */
  wrongTimes: number
  /** 本次是否解锁印章 */
  badge: AttemptBadge | null
}

/** 契约 §4.2 POST /lessons/:id/finish → data */
export interface FinishResult {
  lessonId: number
  status: 'done' | 'in_progress'
  bestScore: number
  bestTotal: number | null
  /** 本次是不是第一次做完这一课 */
  firstDone: boolean
  xpEarned: number
  checkin: { created: boolean; currentStreak: number; xpEarned: number }
  nextLessonId: number | null
  unitDone: boolean
}

export interface AttemptPayload {
  itemId: number
  userAnswer: string
  durationMs: number
}

export const attemptApi = {
  /** 提交一次作答（后端复判 + 落 attempts / xp_events / lesson_progress） */
  submit: (data: AttemptPayload) =>
    request<AttemptResult>({ url: '/attempts', method: 'POST', data }),

  /** 结算课时：推进度、发 XP、打卡、算 best（按比率比） */
  finish: (
    lessonId: number | string,
    data: { correctCount: number; total: number; durationMs: number }
  ) => request<FinishResult>({ url: `/lessons/${lessonId}/finish`, method: 'POST', data }),
}
