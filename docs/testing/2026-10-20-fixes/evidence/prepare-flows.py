import pathlib,shutil,json,os
root=pathlib.Path.cwd();out=root/'docs/testing/2026-10-20-fixes';dst=pathlib.Path(os.environ['TEMP'])/'blog-fixes-20261020-flows'
assert not dst.exists()
shutil.copytree(root,dst,ignore=shutil.ignore_patterns('.git','.env','.env.*','releases','current','.current-*','.test-tmp*','testing','twikoo','*.log','.build-lock','node_modules'),symlinks=False)
shutil.copytree(root/'node_modules',dst/'node_modules',ignore=shutil.ignore_patterns('.astro','.vite'),symlinks=False)
(dst/'qa-network-guard.mjs').write_text("const original=globalThis.fetch;globalThis.fetch=(input,options)=>{const url=new URL(typeof input==='string'?input:input.url||input);if(!['localhost','127.0.0.1','[::1]'].includes(url.hostname))return Promise.reject(Error('QA_EXTERNAL_NETWORK_BLOCKED'));return original(input,options)};",encoding='utf8')
location={'flows':str(dst),'sandbox':str(dst),'report':str(out)}
pathlib.Path(os.environ['TEMP'],'blog-fixes-location.json').write_text(json.dumps(location),encoding='utf8')
for name in ['flows.mjs','extra.mjs','focused.mjs']:
 script=(root/'docs/testing/2026-10-20_212951/evidence'/name).read_text(encoding='utf-8-sig').replace('blog-audit-location.json','blog-fixes-location.json')
 (out/'evidence'/name).write_text(script,encoding='utf8')
print(dst)
