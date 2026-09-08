"""Own an isolated Blender + stdio MCP session; configuration lives in dev.toml."""
from pathlib import Path
import os,signal,socket,subprocess,sys,time,tomllib
ROOT=Path(__file__).resolve().parents[1];cfg=tomllib.loads((ROOT/'dev.toml').read_text())
env=os.environ.copy();sites=list((ROOT/'.tools/art/lib').glob('python*/site-packages'))
if len(sites)!=1:raise RuntimeError('Run npm run art:setup first')
env.update(BLENDER_HOST='127.0.0.1',BLENDER_PORT=str(cfg['art']['mcp_port']),DISABLE_TELEMETRY='true',BLENDER_MCP_SAFE_MODE='true',SIDEREAL_ART_SITE_PACKAGES=str(sites[0]),PYTHONUNBUFFERED='1')
address=('127.0.0.1',cfg['art']['mcp_port'])
with socket.socket() as probe:probe.bind(address)
processes=[]
def stop():
 for process in reversed(processes):
  if process.poll() is None:
   os.killpg(process.pid,signal.SIGTERM)
   try:process.wait(timeout=5)
   except subprocess.TimeoutExpired:os.killpg(process.pid,signal.SIGKILL);process.wait()
def interrupt(*_):raise KeyboardInterrupt
signal.signal(signal.SIGTERM,interrupt);signal.signal(signal.SIGINT,interrupt)
try:
 logpath=ROOT/'.runtime/blender-mcp.log';logpath.parent.mkdir(exist_ok=True,mode=0o700)
 with logpath.open('a') as log:
  blender=subprocess.Popen(['xvfb-run','-a','-s','-screen 0 1280x1024x24',cfg['art']['blender'],'--factory-startup','-noaudio','--python',str(ROOT/'assets/source/legacy_art_tools/blender_bootstrap.py')],cwd=ROOT,env=env,stdout=log,stderr=log,start_new_session=True);processes.append(blender)
  deadline=time.monotonic()+45
  while True:
   if blender.poll() is not None:raise RuntimeError('Blender exited; see .runtime/blender-mcp.log')
   try:
    with socket.create_connection(address,timeout=.3):break
   except OSError:
    if time.monotonic()>deadline:raise RuntimeError('Blender readiness timed out')
    time.sleep(.1)
  server=subprocess.Popen([str(ROOT/'.tools/art/bin/blender-mcp')],cwd=ROOT,env=env,start_new_session=True);processes.append(server);sys.exit(server.wait())
except KeyboardInterrupt:sys.exit(130)
finally:stop()
