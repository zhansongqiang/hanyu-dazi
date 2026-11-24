import { request } from '../utils/request'

/**
 * 波次 0 冻结 —— **本文件归编排者，四个 agent 都不要改**。
 *
 * 这里**故意不做 barrel 汇总**（不 re-export course/attempt/xp/... ）：
 * 那些文件由不同 agent 在波次 1 各自创建，谁先谁后不确定；
 * 若在本文件里 `import` 了尚未存在的文件，会直接让**别人的**编译挂掉。
 *
 * 各页面请直接 import 自己那摊：
 *   fe-learn → import { courseApi } from '@/api/course'   // 或相对路径 '../api/course'
 *   fe-game  → import { rankApi } from '@/api/xp'
 *
 * 需要往这里加东西 → 写 CONTRACT.md §7 变更请求，波次 2 我统一加。
 */

/** ===== 账号：用户名 + 密码 ===== */
export interface UserInfo {
  id: number
  username: string
  nickname: string
  avatarUrl: string | null
  createdAt?: string | null
}

export const authApi = {
  register: (data: { username: string; password: string; nickname?: string }) =>
    request<{ token: string; user: UserInfo }>({ url: '/auth/register', method: 'POST', data }),
  login: (data: { username: string; password: string }) =>
    request<{ token: string; user: UserInfo }>({ url: '/auth/login', method: 'POST', data }),
  me: () => request<UserInfo>({ url: '/auth/me' }),
}
