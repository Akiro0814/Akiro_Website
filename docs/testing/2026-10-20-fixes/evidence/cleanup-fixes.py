import pathlib,os,json,shutil,hashlib,datetime
root=pathlib.Path.cwd();out=root/'docs/testing/2026-10-20-fixes/evidence';baseline=json.loads((out/'baseline.json').read_text(encoding='utf8'));after={}
for name in ['data','src/content','src/data','public/uploads','public/music','public/avatars','public/wallpapers']:
 p=root/name
 if p.exists():
  for f in p.rglob('*'):
   if f.is_file():after[str(f.relative_to(root))]=hashlib.sha256(f.read_bytes()).hexdigest()
assert after==baseline['hashes'],'真实业务数据发生变化'
cleanup=[]
for name in ['blog-fixes-20261020','blog-fixes-20261020-flows']:
 target=pathlib.Path(os.environ['TEMP'])/name
 assert target.parent.resolve()==pathlib.Path(os.environ['TEMP']).resolve() and target.name in ['blog-fixes-20261020','blog-fixes-20261020-flows']
 links=[]
 if target.exists():
  for base,dirs,files in os.walk(target,topdown=True,followlinks=False):
   for d in list(dirs):
    p=pathlib.Path(base,d)
    if p.is_symlink() or p.is_junction():dirs.remove(d);os.rmdir(p);links.append(str(p.relative_to(target)))
  shutil.rmtree(target)
 cleanup.append({'path':str(target),'removed':not target.exists(),'unlinked':links})
location=pathlib.Path(os.environ['TEMP'])/'blog-fixes-location.json'
if location.exists():location.unlink()
state={'clientCompletionDate':'2026-10-21','businessHashesUnchanged':True,'businessFiles':len(after),'actualMarkdownCount':len(list((root/'src/content').rglob('*.md'))),'temporaryCopies':cleanup,'metadataRemoved':not location.exists(),'dependencyIsolation':'两层测试均使用实体依赖副本，未清理原 node_modules 缓存','priorAuditMetadata':'未触碰上一轮被拒绝删除的两个元数据文件'}
(out/'protection-cleanup.json').write_text(json.dumps(state,ensure_ascii=False,indent=2),encoding='utf8');print(json.dumps(state,ensure_ascii=False))
