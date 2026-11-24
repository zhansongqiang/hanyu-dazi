# 听音题音频

契约 §8 的硬指标：`kind = 'listen'` 的题目**恰好 40 条**（basic 层 40 个知识点）。
这里就是那 40 个 mp3，文件名叫 `<知识点 key>.mp3`（如 `ri.mp3`、「日」）。

## 怎么重新生成

音频用 [edge-tts](https://github.com/rany2/edge-tts)（微软 Edge 的在线语音）合成，
不在 node 依赖里，需要单独装：

```bash
python -m venv <某处>/venv                 # 随便找个目录，别放进本仓库
<某处>/venv/Scripts/pip install edge-tts
```

然后（在 `server/` 下）：

```bash
<某处>/venv/Scripts/python.exe scripts/gen-audio.py
```

- 默认**只补缺的**，以及**文本改过的**（见下面「台账」）
- `--force` 全部重生成
- `--voice zh-CN-YunxiNeural --rate -10%` 换音色/语速
  （当前用 `zh-CN-XiaoxiaoNeural`、`-15%`）

生成完**必须**更新台账，否则导入会把这些音频当成「文本对不上」：

```bash
npx tsx scripts/audio-manifest.ts --write
```

## 台账 `manifest.json` 是什么

记着「每个 mp3 是按哪段文本合成的」。看着多余，但它是唯一能发现下面这种错的东西。

mp3 里**查不出念的是哪个字** —— edge-tts 的输出没有 ID3 标签（文件头直接是 MPEG
帧同步 `fff364`），文件名又是不变的 `key`。于是：把「日」改成「阳」之后，`ri.mp3`
依然存在、依然够大，「文件在不在」这种检查照样通过。结果是学习者**看到「阳」、
听到「rì」**，页面上没有任何异样，跑什么测试都不会红。

所以判据不能是「文件存在吗」，只能是「音频是按现在这段文本念的吗」—— 后者只能
靠台账回答。`scripts/audio-manifest.ts` 维护它，`scripts/import-content.ts` 每次
导入都会比对，对不上就在报告里打一条 ⚠。

改文本的正确顺序：

```bash
# 1. 改 content.json 里该知识点的 text
# 2. 重新合成（脚本自己认得出哪些要重生成）
<venv>/Scripts/python.exe scripts/gen-audio.py
# 3. 承认新音频，更新台账
npx tsx scripts/audio-manifest.ts --write
# 4. 导入
npx tsx scripts/import-content.ts
```

## 注意

- 增删 listen 知识点后，**音频和台账要跟着改**；少了音频的听音题不会入库
  （导入脚本会跳过并报「跳过 N 道听音题」），不会以半成品的形式进库。
- `manifest.json` 里 `bytes` 只作人工参考（一眼看出文件是不是被换过），
  程序判定用的是 `text`。
- 音色/语速改了要 `--force` 全量重生成 —— 否则新旧音色会混在一套题里。
