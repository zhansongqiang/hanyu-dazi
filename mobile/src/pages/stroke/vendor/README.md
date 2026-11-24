# vendor/ —— 本地打包的 hanzi-writer（不走 CDN）

归属：**fe-learn**（波次 1）。

**放在 `pages/stroke/` 里，而不是 `src/static/`** —— 契约 §5 给 fe-learn 的写权限是
`mobile/src/pages/{learn,lesson,practice,wrongbook,stroke}/**`，`mobile/src/static/**` 不在表里（属于「其余全部」）。
既然 `pages/stroke/**` 是我的独占路径，第三方资源就放这里，**波次 2 核对 diff 时不会出现越界路径**。

**没有装任何 npm 依赖**：契约 §9 规定「装新依赖先报」。这些文件是**手工落盘**的静态资源，
`package.json` / `package-lock.json` **一行都没改**（改 lockfile 会与其它 agent 冲突）。

## 文件清单

| 文件 | 来源 | 许可 |
| --- | --- | --- |
| `hanzi-writer.min.js` | npm `hanzi-writer@3.5.0` 的 `dist/hanzi-writer.min.js` | MIT（全文见 `hanzi-writer.LICENSE.txt`）|
| `hanzi-writer.package.json` | 同上包的 `package.json`（版本与来源存证）| — |
| `hanzi-writer-data.package.json` | npm `hanzi-writer-data@2.0.1` 的 `package.json` | 其 `license` 字段写的是 `SEE LICENSE IN ARPHICPL.TXT` |
| `ARPHICPL.txt` | npm `hanzi-writer-data@2.0.1` 的 `ARPHICPL.TXT` | Arphic Public License 全文 |
| `../data/chars.json` | 由 `hanzi-writer-data@2.0.1` 的 28 个字形 JSON 合并而成 | 同上（Arphic）|

## 为什么把 28 个字形合并成一个 `chars.json`

`hanzi-writer-data` 原包是**一字一文件**，文件名是 URL 编码的汉字（如 `%E6%97%A5.json`）。
中文文件名在 Windows 解包、git、nginx 和 uni-app 的构建链路上都容易出问题。
本项目只用到 **28 个字** —— 恰好是库内 `items where kind='stroke'` 的字符集合
（上 下 中 人 口 大 小 山 日 月 水 火 · 一 二 三 十 打 找 拉 拿 林 树 校 桌 汉 河 洗 海，
合并后 41 KB），所以合并成一个以汉字为 key 的 JSON，**直接 `import` 进打包产物**（不是 fetch）：

```jsonc
{ "日": { "strokes": ["M …", …], "medians": [[[x,y], …], …] }, "月": { … } }
```

这样描红页**不依赖任何网络请求**就能画字，弱网/离线也是同一套行为。
数据是 Make Me a Hanzi 的衍生物，ARPHICPL 要求随分发保留许可证全文，所以 `ARPHICPL.txt` 必须跟着走，**不要删**。

## 加载方式（为什么是 `<script>` 而不是 `import`）

`hanzi-writer.min.js` 是 IIFE，**不是 ESM**，结尾是 `var HanziWriter = function(){…}();` ——
没有 `export`，`import HanziWriter from '…'` 会拿到 `undefined` 且**不报错**（最难查的那类）。
所以走 Vite 的 `?url` 拿到产物内的真实地址，运行时注入 `<script>`，再读 `window.HanziWriter`。

这段逻辑连同降级策略收在 `mobile/src/pages/stroke/hanzi.ts`（**单一真源**），
描红页和答题页都从这里取，不各写一份。

## 升级方式

```
npm pack hanzi-writer@<版本>       # 或直接取 jsdelivr 的 dist/hanzi-writer.min.js
npm pack hanzi-writer-data@<版本>
```
把新的 min.js / LICENSE / ARPHICPL 覆盖到本目录，并用同一段 node 逻辑重新合并
`../data/chars.json`（保持 `{ 汉字: { strokes, medians } }` 的形状）。
合并脚本在 `CONTRACT.md` 变更请求里有记录；这也是唯一需要跑脚本的地方。

### 字表怎么扩（content 新增 stroke 题时）

`chars.json` 的字集合**以库为准，不手写**：

```
1. 取集合：select distinct char from items where kind='stroke' and char is not null
2. 补缺字：https://cdn.jsdelivr.net/npm/hanzi-writer-data@2.0.1/<URL编码的字>.json
3. 合并写回：{ 汉字: { strokes, medians } }（strokes 与 medians 等长，逐字校验）
```

**取数只在开发期做**，产物里一次 CDN 请求都没有 —— 字形是 `import` 进 bundle 的。
若 content 又加了新字而字表没跟上，`stroke.vue` 的 `willDegrade` 会在控制台点名缺哪些字。
