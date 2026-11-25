/// <reference types="vite/client" />

declare module '*.vue' {
  import { DefineComponent } from 'vue'
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/ban-types
  const component: DefineComponent<{}, {}, any>
  export default component
}

/**
 * 构建期注入的环境变量（只有 `VITE_` 前缀会被 Vite 注入前端代码）。
 *
 * `VITE_API_ORIGIN`：API / 静态资源 / 分享链接的**绝对源**，只在打包手机 APP 时设。
 * 不设 = 空串 = 同源 `/api`（Web 站点的正常取值）。见 `src/utils/app-base.ts`。
 */
interface ImportMetaEnv {
  readonly VITE_API_ORIGIN?: string
}
