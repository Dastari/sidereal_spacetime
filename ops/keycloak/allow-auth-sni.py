"""Exact authorized auth hostname addition; preserves every existing SNI route."""
from pathlib import Path
import subprocess,time,os
p=Path('/etc/gema/haproxy/gema-web-sni.lst');old=p.read_bytes();domain=b'auth.dastari.net'
if domain in [line.strip() for line in old.splitlines()]:
 print('Auth SNI route already present');raise SystemExit()
backup=p.with_name(p.name+'.dastari-auth-before-'+str(int(time.time())));backup.write_bytes(old);backup.chmod(0o600)
# In-place update preserves Docker's single-file bind mount inode.
with p.open('ab') as f:f.write((b'' if old.endswith(b'\n') else b'\n')+domain+b'\n');f.flush();os.fsync(f.fileno())
try:
 subprocess.run(['docker','exec','gema-sni-edge','haproxy','-c','-f','/usr/local/etc/haproxy/haproxy.cfg'],check=True)
 subprocess.run(['docker','kill','--signal=USR2','gema-sni-edge'],check=True,stdout=subprocess.DEVNULL)
except Exception:
 p.write_bytes(old);raise
print('Added auth.dastari.net only; graceful master-worker reload; backup '+str(backup))
