import os,pathlib,json,subprocess,time
loc=json.loads(pathlib.Path(os.environ['TEMP'],'blog-audit-location.json').read_text(encoding='utf8'));root=pathlib.Path(loc['sandbox']);out=pathlib.Path(loc['report'])/'evidence'
# 仅修改副本测试夹具，固定内容与日期；三章长正文保证阅读页锚点与横向轨道可测。
for i in range(12):
 p=root/'src/content/posts'/('audit-'+str(i)+'.md');p.parent.mkdir(parents=True,exist_ok=True)
 p.write_text('---\ntitle: 虚构审计文章 '+str(i)+'\ndate: 2026-10-20\ncategories: [审计分类]\ntags: [审计标签]\n---\n'+''.join('\n## 章节'+str(j)+'\n\n'+('虚构中文长段落用于验证阅读目录与布局。 '*80)+'\n' for j in range(1,5)),encoding='utf8')
(root/'data/projects.json').write_text(json.dumps({'projects':[{'id':'audit-project','slug':'test','title':'虚构审计项目','content':'## 虚构项目正文','tech':['Astro']} ]},ensure_ascii=False),encoding='utf8')
config=json.loads((root/'src/data/site.config.json').read_text(encoding='utf8'));config['projectGroups']=[{'id':'open-source','title':'开源项目','description':'虚构审计分组','items':[{'id':'audit-fallback','title':'虚构项目回退','href':'https://example.invalid','description':'离线构建数据','tags':['QA']}]}]
(root/'src/data/site.config.json').write_text(json.dumps(config,ensure_ascii=False),encoding='utf8')
env=os.environ.copy();env.update(BACKUP_ENABLED='false',SITE_URL='http://127.0.0.1:4521',ADMIN_PORT='4520',TWIKOO_ENV_ID='',PUBLIC_TWIKOO_ENV_ID='',MONGODB_URI='',MONGO_URL='',TWIKOO_LOG_LEVEL='error',ASTRO_DEV_BACKGROUND='1',CI='1')
results=[]
for cmd in ['test:public-ui','test:ui-polish','test:reading-ui','test:project-ui']:
 t=time.time();log=out/('seeded-'+cmd.replace(':','-')+'.log')
 with log.open('w',encoding='utf8') as f:
  p=subprocess.Popen(['cmd.exe','/d','/c','npm','run',cmd],cwd=root,env=env,stdout=f,stderr=subprocess.STDOUT)
  try:code=p.wait(timeout=240)
  except subprocess.TimeoutExpired:
   subprocess.run(['taskkill','/PID',str(p.pid),'/T','/F'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL);code='timeout'
 results.append({'script':cmd,'exit':code,'seconds':round(time.time()-t,2),'log':log.name})
 (out/'seeded-results.json').write_text(json.dumps(results,indent=2),encoding='utf8');print(results[-1],flush=True)

