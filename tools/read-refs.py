#!/usr/bin/env python3
"""Read the reference nginx vhosts on zj17z.cn so our new one can mirror them.

Read-only. The demo vhost is the template to copy: it is a second subdomain on
the same box, certbot-managed, and it does not disturb the main site.
"""
import paramiko

# 不写死裸 IP：走域名解析（仓库公开，不留服务器地址清单）
HOST = "hanyu.zj17z.cn"
USER = "ubuntu"
KEY = r"C:\Users\Admin\.ssh\id_ed25519"

CMDS = [
    ("1. LIVE main vhost: /etc/nginx/sites-enabled/smartcampus",
     "cat /etc/nginx/sites-enabled/smartcampus"),
    ("2. is sites-enabled/smartcampus a symlink?",
     "ls -la /etc/nginx/sites-enabled/; echo ---; readlink -f /etc/nginx/sites-enabled/smartcampus"),
    ("3. TEMPLATE: /etc/nginx/sites-available/smartcampus-demo",
     "cat /etc/nginx/sites-available/smartcampus-demo"),
    ("4. certbot renewal timer",
     "systemctl list-timers --all 2>/dev/null | grep -i certbot || echo NO_CERTBOT_TIMER"),
    ("5. certbot plugins",
     "certbot plugins 2>/dev/null | head -30 || echo CERTBOT_PLUGINS_FAILED"),
    ("6. cert for demo.zj17z.cn (names covered)",
     "sudo -n openssl x509 -in /etc/letsencrypt/live/demo.zj17z.cn/cert.pem -noout -subject -dates -ext subjectAltName"),
    ("7. cert for zj17z.cn (names covered)",
     "sudo -n openssl x509 -in /etc/letsencrypt/live/zj17z.cn/cert.pem -noout -subject -dates -ext subjectAltName"),
    ("8. is 8091 free? any node on 809x",
     "ss -ltn | grep -E ':809[0-9]' || echo NO_809x_LISTENER"),
    ("9. pm2 startup unit / save state",
     "systemctl is-enabled pm2-ubuntu 2>/dev/null || echo NO_PM2_UNIT"),
]


def ascii_safe(t: str) -> str:
    return t.encode("ascii", "replace").decode("ascii")


key = paramiko.Ed25519Key.from_private_key_file(KEY)
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username=USER, pkey=key, timeout=20,
            look_for_keys=False, allow_agent=False)
print("connected\n")

for title, cmd in CMDS:
    print("=" * 70)
    print(f"### {title}")
    print("=" * 70)
    try:
        _in, out, err = ssh.exec_command(cmd, timeout=40)
        o = out.read().decode("utf-8", "replace").strip()
        e = err.read().decode("utf-8", "replace").strip()
        print(ascii_safe(o[:6000]) if o else "(empty)")
        if e:
            print("[stderr]", ascii_safe(e[:500]))
    except Exception as ex:  # noqa: BLE001
        print(f"[ERROR] {type(ex).__name__}: {ex}")
    print()

ssh.close()
print("DONE")
