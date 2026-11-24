<template>
  <view class="hd-page practice">
    <!-- ============ 顶栏：退出 / 标题 / 题号 ============ -->
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
    <view v-if="needLogin" class="state hd-card">
      <text class="state-title hd-title">先登录</text>
      <text class="state-text hd-note">答题成绩要记到账号上，登录一下就能开始。</text>
      <view class="state-act" @tap="goLogin">去登录</view>
    </view>

    <!-- ============ 载入中 ============ -->
    <view v-else-if="phase === 'loading'" class="state hd-card">
      <text class="state-text hd-note">正在取题…</text>
    </view>

    <!-- ============ 取题失败 ============ -->
    <view v-else-if="phase === 'error'" class="state hd-card">
      <text class="state-title hd-title">题目没取回来</text>
      <text class="state-text hd-note">{{ loadError }}</text>
      <view class="state-act" @tap="reload">重试</view>
    </view>

    <!-- ============ 没有题 ============ -->
    <view v-else-if="phase === 'empty'" class="state hd-card">
      <text class="state-title hd-title">{{ emptyTitle }}</text>
      <text class="state-text hd-note">{{ emptyText }}</text>
      <view class="state-act" @tap="quit">{{ mode === 'wrong' ? '回错题本' : '回课时' }}</view>
    </view>

    <!-- ============ 结算 ============ -->
    <view v-else-if="phase === 'done'" class="sum">
      <view class="sum-top hd-card">
        <view class="sum-score">
          <text class="sum-num hd-title">{{ correctCount }}</text>
          <text class="sum-den">/ {{ total }}</text>
        </view>
        <text class="sum-word hd-title">{{ sumWord }}</text>
        <text class="sum-sub hd-note">{{ sumSub }}</text>

        <view class="sum-rows">
          <view v-if="mode === 'lesson'" class="sum-row">
            <text class="sum-k">最好成绩</text>
            <text class="sum-v">{{ bestText }}</text>
          </view>
          <view v-if="mode === 'lesson' && finish && finish.xpEarned" class="sum-row">
            <text class="sum-k">课时奖励</text>
            <text class="sum-v">+{{ finish.xpEarned }} XP</text>
          </view>
          <view v-if="mode === 'lesson' && finish" class="sum-row">
            <text class="sum-k">连续打卡</text>
            <text class="sum-v">{{ finish.checkin.currentStreak }} 天<text v-if="finish.checkin.xpEarned"> · +{{ finish.checkin.xpEarned }} XP</text></text>
          </view>
          <view v-if="mode === 'lesson' && finish && finish.unitDone" class="sum-row">
            <text class="sum-k">单元</text>
            <text class="sum-v">这一单元全过了</text>
          </view>
          <view v-if="mode === 'wrong'" class="sum-row">
            <text class="sum-k">本次清掉</text>
            <text class="sum-v">{{ cleared }} 道</text>
          </view>
          <view v-if="mode === 'wrong' && remaining !== null" class="sum-row">
            <text class="sum-k">还欠着</text>
            <text class="sum-v">{{ remaining }} 道</text>
          </view>
        </view>

        <view v-if="badges.length" class="sum-badges">
          <text v-for="b in badges" :key="b.code" class="sum-badge">🏅 {{ b.name }}</text>
        </view>

        <text v-if="syncNote" class="sum-note hd-note">{{ syncNote }}</text>
      </view>

      <view class="sum-acts">
        <view class="act-main" @tap="restart">再练一次</view>
        <view v-if="mode === 'lesson' && finish && finish.nextLessonId" class="act-main alt" @tap="nextLesson">下一课</view>
        <view class="act-ghost" @tap="quit">{{ mode === 'wrong' ? '回错题本' : '回课时' }}</view>
      </view>
    </view>

    <!-- ============ 答题 ============ -->
    <view v-else class="qwrap">
      <!-- 题干 -->
      <view class="stem hd-card">
        <text v-if="cur.kind === 'listen'" class="stem-instr">{{ cur.prompt }}</text>
        <text v-else-if="cur.kind === 'stroke'" class="stem-instr">描出这个字</text>
        <text v-else class="stem-big" :class="{ 'is-latin': !isHanzi(cur.prompt) }">{{ cur.prompt }}</text>

        <text v-if="cur.promptEn" class="stem-en">{{ cur.promptEn }}</text>

        <view v-if="cur.kind === 'listen'" class="play" :class="{ 'is-playing': playing }" @tap="playAudio">
          <text class="play-icon">{{ playing ? '♪' : '▶' }}</text>
          <text class="play-text">{{ playing ? '正在播放' : '听一遍' }}</text>
        </view>
        <text v-if="cur.kind === 'listen' && !cur.audioUrl" class="stem-miss hd-note">
          这段音频暂时没有，按选项的意思选一个。
        </text>
      </view>

      <!-- 选择题 -->
      <view v-if="isChoice" class="opts">
        <view
          v-for="opt in curOptions"
          :key="opt"
          class="opt"
          :class="optClass(opt)"
          @tap="choose(opt)"
        >
          <text class="opt-text" :class="{ 'is-hanzi': optIsHanzi }">{{ opt }}</text>
        </view>
        <view v-if="!curOptions.length" class="opt-skip" @tap="skip">
          <text class="opt-skip-text">这题没有选项，跳过</text>
        </view>
      </view>

      <!-- 描红 -->
      <view v-else class="trace">
        <view
          v-show="!answered && !traceFailed"
          ref="traceEl"
          class="trace-box"
          :style="{ width: traceSize + 'px', height: traceSize + 'px' }"
        ></view>

        <view v-if="traceFailed" class="trace-static" :style="{ width: traceSize + 'px', height: traceSize + 'px' }">
          <text class="trace-char hd-title">{{ curChar }}</text>
        </view>

        <text class="trace-tip hd-note">{{ traceTip }}</text>

        <view v-if="!answered" class="trace-acts">
          <view v-if="traceFailed" class="trace-btn main" @tap="answerStroke(true)">我写好了</view>
          <view v-else class="trace-btn" @tap="replayTrace">看一遍笔顺</view>
          <view class="trace-btn ghost" @tap="answerStroke(false)">写不出来</view>
        </view>
      </view>

      <!-- 即时反馈 -->
      <view v-if="answered" class="fb hd-card" :class="isRight ? 'fb-ok' : 'fb-no'">
        <view class="fb-head">
          <text class="fb-mark">{{ isRight ? '对' : '错' }}</text>
          <text class="fb-word hd-title">{{ isRight ? '就是这个' : '再想想' }}</text>
        </view>

        <view v-if="!isRight" class="fb-answer">
          <text class="fb-answer-k">正确答案</text>
          <text class="fb-answer-v hd-title" :class="{ 'is-latin': !isHanzi(result ? result.answer : cur.answer) }">{{ result ? result.answer : cur.answer }}</text>
        </view>

        <text v-if="result && result.hint" class="fb-hint hd-note">{{ result.hint }}</text>

        <view class="fb-meta">
          <text v-if="result && result.xpEarned" class="fb-xp">+{{ result.xpEarned }} XP</text>
          <text v-if="result && result.wrongTimes > 1" class="fb-times">这题错过 {{ result.wrongTimes }} 次</text>
          <text v-if="answered && localOnly" class="fb-times">结果暂未同步</text>
        </view>

        <view v-if="result && result.badge" class="fb-badge">🏅 解锁印章「{{ result.badge.name }}」</view>
      </view>

      <!-- 继续 -->
      <view v-if="answered" class="next" @tap="next">
        <text class="next-text">{{ isLast ? '看成绩' : '下一题' }}</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
/**
 * 答题页 —— 契约 §4.1 §4.2 §4.3
 * 归属：**fe-learn**
 *
 * 两种入口：
 *   `?lessonId=3`  课时模式：逐题 `POST /attempts` 拿 hint / XP / 印章，末尾 `POST /lessons/:id/finish`
 *   `?mode=wrong`  错题模式：一轮做完**批量** `POST /wrongbook/practice`，拿 cleared / remaining
 *
 * ## 三条刻意的设计
 *
 * 1. **本地即时判分，网络在后台跑**。内容接口本来就返回 `answer`（契约 §4.1 的取舍），
 *    所以对错不用等网络 —— 点下选项立刻出反馈，`POST /attempts` 只是去拿
 *    hint/XP/印章这些**本地算不出来**的东西。判分逻辑照抄后端的 `norm()`：
 *    `replace(/\s+/g,' ').trim().toLowerCase()`，且 `answer.length > 0` 才算能判。
 *    ⚠️ 本地判分只是**体验**，真源永远在后端（`judgeAndPersist` 会复判）。
 *
 * 2. **POST 只发一次，失败就整轮不再发**。学生在地铁里做题时，一个断网会引发
 *    20 次失败请求 + 20 个 toast。所以第一次失败就把 `localOnly` 立起来：
 *    后面只走本地判分，结算页明确写「本轮结果暂未同步」。**降级但不骗人**。
 *
 * 3. **描红的对错本地定：错 0~1 笔算对**。hanzi-writer 的 quiz 回调给
 *    `totalMistakes`，我们拿 `<= 1` 当对（允许一次手抖）。判对就提交 `char`
 *    （= 后端 items.answer），判错就提交空串 —— 空串在后端 `norm('') !== norm(ans)`
 *    必然判错，于是老老实实进错题本。**绝不把"没写出来"报成对**。
 */
import { ref, computed, nextTick, onUnmounted } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { courseApi } from '../../api/course'
import type { CourseItem, ItemKind } from '../../api/course'
import { attemptApi } from '../../api/attempt'
import type { AttemptResult, AttemptBadge, FinishResult } from '../../api/attempt'
import { wrongApi } from '../../api/wrong'
import type { WrongPracticePayload } from '../../api/wrong'
import { isLoggedIn } from '../../utils/auth'
import { createTrace } from '../stroke/hanzi'
import type { TraceHandle } from '../stroke/hanzi'

/** 统一的题目结构：课时模式的 item 与错题模式的 wrong item 都归一到这个形状 */
interface Q {
  itemId: number
  kind: ItemKind
  prompt: string
  promptEn: string | null
  options: string[] | null
  answer: string
  char: string | null
  audioUrl: string | null
  hint: string | null
  /** 错题模式下用来标来源（「来自 第2课」） */
  lessonTitle: string | null
}

type Phase = 'loading' | 'error' | 'empty' | 'ready' | 'done'

/**
 * 过课线，与后端 `server/src/constants` 的 `LESSON_DONE_RATIO` 同值（0.6）。
 * 这里**复制**而不是 import：那是后端 constants，前端引不到；而且它只用于
 * `finish` 拿不到时的本地预估文案，真正的 done/in_progress 由后端返回的
 * `status` 决定。若哪天常量改了，这里最多让一句文案早变一秒，不会写错库。
 */
const PASS_RATIO = 0.6

/* ============================ 状态 ============================ */

const phase = ref<Phase>('loading')
const needLogin = ref(false)
const loadError = ref('')

const mode = ref<'lesson' | 'wrong'>('lesson')
const lessonId = ref(1)

const headTitle = ref('答题')
const headSub = ref('')

const questions = ref<Q[]>([])
const idx = ref(0)

const answered = ref(false)
const picked = ref('')
const result = ref<AttemptResult | null>(null)
const localOnly = ref(false) // 本轮某一次提交失败 → 之后的都只走本地

const correctCount = ref(0)
const totalMs = ref(0)
let qStart = 0

const finish = ref<FinishResult | null>(null)
const syncNote = ref('')
const badges = ref<AttemptBadge[]>([])

const cleared = ref(0)
const remaining = ref<number | null>(null)

const playing = ref(false)

const traceEl = ref<any>(null)
const traceFailed = ref(false)
let traceHandle: TraceHandle | null = null
let pending: WrongPracticePayload[] = []

/** 描红格子边长：一屏宽度的 72%，上限 336 —— 不用容器宽度，避免首帧还没布局拿到 0 */
const traceSize = (() => {
  let w = 375
  try {
    w = Number(uni.getSystemInfoSync()?.windowWidth) || 375
  } catch {
    /* 拿不到就用 375，一切照旧 */
  }
  return Math.min(336, Math.floor(w * 0.72))
})()

/* ============================ 派生 ============================ */

const total = computed(() => questions.value.length)

/**
 * 当前题目。**永不返回 null**：越界时给一个空题兜底。
 * 理由不是懒，是模板安全 —— `strict: true` 下 `cur.kind` 这种写法一旦可能为 null
 * 就会被 vue-tsc 判错，而模板里塞 `?.` 满地都是反而更容易漏。
 * 真正"没有题"的情况由 `phase === 'empty'` 分支先接管，走不到这里。
 */
const EMPTY_Q: Q = {
  itemId: 0,
  kind: 'recognize',
  prompt: '',
  promptEn: null,
  options: null,
  answer: '',
  char: null,
  audioUrl: null,
  hint: null,
  lessonTitle: null,
}
const cur = computed<Q>(() => questions.value[idx.value] || EMPTY_Q)
const isLast = computed(() => idx.value + 1 >= total.value)
const isChoice = computed(() => cur.value.kind !== 'stroke')
const curOptions = computed(() => cur.value.options || [])
const curChar = computed(() => (cur.value.char || cur.value.answer || '').trim())
const answeredCount = computed(() => idx.value + (answered.value ? 1 : 0))
const pct = computed(() => (total.value ? Math.round((answeredCount.value / total.value) * 100) : 0))
const isRight = computed(() => !!result.value?.isCorrect)

/** 选项是汉字就用大字排（拼音/英文用正常字号）—— 三种题型混在一课里也得各排各的 */
const optIsHanzi = computed(() => curOptions.value.some((o) => /^[一-鿿]+$/.test(String(o))))

const traceTip = computed(() => {
  if (traceFailed.value) return '这台设备暂时画不了笔顺，照着上面的字写一遍，再点「我写好了」。'
  if (answered.value) return ''
  return `照着淡灰的笔画，把「${curChar.value}」描一遍`
})

const emptyTitle = computed(() => (mode.value === 'wrong' ? '错题本是空的' : '这一课还没有题目'))
const emptyText = computed(() =>
  mode.value === 'wrong'
    ? '做错的题会自己攒到这里。连着答对两次，它就会自己走掉。'
    : '内容还在路上，先回课时页看看别的。'
)

const bestText = computed(() => {
  if (!finish.value) return '—'
  const bt = finish.value.bestTotal
  return bt === null ? '—' : `${finish.value.bestScore} / ${bt}`
})

const sumWord = computed(() => {
  if (mode.value === 'wrong') return cleared.value > 0 ? '清掉了一批' : '再练一轮'
  const st = finish.value?.status
  const ok = st ? st === 'done' : correctCount.value / Math.max(1, total.value) >= PASS_RATIO
  return ok ? '这一课过了' : '还差一点'
})

const sumSub = computed(() => {
  if (mode.value === 'wrong') {
    return remaining.value === null ? '' : `错题本还剩 ${remaining.value} 道待复习`
  }
  if (!finish.value) return '成绩没能同步，这轮只是练手'
  return finish.value.firstDone ? '第一次完成这一课' : '最好成绩才作数，再练一遍可以冲更高'
})

/* ============================ 判分（照抄后端 norm） ============================ */

function norm(s: unknown): string {
  return String(s ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

/** 与 services/attempt.ts 的 `isCorrect` 逐字一致（含 answer 非空这一条） */
function judge(userAnswer: unknown, answer: string): boolean {
  const a = String(answer ?? '')
  return norm(userAnswer) === norm(a) && a.length > 0
}

/**
 * 含汉字 → 用衬线；纯拉丁 → 用无衬线。
 * 反馈卡里显示"正确答案"，而答案的语种**跟题型不一一对应**（见 items 的真实数据）：
 *   recognize 的答案是拼音（rì）、pinyin 的答案是汉字（日）、meaning 的答案是英文（sun）。
 * 按题型判会有一半判错，按内容判才对。
 */
function isHanzi(s: string | null | undefined): boolean {
  return /[一-鿿]/.test(String(s || ''))
}

/* ============================ 载入 ============================ */

function reload() {
  void load()
}

async function load() {
  if (!isLoggedIn()) {
    needLogin.value = true
    phase.value = 'loading' // 真正的渲染由 needLogin 先接管
    return
  }
  needLogin.value = false
  phase.value = 'loading'
  loadError.value = ''

  // 新一轮：计数与暂存全部清零（「再练一次」也走这里）
  idx.value = 0
  answered.value = false
  picked.value = ''
  result.value = null
  correctCount.value = 0
  totalMs.value = 0
  finish.value = null
  syncNote.value = ''
  badges.value = []
  cleared.value = 0
  remaining.value = null
  localOnly.value = false
  pending = []
  destroyTrace()
  destroyAudio()

  try {
    if (mode.value === 'wrong') await loadWrong()
    else await loadLesson()
  } catch (e: any) {
    questions.value = []
    loadError.value = e?.message || '题目没取回来，检查一下网络'
    phase.value = 'error'
    return
  }

  if (!questions.value.length) {
    phase.value = 'empty'
    return
  }
  phase.value = 'ready'
  resetForQuestion()
}

async function loadLesson() {
  const d = await courseApi.lesson(lessonId.value)
  headTitle.value = d.title || '答题'
  headSub.value = d.unit?.title || ''
  questions.value = (d.items || []).map((it: CourseItem) => ({
    itemId: it.id,
    kind: it.kind,
    prompt: it.prompt,
    promptEn: it.promptEn,
    options: it.options,
    answer: it.answer,
    char: it.char,
    audioUrl: it.audioUrl,
    // ⚠️ GET /lessons/:id 的 item DTO **不含 hint**（toItemDto 里没有这个字段），
    //    hint 只能从 POST /attempts 的响应里拿。所以这里恒为 null 是正常的，不是漏了。
    hint: null,
    lessonTitle: null,
  }))
}

async function loadWrong() {
  const page = await wrongApi.list({ limit: 50 })
  headTitle.value = '错题重练'
  headSub.value = page.byLesson.length ? `来自 ${page.byLesson.length} 个课时` : ''
  questions.value = (page.list || []).map((w) => ({
    itemId: w.itemId,
    kind: w.kind,
    prompt: w.prompt,
    promptEn: w.promptEn,
    options: w.options,
    answer: w.answer,
    char: w.char,
    audioUrl: w.audioUrl,
    // 错题列表**带 hint**，所以错题模式答错能立刻看到提示语
    hint: w.hint ?? null,
    lessonTitle: w.lessonTitle ?? null,
  }))
}

/* ============================ 单题生命周期 ============================ */

function resetForQuestion() {
  answered.value = false
  picked.value = ''
  result.value = null
  qStart = Date.now()
  destroyTrace()
  traceFailed.value = false
  if (cur.value.kind === 'stroke') void mountTrace()
}

async function mountTrace() {
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
      // 只在"第一次错"时提示，避免每错一笔都抖一下
      if (n === 1) uni.showToast({ title: '跟着淡灰的笔画走', icon: 'none', duration: 1200 })
    },
    onComplete: (mistakes) => {
      // 用户可能已经点了「写不出来」—— answered 已置位就别再判一次
      if (answered.value) return
      answerStroke(mistakes <= 1)
    },
  })
  if (!h) {
    traceFailed.value = true
    return
  }
  traceHandle = h
}

function replayTrace() {
  traceHandle?.replay()
}

function destroyTrace() {
  if (traceHandle) {
    traceHandle.destroy()
    traceHandle = null
  }
}

/* ============================ 作答 ============================ */

function choose(opt: string) {
  if (answered.value) return
  picked.value = opt
  settle(judge(opt, cur.value.answer), opt, Date.now() - qStart)
}

/** 选项的着色：答对的那个永远描金，自己点错的那个描红，其余压暗 */
function optClass(opt: string): string {
  if (!answered.value) return ''
  if (judge(opt, cur.value.answer)) return 'is-right'
  if (opt === picked.value) return 'is-wrong'
  return 'is-dim'
}

/** 「这题没有选项，跳过」—— 数据缺了不该把人堵死。跳过的题**不计分也不提交** */
function skip() {
  if (answered.value) return
  answered.value = true
  result.value = null
  picked.value = ''
}

function answerStroke(ok: boolean) {
  if (answered.value) return
  // 判对提交 char（= items.answer），判错提交空串 —— 让后端也判错，诚实进错题本
  const userAnswer = ok ? curChar.value : ''
  picked.value = userAnswer
  settle(ok, userAnswer, Date.now() - qStart)
}

/**
 * 定下本题的结果：**先出反馈，再去网络**。
 * `localOk` 是本地判的，`userAnswer` 是真正要提交上去的东西（描红判错时是空串）。
 */
function settle(localOk: boolean, userAnswer: string, ms: number) {
  if (answered.value) return
  answered.value = true
  destroyTrace()
  if (localOk) correctCount.value += 1
  const dur = Math.max(0, Math.min(Math.round(ms), 3600_000))
  totalMs.value += dur

  // 先用本地判分把反馈画出来（错题模式也带上了 hint，所以不用等网络）
  result.value = {
    isCorrect: localOk,
    answer: cur.value.answer,
    xpEarned: 0,
    hint: cur.value.hint,
    wrongTimes: 0,
    badge: null,
  }

  if (mode.value === 'wrong') {
    // 错题模式攒着，一轮结束批量提交（§4.3）
    pending.push({ itemId: cur.value.itemId, userAnswer, durationMs: dur })
    return
  }
  if (localOnly.value) return
  void syncOne(cur.value.itemId, userAnswer, dur, idx.value)
}

/** 课时模式：单题提交。失败即整轮降级（见文件头注释 2） */
async function syncOne(itemId: number, userAnswer: string, durationMs: number, at: number) {
  try {
    const r = await attemptApi.submit({ itemId, userAnswer, durationMs })
    // 印章是"本轮的收获"，与当前停在第几题无关，先收下
    if (r.badge) badges.value.push(r.badge)
    // 但反馈卡不能乱改：用户可能已经翻页了，迟到的响应用在别的题上会显示错误的提示语
    if (idx.value !== at) return
    result.value = r
  } catch {
    localOnly.value = true
  }
}

function next() {
  if (!answered.value) return
  if (isLast.value) {
    void wrapUp()
    return
  }
  idx.value += 1
  resetForQuestion()
}

/* ============================ 收尾 ============================ */

async function wrapUp() {
  phase.value = 'done'
  destroyTrace()
  destroyAudio()
  if (mode.value === 'wrong') {
    await submitWrongRound()
    return
  }
  await submitFinish()
}

async function submitFinish() {
  const t = total.value
  // 后端 total <= 0 直接 400，所以空题量**根本不发**
  if (t <= 0) return
  if (localOnly.value) {
    syncNote.value = '有几题没提交上去，这次的成绩不算数 —— 网络好的时候再练一遍。'
    return
  }
  try {
    finish.value = await attemptApi.finish(lessonId.value, {
      correctCount: correctCount.value,
      total: t,
      durationMs: totalMs.value,
    })
    syncNote.value = ''
  } catch {
    finish.value = null
    syncNote.value = '结算没能提交上去，进度和 XP 这次没记上。'
  }
}

async function submitWrongRound() {
  if (!pending.length) {
    syncNote.value = '这一轮没有提交任何作答。'
    return
  }
  try {
    const r = await wrongApi.practice(pending)
    cleared.value = r.cleared
    remaining.value = r.remaining
    syncNote.value = r.cleared > 0 ? '连着答对两次的题，已经自动移出错题本了。' : ''
  } catch {
    syncNote.value = '重练结果没能提交上去，这一轮不计。'
  }
}

/* ============================ 音频 ============================ */

let audio: any = null

function playAudio() {
  const url = cur.value?.audioUrl
  if (!url) return
  if (!audio) {
    audio = uni.createInnerAudioContext()
    audio.onEnded(() => {
      playing.value = false
    })
    audio.onError(() => {
      playing.value = false
      uni.showToast({ title: '音频放不出来', icon: 'none' })
    })
  }
  try {
    audio.stop()
  } catch {
    /* 还没开始播，stop 会抛，忽略 */
  }
  audio.src = url
  playing.value = true
  audio.play()
}

function destroyAudio() {
  playing.value = false
  if (!audio) return
  try {
    audio.stop()
    audio.destroy()
  } catch {
    /* 已经销毁过 */
  }
  audio = null
}

/* ============================ 导航 ============================ */

function back() {
  uni.navigateBack({
    fail: () => {
      // 直接从链接进来时没有上一页，退回该模式的列表页
      if (mode.value === 'wrong') uni.switchTab({ url: '/pages/wrongbook/wrongbook' })
      else uni.switchTab({ url: '/pages/learn/learn' })
    },
  })
}

function quit() {
  if (phase.value === 'ready' && answeredCount.value > 0) {
    uni.showModal({
      title: '先不练了？',
      content: '这一轮还没做完，成绩不会记下来。',
      confirmText: '退出',
      cancelText: '继续练',
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

function restart() {
  void load()
}

function nextLesson() {
  const id = finish.value?.nextLessonId
  if (!id) return
  // redirectTo：不把结算页留在栈里，退回时直接回课时列表
  uni.redirectTo({ url: `/pages/practice/practice?lessonId=${id}` })
}

/* ============================ 入口 ============================ */

onLoad((query: any) => {
  const m = String(query?.mode || '')
  if (m === 'wrong') {
    mode.value = 'wrong'
    headTitle.value = '错题重练'
  } else {
    mode.value = 'lesson'
    const n = Number(query?.lessonId)
    lessonId.value = Number.isFinite(n) && n > 0 ? Math.trunc(n) : 1
  }
  void load()
})

onUnmounted(() => {
  destroyTrace()
  destroyAudio()
})
</script>

<style scoped>
/* ===== 顶栏 ===== */
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

/* ===== 进度条 ===== */
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

/* ===== 通用状态卡 ===== */
.state {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 64rpx 36rpx;
}
.state-title {
  font-size: 36rpx;
  color: var(--ink);
  margin-bottom: 16rpx;
}
.state-text {
  text-align: center;
  line-height: 1.6;
  margin-bottom: 8rpx;
}
.state-act {
  margin-top: 32rpx;
  padding: 16rpx 56rpx;
  border-radius: 40rpx;
  background: var(--cinnabar);
  color: #fff;
  font-size: 28rpx;
}

/* ===== 题干 ===== */
.stem {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 56rpx 36rpx 40rpx;
  margin-bottom: 32rpx;
}
.stem-big {
  font-family: var(--serif);
  font-size: 120rpx;
  line-height: 1.15;
  color: var(--ink);
  letter-spacing: 4rpx;
}
.stem-big.is-latin {
  font-size: 84rpx;
  letter-spacing: 2rpx;
}
.stem-instr {
  font-size: 34rpx;
  color: var(--ink);
  text-align: center;
  line-height: 1.5;
}
.stem-en {
  margin-top: 16rpx;
  font-size: 24rpx;
  color: var(--muted);
  text-align: center;
}
.stem-miss {
  margin-top: 16rpx;
  text-align: center;
}
.play {
  margin-top: 32rpx;
  display: flex;
  align-items: center;
  padding: 18rpx 44rpx;
  border-radius: 48rpx;
  border: 2rpx solid var(--rule);
  background: var(--wash);
}
.play.is-playing {
  border-color: var(--cinnabar);
}
.play-icon {
  font-size: 28rpx;
  color: var(--cinnabar);
  margin-right: 14rpx;
}
.play-text {
  font-size: 28rpx;
  color: var(--ink);
}

/* ===== 选项 ===== */
.opts {
  display: flex;
  flex-direction: column;
}
.opt {
  background: var(--card);
  border: 2rpx solid var(--rule);
  border-radius: 16rpx;
  padding: 28rpx 32rpx;
  margin-bottom: 20rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 88rpx;
}
.opt.is-right {
  border-color: var(--gilt);
  /* 对/错底色由令牌现算，不写死 —— 写死 #f7f1e2 在深色模式下是一块刺眼的亮斑
     （令牌已切成墨底，这里却还是宣纸色）。
     两条 background 是**真兜底**：不认 color-mix() 的浏览器在 parse time 整条丢弃它，
     于是前一条 var(--wash) 生效 —— 注意这跟「calc() 里塞未知单位」不同，那种是
     「语法合法、计算期才失败」，会盖掉兜底（详见 CLAUDE.md 的 iOS 清单）。 */
  background: var(--wash);
  background: color-mix(in srgb, var(--gilt) 10%, var(--card));
}
.opt.is-wrong {
  border-color: var(--cinnabar);
  background: var(--wash);
  background: color-mix(in srgb, var(--cinnabar) 10%, var(--card));
}
.opt.is-dim {
  opacity: 0.45;
}
.opt-text {
  font-size: 32rpx;
  color: var(--ink);
}
.opt-text.is-hanzi {
  font-family: var(--serif);
  font-size: 52rpx;
  letter-spacing: 2rpx;
}
.opt-skip {
  padding: 32rpx;
  text-align: center;
}
.opt-skip-text {
  font-size: 28rpx;
  color: var(--muted);
  text-decoration: underline;
}

/* ===== 描红 ===== */
.trace {
  display: flex;
  flex-direction: column;
  align-items: center;
}
.trace-box,
.trace-static {
  background: var(--card);
  border: 2rpx solid var(--rule);
  border-radius: 20rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  overflow: hidden;
}
/* 米字格：两条对角线靠渐变画，比引一张背景图省事，也不增加构建产物 */
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
.trace-tip {
  margin-top: 20rpx;
  text-align: center;
  line-height: 1.6;
}
.trace-acts {
  margin-top: 24rpx;
  display: flex;
  flex-direction: row;
  gap: 20rpx;
}
.trace-btn {
  padding: 16rpx 40rpx;
  border-radius: 40rpx;
  border: 2rpx solid var(--rule);
  font-size: 28rpx;
  color: var(--ink);
}
.trace-btn.main {
  background: var(--cinnabar);
  border-color: var(--cinnabar);
  color: #fff;
}
.trace-btn.ghost {
  color: var(--muted);
}

/* ===== 反馈 ===== */
.fb {
  margin-top: 32rpx;
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
  margin-bottom: 12rpx;
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
  color: var(--ink);
}
.fb-answer {
  display: flex;
  align-items: baseline;
  margin-top: 8rpx;
}
.fb-answer-k {
  font-size: 24rpx;
  color: var(--muted);
  margin-right: 16rpx;
}
.fb-answer-v {
  font-size: 44rpx;
  color: var(--cinnabar);
}
/* 答案是英文/拼音时（meaning 的答案是 "sun"，recognize 的是 "rì"），
   别拿宋体去排拉丁字母 —— 按内容判，不按题型判 */
.fb-answer-v.is-latin {
  font-family: var(--sans);
  font-size: 40rpx;
  letter-spacing: 0.03em;
}
.fb-hint {
  display: block;
  margin-top: 16rpx;
  line-height: 1.6;
}
.fb-meta {
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  margin-top: 16rpx;
}
.fb-xp {
  font-size: 26rpx;
  color: var(--gilt);
  margin-right: 24rpx;
}
.fb-times {
  font-size: 24rpx;
  color: var(--muted);
  margin-right: 24rpx;
}
.fb-badge {
  margin-top: 16rpx;
  font-size: 26rpx;
  color: var(--cinnabar);
}

/* ===== 继续 ===== */
.next {
  margin-top: 40rpx;
  padding: 30rpx;
  border-radius: 48rpx;
  background: var(--ink);
  text-align: center;
}
.next-text {
  color: var(--paper);
  font-family: var(--serif);
  font-size: 34rpx;
  letter-spacing: 4rpx;
}

/* ===== 结算 ===== */
.sum-top {
  padding: 56rpx 36rpx 40rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
}
.sum-score {
  display: flex;
  align-items: baseline;
}
.sum-num {
  font-size: 112rpx;
  color: var(--cinnabar);
  line-height: 1;
}
.sum-den {
  font-size: 36rpx;
  color: var(--muted);
  margin-left: 12rpx;
}
.sum-word {
  margin-top: 20rpx;
  font-size: 44rpx;
  color: var(--ink);
}
.sum-sub {
  margin-top: 12rpx;
  text-align: center;
}
.sum-rows {
  width: 100%;
  margin-top: 40rpx;
  border-top: 2rpx solid var(--rule);
  padding-top: 8rpx;
}
.sum-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20rpx 0;
  border-bottom: 2rpx solid var(--rule);
}
.sum-k {
  font-size: 26rpx;
  color: var(--muted);
}
.sum-v {
  font-size: 28rpx;
  color: var(--ink);
}
.sum-badges {
  margin-top: 24rpx;
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
}
.sum-badge {
  font-size: 26rpx;
  color: var(--cinnabar);
  margin-right: 20rpx;
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
.act-main.alt {
  background: var(--gilt);
}
.act-ghost {
  padding: 26rpx;
  text-align: center;
  font-size: 30rpx;
  color: var(--muted);
}
</style>
