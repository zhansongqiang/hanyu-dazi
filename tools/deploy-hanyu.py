#!/usr/bin/env python3
"""Deploy hanyu-dazi to 114.132.232.60 -- the host that runs the school's
SmartCampus production system.

Read this before changing anything here.

The whole design of this script is "add only". It touches exactly these names:

    /home/ubuntu/hanyu-dazi/            our own tree, inside nobody else's
    PM2 app  hanyu-dazi                 (never `pm2 delete all`, `stop all`,
                                         `kill`, or `flush` -- those would hit
                                         smartcampus and smartcampus-demo)
    nginx    sites-available/hanyu-dazi
             sites-enabled/zz-hanyu-dazi   (the zz- prefix is load-bearing:
             sites-enabled is included in alphabetical order, and the first
             server block on a listen is the fallback for unmatched Host
             headers. `hanyu-dazi` sorts BEFORE `smartcampus`, so linking it
             under its own name would steal the bare-IP fallback from the
             live site. `zz-hanyu-dazi` sorts after everything.)
    port     8091, bound to 127.0.0.1 only

The build happens locally; the server only runs `npm install` + `tsc`. That is
not tidiness: this box has 3.4 GB RAM, no swap, and ~1.1 GB of live production
traffic. A server-side vite build is how you OOM somebody else's school system.

Credentials: the JWT secret is generated here and written straight to the
server's ecosystem.config.js over SFTP. It is never written to a local file and
never printed. Do not add it to a template in this repo.

Usage:
    python -I tools/deploy-hanyu.py              # backend + web + nginx + pm2
    python -I tools/deploy-hanyu.py --no-nginx   # skip the vhost step
    python -I tools/deploy-hanyu.py --certbot    # also run certbot (needs DNS)
"""
import argparse
import json
import os
import re
import secrets
import sys
import tarfile
import time

import paramiko

# Windows 控制台默认 GBK，而远端输出里有 ↺（PM2 的重启次数列）、⚠ 这类字符。
# 不换编码的话，脚本会在打印 PM2 表格那一刻 UnicodeEncodeError 直接崩掉 ——
# 而崩溃点恰好是「已经启动了、还没 pm2 save」的中间态，最难收拾。
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

HOST, USER = "114.132.232.60", "ubuntu"
KEY = r"C:\Users\Admin\.ssh\id_ed25519"
ROOT = r"D:\coding\hanyu-dazi"
REMOTE = "/home/ubuntu/hanyu-dazi"
DOMAIN = "hanyu.zj17z.cn"
PORT = 8091

report = []


def say(line=""):
    print(line, flush=True)
    report.append(line)


def local_tar(out_path, base, members):
    """tar the given members with `base` as cwd, no wrapping top-level dir.

    Deliberately NOT `tar dist/` + `--strip-components=1`: that turns
    dist/index.html into ./index.html and is the classic way to deploy a web
    root that 403s. Taring `.` and extracting into the target dir cannot go
    wrong that way.
    """
    with tarfile.open(out_path, "w:gz") as tf:
        for m in members:
            tf.add(os.path.join(base, m), arcname=m)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--no-nginx", action="store_true")
    ap.add_argument("--certbot", action="store_true")
    ap.add_argument("--skip-build", action="store_true")
    args = ap.parse_args()

    server_dir = os.path.join(ROOT, "server")
    h5_dir = os.path.join(ROOT, "mobile", "dist", "build", "h5")

    if not args.skip_build:
        if not os.path.isdir(h5_dir):
            sys.exit(f"前端产物不存在：{h5_dir}\n先跑 cd mobile && npx uni build")
    for need in ("src", "content", "package.json", "tsconfig.json"):
        p = os.path.join(server_dir, need)
        if not os.path.exists(p):
            sys.exit(f"缺文件：{p}")

    backend_tar = os.path.join(ROOT, "shots", "_hanyu-backend.tar.gz")
    web_tar = os.path.join(ROOT, "shots", "_hanyu-web.tar.gz")
    # scripts/ 也要传：内容导入器在那边，服务器上用 tsx 直接跑源码。
    # 它不在 tsconfig 的 include 里（rootDir 是 ./src），所以 tsc 不会管它，
    # 但 tsx 会自己解析 —— 前提是文件确实在服务器上。
    local_tar(backend_tar, server_dir,
              ["src", "scripts", "content", "package.json",
               "package-lock.json", "tsconfig.json"])
    local_tar(web_tar, h5_dir, ["."])
    say(f"本地打包：后端 {os.path.getsize(backend_tar)//1024} KB，"
        f"前端 {os.path.getsize(web_tar)//1024} KB")

    key = paramiko.Ed25519Key.from_private_key_file(KEY)
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, username=USER, pkey=key, timeout=25,
                look_for_keys=False, allow_agent=False)
    say("已连接 " + HOST)

    def run(cmd, timeout=600, check=True, quiet=False):
        _, out, err = ssh.exec_command(cmd, timeout=timeout)
        o = out.read().decode("utf-8", "replace")
        e = err.read().decode("utf-8", "replace")
        rc = out.channel.recv_exit_status()
        if not quiet:
            for ln in o.rstrip().splitlines():
                say("  " + ln)
            for ln in e.rstrip().splitlines():
                say("  [err] " + ln)
        if check and rc != 0:
            sys.exit(f"远程命令失败 (rc={rc})：{cmd}")
        return o, e, rc

    # ── 0. 基线快照：证明我们没碰学校那套 ────────────────────────────
    def pm2_snapshot():
        """name -> (pid, restarts) for every app PM2 knows about.

        Parsed here rather than with a remote `python3 -c`: that one-liner needs
        three levels of quoting to survive ssh, and getting it wrong fails
        silently into an empty baseline -- which is the one thing this check
        must not do.
        """
        o, _, _ = run("pm2 jlist", quiet=True, check=False)
        start = o.find("[")
        snap = {}
        if start >= 0:
            try:
                for a in json.loads(o[start:]):
                    snap[a.get("name")] = (a.get("pid"),
                                           (a.get("pm2_env") or {}).get("restart_time"))
            except json.JSONDecodeError:
                return None
        return snap

    say("\n=== 0. 上线前基线（学校那套的 pid 与重启次数）===")
    baseline = pm2_snapshot()
    if baseline is None:
        sys.exit("拿不到 pm2 jlist 的基线快照，停下来 —— 没有基线就无法证明没影响生产。")
    for name, (pid, rs) in baseline.items():
        say(f"  {name}: pid={pid} restarts={rs}")

    # ── 1. 目录 ────────────────────────────────────────────────────
    say("\n=== 1. 建目录 ===")
    # 逐个列路径，不用 {a,b} 花括号展开：ssh 执行命令未必过 bash
    run(f"mkdir -p {REMOTE}/server/src {REMOTE}/server/content "
        f"{REMOTE}/server/data {REMOTE}/server/uploads "
        f"{REMOTE}/server/logs {REMOTE}/web/dist")

    # ── 2. 上传 ────────────────────────────────────────────────────
    say("\n=== 2. 上传构建产物 ===")
    sftp = ssh.open_sftp()
    sftp.put(backend_tar, "/tmp/hanyu-backend.tar.gz")
    sftp.put(web_tar, "/tmp/hanyu-web.tar.gz")
    say("  上传完成")
    # 后端：src/ 与 content/ 直接覆盖（源码是唯一来源）
    run(f"cd {REMOTE}/server && tar -xzf /tmp/hanyu-backend.tar.gz")
    # 前端：先清空再解，避免旧 hash 资源残留；dist 里没有需要保留的东西
    run(f"rm -rf {REMOTE}/web/dist && mkdir -p {REMOTE}/web/dist "
        f"&& cd {REMOTE}/web/dist && tar -xzf /tmp/hanyu-web.tar.gz")
    run(f"ls -la {REMOTE}/web/dist/")

    # ── 3. npm install + tsc ──────────────────────────────────────
    say("\n=== 3. 装依赖并编译 ===")
    # 一次装全（含 devDependencies）。typescript 与 tsx 都在 devDependencies 里：
    # tsc 要编译 dist，tsx 要跑一次性内容导入（scripts/ 不在 tsconfig 的 include 里，
    # 所以 tsc 不管它）。两个都是纯 JS 包，装上不影响内存。
    run(f"cd {REMOTE}/server && npm install --no-audit --no-fund 2>&1 | tail -8",
        timeout=900)
    # 先删 dist 再编译：本地若删过某个迁移文件，服务器上那份旧的 .js 会留在
    # dist/migrations 里继续被 knex 执行 —— 删掉的迁移还在跑，最难查。
    run(f"rm -rf {REMOTE}/server/dist")
    run(f"cd {REMOTE}/server && npx tsc 2>&1 | tail -20")
    run(f"ls {REMOTE}/server/dist/migrations/")

    # ── 4. ecosystem.config.js（env 全在这里，不依赖 .env）────────
    say("\n=== 4. 写 ecosystem.config.js ===")
    # 密钥只在「服务器上还没有」时生成。重复部署若换了密钥，所有已发出去的 token
    # 立刻失效 —— 用户表现为「莫名其妙被登出」，而且只在部署后出现，极难联想到。
    existing = ""
    try:
        with sftp.open(f"{REMOTE}/server/ecosystem.config.js", "r") as f:
            existing = f.read().decode("utf-8", "replace")
    except IOError:
        pass
    m = re.search(r"JWT_SECRET:\s*'([0-9a-f]{32,})'", existing)
    if m:
        jwt_secret = m.group(1)
        say("  沿用服务器上已有的 JWT 密钥（重复部署不换密钥）")
    else:
        jwt_secret = secrets.token_hex(48)
        say("  首次部署，新生成 JWT 密钥（未落到本地任何文件）")
    eco = f"""// 由 tools/deploy-hanyu.py 生成。环境变量全部写在 env 字段里：
// PM2 的 cwd 不一定是项目根，靠 .env 会在重启后丢变量。
module.exports = {{
  apps: [
    {{
      name: 'hanyu-dazi',
      cwd: '{REMOTE}/server',
      script: 'dist/index.js',
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      max_memory_restart: '300M',
      // 日志写进项目自己的 logs/，不落 ~/.pm2/logs/ ——
      // 那边是学校那套的日志目录，flush 一次会连人家的一起清。
      out_file: '{REMOTE}/server/logs/out.log',
      error_file: '{REMOTE}/server/logs/err.log',
      merge_logs: true,
      time: true,
      env: {{
        NODE_ENV: 'production',
        PORT: '{PORT}',
        HOST: '127.0.0.1',
        DB_CLIENT: 'sqlite3',
        DB_FILENAME: './data/hanyu-dazi.db',
        JWT_SECRET: '{jwt_secret}',
        JWT_EXPIRES_IN: '30d',
        XP_PER_CORRECT: '10',
        XP_PER_WRONG: '2',
        XP_PER_LESSON: '20',
        RECORDING_MAX_MS: '60000',
        RECORDING_MAX_BYTES: '2097152',
        UPLOAD_DIR: './uploads',
      }},
    }},
  ],
}}
"""
    with sftp.open(f"{REMOTE}/server/ecosystem.config.js", "w") as f:
        f.write(eco)
    sftp.chmod(f"{REMOTE}/server/ecosystem.config.js", 0o600)
    say("  已写入（JWT 密钥随机生成，未落到本地任何文件）")

    # ── 5. 起 PM2（首次启动会自动跑迁移建库）────────────────────────
    say("\n=== 5. 起 PM2（首次启动会自动跑迁移建库）===")
    # startOrReload 一箭双雕：首次部署是 start，重复部署是 reload。
    # 用 `pm2 start` 的话第二次部署会报「script already launched」而卡住。
    # --only 是硬保险：ecosystem 里只有 hanyu-dazi 一个 app，但万一以后有人
    # 往这个文件里加了别的，--only 保证这条命令只碰我们自己的名字。
    run(f"cd {REMOTE}/server && pm2 startOrReload ecosystem.config.js "
        f"--only hanyu-dazi --update-env")
    run("pm2 save")
    time.sleep(10)
    run(f"pm2 describe hanyu-dazi | grep -E 'status|restarts|uptime|exec cwd'")
    run(f"tail -30 {REMOTE}/server/logs/out.log 2>/dev/null || echo '(还没有 out.log)'")
    run(f"tail -30 {REMOTE}/server/logs/err.log 2>/dev/null || echo '(还没有 err.log)'")

    # ── 6. 健康检查（非登录接口，省下登录限流配额）────────────────
    say("\n=== 6. 服务器内部健康检查 ===")
    run(f"curl -s -m 10 http://127.0.0.1:{PORT}/api/health; echo")
    run(f"ss -ltn | grep ':{PORT}' || echo '没有监听 {PORT}'")

    # ── 7. 导入课程内容 ───────────────────────────────────────────
    say("\n=== 7. 导入 content.json ===")
    run(f"cd {REMOTE}/server && npx tsx scripts/import-content.ts 2>&1 | tail -30",
        check=False, timeout=300)
    run(f"cd {REMOTE}/server && npx tsx scripts/content-audit.ts 2>&1 | tail -25",
        check=False, timeout=300)

    # ── 8. nginx ──────────────────────────────────────────────────
    if not args.no_nginx:
        say("\n=== 8. nginx vhost ===")
        sftp.put(os.path.join(ROOT, "deploy", "nginx-hanyu-dazi.conf"),
                 "/tmp/hanyu-dazi.conf")
        run("sudo cp /tmp/hanyu-dazi.conf /etc/nginx/sites-available/hanyu-dazi")
        # zz- 前缀：让它在 sites-enabled 里排在最后，不抢裸 IP 的兜底块
        run("sudo ln -sfn /etc/nginx/sites-available/hanyu-dazi "
            "/etc/nginx/sites-enabled/zz-hanyu-dazi")
        run("ls -la /etc/nginx/sites-enabled/")
        _, err, rc = run("sudo nginx -t 2>&1", quiet=False, check=False)
        if rc != 0 or "successful" not in (err + _):
            say("  nginx -t 没过，不 reload。现有站点未受影响。")
        else:
            run("sudo systemctl reload nginx")
            run("systemctl is-active nginx")
            say("  用 Host 头直接验证路由（DNS 生效前也能测）：")
            run(f"curl -s -o /dev/null -w 'hanyu  %{{http_code}}\\n' "
                f"-H 'Host: {DOMAIN}' http://127.0.0.1/")
            run(f"curl -s -H 'Host: {DOMAIN}' http://127.0.0.1/api/health; echo")
            run("curl -s -o /dev/null -w 'zj17z  %{http_code}\\n' "
                "-H 'Host: zj17z.cn' http://127.0.0.1/")
            run("curl -s -o /dev/null -w 'demo   %{http_code}\\n' "
                "-H 'Host: demo.zj17z.cn' http://127.0.0.1/")

    # ── 9. certbot ────────────────────────────────────────────────
    if args.certbot:
        say("\n=== 9. certbot 签证书 ===")
        _, err, rc = run(f"sudo certbot --nginx -d {DOMAIN} --non-interactive "
                         f"--agree-tos --redirect --keep-until-expiring 2>&1 | tail -25",
                         check=False, timeout=300)
        if rc == 0:
            run(f"curl -s -o /dev/null -w '%{{http_code}}\\n' https://{DOMAIN}/")
        else:
            say("  certbot 没成功 —— 最常见原因就是 DNS 还没解析。")

    # ── 10. 收尾比对 ──────────────────────────────────────────────
    say("\n=== 10. 收尾：确认学校那套没被影响 ===")
    after = pm2_snapshot()
    if after is None:
        say("  !! 拿不到收尾快照，请手工核对 pm2 list")
    else:
        for name, (pid, rs) in after.items():
            say(f"  {name}: pid={pid} restarts={rs}")
        for name, was in baseline.items():
            if name not in after:
                say(f"  !! {name} 不见了！上线前还在的。")
            elif after[name] == was:
                say(f"  ok {name} 未变（pid={was[0]}, restarts={was[1]}）")
            else:
                say(f"  !! {name} 变了：{was} -> {after[name]}")

    sftp.close()
    ssh.close()

    with open(os.path.join(ROOT, "shots", "deploy-report.txt"), "w",
              encoding="utf-8") as f:
        f.write("\n".join(report))
    print("\n报告已写入 shots/deploy-report.txt")


if __name__ == "__main__":
    main()
