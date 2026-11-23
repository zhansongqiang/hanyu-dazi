<script setup lang="ts">
import { ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { getUserInfo, isLoggedIn } from '../../utils/auth'

/** 五种练法：同一批知识点换着练，v1 全部围绕这五种出题 */
const kinds = [
  { key: 'recognize', char: '认', name: '认字', desc: '看图识汉字' },
  { key: 'pinyin', char: '音', name: '拼音', desc: '选对读音' },
  { key: 'meaning', char: '义', name: '词义', desc: '选对意思' },
  { key: 'stroke', char: '写', name: '笔顺', desc: '米字格描红' },
  { key: 'listen', char: '说', name: '跟读', desc: '录下来听自己' },
]

const greeting = ref('')
const logged = ref(false)

function timeGreeting(): string {
  const h = new Date().getHours()
  if (h < 6) return '夜深了'
  if (h < 11) return '早上好'
  if (h < 14) return '中午好'
  if (h < 18) return '下午好'
  return '晚上好'
}

onShow(() => {
  logged.value = isLoggedIn()
  const nick = getUserInfo()?.nickname || ''
  greeting.value = nick ? `${timeGreeting()}，${nick}` : timeGreeting()
})

function goLogin() {
  uni.navigateTo({ url: '/pages/login/login' })
}
</script>

<template>
  <view class="hd-page learn">
    <view class="hero">
      <text class="hero-title hd-title">汉语搭子</text>
      <text class="hero-sub">课后陪练 · 每天一刻钟</text>
    </view>

    <view class="greet">
      <text class="greet-text">{{ greeting }}</text>
      <text v-if="!logged" class="hd-seal" @tap="goLogin">未登录</text>
    </view>

    <view class="hd-rule">
      <view class="line"></view>
      <text class="glyph">习</text>
      <view class="line"></view>
    </view>

    <view class="section">
      <view class="section-head">
        <text class="section-cn hd-title">五种练法</text>
        <text class="section-note">同一批知识点，换着练</text>
      </view>
      <view class="kinds">
        <view v-for="k in kinds" :key="k.key" class="kind">
          <text class="kind-char hd-title">{{ k.char }}</text>
          <text class="kind-name">{{ k.name }}</text>
          <text class="kind-desc">{{ k.desc }}</text>
        </view>
      </view>
    </view>

    <view class="hd-rule">
      <view class="line"></view>
      <text class="glyph">课</text>
      <view class="line"></view>
    </view>

    <view class="section">
      <view class="section-head">
        <text class="section-cn hd-title">今日课程</text>
      </view>
      <!-- TODO(第二天上午): 换成本单元真实课程卡片，列表数据来自 /api/lessons -->
      <view class="hd-card empty">
        <text class="empty-title hd-title">课程还在装填</text>
        <text class="hd-note empty-note">
          备课的内容正在装进系统里。装好之后，这里会出现今天的课程卡片，
          点进去就能开始练 —— 上面五种练法都已经就位了。
        </text>
      </view>
    </view>

    <text class="foot hd-note">给北京语言大学的留学生 · 中文课后陪练社区</text>
  </view>
</template>

<style>
.learn {
  padding-top: 48rpx;
}

/* 报头 */
.hero-title {
  display: block;
  font-size: 64rpx;
  line-height: 1.2;
  letter-spacing: 0.14em;
}
.hero-sub {
  display: block;
  margin-top: 14rpx;
  font-size: 26rpx;
  letter-spacing: 0.18em;
  color: var(--muted);
}
.greet {
  display: flex;
  align-items: center;
  gap: 18rpx;
  margin-top: 36rpx;
}
.greet-text {
  font-size: 30rpx;
  color: var(--ink);
}

/* 分区标题 */
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

/* 五种练法 */
.kinds {
  display: flex;
  flex-wrap: wrap;
  gap: 20rpx;
}
.kind {
  box-sizing: border-box;
  width: calc((100% - 40rpx) / 3);
  padding: 28rpx 16rpx 24rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12rpx;
  background: var(--card);
  border: 1rpx solid var(--rule);
  border-radius: 14rpx;
}
.kind-char {
  display: block;
  width: 78rpx;
  height: 78rpx;
  line-height: 76rpx;
  text-align: center;
  font-size: 42rpx;
  color: var(--cinnabar);
  background: var(--paper);
  border: 1rpx solid var(--rule);
  border-radius: 10rpx;
}
.kind-name {
  font-size: 27rpx;
  font-weight: 600;
  letter-spacing: 0.06em;
}
.kind-desc {
  font-size: 22rpx;
  line-height: 1.5;
  color: var(--muted);
  text-align: center;
}

/* 空态 */
.empty {
  padding: 40rpx 36rpx;
}
.empty-title {
  display: block;
  font-size: 32rpx;
  letter-spacing: 0.08em;
}
.empty-note {
  display: block;
  margin-top: 16rpx;
}

.foot {
  display: block;
  margin-top: 72rpx;
  font-size: 23rpx;
  text-align: center;
}
</style>
