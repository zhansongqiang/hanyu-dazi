#!/usr/bin/env python3
"""为 content.json 里 kinds 含 listen 的知识点合成 <key>.mp3。

用法（在 server/ 下）：
    python scripts/gen-audio.py             只补缺的、以及文本改过的
    python scripts/gen-audio.py --force     全部重新生成
    python scripts/gen-audio.py --voice zh-CN-YunxiNeural --rate -10%

跑完记得更新台账，否则 import-content.ts 会把新音频当成「文本对不上」：
    npx tsx scripts/audio-manifest.ts --write

── 为什么跳过判据不能只看「文件在不在」 ──
音频是按 text 合成的，但 mp3 里查不出念的是哪个字（edge-tts 输出没有 ID3 标签），
文件名又是不变的 key。所以「把『日』改成『阳』」之后，ri.mp3 依然存在、依然够大，
只看文件的话就会跳过它 —— 于是学习者是「看到阳、听到日」。本脚本改成拿台账
（content/audio/manifest.json）里的文本比对：文本变了就重新合成。
"""
import argparse
import asyncio
import json
import os
import sys

import edge_tts

# Windows 控制台默认 GBK，中文输出会乱码；这份输出是要给人看的
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

HERE = os.path.dirname(os.path.abspath(__file__))
SERVER = os.path.dirname(HERE)
CONTENT_FILE = os.path.join(SERVER, "content", "content.json")
AUDIO_DIR = os.path.join(SERVER, "content", "audio")
MANIFEST = os.path.join(AUDIO_DIR, "manifest.json")

CONCURRENCY = 4
RETRIES = 4
MIN_BYTES = 1500  # 低于这个大小基本是空响或截断，宁可重来


async def synth(key, text, voice, rate, out_dir, sem):
    path = os.path.join(out_dir, key + ".mp3")
    async with sem:
        last = None
        for attempt in range(RETRIES):
            try:
                comm = edge_tts.Communicate(text, voice, rate=rate)
                await comm.save(path)
                size = os.path.getsize(path) if os.path.exists(path) else 0
                if size >= MIN_BYTES:
                    return (key, "ok", size)
                last = f"太小（{size}B）"
            except Exception as e:  # noqa: BLE001
                last = f"{type(e).__name__}: {e}"
            await asyncio.sleep(1.5 * (attempt + 1))
        return (key, f"FAIL {last}", 0)


def need_regen(key, text, path, manifest, force):
    """返回 (是否要生成, 原因)"""
    if force:
        return True, "强制"
    if not os.path.exists(path):
        return True, "缺文件"
    if os.path.getsize(path) < MIN_BYTES:
        return True, "文件过小"
    was = (manifest.get(key) or {}).get("text")
    if was is None:
        return True, "台账里没有记录"
    if was != text:
        return True, f"文本已改（台账「{was}」→「{text}」）"
    return False, ""


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true", help="全部重新生成")
    ap.add_argument("--voice", default="zh-CN-XiaoxiaoNeural")
    ap.add_argument("--rate", default="-15%")
    args = ap.parse_args()

    with open(CONTENT_FILE, encoding="utf-8") as f:
        content = json.load(f)
    manifest = {}
    if os.path.exists(MANIFEST):
        with open(MANIFEST, encoding="utf-8") as f:
            manifest = json.load(f).get("entries", {})
    os.makedirs(AUDIO_DIR, exist_ok=True)

    jobs, skipped = [], []
    for unit in content["units"]:
        for lesson in unit["lessons"]:
            kinds = lesson.get("kinds") or []
            for p in lesson["points"]:
                pk = p.get("kinds") or kinds
                if "listen" not in pk:
                    continue
                path = os.path.join(AUDIO_DIR, p["key"] + ".mp3")
                regen, why = need_regen(p["key"], p["text"], path, manifest, args.force)
                if regen:
                    jobs.append((p["key"], p["text"], why))
                else:
                    skipped.append(p["key"])

    print(f"listen 知识点 {len(jobs) + len(skipped)} 个：要生成 {len(jobs)}，跳过 {len(skipped)}", flush=True)
    for k, t, why in jobs:
        print(f"  · {k}「{t}」—— {why}", flush=True)

    if not jobs:
        print("没有要生成的。", flush=True)
        return

    sem = asyncio.Semaphore(CONCURRENCY)
    results = await asyncio.gather(
        *(synth(k, t, args.voice, args.rate, AUDIO_DIR, sem) for k, t, _ in jobs)
    )

    ok = [r for r in results if r[1] == "ok"]
    bad = [r for r in results if r[1].startswith("FAIL")]
    print(f"\n生成 {len(ok)} / 失败 {len(bad)}", flush=True)
    for r in bad:
        print("  失败", r[0], r[1], flush=True)
    if bad:
        sys.exit(1)
    print("\n接下来更新台账（否则导入会报「文本对不上」）：", flush=True)
    print("  npx tsx scripts/audio-manifest.ts --write", flush=True)


if __name__ == "__main__":
    asyncio.run(main())
