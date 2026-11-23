<script setup lang="ts">
import { ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { getUserInfo, isLoggedIn } from '../../utils/auth'
import type { UserInfo } from '../../utils/auth'

/**
 * 错题本页面：v1 第三天接后端 wrong_book 视图。
 * 现在先把壳子和空态做对 —— 空态文案要说清「为什么现在没有」，不要假装 0 条。
 */
const logged = ref(false)
const user = ref<UserInfo | null>(null)

onShow(() => {
  logged.value = isLoggedIn()
  user.value = getUserInfo()
})

function goLogin() {
  uni.navigateTo({ url: '/pages/login/login' })
}

function goLearn() {
  uni.switchTab({ url: '/pages/learn/learn' })
}
</script>

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

    <view v-if="!logged" class="hd-card state">
      <text class="state-title hd-title">先登录</text>
      <text class="hd-note state-note">
        错题本按账号存：换手机、换浏览器都还在。
      </text>
      <view class="state-btn" @tap="goLogin">去登录</view>
    </view>

    <view v-else class="hd-card state">
      <text class="state-title hd-title">还没有错题</text>
      <text class="hd-note state-note">
        练习记录有了之后，这里会按「错过几次」排序。
        同一个知识点错两次以上，才会被收进来 —— 偶尔手滑不算。
      </text>
      <view class="state-btn" @tap="goLearn">去练一练</view>
    </view>

    <view class="hd-rule">
      <view class="line"></view>
      <text class="glyph">记</text>
      <view class="line"></view>
    </view>

    <text class="hd-note tail">
      错题本里的知识点，会在后面的课程里重新出题；
      连着做对两次，就自动移出去。
    </text>
  </view>
</template>

<style>
.wrongbook {
  padding-top: 48rpx;
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

.tail {
  display: block;
  font-size: 24rpx;
}
</style>