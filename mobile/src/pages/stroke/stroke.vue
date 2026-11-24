<template>
  <view class="hd-page stroke">
    <!-- ============ 顶栏 ============ -->
    <view class="top">
      <view class="top-quit" @tap="quit">
        <text class="top-quit-x">✕</text>
      </view>
      <view class="top-mid">
        <text class="top-title">{{ headTitle }}</text>
        <text v-if="headSub" class="top-sub">{{ headSub }}</text>
      </view>
      <text v-if="phase === 'ready'" class="top-count">{{ idx + 1 }}/{{ total }}</text>
      <text v-else class="top-count">—</text>
    </view>

    <view v-if="phase === 'ready'" class="bar">
      <view class="bar-fill" :style="{ width: pct + '%' }"></view>
    </view>

    <!-- ============ 未登录 ============ -->
    <view v-if="needLogin" class="hd-card state">
      <text class="state-title hd-title">先登录</text>
      <text class="hd-note state-note">描红的成绩也要记到账号上，登录一下就开始。</text>
      <view class="state-btn" @tap="goLogin">去登录</view>
    </view>

    <!-- ============ 载入中 ============ -->
    <view v-else-if="phase === 'loading'" class="hd-card state">
      <text class="hd-note state-note">正在取字…</text>
    </view>

    <!-- ============ 取题失败 ============ -->
    <view v-else-if="phase === 'error'" class="hd-card state">
      <text class="state-title hd-title">没取回来</text>
      <text class="hd-note state-note">{{ loadError }}</text>
      <view class="state-btn" @tap="load">重试</view>
    </view>

    <!-- ============ 这一课没有描红题 ============ -->
    <view v-else-if="phase === 'empty'" class="hd-card state">
      <text class="state-title hd-title">这一课没有要描的字</text>
      <text class="hd-note state-note">
        描红只出现在有生字的课时里。这一课是词语和对话，回课时做完整练习更合适。
      </text>
      <view class="state-btn" @tap="goPractice">去做这一课的练习</view>
    </view>

    <!-- ============ 小结 ============ -->
    <view v-else-if="phase === 'done'" class="sum">
      <view class="hd-card sum-top">
        <view class="sum-score">
          <text class="sum-num hd-title">{{ okCount }}</text>
          <text class="sum-den">/ {{ total }}</text>
        </view>
        <text class="sum-word hd-title">{{ okCount === total ? '笔下很稳' : '再写一遍会更好' }}</text>
        <text class="hd-note sum-sub">{{ sumSub }}</text>

        <view class="sum-chars">
          <text
            v-for="(r, i) in results"
            :key="i"
            class="sum-char"
            :class="{ 'is-no': !r.ok }"
          >{{ r.char }}</text>
        </view>

        <text v-if="syncNote" class="hd-note sum-note">{{ syncNote }}</text>
      </view>

      <view class="sum-acts">
        <view class="act-main" @tap="restart">再描一遍</view>
        <view class="act-ghost" @tap="goPractice">回课时做完整练习</view>
      </view>
    </view>

    <!-- ============ 描红 ============ -->
    <view v-else class="twrap">
      <view class="hd-card frame">
        <view
          v-show="!traceFailed && !answered"
          ref="traceEl"
          class="trace-box"
          :style="{ width: traceSize + 'px', height: traceSize + 'px' }"
        ></view>

        <view v-if="traceFailed" class="trace-static" :style="{ width: traceSize + 'px', height: traceSize + 'px' }">
          <text class="trace-char hd-title">{{ curChar }}</text>
        </view>

        <text v-if="!answered" class="hd-note tip">{{ tip }}</text>
      </view>

      <!-- 这一课有字缺本地字形时，先把话说在前面：不然"有的字能描有的不能"像坏了 -->
      <text v-if="willDegrade && !answered && !traceFailed" class="deg-note">
        这一课有 {{ willDegrade }} 个字暂时没有笔顺演示，跟着淡灰的字写就行。
      </text>

      <view v-if="!answered" class="acts">
        <view v-if="traceFailed" class="btn main" @tap="answer(true)">我写好了</view>
        <view v-else class="btn" @tap="replay">看一遍笔顺</view>
        <view class="btn ghost" @tap="giveUp">写不出来</view>
      </view>

      <view v-else class="hd-card fb" :class="lastOk ? 'fb-ok' : 'fb-no'">
        <view class="fb-head">
          <text class="fb-mark">{{ lastOk ? '对' : '错' }}</text>
          <text class="fb-word hd-title">{{ lastOk ? '这一笔不错' : '这个字还要再练' }}</text>
        </view>
        <text class="hd-note fb-text">
          {{ lastOk ? '笔顺和方向都对上了。' : '错了两笔以上，这个字会进错题本，回头再练。' }}
        </text>
        <view class="next" @tap="next">
          <text class="next-text">{{ isLast ? '看小结' : '下一个字' }}</text>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
/**
 * 笔画描红页 —— 契约 §4.1（kind='stroke'）§8
 * 归属：**fe-learn**
 *
 * 入参：`?lessonId=3`（缺省 1）。取这一课里 `kind === 'stroke'` 的题，**逐字**描。
 *
 * ## 三个刻意的决定
 *
 * 1. **不调 `POST /lessons/:id/finish`**。这一页只做了课时里的描红题（通常 3~5 道），
 *    完整的一课还包含认读/拼音/语义/听音。拿 5 道题去结算会把整课判成「完成」，
 *    那是**假进度**。所以这里只逐字 `POST /attempts`，结尾明确提示回课时做完整练习。
 *
 * 2. **判对错在本地：错 0~1 笔算对**。hanzi-writer 的 quiz 回调给 `totalMistakes`。
 *    判对提交 `char`（= items.answer），判错提交**空串** —— 后端 `norm('')` 必然判错，
 *    于是诚实进错题本。绝不把「写不出来」报成对。
 *
 * 3. **库/字形加载失败就降级**，不是报错页：交给 `hanzi.ts` 返回 null，这里换成
 *    米字格 + 大字 + 「我写好了」。iPad 上照样能跟着写，流程不断。
 */
import { ref, computed, nextTick, onUnmounted } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { courseApi } from '../../api/course'
import type { CourseItem } from '../../api/course'
import { attemptApi } from '../../api/attempt'
import { isLoggedIn } from '../../utils/auth'
import { createTrace, hasCharData } from './hanzi'
import type { TraceHandle } from './hanzi'

type Phase = 'loading' | 'error' | 'empty' | 'ready' | 'done'

const phase = ref<Phase>('loading')
const needLogin = ref(false)
const loadError = ref('')

const lessonId = ref(1)
const headTitle = ref('笔画描红')
const headSub = ref('')

/** 这一课要描的字（按 sort 升序，后端已排好） */
const chars = ref<Array<{ itemId: number; char: string }>>([])
const idx = ref(0)

const answered = ref(false)
const lastOk = ref(false)
const results = ref<Array<{ char: string; ok: boolean }>>([])
const okCount = ref(0)
const localOnly = ref(false)
const syncNote = ref('')

const traceEl = ref<any>(null)
const traceFailed = ref(false)
/** 这一课里有几个字本地没字形、会降级成静态米字格 */
const willDegrade = ref(0)
let traceHandle: TraceHandle | null = null
let qStart = 0

/**
 * 格子边长：屏宽的 72%，上限 336。
 * ⚠️ 不读容器宽度 —— 首帧容器还没布局，`clientWidth` 是 0，hanzi-writer 会画出一个
 * 0 尺寸的 svg（页面看着就是"什么都没出来"）。宁可自己按屏宽算。
 */
const traceSize = (() => {
  let w = 375
  try {
    w = Number(uni.getSystemInfoSync()?.windowWidth) || 375
  } catch {
    /* 拿不到就用 375 */
  }
  return Math.min(336, Math.floor(w * 0.72))
})()

const total = computed(() => chars.value.length)
const curChar = computed(() => chars.value[idx.value]?.char || '')
const isLast = computed(() => idx.value + 1 >= total.value)
const pct = computed(() => (total.value ? Math.round(((idx.value + (answered.value ? 1 : 0)) / total.value) * 100) : 0))

const tip = computed(() => {
  if (traceFailed.value) {
    // 不写「这台设备画不了」—— 真实原因几乎总是**本地没有这个字的字形数据**
    // （chars.json 是手工落盘的子集），跟设备没关系。说清楚要做什么就够了。
    return '这个字暂时没有笔顺演示，照着淡灰的字写一遍，再点「我写好了」。'
  }
  return `照着淡灰的笔画，把「${curChar.value}」描一遍`
})

const sumSub = computed(() => {
  const bad = total.value - okCount.value
  if (bad === 0) return '每个字都描对了。'
  return `有 ${bad} 个字要再看一眼，它们已经进错题本了。`
})

/* ============================ 载入 ============================ */

async function load() {
  if (!isLoggedIn()) {
    needLogin.value = true
    phase.value = 'loading'
    return
  }
  needLogin.value = false
  phase.value = 'loading'
  loadError.value = ''
  idx.value = 0
  answered.value = false
  lastOk.value = false
  results.value = []
  okCount.value = 0
  localOnly.value = false
  syncNote.value = ''
  destroyTrace()

  let items: CourseItem[] = []
  try {
    const d = await courseApi.lesson(lessonId.value)
    headTitle.value = d.title || '笔画描红'
    headSub.value = d.unit?.title || ''
    items = d.items || []
  } catch (e: any) {
    chars.value = []
    loadError.value = e?.message || '题目没取回来，检查一下网络'
    phase.value = 'error'
    return
  }

  chars.value = items
    .filter((it) => it.kind === 'stroke')
    .map((it) => ({ itemId: it.id, char: (it.char || it.answer || it.prompt || '').trim() }))
    .filter((it) => !!it.char)

  if (!chars.value.length) {
    phase.value = 'empty'
    return
  }

  // 本地字形是一份**手工落盘的字表**（`./data/chars.json`，目前 28 字 = 库内全部 stroke 题的字符集合），不是全字库。
  // 这一课里凡是本地没有的字都会走降级分支，所以这里提前算清楚：既给用户一句解释
  // （不然"有的字能描有的不能"看着像坏了），也让控制台能一眼回答"这个字为什么描不了"。
  const missing = chars.value.filter((c) => !hasCharData(c.char))
  willDegrade.value = missing.length
  if (missing.length && typeof console !== 'undefined') {
    console.warn(
      `[stroke] 第 ${lessonId.value} 课 ${missing.length}/${chars.value.length} 个字无本地字形，降级为静态米字格：${missing
        .map((c) => c.char)
        .join(' ')}`
    )
  }
  phase.value = 'ready'
  resetForChar()
}

function resetForChar() {
  answered.value = false
  traceFailed.value = false
  destroyTrace()
  qStart = Date.now()
  void mount()
}

async function mount() {
  await nextTick()
  const ch = curChar.value
  if (!ch) {
    traceFailed.value = true
    return
  }
  const h = await createTrace(traceEl.value, ch, {
    size: traceSize,
    animateOnInit: true,
    onMistake: (n) => {
      if (n === 1) uni.showToast({ title: '跟着淡灰的笔画走', icon: 'none', duration: 1200 })
    },
    onComplete: (mistakes) => {
      if (answered.value) return
      answer(mistakes <= 1)
    },
  })
  if (!h) {
    traceFailed.value = true
    return
  }
  traceHandle = h
}

function replay() {
  traceHandle?.replay()
}

function destroyTrace() {
  if (traceHandle) {
    traceHandle.destroy()
    traceHandle = null
  }
}

/* ============================ 作答 ============================ */

function answer(ok: boolean) {
  if (answered.value) return
  answered.value = true
  destroyTrace()
  lastOk.value = ok
  const ch = curChar.value
  results.value.push({ char: ch, ok })
  if (ok) okCount.value += 1

  const dur = Math.max(0, Math.min(Math.round(Date.now() - qStart), 3600_000))
  const itemId = chars.value[idx.value]?.itemId
  if (!itemId) return
  if (localOnly.value) return
  // 判对提交这个字，判错提交空串（后端必然判错）—— 见文件头注释 2
  void sync(itemId, ok ? ch : '', dur)
}

async function sync(itemId: number, userAnswer: string, durationMs: number) {
  try {
    await attemptApi.submit({ itemId, userAnswer, durationMs })
  } catch {
    localOnly.value = true
    syncNote.value = '有几个字没能提交上去，这次的记录不完整 —— 网络好了再描一遍。'
  }
}

/** 「写不出来」：诚实记错，不提交任何答案（空串） */
function giveUp() {
  answer(false)
}

function next() {
  if (!answered.value) return
  if (isLast.value) {
    phase.value = 'done'
    destroyTrace()
    return
  }
  idx.value += 1
  resetForChar()
}

/* ============================ 导航 ============================ */

function back() {
  uni.navigateBack({
    fail: () => {
      uni.switchTab({ url: '/pages/learn/learn' })
    },
  })
}

function quit() {
  if (phase.value === 'ready' && idx.value > 0) {
    uni.showModal({
      title: '先不描了？',
      content: '还没描完，这一轮的记录不会完整。',
      confirmText: '退出',
      cancelText: '继续描',
      success: (r: any) => {
        if (r.confirm) back()
      },
    })
    return
  }
  back()
}

function goLogin() {
  uni.navigateTo({ url: '/pages/login/login' })
}

function goPractice() {
  // 描红只是课时的一部分，完整练习在答题页
  uni.redirectTo({ url: `/pages/practice/practice?lessonId=${lessonId.value}` })
}

function restart() {
  void load()
}

/* ============================ 入口 ============================ */

onLoad((query: any) => {
  const n = Number(query?.lessonId)
  lessonId.value = Number.isFinite(n) && n > 0 ? Math.trunc(n) : 1
  void load()
})

onUnmounted(() => {
  destroyTrace()
})
</script>

<style scoped>
.top {
  display: flex;
  align-items: center;
  padding: 24rpx 8rpx 12rpx;
}
.top-quit {
  width: 64rpx;
  height: 64rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}
.top-quit-x {
  font-size: 34rpx;
  color: var(--muted);
}
.top-mid {
  flex: 1;
  min-width: 0;
  padding: 0 12rpx;
}
.top-title {
  display: block;
  font-family: var(--serif);
  font-size: 36rpx;
  color: var(--ink);
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.top-sub {
  display: block;
  margin-top: 4rpx;
  font-size: 24rpx;
  color: var(--muted);
}
.top-count {
  font-family: var(--serif);
  font-size: 28rpx;
  color: var(--muted);
  flex-shrink: 0;
}

.bar {
  height: 6rpx;
  background: var(--wash);
  border-radius: 6rpx;
  overflow: hidden;
  margin-bottom: 32rpx;
}
.bar-fill {
  height: 100%;
  background: var(--cinnabar);
  border-radius: 6rpx;
  transition: width 0.25s ease;
}

.state {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  padding: 48rpx 36rpx;
}
.state-title {
  display: block;
  font-size: 36rpx;
  letter-spacing: 0.08em;
}
.state-note {
  display: block;
  margin-top: 18rpx;
  line-height: 1.6;
}
.state-btn {
  display: inline-block;
  margin-top: 32rpx;
  padding: 16rpx 40rpx;
  font-size: 27rpx;
  letter-spacing: 0.1em;
  color: var(--cinnabar);
  border: 2rpx solid var(--cinnabar);
  border-radius: 10rpx;
}

/* ===== 描红 ===== */
.twrap {
  display: flex;
  flex-direction: column;
  align-items: center;
}
.frame {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 32rpx;
}
.trace-box,
.trace-static {
  background: var(--paper);
  border-radius: 12rpx;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}
/* 米字格：四条辅助线用渐变画，不引图片、不进构建产物 */
.trace-static {
  background-image: linear-gradient(to top right, transparent 49.6%, var(--rule) 49.6%, var(--rule) 50.4%, transparent 50.4%),
    linear-gradient(to bottom right, transparent 49.6%, var(--rule) 49.6%, var(--rule) 50.4%, transparent 50.4%),
    linear-gradient(to right, transparent 49.7%, var(--rule) 49.7%, var(--rule) 50.3%, transparent 50.3%),
    linear-gradient(to bottom, transparent 49.7%, var(--rule) 49.7%, var(--rule) 50.3%, transparent 50.3%);
}
.trace-char {
  font-size: 220rpx;
  color: var(--ink);
  opacity: 0.28;
}
.tip {
  display: block;
  margin-top: 24rpx;
  text-align: center;
  line-height: 1.6;
}

/* 降级预告：比 tip 更轻，位置在卡片外 */
.deg-note {
  display: block;
  margin-top: 20rpx;
  text-align: center;
  font-size: 22rpx;
  line-height: 1.6;
  color: var(--muted);
}

.acts {
  margin-top: 32rpx;
  display: flex;
  flex-direction: row;
  justify-content: center;
}
.btn {
  padding: 18rpx 40rpx;
  margin: 0 12rpx;
  border-radius: 40rpx;
  border: 2rpx solid var(--rule);
  font-size: 28rpx;
  color: var(--ink);
}
.btn.main {
  background: var(--cinnabar);
  border-color: var(--cinnabar);
  color: #fff;
}
.btn.ghost {
  color: var(--muted);
}

/* ===== 反馈 ===== */
.fb {
  margin-top: 32rpx;
  width: 100%;
  box-sizing: border-box;
}
.fb-ok {
  border-color: var(--gilt);
}
.fb-no {
  border-color: var(--cinnabar);
}
.fb-head {
  display: flex;
  align-items: center;
}
.fb-mark {
  width: 48rpx;
  height: 48rpx;
  line-height: 48rpx;
  text-align: center;
  border-radius: 8rpx;
  font-size: 28rpx;
  color: #fff;
  margin-right: 16rpx;
}
.fb-ok .fb-mark {
  background: var(--gilt);
}
.fb-no .fb-mark {
  background: var(--cinnabar);
}
.fb-word {
  font-size: 36rpx;
}
.fb-text {
  display: block;
  margin-top: 16rpx;
  line-height: 1.6;
}
.next {
  margin-top: 28rpx;
  padding: 26rpx;
  border-radius: 44rpx;
  background: var(--ink);
  text-align: center;
}
.next-text {
  color: var(--paper);
  font-family: var(--serif);
  font-size: 32rpx;
  letter-spacing: 4rpx;
}

/* ===== 小结 ===== */
.sum-top {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 56rpx 36rpx 40rpx;
}
.sum-score {
  display: flex;
  align-items: baseline;
}
.sum-num {
  font-size: 112rpx;
  line-height: 1;
  color: var(--cinnabar);
}
.sum-den {
  margin-left: 12rpx;
  font-size: 36rpx;
  color: var(--muted);
}
.sum-word {
  margin-top: 20rpx;
  font-size: 44rpx;
}
.sum-sub {
  display: block;
  margin-top: 12rpx;
  text-align: center;
}
.sum-chars {
  margin-top: 32rpx;
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  justify-content: center;
}
.sum-char {
  font-family: var(--serif);
  font-size: 48rpx;
  color: var(--ink);
  margin: 12rpx 18rpx;
}
.sum-char.is-no {
  color: var(--cinnabar);
  text-decoration: line-through;
}
.sum-note {
  display: block;
  margin-top: 24rpx;
  text-align: center;
  line-height: 1.6;
}
.sum-acts {
  margin-top: 40rpx;
  display: flex;
  flex-direction: column;
}
.act-main {
  padding: 30rpx;
  border-radius: 48rpx;
  background: var(--cinnabar);
  color: #fff;
  text-align: center;
  font-family: var(--serif);
  font-size: 34rpx;
  letter-spacing: 4rpx;
  margin-bottom: 20rpx;
}
.act-ghost {
  padding: 26rpx;
  text-align: center;
  font-size: 30rpx;
  color: var(--muted);
}
</style>
