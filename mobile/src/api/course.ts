/**
 * 课程内容 —— 契约 §4.1
 * 归属：**fe-learn**
 *
 * ⚠️ request.ts 已经拆过一层包：`body.code === 0 → resolve(body.data)`。
 *    所以这里的返回类型**就是**契约里 `data` 本身，页面里写 `res.foo`，
 *    绝不能写 `res.data.foo`（那是多剥一层，得到 undefined，页面显示空且不报错）。
 */
import { request } from '../utils/request'

/** 五种题型（契约 §3.1 items.kind） */
export type ItemKind = 'recognize' | 'pinyin' | 'meaning' | 'stroke' | 'listen'

/** 课时进度状态（契约 §4.1） */
export type LessonStatus = 'done' | 'in_progress' | 'none'

/** 契约 §4.1 的 item 对象（camelCase，与后端逐字一致） */
export interface CourseItem {
  id: number
  kind: ItemKind
  /** recognize/pinyin/meaning 是汉字或拼音；stroke 也是那个字；listen 是句子 */
  prompt: string
  promptEn: string | null
  /** 选择题的四个选项；**stroke 题为 null** */
  options: string[] | null
  answer: string
  char: string | null
  audioUrl: string | null
  sort: number
  lessonId: number
  pointKey: string
}

/** 契约 §4.1 GET /units 的数组元素 */
export interface CourseUnit {
  id: number
  key: string
  level: string
  type: string
  title: string
  titleEn: string
  intro: string
  sort: number
  lessonCount: number
  doneCount: number
  itemCount: number
  /** doneCount / lessonCount，无课时为 0 */
  progress: number
}

/** 契约 §4.1 GET /units/:id/lessons 的数组元素 */
export interface LessonBrief {
  id: number
  key: string
  title: string
  titleEn: string
  intro: string
  estMinutes: number
  sort: number
  itemCount: number
  status: LessonStatus
  bestScore: number
  bestTotal: number | null
}

export interface LessonProgress {
  status: LessonStatus
  bestScore: number
  bestTotal: number | null
  attemptsCount: number
}

/** 契约 §4.1 GET /lessons/:id */
export interface LessonDetail {
  id: number
  key: string
  title: string
  titleEn: string
  intro: string
  estMinutes: number
  sort: number
  unit: { id: number; key: string; title: string; level: string; type: string }
  progress: LessonProgress
  items: CourseItem[]
}

/**
 * 防御性归一：契约说 `options` 已经是 JSON.parse 过的数组，
 * 但库里的列是 TEXT。万一后端某条路径忘了 parse（返回字符串），
 * 前端若直接 `.map()` 会抛错整页白 —— 这里兜一下，代价是一个 typeof。
 */
function normItem(raw: any): CourseItem {
  let options = raw?.options
  if (typeof options === 'string') {
    try {
      options = JSON.parse(options)
    } catch {
      options = null
    }
  }
  if (!Array.isArray(options)) options = null
  return {
    id: Number(raw?.id),
    kind: raw?.kind,
    prompt: raw?.prompt ?? '',
    promptEn: raw?.promptEn ?? null,
    options,
    answer: raw?.answer ?? '',
    char: raw?.char ?? null,
    audioUrl: raw?.audioUrl ?? null,
    sort: Number(raw?.sort ?? 0),
    lessonId: Number(raw?.lessonId ?? raw?.lesson_id ?? 0),
    pointKey: raw?.pointKey ?? raw?.point_key ?? '',
  }
}

function normItems(list: any): CourseItem[] {
  return Array.isArray(list) ? list.map(normItem) : []
}

export const courseApi = {
  /** GET /units → 数组（不是分页对象），带进度聚合 */
  units: () => request<CourseUnit[]>({ url: '/units' }),

  /** GET /units/:id/lessons → 该单元的课时 + 当前用户进度 */
  lessons: (unitId: number | string) =>
    request<LessonBrief[]>({ url: `/units/${unitId}/lessons` }),

  /** GET /lessons/:id → 课时详情（含 items） */
  async lesson(id: number | string): Promise<LessonDetail> {
    const d = await request<LessonDetail>({ url: `/lessons/${id}` })
    return { ...d, items: normItems((d as any)?.items) }
  },

  /** GET /lessons/:id/items → 只要题目（按 sort 升序），重练/PK 复用 */
  async items(lessonId: number | string): Promise<CourseItem[]> {
    const list = await request<CourseItem[]>({ url: `/lessons/${lessonId}/items` })
    return normItems(list)
  },
}
