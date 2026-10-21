import os,pathlib,json,shutil
loc=json.loads(pathlib.Path(os.environ['TEMP'],'blog-audit-location.json').read_text(encoding='utf8'));root=pathlib.Path(r'E:\Project\L1angK1NG_Website');dst=pathlib.Path(loc['flows'])
assert dst.parent==pathlib.Path(os.environ['TEMP']) and dst.name.startswith('blog-audit-') and dst.name.endswith('-flows')
if (dst/'node_modules').exists():os.rmdir(dst/'node_modules')
# 仅在已核实的临时目录中递归清理，先断开所有发布 junction。
for p in dst.iterdir():
 if p.is_junction() or p.is_symlink():os.rmdir(p)
shutil.rmtree(dst)
shutil.copytree(root,dst,ignore=shutil.ignore_patterns('node_modules','.git','.env','.env.*','releases','current','.current-*','.test-tmp*','testing','twikoo','*.log','.build-lock'),symlinks=True)
(dst/'qa-network-guard.mjs').write_text("const original=globalThis.fetch; globalThis.fetch=(input,options)=>{const url=new URL(typeof input==='string'?input:input.url||input); if(!['localhost','127.0.0.1','[::1]'].includes(url.hostname))return Promise.reject(new Error('QA_EXTERNAL_NETWORK_BLOCKED'));return original(input,options)};",encoding='utf8')
