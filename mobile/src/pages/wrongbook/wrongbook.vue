<template>
  <view class="hd-page wrongbook">
    <view class="head">
      <text class="head-title hd-title">错题本</text>
      <text class="head-sub">做错的知识点会自己进来重复练</text>
    </view>

    <view class="hd-rule">
      <view class="line"></view>
      <text class="glyph">错</text>
      <view class="line"></view>
    </view>

    <!-- ============ 未登录 ============ -->
    <view v-if="!logged" class="hd-card state">
      <text class="state-title hd-title">先登录</text>
      <text class="hd-note state-note">错题本按账号存：换手机、换浏览器都还在。</text>
      <view class="state-btn" @tap="goLogin">去登录</view>
    </view>

    <!-- ============ 载入中 ============ -->
    <view v-else-if="loading" class="hd-card state">
      <text class="hd-note state-note">正在翻本子…</text>
    </view>

    <!-- ============ 载入失败 ============ -->
    <view v-else-if="loadError" class="hd-card state">
      <text class="state-title hd-title">没翻出来</text>
      <text class="hd-note state-note">{{ loadError }}</text>
      <view class="state-btn" @tap="refresh">重试</view>
    </view>

    <!-- ============ 空态 ============ -->
    <view v-else-if="total === 0" class="hd-card state">
      <text class="state-title hd-title">还没有错题</text>
      <text class="hd-note state-note">
        答错一次就会收进来 —— 不挑不拣。
        连着做对两次，它自己就移出去了。
      </text>
      <view class="state-btn" @tap="goLearn">去练一练</view>
    </view>

    <!-- ============ 有数据 ============ -->
    <view v-else>
      <view class="sum-line">
        <text class="sum-main hd-title">共 {{ total }} 道待复习</text>
        <text class="sum-side">{{ sumSide }}</text>
      </view>

      <!-- 归纳：这批错题偏在哪一类。数据来自**屏幕上这张列表**，
           total > list.length 时句子自带「从列的这几道看」，不冒充全集的结论 -->
      <view v-if="kindStats.length" class="sum-why">
        <text class="sum-why-text">{{ sumWhy }}</text>
        <text class="sum-kinds hd-note">{{ kindBar }}</text>
        <text v-if="advice" class="sum-advice hd-note">{{ advice }}</text>
      </view>

      <!-- 课时筛选：选项来自**未筛选**的一次查询的 byLesson，
           切到某一课后不会因为结果只剩一课而把标签吃掉 -->
      <!-- ⚠️ OB-1：这里刻意**不用** <scroll-view scroll-x>（2026-11-24 改）。
           uni-app H5 的 ScrollView 在 onActivated 里直接写 `main.value.scrollLeft`
           （node_modules/@dcloudio/uni-h5/dist/uni-h5.es.js:14594），**不判空**；
           本页被 Layout 的 <KeepAlive> 保活，激活时那层 div 的模板 ref 恰好是 null
           ⇒ 每次进/出本页都抛
             "TypeError: Cannot set properties of null (setting 'scrollLeft')"
             （Vue warn: Unhandled error during execution of activated hook at <ScrollView> at <Wrongbook>）。
           纯 CSS 版行为一致（横向可滚、不换行），且没有这个问题。
           注意**不要**加 -webkit-overflow-scrolling（见 plan 的 iOS 清单：它会建堆叠上下文）。 -->
      <view class="chips">
        <view class="chip" :class="{ 'is-on': filterLesson === 0 }" @tap="pickLesson(0)">全部</view>
        <view
          v-for="g in allByLesson"
          :key="g.lessonId"
          class="chip"
          :class="{ 'is-on': filterLesson === g.lessonId }"
          @tap="pickLesson(g.lessonId)"
        >{{ g.lessonTitle || '第 ' + g.lessonId + ' 课' }} · {{ g.count }}</view>
      </view>

      <!-- 题目卡片 -->
      <view v-for="(it, i) in list" :key="it.itemId" class="hd-card item">
        <view class="item-top">
          <text class="item-no">{{ i + 1 }}</text>
          <text class="item-kind">{{ kindLabel(it.kind) }}</text>
          <text class="item-lesson">{{ it.lessonTitle || '' }}</text>
        </view>

        <view class="item-stem">
          <!-- 描红题没有题干文字，它的"题目"就是这个字 -->
          <text v-if="it.kind === 'stroke'" class="stem-char hd-title">{{ it.char || it.answer }}</text>
          <!-- 字体按内容判、不按题型判：认读题的答案是拼音，拼音题的题干是拼音，
               一律套 serif 会拿宋体去排拉丁字母，很丑 -->
          <text v-else class="stem" :class="{ 'is-latin': !isHanzi(it.prompt) }">{{ it.prompt }}</text>
        </view>

        <text v-if="it.promptEn" class="item-en">{{ it.promptEn }}</text>

        <view v-if="it.audioUrl" class="item-play" @tap="play(it.audioUrl)">
          <text class="item-play-icon">▶</text>
          <text class="item-play-text">再听一遍</text>
        </view>

        <view class="item-foot">
          <view class="dots">
            <text class="dots-label">连对</text>
            <view class="dot" :class="{ 'is-on': it.correctSince >= 1 }"></view>
            <view class="dot" :class="{ 'is-on': it.correctSince >= 2 }"></view>
            <text class="dots-num">{{ it.correctSince }}/2</text>
          </view>
          <text class="item-times">错过 {{ it.wrongTimes }} 次</text>
        </view>

        <!-- 答案默认收起：先自己回想，再对答案 -->
        <view v-if="openId === it.itemId" class="reveal">
          <text v-if="it.hint" class="reveal-hint">提示：{{ it.hint }}</text>
          <view class="reveal-answer">
            <text class="reveal-answer-label">答案：</text>
            <text class="reveal-answer-val" :class="{ 'is-latin': !isHanzi(it.answer) }">{{ it.answer }}</text>
          </view>
        </view>
        <text v-else class="reveal-toggle" @tap="openId = it.itemId">想不出来 · 看提示和答案</text>
      </view>

      <text v-if="filtered && list.length < total" class="hd-note more">
        只列了前 {{ list.length }} 道，重练时会全部过一遍。
      </text>

      <view class="go" @tap="startPractice">
        <text class="go-text">{{ filterLesson ? '重练这一课' : '全部重练' }}</text>
      </view>

      <view class="hd-rule">
        <view class="line"></view>
        <text class="glyph">记</text>
        <view class="line"></view>
      </view>

      <text class="hd-note tail">连着做对两次，这道题就自动移出错题本。</text>
    </view>
  </view>
</template>

<script setup lang="ts">
/**
 * 错题本 —— 契约 §4.3 / §8
 * 归属：**fe-learn**
 *
 * ## 三个刻意的决定
 *
 * 1. **筛选标签的数据源与列表数据源分开**。`byLesson`（每个课时有几道）取自
 *    **不带 lessonId 的那次查询**，选中某一课后再去查时**不覆盖它** ——
 *    否则点进「三点水」之后标签就只剩「三点水」一条，退回「全部」还得靠猜。
 *    这与全局规范「筛选维度是元数据，业务数据是查询结果」是同一条道理。
 *
 * 2. **`onShow` 驱动刷新**。重练是 `navigateTo` 过去的，回来时页面没被销毁；
 *    只写 `onLoad` 的话，刚清掉两道题回来还看着旧的。`onShow` 每次都重新取。
 *
 * 3. **答案默认收起**。错题本的价值是"再想一遍"，进来就把答案摊开等于给答案抄。
 *    点一下才展开提示 + 答案，成本只有一次点击。
 */
import { ref, computed, onUnmounted } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { isLoggedIn } from '../../utils/auth'
// 错题里的 audioUrl 同样是根相对路径 `/audio/<key>.mp3` —— 打包成 APP 后必须补绝对源，
// 否则 `https://localhost/audio/...` 404，听音题一律放不出声。见 utils/app-base.ts
import { absUrl } from '../../utils/app-base'
import { wrongApi } from '../../api/wrong'
import type { WrongByLesson, WrongItem } from '../../api/wrong'

const logged = ref(false)
const loading = ref(false)
const loadError = ref('')

const list = ref<WrongItem[]>([])
const total = ref(0)
/** 全集口径的「按课时」统计：只从**未筛选**的查询里更新，筛选时不覆盖 */
const allByLesson = ref<WrongByLesson[]>([])

/** 0 = 全部 */
const filterLesson = ref(0)
/** 当前列表是不是筛选后的结果（图上"只列了前 N 道"的文案要用） */
const filtered = computed(() => filterLesson.value > 0)
const openId = ref(0)

const sumSide = computed(() => {
  if (filterLesson.value) return '只算这一课'
  const n = allByLesson.value.length
  return n ? `涉及 ${n} 个课时` : ''
})

/**
 * 有没有汉字 —— 用来决定用衬线还是无衬线。
 * 错题本里同一个位置可能是汉字（认读题的题干）也可能是拼音（拼音题的题干、认读题的答案），
 * 按题型硬判会漏，按内容判才对。
 */
function isHanzi(s: string | null | undefined): boolean {
  return /[一-鿿]/.test(String(s || ''))
}

function kindLabel(k: string): string {
  switch (k) {
    case 'pinyin':
      return '拼音'
    case 'meaning':
      return '语义'
    case 'listen':
      return '听音'
    case 'stroke':
      return '描红'
    default:
      return '认读'
  }
}

/* ===== 归纳：这几道错题偏在哪一类 =====
 *
 * 口径：统计的是**屏幕上这张 list**，不是全库。
 * 屏幕上只是本子的一部分时（total > list.length），归纳句前面必须带「从列的这几道看」——
 * 抽样得出的结论不能说成全集的结论。这与下面 `.more` 那行「只列了前 N 道」是同一条口径。
 *
 * 排序按条数降序，同数按标签定序（不用 localeCompare：不同 webview 的 Intl 数据未必一致，
 * 只要结果是确定的就行，谁先谁后无所谓）。
 */
const kindStats = computed(() => {
  const m = new Map<string, number>()
  for (const it of list.value) {
    const k = String(it.kind || 'recognize')
    m.set(k, (m.get(k) ?? 0) + 1)
  }
  return [...m.entries()]
    .map(([kind, count]) => ({ kind, label: kindLabel(kind), count }))
    .sort((a, b) => b.count - a.count || (a.label < b.label ? -1 : a.label > b.label ? 1 : 0))
})

/** 分布一行：拼音 3 · 听音 2 · 认读 1 */
const kindBar = computed(() => kindStats.value.map((s) => `${s.label} ${s.count}`).join(' · '))

const sumWhy = computed(() => {
  const s = kindStats.value
  if (!s.length) return ''
  const scope = total.value > list.value.length ? '从列的这几道看，' : ''
  const top = s[0]
  const head = top.count > 1 ? `错得最多的是${top.label}（${top.count} 道）` : `错的是${top.label}`
  const others = s.slice(1, 3).map((x) => x.label)
  const tail = others.length ? `，其次是${others.join('、')}` : ''
  return `${scope}${head}${tail}。`
})

/**
 * 针对错得最多的那一类给一句话。
 *
 * ⚠️ 只能写**这个页面/这个 App 里真能做的动作**。
 *    特别注意：`audio_url` 只有 `kind='listen'` 的题才有（见 import-content.ts 与
 *    本题卡的 `v-if="it.audioUrl"`），所以拼 advice 时**不能**对拼音/语义/认读题说「点开听音频」——
 *    那些卡片上根本没有播放键，写了就是空头承诺（同 learn.vue 那条注释是一个道理）。
 */
const KIND_ADVICE: Record<string, string> = {
  pinyin: '拼音多半栽在声调上：先在心里把四个声调过一遍（一声平、二声扬、三声拐弯、四声降），再逐项比。',
  listen: '听音题把音频听完再选，别看着选项猜 —— 猜对一次，下一题还是会错。',
  meaning: '词义题回的是那一课的原句：回去把这一课的句子读一遍，再来练。',
  stroke: '描红题按笔顺写，写完再看一眼起笔的顺序对不对。',
  recognize: '认读题错在字和意思没连上：先看提示那行，再把字连同释义一起读一遍。',
}
const advice = computed(() => {
  const s = kindStats.value
  return s.length ? KIND_ADVICE[s[0].kind] || '' : ''
})

/* ============================ 数据 ============================ */

async function refresh() {
  if (!isLoggedIn()) {
    logged.value = false
    return
  }
  logged.value = true
  loading.value = true
  loadError.value = ''
  try {
    // ① 元数据：**永远**用未筛选的那次查询拿 total / byLesson（全集口径）。
    //    不能把这件事交给"上次的结果"：重练回来某课被清空后，标签和计数还停在旧值，
    //    用户会看到一个点进去永远是空的标签。
    const meta = await wrongApi.list({ limit: 100 })
    allByLesson.value = meta.byLesson || []

    // 选中的课时若已被练到清空、标签都没了 → 退回「全部」，别卡在一个空筛选上
    if (filterLesson.value && !allByLesson.value.some((g) => g.lessonId === filterLesson.value)) {
      filterLesson.value = 0
    }

    if (filterLesson.value === 0) {
      list.value = meta.list || []
      total.value = meta.total || 0
    } else {
      // ② 业务数据：按课时取（同样 limit 100，足够一课的错题量）
      const p = await wrongApi.list({ limit: 100, lessonId: filterLesson.value })
      list.value = p.list || []
      // 这一课的条数问全集表，不用筛选响应的 total（它只含这一课，但 limit 会截断）
      const g = allByLesson.value.find((x) => x.lessonId === filterLesson.value)
      total.value = g?.count ?? list.value.length
    }
    openId.value = 0
  } catch (e: any) {
    loadError.value = e?.message || '网络好像断了，稍后再试'
    list.value = []
  } finally {
    loading.value = false
  }
}

function pickLesson(id: number) {
  if (filterLesson.value === id) return
  filterLesson.value = id
  void refresh()
}

/* ============================ 音频 ============================ */

let audio: any = null

function play(url: string | null) {
  if (!url) return
  const src = absUrl(url) ?? url
  try {
    if (!audio) audio = uni.createInnerAudioContext()
    if (audio.src === src) {
      audio.stop()
    }
    audio.src = src
    audio.play()
  } catch {
    uni.showToast({ title: '这台设备放不了音频', icon: 'none' })
  }
}

/* ============================ 导航 ============================ */

function goLogin() {
  uni.navigateTo({ url: '/pages/login/login' })
}

function goLearn() {
  uni.switchTab({ url: '/pages/learn/learn' })
}

function startPractice() {
  if (!total.value) return
  // 错题重练在答题页，mode=wrong 时它走 POST /wrongbook/practice 批量提交
  uni.navigateTo({ url: '/pages/practice/practice?mode=wrong' })
}

/* ============================ 入口 ============================ */

onShow(() => {
  void refresh()
})

onUnmounted(() => {
  if (audio) {
    try {
      audio.destroy()
    } catch {
      /* 已经销毁 */
    }
    audio = null
  }
})
</script>

<style scoped>
.wrongbook {
  padding-top: 48rpx;
  padding-bottom: 48rpx;
}

.head-title {
  display: block;
  font-size: 52rpx;
  letter-spacing: 0.12em;
}
.head-sub {
  display: block;
  margin-top: 12rpx;
  font-size: 25rpx;
  color: var(--muted);
}

.state {
  padding: 44rpx 36rpx;
}
.state-title {
  display: block;
  font-size: 34rpx;
  letter-spacing: 0.08em;
}
.state-note {
  display: block;
  margin-top: 18rpx;
  line-height: 1.65;
}
.state-btn {
  display: inline-block;
  margin-top: 32rpx;
  padding: 16rpx 40rpx;
  font-size: 27rpx;
  letter-spacing: 0.12em;
  color: var(--cinnabar);
  border: 2rpx solid var(--cinnabar);
  border-radius: 10rpx;
}

/* ===== 汇总 + 筛选 ===== */
.sum-line {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 20rpx;
}
.sum-main {
  font-size: 34rpx;
  letter-spacing: 0.06em;
}
.sum-side {
  font-size: 24rpx;
  color: var(--muted);
}

/* 归纳块 */
.sum-why {
  margin-bottom: 24rpx;
  padding: 22rpx 24rpx;
  background: var(--wash);
  border-radius: 12rpx;
}
.sum-why-text {
  display: block;
  font-size: 26rpx;
  line-height: 1.6;
  color: var(--ink);
}
.sum-kinds {
  display: block;
  margin-top: 10rpx;
  font-size: 22rpx;
  letter-spacing: 0.04em;
}
.sum-advice {
  display: block;
  margin-top: 12rpx;
  font-size: 23rpx;
  line-height: 1.65;
  color: var(--gilt);
}

/* OB-1：原来是 <scroll-view scroll-x>，行为等价但由纯 CSS 承担（见模板里的注释）。
   overflow-y:hidden 是为了压掉 inline-block 行盒可能带出的竖条。 */
.chips {
  white-space: nowrap;
  overflow-x: auto;
  overflow-y: hidden;
  margin-bottom: 24rpx;
}
.chip {
  display: inline-block;
  padding: 12rpx 26rpx;
  margin-right: 16rpx;
  border-radius: 32rpx;
  border: 2rpx solid var(--rule);
  font-size: 25rpx;
  color: var(--muted);
}
.chip.is-on {
  background: var(--ink);
  border-color: var(--ink);
  color: var(--paper);
}

/* ===== 题目卡 ===== */
.item {
  margin-bottom: 22rpx;
}
.item-top {
  display: flex;
  align-items: center;
  margin-bottom: 18rpx;
}
.item-no {
  font-family: var(--serif);
  font-size: 26rpx;
  color: var(--muted);
  margin-right: 14rpx;
}
.item-kind {
  font-size: 22rpx;
  color: var(--cinnabar);
  border: 2rpx solid var(--cinnabar);
  border-radius: 6rpx;
  padding: 2rpx 10rpx;
  margin-right: 14rpx;
}
.item-lesson {
  flex: 1;
  min-width: 0;
  font-size: 23rpx;
  color: var(--muted);
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  text-align: right;
}

.item-stem {
  display: flex;
}
.stem {
  font-family: var(--serif);
  font-size: 40rpx;
  color: var(--ink);
  line-height: 1.45;
}
.stem.is-latin {
  font-family: var(--sans);
  font-size: 34rpx;
  letter-spacing: 0.04em;
}
.stem-char {
  font-size: 88rpx;
  line-height: 1.2;
  color: var(--ink);
}
.item-en {
  display: block;
  margin-top: 8rpx;
  font-size: 23rpx;
  color: var(--muted);
  font-style: italic;
}

.item-play {
  display: inline-flex;
  align-items: center;
  margin-top: 18rpx;
  padding: 10rpx 24rpx;
  border-radius: 26rpx;
  background: var(--wash);
}
.item-play-icon {
  font-size: 22rpx;
  color: var(--cinnabar);
  margin-right: 10rpx;
}
.item-play-text {
  font-size: 24rpx;
  color: var(--ink);
}

.item-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 22rpx;
  padding-top: 18rpx;
  border-top: 2rpx solid var(--rule);
}
.dots {
  display: flex;
  align-items: center;
}
.dots-label {
  font-size: 22rpx;
  color: var(--muted);
  margin-right: 12rpx;
}
.dot {
  width: 16rpx;
  height: 16rpx;
  border-radius: 50%;
  border: 2rpx solid var(--rule);
  margin-right: 8rpx;
}
.dot.is-on {
  background: var(--gilt);
  border-color: var(--gilt);
}
.dots-num {
  font-size: 22rpx;
  color: var(--muted);
  margin-left: 4rpx;
}
.item-times {
  font-size: 22rpx;
  color: var(--muted);
}

.reveal-toggle {
  display: block;
  margin-top: 18rpx;
  font-size: 24rpx;
  color: var(--cinnabar);
}
.reveal {
  margin-top: 18rpx;
  padding: 20rpx 22rpx;
  background: var(--wash);
  border-radius: 10rpx;
}
.reveal-hint {
  display: block;
  font-size: 25rpx;
  color: var(--gilt);
  line-height: 1.6;
  margin-bottom: 8rpx;
}
.reveal-answer {
  display: flex;
  align-items: baseline;
}
.reveal-answer-label {
  font-size: 26rpx;
  color: var(--muted);
}
.reveal-answer-val {
  font-family: var(--serif);
  font-size: 29rpx;
  color: var(--ink);
  line-height: 1.55;
}
.reveal-answer-val.is-latin {
  font-family: var(--sans);
  font-size: 27rpx;
  letter-spacing: 0.04em;
}

.more {
  display: block;
  text-align: center;
  font-size: 23rpx;
  margin-bottom: 8rpx;
}

.go {
  margin-top: 28rpx;
  padding: 30rpx;
  border-radius: 48rpx;
  background: var(--cinnabar);
  text-align: center;
}
.go-text {
  color: #fff;
  font-family: var(--serif);
  font-size: 34rpx;
  letter-spacing: 4rpx;
}

.tail {
  display: block;
  font-size: 24rpx;
}
</style>