/**
 * Capacitor 壳配置 —— 把 `uni build` 出来的 H5 产物装进 Android WebView，产出可安装的 APK
 *
 * 为什么走 Capacitor 而不是 uni-app 自己的 app-plus（DCloud 云打包）：
 *   `src/manifest.json` 的 `"appid": ""` 是空的，DCloud 打包要 HBuilderX + DCloud 账号，
 *   本项目两者都没有；Capacitor 只需本地 Android SDK + JDK，且 8.3.4 是本机
 *   （SmartCampus 项目）已实证跑通过的版本，AGP/Gradle 都在本地 gradle 缓存里。
 *
 * ⚠️ 两个环境变量（都只在打 APP 时设，打 Web 站点时**不要设**）：
 *   - `VITE_API_ORIGIN`（Vite 读，见 `src/utils/app-base.ts`）：
 *     WebView 的源是 `https://localhost`，源码里一切根相对路径都会打到壳自己身上。
 *     所以 APP 产物必须把 API/音频/分享链接的绝对源在**构建期**烘进代码。
 *   - `CAP_WEB_DIR`（本文件读）：指向哪份 H5 产物当 webDir。
 *     Web 站点产物在 `dist/build/h5`，APP 产物单独出在 `dist-capp`，
 *     两份互不覆盖 —— 打 APP 绝不能把 Web 站点要部署的那份产物改掉。
 *
 * ⚠️ `webDir` 是 Capacitor 认的字段，`androidDir` **不是**（CLI 会忽略）。
 */
import type { CapacitorConfig } from '@capacitor/cli'

/** 打 APP 时的产物目录；默认值与 Web 站点产物（`dist/build/h5`）分开，避免互相覆盖 */
const webDir = process.env.CAP_WEB_DIR || 'dist-capp'

/** 允许 WebView 在 https 页里发 http 请求 —— 只给「模拟器连本机后端」的验证包用 */
const allowMixedContent = process.env.CAP_ALLOW_MIXED === '1'

const config: CapacitorConfig = {
  appId: 'cn.zj17z.hanyudazi',
  appName: '汉语搭子',
  webDir,
  server: {
    // 默认就是 https；显式写出来是因为它是「http 404 三连」的根因，改动它必须是有意识的
    androidScheme: 'https',
  },
  android: {
    allowMixedContent,
  },
}

export default config
