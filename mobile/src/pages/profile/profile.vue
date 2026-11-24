<script setup lang="ts">
import { computed, ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { getUserInfo, isLoggedIn, logout } from '../../utils/auth'
import type { UserInfo } from '../../utils/auth'
import { profileApi } from '../../api/user'
import type { ProfileSummary } from '../../api/user'
import { checkinApi } from '../../api/checkin'
import { RANK_TIERS, rankMinOf, nextRankMin } from '../../api/xp'

/**
 * 「我的」页 —— 契约 §4.5 §4.6
 * 归属：**fe-game**
 *
 * ⚠️ §8 验收铁律：这一页的所有数字来自**一个** `GET /profile/summary`，
 *    **不是** N 个请求（checkin/status + rank/week + stamps）在客户端拼起来。
 *    所以本文件里除了「点打卡」这一个**用户动作**之外，只有一次取数请求。
 *    要加新数字 → 让 be-api 加进 summary 的 payload，不要在这里再发一个请求。
 *
 * 用 onShow 而不是 onMounted：这是 tabBar 页，从答题/对战返回时数字要立刻变。
 */

const logged = ref(false)
const user = ref<UserInfo | null>(null)

const summary = ref<ProfileSummary | null>(null)
const loading = ref(false)
/** 拉不到就明说原因，不摆一排 0 出来 —— 0 会被当成「你没练」，其实只是没接上 */
const loadError = ref('')

const checking = ref(false)

const joinedAt = computed(() => {
  const t = user.value?.createdAt
  return t ? String(t).slice(0, 10) : ''
})

/** 段位阶梯：门槛与名称与后端 constants.RANK_TIERS 同源（见 api/xp.ts 的说明） */
const ladder = computed(() =>
  RANK_TIERS.map((t) => ({ ...t, reached: (summary.value?.xp.total ?? 0) >= t.min }))
)

const level = computed(() => summary.value?.rank.level ?? 1)
const curXp = computed(() => summary.value?.xp.total ?? 0)
/** 距离下一级还差多少；已满级为 null */
const toNext = computed(() => {
  const n = nextRankMin(curXp.value)
  return n === null ? null : n - curXp.value
})
const nextName = computed(() => {
  const n = nextRankMin(curXp.value)
  if (n === null) return ''
  return RANK_TIERS.find((t) => t.min === n)?.name ?? ''
})
/** 本段位内的进度 0–100（首段起点为 0，末段满了给 100） */
const levelPercent = computed(() => {
  const lo = rankMinOf(curXp.value)
  const hi = nextRankMin(curXp.value)
  if (hi === null) return 100
  if (hi <= lo) return 100
  return Math.max(0, Math.min(100, Math.round(((curXp.value - lo) / (hi - lo)) * 100)))
})

const accuracyPercent = computed(() => {
  const a = summary.value?.learn.accuracy ?? 0
  return Math.max(0, Math.min(100, Math.round(a * 100)))
})

const stampTotal = computed(() => summary.value?.stamps.total ?? 0)
const stampEarned = computed(() => summary.value?.stamps.earned ?? 0)

onShow(async () => {
  logged.value = isLoggedIn()
  user.value = getUserInfo()
  await loadSummary()
})

async function loadSummary() {
  if (!isLoggedIn()) {
    summary.value = null
    return
  }
  loading.value = true
  loadError.value = ''
  try {
    // ⚠️ request.ts 已拆过一层包：res 就是契约里的 data，不是 res.data
    summary.value = await profileApi.summary()
    // 顺带把接口里的用户信息同步到本地（昵称改过就能立刻反映），不额外发请求
    if (summary.value?.user) {
      const merged: UserInfo = {
        id: summary.value.user.id,
        username: summary.value.user.username,
        nickname: summary.value.user.nickname,
        avatarUrl: summary.value.user.avatarUrl,
        createdAt: user.value?.createdAt ?? null,
      }
      uni.setStorageSync('userInfo', merged)
      user.value = merged
    }
  } catch (e: any) {
    summary.value = null
    // 拦截器已经弹过 toast，这里只写页面内的说明，不重复弹
    loadError.value = e?.message || '战绩没取回来'
    if (!isLoggedIn()) {
      logged.value = false
      user.value = null
    }
  } finally {
    loading.value = false
  }
}

async function doCheckin() {
  if (checking.value) return
  checking.value = true
  try {
    const res = await checkinApi.check()
    uni.showToast({
      title: res.created ? `打卡成功 +${res.xpEarned} XP` : '今天已经打过卡了',
      icon: 'none',
    })
    // 打卡会改连击与 XP，重新拉一次 summary（仍然只有这一个取数接口）
    await loadSummary()
  } catch {
    /* 拦截器已提示 */
  } finally {
    checking.value = false
  }
}

function goLogin() {
  uni.navigateTo({ url: '/pages/login/login' })
}
function goRank() {
  uni.navigateTo({ url: '/pages/rank/rank' })
}
function goStamp() {
  uni.navigateTo({ url: '/pages/stamp/stamp' })
}
function goTeam() {
  uni.navigateTo({ url: '/pages/team/team' })
}
function goDuel() {
  uni.navigateTo({ url: '/pages/duel/duel' })
}
function goMe() {
  if (summary.value?.user.id) uni.navigateTo({ url: `/pages/user/user?id=${summary.value.user.id}` })
}

function doLogout() {
  uni.showModal({
    title: '退出登录',
    content: '练习记录还在服务器上，重新登录就能看到。',
    confirmText: '退出',
    cancelText: '再想想',
    success: (res) => {
      if (!res.confirm) return
      logout()
      logged.value = false
      user.value = null
      summary.value = null
      uni.showToast({ title: '已退出', icon: 'none' })
    },
  })
}
</script>

<template>
  <view class="hd-page profile">
    <!-- 头部：登录态 -->
    <view v-if="logged && user" class="me">
      <view class="me-line" @tap="goMe">
        <text class="me-name hd-title">{{ user.nickname || '同学' }}</text>
        <text v-if="summary" class="me-rank hd-seal">{{ summary.rank.rankName }}</text>
      </view>
      <text class="me-id">@{{ user.username }}</text>
      <text v-if="joinedAt" class="me-since hd-note">自 {{ joinedAt }} 起在练</text>
    </view>

    <view v-else class="me">
      <text class="me-name hd-title">还没登录</text>
      <text class="me-id">登录后练习记录才会跟人走</text>
      <view class="me-login" @tap="goLogin">登录 / 注册</view>
    </view>

    <!-- 战绩：全部来自 GET /profile/summary 一次请求 -->
    <template v-if="logged">
      <view class="hd-rule">
        <view class="line"></view>
        <text class="glyph">绩</text>
        <view class="line"></view>
      </view>

      <view v-if="loading && !summary" class="hd-card state">
        <text class="state-title hd-title">正在取战绩</text>
        <text class="hd-note state-note">稍等一下。</text>
      </view>

      <view v-else-if="loadError" class="hd-card state">
        <text class="state-title hd-title">战绩没取回来</text>
        <text class="hd-note state-note">{{ loadError }}</text>
        <view class="state-btn" @tap="loadSummary">重试</view>
      </view>

      <template v-else-if="summary">
        <!-- 连击 + 打卡 -->
        <view class="hd-card streak-card">
          <view class="streak-l">
            <text class="streak-num hd-title">{{ summary.streak.current }}</text>
            <text class="streak-unit">天连击</text>
            <text class="hd-note streak-max">最长 {{ summary.streak.max }} 天</text>
          </view>
          <view
            class="checkin-btn"
            :class="{ 'checkin-done': summary.todayCheckedIn || checking }"
            @tap="doCheckin"
          >
            {{ summary.todayCheckedIn ? '今日已打卡' : checking ? '打卡中…' : '打卡 +5' }}
          </view>
        </view>

        <!-- 四个数字 -->
        <view class="grid">
          <view class="cell hd-card">
            <text class="cell-num hd-title">{{ summary.xp.total }}</text>
            <text class="cell-lb">累计 XP</text>
          </view>
          <view class="cell hd-card">
            <text class="cell-num hd-title">{{ summary.xp.week }}</text>
            <text class="cell-lb">本周 XP</text>
          </view>
          <view class="cell hd-card">
            <text class="cell-num hd-title">{{ summary.learn.lessonsDone }}</text>
            <text class="cell-lb">完成课时 / {{ summary.learn.lessonsTotal }}</text>
          </view>
          <view class="cell hd-card">
            <text class="cell-num hd-title">{{ accuracyPercent }}<text class="cell-pct">%</text></text>
            <text class="cell-lb">正确率</text>
          </view>
        </view>

        <!-- 周榜名次 + 印章 入口 -->
        <view class="rows">
          <view class="row" @tap="goRank">
            <text class="row-k">本周排名</text>
            <text class="row-v">
              {{ summary.rank.weekRank ? '第 ' + summary.rank.weekRank + ' 名' : '本周还没上榜' }}
            </text>
            <text class="row-go">›</text>
          </view>
          <view class="row" @tap="goStamp">
            <text class="row-k">印章</text>
            <text class="row-v">{{ stampEarned }} / {{ stampTotal }} 枚</text>
            <text class="row-go">›</text>
          </view>
          <view class="row" @tap="goTeam">
            <text class="row-k">学习小组</text>
            <text class="row-v">和同学一起练</text>
            <text class="row-go">›</text>
          </view>
          <view class="row" @tap="goDuel">
            <text class="row-k">PK 对战</text>
            <text class="row-v">出题给同学答</text>
            <text class="row-go">›</text>
          </view>
        </view>

        <!-- 段位阶梯 -->
        <view class="hd-rule">
          <view class="line"></view>
          <text class="glyph">级</text>
          <view class="line"></view>
        </view>

        <view class="section">
          <view class="section-head">
            <text class="section-cn hd-title">段位 · {{ summary.rank.rankName }}</text>
            <text class="section-note">
              {{ toNext === null ? '已到顶了' : '还差 ' + toNext + ' XP 升 ' + nextName }}
            </text>
          </view>
          <view class="ladder">
            <text
              v-for="t in ladder"
              :key="t.name"
              class="rung"
              :class="{ 'rung-on': t.reached, 'rung-cur': t.name === summary.rank.rankName }"
            >{{ t.name }}</text>
          </view>
          <view class="bar">
            <view class="bar-fill" :style="{ width: levelPercent + '%' }"></view>
          </view>
          <text class="hd-note ladder-note">
            积 {{ curXp }} XP · 第 {{ level }} 级（共 {{ RANK_TIERS.length }} 级）。
            段位只升不降，练得慢也不会掉下来。
          </text>
        </view>
      </template>
    </template>

    <view v-if="logged" class="danger" @tap="doLogout">退出登录</view>

    <text class="foot hd-note">汉语搭子 v0.1.0</text>
  </view>
</template>

<style>
.profile {
  padding-top: 56rpx;
}

.me {
  display: flex;
  flex-direction: column;
  gap: 12rpx;
}
.me-line {
  display: flex;
  align-items: center;
  gap: 20rpx;
}
.me-name {
  font-size: 48rpx;
  letter-spacing: 0.1em;
}
.me-rank {
  flex-shrink: 0;
}
.me-id {
  font-size: 26rpx;
  color: var(--muted);
  letter-spacing: 0.04em;
}
.me-since {
  font-size: 24rpx;
}
.me-login {
  display: inline-block;
  align-self: flex-start;
  margin-top: 20rpx;
  padding: 16rpx 44rpx;
  font-size: 28rpx;
  letter-spacing: 0.14em;
  color: #fcfaf5;
  background: var(--cinnabar);
  border-radius: 10rpx;
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
.state-btn {
  display: inline-block;
  margin-top: 28rpx;
  padding: 14rpx 38rpx;
  font-size: 27rpx;
  letter-spacing: 0.12em;
  color: var(--cinnabar);
  border: 2rpx solid var(--cinnabar);
  border-radius: 10rpx;
}

/* 连击卡片：左边天数，右边打卡按钮 */
.streak-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24rpx;
  padding: 32rpx 36rpx;
}
.streak-l {
  display: flex;
  align-items: baseline;
  gap: 12rpx;
  min-width: 0;
}
.streak-num {
  font-size: 64rpx;
  line-height: 1;
  color: var(--cinnabar);
}
.streak-unit {
  font-size: 26rpx;
  color: var(--ink);
}
.streak-max {
  font-size: 23rpx;
  margin-left: 6rpx;
}
.checkin-btn {
  flex-shrink: 0;
  padding: 16rpx 32rpx;
  font-size: 26rpx;
  letter-spacing: 0.08em;
  color: #fcfaf5;
  background: var(--cinnabar);
  border-radius: 10rpx;
}
.checkin-done {
  color: var(--muted);
  background: var(--wash);
}

.grid {
  display: flex;
  flex-wrap: wrap;
  gap: 20rpx;
  margin-top: 20rpx;
}
.cell {
  flex: 1 1 calc(50% - 10rpx);
  box-sizing: border-box;
  padding: 26rpx 24rpx;
}
.cell-num {
  display: block;
  font-size: 46rpx;
  line-height: 1.1;
  color: var(--gilt);
}
.cell-pct {
  font-size: 26rpx;
}
.cell-lb {
  display: block;
  margin-top: 8rpx;
  font-size: 23rpx;
  color: var(--muted);
}

.rows {
  margin-top: 20rpx;
  border: 1rpx solid var(--rule);
  border-radius: 16rpx;
  overflow: hidden;
  background: var(--card);
}
.row {
  display: flex;
  align-items: center;
  gap: 16rpx;
  padding: 26rpx 30rpx;
  border-bottom: 1rpx solid var(--rule);
}
.row:last-child {
  border-bottom: none;
}
.row-k {
  flex-shrink: 0;
  font-size: 27rpx;
  letter-spacing: 0.06em;
}
.row-v {
  flex: 1;
  min-width: 0;
  text-align: right;
  font-size: 25rpx;
  color: var(--muted);
}
.row-go {
  flex-shrink: 0;
  font-size: 32rpx;
  color: var(--rule);
  line-height: 1;
}

.section-head {
  display: flex;
  align-items: baseline;
  gap: 18rpx;
  margin-bottom: 26rpx;
}
.section-cn {
  font-size: 34rpx;
  letter-spacing: 0.1em;
}
.section-note {
  font-size: 24rpx;
  color: var(--muted);
}

/* 段位阶梯：五级横向排开 */
.ladder {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10rpx;
}
.rung {
  padding: 8rpx 16rpx;
  font-family: var(--serif);
  font-size: 25rpx;
  letter-spacing: 0.06em;
  color: var(--muted);
  background: var(--wash);
  border-radius: 8rpx;
  opacity: 0.55;
}
.rung-on {
  color: var(--gilt);
  opacity: 1;
}
.rung-cur {
  color: var(--cinnabar);
  border: 2rpx solid var(--cinnabar);
}
.ladder-note {
  display: block;
  margin-top: 24rpx;
}

.bar {
  margin-top: 24rpx;
  height: 8rpx;
  border-radius: 6rpx;
  background: var(--wash);
  overflow: hidden;
}
.bar-fill {
  height: 100%;
  background: var(--gilt);
  border-radius: 6rpx;
  transition: width 0.3s ease;
}

.danger {
  margin-top: 64rpx;
  padding: 26rpx 0;
  text-align: center;
  font-size: 28rpx;
  letter-spacing: 0.14em;
  color: var(--cinnabar);
  border: 1rpx solid var(--rule);
  border-radius: 12rpx;
}

.foot {
  display: block;
  margin-top: 56rpx;
  font-size: 23rpx;
  text-align: center;
}
</style>
