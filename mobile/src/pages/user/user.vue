<script setup lang="ts">
import { computed, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { userApi } from '../../api/user'
import type { PublicUser } from '../../api/user'
import { isLoggedIn } from '../../utils/auth'

/**
 * 公开资料页 —— 契约 §4.9
 * 归属：**fe-game**（后端在 be-api 的 content.ts）
 *
 * ⚠️ 进来带着 `?id=`。**没有 id 或 id 非法就当场退回**，不要拿自己顶上 ——
 *    「我点别人的名字，结果看到自己」是最容易被当成 bug 的体验。
 * ⚠️ `nickname` 可能是空串：显示要兜「同学」，**不要**退回去显示 `username`，
 *    username 是登录名，露出去等于把别人的账号名公开了。
 * ⚠️ 「举报自己」没有意义：是本人时隐藏举报按钮。
 * ⚠️ 举报的长度限制前端先卡一遍（reason ≤30、detail ≤200），
 *    别让用户写完 300 字再被后端点回来。
 */

const id = ref(0)
const user = ref<PublicUser | null>(null)
const loading = ref(true)
const loadError = ref('')
/** 未登录：§4.9 两个接口都是登录级（契约里的 A），别拿「未登录」当错误文案摆着 */
const needLogin = ref(false)

const logged = ref(false)
const isMe = computed(() => {
  if (!user.value) return false
  const local = uni.getStorageSync('userInfo') as { id?: number } | null
  return !!local?.id && Number(local.id) === Number(user.value.id)
})

/* ---------- 举报 ---------- */
const reportOpen = ref(false)
const reason = ref('')
const detail = ref('')
const submitting = ref(false)

const REASONS = ['冒充他人', '骚扰辱骂', '不适当内容', '作弊', '其他']

const reasonLen = computed(() => reason.value.trim().length)
const detailLen = computed(() => detail.value.length)
const canSubmit = computed(() => reasonLen.value > 0 && reasonLen.value <= 30 && !submitting.value)

onLoad((query) => {
  logged.value = isLoggedIn()
  const raw = Number(query?.id)
  if (!Number.isFinite(raw) || raw <= 0) {
    loading.value = false
    loadError.value = '缺少用户 id，不知道该看谁。'
    return
  }
  id.value = raw
  if (!logged.value) {
    // 连请求都不发：后端一定回「未登录」，不如直接把登录入口摆出来
    loading.value = false
    needLogin.value = true
    loadError.value = '登录后就能看别的同学练到哪了。'
    return
  }
  load()
})

async function load() {
  loading.value = true
  loadError.value = ''
  needLogin.value = false
  try {
    user.value = await userApi.profile(id.value)
  } catch (e: any) {
    user.value = null
    if (!isLoggedIn()) {
      // token 过期：拦截器已经清掉了本地登录态，这里给登录入口而不是「重试」
      logged.value = false
      needLogin.value = true
      loadError.value = '登录状态过期了，重新登录再看。'
      return
    }
    loadError.value = e?.message || '资料没取回来'
  } finally {
    loading.value = false
  }
}

function goLogin() {
  uni.navigateTo({ url: '/pages/login/login' })
}
function openReport() {
  if (!logged.value) {
    uni.showToast({ title: '请先登录再举报', icon: 'none' })
    goLogin()
    return
  }
  reason.value = ''
  detail.value = ''
  reportOpen.value = true
}
function pickReason(r: string) {
  reason.value = r
}
function closeReport() {
  reportOpen.value = false
}

async function submitReport() {
  if (!canSubmit.value || !user.value) return
  submitting.value = true
  try {
    await userApi.report({
      targetType: 'user',
      targetId: user.value.id,
      reason: reason.value.trim(),
      detail: detail.value.trim() || undefined,
    })
    reportOpen.value = false
    uni.showToast({ title: '已收到，我们会处理', icon: 'none' })
  } catch {
    /* 拦截器已提示 */
  } finally {
    submitting.value = false
  }
}

function goBack() {
  uni.navigateBack({
    delta: 1,
    fail: () => uni.switchTab({ url: '/pages/learn/learn' }),
  })
}
</script>

<template>
  <view class="hd-page user">
    <view v-if="loading" class="hd-card state">
      <text class="state-title hd-title">正在取资料</text>
      <text class="hd-note state-note">稍等一下。</text>
    </view>

    <view v-else-if="needLogin" class="hd-card state">
      <text class="state-title hd-title">先登录</text>
      <text class="hd-note state-note">{{ loadError }}</text>
      <view class="state-acts">
        <view class="state-btn" @tap="goLogin">登录 / 注册</view>
        <view class="state-btn state-btn-dim" @tap="goBack">返回</view>
      </view>
    </view>

    <view v-else-if="loadError" class="hd-card state">
      <text class="state-title hd-title">资料没取回来</text>
      <text class="hd-note state-note">{{ loadError }}</text>
      <view class="state-acts">
        <view v-if="id && logged" class="state-btn" @tap="load">重试</view>
        <view class="state-btn state-btn-dim" @tap="goBack">返回</view>
      </view>
    </view>

    <template v-else-if="user">
      <view class="head">
        <text class="name hd-title">{{ user.nickname || '同学' }}</text>
        <text class="tag hd-seal">{{ user.rankName }}</text>
      </view>
      <text v-if="user.createdAt" class="since hd-note">
        {{ String(user.createdAt).slice(0, 10) }} 开始学中文
      </text>

      <view class="hd-rule">
        <view class="line"></view>
        <text class="glyph">绩</text>
        <view class="line"></view>
      </view>

      <view class="grid">
        <view class="cell hd-card">
          <text class="cell-num hd-title">{{ user.xpTotal }}</text>
          <text class="cell-lb">累计 XP</text>
        </view>
        <view class="cell hd-card">
          <text class="cell-num hd-title">{{ user.lessonDone }}</text>
          <text class="cell-lb">完成课时</text>
        </view>
        <view class="cell hd-card">
          <text class="cell-num hd-title">{{ user.stampsEarned }}</text>
          <text class="cell-lb">印章</text>
        </view>
      </view>

      <view v-if="!isMe" class="report" @tap="openReport">举报这个人</view>
    </template>

    <!-- 举报浮层：必须放在根 view 内部（多根节点会让页面切换后空白） -->
    <view v-if="reportOpen" class="mask" @tap="closeReport">
      <view class="sheet" @tap.stop>
        <text class="sheet-title hd-title">举报</text>
        <text class="hd-note sheet-sub">选一个理由，可以补一句说明。</text>

        <view class="chips">
          <view
            v-for="r in REASONS"
            :key="r"
            class="chip"
            :class="{ 'chip-on': reason === r }"
            @tap="pickReason(r)"
          >{{ r }}</view>
        </view>

        <input
          v-model="reason"
          class="ipt"
          type="text"
          maxlength="30"
          placeholder="或自己写一个理由（必填）"
          placeholder-class="ph"
        />
        <text class="len hd-note">{{ reasonLen }} / 30</text>

        <textarea
          v-model="detail"
          class="area"
          maxlength="200"
          placeholder="补充说明（选填）"
          placeholder-class="ph"
        />
        <text class="len hd-note">{{ detailLen }} / 200</text>

        <view class="sheet-acts">
          <view class="sheet-btn" @tap="closeReport">取消</view>
          <view
            class="sheet-btn sheet-btn-main"
            :class="{ 'sheet-btn-off': !canSubmit }"
            @tap="submitReport"
          >{{ submitting ? '提交中…' : '提交举报' }}</view>
        </view>
      </view>
    </view>
  </view>
</template>

<style>
.user {
  padding-top: 56rpx;
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

.head {
  display: flex;
  align-items: center;
  gap: 20rpx;
}
.name {
  font-size: 48rpx;
  letter-spacing: 0.1em;
}
.tag {
  flex-shrink: 0;
}
.since {
  display: block;
  margin-top: 12rpx;
  font-size: 24rpx;
}

.grid {
  display: flex;
  gap: 20rpx;
}
.cell {
  flex: 1;
  min-width: 0;
  padding: 28rpx 22rpx;
}
.cell-num {
  display: block;
  font-size: 46rpx;
  line-height: 1.1;
  color: var(--gilt);
}
.cell-lb {
  display: block;
  margin-top: 8rpx;
  font-size: 22rpx;
  color: var(--muted);
}

.report {
  margin-top: 64rpx;
  padding: 24rpx 0;
  text-align: center;
  font-size: 26rpx;
  letter-spacing: 0.12em;
  color: var(--muted);
  border: 1rpx solid var(--rule);
  border-radius: 12rpx;
}

/* 举报浮层 */
.mask {
  position: fixed;
  left: 0;
  right: 0;
  top: 0;
  bottom: 0;
  z-index: 900;
  display: flex;
  align-items: flex-end;
  background: rgba(26, 26, 29, 0.45);
}
.sheet {
  width: 100%;
  box-sizing: border-box;
  padding: 40rpx 40rpx calc(40rpx + env(safe-area-inset-bottom));
  background: var(--card);
  border-radius: 24rpx 24rpx 0 0;
}
.sheet-title {
  display: block;
  font-size: 36rpx;
  letter-spacing: 0.1em;
}
.sheet-sub {
  display: block;
  margin-top: 10rpx;
  font-size: 23rpx;
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 14rpx;
  margin-top: 26rpx;
}
.chip {
  padding: 12rpx 24rpx;
  font-size: 25rpx;
  color: var(--muted);
  background: var(--wash);
  border-radius: 999rpx;
}
.chip-on {
  color: #fcfaf5;
  background: var(--cinnabar);
}

.ipt {
  margin-top: 24rpx;
  height: 80rpx;
  padding: 0 22rpx;
  font-size: 28rpx;
  background: var(--wash);
  border-radius: 10rpx;
}
.area {
  width: 100%;
  box-sizing: border-box;
  height: 160rpx;
  margin-top: 24rpx;
  padding: 18rpx 22rpx;
  font-size: 27rpx;
  background: var(--wash);
  border-radius: 10rpx;
}
.ph {
  color: var(--muted);
}
.len {
  display: block;
  margin-top: 8rpx;
  font-size: 21rpx;
  text-align: right;
}

.sheet-acts {
  display: flex;
  gap: 20rpx;
  margin-top: 34rpx;
}
.sheet-btn {
  flex: 1;
  padding: 24rpx 0;
  text-align: center;
  font-size: 28rpx;
  letter-spacing: 0.12em;
  color: var(--muted);
  background: var(--wash);
  border-radius: 12rpx;
}
.sheet-btn-main {
  color: #fcfaf5;
  background: var(--cinnabar);
}
.sheet-btn-off {
  opacity: 0.5;
}
</style>