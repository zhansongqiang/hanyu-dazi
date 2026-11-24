# 泳道 fe-game

> 本文件**只由 fe-game 自己写**。状态词汇、七列定义、谁能写哪个状态 —— 见 `plan.html` §十二·七。
> 「已验收」**只能由非作者写**。证据落在 `PLAN/evidence/`。

最后更新：2026-11-24（产物级验证追加于当日上午；非作者验收的引用复核追加于 11:3x）

| 单元 | 里程碑 | 计划 Day | 状态 | 验收标准 | 证据 |
|---|---|---|---|---|---|
| G1 「我的」页单一 summary | M3 | 3 | 已验收 | 所有数字来自**一个** `GET /profile/summary`，不是 N 个请求凑 | `evidence/fe-game-g1-g4.txt`（接口）+ `evidence/fe-game-render.txt`（渲染）+ `evidence/fe-game-artifact.txt`（**产物**）+ **`evidence/be-api-accept-LG.txt`**（非作者 be-api 亲跑 `g1` 段，CRIT 10/10） |
| G2 排行榜 | M3 | 3 | 已验收 | `rank` 页显示榜单；自己上榜后能看到自己的名字 | `evidence/fe-game-g1-g4.txt`（接口）+ `evidence/fe-game-render.txt`（渲染）+ **`evidence/be-api-accept-LG.txt`**（非作者 be-api 亲跑 `g2` 段，CRIT 12/12） |
| G3 印章页（含灰态） | M3 | 3 | 已验收 | **未得的章也显示**（灰态），不是只显示已得的 | `evidence/fe-game-g1-g4.txt`（接口）+ `evidence/fe-game-render.txt`（渲染）+ `evidence/fe-game-artifact.txt`（**产物**）+ **`evidence/be-api-accept-LG.txt`**（非作者 be-api 亲跑 `g3` 段，CRIT 7/7） |
| G4 打卡与连击 | M3 | 3 | 已验收 | 打卡后连击 +1；重复打卡幂等（一天一条） | `evidence/fe-game-g1-g4.txt`（接口）+ **`evidence/be-api-accept-LG.txt`**（非作者 be-api 亲跑 `g4` 段，CRIT 13/13、FAIL=0） |
| G5 PK 对战 + 分享链接 | M4 | 4 | 已验收 | 分享链接 `/pages/duel/duel?code=xxx` **未登录能打开**（游客流程） | `evidence/fe-game-g5-g6.txt`（接口）+ `evidence/fe-game-render.txt`（渲染）+ `evidence/fe-game-edge.txt`（过期语义，**作者自测、本轮未被第三方重跑**）+ `evidence/fe-game-artifact.txt`（**产物**）+ **`evidence/be-api-accept-LG.txt`**（非作者 be-api 亲跑 `g5` 段，CRIT 12/12、FAIL=0：未登录直接开 `#/pages/duel/duel?code=…`、GET/POST 均未带 Authorization、游客填名即答、25 题、结果页两侧） |
| G6 组队 | M4 | 4 | 已验收 | 建队 / 入队能走通 | `evidence/fe-game-g5-g6.txt`（接口）+ `evidence/fe-game-render.txt`（渲染）+ `evidence/fe-game-edge.txt`（8 人上限，**作者自测、本轮未被第三方重跑**）+ **`evidence/be-api-accept-LG.txt`**（非作者 be-api 亲跑 `g6` 段，CRIT 16/16、FAIL=0：建组→邀请码 6 位一致、小写邀请码也能入、人数 1/8→2/8、成员表队长与「我」标记） |

四个证据文件都是**作者自测**（fe-game 本人跑的），按 §十二·七 这只算「待验收」的凭据，
**不是「已验收」**。请复核的人自己看逐字输出再写状态。

> **补记（be-api，非作者，2026-11-24 11:2x）**：这段说的「作者自测不构成已验收」仍然成立，
> 它管的是**上面那四个证据文件本身**。表里 G1–G6 的「已验收」不是由它们支撑的，而是由**另一跑**支撑的：
> 非作者 be-api 用 bd 的 `web.cjs` 亲手跑了 `g1..g6` 六段（CRIT 10/12/7/13/12/16，**FAIL=0**），
> 逐字读数见 `PLAN/evidence/be-api-accept-LG.txt` §三。资格依据同上文 §一：本轮 be-api 在
> `mobile/src` 下**零字节写入**。⚠️ 仍有一条没被第三方重跑的：`fe-game-edge.txt` 里的
> **G6 8 人上限**与 **G5 过期语义**，那两条本轮**仍是作者自测**，读的人当心。

> **本路（fe-game，作者）对上述六格「已验收」的采信说明，2026-11-24 11:3x**：
> 上表 **G1–G6 六格的「已验收」二字由非作者 be-api 落字于 11:26:01**，不是本路写的 ——
> 本路 §5 写集覆盖 profile/rank/stamp/duel/team 五页与其 api/routes，**本路就是 G1–G6 的作者**，
> 按 §十二·七「已验收只能由非作者写」，本路无权、也没有写这六格的状态词。
> 本路所做的只是**回到 `PLAN/evidence/be-api-accept-LG.txt` 原文核对引用是否逐字**，结论：
> 六段计数（CRIT 10/12/7/13/12/16）与 `beapi-g1..g6.out.txt` 小结行逐字相同、`FAIL` 计数全为 0；
> 并且**不只看计数**，§8 归 fe-game 的三条判据在产物里都有 CRIT 级断言支撑：
> ① 单一 summary → `G1.c`「该页实际 /api 请求：`["GET /api/profile/summary"]`」；
> ② 未登录分享链接 → `G5.a.entry`（未登录直接开 `#/pages/duel/duel?code=…`）+ `G5.d.noauth`/`G5.l.noauth`（GET/POST 均 auth=false）+ `G5.e.namerow`；
> ③ 灰态印章 → `G3.b`（灰态 3 = 未得 3）+ `G3.f.gray`（opacity 0.5 / border dashed / 可见）+ `G3.g.hit`（可命中）。
> ⚠️ 附一条本路自己查出的量具瑕疵，供读的人判断：`be-api-accept-LG.txt` 那次跑用的是
> **旧量具** `web.cjs` md5 `081e1700…`（73536 B，10:54:58），其中 **g4 的 13/13 含 2 条库级虚条**
> （`G4.n.db` / `G4.o.db` 读的是 `fx3` 而非被测库 `fx-render`，对「一天一条」零鉴别力）。
> bd 随后已把量具换成 v2（md5 `5b21c662…`，75197 B）并做了变异复测，g4 仍 13/13 且路径守卫已生效 ⇒
> **G4 的结论成立**；只是**被引用的那一份**读数来自旧量具。详见 `PLAN/evidence/fe-game-nonauthor-review.txt` §3。

第三个 `evidence/fe-game-render.txt`（2026-11-23 当晚）补的是**渲染取证**：§8 里有两条验收标准
（G1「不是 N 个请求凑」、G3「未得的章也要显示灰态」）**本身就是渲染问题**，接口侧证明了也不算数 ——
那份文件用浏览器硬断言把它们补齐（**40 条断言 0 失败**），并顺带证了 G2 的「我那行被高亮」、
G5 的「干净游客上下文打开分享链接」、G6 的「双视角归属」与 CR-5 的 `slogan` 真的上屏。
配套截图归档在 `evidence/fe-game-render-shots/`。它是**作者自测**，同样不是「已验收」。

第四个 `evidence/fe-game-edge.txt`（2026-11-24）补的是本路**自己列在「仍未验」里的两条能验的边界**：
G6 的 **8 人上限**（队长 + 7 人 = 8，第 7 个加入者成功、第 8 个被拒且拒绝是原子的）
与 G5 的**过期语义**（`expires_at` 改到过去后，库里 `status` 列仍是 `open`，
但读出来是 `expired`、`items:null`、提交被拒且不写库 —— 证明 `expired` 是**读时算的**，不是定时任务）。
它用 `VACUUM INTO` 在线快照出一个临时库、起隔离实例 8099 跑的，**没碰共享库与别人的文件**。

第五个 `evidence/fe-game-artifact.txt`（2026-11-24 上午）补的是**最后一条**：**产物级验证**。
编排者给了「等构建排队，再跑产物级验证」，于是 `npm run build:h5` 真跑了一次
（`index.html` md5 `9aed44f8062359e911b6e11aca988dcc`、38 个 assets、本路 6 个页面 chunk 各恰好 1 个），
再用 `vite preview`（4173）指向**隔离后端 8099 + 临时库副本**，在**打包产物**上把 §8 的三条
逐条硬断言：**42 条断言 0 失败**。其中 G1 那条用了一组**每个数字都不相等**的夹具
（1230 / 330 / 3 / 57%），专门防"累计 XP 与本周 XP 两格互换"这种错法；
G3 验了 0 已得 → 15 枚全灰、1 已得 → 14 灰 + 1 亮，总数恒为 15。
该文件还记了两个**给后来人的坑**：产物里 `window.uni` 是**空壳**（0 键，`setStorageSync` 不存在，
注入登录态只能按 uni 的 `{type,data}` 包装直接写 `localStorage`）；uni 的 `<input>` 带
`placeholder-class` 时占位文字是**兄弟节点** `div.uni-input-placeholder`，不在 `<input>` 属性上。
**它补的是 H5 产物 —— APK 仍然没打，真机/WebView 仍然没验。**

`evidence/fe-game-g1-g4.txt` 里分两轮：第一轮盖 G1/G3/G4(首日) 与 G2/G4 的接口形态；
**第二轮补测**（同日 22:52）补上了第一轮漏掉的 G4「跨天连击 +1 / 断签归 1」与 G2「榜外 `me:null`」——
那两条是**验收标准本身**的语义，不是锦上添花。第二轮里连击历史是**直接写 `user_streaks` 构造**的
（不必真等一天），证据文件里把注入的假历史原样印出来了，复核时请照此理解它的证明力边界。

## 本路做过的代码改动（供复核定位）

- `server/src/routes/duel.ts`：
  - `GET /duels/:code` 的 `items` 改为走 be-api 的 `services/item.ts` 的 `toItemDto()`
    （原来是本文件里手搓的 **9 字段**映射，漏 `lessonId` / `pointKey`，与 §4.1 的 11 字段不一致；
    手搓版 `JSON.parse` 遇坏 JSON 会整个 500）。只 import 共享服务，没有改别人的文件。
  - `POST /duels/:code/submit` 加「对手位 first-write-wins」（同名放行）。契约没写这条，见下方 CR-2。
- `server/src/routes/team.ts`：`minePayload()` 多返 `slogan`。见下方 CR-5。
- 其余 `routes/{xp,checkin}.ts` 与 `mobile/src/pages/{profile,rank,stamp,duel,team,user}/**`、
  `mobile/src/api/{xp,checkin,stamp,duel,team,user}.ts` 为原实现，本轮只做静态比对与运行时取证。

类型检查终态（2026-11-24 复核复现，逐字同上）：
`server` 的 `npx tsc --noEmit` **EXIT=0**；
`mobile` 的 `npx vue-tsc --noEmit` **EXIT=2，只剩 `utils/request.ts` 的两条**（不是本路的文件，见 CR-6）——
即**本路的文件一条错误都没有**。

---

## CHANGE-REQUEST

按 §7 的格式，本路**没有自己改契约、也没有改别人的文件**，只在这里记录。

### CR-1 · §4.4 · `winner` 可以是 `null`

- **section**：§4.4 `POST /duels/:code/submit` 响应
- **what**：契约写 `winner: "challenger" | "opponent" | "tie"`（三值），实际在**一方还没答**时返回 `winner: null`。
- **why**：一方提交、另一方还没提交时，这局还没法判胜负。契约只列三值的话，
  前端类型就得写成谎话（`DuelSubmitResult["winner"]` 非空），页面也表达不了「等对手」这个真实状态。
  实测：`mobile/src/api/duel.ts` 已按 `… | null` 写，`duel.vue` 显示「等对手」。
- **proposed**：把该字段写成 `winner: "challenger" | "opponent" | "tie" | null`，
  并补一句「一方未提交时为 `null`」。

### CR-2 · §4.4 · 对手位 first-write-wins（契约未写）

- **section**：§4.4 `POST /duels/:code/submit`
- **what**：契约没规定「同一挑战、对手位被写过之后还能不能再被覆盖」。实现取
  **first-write-wins**：已有人答过则换一个人提交 → `code:1「这一场已经有人答过了」`；
  带**同名**的提交放行（认作本人重试/换网补交）。
- **why**：原实现是「后到的覆盖先到的」。分享链接是要发到班级群的（这是 §8 的验收项之一），
  谁最后点谁就是"对手"，先答的人的分数和胜负随时作废 —— 这是可被随手破坏的胜负记录。
  实测：Guest01 交 7 分/42000ms 后，Guest02 再交 10 分/1ms 原本同样 `code:0` 并改写对手位。
- **proposed**：把这条规则写进 §4.4。同时写明**它的弱点**：游客没有身份，昵称是唯一把手，
  所以「冒用同名」仍能覆盖同名条目 —— 比"谁都能覆盖"弱得多，但不是强校验；
  要强校验得给游客发设备指纹/签名，属契约级改动，本路不擅自做。

### CR-3 · §4.6 · `GET /rank/rank-of/:userId` 的 payload 契约未规定

- **section**：§4.6
- **what**：契约只写了有这条路由，没写返回什么。实际返回
  `{ userId, nickname, rank, weekXp, rankName, rankLevel }`（六个字段）。
- **why**：前端要按这六个字段取值；契约不写下来，下一个人改了名字（比如把 `rank` 改成 `rankNo`）
  会静默打断前端，而类型检查抓不到跨语言的字段名。
- **proposed**：把上面六个字段补进 §4.6。

### CR-4 · §4.7 · `POST /stamps/check` 另返 `total` / `earned`

- **section**：§4.7
- **what**：契约说「返回本次新解锁的印章」，实际返回 `{ unlocked: [], total: 15, earned: 0 }`。
- **why**：`stamps` 页每次进页面都要显示「15 个里得了几个」，如果 `check` 只回新解锁的，
  页面就得为这两个数**再发一个 `GET /stamps`**（多一个请求）。一起回就省掉。
- **proposed**：把 `POST /stamps/check` 的响应写成
  `{ unlocked: Stamp[], total: number, earned: number }`，并注明「`unlocked` 只是本次新增」。

### CR-5 · §4.8 · `GET /teams/mine` 返 `slogan`

- **section**：§4.8
- **what**：§4.8 的示例 payload 没列 `slogan`，实际返回里有
  （`{ id, name, slogan, inviteCode, captainId, memberCount, members }`）。
- **why**：§3 的 `teams` 表**确实有** `slogan` 这一列。不回传的话，用户建组时填的口号
  在库里就是**只写不读**的死字段 —— 此后任何一个页面都看不到它。
- **proposed**：把 `slogan` 补进 §4.8 的示例与字段表。**要回退只需删 `team.ts` 里那一行**
  （`minePayload()` 的 `slogan`），前端 `team.vue` 是 `v-if="mine.slogan"` 写的，删了不会崩、只是那一行不出现。

### CR-6 · 跨路阻断 · `mobile/src/utils/request.ts` 的 `BASE_URL` 重名（TS2451）

- **section**：**§8 的 `fe-learn` 条目**「`npx tsc` 或 `npx vite build` 无**新增**错误」
  —— ⚠️ 更正：这条**不是 fe-game 的验收项**。§8 里 fe-game 名下只有三条
  （单一 summary / 分享链接游客可开 / 印章灰态），没有 tsc。
  同理 be-api 那条「`npx tsc` 0 错误」指的是 **server**，2026-11-24 实测 `server && npx tsc --noEmit` = **EXIT 0**。
  本条只影响 `mobile` 侧的 `vue-tsc`，归属 **fe-learn**。
- **what**：`mobile/src/utils/request.ts(10,7)` 与 `(13,7)` 报 `TS2451: Cannot redeclare block-scoped variable 'BASE_URL'`。
  根因是 `// #ifdef H5` / `// #ifndef H5` 那段条件编译：**条件编译注释是构建期才剥的**，
  源码层面两行同名 `const` 就是重名声明。2026-11-24 复核**仍在**（逐字复现，未修）。
- **why**：这不是本路的文件（`utils/request.ts` 归 **fe-learn**），本路按 §7 **没有动它**。
  但它会让 `vue-tsc --noEmit` 整体非 0（EXIT=2）—— 复核的人如果只看退出码，
  会以为**四路都没过**；而实测我的文件**一条错误都没有**。
- **proposed**（给 fe-learn / 编排者）：改成「一个函数 + 两个 `return`」的写法，
  或把两个分支的常量改不同名（如 `BASE_URL_H5` / `BASE_URL_OTHER`）。改完 `vue-tsc` 立刻归零。

### CR-7 · 次要 · `CourseItem.pointKey` 非空 vs 后端可能为 `null`

- **section**：§4.1 / 前端 `mobile/src/api/course.ts`
- **what**：前端 `CourseItem.pointKey: string`（必填非空），后端 `ItemDto.pointKey: string | null`。
- **why**：这是一个"类型说得比现实硬"的偏差：`pointKey` 是拼音题/汉字题的挂点，
  非拼音类题目后端是允许 `null` 的。前端按非空写 → 类型检查抓不到、运行时可能拿到 `undefined`。
  本轮没改这个文件（归 **fe-learn**）。
- **proposed**：两边对齐。要么契约里写明「`pointKey` 可以为 `null`」并把前端类型改成 `string | null`，
  要么后端保证任何 kind 都有值。**建议前者**，因为它跟 §4.1 现有示例的语义一致。

### CR-8 · §4.8 · 「建组（2–8 人）」的**下限**与实现不符，且 `POST /teams/join` 的响应未规定

- **section**：§4.8
- **what**：两处。
  (1) §4.8 的表格把 `POST /teams` 写成「建组（**2–8 人**）」，但实现只强制了**上限 8**，
  **下限没有**（也不可能强制：建组那一刻组里只有队长本人）。
  实测：建组返回 `memberCount=1`，此后无人加入就长期停在 1（2026-11-23 与 2026-11-24 两轮都如此）。
  (2) 契约**没规定 `POST /teams` 与 `POST /teams/join` 返回什么**，两者实现返回的都是与
  `GET /teams/mine` **同一份 payload**（`{ id, name, slogan, inviteCode, captainId, memberCount, members }`）。
- **why**：(1) 复核的人若按「2–8」去判，会把 1 人组当成 bug 去提 —— 其实这是正常状态
  （建组 → 显示邀请码 → 等人进来）。(2) 前端 `team.vue` 建组/入队**成功后是拿这份响应直接刷状态的**，
  不额外发 `GET /teams/mine`：`doCreate` → `mine.value = await teamApi.create(...)`（第 73 行）、
  `doJoin` → `mine.value = await teamApi.join(...)`（第 94 行），只有走 `catch` 时才回拉 `load()`（73–79 / 93–99 行）；
  `api/team.ts` 也把两个写接口的返回都标成 `request<TeamMine>`（47–48 / 51–52 行）。
  契约不写明，下一个人改了任一个写接口的返回体就会**静默**打断前端。
- **proposed**：把「2–8 人」改成「**1–8 人**（建组时只有队长；2 人是常见规模，不是下限）」，
  并补一句「`POST /teams` 与 `POST /teams/join` 成功后均返回与 `GET /teams/mine` 同形的 payload」。

## 备注

- `server/src/routes/{xp,checkin,duel,team}.ts` 是本路的独占文件 —— 它们是波次 0 的**空壳**，**就地替换内容**即可，不要新建同名文件。
- `mobile/vite.config.ts` 的 `proxy` 归 **fe-learn** 改，本路不要动。
- **共享 dev 库里的 `user_id=4`（`pfd5c0q` / 昵称「取证账号」）不是本路的**：
  它是 fe-learn 的取证账号（见 `PLAN/evidence/fe-learn-l1-l5.txt:148`），
  本路取证全程**没有动它**（连带它名下的 attempts / xp_events / checkins / user_streaks 都留着）。
  本路**全部五轮**取证（含产物级那轮）都是起**隔离实例 8099 + 临时库副本**跑的，
  共享的 8091 dev server（PID 32800）全程没动，一个请求都没往里发；
  每次取证完都用 knex 清掉了本路自己造的账号与 `duels` / `teams` / `team_members` 行，
  产物级那轮的夹具只写进 `data/tmp-art.db`（`VACUUM INTO` 快照），复核共享库末态：
  `users=[xiaoming(1), pfd5c0q(4)]`、`duels=0 teams=0 team_members=0`、本路账号残留 `[]`。
- 按编排者要求，2026-11-23 当晚**没有跑 `uni build`**（内存吃紧，构建串行排队）；
  编排者随后给了「等构建排队，再跑产物级验证」，**2026-11-24 上午已跑**并补齐
  （见 `evidence/fe-game-artifact.txt`，42 条断言 0 失败）。
  覆盖面要说准：那轮验的是 **§8 里 fe-game 名下全部三条验收**（G1 / G3 / G5）在打包产物上的表现，
  不是「六单元每一条都在产物上跑了」——G2 / G4 / G6 的产物级证据仍是空白（它们的验收点已被
  接口 + 渲染两份证据覆盖，但没在产物上重跑）。且只走了 **h5** 目标：**APK 没打**。
- `evidence/fe-game-render.txt` 的结论全部来自 **dev server（5173）+ 桌面 chromium 1208**；
  `evidence/fe-game-artifact.txt` 换成了**打包产物 + 同一个桌面 chromium 1208** ——
  两者都**不是真机、不是 WebView**。四份证据末尾列的仍未验里，**8 人满员上限、对战过期、
  H5 产物级验证**已逐条补齐，**只剩「真机 / WebView」与「APK」两项没做**
  （前者属移动端专项、见 CLAUDE.md 的 iOS 清单；后者要打 APK 包）。复核时请照此理解覆盖范围。
