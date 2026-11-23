#!/usr/bin/env python3
"""Read-only inventory of 175.178.81.168 for planning purposes.

Credentials are parsed from the existing deploy.py so the password is never
written to a new file. Every command here is READ-ONLY: no writes, no pm2
mutations, no service restarts, no rm.
"""
import re
import sys

import paramiko

DEPLOY = r"D:\coding\Visible_Learning\deploy\deploy.py"

src = open(DEPLOY, encoding="utf-8").read()
HOST = re.search(r'^HOST\s*=\s*"([^"]+)"', src, re.M).group(1)
USER = re.search(r'^USER\s*=\s*"([^"]+)"', src, re.M).group(1)
PASS = re.search(r'^PASS\s*=\s*"([^"]+)"', src, re.M).group(1)

CMDS = [
    ("A. host", "hostname; uname -a; cat /etc/os-release | head -3"),
    ("B. disk", "df -h / /home 2>/dev/null; echo ---; free -m"),
    ("C. pm2", "pm2 list 2>/dev/null || echo NO_PM2"),
    ("D. pm2 detail", "pm2 jlist 2>/dev/null | head -c 1500"),
    ("E. home dirs", "ls -la /home/ubuntu/"),
    ("F. listening ports", "ss -ltnp 2>/dev/null || netstat -ltnp 2>/dev/null"),
    ("G. node toolchain", "node -v; npm -v; which pm2; which tsx; which certbot || echo NO_CERTBOT"),
    ("H. nginx server_names", "grep -rn 'server_name\\|listen ' /etc/nginx/sites-enabled/ /etc/nginx/sites-available/ 2>/dev/null"),
    ("I. nginx vhosts enabled", "ls -la /etc/nginx/sites-enabled/"),
    ("J. letsencrypt", "sudo -n ls /etc/letsencrypt/live/ 2>/dev/null || echo NO_LETSENCRYPT"),
    ("K. ufw", "sudo -n ufw status 2>/dev/null || echo UFW_NEED_PW"),
    ("L. visible_learning tree", "ls -la /home/ubuntu/visible_learning/ 2>/dev/null; echo ---; ls /home/ubuntu/visible_learning/data/ 2>/dev/null"),
    ("M. vl app size", "du -sh /home/ubuntu/visible_learning 2>/dev/null; du -sh /home/ubuntu/* 2>/dev/null | sort -h | tail -8"),
    ("N. nginx conf test", "sudo -n nginx -t 2>&1 || echo NGINX_T_NEED_PW"),
    ("O. nginx version", "nginx -v 2>&1"),
    ("P. who else runs here", "ls -la /var/www/ 2>/dev/null | head -20"),
    ("Q. mysql/pg/redis", "ss -ltn 2>/dev/null | grep -E ':3306|:5432|:6379|:27017' || echo NO_LOCAL_DB_SVC"),
    ("R. crontab", "crontab -l 2>/dev/null || echo NO_CRONTAB"),
    ("S. free mem", "free -m; echo ---; uptime"),
    ("T. python/pip", "python3 -V; which pip3"),
    ("U. swap", "swapon --show 2>/dev/null || echo NO_SWAP"),
    ("V. nginx access log tail", "sudo -n tail -3 /var/log/nginx/access.log 2>/dev/null || echo LOG_NEED_PW"),
]

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
print(f"connecting to {HOST} as {USER} ...", flush=True)
ssh.connect(HOST, username=USER, password=PASS, timeout=20)
print("connected\n")

for title, cmd in CMDS:
    print("=" * 68)
    print(f"### {title}")
    print("=" * 68)
    try:
        _in, out, err = ssh.exec_command(cmd, timeout=40)
        o = out.read().decode("utf-8", "replace").strip()
        e = err.read().decode("utf-8", "replace").strip()
        if o:
            print(o[:4000])
        if e:
            print("[stderr]", e[:600])
        if not o and not e:
            print("(empty)")
    except Exception as ex:  # noqa: BLE001
        print(f"[ERROR] {ex}")
    print()

ssh.close()
print("DONE")
