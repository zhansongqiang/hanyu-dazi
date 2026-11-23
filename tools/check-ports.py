#!/usr/bin/env python3
"""Probe the target host from the outside to see which ports actually reach it.

Run this from your own machine (NOT from the server). It answers a question the
server itself cannot answer completely: what does the Tencent Cloud security
group allow in?

How to read the three outcomes:

  OPEN      TCP handshake completed -> a service is listening AND BOTH the
            security group and ufw allow the port.
  REFUSED   The packet reached the host but nothing is listening -> the
            firewalls ALREADY allow this port.
  TIMEOUT   The packet was silently dropped -> a firewall (or the security
            group) does NOT allow this port. Tencent denies by dropping, not
            by rejecting, so a timeout is the signature of a missing rule.

Why this matters for THIS host (114.132.232.60 / zj17z.cn): ufw is active and
allows only 22, 80, 443. The plan deliberately avoids opening anything else,
so the expected reading is:

  22, 80, 443                 OPEN
  8080, 8082, 8091, 3306      TIMEOUT   <- correct; these must stay shut

8080/8082 are the SmartCampus apps, 8091 is ours (reached only via nginx on
loopback), 3306 is a database. None of them should ever be reachable from the
public internet.

Usage:  python check-ports.py [port ...]
"""
import socket
import sys

HOST = "114.132.232.60"
DEFAULT_PORTS = [22, 80, 443, 8080, 8082, 8091, 3306]
TIMEOUT = 5.0


def classify(port: int) -> str:
    s = socket.socket()
    s.settimeout(TIMEOUT)
    try:
        s.connect((HOST, port))
        return "OPEN     service listening + security group allows"
    except socket.timeout:
        return "TIMEOUT  dropped -> security group does NOT allow this port"
    except ConnectionRefusedError:
        return "REFUSED  reached host, nothing listening -> group already allows"
    except OSError as exc:
        return f"ERROR    {type(exc).__name__}: {exc}"
    finally:
        s.close()


def main() -> None:
    ports = [int(a) for a in sys.argv[1:]] or DEFAULT_PORTS
    print(f"probing {HOST} from this machine, timeout={TIMEOUT}s each\n")
    for p in ports:
        print(f"  {p:>5}   {classify(p)}")
    print()


if __name__ == "__main__":
    main()
