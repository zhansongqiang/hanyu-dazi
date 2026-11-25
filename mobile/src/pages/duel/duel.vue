<script setup lang="ts">
import { computed, ref } from 'vue'
import { onLoad, onUnload } from '@dcloudio/uni-app'
import { duelApi } from '../../api/duel'
import type { DuelDetail, DuelSubmitResult } from '../../api/duel'
import { courseApi } from '../../api/course'
import type { CourseItem, CourseUnit, LessonBrief } from '../../api/course'
import { isLoggedIn, getUserInfo } from '../../utils/auth'
import { shareUrl } from '../../utils/app-base'

/**
 * PK 对战 —— 契约 §4.4
 * 归属：**fe-game**
 *
 * 两种进法，走的是两条完全不同的路径：
 *  1. **无 code** → 发起挑战：选一课 → `POST /duels` → 拿到 6 位码 → 分享给同学。
 *  2. **有 code**（`?code=4K7Q2M`）→ 作答：`GET /duels/:code` **不挂鉴权**，
 *     **未登录的游客也能打开、答完、交卷**。这是 §8 的验收项：
 *     分享链接一点就跳登录页 = 整条裂变链路断掉。
 *     所以本页**绝不能**在 onLoad 里 requireLogin()。
 *
 * ⚠️ 判「我是不是发起人」以后端给的 `challengerId` 为准，但**只用来决定要不要提示
 *    「你已经答过了」**。成绩写在自己名下还是对手名下**完全由后端按 token 判**，
 *    前端就算把 id 传过去后端也不看（游客能伪造 body，伪造不了签名）。
 * ⚠️ 这里判分是**本地**做的（题目里本来就带 answer），对战时不上报每题明细，
 *    只交 score/total/durationMs —— 契约 §4.4 的提交体就是这样。
 */

type Phase = 'pick' | 'quiz'

const code = ref('')
const detail = ref<DuelDetail | null>(null)
const loading = ref(false)
const loadError = ref('')

/* ---------- 发起挑战：选课 ---------- */
const phase = ref<Phase>('pick')
const units = ref<CourseUnit[]>([])
const unitsLoading = ref(false)
const openUnitId = ref<number | null>(null)
const lessons = ref<LessonBrief[]>([])
const lessonsLoading = ref(false)
const creating = ref(false)
const created = ref<{ code: string; lessonTitle: string; expiresAt: string; shareUrl: string } | null>(null)

/* ---------- 作答 ---------- */
const idx = ref(0)
const input = ref('')
const correctCount = ref(0)
const startedAt = ref(0)
/**
 * 秒表读数（毫秒）—— 只给页面看。
 *
 * ⚠️ 契约 §4.4：两边同分是**比用时**定胜负的。用时是这场对战成绩的一部分，
 *    那它就必须在答题时看得见 —— 看不见的计时不叫「比过用时」，
 *    答完才发现自己因为慢了几秒输了，是不讲道理的。
 *
 * ⚠️ 交卷时报的 `durationMs` **不用**这个读数（它是 1 秒一跳的近似值），
 *    而是在 finish() 里用 startedAt 现算 —— 那才是真实的毫秒数。
 */
const elapsedMs = ref(0)
/** setInterval 句柄；挂着不清会在离开页面后继续跑 */
let ticker: ReturnType<typeof setInterval> | null = null
const guestName = ref('')
const submitting = ref(false)
/** 本机交过的卷 —— 后端不返回对手成绩，只能用本地标记防「同一台机器重复提交」 */
const localResult = ref<DuelSubmitResult | null>(null)
const localAnswered = computed(() => !!localResult.value)

const logged = ref(false)
const items = computed<CourseItem[]>(() => detail.value?.items ?? [])
const cur = computed<CourseItem | null>(() => items.value[idx.value] ?? null)
const isChallenger = computed(() => {
  const local = getUserInfo() as { id?: number } | null
  return !!detail.value && !!local?.id && Number(local.id) === Number(detail.value.challengerId)
})
/** 我自己的分数：本机交过卷就用卷上的，否则发起人看后端给自己的分 */
const myScore = computed<number | null>(() => {
  const r = localResult.value
  if (r) return (r.role === 'challenger' ? r.challenger : r.opponent)?.score ?? null
  if (isChallenger.value) return detail.value?.challengerScore ?? null
  return null
})
/** 我已经答过了（发起人分数非 null，或本机刚交过卷）—— 别让我再答一遍 */
const iAlreadyAnswered = computed(
  () =>
    (isChallenger.value && detail.value?.challengerScore !== null) ||
    localAnswered.value
)
/** 是不是首次进入这个挑战（决定要不要显示题目） */
const canAnswer = computed(
  () => detail.value?.status === 'open' && !iAlreadyAnswered.value && items.value.length > 0
)
const progressPercent = computed(() => {
  const n = items.value.length
  if (!n) return 0
  return Math.round((idx.value / n) * 100)
})
/** 选择题：options 非空数组才算；stroke 题的 options 是 null */
const options = computed<string[]>(() => {
  const o = cur.value?.options
  return Array.isArray(o) && o.length ? o : []
})

/** 秒表显示：「0:07」这种，和结果页的「7.3 秒」不是同一套写法，别混 */
function clockText(ms: number): string {
  const s = Math.floor(Math.max(0, ms) / 1000)
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${m}:${String(r).padStart(2, '0')}`
}
const elapsedText = computed(() => clockText(elapsedMs.value))

function startTicker() {
  stopTicker()
  elapsedMs.value = 0
  ticker = setInterval(() => {
    elapsedMs.value = startedAt.value ? Date.now() - startedAt.value : 0
  }, 1000)
}

function stopTicker() {
  if (ticker !== null) {
    clearInterval(ticker)
    ticker = null
  }
}

/** 离开页面必须停表：否则退回上一页后 interval 还在跑，读一个已经没人看的数 */
onUnload(stopTicker)

onLoad((query) => {
  logged.value = isLoggedIn()
  code.value = String(query?.code ?? '').trim().toUpperCase()
  if (code.value) {
    load(code.value)
  } else {
    loadUnits()
  }
})

/* ================= 路径 1：有码，作答 ================= */

/** 本机交过卷的标记 key */
function resultKey(c: string) {
  return `duelResult:${String(c).trim().toUpperCase()}`
}

async function load(c: string) {
  loading.value = true
  loadError.value = ''
  try {
    detail.value = await duelApi.detail(c)
    // 后端只告诉我们「发起人答了多少」，对手（=我）答没答它不说。
    // 所以「我答过没有」只能靠本机的交卷标记判，否则重进链接会让我白答一遍。
    localResult.value = uni.getStorageSync(resultKey(c)) || null
  } catch (e: any) {
    detail.value = null
    loadError.value = e?.message || '挑战没打开'
  } finally {
    loading.value = false
  }
}

function begin() {
  if (!guestName.value.trim() && !logged.value) {
    uni.showToast({ title: '先写个名字，让对手知道是谁', icon: 'none' })
    return
  }
  // 计时从「真的开始答」算起，不含读开场卡那几秒
  startedAt.value = Date.now()
  startTicker()
  phase.value = 'quiz'
}

function answer(choice: string) {
  const item = cur.value
  if (!item) return
  const mine = String(choice ?? '').trim()
  const right = String(item.answer ?? '').trim()
  if (mine.toLowerCase() === right.toLowerCase()) correctCount.value += 1
  next()
}

function submitText() {
  const v = input.value.trim()
  if (!v) {
    uni.showToast({ title: '先写答案', icon: 'none' })
    return
  }
  input.value = ''
  answer(v)
}

function next() {
  if (idx.value + 1 < items.value.length) {
    idx.value += 1
    return
  }
  finish()
}

async function finish() {
  if (submitting.value || !detail.value) return
  submitting.value = true
  stopTicker()
  // 用 startedAt 现算，不用秒表读数：读数一秒一跳，会白白多算/少算将近一秒，
  // 而同分时就是拿它定胜负的，不能拿四舍五入的数去比
  const durationMs = startedAt.value ? Date.now() - startedAt.value : 0
  try {
    const res = await duelApi.submit(detail.value.code, {
      name: logged.value ? undefined : guestName.value.trim(),
      score: correctCount.value,
      total: items.value.length,
      durationMs,
    })
    localResult.value = res
    // 结果页要用它画对比（GET /duels/:code **不返回**对手分，见最终报告的 CHANGE-REQUEST）
    uni.setStorageSync(resultKey(detail.value.code), res)
    uni.redirectTo({ url: `/pages/duel/result?code=${detail.value.code}` })
  } catch {
    submitting.value = false
  }
}

/** 答完一方、等对手时的样子 */
function goResult() {
  if (!detail.value) return
  uni.navigateTo({ url: `/pages/duel/result?code=${detail.value.code}` })
}

/* ================= 路径 2：无码，发起挑战 ================= */

async function loadUnits() {
  unitsLoading.value = true
  try {
    units.value = (await courseApi.units()) || []
  } catch {
    units.value = []
  } finally {
    unitsLoading.value = false
  }
}

async function toggleUnit(u: CourseUnit) {
  if (openUnitId.value === u.id) {
    openUnitId.value = null
    lessons.value = []
    return
  }
  openUnitId.value = u.id
  lessons.value = []
  lessonsLoading.value = true
  try {
    lessons.value = (await courseApi.lessons(u.id)) || []
  } catch {
    lessons.value = []
  } finally {
    lessonsLoading.value = false
  }
}

async function createDuel(lesson: LessonBrief) {
  if (creating.value) return
  creating.value = true
  try {
    created.value = await duelApi.create(lesson.id)
  } catch {
    /* 拦截器已提示 */
  } finally {
    creating.value = false
  }
}

/**
 * 分享链接要是**能直接点开**的绝对地址，相对路径发给同学等于发了个死链。
 *
 * ⚠️ 这里原本写的是 `${window.location.origin}${window.location.pathname}#${rel}`。
 *    在浏览器里它是对的；但打包成 APP（Capacitor 壳）之后 WebView 的源是
 *    `https://localhost`，于是复制出去的链接变成 `https://localhost/index.html#/…`
 *    —— 同学点开必然是死链。站点源统一由 `utils/app-base.ts` 按运行形态给。
 */
function shareUrlOf(rel: string) {
  return shareUrl(rel)
}

function copyShare() {
  if (!created.value) return
  const text = `我在汉语搭子出了一套题《${created.value.lessonTitle}》，来比比谁答得对：${shareUrlOf(created.value.shareUrl)}（口令 ${created.value.code}）`
  uni.setClipboardData({
    data: text,
    success: () => uni.showToast({ title: '链接已复制，发给同学吧', icon: 'none' }),
  })
}

/** 自己先答一遍（我就是发起人，带 token 提交会写在自己名下） */
function answerMyself() {
  const c = created.value?.code
  if (!c) return
  detail.value = null
  localResult.value = null
  uni.removeStorageSync(resultKey(c))
  code.value = c
  created.value = null
  phase.value = 'pick'
  idx.value = 0
  correctCount.value = 0
  input.value = ''
  startedAt.value = 0
  stopTicker()
  load(c)
}

function restart() {
  created.value = null
  phase.value = 'pick'
  openUnitId.value = null
  lessons.value = []
  loadUnits()
}
</script>

<template>
  <view class="hd-page duel">
    <!-- ============ 无码：发起挑战 ============ -->
    <template v-if="!code">
      <text class="hd-title title">PK 对战</text>
      <text class="hd-note sub">挑一课出题，把链接发给同学，看谁答得对。</text>

      <!-- 已生成：亮出口令和分享 -->
      <view v-if="created" class="hd-card made">
        <text class="made-lb hd-note">《{{ created.lessonTitle }}》的挑战口令</text>
        <text class="made-code">{{ created.code }}</text>
        <text class="made-exp hd-note">有效期到 {{ String(created.expiresAt).slice(0, 16) }}</text>
        <view class="made-acts">
          <view class="btn btn-line" @tap="copyShare">复制分享链接</view>
          <view class="btn" @tap="answerMyself">我先答一遍</view>
        </view>
        <view class="made-again hd-note" @tap="restart">再出一套</view>
      </view>

      <template v-else>
        <view v-if="unitsLoading" class="hd-card state">
          <text class="state-title hd-title">正在取课程</text>
          <text class="hd-note state-note">稍等一下。</text>
        </view>

        <view v-else-if="!units.length" class="hd-card state">
          <text class="state-title hd-title">还没有可出的课</text>
          <text class="hd-note state-note">课程内容配好后，就能从任意一课出题。</text>
        </view>

        <view v-else class="units">
          <view v-for="u in units" :key="u.id" class="unit">
            <view class="unit-head" @tap="toggleUnit(u)">
              <view class="unit-l">
                <text class="unit-title">{{ u.title }}</text>
                <text class="unit-note hd-note">{{ u.lessonCount }} 课 · {{ u.itemCount }} 题</text>
              </view>
              <text class="unit-go">{{ openUnitId === u.id ? '收起' : '展开' }}</text>
            </view>

            <view v-if="openUnitId === u.id" class="lessons">
              <text v-if="lessonsLoading" class="hd-note lesson-hint">正在取课时…</text>
              <text v-else-if="!lessons.length" class="hd-note lesson-hint">这一单元还没有课时。</text>
              <view
                v-for="l in lessons"
                :key="l.id"
                class="lesson"
                @tap="createDuel(l)"
              >
                <view class="lesson-l">
                  <text class="lesson-title">{{ l.title }}</text>
                  <text class="hd-note lesson-note">{{ l.itemCount }} 题 · 约 {{ l.estMinutes }} 分钟</text>
                </view>
                <text class="lesson-go">{{ creating ? '出题中…' : '出题' }}</text>
              </view>
            </view>
          </view>
        </view>
      </template>
    </template>

    <!-- ============ 有码：打开分享链接 ============ -->
    <template v-else>
      <view v-if="loading" class="hd-card state">
        <text class="state-title hd-title">正在打开挑战</text>
        <text class="hd-note state-note">稍等一下。</text>
      </view>

      <view v-else-if="loadError" class="hd-card state">
        <text class="state-title hd-title">挑战没打开</text>
        <text class="hd-note state-note">{{ loadError }}</text>
        <view class="state-acts">
          <view class="btn btn-line" @tap="load(code)">重试</view>
          <view class="btn btn-line" @tap="code = ''">自己出一套题</view>
        </view>
      </view>

      <template v-else-if="detail">
        <!-- 开场卡（答题前） -->
        <view v-if="phase === 'pick'" class="hd-card intro">
          <text class="intro-lb hd-note">挑战 · 口令 {{ detail.code }}</text>
          <text class="intro-title hd-title">《{{ detail.lessonTitle }}》</text>
          <!-- ⚠️ 题量一律用 detail.total，不要用 items.length：
               status !== 'open' 时后端按契约不给 items（null），已结束的对战会渲染成「一共 0 道」 -->
          <text class="intro-by hd-note">{{ detail.challengerName }} 出的题，一共 {{ detail.total }} 道</text>

          <template v-if="canAnswer">
            <view v-if="!logged" class="name-row">
              <text class="name-lb hd-note">你叫什么</text>
              <input
                v-model="guestName"
                class="ipt"
                type="text"
                maxlength="20"
                placeholder="不登录也能答，写个名字就行"
                placeholder-class="ph"
              />
            </view>
            <view class="btn" @tap="begin">开始答题</view>
            <text class="hd-note intro-tip">
              答完当场出分，题目里就带答案，不用等谁。两边分数一样时比用时 —— 开始答以后页面上有秒表。
            </text>
          </template>

          <template v-else-if="iAlreadyAnswered">
            <text class="intro-title done-title">你已经答过了</text>
            <text class="hd-note intro-tip">
              你的成绩是 {{ myScore ?? '—' }} 分。等另一方答完，就能看谁赢了。
            </text>
            <view class="btn" @tap="goResult">看这场对战</view>
          </template>

          <template v-else-if="detail.status === 'expired'">
            <text class="intro-title done-title">这场挑战过期了</text>
            <text class="hd-note intro-tip">分享链接只在 7 天内有效。你可以自己出一套给同学。</text>
            <view class="btn btn-line" @tap="code = ''">自己出一套题</view>
          </template>

          <template v-else>
            <!-- status === 'done' -->
            <text class="intro-title done-title">这场对战已经结束</text>
            <text class="hd-note intro-tip">两边都答完了，看看结果吧。</text>
            <view class="btn" @tap="goResult">看这场对战</view>
          </template>
        </view>

        <!-- 答题卡 -->
        <template v-else>
          <view class="qbar">
            <text class="qbar-no hd-note">{{ idx + 1 }} / {{ items.length }}</text>
            <view class="bar">
              <view class="bar-fill" :style="{ width: progressPercent + '%' }"></view>
            </view>
            <text class="qbar-clock hd-note">{{ elapsedText }}</text>
          </view>

          <view v-if="cur" class="hd-card qcard">
            <text class="q-prompt">{{ cur.prompt }}</text>
            <text v-if="cur.promptEn" class="q-en hd-note">{{ cur.promptEn }}</text>

            <view v-if="options.length" class="opts">
              <view
                v-for="(o, i) in options"
                :key="i"
                class="opt"
                @tap="answer(o)"
              >
                <text class="opt-no">{{ 'ABCD'[i] || i + 1 }}</text>
                <text class="opt-txt">{{ o }}</text>
              </view>
            </view>

            <view v-else class="fill">
              <input
                v-model="input"
                class="ipt fill-ipt"
                type="text"
                :placeholder="cur.kind === 'pinyin' ? '写下拼音' : '写下答案'"
                placeholder-class="ph"
                @confirm="submitText"
              />
              <view class="btn" @tap="submitText">下一题</view>
            </view>
          </view>

          <text class="hd-note quiz-tip">
            对错当场判；交卷后才知道自己几分。两边同分时比用时，右上角的秒表就是你的成绩之一。
            中途退出不会留下成绩。
          </text>
        </template>
      </template>
    </template>

    <text v-if="!code && !created" class="hd-note foot">
      出题不消耗次数。一人一套题，谁都能答一次。
    </text>
  </view>
</template>

<style>
.duel {
  padding-top: 56rpx;
}
.title {
  display: block;
  font-size: 44rpx;
  letter-spacing: 0.12em;
}
.sub {
  display: block;
  margin-top: 12rpx;
  font-size: 24rpx;
}

.state {
  margin-top: 32rpx;
  padding: 40rpx 36rpx;
}
.state-title {
  display: block;
  font-size: 32rpx;
}
.state-note {
  display: block;
  margin-top: 16rpx;
}
.state-acts {
  display: flex;
  gap: 16rpx;
  margin-top: 28rpx;
  flex-wrap: wrap;
}

.btn {
  margin-top: 30rpx;
  padding: 26rpx 0;
  text-align: center;
  font-size: 29rpx;
  letter-spacing: 0.14em;
  color: #fcfaf5;
  background: var(--cinnabar);
  border-radius: 12rpx;
}
.btn-line {
  color: var(--cinnabar);
  background: transparent;
  border: 2rpx solid var(--cinnabar);
}

/* 口令卡 */
.made {
  margin-top: 32rpx;
  padding: 40rpx 36rpx;
  text-align: center;
}
.made-lb {
  display: block;
  font-size: 24rpx;
}
.made-code {
  display: block;
  margin-top: 16rpx;
  font-family: var(--serif);
  font-size: 76rpx;
  letter-spacing: 0.3em;
  color: var(--cinnabar);
  text-indent: 0.3em;
}
.made-exp {
  display: block;
  margin-top: 14rpx;
  font-size: 22rpx;
}
.made-acts {
  display: flex;
  flex-direction: column;
}
.btn-line {
  margin-top: 30rpx;
}
.made-again {
  display: block;
  margin-top: 30rpx;
  font-size: 24rpx;
  text-decoration: underline;
}

/* 选课 */
.units {
  margin-top: 32rpx;
  border: 1rpx solid var(--rule);
  border-radius: 16rpx;
  overflow: hidden;
  background: var(--card);
}
.unit {
  border-bottom: 1rpx solid var(--rule);
}
.unit:last-child {
  border-bottom: none;
}
.unit-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
  padding: 26rpx 28rpx;
}
.unit-l {
  min-width: 0;
}
.unit-title {
  display: block;
  font-size: 30rpx;
}
.unit-note {
  display: block;
  margin-top: 6rpx;
  font-size: 22rpx;
}
.unit-go {
  flex-shrink: 0;
  font-size: 24rpx;
  color: var(--gilt);
}
.lessons {
  padding: 0 28rpx 20rpx;
}
.lesson-hint {
  display: block;
  padding: 12rpx 0;
  font-size: 23rpx;
}
.lesson {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
  padding: 22rpx 24rpx;
  margin-bottom: 14rpx;
  background: var(--wash);
  border-radius: 10rpx;
}
.lesson:last-child {
  margin-bottom: 0;
}
.lesson-l {
  min-width: 0;
}
.lesson-title {
  display: block;
  font-size: 28rpx;
}
.lesson-note {
  display: block;
  margin-top: 4rpx;
  font-size: 21rpx;
}
.lesson-go {
  flex-shrink: 0;
  font-size: 25rpx;
  color: var(--cinnabar);
}

/* 开场卡 */
.intro {
  margin-top: 24rpx;
  padding: 40rpx 36rpx;
}
.intro-lb {
  display: block;
  font-size: 23rpx;
}
.intro-title {
  display: block;
  margin-top: 14rpx;
  font-size: 40rpx;
  letter-spacing: 0.08em;
}
.done-title {
  color: var(--gilt);
  font-size: 34rpx;
}
.intro-by {
  display: block;
  margin-top: 12rpx;
  font-size: 24rpx;
}
.intro-tip {
  display: block;
  margin-top: 20rpx;
  font-size: 22rpx;
  line-height: 1.6;
}

.name-row {
  margin-top: 32rpx;
}
.name-lb {
  display: block;
  font-size: 23rpx;
}
.ipt {
  margin-top: 12rpx;
  height: 84rpx;
  padding: 0 24rpx;
  font-size: 29rpx;
  background: var(--wash);
  border-radius: 10rpx;
}
.ph {
  color: var(--muted);
}

/* 答题 */
.qbar {
  display: flex;
  align-items: center;
  gap: 20rpx;
  margin-top: 36rpx;
}
.qbar-no {
  flex-shrink: 0;
  font-size: 23rpx;
}
/* 秒表：等宽数字，否则 0:09 → 0:10 会整体抖一下 */
.qbar-clock {
  flex-shrink: 0;
  min-width: 68rpx;
  text-align: right;
  font-size: 23rpx;
  font-variant-numeric: tabular-nums;
  font-feature-settings: 'tnum';
}
.bar {
  flex: 1;
  height: 8rpx;
  border-radius: 6rpx;
  background: var(--wash);
  overflow: hidden;
}
.bar-fill {
  height: 100%;
  background: var(--gilt);
  border-radius: 6rpx;
  transition: width 0.2s ease;
}

.qcard {
  margin-top: 24rpx;
  padding: 48rpx 36rpx;
}
.q-prompt {
  display: block;
  font-family: var(--serif);
  font-size: 68rpx;
  line-height: 1.3;
  letter-spacing: 0.12em;
  text-align: center;
}
.q-en {
  display: block;
  margin-top: 14rpx;
  font-size: 24rpx;
  text-align: center;
}

.opts {
  margin-top: 44rpx;
}
.opt {
  display: flex;
  align-items: center;
  gap: 20rpx;
  padding: 26rpx 26rpx;
  margin-bottom: 16rpx;
  background: var(--wash);
  border: 2rpx solid transparent;
  border-radius: 12rpx;
}
.opt:last-child {
  margin-bottom: 0;
}
.opt-no {
  flex-shrink: 0;
  width: 40rpx;
  text-align: center;
  font-family: var(--serif);
  font-size: 26rpx;
  color: var(--muted);
}
.opt-txt {
  flex: 1;
  min-width: 0;
  font-size: 32rpx;
}

.fill {
  margin-top: 40rpx;
}
.fill-ipt {
  text-align: center;
  font-size: 34rpx;
}
.quiz-tip {
  display: block;
  margin-top: 32rpx;
  font-size: 22rpx;
  line-height: 1.6;
}

.foot {
  display: block;
  margin-top: 56rpx;
  font-size: 22rpx;
  text-align: center;
}
</style>