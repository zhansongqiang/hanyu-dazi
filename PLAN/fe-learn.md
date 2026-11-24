# 泳道 fe-learn

> 本文件**只由 fe-learn 自己写**。状态词汇、七列定义、谁能写哪个状态 —— 见 `plan.html` §十二·七。
> 「已验收」**只能由非作者写**。证据落在 `PLAN/evidence/`。

最后更新：2026-11-23（**第六轮：D1 已修并复验通过** —— L1–L5 五条全有浏览器侧证据，**已知缺陷归零**；余四套 dist 产物级复核，归编排者）

| 单元 | 里程碑 | 计划 Day | 状态 | 验收标准 | 证据 |
|---|---|---|---|---|---|
| L1 单元 → 课时 浏览 | M2 | 2 | 已验收 | `learn → lesson` 能点进去，显示课时列表 | `evidence/fe-learn-l1-l5.txt` + **`evidence/be-api-accept-LG.txt`**（非作者 be-api 亲跑 `lg` 段，CRIT 124/124、FAIL=0） |
| L2 答题页四题型 | M2 | 2 | 已验收 | 认字 / 选拼音 / 选词义 / 听音选字四型都能作答并即时反馈 | `evidence/fe-learn-l1-l5.txt` + **`evidence/be-api-accept-LG.txt`**（非作者 be-api 亲跑 `lg` 段：四型+描红 `{"recognize":5,"pinyin":5,"meaning":5,"stroke":5,"listen":5}`，最慢一次即时反馈 24ms） |
| L3 错题本页与重练 | M2 | 2 | 已验收 | 答错的题出现在 `wrongbook`，且能重练 | `evidence/fe-learn-l1-l5.txt` 第五轮 + **`evidence/be-api-accept-LG.txt`**（非作者 be-api 亲跑 `lg` 段 L3 段：6 道错题集合一致、全部重练后可清、`汇总` 文案一致） |
| L4 进度条 | M2 | 2 | 已验收 | 课时完成度与单元进度条随答题动起来 | `evidence/fe-learn-l1-l5.txt` 第四轮 + **第六轮** + **`evidence/be-api-accept-LG.txt`**（非作者 be-api 亲跑 `lg` 段 L4 段：`navigateBack` 无整页重载、课时进度条 80%、单元「已学 1/4」即时刷新） |
| L5 笔画描红 | M2 | 2 | 已验收 | hanzi-writer **本地打包**（不走 CDN），库内 **28** 个描红字全部能描（字表 = 库内 `kind='stroke'` 字符集，零缺零余）| `evidence/fe-learn-l1-l5.txt` + **`evidence/be-api-accept-LG.txt`**（非作者 be-api 亲跑 `l5` 段：CRIT 150/150、扫描字表 20 字、`ok L5.vendor` 库来自本地打包、外部域名请求「（无）」） |

## ✅ 缺陷 D1（L4 的「课时完成度」返回时不刷新）—— **已修 + 已复验**

**状态**：**已修**（2026-11-23，`mobile/src/pages/lesson/lesson.vue`），
**已过变异测试**（修前转红、修后转绿）。第六轮证据：`evidence/fe-learn-l1-l5.txt` §第六轮。

- **现象（修前）**：从答题页点结算页的「回课时」（`quit()` → `uni.navigateBack()`）回到 lesson 页，
  刚做完的那张课时卡**仍是旧的**「未开始 / 0%」，而同一时刻 `GET /api/units/1/lessons`
  返回 `lesson2 {"status":"done","bestScore":20,"bestTotal":20}`。
- **根因**：`pages/lesson/lesson.vue:75` **只有 `onLoad`，没有 `onShow`** ——
  压栈页 `navigateBack` 回来时 `onLoad` 不重跑。对照同作者的
  `pages/learn/learn.vue:97` 用了 `onShow`，注释原文：「从答题页返回时进度条要立刻变，
  onMounted 只跑一次就不刷新了」。
- **影响面**：纯展示态滞后。**无数据丢失、无接口报错**（写入与查询都正确）。
  触发路径唯一：从答题页返回 lesson 页。
- **修法**（取数整体从 `onLoad` 挪进 `onShow`，`onLoad` 只留接参）：
  ```js
  import { onLoad, onShow } from '@dcloudio/uni-app'
  onLoad((query: any) => { unitId.value = Number(query?.unitId || 1) })
  onShow(() => { if (!unitId.value) return; loadUnitHead(); loadLessons() })
  ```
  **不采用**「`onLoad` 里保留取数 + 再加一行 `onShow(() => loadLessons())`」：首进时
  `onLoad` 先于 `onShow`，那样会**双取**。整体挪进 `onShow` 后首进与返回走同一条路径。
- **分半结论**（L4 判据是「课时完成度**与**单元进度条」）：
  **单元进度条 ✅**（`learn.vue` 的 `onShow` 保证，实测 `33% → 67% → 100%`）；
  **课时完成度 ✅**（第六轮修复，实测同一页面栈内 `未开始/0% → 已完成/100%`）。
- **变异测试（第六轮，这是本轮的关键）**：靶子换成 unit 5 两个当时仍为 `none` 的课时 ——
  修前 **lesson 14「买东西」** 走真实页面栈跑完 12 题（`finish` 回包 `status:done / 12/12 / firstDone:true`），
  点「回课时」返回后那三张卡**仍全是** `未开始 / 0%` ⇒ **转红**；
  修后 **lesson 15「出门坐车」** 同样跑完，返回后变成 `已完成 / 100%`、
  卡上「最好 12/12」「再练一次」一并刷新 ⇒ **转绿**。
  ⚠️ **为什么必须换靶子**：lesson 2 / 3 当时已是 `done`，在已完成的课上重跑，
  「修前」本身就显示「已完成」，**红不起来 = 没验**。
- **取证**：`evidence/fe-learn-l1-l5.txt` 第四轮 §L4-b（缺陷定性，三路互证）+
  §第六轮（变异测试，含 `out6-pre/post` 原始读数与截图 `evidence/fe-learn-shots/`）。
- **顺带一条方法论**：hash 路由下跳到别的页面再跳回来**会重新挂载**，所以
  「用 `page.goto` 模拟返回」**验不出** D1 —— 必须走真实页面栈（`navigateTo`/`navigateBack`）。

## 备注

- 所有页面 `<template>` **只有一个根元素** —— 本项目 `Layout` 用 `<Transition>`，多根节点会导致切换后空白**且不报错**。新增路由组件必须自查。
- `mobile/vite.config.ts` 的 `proxy` 只有**一次机会**：`/audio` 与 `/uploads` 两条归 fe-learn 加，fe-game 不要动同一个文件。
- **L5 的字表「以库为准，不手写」**：`pages/stroke/data/chars.json` 的字符集必须等于
  库内 `select distinct char from items where kind='stroke'`。2026-11-23 已对齐到 **28 字**
  —— 此前只有 12 字，content 扩充后多出的 16 道描红题**没有本地字形会静默降级成静态米字格**，
  已补齐。扩字流程写在 `pages/stroke/vendor/README.md`（**只在开发期跑脚本**，产物里零 CDN 请求）。
- **本路自查的两条硬约束**（复核时可一条命令查完）：
  `grep -rn 'res\.data\.' pages/{learn,lesson,practice,wrongbook,stroke}` **应为空**
  —— 2026-11-23 第三轮实测 **0 命中**（唯一一处是 `learn.vue:59` 的注释）；
  五页取数**全部经 api 层**（`courseApi`/`attemptApi`/`wrongApi`），**无一页裸调 `request`**。
  同轮还把五页读过的**每一个响应字段**与 `api/*.ts` 的 interface 求过差集：**无一落空**，
  四处「疑似不属契约」全是正则假阳性（详见证据文件第三轮 ④⑤）。
- **磁盘上那份 `mobile/dist/build/h5/` 是旧构建，不能当证据**：构建于 15:36，而 `pages.json`
  16:39 才改、五页 16:56~22:26 才落地 —— 产物里只有 `learn/login/profile/wrongbook` 四个
  chunk，**没有 `lesson/practice/stroke`**。⇒ 在它上面 grep `jsdelivr`/`HanziWriter` 得 0 是
  **空验**（代码没进 bundle），**不构成**「零 CDN」的证据。四套 dist 须由编排者串行重打。
- **描红降级是双路的，不是一路**：`stroke.vue` 做**课级预告**（进页面就数出这一课有几个字会降级，
  并给用户一句解释），`practice.vue` 做**题级降级**（`createTrace` 返回 `null` → 换静态字形 +
  「我写好了」，答题流程不断）。改任何一边都要确认另一边没被带塌。
- **第四轮（浏览器硬断言）已补 L1 / L2 / L5**，原始输出与逐项读数在
  `evidence/fe-learn-l1-l5.txt` 第四轮。看一眼就够的结论：
  L1 单元卡点击硬断言 `{"inView":true,"hitSelf":true,"inTabbar":false}`；
  L2 25 题五型对错两面全绿且**零写入**（`route.abort()` 拦掉写端点）；
  L5 `createTrace 28/28` + **CDN 请求 0 条 + 非本机请求 0 条**。
- **第五轮（浏览器硬断言）已补 L3**，四条判据逐条达标，原始输出在
  `evidence/fe-learn-l1-l5.txt` 第五轮。一眼够用的结论：
  ① 答错的题**进本子**（4 题故意答错 → `total=4`，itemId 集合与故意答错集合完全一致，**含描红题点「写不出来」**）；
  ② `hint` 与答案**可展开**（页面读数与 API 逐字一致）；
  ③ 课时筛选**不塌**（`只算这一课` / `重练这一课`）；
  ④ **连对两次自动移出** —— 第 1 轮 `cleared:0 remaining:4`（卡上亮 1 格）→
  第 2 轮 `cleared:4 remaining:0`（`correctSince:2`）→ 回本子变**空态**、API `total=0`。
  同一轮还交叉校验了 **XP 增量 = 24×10 + 4×2 = 248**（重练走 `judgeAndPersist()`，与新课同套计分）。
- **L3 的两条实测结论（复核时可能被误判成 Bug）**：
  ① **答错会把 `correct_since` 归零**，把已掌握的行**重新拉回**错题本（A2 段四条均 `correctSince=0`）；
  ② **跨本地零点答题会顺带打卡**，结算页多一行「连续打卡N 天 · +5 XP」——
  产品行为正确，是断言要先跟 `finish` 回包的 `checkin.created` 对齐（脚本已改成双向断言）。
- **第六轮（浏览器硬断言）已补 L4 / D1 复验**，即「变异测试」：**修前必须转红、修后必须转绿**，
  两跑都走真实页面栈，原始读数在 `evidence/fe-learn-l1-l5.txt` 第六轮
  （原始产物 `fe-learn-round6-pre-raw.txt` / `fe-learn-round6-post-raw.txt`，
  截图 `fe-learn-shots/`）。一眼够用的结论：
  修前靶子 lesson 14「买东西」→ 返回后卡 `未开始 / 0%`（同刻 `finish` 回包 `status:done 12/12`）；
  修后靶子 lesson 15「出门坐车」→ 返回后卡 `已完成 / 100%`（卡上「最好 12/12」一并刷新）；
  两跑的单元进度条分别 `0% → 33%` 与 `33% → 67%`（L4 另一半）；两跑 `非 2xx` 均为 **0 条**、
  控制台 **全空**。
- **第六轮顺手定性了一条假阳性**：第五轮那条 404 是 `favicon.ico`，而它在 console 报文里
  **不含 "favicon" 字样**（只有 "Failed to load resource"）—— 只按报文过滤会漏掉，
  必须连 `m.location().url` 一起过滤。改后两跑控制台归零。
- **D1 的「同根兄弟」已排查过，只剩这一处**：本路独占五页里 `learn.vue` 本来就是 `onShow`
  （tabBar 页，注释已写明理由），`wrongbook.vue` / `profile.vue` 亦同；
  `practice.vue` / `stroke.vue` 是答题页，返回时不承载「需要刷新的列表读数」。
  ⇒ **压栈页里「返回后要刷新」的只有 `lesson.vue` 一处，已修。**
- **观察项 OB-1（非本车道缺陷，冻结期未改）**：`wrongbook.vue:52-61` 的
  `<scroll-view class="chips">` 在**离开页面**时触发框架内部
  `TypeError: Cannot set properties of null (setting 'scrollLeft')`（`uni-h5.es.js:14594`），
  出现次数与离开次数吻合（2 次）；页面功能不受影响。可选缓解：`.chips` 改普通 `view` + `overflow-x:auto`。
- **四套 dist 尚未重打**：本路**未跑 `uni build`**（吃内存，归编排者串行）。
  L5 的「不走 CDN」目前是源码/dev-server 级证据，产物级仍需在重打的 dist 上复核。
  另：磁盘上那份 `mobile/dist/build/h5/` 是**旧构建**（详见下方备注），不能当证据。
- **本泳道交出的状态（2026-11-23 收口）**：L1–L5 **五条全有浏览器侧硬断言**，
  **已知缺陷归零**（唯一的 D1 已修并过变异测试）。剩下**全部**是编排者的事项：
  ① 四套 dist 串行重打 + L5 产物级复核；② 清 id=4（`pf` 前缀）名下冒烟数据；
  ③ 波次 2 合并与 `git diff` 核对；④ 构建与部署（含任何 SSH）。**本路无阻塞项。**
