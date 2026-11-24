/**
 * 错题本 —— 契约 §4.3
 * 归属：**fe-learn**
 *
 * ⚠️ 视图 `wrong_book` 不含 items 的列，后端已 JOIN 好；前端拿到的就是下面这套字段。
 * ⚠️ 排序由后端定（correct_since ASC, wrong_times DESC, last_wrong_at DESC）——
 *    「快掌握的排前面」。前端**不要重排**，否则用户永远卡在最老的题上。
 */
import { request } from '../utils/request'
import type { ItemKind } from './course'

/** 契约 §4.3 GET /wrongbook 的 list 元素 */
export interface WrongItem {
  itemId: number
  wrongTimes: number
  /** 答错之后又答对了几次；达到 2 即「已掌握」（WRONG_MASTERED_AT） */
  correctSince: number
  lastWrongAt: string | null
  prompt: string
  promptEn: string | null
  kind: ItemKind
  options: string[] | null
  answer: string
  audioUrl: string | null
  char: string | null
  lessonId: number
  lessonTitle: string
  unitTitle: string
  hint: string | null
}

export interface WrongByLesson {
  lessonId: number
  lessonTitle: string
  count: number
}

/** 契约 §4.3 GET /wrongbook → data（是**对象**，不是数组） */
export interface WrongBookPage {
  list: WrongItem[]
  total: number
  byLesson: WrongByLesson[]
}

export interface WrongPracticeResult {
  itemId: number
  isCorrect: boolean
  answer: string
  wrongTimes: number
  correctSince: number
}

/** 契约 §4.3 POST /wrongbook/practice → data */
export interface WrongPracticeResponse {
  results: WrongPracticeResult[]
  /** 本次后 correct_since 达到 2 的题数 */
  cleared: number
  remaining: number
}

export interface WrongPracticePayload {
  itemId: number
  userAnswer: string
  durationMs: number
}

function normOptions(options: any): string[] | null {
  if (Array.isArray(options)) return options
  if (typeof options === 'string') {
    try {
      const v = JSON.parse(options)
      return Array.isArray(v) ? v : null
    } catch {
      return null
    }
  }
  return null
}

export const wrongApi = {
  /** 待复习错题（后端已过滤 correct_since < 2） */
  async list(params: { limit?: number; lessonId?: number | string } = {}): Promise<WrongBookPage> {
    const q: string[] = []
    if (params.limit) q.push(`limit=${params.limit}`)
    if (params.lessonId !== undefined && params.lessonId !== '') {
      q.push(`lessonId=${params.lessonId}`)
    }
    const url = '/wrongbook' + (q.length ? '?' + q.join('&') : '')
    const d = await request<WrongBookPage>({ url })
    const list = Array.isArray(d?.list)
      ? d.list.map((r: any) => ({ ...r, options: normOptions(r?.options) }))
      : []
    return {
      list,
      total: Number(d?.total ?? list.length),
      byLesson: Array.isArray(d?.byLesson) ? d.byLesson : [],
    }
  },

  /** 错题重练，批量提交（后端逐条复用 POST /attempts 的服务函数） */
  practice: (results: WrongPracticePayload[]) =>
    request<WrongPracticeResponse>({
      url: '/wrongbook/practice',
      method: 'POST',
      data: { results },
    }),
}