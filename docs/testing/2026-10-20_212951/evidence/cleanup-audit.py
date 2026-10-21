import os,pathlib,json,shutil,subprocess,datetime,ast
loc=json.loads(pathlib.Path(os.environ['TEMP'],'blog-audit-location.json').read_text(encoding='utf8'));out=pathlib.Path(loc['report'])/'evidence';cleanup=[]
# 清理前收集状态；这里只删除本次创建且核实位于 TEMP 的两个目录。
for name in ['sandbox','flows']:
 p=pathlib.Path(loc[name]).resolve();assert p.parent==pathlib.Path(os.environ['TEMP']).resolve() and p.name.startswith('blog-audit-2026-10-20_212951')
 links=[]
 for base,dirs,files in os.walk(p,topdown=True,followlinks=False):
  for d in list(dirs):
   item=pathlib.Path(base,d)
   if item.is_junction() or item.is_symlink():
    dirs.remove(d);os.rmdir(item);links.append(str(item.relative_to(p)))
 shutil.rmtree(p);cleanup.append({'path':str(p),'removed':not p.exists(),'unlinkedBeforeDelete':links})
for p in out.glob('*.py'):ast.parse(p.read_text(encoding='utf-8-sig'))
for p in out.glob('*.mjs'):
 result=subprocess.run(['node','--check',str(p)],capture_output=True,text=True)
 assert result.returncode==0,result.stderr
(out/'cleanup.json').write_text(json.dumps({'time':datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=8))).isoformat(),'directories':cleanup,'testScriptSyntax':'all parse successfully'},ensure_ascii=False,indent=2),encoding='utf8');print(json.dumps(cleanup,ensure_ascii=False))
