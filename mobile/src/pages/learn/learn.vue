<script setup lang="ts">
import { ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { getUserInfo, isLoggedIn } from '../../utils/auth'
import { courseApi } from '../../api/course'
import type { CourseUnit } from '../../api/course'

/**
 * 学习首页 —— 契约 §4.1 GET /units
 * 归属：**fe-learn**
 *
 * 这是 tabBar 页，用 onShow 而不是 onMounted：
 * 从答题页返回时进度条要立刻变，onMounted 只跑一次就不刷新了。
 */

/**
 * 五种练法：同一批知识点换着练，v1 全部围绕这五种出题。
 *
 * ⚠️ 第 5 条必须写成「听音」，**不能**写成「跟读 / 录下来听自己」。
 *    `kind='listen'` 实现的是**听音选字**：放 `/audio/<key>.mp3`，学习者选出听到的字，
 *    题目里只有播放和选择两个动作。全项目**没有任何一处录音**（搜 `MediaRecorder` / `getUserMedia`
 *    的结果是 0），写「跟读」就是在这张页面上给学习者一个做不到的承诺。
 *
 *    「跟读录音 + 回放自评」按 plan.html 第十二节第五点是本版**唯一的争取项**，
 *    排在主线之后、进度紧就整体让位 —— 它这次让位了。写这张卡片时的口径照 plan.html 的原话：
 *    说成**有意的分层取舍**（先做听辨，评分那一步不做识别服务），
 *    不要说成「技术做不到」，也不要说成「来不及」。
 */
const kinds = [
  { key: 'recognize', char: '认', name: '认字', desc: '看图识汉字' },
  { key: 'pinyin', char: '音', name: '拼音', desc: '选对读音' },
  { key: 'meaning', char: '义', name: '词义', desc: '选对意思' },
  { key: 'stroke', char: '写', name: '笔顺', desc: '米字格描红' },
  { key: 'listen', char: '听', name: '听音', desc: '听到什么，选哪个字' },
]

const LEVEL_CN: Record<string, string> = {
  basic: '基础',
  advanced: '进阶',
  extended: '拓展',
}
const TYPE_CN: Record<string, string> = {
  char: '汉字',
  word: '词语',
  sentence: '句子',
  dialogue: '对话',
}

const greeting = ref('')
const logged = ref(false)

const units = ref<CourseUnit[]>([])
const loading = ref(false)
/** 拉取失败时把原因留下来，页面要说人话，不能假装「没有课程」 */
const loadError = ref('')

function timeGreeting(): string {
  const h = new Date().getHours()
  if (h < 6) return '夜深了'
  if (h < 11) return '早上好'
  if (h < 14) return '中午好'
  if (h < 18) return '下午好'
  return '晚上好'
}

async function loadUnits() {
  if (!logged.value) return
  loading.value = true
  loadError.value = ''
  try {
    // ⚠️ request.ts 已拆包：res 就是契约里的 data（数组本身），不是 res.data
    const res = await courseApi.units()
    units.value = Array.isArray(res) ? res : []
  } catch (e: any) {
    units.value = []
    // 拦截器已经 toast 过 message 了，这里只负责页面内的说明文字，不重复弹
    loadError.value = e?.message || '课程列表没取回来'
  } finally {
    loading.value = false
  }
}

function pct(u: CourseUnit): number {
  const p = typeof u.progress === 'number' ? u.progress : 0
  return Math.max(0, Math.min(100, Math.round(p * 100)))
}

function levelCn(l: string): string {
  return LEVEL_CN[l] || l || ''
}

function typeCn(t: string): string {
  return TYPE_CN[t] || t || ''
}

function goUnit(u: CourseUnit) {
  uni.navigateTo({ url: `/pages/lesson/lesson?unitId=${u.id}` })
}

function goStroke() {
  // 描红页不依赖单元选择，进去先展示本地有数据的字
  uni.navigateTo({ url: '/pages/stroke/stroke' })
}

function goLogin() {
  uni.navigateTo({ url: '/pages/login/login' })
}

onShow(() => {
  logged.value = isLoggedIn()
  const nick = getUserInfo()?.nickname || ''
  greeting.value = nick ? `${timeGreeting()}，${nick}` : timeGreeting()
  loadUnits()
})
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
        <view
          v-for="k in kinds"
          :key="k.key"
          class="kind"
          :class="{ 'kind-tap': k.key === 'stroke' }"
          @tap="k.key === 'stroke' ? goStroke() : undefined"
        >
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
        <text class="section-cn hd-title">课程</text>
        <text class="section-note" v-if="units.length">{{ units.length }} 个单元</text>
      </view>

      <view v-if="!logged" class="hd-card empty">
        <text class="empty-title hd-title">登录后开始</text>
        <text class="hd-note empty-note">
          进度、错题、连击都按账号存 —— 换台设备接着练，数字不会丢。
        </text>
        <view class="empty-btn" @tap="goLogin">去登录 / 注册</view>
      </view>

      <view v-else-if="loading && !units.length" class="hd-card empty">
        <text class="empty-title hd-title">正在取课程</text>
        <text class="hd-note empty-note">稍等一下，马上就好。</text>
      </view>

      <view v-else-if="loadError && !units.length" class="hd-card empty">
        <text class="empty-title hd-title">课程没取回来</text>
        <text class="hd-note empty-note">{{ loadError }}</text>
        <view class="empty-btn" @tap="loadUnits">重试</view>
      </view>

      <view v-else-if="!units.length" class="hd-card empty">
        <text class="empty-title hd-title">课程还在装填</text>
        <text class="hd-note empty-note">
          备课的内容正在装进系统里。装好之后，这里会出现单元卡片，点进去就能开始练。
        </text>
      </view>

      <view v-else class="units">
        <view v-for="u in units" :key="u.id" class="unit hd-card" @tap="goUnit(u)">
          <view class="unit-top">
            <text class="unit-title hd-title">{{ u.title }}</text>
            <text class="unit-tag hd-seal">{{ levelCn(u.level) }}</text>
          </view>
          <text class="unit-en">{{ u.titleEn }}</text>
          <text class="unit-intro hd-note">{{ u.intro }}</text>

          <view class="bar">
            <view class="bar-fill" :style="{ width: pct(u) + '%' }"></view>
          </view>
          <view class="unit-meta">
            <text class="unit-meta-l">{{ typeCn(u.type) }} · {{ u.lessonCount }} 课 · {{ u.itemCount }} 题</text>
            <text class="unit-meta-r">已学 {{ u.doneCount }}/{{ u.lessonCount }}</text>
          </view>
        </view>
      </view>
    </view>

    <text class="foot hd-note">给北京语言大学的留学生 · 中文课后陪练社区</text>
  </view>
</template>

<style scoped>
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
.kind-tap {
  border-color: var(--gilt);
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

/* 空态 / 加载态 */
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
.empty-btn {
  display: inline-block;
  margin-top: 30rpx;
  padding: 14rpx 38rpx;
  font-size: 27rpx;
  letter-spacing: 0.12em;
  color: var(--cinnabar);
  border: 2rpx solid var(--cinnabar);
  border-radius: 10rpx;
}

/* 单元卡片 */
.units {
  display: flex;
  flex-direction: column;
  gap: 24rpx;
}
.unit {
  padding: 32rpx 34rpx;
}
.unit-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20rpx;
}
.unit-title {
  font-size: 36rpx;
  letter-spacing: 0.08em;
}
.unit-tag {
  flex-shrink: 0;
  font-size: 22rpx;
  padding: 6rpx 10rpx;
}
.unit-en {
  display: block;
  margin-top: 8rpx;
  font-size: 23rpx;
  letter-spacing: 0.04em;
  color: var(--muted);
}
.unit-intro {
  display: block;
  margin-top: 16rpx;
  font-size: 25rpx;
}

.bar {
  margin-top: 26rpx;
  height: 10rpx;
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
.unit-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 14rpx;
}
.unit-meta-l {
  font-size: 23rpx;
  color: var(--muted);
}
.unit-meta-r {
  font-size: 23rpx;
  color: var(--gilt);
}

.foot {
  display: block;
  margin-top: 72rpx;
  font-size: 23rpx;
  text-align: center;
}
</style>
