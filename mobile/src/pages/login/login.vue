<script setup lang="ts">
import { ref } from 'vue'
import { login, register } from '../../utils/auth'

/**
 * 登录 / 注册合一页。v1 只做「用户名 + 密码」：
 * 留学生的手机号常在换，邮箱不一定天天看，用户名最稳。
 */
const mode = ref<'login' | 'register'>('login')
const username = ref('')
const password = ref('')
const nickname = ref('')
const loading = ref(false)

/** 与后端 routes/auth.ts 的 USERNAME_RE 保持一致 */
const USERNAME_RE = /^[A-Za-z0-9_]{3,20}$/

function toast(title: string) {
  uni.showToast({ title, icon: 'none' })
}

function back() {
  const pages = getCurrentPages()
  if (pages.length > 1) {
    uni.navigateBack()
  } else {
    uni.switchTab({ url: '/pages/learn/learn' })
  }
}

async function submit() {
  if (loading.value) return

  const name = username.value.trim()
  if (!USERNAME_RE.test(name)) {
    toast('用户名要 3–20 位字母、数字或下划线')
    return
  }
  if (password.value.length < 6) {
    toast('密码至少 6 位')
    return
  }

  loading.value = true
  try {
    if (mode.value === 'login') {
      await login(name, password.value)
    } else {
      await register(name, password.value, nickname.value.trim() || undefined)
    }
    toast(mode.value === 'login' ? '欢迎回来' : '注册好了')
    setTimeout(back, 500)
  } catch {
    // 失败提示由 utils/request.ts 统一弹出（后端 message 原样显示），这里不重复弹
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <view class="hd-page login">
    <view class="brand">
      <text class="brand-title hd-title">汉语搭子</text>
      <text class="brand-sub">用户名就能开始，不用手机号</text>
    </view>

    <view class="tabs">
      <text class="tab" :class="{ on: mode === 'login' }" @tap="mode = 'login'">登录</text>
      <text class="tab" :class="{ on: mode === 'register' }" @tap="mode = 'register'">注册</text>
    </view>

    <view class="form">
      <view class="field">
        <text class="field-label">用户名</text>
        <input
          v-model="username"
          class="field-input"
          type="text"
          :maxlength="20"
          placeholder="3–20 位字母、数字或下划线"
          placeholder-class="ph"
        />
      </view>

      <view v-if="mode === 'register'" class="field">
        <text class="field-label">昵称 <text class="opt">可留空</text></text>
        <input
          v-model="nickname"
          class="field-input"
          type="text"
          :maxlength="12"
          placeholder="同学怎么称呼你"
          placeholder-class="ph"
        />
      </view>

      <view class="field">
        <text class="field-label">密码</text>
        <input
          v-model="password"
          class="field-input"
          type="text"
          password
          :maxlength="64"
          placeholder="至少 6 位"
          placeholder-class="ph"
        />
      </view>

      <button class="submit" :loading="loading" :disabled="loading" @tap="submit">
        {{ mode === 'login' ? '进去练' : '注册并开始' }}
      </button>
    </view>

    <text class="hd-note tip">
      账号只用来存你的练习记录和错题本，不会拿去别处。
      密码忘了找任课老师重置 —— v1 不做自助找回。
    </text>
  </view>
</template>

<style>
.login {
  padding-top: 60rpx;
}

.brand-title {
  display: block;
  font-size: 56rpx;
  letter-spacing: 0.14em;
}
.brand-sub {
  display: block;
  margin-top: 14rpx;
  font-size: 26rpx;
  letter-spacing: 0.08em;
  color: var(--muted);
}

/* 登录 / 注册 切换 */
.tabs {
  display: flex;
  gap: 48rpx;
  margin: 64rpx 0 40rpx;
  border-bottom: 1rpx solid var(--rule);
}
.tab {
  position: relative;
  padding: 0 4rpx 20rpx;
  font-family: var(--serif);
  font-size: 32rpx;
  letter-spacing: 0.1em;
  color: var(--muted);
}
.tab.on {
  color: var(--ink);
  font-weight: 600;
}
.tab.on::after {
  content: "";
  position: absolute;
  left: 0;
  right: 0;
  bottom: -1rpx;
  height: 3rpx;
  background: var(--cinnabar);
}

/* 表单 */
.field {
  margin-bottom: 34rpx;
}
.field-label {
  display: block;
  margin-bottom: 12rpx;
  font-size: 26rpx;
  letter-spacing: 0.06em;
  color: var(--muted);
}
.opt {
  font-size: 23rpx;
  color: var(--muted);
}
.field-input {
  box-sizing: border-box;
  width: 100%;
  height: 92rpx;
  padding: 0 24rpx;
  font-size: 30rpx;
  color: var(--ink);
  background: var(--card);
  border: 1rpx solid var(--rule);
  border-radius: 12rpx;
}
.ph {
  color: #a89c85;
  font-size: 27rpx;
}

/* 提交：朱砂实心，全页唯一一块大面积朱砂，占比仍很小 */
.submit {
  margin-top: 20rpx;
  height: 96rpx;
  line-height: 96rpx;
  font-size: 32rpx;
  letter-spacing: 0.2em;
  color: #fcfaf5;
  background: var(--cinnabar);
  border: none;
  border-radius: 12rpx;
}
.submit::after {
  border: none;
}
.submit[disabled] {
  opacity: 0.6;
}

.tip {
  display: block;
  margin-top: 48rpx;
}
</style>
