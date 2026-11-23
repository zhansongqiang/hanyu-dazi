#!/usr/bin/env python3
"""Read-only: print the SmartCampus-demo vhost, which is the template for ours.

We do NOT reuse the demo site; we copy its file and change server_name + root.
Reading it first is how we avoid guessing at a config that already works on
this exact machine.

One SSH connection, ed25519 key, IdentitiesOnly=yes -- this host runs fail2ban
and offering several keys in a row is what trips sshd MaxAuthTries.
"""
import sys

import paramiko

HOST, USER = "114.132.232.60", "ubuntu"
KEY = r"C:\Users\Admin\.ssh\id_ed25519"
OUT = r"D:\coding\hanyu-dazi\shots\demo-vhost.txt"

# Windows 控制台是 GBK，vhost 里有 ⚠ 这类字符，直接 print 会 UnicodeEncodeError。
# 写文件（UTF-8）再用 Read 看，比跟终端编码较劲可靠。
buf = []

CMDS = [
    ("demo vhost", "cat /etc/nginx/sites-available/smartcampus-demo"),
    ("sudo check", "sudo -n true 2>&1 && echo PASSWORDLESS_SUDO_OK || echo SUDO_NEEDS_PASSWORD"),
    ("hanyu-dazi exists?", "ls -la /home/ubuntu/hanyu-dazi 2>/dev/null || echo ABSENT"),
    ("8091 free?", "ss -ltn | grep ':8091' || echo PORT_8091_FREE"),
    ("certbot timers", "systemctl list-timers --all 2>/dev/null | grep -i certbot || echo NO_CERTBOT_TIMER"),
]

key = paramiko.Ed25519Key.from_private_key_file(KEY)
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username=USER, pkey=key, timeout=20,
            look_for_keys=False, allow_agent=False)

for title, cmd in CMDS:
    _, out, err = ssh.exec_command(cmd, timeout=30)
    body = out.read().decode("utf-8", "replace")
    errs = err.read().decode("utf-8", "replace")
    buf.append("=" * 70)
    buf.append(f"### {title}")
    buf.append("=" * 70)
    buf.append(body.rstrip())
    if errs.strip():
        buf.append("[stderr] " + errs.rstrip())
    buf.append("")

ssh.close()

with open(OUT, "w", encoding="utf-8") as f:
    f.write("\n".join(buf))
print(f"wrote {OUT}")
