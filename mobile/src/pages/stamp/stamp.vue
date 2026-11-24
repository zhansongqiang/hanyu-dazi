<script setup lang="ts">
import { computed, ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { stampApi } from '../../api/stamp'
import type { Stamp } from '../../api/stamp'
import { isLoggedIn } from '../../utils/auth'

/**
 * 印章页 —— 契约 §4.7
 * 归属：**fe-game**
 *
 * ⚠️ §8 验收铁律：**未得的章也要显示**（灰态），不是只列已得的。
 *    后端 `/stamps` 已经保证「全部章 + earned 标记」都返回；
 *    如果这里只 filter(earned) 就等于把验收项做废了 —— 用户会看到半空页面，
 *    也不知道还剩哪些可以去挣。
 * ⚠️ `kind='speak'` 本次不实现，永远 earned=false。**不要**为它写「即将开放」之类的特例，
 *    灰着就行；写了特例以后实现了还得回来删。
 */

const stamps = ref<Stamp[]>([])
const loading = ref(false)
const loadError = ref('')
/** 未登录：`/stamps` 是登录级接口（契约 §4.7 的 A），给登录入口而不是「未登录」 */
const needLogin = ref(false)

const earnedCount = computed(() => stamps.value.filter((s) => s.earned).length)
const totalCount = computed(() => stamps.value.length)

/** 按 kind 分组展示，组内保持后端给的 sort 顺序（不要在前端重排） */
const KIND_LABEL: Record<string, string> = {
  unit: '单元通',
  streak: '连击',
  xp: '积少成多',
  stroke: '笔画',
  speak: '跟读',
}
const groups = computed(() => {
  const out: Array<{ kind: string; label: string; items: Stamp[] }> = []
  for (const s of stamps.value) {
    let g = out.find((x) => x.kind === s.kind)
    if (!g) {
      g = { kind: s.kind, label: KIND_LABEL[s.kind] ?? s.kind, items: [] }
      out.push(g)
    }
    g.items.push(s)
  }
  return out
})

onShow(() => {
  if (!isLoggedIn()) {
    stamps.value = []
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
    stamps.value = (await stampApi.list()) || []
  } catch (e: any) {
    stamps.value = []
    if (!isLoggedIn()) {
      needLogin.value = true
      return
    }
    loadError.value = e?.message || '印章没取回来'
  } finally {
    loading.value = false
  }
}

function goLogin() {
  uni.navigateTo({ url: '/pages/login/login' })
}

/** 主动结算一次，把能发的章领了；只弹本次**新**解锁的 */
async function doCheck() {
  try {
    const res = await stampApi.check()
    if (res.unlocked.length) {
      uni.showModal({
        title: `新得 ${res.unlocked.length} 枚印章`,
        content: res.unlocked.map((u) => `「${u.name}」`).join('　'),
        showCancel: false,
        confirmText: '收下',
      })
      await load()
    } else {
      uni.showToast({ title: '暂时没有新印章', icon: 'none' })
    }
  } catch {
    /* 拦截器已提示 */
  }
}
</script>

<template>
  <view class="hd-page stamp">
    <view class="head">
      <text class="hd-title title">印章</text>
      <text v-if="!loadError && totalCount" class="count hd-note">
        已得 {{ earnedCount }} / {{ totalCount }} 枚
      </text>
    </view>

    <view v-if="loading && !stamps.length" class="hd-card state">
      <text class="state-title hd-title">正在取印章</text>
      <text class="hd-note state-note">稍等一下。</text>
    </view>

    <view v-else-if="needLogin" class="hd-card state">
      <text class="state-title hd-title">先登录</text>
      <text class="hd-note state-note">印章是攒在自己账号上的，登录后就能看到进度。</text>
      <view class="state-btn" @tap="goLogin">登录 / 注册</view>
    </view>

    <view v-else-if="loadError" class="hd-card state">
      <text class="state-title hd-title">印章没取回来</text>
      <text class="hd-note state-note">{{ loadError }}</text>
      <view class="state-btn" @tap="load">重试</view>
    </view>

    <view v-else-if="!totalCount" class="hd-card state">
      <text class="state-title hd-title">还没有印章可挣</text>
      <text class="hd-note state-note">等课程印章配置好了，这里会排满一整页。</text>
    </view>

    <template v-else>
      <view v-for="g in groups" :key="g.kind" class="group">
        <view class="hd-rule">
          <view class="line"></view>
          <text class="glyph">{{ g.label }}</text>
          <view class="line"></view>
        </view>
        <view class="grid">
          <view
            v-for="s in g.items"
            :key="s.code"
            class="seal"
            :class="{ 'seal-off': !s.earned }"
          >
            <view class="seal-ring">
              <text class="seal-glyph">{{ s.earned ? '印' : '未' }}</text>
            </view>
            <text class="seal-name">{{ s.name }}</text>
            <text v-if="s.description" class="seal-desc hd-note">{{ s.description }}</text>
            <text v-if="s.earned && s.unlockedAt" class="seal-at hd-note">
              {{ String(s.unlockedAt).slice(0, 10) }}
            </text>
          </view>
        </view>
      </view>

      <view class="check" @tap="doCheck">看看有没有新印章</view>
    </template>
  </view>
</template>

<style>
.stamp {
  padding-top: 56rpx;
}
.head {
  display: flex;
  align-items: baseline;
  gap: 20rpx;
}
.title {
  font-size: 44rpx;
  letter-spacing: 0.12em;
}
.count {
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

.group {
  margin-top: 40rpx;
}

.grid {
  display: flex;
  flex-wrap: wrap;
  gap: 20rpx;
  margin-top: 24rpx;
}
.seal {
  flex: 1 1 calc(50% - 10rpx);
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10rpx;
  padding: 30rpx 18rpx 26rpx;
  background: var(--card);
  border: 1rpx solid var(--rule);
  border-radius: 14rpx;
}
/* 未得：整体压暗 + 虚线边框，一眼看出「还没到手」，但仍然占位可见 */
.seal-off {
  opacity: 0.5;
  border-style: dashed;
}

.seal-ring {
  width: 96rpx;
  height: 96rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 4rpx solid var(--cinnabar);
  border-radius: 50%;
}
.seal-off .seal-ring {
  border-color: var(--muted);
}
.seal-glyph {
  font-family: var(--serif);
  font-size: 40rpx;
  color: var(--cinnabar);
  letter-spacing: 0;
}
.seal-off .seal-glyph {
  color: var(--muted);
  font-size: 30rpx;
}
.seal-name {
  font-family: var(--serif);
  font-size: 28rpx;
  letter-spacing: 0.06em;
}
.seal-desc {
  font-size: 22rpx;
  text-align: center;
  line-height: 1.5;
}
.seal-at {
  font-size: 21rpx;
}

.check {
  margin-top: 56rpx;
  padding: 26rpx 0;
  text-align: center;
  font-size: 28rpx;
  letter-spacing: 0.14em;
  color: var(--cinnabar);
  border: 2rpx solid var(--cinnabar);
  border-radius: 12rpx;
}
</style>