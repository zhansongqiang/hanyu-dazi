<script setup lang="ts">
import { computed, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { duelApi } from '../../api/duel'
import type { DuelDetail, DuelRecentItem, DuelSubmitResult } from '../../api/duel'
import { isLoggedIn } from '../../utils/auth'
import { shareUrl } from '../../utils/app-base'

/**
 * 对战结果 —— 契约 §4.4
 * 归属：**fe-game**
 *
 * ⚠️ **最大的坑**：`GET /duels/:code` **不返回对手**的任何字段，
 *    只有 `challengerName/challengerScore/challengerMs`。
 *    所以「双方对比」这份数据只有三个来路，按优先级：
 *      1. 本机刚交卷时存下的 `POST /duels/:code/submit` 响应 —— 唯一**完整**的一份
 *         （有双方分数、双方用时、服务端判的 winner）。
 *      2. `GET /duels/recent`（要登录）里按 code 找到的那条 —— 有双方分数，**没有用时**。
 *      3. `GET /duels/:code` —— 只有发起人一侧。
 *    拿不到完整数据时就**老老实实只画拿到的那半**，不要自己拿分数算一遍 winner
 *    再当成结论显示：同分要靠用时定胜负，而 2、3 两条路都没有用时。
 *    （已作为 CHANGE-REQUEST 提给编排者：希望 `GET /duels/:code` 也带上对手字段。）
 *
 * ⚠️ 这是**分享链接的落地页之一**，未登录必须能看 —— 不要在这里 requireLogin()。
 */

type Side = { name: string; score: number | null; ms: number | null }

const code = ref('')
const loading = ref(true)
const loadError = ref('')
const detail = ref<DuelDetail | null>(null)
/** 本机交卷响应（最完整的一份） */
const snap = ref<DuelSubmitResult | null>(null)
/** 登录后从 /duels/recent 补到的那条（能补对手的名字和分数） */
const rival = ref<DuelRecentItem | null>(null)

const logged = ref(false)

/** 本机交卷标记的 key —— 要和 duel.vue 里写的一致 */
function resultKey(c: string) {
  return `duelResult:${String(c).trim().toUpperCase()}`
}

onLoad((query) => {
  logged.value = isLoggedIn()
  code.value = String(query?.code ?? '').trim().toUpperCase()
  if (!code.value) {
    loading.value = false
    loadError.value = '缺少挑战口令，不知道看哪一场。'
    return
  }
  snap.value = uni.getStorageSync(resultKey(code.value)) || null
  load()
})

async function load() {
  loading.value = true
  loadError.value = ''
  const c = code.value
  try {
    detail.value = await duelApi.detail(c)
  } catch (e: any) {
    detail.value = null
    loadError.value = e?.message || '这场对战没打开'
    loading.value = false
    return
  }
  // recent 要登录；没登录就跳过，不算失败
  if (logged.value) {
    try {
      const list = await duelApi.recent()
      rival.value = (list || []).find((r) => r.code === c) ?? null
    } catch {
      rival.value = null
    }
  }
  loading.value = false
}

/* ---------- 把三路数据拼成一份展示模型 ---------- */

const status = computed(() => detail.value?.status ?? null)
const lessonTitle = computed(() => detail.value?.lessonTitle ?? '')
const myRole = computed<'challenger' | 'opponent' | null>(() => {
  if (snap.value) return snap.value.role
  if (rival.value) return rival.value.role
  return null
})

/** 发起人一侧：detail 一定有，优先用 detail（最新） */
const challengerSide = computed<Side>(() => {
  if (snap.value) {
    const s = snap.value.challenger
    return { name: s?.name || '发起人', score: s?.score ?? null, ms: s?.ms ?? null }
  }
  return {
    name: detail.value?.challengerName || '发起人',
    score: detail.value?.challengerScore ?? null,
    ms: detail.value?.challengerMs ?? null,
  }
})

/** 对手一侧：只有 snap / recent 有 */
const opponentSide = computed<Side | null>(() => {
  if (snap.value) {
    const s = snap.value.opponent
    return { name: s?.name || '对手', score: s?.score ?? null, ms: s?.ms ?? null }
  }
  if (rival.value) {
    return { name: rival.value.rivalName || '对手', score: rival.value.rivalScore ?? null, ms: null }
  }
  return null
})

/** 双方分数都拿到了吗 —— 只有拿到才画对比，否则画「等对手」 */
const bothScored = computed(
  () => challengerSide.value.score !== null && (opponentSide.value?.score ?? null) !== null
)

/**
 * 我自己那一侧。
 * ⚠️ 别只看 challengerSide 判断"有没有人答过"：应战的人（游客）答完落在这里时，
 *    challenger 那格必然是空的，只判 challenger 就会给刚交完卷的人显示「还没人作答」——
 *    实测就是这么错的（游客交卷后 challenger.score 仍是 null）。
 */
const mySelfSide = computed<Side | null>(() => {
  if (myRole.value === 'challenger') return challengerSide.value
  if (myRole.value === 'opponent') return opponentSide.value
  return null
})
const iScored = computed(() => (mySelfSide.value?.score ?? null) !== null)

/**
 * 我还能不能答这一场 —— 决定「我来答这一场」按钮出不出来。
 * 「一人一套题只算一次成绩」：已经交过卷的人不再给按钮（后端会覆盖，但那是给网络重试兜底的，
 * 不该变成"再刷一次分"的入口）；对手位已经被人占了的话，别人再来也写不进去，索性不摆按钮。
 */
const canAnswer = computed(() => {
  if (status.value !== 'open') return false
  if (iScored.value) return false
  if (myRole.value === 'challenger') return true // 发起人还没答（答过的上一行已经挡掉）
  return (opponentSide.value?.score ?? null) === null
})

/**
 * 结论。**只认服务端判的 winner**（snap.winner）；
 * recent 那条没有 winner，就用分数比一下 —— 分数不同时高者胜是契约里写死的规则；
 * 分数相同时**不下结论**（要比起用时而 recent 没有用时）。
 */
const verdict = computed<
  { kind: 'win' | 'lose' | 'tie' | 'even' | 'waiting' | 'none'; text: string; sub: string }
>(() => {
  const role = myRole.value
  if (snap.value && snap.value.winner) {
    const w = snap.value.winner
    if (w === 'tie') return { kind: 'tie', text: '打平', sub: '得分和用时都一样，握手言和。' }
    const iWon = (w === 'challenger' && role === 'challenger') || (w === 'opponent' && role === 'opponent')
    return iWon
      ? { kind: 'win', text: '你赢了', sub: '分数压过对方一头。' }
      : { kind: 'lose', text: '你输了', sub: '这回差一点，下回再来。' }
  }
  if (bothScored.value) {
    const mine = (role === 'challenger' ? challengerSide.value : opponentSide.value)?.score ?? 0
    const theirs = (role === 'challenger' ? opponentSide.value : challengerSide.value)?.score ?? 0
    if (mine > theirs) return { kind: 'win', text: '你赢了', sub: '分数压过对方一头。' }
    if (mine < theirs) return { kind: 'lose', text: '你输了', sub: '这回差一点，下回再来。' }
    return { kind: 'even', text: '分数持平', sub: '同分要比起用时，这里看不到，以服务端的结果为准。' }
  }
  if (iScored.value) {
    return { kind: 'waiting', text: '已交卷', sub: '你这边有成绩了，等另一方来答。' }
  }
  const rivalScored = (opponentSide.value?.score ?? null) !== null
  // 我是发起人本人、还没答 —— 应战位是别人的事，我答完就出结果（后端的守卫只管应战位）
  if (myRole.value === 'challenger') {
    return rivalScored
      ? { kind: 'waiting', text: '轮到你了', sub: '对手已经交了卷，你答完就出结果。' }
      : { kind: 'none', text: '还没人作答', sub: '把这场的链接发出去，或者自己先答一遍。' }
  }
  // 应战位已经被别人占了（后端 first-write-wins）—— 再来的人答了也写不进去，别给"你还能答"的错觉
  if (rivalScored) {
    return { kind: 'waiting', text: '已有对手应战', sub: '这一场已经有人答过了，一人只算一次成绩。' }
  }
  // 发起人已经有分、应战位还空着 —— 谁点开谁就能应战
  if (challengerSide.value.score !== null) {
    return { kind: 'waiting', text: '还差一个人', sub: '发起人已经有分了，点下面的按钮应战。' }
  }
  if (status.value && status.value !== 'open') {
    return { kind: 'none', text: '没人作答就结束了', sub: '这一场已经结束，两边都没有成绩。' }
  }
  return { kind: 'none', text: '还没人作答', sub: '把这场的链接发出去，或者自己先答一遍。' }
})

/* ---------- 交互 ---------- */

function goAnswer() {
  uni.navigateTo({ url: `/pages/duel/duel?code=${code.value}` })
}

/**
 * 分享链接要是**能直接点开**的绝对地址，相对路径发给同学等于发了个死链。
 *
 * ⚠️ 与 `duel.vue` 同一个坑：原来用 `window.location.origin` 拼，
 *    浏览器里对，打包成 APP 之后会变成 `https://localhost/#/…`（死链）。
 *    站点源统一由 `utils/app-base.ts` 按运行形态给。
 */
function shareUrlOf(c: string) {
  return shareUrl(`/pages/duel/duel?code=${c}`)
}

function copyShare() {
  const s = detail.value
  uni.setClipboardData({
    data: `汉语搭子对战《${s?.lessonTitle ?? ''}》：${shareUrlOf(code.value)}（口令 ${code.value}）`,
    success: () => uni.showToast({ title: '链接已复制', icon: 'none' }),
  })
}

function goDuelHome() {
  uni.redirectTo({ url: '/pages/duel/duel' })
}

function goHome() {
  uni.reLaunch({ url: '/pages/learn/learn' })
}

function secs(ms: number | null) {
  if (ms === null || ms === undefined) return '—'
  return `${(ms / 1000).toFixed(1)} 秒`
}

const statusLabel = computed(() => {
  if (status.value === 'open') return `进行中 · 到 ${String(detail.value?.expiresAt ?? '').slice(0, 16)} 截止`
  if (status.value === 'expired') return '已过期'
  return '已结束'
})
</script>

<template>
  <view class="hd-page result">
    <view v-if="loading" class="hd-card state">
      <text class="state-title hd-title">正在取结果</text>
      <text class="hd-note state-note">稍等一下。</text>
    </view>

    <view v-else-if="loadError" class="hd-card state">
      <text class="state-title hd-title">结果没打开</text>
      <text class="hd-note state-note">{{ loadError }}</text>
      <view class="state-acts">
        <view class="state-btn" @tap="goDuelHome">去发起一场</view>
        <view class="state-btn state-btn-dim" @tap="goHome">回首页</view>
      </view>
    </view>

    <template v-else-if="detail">
      <text class="hd-title title">对战结果</text>
      <text class="hd-note sub">《{{ lessonTitle }}》 · 口令 {{ code }}</text>
      <text class="hd-note state-line">{{ statusLabel }}</text>

      <!-- 结论 -->
      <view class="verdict hd-card" :class="'v-' + verdict.kind">
        <text class="v-text hd-title">{{ verdict.text }}</text>
        <text class="v-sub hd-note">{{ verdict.sub }}</text>
      </view>

      <!-- 对比：只有拿得到两边分数才画成两边 -->
      <view class="side" :class="{ 'side-solo': !opponentSide }">
        <view class="side-cell hd-card" :class="{ 'side-me': myRole === 'challenger' }">
          <text class="side-role hd-note">发起人</text>
          <text class="side-name">{{ challengerSide.name }}</text>
          <text class="side-score hd-title">
            {{ challengerSide.score === null ? '—' : challengerSide.score }}
          </text>
          <text class="side-ms hd-note">用时 {{ secs(challengerSide.ms) }}</text>
        </view>

        <view v-if="opponentSide" class="side-cell hd-card" :class="{ 'side-me': myRole === 'opponent' }">
          <text class="side-role hd-note">对手</text>
          <text class="side-name">{{ opponentSide.name }}</text>
          <text class="side-score hd-title">
            {{ opponentSide.score === null ? '—' : opponentSide.score }}
          </text>
          <text class="side-ms hd-note">
            {{ opponentSide.ms === null ? '用时未取到' : '用时 ' + secs(opponentSide.ms) }}
          </text>
        </view>

        <view v-else class="side-cell hd-card side-ghost">
          <text class="side-role hd-note">对手</text>
          <text class="side-name">还没有人应答</text>
          <text class="side-score hd-title">—</text>
          <text class="side-ms hd-note">等你来答</text>
        </view>
      </view>

      <text v-if="opponentSide && opponentSide.ms === null" class="hd-note note">
        对手的用时这里取不到（对手信息只在交卷那一刻返回），所以同分时不下结论。
      </text>
      <text v-else-if="!opponentSide && status === 'open'" class="hd-note note">
        这一场还开着，谁先答谁先得分。
      </text>

      <template v-if="status === 'open'">
        <view v-if="canAnswer" class="btn" @tap="goAnswer">我来答这一场</view>
        <view class="btn btn-line" @tap="copyShare">把链接发给同学</view>
      </template>
      <template v-else>
        <view class="btn btn-line" @tap="goDuelHome">我也出一套题</view>
        <view class="btn btn-line" @tap="goHome">回首页</view>
      </template>

      <text class="hd-note foot">
        对战只在 7 天内有效，一人一套题只算一次成绩。
      </text>
    </template>
  </view>
</template>

<style>
.result {
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
.state-line {
  display: block;
  margin-top: 8rpx;
  font-size: 22rpx;
}

.state {
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
  gap: 20rpx;
  margin-top: 28rpx;
}
.state-btn {
  padding: 14rpx 38rpx;
  font-size: 27rpx;
  letter-spacing: 0.12em;
  color: var(--cinnabar);
  border: 2rpx solid var(--cinnabar);
  border-radius: 10rpx;
}
.state-btn-dim {
  color: var(--muted);
  border-color: var(--rule);
}

.verdict {
  margin-top: 32rpx;
  padding: 44rpx 36rpx;
  text-align: center;
}
.v-text {
  display: block;
  font-size: 52rpx;
  letter-spacing: 0.16em;
}
.v-sub {
  display: block;
  margin-top: 14rpx;
  font-size: 23rpx;
  line-height: 1.6;
}
.v-win .v-text {
  color: var(--cinnabar);
}
.v-lose .v-text,
.v-even .v-text {
  color: var(--gilt);
}
.v-waiting .v-text,
.v-none .v-text {
  color: var(--muted);
}

.side {
  display: flex;
  gap: 20rpx;
  margin-top: 24rpx;
}
.side-cell {
  flex: 1;
  min-width: 0;
  padding: 32rpx 24rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8rpx;
}
.side-me {
  border-color: var(--cinnabar);
}
.side-ghost {
  border-style: dashed;
}
.side-role {
  font-size: 22rpx;
}
.side-name {
  max-width: 100%;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-size: 28rpx;
}
.side-score {
  font-size: 60rpx;
  line-height: 1.1;
  color: var(--gilt);
}
.side-ms {
  font-size: 21rpx;
}

.note {
  display: block;
  margin-top: 24rpx;
  font-size: 22rpx;
  line-height: 1.6;
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
  margin-top: 20rpx;
  color: var(--cinnabar);
  background: transparent;
  border: 2rpx solid var(--cinnabar);
}

.foot {
  display: block;
  margin-top: 48rpx;
  font-size: 22rpx;
  text-align: center;
}
</style>
