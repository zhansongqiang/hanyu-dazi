/**
 * PK 对战 —— 契约 §4.4
 * 归属：**fe-game**
 *
 * ⚠️ `GET /duels/:code` 与 `POST /duels/:code/submit` 是**游客可访问**（契约标记 G）：
 *    分享链接要能在**未登录**状态打开、答完、拿到成绩。
 *    所以这两个方法**不能**先 requireLogin()，否则分享出去的链接一点就跳登录页，
 *    整条裂变路径就断了（这是 §8 的验收项之一）。
 * ⚠️ 提交时带不带 Authorization 决定后端把成绩写进 challenger_* 还是 opponent_*：
 *    发起人自己点开链接重答 → 带 token → 覆盖自己的分；游客答 → 不带 token → 写对手位。
 *    这个判断**完全在后端**（游客能伪造 body，伪造不了签名），前端只管老实把头带上。
 */
import { request } from '../utils/request'
import type { CourseItem } from './course'

/** 对战状态（过期由后端在读的时候判定，不写库） */
export type DuelStatus = 'open' | 'done' | 'expired'

/** 契约 §4.4 POST /duels → data */
export interface DuelCreated {
  code: string
  lessonId: number
  lessonTitle: string
  expiresAt: string
  /** 形如 /pages/duel/duel?code=4K7Q2M —— 直接拼在小程序码/分享文案里 */
  shareUrl: string
}

/** 契约 §4.4 GET /duels/:code → data */
export interface DuelDetail {
  code: string
  status: DuelStatus
  lessonId: number
  lessonTitle: string
  challengerName: string
  challengerScore: number | null
  challengerMs: number | null
  /** 前端据此判断「我就是发起人」—— 用于「你已答过，再看一遍结果」的分支 */
  challengerId: number
  expiresAt: string | null
  /** 只有 status === 'open' 时才有题目；已结束/已过期一律 null */
  items: CourseItem[] | null
}

/** 契约 §4.4 POST /duels/:code/submit → data */
export interface DuelSubmitResult {
  code: string
  /** 本次提交被记在谁头上 */
  role: 'challenger' | 'opponent'
  challenger: { name: string; score: number | null; ms: number | null }
  opponent: { name: string; score: number | null; ms: number | null }
  /** 双方都答完才算；一方还没答时为 null（前端显示「等对手」） */
  winner: 'challenger' | 'opponent' | 'tie' | null
}

/** 契约 §4.4 GET /duels/recent 的数组元素 */
export interface DuelRecentItem {
  code: string
  lessonTitle: string
  role: 'challenger' | 'opponent'
  status: DuelStatus
  myScore: number | null
  rivalName: string | null
  rivalScore: number | null
  createdAt: string | null
}

export interface DuelSubmitPayload {
  /** 游客没登录，得自报姓名；发起人本人提交时后端会忽略它 */
  name?: string
  score: number
  total: number
  durationMs: number
}

export const duelApi = {
  /** 发起挑战（A）：以某一课为题库生成 6 位码 */
  create: (lessonId: number | string) =>
    request<DuelCreated>({ url: '/duels', method: 'POST', data: { lessonId: Number(lessonId) } }),

  /** 我最近的挑战（A）。⚠️ 路由顺序上它必须排在 /duels/:code 之前，后端已处理 */
  recent: () => request<DuelRecentItem[]>({ url: '/duels/recent' }),

  /** 打开分享链接（**游客可用**） */
  detail: (code: string) =>
    request<DuelDetail>({ url: `/duels/${encodeURIComponent(String(code).trim().toUpperCase())}` }),

  /** 提交成绩（**游客可用**）。带 token 且是发起人本人 → 记在自己名下 */
  submit: (code: string, data: DuelSubmitPayload) =>
    request<DuelSubmitResult>({
      url: `/duels/${encodeURIComponent(String(code).trim().toUpperCase())}/submit`,
      method: 'POST',
      data,
    }),
}
