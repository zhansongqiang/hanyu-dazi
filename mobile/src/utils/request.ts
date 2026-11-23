/**
 * 请求封装 —— 注入 token + 解包 { code, data }
 *
 * baseURL 说明：
 *  - H5（开发与线上都走这条）：/api，由 Vite dev server 或 nginx 反代到后端，
 *    前端代码里不出现端口号，本地与线上是同一份产物。
 *  - 非 H5（小程序 / App）：直连后端端口，需要时再改。
 */
// #ifdef H5
const BASE_URL = '/api'
// #endif
// #ifndef H5
const BASE_URL = 'http://127.0.0.1:8091/api'
// #endif

interface ReqOpts {
  url: string
  method?: UniApp.RequestOptions['method']
  data?: any
  header?: Record<string, string>
}

export function request<T = any>(opts: ReqOpts): Promise<T> {
  const token = uni.getStorageSync('token')
  return new Promise((resolve, reject) => {
    uni.request({
      url: BASE_URL + opts.url,
      method: opts.method || 'GET',
      data: opts.data,
      header: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: 'Bearer ' + token } : {}),
        ...(opts.header || {}),
      },
      success: (res: any) => {
        const body = res.data
        if (body && body.code === 0) {
          resolve(body.data as T)
        } else {
          // 登录失效看 HTTP 状态码 401（后端 body.code 一律是 1，401 只在状态行上）
          if (res.statusCode === 401) {
            uni.removeStorageSync('token')
            uni.removeStorageSync('userInfo')
          }
          uni.showToast({ title: (body && body.message) || '请求失败', icon: 'none' })
          reject(body)
        }
      },
      fail: (err) => {
        uni.showToast({ title: '网络错误', icon: 'none' })
        reject(err)
      },
    })
  })
}
