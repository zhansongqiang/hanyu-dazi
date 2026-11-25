#!/usr/bin/env python3
"""Read-only inventory of the zj17z.cn host for planning purposes.

This is the SmartCampus production host: a live system a school depends on.
Every command here is READ-ONLY. No writes, no pm2 mutations, no reloads.

Auth is by the ed25519 key, exactly as scripts/sync-from-cloud.sh does it
(-i + IdentitiesOnly=yes), because this host runs fail2ban: offering several
keys in a row is what trips sshd MaxAuthTries and gets an IP blocked.
"""
import sys

import paramiko

# 不写死裸 IP：走域名解析（仓库公开，不留服务器地址清单）
HOST = "hanyu.zj17z.cn"
USER = "ubuntu"
KEY = r"C:\Users\Admin\.ssh\id_ed25519"

CMDS = [
    ("A. host", "hostname; uname -sr; head -2 /etc/os-release; uptime"),
    ("B. resources", "free -m; echo ---; df -h / /home | sed -n '1,4p'; echo ---; swapon --show || echo NO_SWAP"),
    ("C. pm2 list", "pm2 list 2>/dev/null || echo NO_PM2"),
    ("D. pm2 jlist", "pm2 jlist 2>/dev/null | head -c 2500"),
    ("E. listening ports", "ss -ltnp 2>/dev/null || netstat -ltnp 2>/dev/null"),
    ("F. home dirs", "ls -la /home/ubuntu/"),
    ("G. toolchain", "node -v; npm -v; echo pm2: $(which pm2); echo certbot: $(which certbot || echo NONE); echo tsx: $(which tsx || echo NONE)"),
    ("H. nginx sites-enabled", "ls -la /etc/nginx/sites-enabled/"),
    ("I. nginx sites-available", "ls -la /etc/nginx/sites-available/"),
    ("J. nginx server_name/listen", "grep -rn 'server_name\\|listen ' /etc/nginx/sites-enabled/ /etc/nginx/sites-available/ 2>/dev/null"),
    ("K. letsencrypt", "sudo -n ls -la /etc/letsencrypt/live/ 2>/dev/null || ls -la /etc/letsencrypt/live/ 2>/dev/null || echo NEED_SUDO"),
    ("L. cert renewal config", "sudo -n ls /etc/letsencrypt/renewal/ 2>/dev/null || echo NEED_SUDO"),
    ("M. nginx.conf includes", "grep -n 'include' /etc/nginx/nginx.conf"),
    ("N. nginx -t", "sudo -n nginx -t 2>&1 || echo NGINX_T_NEED_PW"),
    ("O. fail2ban", "sudo -n fail2ban-client status sshd 2>/dev/null | head -20 || echo NEED_SUDO_OR_ABSENT"),
    ("P. firewall", "sudo -n ufw status 2>/dev/null || echo UFW_NEED_PW; echo ---; sudo -n iptables -L INPUT -n 2>/dev/null | head -12 || echo IPT_NEED_PW"),
    ("Q. smartcampus size", "du -sh /home/ubuntu/smartcampus 2>/dev/null; du -sh /home/ubuntu/* 2>/dev/null | sort -h | tail -10"),
    ("R. other web roots", "ls -la /var/www/ 2>/dev/null | head"),
    ("S. mysql/pg/redis", "ss -ltn 2>/dev/null | grep -E ':3306|:5432|:6379|:27017' || echo NO_LOCAL_DB_SVC"),
    ("T. python", "python3 -V; which pip3 || echo NO_PIP3"),
    ("U. sudo -n check", "sudo -n true 2>&1 && echo PASSWORDLESS_SUDO_OK || echo SUDO_NEEDS_PASSWORD"),
    ("V. crontab", "crontab -l 2>/dev/null || echo NO_CRONTAB"),
]


def ascii_safe(text: str) -> str:
    return text.encode("ascii", "replace").decode("ascii")


key = paramiko.Ed25519Key.from_private_key_file(KEY)
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
print(f"connecting to {USER}@{HOST} with ed25519 key ...", flush=True)
ssh.connect(HOST, username=USER, pkey=key, timeout=20,
            look_for_keys=False, allow_agent=False)
print("connected\n")

for title, cmd in CMDS:
    print("=" * 68)
    print(f"### {title}")
    print("=" * 68)
    try:
        _in, out, err = ssh.exec_command(cmd, timeout=40)
        o = out.read().decode("utf-8", "replace").strip()
        e = err.read().decode("utf-8", "replace").strip()
        print(ascii_safe(o[:4000]) if o else "(empty)")
        if e:
            print("[stderr]", ascii_safe(e[:600]))
    except Exception as ex:  # noqa: BLE001
        print(f"[ERROR] {type(ex).__name__}: {ex}")
    print()

ssh.close()
print("DONE")
