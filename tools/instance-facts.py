#!/usr/bin/env python3
"""Identify the Tencent Cloud instance type behind 175.178.81.168.

Why this matters: CVM opens ports in "安全组" (Security Group); Lighthouse
opens them in the instance's own "防火墙" (Firewall) tab. The console path is
completely different, so the guide must not guess.

Credentials are parsed out of the existing deploy.py, so the password is never
written into this file. Every command is READ-ONLY.
"""
import re

import paramiko

DEPLOY = r"D:\coding\Visible_Learning\deploy\deploy.py"

src = open(DEPLOY, encoding="utf-8").read()
HOST = re.search(r'^HOST\s*=\s*"([^"]+)"', src, re.M).group(1)
USER = re.search(r'^USER\s*=\s*"([^"]+)"', src, re.M).group(1)
PASS = re.search(r'^PASS\s*=\s*"([^"]+)"', src, re.M).group(1)

META = "http://metadata.tencentyun.com/latest/meta-data"

CMDS = [
    ("instance-id  (ins-=CVM, lhins-=Lighthouse)", f"curl -s -m 6 {META}/instance-id"),
    ("instance-name", f"curl -s -m 6 {META}/instance-name"),
    ("region / zone", f"curl -s -m 6 {META}/placement/region; echo; curl -s -m 6 {META}/placement/zone"),
    ("app-id (Lighthouse has one)", f"curl -s -m 6 {META}/app-id"),
    ("tencent agent dirs", "ls -1 /usr/local/qcloud/ 2>/dev/null"),
    ("lighthouse agent marker", "ls -d /usr/local/qcloud/lighthouse 2>/dev/null || echo NO_LIGHTHOUSE_AGENT"),
    ("lighthouse firewall helper", "ls -1 /usr/local/qcloud/lighthouse/ 2>/dev/null || echo NONE"),
    ("system product name", "sudo -n dmidecode -s system-product-name 2>/dev/null || echo NEED_PW"),
    ("system manufacturer", "sudo -n dmidecode -s system-manufacturer 2>/dev/null || echo NEED_PW"),
    ("iptables / nat rules", "sudo -n iptables -t nat -L PREROUTING -n 2>/dev/null | head -20 || echo NEED_PW"),
    ("network interfaces", "ip -4 -o addr show | awk '{print $2, $4}'"),
]

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
print(f"connecting to {HOST} as {USER} ...", flush=True)
ssh.connect(HOST, username=USER, password=PASS, timeout=20)
print("connected\n")

for title, cmd in CMDS:
    print("=" * 66)
    print(f"### {title}")
    print("=" * 66)
    try:
        _in, out, err = ssh.exec_command(cmd, timeout=30)
        o = out.read().decode("utf-8", "replace").strip()
        e = err.read().decode("utf-8", "replace").strip()
        print(o if o else "(empty)")
        if e:
            print("[stderr]", e[:400])
    except Exception as ex:  # noqa: BLE001
        print(f"[ERROR] {ex}")
    print()

ssh.close()
print("DONE")
