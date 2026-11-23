<script setup lang="ts">
import { onLaunch } from '@dcloudio/uni-app'

onLaunch(() => {
  console.log('[汉语搭子] App 启动')
})
</script>

<style>
/**
 * 设计令牌（唯一真源，页面里一律用 var()，不要临时配色）
 * 配色取自方案书第十节：宣纸 / 朱砂 / 泥金 / 墨
 *
 * 朱砂只用在批注、强调、印章、错误提示上，全屏面积控制在 5% 以内 —— 朱砂一多就变成廉价红。
 * 深色模式不是简单反色，是墨底金线：底色偏冷的近黑，线条用泥金，朱砂提亮一档保对比度。
 */
:root,
page {
  --paper: #f6f2ea; /* 宣纸（底色） */
  --card: #fcfaf5; /* 卡片：宣纸提亮一档 */
  --ink: #1a1a1d; /* 正文 */
  --cinnabar: #ae332e; /* 朱砂（主强调） */
  --gilt: #8a6614; /* 泥金（次强调） */
  --rule: #ded6c6; /* 分隔线 */
  --muted: #8c8168; /* 次要文字 */
  --wash: #efe9dc; /* 淡底：选中态、进度槽 */

  --serif: "Noto Serif SC", "Source Han Serif SC", "Songti SC", "SimSun", serif;
  --sans: -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif;
}

@media (prefers-color-scheme: dark) {
  :root,
  page {
    --paper: #121214;
    --card: #1a1a1c;
    --ink: #eae4d8;
    --cinnabar: #e1705f;
    --gilt: #c9a227;
    --rule: #2c2a27;
    --muted: #8a8578;
    --wash: #23211f;
  }
}

page {
  background: var(--paper);
  color: var(--ink);
  font-family: var(--sans);
  font-size: 30rpx;
  line-height: 1.65;
  -webkit-font-smoothing: antialiased;
}

/* 通用：页面容器（左右留白统一在这里，页面里不要再各写一套） */
.hd-page {
  min-height: 100vh;
  box-sizing: border-box;
  padding: 0 40rpx calc(48rpx + env(safe-area-inset-bottom));
}

/* 通用：宋体标题 */
.hd-title {
  font-family: var(--serif);
  font-weight: 600;
  letter-spacing: 0.06em;
  color: var(--ink);
}

/* 通用：宣纸卡片 */
.hd-card {
  background: var(--card);
  border: 1rpx solid var(--rule);
  border-radius: 16rpx;
  padding: 36rpx;
}

/* 通用：印章式小标记（朱砂描边方章，不是实心红块） */
.hd-seal {
  display: inline-block;
  font-family: var(--serif);
  font-size: 24rpx;
  line-height: 1;
  color: var(--cinnabar);
  border: 2rpx solid var(--cinnabar);
  border-radius: 6rpx;
  padding: 8rpx 10rpx;
  letter-spacing: 0.1em;
}

/* 通用：分隔带（回纹的骨架：两条细线夹一个「回」字，不铺满背景） */
.hd-rule {
  display: flex;
  align-items: center;
  gap: 20rpx;
  margin: 56rpx 0 36rpx;
}
.hd-rule .line {
  flex: 1;
  height: 1rpx;
  background: var(--rule);
}
.hd-rule .glyph {
  font-family: var(--serif);
  font-size: 28rpx;
  line-height: 1;
  color: var(--gilt);
  letter-spacing: 0;
}

/* 通用：次要说明 */
.hd-note {
  color: var(--muted);
  font-size: 25rpx;
  line-height: 1.8;
}
</style>
