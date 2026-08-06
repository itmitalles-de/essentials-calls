#!/usr/bin/env python3
"""
Prüft, ob sich eine Extension per SIP registrieren kann — ohne Softphone.

Minimaler SIP-REGISTER mit MD5-Digest-Auth über rohes UDP, keine Abhängigkeiten.
Damit lässt sich trennen, ob ein Problem an der generierten Asterisk-Config
oder am Softphone liegt.

    python3 scripts/sip-register-test.py 101 alice123
    python3 scripts/sip-register-test.py 101 alice123 192.168.1.50

Exit-Code 0 = registriert (200 OK), sonst 1.
"""
import hashlib
import random
import socket
import sys

if len(sys.argv) < 3:
    print(__doc__)
    sys.exit(2)

USER, PASSWORD = sys.argv[1], sys.argv[2]
HOST = sys.argv[3] if len(sys.argv) > 3 else "127.0.0.1"
PORT = 5060

sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
sock.bind(("0.0.0.0", random.randint(20000, 30000)))
sock.settimeout(5)
local_port = sock.getsockname()[1]

# Ermittelt die IP, über die dieser Host den Asterisk erreicht.
probe = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
try:
    probe.connect((HOST, PORT))
    local_ip = probe.getsockname()[0]
finally:
    probe.close()

call_id = f"{random.randint(1, 10**9)}@visual-pbx-test"
branch = f"z9hG4bK{random.randint(1, 10**9)}"
tag = str(random.randint(1, 10**9))


def register(cseq, auth_header=None):
    lines = [
        f"REGISTER sip:{HOST} SIP/2.0",
        f"Via: SIP/2.0/UDP {local_ip}:{local_port};branch={branch}{cseq};rport",
        "Max-Forwards: 70",
        f"From: <sip:{USER}@{HOST}>;tag={tag}",
        f"To: <sip:{USER}@{HOST}>",
        f"Call-ID: {call_id}",
        f"CSeq: {cseq} REGISTER",
        f"Contact: <sip:{USER}@{local_ip}:{local_port}>",
        "Expires: 60",
        "User-Agent: visual-pbx-test",
    ]
    if auth_header:
        lines.append(auth_header)
    lines += ["Content-Length: 0", "", ""]
    sock.sendto("\r\n".join(lines).encode(), (HOST, PORT))
    return sock.recv(65535).decode(errors="replace")


def parse_challenge(resp):
    for line in resp.splitlines():
        if line.lower().startswith(("www-authenticate:", "proxy-authenticate:")):
            params = {}
            for part in line.split(":", 1)[1].replace("Digest ", "").split(","):
                if "=" in part:
                    k, v = part.split("=", 1)
                    params[k.strip()] = v.strip().strip('"')
            return params
    return None


def md5(s):
    return hashlib.md5(s.encode()).hexdigest()


try:
    resp = register(1)
except socket.timeout:
    print(f"FEHLER: keine Antwort von {HOST}:{PORT} — läuft der Asterisk-Container?")
    sys.exit(1)

print(f"1) REGISTER ohne Auth   -> {resp.splitlines()[0]}")

challenge = parse_challenge(resp)
if not challenge:
    print("FEHLER: keine Digest-Challenge erhalten.")
    print("   Meist heißt das: Asterisk findet keinen passenden Endpoint für diesen User.")
    print('   Prüfen mit: docker compose logs asterisk | grep "No matching endpoint"')
    sys.exit(1)

uri = f"sip:{HOST}"
ha1 = md5(f"{USER}:{challenge['realm']}:{PASSWORD}")
ha2 = md5(f"REGISTER:{uri}")
auth = (
    f'Authorization: Digest username="{USER}", realm="{challenge["realm"]}", '
    f'nonce="{challenge["nonce"]}", uri="{uri}", '
    f'response="{md5(f"{ha1}:{challenge["nonce"]}:{ha2}")}", algorithm=MD5'
)

resp = register(2, auth)
status = resp.splitlines()[0]
print(f"2) REGISTER mit Auth    -> {status}")

if "200 OK" in status:
    print(f"\nOK: {USER} ist registriert. Gegenprobe:")
    print('   docker compose exec asterisk asterisk -rx "pjsip show contacts"')
    sys.exit(0)

print("\nFEHLGESCHLAGEN: Passwort falsch, oder der Endpoint passt nicht zum SIP-User.")
sys.exit(1)
