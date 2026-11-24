<script setup lang="ts">
import { ref } from 'vue'
import { onLoad, onShow } from '@dcloudio/uni-app'
import { courseApi } from '../../api/course'
import type { CourseUnit, LessonBrief } from '../../api/course'

/**
 * 课时列表 —— 契约 §4.1 GET /units/:id/lessons
 * 归属：**fe-learn** ｜ 入参：?unitId=1
 *
 * 课程首页点单元进来 → 这里是「这一单元有哪几课、学到哪了」→ 点一课进答题页。
 */

const unitId = ref<number>(0)
const unit = ref<CourseUnit | null>(null)
const lessons = ref<LessonBrief[]>([])
const loading = ref(true)
const loadError = ref('')

const STATUS_CN: Record<string, string> = {
  done: '已完成',
  in_progress: '练过',
  none: '未开始',
}

/** 一、二、三…（课时序号用汉字，和整体版式一致） */
const CN_NUM = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二']
function cnIndex(i: number): string {
  return CN_NUM[i] || String(i + 1)
}

function statusCn(s: string): string {
  return STATUS_CN[s] || '未开始'
}

function pct(l: LessonBrief): number {
  if (!l.bestTotal) return 0
  return Math.max(0, Math.min(100, Math.round((l.bestScore / l.bestTotal) * 100)))
}

async function loadLessons() {
  loading.value = true
  loadError.value = ''
  try {
    // ⚠️ 已拆包：res 就是 data（数组本身）
    const res = await courseApi.lessons(unitId.value)
    lessons.value = Array.isArray(res) ? res : []
  } catch (e: any) {
    lessons.value = []
    loadError.value = e?.message || '课时列表没取回来'
  } finally {
    loading.value = false
  }
}

/** 单元标题是「锦上添花」：它失败不能拖垮课时列表，所以单独 try，且不 await 成一个 Promise.all */
async function loadUnitHead() {
  try {
    const res = await courseApi.units()
    const list = Array.isArray(res) ? res : []
    unit.value = list.find((u) => u.id === unitId.value) || null
  } catch {
    unit.value = null
  }
}

function startLesson(l: LessonBrief) {
  uni.navigateTo({ url: `/pages/practice/practice?lessonId=${l.id}` })
}

function goStroke(l: LessonBrief) {
  uni.navigateTo({ url: `/pages/stroke/stroke?lessonId=${l.id}` })
}

/**
 * ⚠️ 取数必须放 onShow，不能只放 onLoad（D1 修复，2026-11-23）：
 * 这是**压栈页**（不是 tabBar 页），从答题页点「回课时」→ uni.navigateBack 回来时，
 * H5 页面栈保留旧 DOM，**onLoad 不重跑**，于是刚做完的那张课时卡还是旧的「未开始 / 0%」。
 * 同作者的 learn.vue 用 onShow 就是为这个（注释原文：「从答题页返回时进度条要立刻变」）。
 * onLoad 只负责接参；首进时 onLoad 先于 onShow，所以不会双取。
 */
onLoad((query: any) => {
  unitId.value = Number(query?.unitId || 1)
})

onShow(() => {
  if (!unitId.value) return
  loadUnitHead()
  loadLessons()
})
</script>

<template>
  <view class="hd-page lesson">
    <view class="head">
      <text class="head-title hd-title">{{ unit?.title || '课时' }}</text>
      <text v-if="unit?.titleEn" class="head-en">{{ unit.titleEn }}</text>
      <text v-if="unit?.intro" class="head-intro hd-note">{{ unit.intro }}</text>
    </view>

    <view class="hd-rule">
      <view class="line"></view>
      <text class="glyph">课</text>
      <view class="line"></view>
    </view>

    <view v-if="loading" class="hd-card state">
      <text class="state-title hd-title">正在取课时</text>
      <text class="hd-note state-note">稍等一下。</text>
    </view>

    <view v-else-if="loadError" class="hd-card state">
      <text class="state-title hd-title">课时没取回来</text>
      <text class="hd-note state-note">{{ loadError }}</text>
      <view class="state-btn" @tap="loadLessons">重试</view>
    </view>

    <view v-else-if="!lessons.length" class="hd-card state">
      <text class="state-title hd-title">这个单元还没有课时</text>
      <text class="hd-note state-note">备课的内容装好之后会出现在这里。</text>
    </view>

    <view v-else class="lessons">
      <view v-for="(l, i) in lessons" :key="l.id" class="lesson-card hd-card">
        <view class="card-top" @tap="startLesson(l)">
          <text class="idx hd-title">{{ cnIndex(i) }}</text>
          <view class="card-head">
            <view class="card-title-row">
              <text class="card-title hd-title">{{ l.title }}</text>
              <text class="badge" :class="'badge-' + l.status">{{ statusCn(l.status) }}</text>
            </view>
            <text v-if="l.titleEn" class="card-en">{{ l.titleEn }}</text>
            <text v-if="l.intro" class="card-intro hd-note">{{ l.intro }}</text>
          </view>
        </view>

        <view class="bar">
          <view class="bar-fill" :style="{ width: pct(l) + '%' }"></view>
        </view>

        <view class="meta">
          <text class="meta-l">
            {{ l.estMinutes }} 分钟 · {{ l.itemCount }} 题<template v-if="l.bestTotal"> · 最好 {{ l.bestScore }}/{{ l.bestTotal }}</template>
          </text>
          <view class="acts">
            <view class="act act-ghost" @tap.stop="goStroke(l)">描红</view>
            <view class="act act-main" @tap.stop="startLesson(l)">
              {{ l.status === 'none' ? '开始' : '再练一次' }}
            </view>
          </view>
        </view>
      </view>
    </view>

    <text class="foot hd-note">
      连着做对两次的知识点，会从错题本里自动移出去。
    </text>
  </view>
</template>

<style scoped>
.lesson {
  padding-top: 40rpx;
}

.head-title {
  display: block;
  font-size: 48rpx;
  letter-spacing: 0.12em;
}
.head-en {
  display: block;
  margin-top: 8rpx;
  font-size: 24rpx;
  color: var(--muted);
  letter-spacing: 0.04em;
}
.head-intro {
  display: block;
  margin-top: 14rpx;
  font-size: 25rpx;
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

.lessons {
  display: flex;
  flex-direction: column;
  gap: 24rpx;
}
.lesson-card {
  padding: 30rpx 32rpx;
}
.card-top {
  display: flex;
  gap: 22rpx;
  align-items: flex-start;
}
.idx {
  flex-shrink: 0;
  width: 60rpx;
  height: 60rpx;
  line-height: 58rpx;
  text-align: center;
  font-size: 30rpx;
  color: var(--gilt);
  background: var(--paper);
  border: 1rpx solid var(--rule);
  border-radius: 10rpx;
}
.card-head {
  flex: 1;
  min-width: 0;
}
.card-title-row {
  display: flex;
  align-items: center;
  gap: 16rpx;
}
.card-title {
  font-size: 34rpx;
  letter-spacing: 0.06em;
}
.badge {
  flex-shrink: 0;
  font-size: 21rpx;
  line-height: 1;
  padding: 8rpx 10rpx;
  border-radius: 6rpx;
  border: 1rpx solid var(--rule);
  color: var(--muted);
}
.badge-done {
  color: var(--gilt);
  border-color: var(--gilt);
}
.badge-in_progress {
  color: var(--cinnabar);
  border-color: var(--cinnabar);
}
.card-en {
  display: block;
  margin-top: 6rpx;
  font-size: 22rpx;
  color: var(--muted);
}
.card-intro {
  display: block;
  margin-top: 12rpx;
  font-size: 24rpx;
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

.meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20rpx;
  margin-top: 18rpx;
}
.meta-l {
  flex: 1;
  min-width: 0;
  font-size: 23rpx;
  color: var(--muted);
}
.acts {
  display: flex;
  align-items: center;
  gap: 16rpx;
  flex-shrink: 0;
}
.act {
  padding: 12rpx 28rpx;
  font-size: 25rpx;
  letter-spacing: 0.1em;
  border-radius: 10rpx;
}
.act-ghost {
  color: var(--gilt);
  border: 2rpx solid var(--rule);
}
.act-main {
  color: var(--paper);
  background: var(--cinnabar);
}
</style>
