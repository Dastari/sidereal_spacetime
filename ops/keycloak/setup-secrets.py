"""Runs only inside the dedicated marked provider CT; never prints secrets."""
from pathlib import Path
import secrets,subprocess,os
p=Path('/etc/keycloak/service.env')
if not p.exists():
 db=secrets.token_urlsafe(36);admin=secrets.token_urlsafe(36)
 # Generated URL-safe values have no quotes/newlines; pass SQL via stdin, never argv.
 sql=f"CREATE ROLE keycloak WITH LOGIN PASSWORD '{db}';\nCREATE DATABASE keycloak OWNER keycloak;\n"
 subprocess.run(['runuser','-u','postgres','--','psql','-v','ON_ERROR_STOP=1'],input=sql,text=True,check=True,stdout=subprocess.DEVNULL)
 p.write_text('\n'.join(['KC_DB=postgres','KC_DB_URL=jdbc:postgresql://127.0.0.1:5432/keycloak','KC_DB_USERNAME=keycloak','KC_DB_PASSWORD='+db,'KC_HOSTNAME=https://auth.dastari.net','KC_HOSTNAME_STRICT=true','KC_HTTP_ENABLED=true','KC_HTTP_PORT=8080','KC_PROXY_HEADERS=xforwarded','KC_PROXY_TRUSTED_ADDRESSES=10.0.1.248/32','KC_BOOTSTRAP_ADMIN_USERNAME=dastari-bootstrap','KC_BOOTSTRAP_ADMIN_PASSWORD='+admin,'JAVA_OPTS_KC_HEAP=-Xms256m -Xmx1536m'])+'\n')
 p.chmod(0o640);import grp;os.chown(p,0,grp.getgrnam('keycloak').gr_gid)
 private=Path('/root/dastari-keycloak/bootstrap-admin.json');private.write_text(__import__('json').dumps({'username':'dastari-bootstrap','password':admin}));private.chmod(0o600)
Path('/opt/keycloak/data/import').mkdir(parents=True,exist_ok=True)
