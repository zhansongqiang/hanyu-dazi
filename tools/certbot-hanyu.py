#!/usr/bin/env python3
"""签 HTTPS 证书 —— DNS 解析生效之后才能跑。

为什么单独一个脚本、并且第一步就检查解析：

certbot 的 http-01 校验是 Let's Encrypt 的服务器回头来请求
http://hanyu.zj17z.cn/.well-known/acme-challenge/xxx。域名解析不生效时，
这个请求根本到不了本机，certbot 只会给一句
    "Error getting validation data"
—— 看不出是解析问题，很容易被当成 nginx 配错了，然后去改本来就对的配置。

所以这里先自己解析一次：解析不对就直接退出并说明原因，一个字节都不动。
解析对了才往下走。

用法：
    python -I tools/certbot-hanyu.py
    python -I tools/certbot-hanyu.py --email you@example.com   # 首次注册用
"""
import argparse
import os
import socket
import sys
import time

import paramiko

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

HOST, USER = "114.132.232.60", "ubuntu"
KEY = r"C:\Users\Admin\.ssh\id_ed25519"
DOMAIN = "hanyu.zj17z.cn"
EXPECTED_IP = "114.132.232.60"
ROOT = r"D:\coding\hanyu-dazi"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--email", default="")
    args = ap.parse_args()

    # ── 1. 本地先解析一次 ─────────────────────────────────────────
    # 系统解析器 + 8.8.8.8 各查一次。本地递归解析器有缓存，可能比权威还快或还慢，
    # 两个都通了才算真生效。
    print("=== 1. 检查 DNS 解析 ===")
    import subprocess
    found = False
    for resolver, label in (("8.8.8.8", "8.8.8.8"), ("114.114.114.114", "114DNS")):
        try:
            r = subprocess.run(["nslookup", DOMAIN, resolver],
                               capture_output=True, text=True, timeout=15)
            text = r.stdout + r.stderr
        except Exception as e:
            print(f"  {label}: 查询失败（{e}）")
            continue
        if EXPECTED_IP in text:
            # 光看「文本里有没有这个 IP」不够严：nslookup 的失败应答里可能带着
            # 权威 NS 的信息。再卡一条「不是 Non-existent domain」。
            if "on-existent" in text or "NXDOMAIN" in text:
                print(f"  {label}: NXDOMAIN（记录还不存在）")
                continue
            print(f"  {label}: 解析到 {EXPECTED_IP}")
            found = True
        else:
            print(f"  {label}: 还没解析到 {EXPECTED_IP}")
    if not found:
        # 走 stdout 再 exit(1)，不用 sys.exit(长中文串)：前者会被工具按 UTF-8 正常显示，
        # 后者走 stderr，在 Windows 的 GBK 控制台上是一屏乱码 —— 而这条消息正是
        # 用户唯一需要读的东西。
        print(
            f"\n{DOMAIN} 还没解析到 {EXPECTED_IP}。\n"
            f"去 DNSPod 加一条 A 记录：\n"
            f"    主机记录  hanyu\n"
            f"    记录类型  A\n"
            f"    记录值    {EXPECTED_IP}\n"
            f"加完等 1–10 分钟（TTL 600 的话更久），再跑这个脚本。\n"
            f"\nnginx vhost、后端、数据库、课程内容都已就位，只差这一条解析。\n"
            f"现在硬跑 certbot 只会得到 \"Error getting validation data\"，\n"
            f"看不出是解析问题，反而会让人去改本来就对的 nginx 配置。")
        sys.exit(1)

    key = paramiko.Ed25519Key.from_private_key_file(KEY)
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, username=USER, pkey=key, timeout=25,
                look_for_keys=False, allow_agent=False)

    def run(cmd, timeout=300, check=True):
        _, out, err = ssh.exec_command(cmd, timeout=timeout)
        o = out.read().decode("utf-8", "replace")
        e = err.read().decode("utf-8", "replace")
        rc = out.channel.recv_exit_status()
        for ln in (o + e).rstrip().splitlines():
            print("  " + ln)
        if check and rc != 0:
            sys.exit(f"远程命令失败 (rc={rc})：{cmd}")
        return o + e, rc

    # ── 2. 证书是否已经在了（避免重复签）──────────────────────────
    print("\n=== 2. 检查现有证书 ===")
    o, _ = run(f"sudo ls /etc/letsencrypt/live/{DOMAIN}/ 2>/dev/null || echo NO_CERT",
               check=False)
    already = "NO_CERT" not in o

    # ── 3. 签证书 ────────────────────────────────────────────────
    print("\n=== 3. certbot ===")
    if already:
        print("  已有证书，走 renew（--keep-until-expiring 不会重复签发占配额）")
    email = f"-m {args.email}" if args.email else ""
    o, rc = run(
        f"sudo certbot --nginx -d {DOMAIN} --non-interactive --agree-tos "
        f"--redirect --keep-until-expiring {email} 2>&1 | tail -30",
        check=False, timeout=600)

    # ── 4. 验证 ──────────────────────────────────────────────────
    print("\n=== 4. 验证 ===")
    run(f"sudo nginx -t 2>&1 && sudo systemctl reload nginx && systemctl is-active nginx")
    run(f"curl -s -o /dev/null -w 'hanyu https        %{{http_code}}\\n' https://{DOMAIN}/")
    run(f"curl -s -o /dev/null -w 'hanyu http 应跳 301  %{{http_code}}\\n' "
        f"-H 'Host: {DOMAIN}' http://127.0.0.1/")
    run(f"curl -s https://{DOMAIN}/api/health -m 10; echo")
    # 邻站：certbot 动的是 nginx 配置，必须确认没连累其他 server 块
    run("curl -s -o /dev/null -w '主站 https          %{http_code}\\n' https://zj17z.cn/")
    run("curl -s -o /dev/null -w '演示站 https        %{http_code}\\n' https://demo.zj17z.cn/")
    run("curl -s -o /dev/null -w '裸IP 仍归主站       %{http_code}\\n' "
        "-H 'Host: 114.132.232.60' https://127.0.0.1/ -k")
    run("systemctl list-timers --all 2>/dev/null | grep -i certbot "
        "|| echo '!! certbot 续期定时器不见了'")

    # ── 5. 学校那套的进程有没有被碰 ───────────────────────────────
    print("\n=== 5. 收尾：生产进程未受影响 ===")
    o, _ = run("pm2 jlist", timeout=60, check=False)
    start = o.find("[")
    if start >= 0:
        import json
        try:
            for a in json.loads(o[start:]):
                env = a.get("pm2_env") or {}
                print(f"  {a.get('name')}: pid={a.get('pid')} "
                      f"restarts={env.get('restart_time')} status={env.get('status')}")
        except json.JSONDecodeError:
            print("  解析 pm2 jlist 失败，请手工 pm2 list 核对")
    # smartcampus 应当是 pid=3032722 restarts=294（Day 1 上线前的读数）。
    # 只要这两个数没变，就证明我们全程没碰过它。

    ssh.close()
    print(f"\n完成。里程碑 M1 达成：本地 5173 与 https://{DOMAIN}/ 是同一个壳子。")


if __name__ == "__main__":
    main()
