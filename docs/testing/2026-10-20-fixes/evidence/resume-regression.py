import os,pathlib,subprocess,json,time
root=pathlib.Path(r'C:\Users\LJB11\AppData\Local\Temp\blog-fixes-20261020');out=pathlib.Path(r'E:\Project\L1angK1NG_Website\docs\testing\2026-10-20-fixes\evidence')
env=os.environ.copy()
for key in list(env):
 if key.startswith(('TWIKOO','PUBLIC_','ADMIN_','SESSION_','BACKUP_','MONGO','BLOG_')) or key=='NODE_OPTIONS':env.pop(key)
env.update(BACKUP_ENABLED='false',SITE_URL='http://127.0.0.1:4521',ADMIN_PORT='4599',TWIKOO_ENV_ID='',PUBLIC_TWIKOO_ENV_ID='',MONGODB_URI='',MONGO_URL='',ASTRO_DEV_BACKGROUND='1',CI='1',UI_EVIDENCE_DIR=str(out/'screenshots'))
commands=['test:managed-player','test:twikoo-ui','test:liquid-glass','test:reading-ui','test:project-ui','test:public-ui','test:public-ui']
results=json.loads((out/'entries.json').read_text(encoding='utf8'))
for command in commands:
 start=time.time();log=out/(command.replace(':','-')+'-run'+str(1+sum(r['command']==command for r in results))+'.log')
 with log.open('w',encoding='utf8') as f:
  child=subprocess.Popen(['cmd.exe','/d','/c','npm','run',command],cwd=root,env=env,stdout=f,stderr=subprocess.STDOUT)
  try:code=child.wait(timeout=360)
  except subprocess.TimeoutExpired:
   subprocess.run(['taskkill','/PID',str(child.pid),'/T','/F'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL);code='timeout'
 result={'command':command,'exit':code,'seconds':round(time.time()-start,2),'log':log.name};results.append(result)
 (out/'entries.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf8');print(json.dumps(result),flush=True)
 if command=='verify' and code!=0:
  for phase in ['lint','test','check','build','check:dist']:
   with (out/('independent-'+phase.replace(':','-')+'.log')).open('w',encoding='utf8') as f:subprocess.run(['cmd.exe','/d','/c','npm','run',phase],cwd=root,env=env,stdout=f,stderr=subprocess.STDOUT,timeout=300)
