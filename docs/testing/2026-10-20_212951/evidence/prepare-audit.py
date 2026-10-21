"""从当前工作区创建两个隔离副本；不复制环境凭据或发布链接。
在项目根目录运行 python <本文件绝对路径>。依赖复制为实体目录，避免共享可写缓存。
"""
import datetime
import hashlib
import json
import os
import pathlib
import shutil
import subprocess

root = pathlib.Path.cwd().resolve()
assert (root / 'admin/server.mjs').exists(), '必须在项目根目录运行'
out = pathlib.Path(__file__).resolve().parent
stamp = datetime.datetime.now().strftime('%Y-%m-%d_%H%M%S')
sandbox = pathlib.Path(os.environ['TEMP']) / ('blog-audit-repro-' + stamp)
flows = pathlib.Path(str(sandbox) + '-flows')
ignore = shutil.ignore_patterns('node_modules', '.git', '.env', '.env.*',
                               'releases', 'current', '.current-*', '.test-tmp*',
                               'testing', 'twikoo', '*.log', '.build-lock')
for target in [sandbox, flows]:
    shutil.copytree(root, target, ignore=ignore, symlinks=True)
    # 发布会清理 node_modules/.astro 与 .vite，必须避免共享依赖 junction。
    shutil.copytree(root / 'node_modules', target / 'node_modules', symlinks=False,
                    ignore=shutil.ignore_patterns('.astro', '.vite'))

(flows / 'qa-network-guard.mjs').write_text(
    "const original=globalThis.fetch; globalThis.fetch=(input,options)=>{"
    "const url=new URL(typeof input==='string'?input:input.url||input);"
    "if(!['localhost','127.0.0.1','[::1]'].includes(url.hostname))"
    "return Promise.reject(new Error('QA_EXTERNAL_NETWORK_BLOCKED'));"
    "return original(input,options)};", encoding='utf8')
report = out.parent.parent / ('repro-' + stamp)
(report / 'evidence').mkdir(parents=True)
location = {'sandbox': str(sandbox), 'flows': str(flows), 'report': str(report)}
pathlib.Path(os.environ['TEMP'], 'blog-audit-location.json').write_text(
    json.dumps(location), encoding='utf8')
print(json.dumps(location, ensure_ascii=False))
print('日志写入新的复现目录，不覆盖本次原始证据。')
