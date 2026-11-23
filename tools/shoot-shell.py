#!/usr/bin/env python3
"""Day 1 壳子验收：用真浏览器打开 5173，逐页截图 + 收集控制台错误。

为什么要真浏览器：curl 只能证明 HTML 壳子返回 200，
证明不了 uni-app 的 pages.json / 路由 / 样式有没有在浏览器里真的跑起来。

用法：
    python -I tools/shoot-shell.py                 # 只截图
    python -I tools/shoot-shell.py --login          # 顺带走一遍登录流程

注意：登录限流是每分钟 5 次，别反复跑 --login。
"""
import argparse
import pathlib
import sys

from playwright.sync_api import sync_playwright

BASE = "http://localhost:5173"
OUT = pathlib.Path(__file__).resolve().parent.parent / "shots"

PAGES = [
    ("learn", "/#/pages/learn/learn"),
    ("wrongbook", "/#/pages/wrongbook/wrongbook"),
    ("profile", "/#/pages/profile/profile"),
    ("login", "/#/pages/login/login"),
]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--login", action="store_true", help="走一遍登录流程")
    ap.add_argument("--user", default="xiaoming")
    ap.add_argument("--password", default="hanyu123")
    args = ap.parse_args()

    OUT.mkdir(exist_ok=True)
    problems: list[str] = []

    with sync_playwright() as p:
        browser = p.chromium.launch()
        ctx = browser.new_context(viewport={"width": 390, "height": 844})
        page = ctx.new_page()

        page.on("console", lambda m: problems.append(f"[console.{m.type}] {m.text}")
                if m.type in ("error", "warning") else None)
        # Vue 渲染期错误只走 console.error，不走 pageerror —— 两个都要听
        page.on("pageerror", lambda e: problems.append(f"[pageerror] {e}"))

        for name, route in PAGES:
            page.goto(BASE + route, wait_until="networkidle")
            page.wait_for_timeout(700)
            page.screenshot(path=str(OUT / f"{name}.png"))
            body = page.inner_text("body").strip()
            print(f"--- {name} ---")
            print(body[:300].replace("\n", " / "))
            if not body:
                problems.append(f"[空页] {name} 渲染出来是空的")
            # 横向溢出：手机上没有横向滚动条，溢出就是版式错了
            metrics = page.evaluate(
                "() => ({ sw: document.documentElement.scrollWidth,"
                " iw: window.innerWidth,"
                " vw: document.documentElement.clientWidth })"
            )
            if metrics["sw"] > metrics["iw"]:
                problems.append(
                    f"[横向溢出] {name}: scrollWidth={metrics['sw']} > innerWidth={metrics['iw']}")
            print(f"    宽 {metrics['sw']}/{metrics['iw']}")

        if args.login:
            print("--- 登录流程 ---")
            page.goto(BASE + "/#/pages/profile/profile", wait_until="networkidle")
            page.wait_for_timeout(500)
            page.get_by_text("登录 / 注册").click()
            page.wait_for_timeout(800)
            page.screenshot(path=str(OUT / "login-form.png"))
            inputs = page.locator("input")
            inputs.nth(0).fill(args.user)
            inputs.nth(1).fill(args.password)
            page.get_by_text("进去练").click()
            page.wait_for_timeout(2000)
            page.screenshot(path=str(OUT / "after-login.png"))
            print(page.inner_text("body")[:300].replace("\n", " / "))

        browser.close()

    print("\n=== 控制台 ===")
    if problems:
        for line in dict.fromkeys(problems):
            print(line)
        return 1
    print("干净：没有 console.error / warning / pageerror")
    return 0


if __name__ == "__main__":
    sys.exit(main())
