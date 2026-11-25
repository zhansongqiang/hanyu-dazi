/**
 * 运行形态基址 —— API 基址 / 站点源 / 服务器静态资源，**唯一真源**（编排者所有）
 *
 * 为什么必须集中在一处：这个项目有两种运行形态，而**同一种写法的正确取值正好相反**。
 *
 *   1) **Web 站点**（开发 5173 / 线上 nginx）：前端与后端**同源**，
 *      基址必须是**根相对**的 `/api` —— 端口与域名切换由 Vite proxy 与 nginx 反代各自解决，
 *      源码里不出现域名，本地与线上是同一份产物。
 *
 *   2) **打包成手机 APP**（Capacitor 壳，见 `mobile/capacitor.config.ts`）：
 *      WebView 的源是 `https://localhost`（`server.androidScheme`），
 *      **一切根相对路径都会打到 WebView 自己身上**，后果是三个不同页面上的三种症状：
 *        - `/api/...`     → `https://localhost/api/...`     → 404（看着像后端没起）
 *        - `/audio/x.mp3` → `https://localhost/audio/x.mp3` → 404（听音题放不出声）
 *        - 分享链接        → `https://localhost/#/...`       → 同学点开是死链
 *      所以 APP 形态下这三样都必须有**绝对源**。
 *
 * 切换方式只有一个：**构建期**给 `VITE_API_ORIGIN`（Vite 的 `import.meta.env`，
 * 只有 `VITE_` 前缀会注入前端代码）：
 *   - 不设 → 空串 → 同源 `/api`。**Web 站点构建就是这个分支，行为与打包前逐字一致。**
 *   - 设了 → 例如 `https://hanyu.zj17z.cn` → 绝对源（APP 构建）。
 *
 * ⚠️ 刻意**不做**「用 `location.origin` 猜自己是不是在壳里」这种运行时探测：
 *    壳与浏览器的差别不止在 origin（`https://localhost` 也可能是别的本地服务），
 *    猜错一次就是线上白屏。构建期显式注入没有这个风险，也让产物可核对
 *    （`grep` 产物里的字符串就能证明这次构建注入了哪个源）。
 */

/** 去掉结尾斜杠；`'https://a/'` → `'https://a'`、`''` → `''` */
function trimSlash(s: string): string {
  return s.replace(/\/+$/, '')
}

/** Web 形态下的站点根（`location` 在小程序里不存在，故先判存在） */
const WEB_SITE = typeof location !== 'undefined' ? trimSlash(location.origin + location.pathname) : ''

/** 构建期注入的绝对源（不带结尾斜杠）；Web 站点构建为空串 */
const ORIGIN = trimSlash(String(import.meta.env.VITE_API_ORIGIN ?? '').trim())

/** 后端根地址（**不含** `/api`）。空串 = 同源，是 Web 形态的正常取值 */
export const SERVER_ORIGIN = ORIGIN

/** 请求基址：`utils/request.ts` 唯一使用它 */
export const API_BASE = ORIGIN ? `${ORIGIN}/api` : '/api'

/**
 * 站点根（不带结尾斜杠）—— 用来拼**给别人打开的**绝对链接。
 * Web：`location.origin + location.pathname`（5173 与线上域名都自动对）
 * APP：注入的绝对源（WebView 自己的 origin 是 `https://localhost`，发出去是死链）
 */
export const SITE_ORIGIN = ORIGIN || WEB_SITE

/** hash 路由的分享链接：`/pages/duel/duel?code=X` → `https://站点/#/pages/duel/duel?code=X` */
export function shareUrl(rel: string): string {
  return `${SITE_ORIGIN}/#${rel}`
}

/**
 * 后端返回的**根相对**静态资源（实测：`items.audio_url` 存的是 `/audio/bi.mp3`，
 * 见 `server/content/content.json`）→ 能直接播/加载的地址。
 *
 * Web 形态**原样返回**（与打包前完全一致，不引入任何行为变化）；
 * APP 形态补上绝对源。带协议的（`http:` / `data:` / `blob:`）与空值一律原样返回。
 */
export function absUrl(p: string | null | undefined): string | null {
  if (!p) return p ?? null
  if (/^[a-z][a-z0-9+.-]*:/i.test(p) || p.startsWith('//')) return p
  if (!ORIGIN) return p
  return ORIGIN + (p.startsWith('/') ? p : `/${p}`)
}
