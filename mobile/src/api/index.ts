import { request } from '../utils/request'

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

/** ===== 课程：Day 1 下午接入 units / lessons / items ===== */
export const courseApi = {
  // 占位：Day 2 落地
  // units: () => request<any[]>({ url: '/units' }),
}

/** ===== 错题本：Day 3 接入 wrong_book 视图 ===== */
export const wrongApi = {
  // 占位：Day 3 落地
}
