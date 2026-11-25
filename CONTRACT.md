# 接口契约（波次 0 冻结）

> **这份文件是四路并行开发的唯一真相源。**
> 写任何前端页面或后端路由之前，先在这里找到对应的行。
> 契约没写的字段，就是「不该有」；契约写了但实现不了，先报给我，不要自己改契约。
>
> 冻结日期：2026-11-23（Day 1 夜）　冻结者：编排者　复核：波次 2 审核时逐行比对

---

## 0. 为什么要冻结

四个 agent 同时改一个仓库，**改同一个文件是静默的后写覆盖先写，没有任何报错**。
契约把「两边各自猜的名字」变成「一份写死的名字」，这样：

- 后端按契约返回 `maxScore`，前端按契约读 `maxScore` —— 不会一边写 `max`、一边读 `maxScore` 而两边都不报错；
- 契约里的路由前缀是排他的：看一眼就知道某个文件归谁改，越界即冲突；
- 波次 2 的审核就是**逐行比对实现与契约**，不需要重新推理。

---

## 1. 响应格式（已存在，不要改）

`server/src/utils/response.ts` 已定，四个 agent 一律使用，**不要自己写 `res.json`**：

```ts
success(res, data?, message = 'ok')   // → { code: 0, message, data }
fail(res, message, httpStatus = 400)  // → { code: 1, message, data: null }
paginate(res, list, total, page, pageSize)
// → { code: 0, message:'ok', data: { list, total, page, pageSize, hasMore } }
```

**前端侧（`mobile/src/utils/request.ts` 已实现拆包）**：

- `body.code === 0` → `resolve(body.data)`。**前端拿到的 `res` 就是 `data` 本身。**
- 所以前端写 `res.foo`，**绝不能写 `res.data.foo`** —— 那是多剥了一层，得到 `undefined`，页面显示 0 或空白，且不报错。
- `statusCode === 401` → 拦截器自动清 token 并 toast，前端**不需要**自己处理登录失效。
- 业务错误（`code !== 0`）→ 拦截器已 toast `message` 并 reject，前端**不需要**再 toast 一次。

**状态码约定**：参数错 `400`；未登录/过期 `401`；无权限 `403`；找不到 `404`；
限流 `429`；服务端错 `500`。**业务失败一律 `code: 1`**，与状态码正交。

---

## 2. 鉴权（已存在）

`server/src/middleware/auth.ts`：`authMiddleware` 解析 `Authorization: Bearer <token>`，
挂 `req.userId`。**所有需要登录的接口都必须挂它。**

**游客接口例外**：PK 分享落地页要让没注册的人答题（plan.html M4 明确要求「对手那台没注册过」）。
这类接口**不挂** `authMiddleware`，靠挑战码（duel code）鉴权，见 §4.4。

**写库时间戳**：一律 `localNowStr()`（`server/src/utils/datetime.ts`），**不要** `new Date()`，
**不要** SQLite 的 `CURRENT_TIMESTAMP`（那是 UTC，与 `checkins.check_date` 的本地日期对不上）。
日期（`check_date`、`last_checkin_date`）用 `todayLocal()`。

---

## 3. 数据表真源（已在库里，不要新建同名表）

只有**一处**要新增表：`reports`（见 §4.9）。其余全部已存在。

### 3.1 课程（`20261123150000_course_core` + `20261123160000_content_keys`）

| 表 | 关键列 |
| --- | --- |
| `units` | id, **key**(uq), level(`basic\|advanced\|extended`), type(`char\|word\|sentence\|dialogue`), title, title_en, intro, sort |
| `lessons` | id, unit_id, **key**(uq), title, title_en, intro, est_minutes(10), sort |
| `items` | id, lesson_id, **point_key**, **kind**(`recognize\|pinyin\|meaning\|stroke\|listen`), prompt, prompt_en, **options**(TEXT/JSON 数组), answer, char, audio_url, sort　*uq(lesson_id, point_key, kind)* |
| `attempts` | id, user_id, item_id, lesson_id, is_correct(boolean), user_answer, duration_ms, created_at |
| `lesson_progress` | id, user_id, lesson_id, status(`in_progress\|done`), best_score, **best_total**, attempts_count, last_item_id, completed_at, created_at, updated_at　*uq(user_id, lesson_id)* |
| `xp_events` | id, user_id, amount, reason(`correct\|wrong\|lesson_done\|streak\|seal\|duel`), ref_type, ref_id, note, created_at |
| `duels` | id, **code**(12,uq), lesson_id, challenger_id, challenger_score, challenger_ms, opponent_name, opponent_score, opponent_ms, status(`open\|done\|expired`), expires_at, created_at |

### 3.2 错题本 —— 是**视图**，不是表

```sql
CREATE VIEW wrong_book AS SELECT user_id, item_id,
  SUM(is_correct = 0) AS wrong_times,
  MAX(CASE WHEN is_correct = 0 THEN created_at END) AS last_wrong_at,
  SUM(CASE WHEN is_correct = 1 AND id > (最近一次答错那条的 id) THEN 1 ELSE 0 END) AS correct_since
FROM attempts GROUP BY user_id, item_id
HAVING SUM(is_correct = 0) > 0
```

**两个必须知道的行为**（否则接口会写错）：

1. 视图里**没有任何 `items` 的字段**（只有 `user_id, item_id, wrong_times, last_wrong_at, correct_since`）。
   查询必须 `JOIN items ON items.id = wrong_book.item_id` 才能拿到 `prompt`。
2. **已掌握的题仍在视图里**（`correct_since >= 2` 只是计数变大，行不会消失）。
   「还欠着的错题」= `WHERE correct_since < 2`。**这个 `< 2` 由接口层写，不要改视图。**

### 3.3 游戏化（`20261123090000_reused_core`，已建表但**空表**）

| 表 | 关键列 |
| --- | --- |
| `checkins` | id, user_id, **check_date**(date), lesson_id, xp_earned, created_at　*uq(user_id, check_date)* |
| `user_streaks` | user_id(PK), current_streak, max_streak, last_checkin_date, updated_at |
| `teams` | id, name, **invite_code**(12,uq), captain_id, slogan, created_at |
| `team_members` | id, team_id, user_id, joined_at　*uq(team_id, user_id)* |
| `achievements` | id, **code**(40,uq), name, description, **kind**(`unit\|stroke\|speak\|streak\|xp`), ref_key, threshold, sort |
| `user_achievements` | id, user_id, achievement_id, unlocked_at　*uq(user_id, achievement_id)* |

⚠️ **`achievements` 现在 0 行** —— 印章定义缺种子数据。**content** 负责写种子（见 §6）。

---

## 4. 接口清单（**这是契约主体**）

> 前缀 `/api` 已由 `app.ts` 挂载。下表路径全是 `/api` 之后的。
> `A` = 需登录（挂 `authMiddleware`）；`G` = 游客可访问。

### 4.1 内容浏览 —— `routes/content.ts`（**be-api**）

| 方法 | 路径 | 鉴权 | 说明 |
| --- | --- | --- | --- |
| GET | `/units` | A | 单元列表，**带进度聚合** |
| GET | `/units/:id/lessons` | A | 某单元的课时列表，**带进度** |
| GET | `/lessons/:id` | A | 课时详情 + 题目 |
| GET | `/lessons/:id/items` | A | 只取题目（重练、PK 复用） |

**`GET /units`** → `data`（数组，不是分页对象）：

```jsonc
[{ "id":1, "key":"basic-char", "level":"basic", "type":"char",
   "title":"象形入门", "titleEn":"Picture Characters",
   "intro":"…", "sort":1,
   "lessonCount":3, "doneCount":1, "itemCount":44,
   "progress": 0.33 }]              // = doneCount / lessonCount，无课时为 0
```

**`GET /units/:id/lessons`** → `data`：

```jsonc
[{ "id":1, "key":"basic-char-nature", "title":"自然五字", "titleEn":"Five from Nature",
   "intro":"…", "estMinutes":8, "sort":1, "itemCount":5,
   "status":"done",                 // ← 当前用户对该课的进度，未开始为 "none"
   "bestScore":5, "bestTotal":5 }]
```

**`GET /lessons/:id`** → `data`：

```jsonc
{ "id":1, "key":"basic-char-nature", "title":"自然五字", "titleEn":"…", "intro":"…",
  "estMinutes":8, "sort":1,
  "unit": { "id":1, "key":"basic-char", "title":"象形入门", "level":"basic", "type":"char" },
  "progress": { "status":"none", "bestScore":0, "bestTotal":null, "attemptsCount":0 },
  "items": [ /* 见下，按 sort 升序 */ ] }
```

**`GET /lessons/:id/items`** → `data`：上面那个 `items` 数组本身。**按 `sort` 升序。**

**`item` 对象（内容接口一律返回这套字段，camelCase）**：

```jsonc
{ "id":12, "kind":"recognize", "prompt":"日", "promptEn":"Choose the correct pinyin.",
  "options":["rì","shí","mù","dà"],   // ← 已 JSON.parse，是数组；stroke 题为 null
  "answer":"rì",                     // ⚠️ 见下「答案字段的取舍」
  "char":null, "audioUrl":null, "sort":11, "lessonId":1, "pointKey":"ri" }
```

**⚠️ 答案字段的取舍（契约决定，四路都按这个）**：

- 内容接口**返回 `answer`**。理由：答题是**离线可算**的（前端本地判对错、即时反馈、PK 游客端也要判分），
  把答案藏起来就得每答一题发一次请求，换来断网即不可用 —— 这不划算。**这是教学应用，不是考试。**
- 但 `attempts` 落库的那一次提交仍**必须由后端复判**（见 §4.2），防止前端算出个假分。

### 4.2 答题 —— `routes/attempts.ts`（**be-api**）

| 方法 | 路径 | 鉴权 | 说明 |
| --- | --- | --- | --- |
| POST | `/attempts` | A | 提交一次作答，**后端复判** |
| POST | `/lessons/:id/finish` | A | 结算课时，推进度、发 XP |

**`POST /attempts`** 请求：

```jsonc
{ "itemId":12, "userAnswer":"rì", "durationMs":2400 }
```

→ `data`：

```jsonc
{ "isCorrect":true, "answer":"rì",            // 后端复判用的正确答案，回给前端用于展示
  "xpEarned":10,                              // 答对 10，答错 2（.env 的 XP_PER_CORRECT / XP_PER_WRONG）
  "hint":"太阳的样子，中间那一点是它的光。",   // 来自 content 的 hint，不是 items 列！
  "wrongTimes":1,                             // 该题当前错了几次（来自 wrong_book 视图）
  "badge": null }                             // 本次是否解锁印章：{ code, name } 或 null
```

**后端必须做的事**（一处都不能省）：

1. 用 `itemId` 查 `items.answer`，**自己判对错**，不信前端传来的 `isCorrect`。
2. 写 `attempts`：`user_id=req.userId, item_id, lesson_id`（从 item 查，**不要信请求体里的 lessonId**）、
   `is_correct`, `user_answer`, `duration_ms`, `created_at=localNowStr()`。
3. 写 `xp_events`：`amount` 按对错，`reason='correct'|'wrong'`，`ref_type='item'`, `ref_id=itemId`。
4. 维护 `lesson_progress`（`attempts_count += 1`；`last_item_id` 更新；`best_score` 在结算时才算）。
5. `hint` 不在 `items` 表里 —— 从 `content.json` 读，或导入时把 hint 也写进库。
   **契约选择：导入脚本把 hint 写进库**（见 §6，`items.hint` 新增列由 content 的迁移负责）。

**`POST /lessons/:id/finish`** 请求：

```jsonc
{ "correctCount":8, "total":10, "durationMs":95000 }
```

→ `data`：

```jsonc
{ "lessonId":1, "status":"done", "bestScore":8, "bestTotal":10, "firstDone":true,
  "xpEarned":20,                    // 课时奖励 XP_PER_LESSON=20（只有这一项，没有别的加成）
  "checkin": { "created":true, "currentStreak":3, "xpEarned":5 },  // 今天的打卡（跨课去重）
  "nextLessonId":2, "unitDone":false }
```

**服务端必须做的**：

- `status='done'` 当 `correctCount / total >= 0.6`（**阈值写常量**，四路不要各写各的）。
- `best_score` 只在 `correctCount * best_total_old > best_score_old * total` 时更新（**按比率比，不是按个数**，
  因为每次题量可能不同）。
- 调 `checkinService.touch(userId)`（be-api 内部函数，幂等，一天一条）。

### 4.3 错题本 —— `routes/wrongbook.ts`（**be-api**）

| 方法 | 路径 | 鉴权 | 说明 |
| --- | --- | --- | --- |
| GET | `/wrongbook` | A | 待复习错题（`correct_since < 2`） |
| POST | `/wrongbook/practice` | A | 错题重练，**批量提交** |

**`GET /wrongbook`** 查询：`?limit=20&lessonId=`（可选）→ `data`（**对象**，不是数组）：

```jsonc
{ "list": [ { "itemId":12, "wrongTimes":3, "correctSince":0,
              "lastWrongAt":"2026-11-23 14:02:11",
              "prompt":"日", "promptEn":"…", "kind":"recognize",
              "options":["rì","shí","mù","dà"], "answer":"rì", "audioUrl":null,
              "char":null, "lessonId":1, "lessonTitle":"自然五字",
              "unitTitle":"象形入门", "hint":"…" } ],
  "total": 7,
  "byLesson": [ { "lessonId":1, "lessonTitle":"自然五字", "count":4 } ] }
```

排序：`correct_since ASC, wrong_times DESC, last_wrong_at DESC`（**快掌握的排前面**，别让用户永远卡在最老的题）。

**`POST /wrongbook/practice`** 请求：`{ "results":[ { "itemId":12, "userAnswer":"rì", "durationMs":1500 } ] }`
→ 内部逐条走与 `POST /attempts` 相同的复判+落库逻辑（**复用同一个 service 函数，不要复制代码**）；
返回 `data`：`{ "results":[{ "itemId":12, "isCorrect":true, "answer":"rì", "wrongTimes":3, "correctSince":1 }],
"cleared":1, "remaining":6 }`。
`cleared` = 本次后 `correct_since` 达到 2 的题数。

### 4.4 PK 对战 —— `routes/duel.ts`（**fe-game**）

| 方法 | 路径 | 鉴权 | 说明 |
| --- | --- | --- | --- |
| POST | `/duels` | A | 创建挑战，返回 6 位码 |
| GET | `/duels/:code` | **G** | 打开分享链接：拿挑战信息 + 题目 |
| POST | `/duels/:code/submit` | **G** | 游客（或本人）提交成绩 |
| GET | `/duels/recent` | A | 我最近的挑战 |

**`POST /duels`** 请求 `{ "lessonId":1 }` → `data`：
`{ "code":"4K7Q2M", "lessonId":1, "lessonTitle":"自然五字", "expiresAt":"2026-11-30 23:59:59",
"shareUrl":"/pages/duel/duel?code=4K7Q2M" }`

- 码长 **6**，字符集 `23456789ABCDEFGHJKLMNPQRSTUVWXYZ`（去掉了易混的 0/O/1/I）。
- 生成时查重（`duels.code` 是 unique），冲突就重生成，最多 10 次。
- `expires_at` = 现在 + 7 天。

**`GET /duels/:code`**（游客可访问）→ `data`：

```jsonc
{ "code":"4K7Q2M", "status":"open", "lessonId":1, "lessonTitle":"自然五字",
  "challengerName":"小明", "challengerScore":null, "challengerMs":null,
  "challengerId": 1,          // ← 前端据此判断「我就是发起人，不要让我再答一遍」
  "expiresAt":"2026-11-30 23:59:59",
  "total": 12,                // ← 这一课一共几道题（题量，与 items 是否下发无关）
  "items": [ /* 同 §4.1 的 item 对象 */ ] }
```

`status != 'open'`（已 done / 已 expired）时**仍返回**，但 `items` 为 `null`，前端展示对比页或「已结束」。

**`total`（题量）与 `items`（题目内容）是两件事，必须分开给**：`items` 只在 `open` 时下发，
`total` **任何 status 都要给**。`status === 'open'` 时 `total` 必须等于 `items.length`，
后端以 `items.length` 为准（不要再单独 count 一次，两条查询会漂）。`done` / `expired` 时
`total` = 该课的题数。

> **变更记录（2026-11-24，用户批准）**：本字段是后加的。加之前前端在已结束的对战页
> 只能打印 `items.length`，渲染出「出的题，一共 **0** 道」的错文案 ——
> 实测：已结束的对战显示 0 道，进行中的同一课显示 12 道。前端要的是**题量**，
> 不该依赖**题目内容**是否下发。

**`POST /duels/:code/submit`** 请求：

```jsonc
{ "name":"Lucas", "score":8, "total":10, "durationMs":88000 }
// 若带 Authorization 头且是 challenger 本人，则写 challenger_*；否则写 opponent_*
```

→ `data`：`{ "code":"4K7Q2M", "role":"opponent", "challenger":{"name":"小明","score":9,"ms":92000},
"opponent":{"name":"Lucas","score":8,"ms":88000}, "winner":"challenger" }`
（`winner`: `challenger|opponent|tie`；同分比用时，用时也同为 tie）

**`GET /duels/recent`** → `data`：`[{ code, lessonTitle, role, status, myScore, rivalName, rivalScore, createdAt }]`，最多 20 条。

### 4.5 进度与统计 —— `routes/progress.ts`（**be-api**）

| 方法 | 路径 | 鉴权 | 说明 |
| --- | --- | --- | --- |
| GET | `/profile/summary` | A | 「我的」页所有数字**一次拿全** |
| GET | `/profile/calendar` | A | 学习日历（近 N 天打卡） |

**`GET /profile/summary`** → `data`：

```jsonc
{ "user": { "id":1, "username":"xiaoming", "nickname":"小明", "avatarUrl":null },
  "xp": { "total": 480, "week": 120, "today": 30 },
  "streak": { "current": 3, "max": 7, "lastCheckinDate": "2026-11-23" },
  "rank": { "rankName": "秀才", "level": 3, "weekRank": 12, "weekXp": 120 },
  "stamps": { "total": 12, "earned": 2 },        // achievements 总数 / 我已得
  "learn": { "lessonsDone": 4, "lessonsTotal": 10, "itemsDone": 63,
             "accuracy": 0.82 },                  // accuracy = 答对 / 总作答，无作答为 0
  "todayCheckedIn": true }
```

**段位规则（常量，写在一处）**：
`童生` 0–499 → `秀才` 500–1499 → `举人` 1500–2999 → `贡士` 3000–5999 → `进士` 6000+。
（阈值按累计 XP。四路都用这一套，**不要各写一份**。）

**`GET /profile/calendar`** `?days=30` → `data`：
`{ "days": ["2026-11-01", …], "checked": ["2026-11-20","2026-11-21","2026-11-23"] }`

### 4.6 XP / 打卡 / 排行 —— `routes/xp.ts`、`routes/checkin.ts`（**fe-game**）

| 方法 | 路径 | 鉴权 | 说明 |
| --- | --- | --- | --- |
| POST | `/checkin` | A | 手动打卡（**由完成课时自动触发，也可单独调用**，幂等） |
| GET | `/checkin/status` | A | 今天是否已打卡 + 连击 |
| GET | `/xp/ledger` | A | XP 流水，分页 |
| GET | `/rank/week` | A | 周榜 |
| GET | `/rank/rank-of/:userId` | A | 某人的名次（默认自己） |

**`POST /checkin`** → `data`：`{ "created":false, "checkDate":"2026-11-23", "currentStreak":3, "maxStreak":7, "xpEarned":0 }`
（今天已打过 → `created:false`，**不报错**，返回当前连击）

**连击算法（唯一实现，放 `services/checkin.ts`）**：
`last_checkin_date === 昨天` → `current += 1`；`=== 今天` → 不变；`更早或空` → `current = 1`。
`max_streak = max(max_streak, current)`。**跨月跨年用 `daysBetween()`（datetime.ts 有），不要自己算。**

**`GET /xp/ledger`** `?page=1&pageSize=20` → `paginate(...)`：
`list: [{ id, amount, reason, refType, refId, note, createdAt }]`。

**`GET /rank/week`** `?limit=50` → `data`：

```jsonc
{ "weekStart":"2026-11-17", "weekEnd":"2026-11-23",
  "list": [ { "rank":1, "userId":3, "nickname":"…", "avatarUrl":null,
              "weekXp": 320, "rankName":"秀才", "isMe":false } ],
  "me": { "rank":12, "weekXp":120, "rankName":"秀才" } }   // 不在前 limit 也给；未上榜 me 为 null
```

周起点 = **周一**。周榜 XP 用 `xp_events.created_at` 落在 [周一 00:00, 下周一 00:00) 求和，
**不要**用 `user_streaks` 或任何缓存列。

### 4.7 印章 —— `routes/xp.ts`（并入，**fe-game**）

| 方法 | 路径 | 鉴权 | 说明 |
| --- | --- | --- | --- |
| GET | `/stamps` | A | 全部印章 + 我是否已得 |
| POST | `/stamps/check` | A | 主动结算一次（幂等，返回本次新解锁） |

**`GET /stamps`** → `data`：`[{ "code":"unit-basic-char", "name":"象形入门", "description":"…",
"kind":"unit", "sort":1, "earned":true, "unlockedAt":"2026-11-22 10:00:00" }]`

**发章规则**（在 `services/stamps.ts` 一处实现，`POST /attempts` 和 `POST /lessons/:id/finish` 内部调用）：

- `kind='unit'`：该单元全部课时 `status='done'` → 发 `ref_key` 对应的章。
- `kind='streak'`：`current_streak >= threshold` → 发。
- `kind='xp'`：累计 XP `>= threshold` → 发。
- `kind='stroke'`：该单元全部描红题都答对过 → 发。
- `kind='speak'`：收尾日才有，**本次不实现**，`POST /stamps/check` 遇到直接跳过。

### 4.8 组队 —— `routes/team.ts`（**fe-game**）

| 方法 | 路径 | 鉴权 | 说明 |
| --- | --- | --- | --- |
| POST | `/teams` | A | 建组（2–8 人） |
| POST | `/teams/join` | A | 用邀请码加入 |
| GET | `/teams/mine` | A | 我的小组 + 组内周 XP 榜 |
| DELETE | `/teams/mine/leave` | A | 退出（队长退出则解散） |

**`GET /teams/mine`** → `data`：`null`（未加入）或
`{ "id":1, "name":"…", "inviteCode":"AB12CD", "captainId":3, "memberCount":4,
"members":[ { "userId":3, "nickname":"…", "weekXp":210, "isCaptain":true, "isMe":false } ] }`
（成员按 `weekXp` 降序）

限制：组员上限 **8**；同一用户只能在一个组（加入前先查 `team_members`）；
邀请码 6 位、字符集同 duel code；`captain_id` 是建组人。

### 4.9 举报与用户资料 —— `routes/content.ts`（**be-api**）+ 新表 `reports`

| 方法 | 路径 | 鉴权 | 说明 |
| --- | --- | --- | --- |
| GET | `/users/:id` | A | 用户公开资料 |
| POST | `/reports` | A | 举报 |

**`GET /users/:id`** → `data`：`{ id, username, nickname, avatarUrl, createdAt,
rankName, xpTotal, lessonDone, stampsEarned }`（**不返回** `password_hash`、`status`、任何 token）

**`POST /reports`** 请求 `{ "targetType":"user|duel","targetId":3,"reason":"…","detail":"…" }`
→ `data`：`{ "id":1 }`。`reason` 必填（≤30 字），`detail` ≤200 字。

**新增表 `reports`**（**只有这一处新表**，由 be-api 写迁移 `20261123170000_reports.ts`）：

```ts
t.increments('id').primary()
t.integer('reporter_id').notNullable()
t.string('target_type', 20).notNullable()   // user | duel
t.integer('target_id').notNullable()
t.string('reason', 30).notNullable()
t.string('detail', 200).nullable()
t.string('status', 20).notNullable().defaultTo('open')  // open | handled
t.dateTime('created_at').nullable()
t.index(['target_type','target_id'], 'idx_reports_target')
```

### 4.10 静态资源 —— **be-api 负责**（`app.ts`）

现 `app.ts` **没有任何 `express.static`**，音频与上传目前无处可服务。加三段（放在 404 兜底**之前**）：

```ts
app.use('/audio', express.static(path.join(__dirname, '..', 'content', 'audio')))
app.use('/uploads', express.static(path.join(process.cwd(), process.env.UPLOAD_DIR || './uploads')))
```

⚠️ **vite 只代理 `/api`** —— 前端请求 `/audio/<key>.mp3` 时本地会打到 5173 而 404。
两路各改一处，**必须同时**：

- **be-api**：`app.ts` 挂 `/audio`（见上）与 `/api` 一起能被访问。
- **fe-learn / fe-game**：`mobile/vite.config.ts` 的 `proxy` 里加 `/audio` 与 `/uploads` 两条
  （target 同 `/api`）。← 这条**只有一次机会**，两路都要改同一个 `vite.config.ts` —— 所以**由 fe-learn 改**，
  fe-game 不要动。改完告诉我。

---

## 5. 文件所有权（越界即冲突，**波次 2 按此核对 diff**）

| agent | 独占（可写） | 只读（可看不可改） |
| --- | --- | --- |
| **be-api** | `server/src/routes/{content,attempts,wrongbook,progress}.ts`、`server/src/services/**`（**`seeds/` 除外，见 content 行**）、`server/src/migrations/20261123170000_reports.ts`、**`server/src/routes/index.ts`**、**`server/src/app.ts`** | 其余全部 |
| **fe-learn** | `mobile/src/pages/{learn,lesson,practice,wrongbook,stroke}/**`、`mobile/src/api/{course,attempt,wrong}.ts`、`mobile/src/styles/**`、**`mobile/vite.config.ts`** | 其余全部 |
| **fe-game** | `mobile/src/pages/{profile,rank,stamp,duel,team,user}/**`、`mobile/src/api/{xp,checkin,stamp,duel,team,user}.ts`、`server/src/routes/{xp,checkin,duel,team}.ts` | 其余全部 |
| **content** | `server/content/content.json`、`server/content/audio/**`、`server/scripts/import-content.ts`、`server/src/migrations/20261123160001_items_hint.ts`、`server/src/seeds/stamps.seed.ts` | 其余全部 |

**⚠️ 为什么种子文件放 `src/seeds/` 而不是 `src/services/`**：be-api 独占 `services/**`，
若种子文件也放这里，两个 agent 就会争同一个目录。**放到 `src/seeds/` 后两张表格的路径集合完全不相交**，
波次 2 核对 diff 时不会出现「同一路径出现在两行」。content 若觉得 `seeds/` 不合适，
**不要自己改位置**，写进 §7 变更请求。

**⚠️ 补充（2026-11-24 14:1x，编排者补记）：`utils/**` 与 `constants/**` 是编排者的，四个 agent 一律只读。**
上表把这两列在所有四行里都写成「其余全部」，**读起来像「无人所有」** —— 这是个真空洞，已有实例：
`server/src/utils/code.ts`、`server/src/utils/week.ts`、`server/src/constants/index.ts`（均 11-23 16:42 建）
**被 fe-game 与 be-api 两边同时 import**（`routes/duel.ts`／`routes/team.ts`／`routes/xp.ts` 与
`services/rank.ts`／`services/xp.ts`），而**没有一行授权建它**。这三件连同 `routes/auth.ts`（11-23 15:18）
一并明确为**编排者所有、波次 0 冻结、agent 只读不改**；要改**先写 §7 变更请求**。
（判据：这三件的文件头自陈「波次 0 冻结，**编排者所有，agent 只读不改**」。
⚠️ 如实记：mtime 只能证**何时**写入、**证不了何人**写入，故此判据是「文件自陈 + 无人认领」，不是取证。）

**唯一共享写点**：`mobile/src/pages.json` —— 已在波次 0 由我改好，**任何 agent 都不要动**。
要加页面，写进 §7「变更请求」，波次 2 由我统一改。

**`mobile/src/api/index.ts` 也是我的，但原因相反**：它**不做 barrel 汇总**（不 re-export 任何 agent 的文件），
里面只有 `authApi`。所以它**根本不会成为写冲突点** —— 各 agent 的新接口文件（`api/course.ts`、
`api/xp.ts` …）由各自创建，页面**直接 import 自己那个文件**，不经过 `index.ts`。
这条是刻意的：如果 `index.ts` 汇总了 `api/xp.ts`，而 fe-game 还没建它，**fe-learn 的编译就会挂** ——
四个 agent 的编译通过与否会互相耦合。

**`server/src/routes/index.ts` 归 be-api**（它要挂所有新路由）。

**⚠️ 波次 0 已消除一个跨 agent 交接点**：`index.ts` 现在**已经挂好了全部 8 条新路由**
（`content/attempts/wrongbook/progress/xp/checkin/duel/team`），且这 8 个文件都已存在波次 0 空壳
（统一返回 `501 未实现`）。所以：

- **be-api 不需要等 fe-game 交付**就能编译通过、服务能起 —— 原先「fe-game 在报告里写两行挂载、我手动加」
  这个环节**整个删掉了**，少一次串行等待。
- **fe-game 不要新建 `xp/checkin/duel/team.ts`** —— 它们在 §5 里是你的独占文件，**就地替换空壳内容**即可。
- 谁都不许改 `index.ts` 的挂载顺序（`/duels/recent` 必须在 `/duels/:code` 之前，见 §4.4 的路由顺序陷阱）。

---

## 6. 内容侧（**content**）

现状：`content.json` 3 单元 / 10 课时 / 40 知识点；库内 **132 题**（三个选择题型各 40、描红 12、**听音 0**）；
`content/audio/` **空**；`achievements` **0 行**。`import-content.ts` **已写好**（确定性干扰项、按 key upsert，
不要重写，只能改）。

content 的四件活：

1. **生成音频**：`content/audio/<point.key>.mp3`，40 个。用 edge-tts（`zh-CN-XiaoxiaoNeural` 之类），
   文件名**必须**等于 knowledge point 的 `key`（纯小写 ASCII，已由导入脚本的 `KEY_RE` 保证）。
   生成后重跑 `npx tsx scripts/import-content.ts` → 听音题从 0 变成 40。
   ⚠️ `npm install edge-tts` 之类的**新依赖要报给我**，不要自己装（可能吃内存/改 lockfile 冲突）。
2. **写印章种子**：`server/src/seeds/stamps.seed.ts`（**注意是 `seeds/` 不是 `services/`**），导出 `seedStamps(db)`，幂等（按 `code` upsert）。
   至少 12 枚：3 枚 `unit`（`ref_key` = 三个单元的 key）+ 3 枚 `streak`（threshold 3/7/14）+
   3 枚 `xp`（500/1500/3000）+ 3 枚 `stroke`（`ref_key` = 单元 key，含描红字）。
3. **扩量 40 → 60–80 个知识点**（plan.html Day 5 要求）。**优先加 `advanced` / `extended` 难度**，
   现在三级全 `basic`，难度轴是空的。
4. **给导入脚本加 `hint` 落库**：新增迁移 `20261123160001_items_hint.ts` 给 `items` 加 `t.string('hint', 200).nullable()`，
   导入脚本写 `hint`。**这是 §4.2 的 `hint` 字段来源**，不做的话后端只能去读 `content.json`。

---

## 7. 变更请求（schema）

四路跑到一半发现契约有错/缺，**不要自己改契约、不要自己改别人的文件**，在报告里写：

```
CHANGE-REQUEST
  section: 4.2
  what: POST /attempts 需要返回 lessonProgress
  why: 前端答题页要实时看进度条
  proposed: data 增加 "lessonProgress": { correctCount, total }
```

波次 2 我统一裁决并一次性改 `pages.json` / `api/index.ts` / `CONTRACT.md`。

---

## 8. 各路的验收标准（**波次 2 逐条过**）

**be-api**

- 每个接口 `curl -H "Authorization: Bearer $T"` 返回 `code:0` 且字段名与 §4 **逐字一致**。
- `POST /attempts` 用**故意错的答案**测，确认后端判错（证明没信前端）。
- 游客接口（`GET /duels/:code`）**不带头**能返回 `code:0`。
- `npx tsc` 0 错误。
- `index.ts` 里每个新路由都挂上了，且**在 `:id` 参数路由之前**定义静态路径路由（否则 `/duels/recent` 会被 `/duels/:code` 抢走）。

**fe-learn**

- `learn → lesson → practice` 能走完一整课，答错后 `wrongbook` 里能看到。
- `stroke` 页用 hanzi-writer **本地打包**（不走 CDN）。
- 所有页面 `<template>` **只有一个根元素**（本项目 `Layout` 用 `<Transition>`，多根节点会导致切换后空白且不报错）。
- `npx tsc` 或 `npx vite build` 无**新增**错误（pre-existing 可忽略，但要报出来）。

**fe-game**

- 「我的」页所有数字来自**一个** `GET /profile/summary`，不是 N 个请求凑。
- 分享链接 `/pages/duel/duel?code=xxx` **未登录**能打开（游客流程）。
- 印章页未得的章也要显示（灰态），不是只显示已得的。

**content**

- 重跑导入两遍，**第二遍 `新增 0，更新 N`**（幂等证明）。
- `select count(*) from items where kind='listen'` = 40。
- `select count(*) from achievements` >= 12。
- 扩量后 `content.json` 仍是合法 JSON 且 `import-content.ts` 校验 0 错误。

---

## 9. 与我（编排者）的接口

- **我负责**：波次 0 的契约/`pages.json`/`api/index.ts`；波次 2 的合并与审核；构建与部署（**串行**，不外包）；
  任何 SSH（服务器跑着学校生产系统，见部署纪律）。
- **你们负责**：只写自己那摊、只改 §5 列出的文件、交付时按 §8 自检并报告 `CHANGE-REQUEST`。
- **不要**：装新依赖（先报）、跑 `uni build`（吃内存，我来串行跑）、碰 `server/.env` / `ecosystem.config.js` / `server/data/*.db`。