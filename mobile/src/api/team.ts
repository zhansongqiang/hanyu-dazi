/**
 * 学习小组 —— 契约 §4.8
 * 归属：**fe-game**
 *
 * ⚠️ `GET /teams/mine` 未加入时返回 `null`（不是 404，也不是空对象）——
 *    这是「建组 / 加入」表单该出现的信号。前端判 `if (!res) → 显示入口`，
 *    不要判 `res.members.length`，那是 null 上取属性，直接抛错白屏。
 * ⚠️ 一人只能在一个组：已在组里再建组/加入，后端**报错**（code:1），不是静默换组。
 *    页面要按 code:1 的 message 提示，不要乐观地本地改成「加入成功」。
 * ⚠️ 队长退出 = 解散全组，这是有破坏性的操作，前端必须二次确认并说清楚。
 */
import { request } from '../utils/request'

/** 组内成员（按 weekXp 降序，后端排好） */
export interface TeamMember {
  userId: number
  nickname: string
  weekXp: number
  isCaptain: boolean
  isMe: boolean
}

/** 契约 §4.8 GET /teams/mine → data（未加入为 null） */
export interface TeamMine {
  id: number
  name: string
  /** 建组时填的口号，可以为 null（建组时留空） */
  slogan: string | null
  inviteCode: string
  captainId: number
  memberCount: number
  members: TeamMember[]
}

/** 契约 §4.8 DELETE /teams/mine/leave → data */
export interface TeamLeaveResult {
  left: boolean
  /** 队长退出 = true（全组解散）；普通成员退出 = false */
  disbanded: boolean
}

export const teamApi = {
  /** 我的小组；未加入返回 null */
  mine: () => request<TeamMine | null>({ url: '/teams/mine' }),

  /** 建组（发起人自动成为队长）。已经在组里会 code:1 */
  create: (data: { name: string; slogan?: string }) =>
    request<TeamMine>({ url: '/teams', method: 'POST', data }),

  /** 用邀请码加入。码不区分大小写（后端统一转大写比对） */
  join: (inviteCode: string) =>
    request<TeamMine>({ url: '/teams/join', method: 'POST', data: { inviteCode } }),

  /** 退出；队长退出会解散全组 */
  leave: () => request<TeamLeaveResult>({ url: '/teams/mine/leave', method: 'DELETE' }),
}