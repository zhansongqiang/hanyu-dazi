<script setup lang="ts">
import { computed, ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { rankApi } from '../../api/xp'
import type { WeekRankResult } from '../../api/xp'
import { isLoggedIn } from '../../utils/auth'

/**
 * 周排行榜 —— 契约 §4.6
 * 归属：**fe-game**
 *
 * ⚠️ `me` 可能为 **null**（本周 0 XP 没上榜）。null 上取 `.rank` 会直接抛错白屏，
 *    所以模板里一律 `v-if="data.me"` 分支，不要写 `data.me.rank` 裸取。
 * ⚠️ 周起点由后端给（weekStart/weekEnd），前端**不要**自己推日期算「本周」——
 *    本地时区一歪就和后端对不上，而且后端的周是从**周一**起的。
 * ⚠️ rankName 是按**累计** XP 判的段位，不是周榜名次，别把两件事混在一行显示。
 */

const data = ref<WeekRankResult | null>(null)
const loading = ref(false)
const loadError = ref('')
/** 未登录：`/rank/week` 是登录级接口，别把后端那句「未登录」当错误文案摆出来 */
const needLogin = ref(false)

const list = computed(() => data.value?.list ?? [])
const me = computed(() => data.value?.me ?? null)
/** 我在榜单里是否已经有行 —— 有的话底部就不再重复画一遍自己的条 */
const meInList = computed(() => list.value.some((r) => r.isMe))

const weekLabel = computed(() => {
  const d = data.value
  if (!d?.weekStart || !d?.weekEnd) return ''
  return `${d.weekStart} — ${d.weekEnd}`
})

onShow(() => {
  if (!isLoggedIn()) {
    // 游客也能知道「榜在这儿」：不发请求，直接给登录入口（发了也是一句「未登录」）
    data.value = null
    loading.value = false
    needLogin.value = true
    return
  }
  load()
})

async function load() {
  loading.value = true
  loadError.value = ''
  needLogin.value = false
  try {
    data.value = await rankApi.week(50)
  } catch (e: any) {
    data.value = null
    if (!isLoggedIn()) {
      // token 过期：拦截器已清登录态，给登录入口而不是「重试」
      needLogin.value = true
      return
    }
    loadError.value = e?.message || '榜单没取回来'
  } finally {
    loading.value = false
  }
}

function goUser(item: { userId: number; isMe: boolean }) {
  if (item.isMe) {
    uni.switchTab({ url: '/pages/profile/profile' })
    return
  }
  uni.navigateTo({ url: `/pages/user/user?id=${item.userId}` })
}

function goLogin() {
  uni.navigateTo({ url: '/pages/login/login' })
}
</script>

<template>
  <view class="hd-page rank">
    <text class="hd-title title">本周排行</text>
    <text v-if="weekLabel" class="hd-note week">{{ weekLabel }}</text>

    <view v-if="loading && !data" class="hd-card state">
      <text class="state-title hd-title">正在取榜单</text>
      <text class="hd-note state-note">稍等一下。</text>
    </view>

    <view v-else-if="needLogin" class="hd-card state">
      <text class="state-title hd-title">先登录</text>
      <text class="hd-note state-note">排行跟账号走，登录后才能看到自己和同学的名次。</text>
      <view class="state-btn" @tap="goLogin">登录 / 注册</view>
    </view>

    <view v-else-if="loadError" class="hd-card state">
      <text class="state-title hd-title">榜单没取回来</text>
      <text class="hd-note state-note">{{ loadError }}</text>
      <view class="state-btn" @tap="load">重试</view>
    </view>

    <template v-else-if="data">
      <!-- 前三名单独起个小台子，视觉上先给人看 -->
      <view v-if="list.length" class="podium">
        <view
          v-for="r in list.slice(0, 3)"
          :key="r.userId"
          class="podium-item"
          :class="{ 'podium-me': r.isMe }"
          @tap="goUser(r)"
        >
          <text class="podium-no hd-seal">{{ r.rank }}</text>
          <text class="podium-name">{{ r.nickname || '同学' }}</text>
          <text class="podium-xp">{{ r.weekXp }} XP</text>
          <text class="podium-rank">{{ r.rankName }}</text>
        </view>
      </view>

      <view class="hd-rule">
        <view class="line"></view>
        <text class="glyph">榜</text>
        <view class="line"></view>
      </view>

      <view v-if="!list.length" class="hd-card state">
        <text class="state-title hd-title">本周还没人上榜</text>
        <text class="hd-note state-note">答一道题就能出现在这里。</text>
      </view>

      <view v-else class="rows">
        <view
          v-for="r in list"
          :key="r.userId"
          class="row"
          :class="{ 'row-me': r.isMe }"
          @tap="goUser(r)"
        >
          <text class="row-no">{{ r.rank }}</text>
          <view class="row-mid">
            <text class="row-name">{{ r.nickname || '同学' }}</text>
            <text class="row-rank">{{ r.rankName }}</text>
          </view>
          <text class="row-xp">{{ r.weekXp }}</text>
        </view>
      </view>

      <!-- 没上榜时的自我定位条 -->
      <view v-if="me && !meInList" class="hd-card my-card">
        <text class="my-lb">我的名次</text>
        <text class="my-rank">第 {{ me.rank }} 名</text>
        <text class="my-xp hd-note">本周 {{ me.weekXp }} XP</text>
      </view>

      <view v-else-if="!me" class="hd-card state">
        <text class="state-title hd-title">本周还没上榜</text>
        <text class="hd-note state-note">答对一道题就有 XP，立刻上榜。</text>
      </view>
    </template>
  </view>
</template>

<style>
.rank {
  padding-top: 56rpx;
}
.title {
  display: block;
  font-size: 44rpx;
  letter-spacing: 0.12em;
}
.week {
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

.podium {
  display: flex;
  gap: 16rpx;
  margin-top: 32rpx;
}
.podium-item {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8rpx;
  padding: 28rpx 12rpx;
  background: var(--card);
  border: 1rpx solid var(--rule);
  border-radius: 14rpx;
}
.podium-me {
  border-color: var(--cinnabar);
}
.podium-no {
  font-size: 30rpx;
}
.podium-name {
  max-width: 100%;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-size: 26rpx;
}
.podium-xp {
  font-size: 30rpx;
  color: var(--gilt);
  font-family: var(--serif);
}
.podium-rank {
  font-size: 21rpx;
  color: var(--muted);
}

.rows {
  border: 1rpx solid var(--rule);
  border-radius: 16rpx;
  overflow: hidden;
  background: var(--card);
}
.row {
  display: flex;
  align-items: center;
  gap: 20rpx;
  padding: 24rpx 28rpx;
  border-bottom: 1rpx solid var(--rule);
}
.row:last-child {
  border-bottom: none;
}
.row-me {
  background: var(--wash);
}
.row-no {
  flex-shrink: 0;
  width: 56rpx;
  text-align: center;
  font-family: var(--serif);
  font-size: 28rpx;
  color: var(--muted);
}
.row-mid {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: baseline;
  gap: 14rpx;
}
.row-name {
  max-width: 60%;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-size: 28rpx;
}
.row-rank {
  flex-shrink: 0;
  font-size: 21rpx;
  color: var(--gilt);
  border: 1rpx solid var(--rule);
  border-radius: 6rpx;
  padding: 2rpx 10rpx;
}
.row-xp {
  flex-shrink: 0;
  font-family: var(--serif);
  font-size: 30rpx;
  color: var(--gilt);
}

.my-card {
  margin-top: 24rpx;
  padding: 30rpx 32rpx;
  display: flex;
  align-items: baseline;
  gap: 20rpx;
}
.my-lb {
  font-size: 25rpx;
  color: var(--muted);
}
.my-rank {
  font-family: var(--serif);
  font-size: 38rpx;
  color: var(--cinnabar);
}
.my-xp {
  margin-left: auto;
  font-size: 24rpx;
}
</style>
