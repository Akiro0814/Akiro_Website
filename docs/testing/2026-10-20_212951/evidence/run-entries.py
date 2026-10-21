import os,json,pathlib,subprocess,time
loc=json.loads(pathlib.Path(os.environ['TEMP'],'blog-audit-location.json').read_text())
root=pathlib.Path(loc['sandbox']);out=pathlib.Path(loc['report'])/'evidence'
env=os.environ.copy()
for k in list(env):
 if any(k.startswith(p) for p in ['TWIKOO','PUBLIC_','ADMIN_','SESSION_','BACKUP_','MONGO','BLOG_']):env.pop(k)
env.update(BACKUP_ENABLED='false',SITE_URL='http://127.0.0.1:4521',ADMIN_PORT='4520',TWIKOO_ENV_ID='',PUBLIC_TWIKOO_ENV_ID='',MONGODB_URI='',MONGO_URL='',TWIKOO_LOG_LEVEL='error',ASTRO_DEV_BACKGROUND='1',CI='1')
scripts=json.loads((root/'package.json').read_text())['scripts']
commands=['verify']+[k for k in scripts if k.startswith('test:')]
results=[]
for cmd in commands:
 start=time.time(); log=out/(cmd.replace(':','-')+'.log')
 with log.open('w',encoding='utf8') as f:
  p=subprocess.Popen(['cmd.exe','/d','/c','npm', 'run',cmd],cwd=root,env=env,stdout=f,stderr=subprocess.STDOUT)
  try:code=p.wait(timeout=300)
  except subprocess.TimeoutExpired:
   subprocess.run(['taskkill','/PID',str(p.pid),'/T','/F'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL);code='timeout'
 result={'script':cmd,'exit':code,'seconds':round(time.time()-start,2),'log':log.name};results.append(result)
 (out/'entry-results.json').write_text(json.dumps(results,indent=2),encoding='utf8')
 print(json.dumps(result),flush=True)
 # verify uses &&; independently run downstream phases after failure
 if cmd=='verify' and code!=0:
  for phase in ['lint','test','check','build','check:dist']:
   t=time.time()
   with (out/('independent-'+phase.replace(':','-')+'.log')).open('w',encoding='utf8') as f: r=subprocess.run(['cmd.exe','/d','/c','npm','run',phase],cwd=root,env=env,stdout=f,stderr=subprocess.STDOUT,timeout=300)
   results.append({'script':'independent-'+phase,'exit':r.returncode,'seconds':round(time.time()-t,2)})
