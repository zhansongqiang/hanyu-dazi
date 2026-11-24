<script setup lang="ts">
import { computed, ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { teamApi } from '../../api/team'
import type { TeamMine } from '../../api/team'
import { isLoggedIn } from '../../utils/auth'

/**
 * 学习小组 —— 契约 §4.8
 * 归属：**fe-game**
 *
 * ⚠️ `GET /teams/mine` 未加入时返回 **null**（不是 404、不是空对象）。
 *    所以判「我有没有组」只能写 `if (!mine)`，
 *    **绝不能**写 `mine.members.length` —— null 上取属性直接抛错，整页白屏。
 * ⚠️ 一人只能在一个组：已在组里再点「建组/加入」，后端 code:1 报错。
 *    页面按 message 提示，**不要**乐观地本地改成「加入成功」—— 服务端根本没换组。
 * ⚠️ 队长退出 = **解散全组**，其他同学一起被踢出去。必须二次确认，且文案要说清后果。
 * ⚠️ 组内周 XP 由后端（weekRange）算好并按降序返回，前端**不要**自己算本周或重排。
 */

const logged = ref(false)
const mine = ref<TeamMine | null>(null)
const loading = ref(false)
const loadError = ref('')

const mode = ref<'create' | 'join'>('create')
const teamName = ref('')
const slogan = ref('')
const joinCode = ref('')
const submitting = ref(false)

const members = computed(() => mine.value?.members ?? [])
const isCaptain = computed(() => !!mine.value && members.value.some((m) => m.isMe && m.isCaptain))
const myWeekXp = computed(() => members.value.find((m) => m.isMe)?.weekXp ?? 0)
const teamWeekXp = computed(() => members.value.reduce((s, m) => s + (m.weekXp || 0), 0))
const full = computed(() => (mine.value?.memberCount ?? 0) >= 8)

onShow(() => {
  logged.value = isLoggedIn()
  load()
})

async function load() {
  if (!isLoggedIn()) {
    mine.value = null
    return
  }
  loading.value = true
  loadError.value = ''
  try {
    mine.value = (await teamApi.mine()) || null
  } catch (e: any) {
    mine.value = null
    loadError.value = e?.message || '小组信息没取回来'
  } finally {
    loading.value = false
  }
}

async function doCreate() {
  const name = teamName.value.trim()
  if (!name) {
    uni.showToast({ title: '给小组起个名字', icon: 'none' })
    return
  }
  if (name.length > 20) {
    uni.showToast({ title: '名字别超过 20 字', icon: 'none' })
    return
  }
  if (submitting.value) return
  submitting.value = true
  try {
    mine.value = await teamApi.create({ name, slogan: slogan.value.trim() || undefined })
    teamName.value = ''
    slogan.value = ''
    uni.showToast({ title: '小组建好了', icon: 'none' })
  } catch {
    /* 已在组里等情况拦截器已弹 message；重新拉一次让页面回到真实状态 */
    await load()
  } finally {
    submitting.value = false
  }
}

async function doJoin() {
  const code = joinCode.value.trim().toUpperCase()
  if (code.length !== 6) {
    uni.showToast({ title: '邀请码是 6 位', icon: 'none' })
    return
  }
  if (submitting.value) return
  submitting.value = true
  try {
    mine.value = await teamApi.join(code)
    joinCode.value = ''
    uni.showToast({ title: '加入成功', icon: 'none' })
  } catch {
    await load()
  } finally {
    submitting.value = false
  }
}

/** 队长点退出要理解成「解散」——后果写在弹窗里，不让用户蒙着点 */
function doLeave() {
  const m = mine.value
  if (!m) return
  const captain = isCaptain.value
  uni.showModal({
    title: captain ? '解散小组' : '退出小组',
    content: captain
      ? `你是队长，退出会解散「${m.name}」，${m.memberCount} 位同学都会被移出。确定吗？`
      : `退出后可以再用邀请码加入「${m.name}」。确定退出吗？`,
    confirmText: captain ? '解散' : '退出',
    cancelText: '再想想',
    confirmColor: '#ae332e',
    success: async (res) => {
      if (!res.confirm) return
      try {
        const r = await teamApi.leave()
        mine.value = null
        uni.showToast({ title: r.disbanded ? '小组已解散' : '已退出', icon: 'none' })
      } catch {
        await load()
      }
    },
  })
}

function copyCode() {
  const code = mine.value?.inviteCode
  if (!code) return
  uni.setClipboardData({
    data: code,
    success: () => uni.showToast({ title: '邀请码已复制', icon: 'none' }),
  })
}

function goLogin() {
  uni.navigateTo({ url: '/pages/login/login' })
}
function goUser(userId: number, isMe: boolean) {
  if (isMe) {
    uni.switchTab({ url: '/pages/profile/profile' })
    return
  }
  uni.navigateTo({ url: `/pages/user/user?id=${userId}` })
}
</script>

<template>
  <view class="hd-page team">
    <text class="hd-title title">学习小组</text>
    <text class="hd-note sub">最多 8 人，一起攒本周 XP</text>

    <view v-if="!logged" class="hd-card state">
      <text class="state-title hd-title">先登录</text>
      <text class="hd-note state-note">小组跟账号走，登录后就能建组或加入。</text>
      <view class="state-btn" @tap="goLogin">登录 / 注册</view>
    </view>

    <view v-else-if="loading && !mine" class="hd-card state">
      <text class="state-title hd-title">正在取小组</text>
      <text class="hd-note state-note">稍等一下。</text>
    </view>

    <view v-else-if="loadError" class="hd-card state">
      <text class="state-title hd-title">小组信息没取回来</text>
      <text class="hd-note state-note">{{ loadError }}</text>
      <view class="state-btn" @tap="load">重试</view>
    </view>

    <!-- 未加入：建组 / 加入 两个入口 -->
    <template v-else-if="!mine">
      <view class="tabs">
        <view class="tab" :class="{ 'tab-on': mode === 'create' }" @tap="mode = 'create'">建一个</view>
        <view class="tab" @tap="mode = 'join'" :class="{ 'tab-on': mode === 'join' }">加入别人的</view>
      </view>

      <view v-if="mode === 'create'" class="hd-card form">
        <text class="lb">小组名字</text>
        <input
          v-model="teamName"
          class="ipt"
          type="text"
          maxlength="20"
          placeholder="如：墨香读书会"
          placeholder-class="ph"
        />
        <text class="lb">一句话口号（可留空）</text>
        <input
          v-model="slogan"
          class="ipt"
          type="text"
          maxlength="30"
          placeholder="如：每天十道题"
          placeholder-class="ph"
        />
        <view class="btn" :class="{ 'btn-busy': submitting }" @tap="doCreate">
          {{ submitting ? '建立中…' : '建组，我当队长' }}
        </view>
        <text class="hd-note tip">建好后会给你一个 6 位邀请码，发给同学就能进来。</text>
      </view>

      <view v-else class="hd-card form">
        <text class="lb">邀请码</text>
        <input
          v-model="joinCode"
          class="ipt ipt-code"
          type="text"
          maxlength="6"
          placeholder="6 位字母数字"
          placeholder-class="ph"
        />
        <view class="btn" :class="{ 'btn-busy': submitting }" @tap="doJoin">
          {{ submitting ? '加入中…' : '加入小组' }}
        </view>
        <text class="hd-note tip">大小写都行。一人只能在一个组里。</text>
      </view>
    </template>

    <!-- 已加入 -->
    <template v-else>
      <view class="hd-card head-card">
        <view class="head-top">
          <text class="team-name hd-title">{{ mine.name }}</text>
          <text class="team-cnt hd-note">{{ mine.memberCount }} / 8 人</text>
        </view>
        <!-- 建组时填的口号：后端 minePayload 现在会回传，没填就整行不出现 -->
        <text v-if="mine.slogan" class="team-slogan hd-note">{{ mine.slogan }}</text>

        <view class="invite" @tap="copyCode">
          <view class="invite-l">
            <text class="invite-lb hd-note">邀请码</text>
            <text class="invite-code">{{ mine.inviteCode }}</text>
          </view>
          <text class="invite-copy">复制</text>
        </view>
        <text v-if="full" class="hd-note tip-warn">已经 8 人满了，新人加不进来。</text>
      </view>

      <view class="sum">
        <view class="sum-cell hd-card">
          <text class="sum-num hd-title">{{ teamWeekXp }}</text>
          <text class="sum-lb">全组本周 XP</text>
        </view>
        <view class="sum-cell hd-card">
          <text class="sum-num hd-title">{{ myWeekXp }}</text>
          <text class="sum-lb">我的本周 XP</text>
        </view>
      </view>

      <view class="hd-rule">
        <view class="line"></view>
        <text class="glyph">组</text>
        <view class="line"></view>
      </view>

      <view class="rows">
        <view
          v-for="(m, i) in members"
          :key="m.userId"
          class="row"
          :class="{ 'row-me': m.isMe }"
          @tap="goUser(m.userId, m.isMe)"
        >
          <text class="row-no">{{ i + 1 }}</text>
          <view class="row-mid">
            <text class="row-name">{{ m.nickname || '同学' }}</text>
            <text v-if="m.isCaptain" class="row-tag">队长</text>
            <text v-if="m.isMe" class="row-tag row-tag-me">我</text>
          </view>
          <text class="row-xp">{{ m.weekXp }}</text>
        </view>
      </view>

      <text class="hd-note rows-note">本周 XP 从周一算起，榜单由服务端排好。</text>

      <view class="leave" @tap="doLeave">
        {{ isCaptain ? '解散小组（队长退出）' : '退出小组' }}
      </view>
      <text v-if="isCaptain" class="hd-note leave-note">
        你是队长：退出会把整个小组解散，其他同学会被移出。
      </text>
    </template>
  </view>
</template>

<style>
.team {
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

.tabs {
  display: flex;
  gap: 16rpx;
  margin-top: 36rpx;
}
.tab {
  flex: 1;
  text-align: center;
  padding: 22rpx 0;
  font-size: 28rpx;
  color: var(--muted);
  background: var(--wash);
  border-radius: 12rpx;
}
.tab-on {
  color: #fcfaf5;
  background: var(--cinnabar);
}

.form {
  margin-top: 24rpx;
  padding: 34rpx 32rpx;
}
.lb {
  display: block;
  margin-top: 24rpx;
  font-size: 25rpx;
  color: var(--muted);
  letter-spacing: 0.06em;
}
.lb:first-child {
  margin-top: 0;
}
.ipt {
  margin-top: 12rpx;
  height: 84rpx;
  padding: 0 24rpx;
  font-size: 30rpx;
  color: var(--ink);
  background: var(--wash);
  border-radius: 10rpx;
}
.ipt-code {
  letter-spacing: 0.36em;
  font-family: var(--serif);
  text-transform: uppercase;
}
.ph {
  color: var(--muted);
  letter-spacing: 0;
}
.btn {
  margin-top: 36rpx;
  padding: 26rpx 0;
  text-align: center;
  font-size: 30rpx;
  letter-spacing: 0.16em;
  color: #fcfaf5;
  background: var(--cinnabar);
  border-radius: 12rpx;
}
.btn-busy {
  opacity: 0.6;
}
.tip {
  display: block;
  margin-top: 24rpx;
  font-size: 22rpx;
}
.tip-warn {
  display: block;
  margin-top: 18rpx;
  font-size: 22rpx;
  color: var(--cinnabar);
}

.head-card {
  margin-top: 36rpx;
  padding: 34rpx 32rpx;
}
.head-top {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 16rpx;
}
.team-name {
  font-size: 38rpx;
  letter-spacing: 0.08em;
}
.team-cnt {
  flex-shrink: 0;
  font-size: 23rpx;
}
.team-slogan {
  display: block;
  margin-top: 10rpx;
  font-size: 24rpx;
  color: var(--cinnabar);
}

.invite {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 28rpx;
  padding: 24rpx 28rpx;
  background: var(--wash);
  border-radius: 12rpx;
}
.invite-l {
  display: flex;
  align-items: baseline;
  gap: 18rpx;
}
.invite-lb {
  font-size: 23rpx;
}
.invite-code {
  font-family: var(--serif);
  font-size: 40rpx;
  letter-spacing: 0.24em;
  color: var(--cinnabar);
}
.invite-copy {
  flex-shrink: 0;
  font-size: 25rpx;
  color: var(--gilt);
  border: 1rpx solid var(--rule);
  border-radius: 8rpx;
  padding: 8rpx 20rpx;
}

.sum {
  display: flex;
  gap: 20rpx;
  margin-top: 20rpx;
}
.sum-cell {
  flex: 1;
  padding: 26rpx 24rpx;
}
.sum-num {
  display: block;
  font-size: 46rpx;
  line-height: 1.1;
  color: var(--gilt);
}
.sum-lb {
  display: block;
  margin-top: 8rpx;
  font-size: 23rpx;
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
  gap: 18rpx;
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
  width: 44rpx;
  text-align: center;
  font-family: var(--serif);
  font-size: 26rpx;
  color: var(--muted);
}
.row-mid {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: baseline;
  gap: 12rpx;
}
.row-name {
  max-width: 60%;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-size: 28rpx;
}
.row-tag {
  flex-shrink: 0;
  font-size: 20rpx;
  color: var(--gilt);
  border: 1rpx solid var(--rule);
  border-radius: 6rpx;
  padding: 2rpx 8rpx;
}
.row-tag-me {
  color: var(--cinnabar);
}
.row-xp {
  flex-shrink: 0;
  font-family: var(--serif);
  font-size: 30rpx;
  color: var(--gilt);
}
.rows-note {
  display: block;
  margin-top: 20rpx;
  font-size: 22rpx;
}

.leave {
  margin-top: 64rpx;
  padding: 26rpx 0;
  text-align: center;
  font-size: 28rpx;
  letter-spacing: 0.14em;
  color: var(--cinnabar);
  border: 1rpx solid var(--rule);
  border-radius: 12rpx;
}
.leave-note {
  display: block;
  margin-top: 16rpx;
  font-size: 22rpx;
  text-align: center;
}
</style>
