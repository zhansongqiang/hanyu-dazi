import { authApi } from '../api'
import type { UserInfo } from '../api'

// 必须写 export type：写成 `export { UserInfo }` 会被 esbuild 当成运行时导出，
// 浏览器里报 "does not provide an export named 'UserInfo'"，整个页面组件加载失败。
export type { UserInfo }

/**
 * 登录态：token 与用户信息都存在本地 storage 里，页面直接读，不额外请求。
 * 页面要拿最新的服务端数据时再调 authApi.me()。
 */

export async function login(username: string, password: string) {
  const result = await authApi.login({ username, password })
  uni.setStorageSync('token', result.token)
  uni.setStorageSync('userInfo', result.user)
  return result
}

export async function register(username: string, password: string, nickname?: string) {
  const result = await authApi.register({ username, password, nickname })
  uni.setStorageSync('token', result.token)
  uni.setStorageSync('userInfo', result.user)
  return result
}

export function getToken(): string {
  return uni.getStorageSync('token') || ''
}

export function getUserInfo(): UserInfo | null {
  return uni.getStorageSync('userInfo') || null
}

export function isLoggedIn(): boolean {
  return !!getToken()
}

export function logout() {
  uni.removeStorageSync('token')
  uni.removeStorageSync('userInfo')
}

/** 未登录就跳登录页，返回是否已登录 */
export function requireLogin(): boolean {
  if (isLoggedIn()) return true
  uni.navigateTo({ url: '/pages/login/login' })
  return false
}
