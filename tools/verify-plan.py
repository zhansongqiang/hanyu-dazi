#!/usr/bin/env python3
"""Sanity-check plan.html at the project root: tag balance + stale-token scan.

Two independent checks, both cheap:

  1. Tag balance. Every tag that must nest (section/div/ul/ol/li/p/table/tr/
     details/main/span) is counted open vs close. A mismatch means an Edit
     dropped or duplicated a closing tag, which shows up as a broken page.

  2. Stale tokens. Strings that belonged to abandoned decisions (the old
     server, the old plan's cloud-first wording) must occur ZERO times. If one
     comes back, some earlier text was resurrected by a bad edit.

Run:  python -I verify-plan.py
"""
import re
import sys
from pathlib import Path

PLAN = Path(__file__).resolve().parent.parent / "plan.html"

NESTING = ["section", "div", "ul", "ol", "li", "p", "table", "tr",
           "details", "main", "span", "h2", "h3", "em", "code", "strong"]

# 服务器裸 IP 也不该出现在这份文档里。守卫要查它，但**不能把 IP 原样写在守卫里** ——
# 否则守卫自己就成了仓库里唯一那份 IP 副本，而且它的 stdout 会被粘进取证文件，
# 等于换个地方又漏一次（仓库历史上的 IP 正是这么进去的）。所以：串用八位组拼出来，
# 打印时也换成标签，读数里不带 IP。
BARE_IP = ".".join(("114", "132", "232", "60"))

STALE = ["175.178", "visible-learning", "8090", "CETHelper",
         BARE_IP, "npm run deploy"]


def label(tok: str) -> str:
    # 英文标签，不是偷懒：本脚本其余输出全是 ASCII，控制台编码（GBK/UTF-8）
    # 一换中文就可能打出乱码 —— 而这份读数是要被粘进取证文件的，乱码等于没读到。
    return "server bare IP" if tok == BARE_IP else tok


def count_tags(html: str, tag: str) -> tuple[int, int]:
    # `<tag` followed by space, `>`, or `/`; excludes e.g. <pclass>.
    opened = len(re.findall(rf"<{tag}(?=[\s/>])", html))
    closed = len(re.findall(rf"</{tag}\s*>", html))
    return opened, closed


def main() -> int:
    html = PLAN.read_text(encoding="utf-8")
    bad = 0

    print(f"file: {PLAN}")
    print(f"size: {len(html):,} bytes, {html.count(chr(10)) + 1} lines\n")

    print("tag balance")
    for tag in NESTING:
        o, c = count_tags(html, tag)
        mark = "ok " if o == c else "BAD"
        if o != c:
            bad += 1
        print(f"  {mark} {tag:<8} open {o:>4}   close {c:>4}")

    print("\nstale tokens (expect 0 each)")
    for tok in STALE:
        n = html.count(tok)
        mark = "ok " if n == 0 else "BAD"
        if n:
            bad += 1
        print(f"  {mark} {label(tok):<24} {n}")

    print()
    if bad:
        print(f"FAILED: {bad} problem(s)")
        return 1
    print("PASSED: tags balanced, no stale tokens")
    return 0


if __name__ == "__main__":
    sys.exit(main())
