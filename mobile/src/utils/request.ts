/**
 * 请求封装 —— 注入 token + 解包 { code, data }
 *
 * 基址的**唯一真源是 `utils/app-base.ts`** —— 那个文件头写了为什么
 * Web 形态必须是根相对的 `/api`、而打包成 APP 之后必须是绝对源。
 *
 * ⚠️ 这里原本是两处**同名**的 `const BASE_URL`（`// #ifdef H5` 一处、`// #ifndef H5` 一处）。
 *    条件编译注释是**构建时**才剥的，剥之前源码层面就是重名声明 —— `npx tsc` 报 TS2451，
 *    即 CR-6。改成从 `app-base.ts` import 之后不存在重名，也不再有两份基址各自漂移的可能。
 *    （非 H5 形态原本写死 `http://127.0.0.1:8091` —— 那在真机上必然连不上；
 *      小程序/APP 要跑就给 `VITE_API_ORIGIN` 注入真实源，不要再写死回环地址。）
 */
import { API_BASE } from './app-base'

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
      url: API_BASE + opts.url,
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
