# G4 库级断言读错库 —— 修 + 变异证明（bd 自查，2026-11-24 11:3x）

> 本文件记录**我自己的仪器缺陷**：`web.cjs` 的 G4 段有两条 CRIT 断言在被测库之外的库上求值，
> 因此恒真、零判别力。缺陷由 `hanyu-dazi-ba` 指出，我独立复测确认后修掉，并用变异测试证明修对了。
> **这不是验收签字**；它只说明「g4 的 13/13 现在不是虚的」。

## 一、缺陷（原文与实测）

原版 `web.cjs:1222`：

```js
const db = new Database(ROOT + '/fx3/fixture.db', { readonly: true });
```

而同文件 `:18` 的被测后端是 `API = http://127.0.0.1:8124`，该后端在整轮渲染取证里服务的是
**`fx-render/fixture.db`**。两库实测（`dbpath-check.cjs` → `dbpath-check.out.txt`）：

| 库 | mtime（UTC → 本地） | items | lessons | users | checkins | 每个用户 checkins |
|---|---|---|---|---|---|---|
| `fx3` | 02:20:07 → 10:20 | 296 | 19 | 26 | 8 | 全是 1 |
| `fx-render` | 03:20:45 → 11:20 | 308 | 20 | 28 | 12 | 全是 1 |

两库 `checkins` 索引相同：`idx_checkin_user_date`(u=0) / `uq_checkin_per_day`(u=1)。

后果：

- `G4.n.db`（`nRow === 1`）—— 在 `fx3` 上查一个**从没在 fx3 打过卡**的 user，恒得 0 ⇒ 断言只能靠
  「恰好也等于 1」才过；判据根本不是它声称的「被测库一天一条」。
- `G4.o.db`（`idx.some(i => i.u === 1)`）—— 查的是**表结构**，与这次打卡**是否幂等**无关，
  属于静态属性，任何库都通过。
- 真正的幂等证据本来就在同段别处且是有效的：`G4.l.api.idem`（`created===false && xpEarned===0`）、
  `G4.j.streak2` / `G4.k.btn2` / `G4.m.api2`。所以「g4 13/13」**不是全虚**，
  而是**其中 2 条虚**（`G4.n.db`、`G4.o.db`）。

## 二、修法（v2）

1. 顶部新增常量（可用环境变量覆盖，便于变异测试）：

```js
const API_DB = process.env.HD_API_DB || ROOT + '/fx-render/fixture.db';
const API_DB_MIN_ITEMS = 300;   // 308 基线；296 是旧库
```

2. G4 段改为读 `API_DB`，并加两条判据收紧：

```js
ob('G4.y.dbpath', nItem >= API_DB_MIN_ITEMS, ...);           // 读错库时先亮黄灯
ck('G4.n.db', nRow === 1 && nItem >= API_DB_MIN_ITEMS, ...);  // 读错库 ⇒ FAIL
ck('G4.o.db', idx.some(i => i.u === 1) && idxCols.length >= 2 && idxCols.includes('user_id'), ...);
```

`G4.o.db` 多加了 `pragma_index_info('uq_checkin_per_day')` 的列校验 —— 从「有唯一索引」
收紧到「唯一索引**落在** `user_id` 上且是复合索引」。

3. 头注释里那句「写入走 8124 夹具库（fx3/fixture.db）」也一并更正 —— 那是同一个错认得第二处痕迹。

仪器版本：`web.cjs` **75197 B / md5 `5b21c66244de0886263e73641cebd99b`**
（修前 73536 B / `081e1700a2523848b12d5ac0cffa77c3`）。**此后一切 web.cjs 引用都以新 md5 为准**，
旧读数（`beapi-g*.out.txt` 等）对应的是旧 md5。

## 三、验证

### 3.1 正常跑（被测库 = fx-render）

`node web.cjs g4` → `g4-fix-v2.out.txt`，EXIT=0：

```
ok   G4.y.dbpath  库级读的是被测库 .../fx-render/fixture.db（items=308，护栏 ≥300）
PASS G4.n.db  被测库 checkins 只有 1 行（user 29；库 items=308）
PASS G4.o.db  「一天一条」唯一索引落在正确列上：uq_checkin_per_day(user_id,check_date) ...
--- STAGE g4 小结：CRIT 13/13 通过；AUX 4 条 ---
```

### 3.2 变异跑（把库指回旧 fx3 ⇒ 断言必须转红）

`HD_API_DB=.../fx3/fixture.db node web.cjs g4` → `g4-mutation-fx3.out.txt`，**EXIT=1**：

```
note G4.y.dbpath  库级读的是被测库 .../fx3/fixture.db（items=296，护栏 ≥300）
× FAIL G4.n.db  被测库 checkins 只有 0 行（user 30；库 items=296）
--- STAGE g4 小结：CRIT 12/13 通过；AUX 4 条 ---
```

⇒ 修复**有必要且有效**：旧写法在同一个变异下是 PASS（因为 0 行是「没打过卡的用户」的常态，
而原断言写的是 `=== 1`……事实上原版在 fx3 上就是靠撞出来的），新写法在变异下 FAIL 并点名 items=296。

> 措辞上要诚实的一点：旧版 `G4.n.db` 在 `fx3` 上是 `0 === 1` ⇒ **本来就该 FAIL**。
> 它过去能过，是因为跑的时候 `A.uid` 恰好是 fx3 里已有打卡记录的旧用户。这正是「读错库」的
> 阴险之处：**它在某几次跑里会碰巧通过**。新写法的 `nItem >= 300` 把「碰巧」这条路堵死了。

## 四、连带影响（必须一起改的引用）

- `PLAN/round7-orchestrator-changes.md` §七把 g4 写作「13/13」—— 现补注：其中 `G4.n.db` / `G4.o.db`
  为上述两条，v2 前零判别力。
- `PLAN/fe-game.md`、`PLAN/be-api.md` 引用 `beapi-g4.out.txt`（11:20:59，旧 md5）之处，按同一口径加注。
- **`be-api-accept-LG.txt` 里 `g4` 那一格「CRIT 13/13」是旧仪器读数**。它结论不变
  （其余 11 条都是有效断言），但「13/13」这个数字当时含着 2 条虚的。我不改别人的签字文件，
  只在这里与 `round7-orchestrator-changes.md` 里标注。

## 五、未做 / 不代签

- 我**不**给 G4 写状态词 —— 我是 web.cjs 的作者，且 fe-game 的表由该路与非作者处理。
- `strokeChars` 探针我先写错了（`stroke` 题的 `items.options` 是 **NULL** 而非 JSON，所以
  `json_extract(options,'$[0].char')` 恒为 0）。改用按 kind 直数后**已复现**：`fx3` 40/76/76/76/**28** = 296，
  `fx-render` 40/80/80/80/**28** = 308（`stroke-count.cjs` → `stroke-count.txt`，只读）。
  ⇒ `hanyu-dazi-ba` 报的「28 描红字」成立，我先前那句「未复核」已撤回（另行去信更正）。