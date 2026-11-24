# 泳道 content

> 本文件**只由 content 自己写**。状态词汇、七列定义、谁能写哪个状态 —— 见 `plan.html` §十二·七。
> 「已验收」**只能由非作者写**。证据落在 `PLAN/evidence/`。

最后更新：2026-11-24

| 单元 | 里程碑 | 计划 Day | 状态 | 验收标准 | 证据 |
|---|---|---|---|---|---|
| C1 40 个音频 | M2 | 2 | 已验收 | `content/audio/` 40 个 mp3；`select count(*) from items where kind='listen'` = 40 | `evidence/content-audio.txt` |
| C2 hint 入库 | M2 | 2 | 已验收 | 答题反馈（`POST /attempts`）里出现 hint | `evidence/content-hint-feedback.txt`；工具 `scripts/check-hint-feedback.ts`（6/6 断言成立，exit 0；3 次变异转红/拒绝）＋ **非作者复跑见下** |
| C3 印章定义种子 | M3 | 3 | 已验收 | `select count(*) from achievements` = 15（§8 要求 ≥12） | `evidence/content-stamps.txt`；补充：`evidence/content-stamps-reachability.txt` |
| C4 内容扩量 + 幂等 | M5 | 5 | 已验收 | 重跑导入两遍，第二遍「新增 0，更新 N」；`content.json` 合法且校验 0 错误 | `evidence/content-idempotency.txt`（第 2/3/4 遍全「新增 0」，items 全表指纹三次不变，audit exit 0）＋ **非作者复跑见下** |

## 备注

- **C2、C4 的状态词已由非作者改动**（2026-11-24）：两条的验收标准都要求**写库实测**
  （C2 要在 `POST /attempts` 的反馈里看到 hint；C4 要重跑导入两遍验「第二遍新增 0」），
  作者先在自己的**一次性库**（`data/_verify.db`、`data/_c4.db`）上跑完落证据，
  非作者（be-api / 编排者）又在**另一只全新一次性库**上亲手复跑了一遍 —— 两次都成立，
  故状态从「待验收」改为「已验收」。复跑的完整读数见下面那节《验收记录 · C2 / C4》。
- C2 的验收不再是手敲 curl：`server/scripts/check-hint-feedback.ts` 在进程内起真服务
  （端口交给系统挑）、走 `register` 绕开 login 限流、**拒绝在共用库上运行**、只设
  `process.exitCode` 不调 `process.exit()`（详见证据文件里那条 127 退出码的坑）。
- C4 的幂等验了两层：行数层（第 2/3/4 遍「新增 0」）和**内容层**（items 全表 md5
  `46aa0ee9baa74492ad01cfb626ae50c9` 三次不变，含 `options`）—— 只验行数的话，
  干扰项打散退化成随机也照样绿。
- `items.hint` 新增列归 content 的迁移 `20261123160001_items_hint.ts`；be-api 侧已做列探测容错。
- 本路**不自验收**：C1–C4 的「已验收」都是**非作者**填的（C1、C3 由 orchestrator，
  C2、C4 由 be-api / 编排者亲手复跑后填）。
- **C3 补了一份自检证据** `evidence/content-stamps-reachability.txt` —— 15 枚印章不只
  「在库里」，还逐枚验了判定源**可达**（0 枚恒 false），并做变异反证证明该自检会转红。
  状态词仍是「已验收」（非作者填的），本件只是**追加读数**，不改变状态。
- **C4 的现状读数**（2026-11-23 23:53，只读查共用开发库，**不是验收**）：
  `units` 6 · `lessons` 19 · `items` 296 · `distinct point_key` **76**（契约 §8 要求 60–80 ✓）；
  题目按 kind 拆 `recognize` 76 / `pinyin` 76 / `meaning` 76 / `listen` 40 / `stroke` 28；
  `hint` 非空 **296/296**。
  **难度轴已不空**（契约 §8 第 3 条原文是「现在三级全 `basic`，难度轴是空的」）：
  单元 `level` = `basic` 3 / `advanced` 2 / `extended` 1；单元 `type` = char 2 / word 2 / sentence 1 / dialogue 1。
  每单元 3–4 课时、12–16 个知识点。
  C4 的验收标准仍是那条**幂等断言**，已在全新一次性库上跑完（见上）。

## 验收记录 · C2 / C4（非作者）

出证人：**be-api / 编排者** —— 本路这四行代码不是这个角色写的。
时间：2026-11-24 02:42 起
落点：**全新一次性库** `%TEMP%\hd-acc-c2c4\_c2c4.db`
判据：不是读作者的自测记录，而是把两条的验收标准**自己跑一遍**。
本轮验收**全程没有打开共用开发库**。

### C2 —— `POST /attempts` 的反馈里真的有 hint

    $ cd server
    $ DB_FILENAME=.../hd-acc-c2c4/_c2c4.db npx tsx scripts/check-hint-feedback.ts
    探针题目：#1 [recognize] 知识点 ri 「日」→ rì
    注册 c2check365799：HTTP 200 code=0 已拿到 token      （走 register，绕开 login 限流）
    【答错】HTTP 200 code=0
      {"isCorrect":false,"answer":"rì","xpEarned":2,"hint":"太阳的样子，中间那一点是它的光。","wrongTimes":1,"badge":null}
    【答对】HTTP 200 code=0
      {"isCorrect":true,"answer":"rì","xpEarned":10,"hint":"太阳的样子，中间那一点是它的光。","wrongTimes":1,"badge":null}
    断言 6/6 ✓   C2 通过：0 条不成立        C2_EXIT=0

`hint` 与 `content.json` 那一句、与库里 `items.hint` 三者逐字相同；答错答对都带；
后端复判 `isCorrect=false`（没信前端）；XP 2 / 10 与 constants 一致。

「拒绝共用库」这条**单独验了一次**：把 `DB_FILENAME` 指到一个**一次性**的同名文件
`%TEMP%\hd-acc-c2c4\hanyu-dazi.db`，脚本按名拒绝并给退出码 **2**。
⇒ 那条守卫不是注释里的承诺，是可复现的行为；真库未被打开。

### C4 —— 从零建库，连跑四遍导入

    $ DB_FILENAME=.../_c2c4.db npx tsx src/migrate.ts       # exit=0，5 个迁移
    $ ... npx tsx scripts/import-content.ts                 # #1 新增 6 / 19 / 296 / 15
    $ ... npx tsx scripts/import-content.ts                 # #2 新增 0，更新 6/19/296；印章 未变 15
    $ ... npx tsx scripts/import-content.ts                 # #3 与 #2 逐字相同
    $ ... npx tsx scripts/content-audit.ts                  # exit=0，校验和 77b03ed4ae0e63a8，没有发现问题

内容层（不只行数层）：另写只读脚本取 `items` 全表
（`id+point_key+kind+options+answer+sort+hint`）的 md5 ——

    第 3 遍后：        题数 296   指纹 46aa0ee9baa74492ad01cfb626ae50c9
    第 4 遍导入后再取：题数 296   指纹 46aa0ee9baa74492ad01cfb626ae50c9

指纹与作者记录里的值**逐字相同**（独立复算出来的，不是抄的），再导入一遍仍不变 ⇒
选项、答案、题序都没有退化。

> **口径补记（2026-11-24 11:1x，编排者，事后补，不改上面两行数值）**
> 上面这行散文（「`id+point_key+kind+options+answer+sort+hint`」）**不足以复现任何一个数** ——
> 没写内分隔符、没写空值表示、没写行终结方式、没说 `options` 是原样字符串还是解析后的对象。
> `hanyu-dazi-57` 在同一份数据上枚举了 15 种合法读法、无一命中；编排者枚举 249 种，命中 1 种。
> **上面 296 那两行的实际口径是：**
>
> ```js
> const rows = db.prepare('select id, point_key, kind, options, answer, sort, hint from items order by id').all()
> md5(JSON.stringify(rows))            // better-sqlite3 行对象，键序 = select 列序；options 是**原文 JSON 字符串**
> ```
>
> 这一口径在 **4 只互不相干的 296 库**上同时命中同一个值（`fx` 07:28 · `fx3` 10:20 · `fx-be2` 10:25 ·
> 验收库 `hd-acc-c2c4/_c2c4.db` 02:42）⇒ **旧值可复现、且跨 8 小时稳定**，
> 296 基线的内容自 02:42 至 10:20 逐字节未变。
> ⚠️ 反过来说：上面那个数**不是** `PLAN/content.md` 里另一处用的那种口径
> （`c-recheck.cjs` 用 `\u0001` 内分隔 + `\u0002` 行终结）—— **两个口径的数不可互比**，
> 不要把 `46aa0ee9…` 与 `93fa59d1…` 摆成一条时间序列。

> **口径 B 完整定义（2026-11-24 12:2x，编排者补）**
> 上一段只写了「`c-recheck.cjs` 用 `\u0001` 内分隔 + `\u0002` 行终结」——
> **那是半份记录**：没写列序、没写行序、没写空值表示、没写终结符与内分隔符的施用次序，
> **照它复现不出任何一个数**。`hanyu-dazi-ba` 据此拒绝把实现交给 `hanyu-dazi-7d`，
> 理由是「照我的实现复算得同值，只能证明他读了同一份代码，证不出记录已足够复现」
> —— 这个理由**成立**。补法不是交实现，是**把定义写全**。以下逐行编码自
> `%TEMP%\hd-vfy\c-recheck.cjs:33-39`（该脚本原样未动）：
>
> ```js
> const rows = db.prepare(
>   'select id, point_key, kind, options, answer, sort, hint from items order by id').all()
> const h = crypto.createHash('md5')
> for (const r of rows) {
>   h.update([r.id, r.point_key, r.kind, r.options, r.answer, r.sort, r.hint]
>              .map(v => String(v)).join('\u0001'))
>   h.update('\u0002')          // 每行写完后再补一个行终结符，然后写下一行
> }
> h.digest('hex')               // 小写十六进制
> ```
>
> 四件曾经缺、现在补齐的事：**列序** = `id, point_key, kind, options, answer, sort, hint`；
> **行序** = `order by id` 升序；**空值/类型** = 每个值先 `String(v)` 再拼
> （`options` / `hint` 是**原文 JSON 字符串，不解析**），`sort` 按 JS 十进制字符串；
> **施用次序** = 七值以 `\u0001` 连接 → 追加 `\u0002` → 下一行。
>
> 两处必须知道的坑：① `String(null)` === `'null'` ⇒ SQL NULL 与字符串 `'null'`
> **在本口径下不可区分**；② `1` 与 `1.0` 也不同（JS 数值转字符串）。
>
> 本口径的两个值：296 → `132052f7a31d0535dee6e56e3c21856e`、308 →
> `93fa59d1f5b78656842174513fc8c52f`。**写完上面这段之后，口径 B 已不再是单源** ——
> 编排者**照本段记录另写了一份实现**（`%TEMP%\hd-vfy\bd-md5b-fromrecord.cjs`，
> 写它时**没有打开** `c-recheck.cjs`，只读了本页这一段），在两支夹具库上各复算一次：
>
>     308  fx-tone/fixture.db（10:37）  93fa59d1f5b78656842174513fc8c52f   ← 与记录逐字相同
>     296  fx3/fixture.db    （10:20）  132052f7a31d0535dee6e56e3c21856e   ← 与记录逐字相同
>
> ⇒ **「记录已足够复现」这句话现在有实证**，口径 B 的两个值各有两个来源
> （`ba` 首取 · 编排者照记录重实现）。⚠️ 这**不等于**说 `ba` 当初该交实现 ——
> 他那条拒绝是对的，正确做法是补记录，本次就是这样办的。
> 两支库全程 `readonly:true`、零写入；未碰共用库 `server/data/*.db`。
>
> 顺带一个不是理论问题的坑：两支库各有 **28 行**存在 NULL 列（正是 `stroke` 那 28 题的
> **`options`** 一列）⇒ 「NULL 与字符串 `'null'` 不可区分」在本语料里是**真实生效**的，
> 换实现时按 `null → ''` 或 `null → 'NULL'` 都会得到不同的值。
>
> ⚠️ **修正（14:2x，由 `ba` 指出、编排者上盘复算确认）**：本句原写作
> 「`options` / `answer`」两列，**写宽了半格**。四支库实测（`fx3` 296 · `fx-tone` 308 ·
> `fx` 296 · 共用开发库 `server/data/hanyu-dazi.db` 296，全程 `readonly:true`）：
> `nullOptions = 28`、`nullAnswer = 0`、`strokeNullAnswer = 0`、`nullHint = 0`
> ⇒ **NULL 只在 `options` 一列，`answer` 从来不是 NULL**。金值不受影响（上面的代码块是精确的），
> 但宽半格的散文会被后来者读成「两列都可能是 NULL」而多写一个分支 —— 本段存在的意义
> 就是给后来者照抄，故修。
>
> ⚠️ **再修正（14:1x）**：本段上方说「口径 B 已不再是单源（`ba` 首取 · 编排者照记录重实现）」
> —— 那是**两源**；`ba` 随后**自己照本段记录写了第三份实现**
> （`%TEMP%\hd-vfy\ba-md5b-fromrecord.cjs`，写它时未打开 `c-recheck.cjs`、也未打开
> 他自己的 `my-c14.cjs`），两值逐字命中：308 → `93fa59d1f5b78656842174513fc8c52f`、
> 296 → `132052f7a31d0535dee6e56e3c21856e`。⇒ 现在是**三源，且三源全部「照记录」**，
> 「记录已足够复现」由**非记录作者**独立证实。`c-recheck.cjs` 仍 **2431 B / 10:51:52 未动**。
>
> 且**与口径 A 不可互比**。
>
> 另记：**296 值的独立性反而更强了**。`ba` 的 8 行表（`fx2\hint` 07:29）与本节的两张表
> 并集 = **五只互不相干的 296 库**（共同 `fx` / `fx3` / `fx-be2`，各有一只独有），
> 全部命中 `46aa0ee9…`。口径 A 现已有**两个独立来源**（`ba` 首取 · `7d` 照本节定义复算），
> 值为「按记录复算」而非转述。

### 两点如实记录

- 这两条我**是**非作者（本路代码不由 be-api 写），但验收动作发生在**同一次编排**里。
  与 B1–B6 的性质不同：那六条的被测代码就是本角色写的，按 §十二·七**不能**由本角色
  填「已验收」；C2/C4 可以，因为被测代码不是本角色的。
- 临时库里这次验收留下了一个探针用户（`c2check365799`）与两条答题记录 ——
  都在 `%TEMP%` 下、进程退出即弃的库里。共用开发库本轮**未被打开**。

## 待裁决 · 我已上报的事（CR-01）

- **`CR-01`（契约 §4.7）**：`POST /checkin` 打卡之后也要结算一次印章。
  缺陷是 `streak` 章的**结算时机**——它是四类判定源里唯一会倒退的（断签即归 1），
  而打卡写路径不结算，于是「连续 N 天只打卡」的用户可能**永久拿不到**那枚章，
  接口 200、日志干净、页面只是灰着。已在隔离库复现（A/B 单变量对照 + C 永久不可达）。
  - 复现与验收脚本：`server/scripts/check-streak-timing.ts`（修好后 A 自动转绿、退出码 1→0）
  - 证据：`evidence/content-streak-timing.txt`
  - **归属**：`routes/checkin.ts` → fe-game 写集，`services/checkin.ts` → be-api 写集。
    content 按 §5 不动别人的文件，**落点由编排者定**。修好前这一条挂着。
- 另：`unit` / `stroke` / `xp` 三类章**不受迟结算影响**（判定源只增或已完成不回退），
  已逐类核过，见证据文件里的对照表 —— 所以本条**只涉及 streak**，不必扩大改动面。

## 308 基线重取读数（2026-11-24 11:0x，非作者 `hanyu-dazi-57` 亲手跑）

> ⚠️ **本节是「追加读数」，不是验收** —— 状态列一字未动（沿用 C3 那次追加证据的先例）。
> 落笔人：编排者（`hanyu-dazi-bd`）。**编排者不是本泳道的非作者**（10:37:07 改过
> `content.json`），所以本节只转录 57 的读数，**不代替任何人写状态词**。

**触发原因**：`content.json` 在 10:37:07 被编排者改动（新增课时「四声辨调」12 题），
296 基线整体过期。C1/C3 的原出证人是编排者 → 现在是内容共同作者，**该署名不再覆盖当前状态**；
C2/C4 的原出证人是 be-api → 仍是够格的非作者，但证据落在 296 上。

**57 自己建的一次性库**（`%TEMP%\hd-fe-lane\c14`、`c14b`），**没有打开共用开发库**；
`migrate` exit=0（5 个迁移，含编排者上轮缺的 `_items_hint` 与 `_reports`）。

| 格 | 308 上的读数 | 与 296 的差异 | 57 结论 |
|---|---|---|---|
| C1 | `kind='listen'` = **40**；40/40 带 `audio_url`；`content/audio/*.mp3` = 40 个 | 无变化 | ✓ |
| C2 | `check-hint-feedback.ts` exit=0（6/6 断言）；`items.hint` 非空 **308/308**；接口回的 hint 与 `content.json` 逐字相同 | 分母 296→308 | ✓ |
| C3 | `achievements` = **15**（unit 6 / stroke 3 / streak 3 / xp 3） | 无变化 | ✓ |
| C4 | 导入 #1 新增 6/20/308/15；**#2 与 #3 单元/课时/题目新增全 0、更新 6/20/308、印章仍 15**；`content-audit.ts` exit=0、校验和 `57b07b05756720b3`、「没有发现问题」 | 行数随语料变 | ✓（幂等成立） |

**C4 指纹（两个口径都给，别混用）**

| 口径 | 296 基线 | 308 基线 |
|---|---|---|
| `md5(JSON.stringify(rows))` —— content.md:84 那两行的**原口径** | `46aa0ee9baa74492ad01cfb626ae50c9` | **`bb1cb1d59274972cd0b264f53ae2f4f1`** |
| `\u0001` 内分隔 + `\u0002` 行终结（`c-recheck.cjs` 口径） | `132052f7a31d0535dee6e56e3c21856e` | **`93fa59d1f5b78656842174513fc8c52f`** |

- 每格四个数都在**两只以上互不相干的库**上复算过：296 那列在 4 只库上命中
  （`fx` / `fx3` / `fx-be2` / `_c2c4.db`），308 那列在 `fx-tone` 与 `fx-render` 上命中。
- ⚠️ **左右两列不可互比**：上排是内容层 md5，下排是另一种拼接口径，差的是算法不是数据。
- 57 在 308 上独立复算 `93fa59d1…` 时**读的是量具源码、用自己的代码按同口径重算**（不是采信编排者的数），
  在 4 只库上同得该值。

**还没做的（不许读成已做）**

1. **C1/C3 的 308 重签没有落字** —— 需要一位**此刻**对 `server/content/**` 零字节的人
   （be-api 够格；编排者已不够格）。状态列因此仍写着「已验收」，那是对 **296 时点**的结论。
2. 幂等只压到**行数层 + 窄口径内容层**，**没有**逐字段 diff `options`/`answer`。
3. 57 指出：`content.json` 变更同时让 `be.cjs:81` 的 `items = 296` 失效 ⇒
   **C 的重签与 be-api 台账的基线重取是同一批动作**，宜同批办，不宜单格抢跑。
4. 57 **明确不落这四格的状态词**，理由已记（改动他人署名结论不属其权限；且已上报其用户待裁决）。
   它取的是退路：读数发回 + 另存 `%TEMP%\hd-fe-lane\content-C1C4-recheck-20261124.txt`。

---

## 308 基线重签（2026-11-24 11:52–11:58，**非作者 `fe-game`** 亲手跑）

> **本节是「落字」**：把上节第 1 条那个缺口了结。落笔人是**非作者**，且是**亲手跑过断言**的一方 ——
> 符合 `plan.html:927`「『已验收』只能由非作者写，且必须是亲手跑过断言的一方」。
> **不改动**上面 `:8-13` 状态表里任何既有字句，也不改上节任何读数；本节是**追加**。
> 详证与脚本全文：`PLAN/evidence/fe-game-c1c4-nonauthor.txt`（含 `my-c14.cjs`、`c1-audio-http.cjs` 全源）。

**资格**：本路写集 = `mobile/src/pages/{profile,rank,stamp,duel,team,user}/**`、
`mobile/src/api/{xp,checkin,stamp,duel,team,user}.ts`、`server/src/routes/{xp,checkin,duel,team}.ts`
⇒ 对 `server/content/**`、`server/src/seeds/**`、`server/scripts/import-content.ts`、
`server/src/migrations/**` **零字节**。语料钉与 57 同一份：`content.json` md5
`39b48b8cb34dbadcd944a5fa391e5b29`（mtime 10:37:07）。夹具是本路自建的**一次性库**
`server/data/_verify308.db`，**共用开发库 `hanyu-dazi.db` 全程未打开**。

| 格 | 308 基线读数（本路亲跑） | 本路状态词 |
|---|---|---|
| C1 | `kind='listen'` **40** ／带 `audio_url` **40/40** ／磁盘 mp3 **40**；**HTTP 逐文件 40/40 字节+md5 与磁盘全等**（真 app 起在 58391），Content-Type 全集合 `["audio/mpeg"]`，404 兜底成立，`C1_HTTP_EXIT=0` | **已验收**（308 时点） |
| C2 | 答错/答对均 HTTP 200 code=0 且**都带 hint**；两次 hint 与 `items.hint` 及 `content.json` 那一句**逐字相同**；答错 XP=2 / 答对 XP=10（异值）；6/6 断言 ✓，`C2 通过：0 条不成立`；`items.hint` 非空 **308/308** | **已验收**（308 时点） |
| C3 | `achievements` **15**（unit 6 / stroke 3 / streak 3 / xp 3），**恒 false 的 0 枚**；6 个单元名齐全 | **已验收**（308 时点） |
| C4 | `migrate` exit=0（5 迁移，含 `_items_hint` 与 `_reports`）；导入 **#1** 新增 6/20/308/15，**#2/#3/#4 逐字相同**（新增 0、更新 6/20/308、印章仍 15）；`content-audit.ts` exit=0、校验和 `57b07b05756720b3`、「没有发现问题」；`units` 6 · `lessons` 20 · `items` 308 · `distinct point_key` **80** | **已验收**（308 时点） |

**四格全部成立** ⇒ 编排者先前的承诺（「任何一格不过就把那一格退回」）**未触发**。

**指纹：两个口径各自 4 只互不相干的库同值（本路实跑，非采信）**

| 口径 | 296 基线 | 308 基线 |
|---|---|---|
| A = `md5(JSON.stringify(rows))`（`:87-103` 钉死） | `46aa0ee9…` ← 命中 `fx`／`fx2/hint.db`／`fx3`／`fx-be2` **四只** | `bb1cb1d5…` ← 命中 `fx-tone`／`fx-c4/recheck.db`／`fx-render`／`_verify308.db` **四只** |
| B = `\u0001`/`\u0002`（`c-recheck.cjs`） | `132052f7…` ← 同上四只 | `93fa59d1…` ← 同上四只 |

⇒ 两列**各自确定、各自可复现**；两列之差只来自**拼接算法**，**不可互比**（与 `:155` 一致）。

**⚠️ 一处需要更正的既有记录（本路独立复跑后提出）**
57 的重取件写着「旧值 `46aa0ee9…` 从当前工作树**无法复现**…那行不能作为比对基线」。
**「无法复现」按字面不成立**：本路用 `:87-103` 钉死的**口径 A** 在 **4 只** 296 库上逐字复现了它。
原因可查：57 枚举的 15 种读法是她围绕**口径 B 的构造**做的变体，读的是 `:78-79` 那段散文，
没读到 `:87-103` 的《口径补记》—— 而那一节正是为此写的，`:98-99` 已记「旧值可复现、跨 8 小时稳定」。
57 的**另一半是对的**：「那行不能作为基线、必须连同约定一起重写」——这正是 `:87-103` 办的事。

**本节的边界（不许读成已做）**
- 上节第 2 条仍成立：幂等**没有**逐字段 diff `options`/`answer`（md5 相同强蕴含，但未摊开比对）。
- 上节第 3 条仍成立：`be.cjs:81` 的 `items = 296` 重取**本路未做**（不属本泳道）。
- **CR-01（`:113-124`）不受本节影响**：`streak` 章结算时机的修法落在 `server/src/routes/checkin.ts`，
  那是**本路写集内的文件** ⇒ 该条修法**本路不得自验收**，仍须另找非作者。
- 本节只覆盖 C1–C4，**不**触及 fe-learn 泳道任何一格。
