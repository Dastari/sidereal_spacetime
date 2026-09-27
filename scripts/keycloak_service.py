"""Managed dedicated Proxmox provider; invoked exclusively by scripts/dev.py."""
from pathlib import Path
import json,subprocess,time,shlex,tomllib
ROOT=Path(__file__).resolve().parents[1]
HOST='root@10.0.1.253';CT=116;MARKER='dastari-auth-managed';REMOTE='/root/dastari-keycloak-provision'
def ssh(args,**kwargs):
 return subprocess.run(['ssh','-o','BatchMode=yes','-o','ConnectTimeout=10',HOST,shlex.join(args)],check=True,text=True,**kwargs)
def capture(args):return ssh(args,stdout=subprocess.PIPE).stdout
def owned():
 config=capture(['pct','config',str(CT)])
 if MARKER not in config or 'hostname: dastari-auth' not in config:raise RuntimeError('Refusing to manage an unowned container')
def realm():
 clients=[]
 for client,origin in [('sidereal-game','https://sidereal.tail7a58a6.ts.net:8444'),('sidereal-dashboard','https://sidereal.tail7a58a6.ts.net:8445')]:
  clients.append({'clientId':client,'name':client,'enabled':True,'protocol':'openid-connect','publicClient':True,'standardFlowEnabled':True,'implicitFlowEnabled':False,'directAccessGrantsEnabled':False,'serviceAccountsEnabled':False,'redirectUris':[origin+'/auth/callback'],'webOrigins':[origin],'attributes':{'pkce.code.challenge.method':'S256','post.logout.redirect.uris':origin+'/'},'defaultClientScopes':['web-origins','profile','email','roles'],'protocolMappers':[{'name':'explicit-audience','protocol':'openid-connect','protocolMapper':'oidc-audience-mapper','config':{'included.client.audience':client,'id.token.claim':'false','access.token.claim':'true'}}]})
 game=next(c for c in clients if c['clientId']=='sidereal-game')
 game['redirectUris'].append('https://sidereal.dastari.net/auth/callback')
 game['webOrigins'].append('https://sidereal.dastari.net')
 game['attributes']['post.logout.redirect.uris']+='##https://sidereal.dastari.net/'
 return {'realm':'dastari','displayName':'Dastari','enabled':True,'sslRequired':'all','registrationAllowed':True,'registrationEmailAsUsername':False,'loginWithEmailAllowed':True,'duplicateEmailsAllowed':False,'verifyEmail':False,'resetPasswordAllowed':False,'rememberMe':True,'bruteForceProtected':True,'failureFactor':5,'waitIncrementSeconds':60,'maxFailureWaitSeconds':900,'passwordPolicy':'length(12)','clients':clients,'accessTokenLifespan':300,'ssoSessionIdleTimeout':1800,'ssoSessionMaxLifespan':36000,'eventsEnabled':True,'eventsExpiration':604800}
def command(action):
 if action=='setup':
  # Never attach to or repurpose another workload's CT.
  exists=subprocess.run(['ssh','-o','BatchMode=yes',HOST,'test','-f',f'/etc/pve/lxc/{CT}.conf']).returncode==0
  if exists:owned()
  else:ssh(['pct','create',str(CT),'local:vztmpl/debian-13-standard_13.1-2_amd64.tar.zst','--hostname','dastari-auth','--description',MARKER,'--cores','2','--memory','4096','--swap','512','--rootfs','nvme_pool:32','--unprivileged','1','--net0','name=eth0,bridge=vmbr0,ip=dhcp,ip6=auto,firewall=1','--onboot','1'])
  owned();ssh(['mkdir','-p',REMOTE]);ssh(['chmod','700',REMOTE])
  source=ROOT/'ops/keycloak'
  private=ROOT/'.runtime/keycloak';private.mkdir(parents=True,exist_ok=True,mode=0o700);(private/'dastari-realm.json').write_text(json.dumps(realm(),indent=2))
  files=[source/'install.sh',source/'setup-secrets.py',source/'keycloak.service',private/'dastari-realm.json']
  for file in files:subprocess.run(['scp','-q',str(file),f'{HOST}:{REMOTE}/{file.name}'],check=True)
  status=capture(['pct','status',str(CT)])
  if 'running' not in status:ssh(['pct','start',str(CT)])
  for i in range(30):
   result=subprocess.run(['ssh','-o','BatchMode=yes',HOST,shlex.join(['pct','exec',str(CT),'--','getent','hosts','deb.debian.org'])],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
   if result.returncode==0:break
   time.sleep(1)
  ssh(['pct','exec',str(CT),'--','mkdir','-p','/root/dastari-keycloak'])
  ssh(['pct','exec',str(CT),'--','chmod','700','/root/dastari-keycloak'])
  for file in files:ssh(['pct','push',str(CT),f'{REMOTE}/{file.name}',f'/root/dastari-keycloak/{file.name}','--perms','0600'])
  ssh(['pct','exec',str(CT),'--','bash','/root/dastari-keycloak/install.sh'])
  print('Dedicated provider installed; realm import never overwrites existing accounts.');command('status')
 elif action in ['start','stop']:
  owned();ssh(['pct','exec',str(CT),'--','systemctl',action,'keycloak'])
 elif action=='repair-cache':
  owned()
  # Only the runtime cache is writable; do not loosen source/config permissions.
  ssh(['pct','exec',str(CT),'--','install','-d','-m','0750','-o','keycloak','-g','keycloak','/opt/keycloak/data/tmp'])
  print('Dedicated provider runtime cache directory repaired; no restart or account changes.')
 elif action=='status':
  owned();print(capture(['pct','status',str(CT)]).strip());print(capture(['pct','exec',str(CT),'--','hostname','-I']).strip());print(capture(['pct','exec',str(CT),'--','systemctl','is-active','keycloak']).strip());print('Issuer: https://auth.dastari.net/realms/dastari')
 elif action in ('development-review-account', 'development-review-grant', 'development-review-revoke'):
  owned();ssh(['mkdir','-p',REMOTE]);ssh(['chmod','700',REMOTE])
  source=ROOT/'ops/keycloak/development-review-account.py'
  subprocess.run(['scp','-q',str(source),f'{HOST}:{REMOTE}/{source.name}'],check=True)
  remote='/root/dastari-keycloak/'+source.name
  ssh(['pct','push',str(CT),f'{REMOTE}/{source.name}',remote,'--perms','0600'])
  operation='ensure' if action.endswith('-account') else action.rsplit('-',1)[1]
  ssh(['pct','exec',str(CT),'--','python3',remote,operation])
  if operation=='ensure':
   payload=capture(['pct','exec',str(CT),'--','cat','/root/dastari-keycloak/sidereal-development-review.json'])
   import os,tempfile
   directory=Path.home()/'.local/share/sidereal-review'
   directory.mkdir(parents=True,exist_ok=True,mode=0o700);directory.chmod(0o700)
   fd,tmp=tempfile.mkstemp(prefix='account-',dir=directory)
   with os.fdopen(fd,'w') as stream:stream.write(payload)
   destination=directory/'account.json'
   os.replace(tmp,destination);destination.chmod(0o600)
   print('Retained review credentials refreshed in private local account.json (0600); no values printed.')
 elif action == 'rotate-review-password':
  owned();ssh(['mkdir','-p',REMOTE]);ssh(['chmod','700',REMOTE])
  source=ROOT/'ops/keycloak/rotate-review-password.py'
  subprocess.run(['scp','-q',str(source),f'{HOST}:{REMOTE}/{source.name}'],check=True)
  remote='/root/dastari-keycloak/'+source.name
  ssh(['pct','push',str(CT),f'{REMOTE}/{source.name}',remote,'--perms','0600'])
  ssh(['pct','exec',str(CT),'--','python3',remote])
  payload=capture(['pct','exec',str(CT),'--','cat','/root/dastari-keycloak/sidereal-review.json'])
  import os,tempfile
  fd,tmp=tempfile.mkstemp(prefix='sidereal-review-rotated-',dir='/tmp')
  with os.fdopen(fd,'w') as stream:stream.write(payload)
  destination=Path('/tmp/sidereal-auth-review.json')
  os.replace(tmp,destination);destination.chmod(0o600)
  print('Updated private review credential file (0600); no values printed.')
 elif action in ('shared-review-account', 'native-public-review-account'):
  owned();ssh(['mkdir','-p',REMOTE]);ssh(['chmod','700',REMOTE])
  source=ROOT/'ops/keycloak'/(action+'.py')
  native = action == 'native-public-review-account'
  subprocess.run(['scp','-q',str(source),f'{HOST}:{REMOTE}/{source.name}'],check=True)
  remote='/root/dastari-keycloak/'+source.name
  ssh(['pct','push',str(CT),f'{REMOTE}/{source.name}',remote,'--perms','0600'])
  ssh(['pct','exec',str(CT),'--','python3',remote])
  # Credentials are captured into a root-only file, never printed or put in argv.
  remote_credentials='/root/dastari-keycloak/'+('sidereal-native-public-review.json' if native else 'sidereal-shared-review.json')
  payload=capture(['pct','exec',str(CT),'--','cat',remote_credentials])
  import os,tempfile
  fd,tmp=tempfile.mkstemp(prefix='sidereal-shared-auth-',dir='/tmp')
  with os.fdopen(fd,'w') as stream:stream.write(payload)
  destination=Path('/tmp/sidereal-native-public-review.json' if native else '/tmp/sidereal-shared-auth-review.json')
  os.replace(tmp,destination);destination.chmod(0o600)
  print('Ordinary review credentials available at '+str(destination)+' (0600); values not printed.')
 elif action in ('authoring', 'game-origin', 'review-grant', 'review-revoke'):
  owned();ssh(['mkdir','-p',REMOTE]);ssh(['chmod','700',REMOTE])
  source=ROOT/'ops/keycloak'/('review-authoring-role.py' if action.startswith('review-') else 'configure-authoring.py' if action=='authoring' else 'configure-game-origin.py')
  subprocess.run(['scp','-q',str(source),f'{HOST}:{REMOTE}/{source.name}'],check=True)
  ssh(['pct','push',str(CT),f'{REMOTE}/{source.name}',f'/root/dastari-keycloak/{source.name}','--perms','0600'])
  ssh(['pct','exec',str(CT),'--','python3',f'/root/dastari-keycloak/{source.name}'] + ([action.removeprefix('review-')] if action.startswith('review-') else []))
 elif action=='bootstrap':
  owned()
  address=capture(['pct','exec',str(CT),'--','hostname','-I']).split()[0]
  import ipaddress
  if ipaddress.ip_address(address) not in ipaddress.ip_network('10.0.1.0/24'):raise RuntimeError('Unexpected provider network')
  npmhost='toby@10.0.1.248';container='nginx-proxy-manager-app-1'
  subprocess.run(['scp','-q',str(ROOT/'ops/keycloak/npm-auth-host.mjs'),npmhost+':/tmp/dastari-auth-host.mjs'],check=True)
  subprocess.run(['ssh','-o','BatchMode=yes',npmhost,shlex.join(['docker','cp','/tmp/dastari-auth-host.mjs',container+':/app/dastari-auth-host.mjs'])],check=True)
  subprocess.run(['ssh','-o','BatchMode=yes',npmhost,shlex.join(['docker','exec','-w','/app','-e','DASTARI_AUTH_UPSTREAM='+address,container,'node','/app/dastari-auth-host.mjs'])],check=True)
  subprocess.run(['scp','-q',str(ROOT/'ops/keycloak/allow-auth-sni.py'),npmhost+':/tmp/dastari-auth-sni.py'],check=True)
  subprocess.run(['ssh','-o','BatchMode=yes',npmhost,'sudo','-n','python3','/tmp/dastari-auth-sni.py'],check=True)
  print('Private initial admin credentials: CT116 /root/dastari-keycloak/bootstrap-admin.json; retrieve securely in an administrator session. Never printed by this command. Create a permanent administrator then remove the bootstrap account.')
 else:raise ValueError('Unknown provider action')
if __name__=='__main__':raise SystemExit('Use python3 scripts/dev.py keycloak-{setup,start,stop,status,bootstrap}')
