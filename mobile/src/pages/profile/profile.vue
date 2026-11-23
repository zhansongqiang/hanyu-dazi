<script setup lang="ts">
import { computed, ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { authApi } from '../../api'
import { getUserInfo, isLoggedIn, logout } from '../../utils/auth'
import type { UserInfo } from '../../utils/auth'

/**
 * 「我的」页面：只显示真实数据。
 * 连击 / XP / 印章要等第二天的 xp_events 与 user_streaks 接上，
 * 现在宁可空着，也不摆一排假数字 —— 假数字最容易被当成已完成。
 */
const logged = ref(false)
const user = ref<UserInfo | null>(null)

/** 科举段位阶梯是静态信息，不是数据，可以先展示 */
const ladder = ['蒙学', '童生', '秀才', '举人', '贡士', '进士', '状元']

const joinedAt = computed(() => {
  const t = user.value?.createdAt
  return t ? String(t).slice(0, 10) : ''
})

onShow(async () => {
  logged.value = isLoggedIn()
  user.value = getUserInfo()
  await refreshFromServer()
})

async function refreshFromServer() {
  if (!isLoggedIn()) {
    user.value = null
    return
  }
  try {
    const me = await authApi.me()
    uni.setStorageSync('userInfo', me)
    user.value = me
  } catch {
    // 提示已由 utils/request.ts 弹出；token 失效时那边也会顺手清掉本地登录态
    if (!isLoggedIn()) {
      logged.value = false
      user.value = null
    }
  }
}

function goLogin() {
  uni.navigateTo({ url: '/pages/login/login' })
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
      uni.showToast({ title: '已退出', icon: 'none' })
    },
  })
}
</script>

<template>
  <view class="hd-page profile">
    <view v-if="logged && user" class="me">
      <text class="me-name hd-title">{{ user.nickname }}</text>
      <text class="me-id">@{{ user.username }}</text>
      <text v-if="joinedAt" class="me-since hd-note">自 {{ joinedAt }} 起在练</text>
    </view>

    <view v-else class="me">
      <text class="me-name hd-title">还没登录</text>
      <text class="me-id">登录后练习记录才会跟人走</text>
      <view class="me-login" @tap="goLogin">登录 / 注册</view>
    </view>

    <view class="hd-rule">
      <view class="line"></view>
      <text class="glyph">级</text>
      <view class="line"></view>
    </view>

    <view class="section">
      <view class="section-head">
        <text class="section-cn hd-title">段位</text>
        <text class="section-note">做对题攒 XP，一级一级升</text>
      </view>
      <view class="ladder">
        <text v-for="(name, i) in ladder" :key="name" class="rung">{{ name }}</text>
      </view>
      <text class="hd-note ladder-note">
        起点是蒙学 —— 谁都是从零开始的。段位只升不降，
        练得慢也不会掉下来。
      </text>
    </view>

    <view class="hd-rule">
      <view class="line"></view>
      <text class="glyph">绩</text>
      <view class="line"></view>
    </view>

    <view class="section">
      <view class="section-head">
        <text class="section-cn hd-title">练习战绩</text>
      </view>
      <!-- TODO(第二天): 接入 xp_events / user_streaks / user_achievements 后换成真实数字 -->
      <view class="hd-card pending">
        <text class="hd-note">
          连击天数、累计 XP、印章还在路上。接好之前这里不放数字 ——
          摆一排 0 出来看着像你没练，其实只是还没接上。
        </text>
      </view>
    </view>

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
.me-name {
  font-size: 48rpx;
  letter-spacing: 0.1em;
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

/* 段位阶梯：七个横向排开，尺寸刚好一行放得下（放不下会掉一个到第二行，很难看） */
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
  color: var(--gilt);
  background: var(--wash);
  border-radius: 8rpx;
}
.ladder-note {
  display: block;
  margin-top: 24rpx;
}

.pending {
  padding: 36rpx;
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