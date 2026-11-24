/**
 * 描红引擎 —— hanzi-writer 的**本地打包**接入（契约 §8：「不走 CDN」）
 *
 * 归属：**fe-learn**。这是描红相关逻辑的**单一真源**，`stroke.vue` 和 `practice.vue`
 * 都从这里取，不要各写一份。
 *
 * ## 三个刻意的决定
 *
 * 1. **不走 CDN，一个字都不走**：库文件在 `./vendor/hanzi-writer.min.js`（自己托管，靠 Vite
 *    `?url` 拿到产物内地址），字形数据在 `./data/chars.json`，**直接 import 进产物** ——
 *    连 fetch 都没有，所以断网/弱网下描红页的行为和联网时完全一致。
 *    hanzi-writer 默认会去 `cdn.jsdelivr.net` 拉字形，我们靠 `charDataLoader` 把它整个接管掉。
 *
 * 2. **库用 `<script>` 注入而不是 `import`**：`hanzi-writer.min.js` 是 IIFE（结尾是
 *    `var HanziWriter = function(){…}();`），**没有 ESM 导出**。硬 `import` 会拿到
 *    `undefined` 且不报错 —— 那是最难查的一类 bug，所以这里显式注入 + 读 `window`。
 *
 * 3. **加载失败不抛错，返回 null**：契约要求「加载失败降级为静态字形展示」。
 *    调用方拿到 null 就画一个米字格 + 大字 + 「我写好了」，流程不断。
 */
import charsJson from './data/chars.json'
// ⚠️ ?url 是 Vite 特性：拿到的是「产物里的真实地址」，dev 与 build 都成立。
//    （类型来自 src/env.d.ts 里的 /// <reference types="vite/client" />）
import hanziWriterUrl from './vendor/hanzi-writer.min.js?url'

export interface HanziCharData {
  /** 笔画的 SVG path（d 属性） */
  strokes: string[]
  /** 每笔的中线坐标，描红判分就靠这个 */
  medians: number[][][]
}

const CHARS = charsJson as unknown as Record<string, HanziCharData>

/** 这个字有没有本地字形数据 */
export function hasCharData(ch: string): boolean {
  return !!CHARS[ch]
}

/** 取字形数据（同步，内存里就有） */
export function getCharData(ch: string): HanziCharData | null {
  return CHARS[ch] || null
}

/** 本地有多少个字可用（描红页用来提示/调试） */
export function localCharCount(): number {
  return Object.keys(CHARS).length
}

/** ===== 库的加载与缓存 ===== */

type HanziWriterCtor = new (el: any, opts: any) => HanziWriterInstance

interface HanziWriterInstance {
  animateCharacter(opts?: any): Promise<void>
  quiz(opts?: any): void
  cancelQuiz(): void
  /** ⚠️ v3.5.0：字形是**这一步**才加载的，返回的 Promise resolve 之后才画得出来 */
  setCharacter(ch: string): Promise<void>
  showOutline(opts?: any): void
  hideOutline(opts?: any): void
}

let ctorPromise: Promise<HanziWriterCtor | null> | null = null

/**
 * 注入本地 hanzi-writer 并返回构造函数。
 * 失败返回 null（**不 reject**）—— 调用方据此降级，不要 try/catch 满天飞。
 */
export function loadHanziWriter(): Promise<HanziWriterCtor | null> {
  if (ctorPromise) return ctorPromise
  ctorPromise = new Promise<HanziWriterCtor | null>((resolve) => {
    // #ifdef H5
    const w = window as any
    if (w.HanziWriter) return resolve(w.HanziWriter as HanziWriterCtor)
    if (typeof document === 'undefined') return resolve(null)

    const s = document.createElement('script')
    s.src = hanziWriterUrl
    s.async = true
    s.onload = () => resolve(((window as any).HanziWriter as HanziWriterCtor) || null)
    s.onerror = () => {
      // 允许下次重试（例如首次是瞬时网络问题）
      ctorPromise = null
      resolve(null)
    }
    document.head.appendChild(s)
    // #endif
    // #ifndef H5
    // 非 H5（小程序/App）没有 DOM 注入这条路，直接降级为静态字形。
    resolve(null)
    // #endif
  })
  return ctorPromise
}

/** ===== 描红句柄 ===== */

export interface TraceOptions {
  /** 容器内边长（px）；不传则用容器实际宽度 */
  size?: number
  /** 进页面先演示一遍笔顺再进入描红（默认 true） */
  animateOnInit?: boolean
  /** 一题结束（写完所有笔画） */
  onComplete?: (totalMistakes: number) => void
  /** 某一笔写错 */
  onMistake?: (totalMistakes: number) => void
}

export interface TraceHandle {
  /** 重新演示笔顺，演示完自动回到描红 */
  replay(): void
  /** 清空重来 */
  reset(): void
  /** 拆掉（页面卸载时调用，防止 hanzi-writer 留着 rAF 循环） */
  destroy(): void
}

/**
 * 把「模板 ref」变成真正的 DOM 元素。
 *
 * ⚠️ 这层归一不是洁癖，是 H5 的实际情况：uni-app 的 `<view>` 在 H5 下是
 * `<uni-view>` 自定义元素，模板 ref 拿到的可能是**组件实例**（`.$el` 才是元素），
 * 也可能是元素本身（编译器直出 `createVNode('uni-view')` 时）。
 * 两种都见过，所以这里两种都认；传给 hanzi-writer 的必须是元素，否则它
 * `appendChild` 会静默失败、页面只剩一个空框 —— 那种 bug 很难往回查。
 */
function toDomEl(o: any): any {
  if (!o) return null
  if (typeof o === 'object' && o.nodeType === 1) return o
  const e = o.$el
  if (e && e.nodeType === 1) return e
  return null
}

/**
 * 描红配色 —— **运行时从设计令牌取**，不写死。
 *
 * 写死 `#1a1a1d` 在浅色下看着对，但深色模式的底色是 `#121214`（墨底），
 * 字和底几乎同色，描红整个消失 —— 而 App.vue 的令牌是靠
 * `@media (prefers-color-scheme: dark)` 覆盖的，只有读 computed style 才拿得到暗色那份。
 * 取不到（非 H5 / 还没挂载）就退回浅色值，不能因此描不了。
 */
function theme(name: string, fallback: string): string {
  try {
    if (typeof window === 'undefined' || typeof document === 'undefined') return fallback
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
    return v || fallback
  } catch {
    return fallback
  }
}

/**
 * 在 `el` 里创建一个描红区。
 * 返回 null 表示**无法描红**（库没加载出来 / 本地没有这个字的数据）—— 调用方降级为静态字形。
 */
export async function createTrace(
  el: any,
  char: string,
  opts: TraceOptions = {}
): Promise<TraceHandle | null> {
  if (!char) return null
  // 先查数据：本地没这个字，连库都不用加载
  if (!hasCharData(char)) return null

  // ref 可能是元素、可能是组件实例 —— 归一化失败就直接降级，别把怪对象喂给 hanzi-writer
  const dom = toDomEl(el)
  if (!dom) return null

  // 同一个容器要连着描好几个字（一课的描红题、或一页里换字重来）。
  // hanzi-writer 的构造函数只会往里 append 一个新的 <svg>，**不会**清空已有内容 ——
  // 不清就会一层层叠上去，表现为"字越描越黑、笔画对不上"。所以每次创建前先擦干净。
  try {
    dom.innerHTML = ''
  } catch {
    /* 不是元素的话前面已经拦掉了，这里没什么可清 */
  }

  const Ctor = await loadHanziWriter()
  if (!Ctor) return null

  let size = opts.size || 0
  if (!size) {
    // 容器宽度优先（响应式），拿不到再退回 240。
    // 兜底路径存在的原因是 ref 解析到的可能是 `uni-view` 且此刻还没布局完（宽度 0）。
    size =
      (dom.clientWidth as number) ||
      Math.round(dom.getBoundingClientRect?.().width || 0) ||
      240
  }

  let writer: HanziWriterInstance
  // 颜色提到 try 之外：startQuiz() 里也要用（提示高亮）
  const ink = theme('--ink', '#1a1a1d')
  const rule = theme('--rule', '#ded6c6')
  const cinnabar = theme('--cinnabar', '#ae332e')
  const gilt = theme('--gilt', '#8a6614')
  try {
    writer = new Ctor(dom, {
      width: size,
      height: size,
      padding: Math.round(size * 0.06),
      showOutline: true,
      showCharacter: false,
      strokeColor: ink,
      outlineColor: rule,
      highlightColor: cinnabar,
      drawingColor: ink,
      radicalColor: cinnabar,
      strokeAnimationSpeed: 1,
      delayBetweenStrokes: 220,
      // ⛔ 这一行是「不走 CDN」的关键：默认实现会去 jsdelivr 拉字形
      charDataLoader: (c: string, onLoad: (d: any) => void, onError: (e: any) => void) => {
        const d = getCharData(c)
        if (d) onLoad(d)
        else onError(new Error('本地无字形数据：' + c))
      },
    })
  } catch (e) {
    return null
  }

  /*
   * ⛔ **这一行不能省** —— hanzi-writer v3.5.0 的构造签名是 `(element, options)`，
   * 「字」是**分开设**的。库自己的 `static create(el, ch, opts)` 就是
   * `const w = new HanziWriter(el, opts); w.setCharacter(ch); return w`。
   *
   * 只 new、不调 setCharacter 的话：`charDataLoader` **一次都不会被调用**，
   * svg 照样建出来（`<svg><defs></defs></svg>`）但里面**一个 path 都没有**；
   * 而 `quiz()` / `animateCharacter()` 内部有 `this._character && this._renderState`
   * 守卫，守卫为假就**静默什么都不做** —— 不报错、不 console.warn，
   * 用户看到的是「一个空米字格 + 一句『照着淡灰的笔画描一遍』」，截图评审也看不出来。
   *
   * 取证（2026-11-23，5173 dev server，字「日」）：不调 → `paths 0`；
   * 同一容器、同一份 chars.json、同一版本库，只补这一行 → `paths 24`。
   */
  try {
    await writer.setCharacter(char)
  } catch (e) {
    return null // 拿不到字形就交给调用方降级为静态字形，别把空框留给用户
  }

  // 结构性兜底：库的 API 以后再漂移时，上面那条「静默失败」的路会重新出现。
  // 与其相信 Promise，不如**直接问 DOM**：轮廓真画出来了才算成功，否则降级。
  // （`showCharacter:false + showOutline:true` 下次仍有轮廓 path；若哪天两者都关掉，
  //   这里会误判为失败 —— 那时降级为静态字形，也不算错。）
  let drew = false
  for (let i = 0; i < 16 && !drew; i++) {
    if (dom.querySelector?.('svg path')) drew = true
    else await new Promise((r) => setTimeout(r, 50))
  }
  if (!drew) return null

  let destroyed = false

  const startQuiz = () => {
    if (destroyed) return
    writer.quiz({
      showHintAfterMisses: 2, // 连错两笔就让描红格自己提示
      markerSize: Math.max(12, Math.round(size * 0.09)),
      highlightOnComplete: true,
      highlightColor: gilt,
      onMistake: (data: any) => opts.onMistake?.(data?.totalMistakes ?? 0),
      onComplete: (data: any) => opts.onComplete?.(data?.totalMistakes ?? 0),
    })
  }

  const replay = () => {
    if (destroyed) return
    try {
      writer.cancelQuiz()
      const p = writer.animateCharacter()
      if (p && typeof p.then === 'function') p.then(() => startQuiz())
      else startQuiz()
    } catch {
      startQuiz()
    }
  }

  if (opts.animateOnInit === false) {
    startQuiz()
  } else {
    replay()
  }

  return {
    replay,
    reset() {
      if (destroyed) return
      try {
        writer.cancelQuiz()
      } catch {
        /* 已经结束了 */
      }
      startQuiz()
    },
    destroy() {
      destroyed = true
      try {
        writer.cancelQuiz()
      } catch {
        /* 忽略 */
      }
    },
  }
}
