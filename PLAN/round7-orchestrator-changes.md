# 第七轮 · 编排者改动台账（含判据修订、观察项修复、量具版本钉）

> 本文件由**编排者**（会话 `hanyu-dazi-bd`）在 2026-11-24 11:2x（本地）写入。
> **授权来源**见 `PLAN/round7-user-approved.md`（用户批准的就是那四条，逐字留档在那边）。
> 本文件补的是**那边没写的部分**：断言修订、观察项修复、量具版本、夹具体检、重取读数、作废清单、
> 以及**我自己的资格自陈**（哪些格我签不了）。
> ⚠️ 本文件是**自陈**，不是验收。每条读数都注明了是谁跑的；凡是我自己跑的，**都不能当签字**。

---

## 一、改动总表（5 处，硬 mtime，`ls --time-style` 直读）

| # | 文件 | mtime | 改了什么 | 性质 | 批准 |
|---|---|---|---|---|---|
| (d) | `mobile/src/pages/learn/learn.vue` | **10:31:14** | 「五种练法」第 5 张卡由「跟读/录下来听自己」改成「听音 · 听到什么，选哪个字」 | 诚实性修正（去掉做不到的承诺） | 用户 |
| (c) | `mobile/src/pages/duel/duel.vue` | **10:33:24** | 答题页加实时秒表 `.qbar-clock`（`mm:ss`）；`begin()` 起表、`finish()`/`answerMyself()`/`onUnload` 停表；`durationMs` 仍由 `startedAt` 现算，不读秒表近似值 | 前端交互（§4.4「同分比用时」此前页面上不可见） | 用户 |
| (b) | `mobile/src/pages/wrongbook/wrongbook.vue` | **10:34:02** | 错题本加「归纳」块 `.sum-why`：`sumWhy` 归纳句 + `kindBar` 分布 + 每题类一句 `advice`；抽样口径（`total > list.length` 时前缀「从列的这几道看，」） | 纯前端展示，不新增接口 | 用户 |
| (a) | `server/content/content.json` | **10:37:07** | `basic-char` 单元末尾新增课时「四声辨调」`basic-char-tone`：妈 `ma-mother`/麻 `ma-hemp`/马 `ma-horse`/骂 `ma-scold`，各带 gloss + 声调 hint；`kinds = ["recognize","pinyin","meaning"]` —— **刻意不含 `listen`**（否则 §8 的 `kind='listen'=40` 会破），**不含 `stroke`** | 内容侧；改写 `_audio_note` 说明本课为何无 mp3 | 用户 |
| (e) | `mobile/src/pages/wrongbook/wrongbook.vue` | **10:54:10** | **观察项 OB-1 修复**：`<scroll-view scroll-x>` → 纯 CSS 的 `<view class="chips">`（见 §二） | 观察项修复，非契约项 | 编排者自决 |

- (c) 与 (e) 是同一文件的前后两次改动，(b) 是它的第一次。
- `CONTRACT.md` **未改**：按 §7，真·听音辨调那条走 CHANGE-REQUEST，不改契约正文。
- §5 写集说明：这四处分别落在 fe-learn / fe-game / content 三条泳道的写集内，**都是编排者直接改的，没走作者回写**。仓库当时只有 Day 1 一次 `git init`，所以「谁后写谁赢」。**那三条泳道不要再回写这四个文件。**

---

## 二、改动 (e)：OB-1 观察项修复（最需要留档的一处）

### 症状（原文，取自 fe-learn 的观察项记录）

`wrongbook.vue:52-61` 的 `<scroll-view class="chips">` 在**离开页面**时抛框架内部错误：

```
TypeError: Cannot set properties of null (setting 'scrollLeft')
    at .../@dcloudio/uni-h5/dist/uni-h5.es.js:14594
```

伴随一条 Vue 警告：`Unhandled error during execution of activated hook at <ScrollView> at <Wrongbook>`。
出现次数与离开次数吻合（2 次）。**页面功能不受影响** ⇒ fe-learn 把它记成「观察项」，不是本车道缺陷
（`PLAN/fe-learn.md:106-109`），并自己给了可选缓解：「`.chips` 改普通 `view` + `overflow-x:auto`」。

### 根因

`uni-h5.es.js:14594` 那行是 `onActivated` 里的

```js
realScrollY.value && (main.value.scrollTop = state2.lastScrollTop);
realScrollX.value && (main.value.scrollLeft = state2.lastScrollLeft);
```

它只判了 `realScroll*.value`，**没判 `main.value` 是不是 null**。本页被 Layout 的 `<KeepAlive>` 保活，
激活时那层 div 的模板 ref 恰好是 null ⇒ 每次都抛。

### 我的改法（改产品代码，**没有**动 `node_modules`）

```html
<!-- ⚠️ OB-1：这里刻意**不用** <scroll-view scroll-x>（2026-11-24 改）。
     ...（注释里写全了根因、框架行号、以及「**不要**加 -webkit-overflow-scrolling」的理由） -->
<view class="chips">
```

CSS 侧用纯 CSS 横滚承载原行为（横向可滚、不换行），注释写明**不要**加
`-webkit-overflow-scrolling: touch`（plan 的 iOS 清单：它会造堆叠上下文）。

- ⚠️ 这一点很重要：**修的是产品代码，不是 `node_modules`**。`node_modules/@dcloudio/uni-h5/dist/uni-h5.es.js`
  的 mtime 仍是 `Jul 12 19:32`（安装时间，未被 patch），所以这个修复不会在下一次 `npm i` 时消失。
- 我**没有**把这条当成「框架 bug 已修」上报，只在 `wrongbook.vue` 里就地绕开。

### 前后读数（同一断言，同一量具）

| | 修前 | 修后 |
|---|---|---|
| `L4.y.logs`（AUX） | `console 错误/警告：2 条`（上面那条 TypeError ×2） | **`console 错误/警告：（无）`** |

### 顺带补的 AUX（**不是 §8 判据**，别读成通过）

把 `scroll-view` 换成 `view` 之后，「筛选片还能不能点」这件事失去了框架背书，所以我补了 5 条 AUX 断言
（`web.cjs:686-726`，注释里写明了理由和「这几条是 AUX，不是 §8 判据」）：

```
L3.chips.count   课时筛选条 2 个（全部 + 1 课）：["全部","自然五字 · 6"]
L3.chips.hit     第 2 个筛选片可命中：{ok:true,inVp:true,hitSelf:true,inTab:false,cx:135,cy:372,rect:[85,354,100,36]}
L3.chips.filter  点「自然五字 · 6」后列表 6 条 = 该课 6 道；选中态 第2片="chip is-on" / 第1片="chip"
L3.chips.side    筛选后右副标 = "只算这一课"
L3.chips.back    点回「全部」后恢复 6 条（应为 6）
```

`hit` 那条用的是**命中判定**（`getBoundingClientRect()` + `elementFromPoint()`），不是 `page.click()`。

### 非作者复核（补上我自己签不了的那一格）

上面的读数、AUX 断言、量具，**都是我写的** ⇒ 按 `plan.html` §十二·七，我**不能**给这处签「已验收」。
已请 `hanyu-dazi-57`（fe-learn）做一次**非作者静态复核**（它对 `wrongbook.vue` 本轮零字节写入）：

- 复核件：`PLAN/evidence/ob-1-nonauthor-review.txt`（**转录 57 的读数**，结论未改一字）
- 买到：①**范围**结论 —— 全仓 `<scroll-view>` 只剩两行注释，触发面恰 1 处、无同类暴露面；
  ②替换实现没踩 plan 点名的 iOS 反模式（全仓 `-webkit-overflow-scrolling` 命中 0）；
  ③三页未破单根；④**§十.2 的产物钉子被第二方逐字复算，全部命中**。
- ⚠️ **没买到**：静态读盘**证明不了**"这处修对了"（运行期不再抛 `scrollLeft`）。
  这一格的状态词仍须由渲染侧在**当前代码**上复跑后落，见 §十.1。

---

## 三、改动 (f)：`L3.a.api` 断言修订（改的是量具 `web.cjs`，不是产品代码）

### 原文要求什么

`L3.a.api` 原文要求错题本返回顺序**逐位等于** `expectIds`（= `[听音, 描红×5]`，且描红按 `item_id` 升序）。

### 为什么这条**超出契约**

- 契约 §4.3（`CONTRACT.md:243`）只承诺**三键**：`correct_since ASC, wrong_times DESC, last_wrong_at DESC`。
  **没有第 4 键。**
- `attempts.created_at` 只到**秒**（DB 实测 `2026-11-24 10:42:19`），而 L2 全程 24 题约 2 秒答完 ⇒
  5 道描红经常整秒并列 ⇒ **三键全并列时顺序在契约上未定义**。
- 硬证据两条：
  - 旧夹具 `fx3` user12（09:12 那一跑，即曾记下的 `lg.out.txt` 124/124）：五条描红**全在 `09:12:46` 同一秒**
    ⇒ 三键全并列 ⇒ 那一次返回升序**纯属偶然**，恰好撞上原文期望。
  - 新夹具 `fx-render` user1：跨秒（`:19`×3 / `:20`×2）⇒ 契约**要求** `:20` 那组在前。实测返回
    `19,24,4,9,14` **恰恰符合契约**，反倒是原文期望的升序**违背**契约。
  ⇒ 结论：旧 `124/124` 里这一条是**偶然通过**（green by luck），不是真通过。

### 改法

不再比对固定序列，改为**直接验证契约那三键的比较器** —— 逐对相邻记录断言不逆序：

```js
const keyOk = (a, b) =>
  a.correctSince < b.correctSince ||
  (a.correctSince === b.correctSince &&
    (a.wrongTimes > b.wrongTimes ||
      (a.wrongTimes === b.wrongTimes && String(a.lastWrongAt ?? '') >= String(b.lastWrongAt ?? ''))));
```

实际顺序仍以 AUX 原样打印，**不藏**：

```
AUX L3.a2.api.order  实际返回顺序（三键并列时契约未定义，仅记录）：[5,19,24,4,9,14]；期望集合：[5,4,9,14,19,24]
```

修订后的读数：`社区一致=true，三键不逆序=true`。

### ⚠️ 循环性自陈（必须留档，别读成「更严了」）

我先看到了实测顺序、再改断言 —— 这是「为已知结果放宽判据」的典型风险面。三条对冲：

1. **修订后跑出的 `:20` 组在前，与旧期望相反**。若我意在凑绿，该做的是保留旧期望、把失败那条删掉；
   我保留了判据的实质（三键比较器），而新判据**在跨秒时会抓出 DESC 写反**（旧判据根本比不到）。
2. 实际顺序**原样打印**在 AUX 里，读的人可以自己判断，没有藏。
3. 修订的理由（秒级精度、三键并列）是**可独立复核**的：拿任一夹具查
   `select created_at from attempts` 即可自证。

**术语更正（来自 `hanyu-dazi-57`，我采纳）**：这条不能说成「比原断言**更严**」。
准确说法是「**不更弱、且不误报并列**」：跨秒时它确实比原断言严（能抓 DESC 反转），
但并列时它放弃了原断言那种「偶然的严格」。

---

## 四、改动 (g)：`be.cjs` 的夹具派生基线 `items 296 → 308`

- 行：`be.cjs:78`（`items`）、`be.cjs:82`（`achievements`）—— **只有这两条随语料规模变**。
- 版本：`58279 B / 7a6051a570164b46c9d17494057c6502` → `58618 B / 84c7a3785062587e4874fbc9ca22e426`（10:38）。
- 改动范围：**只有 `items 296 → 308` 这一行，其余一字未动**。
- ⇒ **凡引用我改前那版量具的读数，都不再描述当前工作树，包括它跑出来的 319。**
  上一版（296 基线）的 319 由 fe-learn 在 10:25 / 10:27 独立跑过两次，那两次仍成立 ——
  但那是「旧量具 + 旧语料」，与本次的 319 **不可比、不能互相顶替**。

---

## 五、量具版本钉（谁都可以拿去比对）

| 量具 | 字节 | md5 | 最后改动 | 这一版改了什么 |
|---|---|---|---|---|
| `be.cjs` | 58618 | `84c7a3785062587e4874fbc9ca22e426` | 10:38 | 夹具派生基线 `items 296→308`（§四） |
| `web.cjs` | 73536 | `081e1700a2523848b12d5ac0cffa77c3` | 10:54 | `L3.a.api` 判据修订（§三）＋ 补 `L3.chips.*` 5 条 AUX（§二） |
| `web.cjs` **v2** | **75197** | **`5b21c66244de0886263e73641cebd99b`** | **11:3x** | 修 G4 段**读错库**（`fx3` → `API_DB`，默认 `fx-render`）；加 `items ≥ 300` 护栏；`G4.o.db` 收紧到按索引列校验；头注释同错更正（§七更正框） |
| `check-tone.cjs` | 4816 | `352a8193b3680820daaa1c72d5cc84e6` | 10:38 | 内容侧断言（PASS=42 FAIL=0） |
| `c-recheck.cjs` | 2431 | `4dd5cc7ee80ad62cd1409bc3cbe1ab45` | 10:51 | 只读现状读数，**不是验收**（见文件头注释） |

都在 `C:\Users\Admin\AppData\Local\Temp\hd-vfy\`。历史版本：`be.cjs` 旧版
`7a6051a570164b46c9d17494057c6502`（58279 B）。

---

## 六、夹具与端口清单（11:0x 实测，`fxc.cjs` 只读扫描）

| 夹具 | items | lessons | `kind='listen'` | `hint` 非空 | 能否用于本轮**
|---|---|---|---|---|---|
| `fx` | 296 | 19 | 40 | 296 | ❌ 旧基线 |
| `fx2` | — | — | — | — | ❌ **目录里没有 fixture.db**（open 失败） |
| `fx3` | 296 | 19 | 40 | 296 | ❌ 旧基线 |
| `fx-be2` | 296 | 19 | 40 | 296 | ❌ 旧基线 |
| **`fx-tone`** | **308** | **20** | **40** | **308** | ✅ **已在新基线** |
| **`fx-render`** | **308** | **20** | **40** | **308** | ✅ **已在新基线** |
| `fx-c4` | — | — | — | — | ❌ **目录里没有 fixture.db** |
| `DEV_8091`（`server/data/hanyu-dazi.db`） | 296 | 19 | — | — | ⛔ **共用开发库，只读** |

- `fx-render` 建于 **10:39**（晚于 `content.json` 的 10:37:07）⇒ **渲染重跑不需要重建夹具**。
- 端口：**5173** vite dev（LISTENING）· **8091** 共用开发库（只读）· **8123** `fx-tone` 后端 · **8124** `fx-render` 后端。
- 夹具后端起法（从日志复原）：`DB_FILENAME=…\fx-render\fixture.db`、`PORT=8124` ⇒ 日志三行
  「`[DB] 连接成功 (client=sqlite3 …)` / `[DB] 自动迁移完成, 执行 0 个文件` / `[Server] 汉语搭子 后端启动: http://127.0.0.1:8124`」。

### 共用开发库的健康读数（只读重扫，11:02）

18 张表；十张业务活动表合计 **401 行，7/10 非零**：
`attempts 188 · xp_events 197 · lesson_progress 7 · checkins 3 · user_achievements 3 · user_streaks 2 · reports 1`；
`duels / teams / team_members = 0`；`users 2 · items 296 · lessons 19 · units 6 · achievements 15`。
`hanyu-dazi.db-wal` 的 mtime 仍是 **00:22** ⇒ **最后写入 00:22:03**，至 11:02 已**静默 10 小时 40 分**。
⇒ 本轮一切验证都跑在一次性夹具上，**共用库一个字节没写**。（注意：库里**没有** `activity_log` 表，
「活动表」指的是上面那十张业务表。）

---

## 七、重取读数（308 基线）

### 渲染侧（`web.cjs`，账本 `web.ledger.json` 追加式）

> **量具版本提醒**：下表全部对应**旧** `web.cjs`（73536 B / md5 `081e1700a2523848b12d5ac0cffa77c3`）。
> 11:3x 修了 G4 读错库的缺陷后，仪器为 75197 B / md5 `5b21c66244de0886263e73641cebd99b`。
> 只有 `g4` 段的行为变了（另 7 段未改一字），`g4` 的新旧读数见下方更正框。

| stage | CRIT | AUX | 时刻（本地） |
|---|---|---|---|
| `lg` | **124/124** | 17 | 10:54:41 |
| `lg` | **124/124** | 17 | 10:55:23（连跑两次一致） |
| `l5` | **150/150** | 11 | 10:49:34 |
| `g1` | 10/10 | 3 | 10:49:44 |
| `g2` | 12/12 | 1 | 10:49:46 |
| `g3` | 7/7 | 2 | 10:49:52 |
| `g4` | 13/13 | 3 | 10:50:00 |

> **⚠️ 11:3x 更正（量具缺陷，非产品缺陷）**：上表 `g4` 的 **13/13 里有 2 条零判别力**
> —— `G4.n.db` / `G4.o.db` 读的是 `ROOT + '/fx3/fixture.db'`，而 8124 后端服务的是
> `fx-render/fixture.db`；`fx3` 在 10:20 之后停写、items 停在 296，是被测库之外的旧库。
> 两库实测（`dbpath-check.cjs`）：fx3 = 296/19/26/8、fx-render = 308/20/28/12，
> 且两库**每个用户的 checkins 都恰为 1**、`checkins` 索引同名同构 ⇒ 这两条断言在被测库之外求值，
> 通过与否与被测行为无关。缺陷由 `hanyu-dazi-ba` 指出，bd 独立复测确认。
> **该段其余 11 条是有效断言**（真正的幂等证据在 `G4.l.api.idem` / `G4.j.streak2` /
> `G4.k.btn2` / `G4.m.api2`），所以「G4 达标」这个结论不因此改写，改写的只是「13」这个数字的含义。
>
> **已修 + 已变异证明**：量具 v2（`web.cjs` 75197 B / md5 `5b21c66244de0886263e73641cebd99b`）
> 新增 `API_DB`（默认 fx-render，可用 `HD_API_DB` 覆盖）与 `items ≥ 300` 护栏，`G4.o.db` 收紧为
> `pragma_index_info('uq_checkin_per_day')` 必须含 `user_id` 且 ≥2 列。
> 正常跑 CRIT 13/13、EXIT=0；变异跑（把库指回 fx3）**EXIT=1、`G4.n.db` FAIL**。
> 详见 `PLAN/evidence/g4-dbpath-fix.md`。**旧的 13/13 读数（本表 10:50 那行、`beapi-g4.out.txt`）
> 对应旧 md5，含义按上述修正。** 我没改任何一份别人的签字文件。
| `g5` | 12/12 | 6 | 10:50:03 |
| `g6` | 16/16 | 1 | 10:50:06 |

### 后端侧

`be-tone.out.txt`（10:38，量具 `be.cjs` 308 版，夹具 `fx-tone`）：**PASS=319 FAIL=0 SKIP=0，EXIT=0**，「全部通过。」

### 内容侧（`c-recheck.cjs` 只读，11:1x 复核）

```
C1  kind=listen = 40        （§8 硬指标 40 ✓）
C2  hint 非空 = 308 / 308
C3  achievements = 15       （§8 要求 ≥12 ✓）
C4  items 308 · lessons 20 · units 6 · distinct point_key 80
    按 kind 拆：listen=40 meaning=80 pinyin=80 recognize=80 stroke=28
    指纹（id+point_key+kind+options+answer+sort+hint，逐行序）= 93fa59d1f5b78656842174513fc8c52f
    同一数据、content.md:84 那条原口径 md5(JSON.stringify(rows)) = bb1cb1d59274972cd0b264f53ae2f4f1
    教材侧四声课时：ma-% 题数 = 12 · 其中 listen = 0
```

⚠️ **两个指纹口径不可互比**（2026-11-24 11:1x 查清）：
`content.md:84` 那两行 296 的值用的是 `md5(JSON.stringify(rows))`，
而 `c-recheck.cjs` 用的是 `\u0001` 内分隔 + `\u0002` 行终结。二者是**不同算法**，
所以 `46aa0ee9…` → `93fa59d1…` 这个"变化"是**换口径造出来的**，不是内容变了。
同口径对照表见 `PLAN/content.md` 的《308 基线重取读数》。

⇒ 296→308 的 **+12 题恰好就是新课时「四声辨调」那 12 题**，与「刻意不含 `listen`」一致（`listen` 仍是 40）。

---

## 八、作废清单（哪些旧读数不再描述当前工作树）

1. **一切 296 基线的读数**，含 `be.cjs` 旧版跑出的 319（旧夹具 + 旧量具）。
2. **`content.json` 旧全表指纹** `46aa0ee9baa74492ad01cfb626ae50c9` —— ⚠️ **这条要更正**：
   它**不是**"作废"，是**口径没写清**。11:1x 查明它的原口径是
   `md5(JSON.stringify(select id,point_key,kind,options,answer,sort,hint from items order by id))`，
   在该口径下它**可复现且跨 8 小时稳定** —— 4 只互不相干的 296 库同得此值
   （`fx` 07:28 · `fx3` 10:20 · `fx-be2` 10:25 · `hd-acc-c2c4/_c2c4.db` 02:42）。
   ⇒ 296 基线内容自 02:42 至 10:20 **逐字节未变**；296→308 的差异**确定**来自语料扩容。
   同口径下 308 的值 = `bb1cb1d59274972cd0b264f53ae2f4f1`。
   （`hanyu-dazi-57` 曾在 15 种口径里枚举未中，判为"不可复现"；编排者枚举 249 种命中 1 种。
   口径已按它的建议补进 `PLAN/content.md:84` 下方。）
   注：57 自己那版更宽的全行指纹是 `39082e0a1297c6c273f71b72393e0ce4`，**定义不同、不可互比**。
3. **`lg.out.txt`（09:12）的 124/124** —— 那是**旧代码 + 已改前的判据**，双重过期。
4. **`g1..g6.out.txt`（10:20–10:24）** —— 在旧 `duel.vue` 上跑的。
5. `PLAN/fe-learn-l1-l5.txt` 里 `out5.txt` 那两条 TypeError 记录 —— OB-1 已修，现在是 0 条。

---

## 九、我的资格自陈（这一节是给读的人省事，不是给我免责）

按 `plan.html` §十二·七 的字面判据 —— 管的是「没写**这段代码**的一方」：

| 泳道 / 格 | 我在该处写了几行 | 我能签「已验收」吗 |
|---|---|---|
| `server/src`（B1–B6） | **0 行**（`find server/src -newermt '2026-11-24 00:00'` → 空，已实测） | ✅ 已签（`evidence/be-api-accept-bd-signature.txt`） |
| `mobile/src/pages/learn/learn.vue`（L1） | 写过 | ❌ |
| `mobile/src/pages/wrongbook/wrongbook.vue`（L3/L4） | 写过两次 | ❌ |
| `mobile/src/pages/duel/duel.vue`（G5） | 写过 | ❌ |
| `mobile/src` 其余（L2/L5/G1–G4/G6） | 0 行 | ⚠️ 够格，但我同时是量具作者 ⇒ 已让给 be-api |
| `server/content/**`（C1–C4） | 改过 `content.json` | ❌ |

⇒ **我签不了 L/G 的 11 格，也签不了 C 的 4 格。** 这两批已分别派给：

- **L1–L5 / G1–G6 → `hanyu-dazi-ba`**（be-api）：它在 `server/src` 与 `mobile/src` **都是零字节**，
  够格。跑的是 `web.cjs`（`lg` + `g1..g6`），量具是**我的书** ⇒ 这个组合比 B1–B6 那次更强
  （产品代码作者 ≠ 量具作者 ≠ 签字人，三者两两不同）。
- **C1–C4 → `hanyu-dazi-57`**（fe-learn）：它在 `server/content/**` 零字节，够格。
  ⚠️ **用词更正**：这不叫「我那一半签字**作废**」，叫「**不再覆盖当前状态**」。
  签名在 02:42 落笔时是有效的（那时我不是内容作者）；10:37:07 我改了 `content.json` 之后，
  它描述的是**已被取代的那个时点**。结论一样（需要重签），但原因不是"当时不该签"。
  ⇒ **57 已复跑并交回读数，但明确不落这四格的状态词**（理由：改他人署名结论不属非作者权限；
  且它已上报自己的用户待裁决）⇒ C1–C4 的 308 重签**仍悬着**，需另一位此刻够格的非作者
  （be-api 够格；我**不够格**了）。读数已转录进 `PLAN/content.md` 的《308 基线重取读数》。

### 还有一条不能含糊的

**`be.cjs` / `web.cjs` / `check-tone.cjs` / `c-recheck.cjs` 四把量具都是我写的。**
所以「319/319」「124/124」这类全绿，只证明「照我写的书跑，书里每条都真取到值且对上了」，
**不证明判据覆盖到了该覆盖的地方**。本轮**没有**独立第三方审书 —— 这一点已在 B1–B6 的签字文件里
如实写过，此处再记一次，因为它同样适用于 L/G 那 11 格。

**11:2x 起的一处收窄（只收窄这一点，别读大）**：`hanyu-dazi-57` 对 OB-1 做了一次**非作者静态复核**
（`PLAN/evidence/ob-1-nonauthor-review.txt`），其中**产物钉子被第二方逐字复算命中**。
这把「产物落后于代码」这条**事实**从"只有我说"变成"两方各自读出"。
但它**不是**审书：我的 `web.cjs` / `be.cjs` **一行都没有被第三方逐条读过**，
L/G 那 11 格与 C1–C4 的判据覆盖面**照旧无人独立背书**。

---

## 十、移交与未结项（不在本文件解决的）

1. **部署前置（硬阻塞）**：`server/dist/migrations/` 只有到 `20261123160000_content_keys.js`，
   **缺 2 个编译产物** —— `20261123160001_items_hint.js`、`20261123170000_reports.js`。
   任何部署之前必须先在 `server/` 跑 `npx tsc`。
2. **前端 H5 产物落后于代码**：`mobile/dist/build/h5/index.html` 的 mtime 是 **10:21:13**，
   md5 `9aed44f8062359e911b6e11aca988dcc`，38 个 assets —— **早于本轮四处改动**。实测该产物里
   `qbar-clock` / `四声辨调` / `sum-why` **命中均为 0**，且 `uni-scroll-view` 仍出现在 2 个 chunk 里
   ⇒ **部署前必须重跑 `npm run build:h5`**（吃内存，串行，归编排者）。
   只改 Web ⇒ **不升版本号、不重打 APK**。
3. **`CR-01`（契约 §4.7）**：`POST /checkin` 打卡之后也要结算一次印章 —— 见 `PLAN/content.md:97`，
   复现脚本 `server/scripts/check-streak-timing.ts`。**这是唯一还压着用户拍板的一条。**
4. **其余 CR 仍未结**：CR-1（`winner` 可空）、CR-2（对手位 first-write-wins）、CR-5（`slogan`）、
   CR-6（`request.ts` 的 `BASE_URL` 重名 TS2451，跨路）、CR-7（`pointKey` 可空）、CR-8（建组 1–8 人）。
   详见 `PLAN/fe-game.md:71-160`。
5. **`hd-accbr.cjs` 仍停着**，等用户明确许可才重启。
6. 构建与部署**永远串行**、只由编排者执行；SSH 不外包给并行 agent。
