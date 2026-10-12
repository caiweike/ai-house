"""Read-only staged/all-object release gate. Never prints matched secret values.
This heuristic scan supplements review; it is not proof that no unknown secret exists.
"""
from pathlib import Path
import subprocess, re, json, sys
root=Path(__file__).resolve().parents[1]
def git(*args):return subprocess.check_output(['git','-C',str(root),*args])
paths=git('ls-files','-z').decode().split('\0')
bad=[]
for p in filter(None,paths):
    parts=p.split('/')
    if any(x in {'.convex','node_modules','logs','dist','private-audit','__pycache__'} for x in parts) or (Path(p).name.startswith('.env') and Path(p).name!='.env.example') or re.search(r'\.(?:sqlite\w*|db|pem|key|p12|pfx|log)$',p):bad.append({'path':p,'kind':'forbidden_path'})
patterns={
 'api_token':rb'\b(?:sk-|ghp_|github_pat_)[A-Za-z0-9_-]{20,}',
 'private_key':rb'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----',
 'password_hash':rb'\$scrypt\$[^\s"\x00]{40,}',
 'url_credential':rb'https?://[^\s/"<>]+:[^\s/"<>]+@',
}
objects=git('cat-file','--batch-all-objects','--batch-check=%(objectname) %(objecttype)').decode().splitlines()
for row in objects:
    oid,kind=row.split()
    if kind not in {'blob','commit'}:continue
    data=git('cat-file',kind,oid)
    # Key header text in this scanner is a regex with metacharacters, not a PEM.
    for name,pattern in patterns.items():
        if re.search(pattern,data):bad.append({'object':oid,'kind':name})
history=git('rev-list','--objects','--all','--reflog').decode().splitlines() if git('rev-list','--all').strip() else []
for row in history:
    if ' ' not in row:continue
    p=row.split(' ',1)[1]
    if '/.convex/' in '/'+p or (Path(p).name.startswith('.env') and Path(p).name!='.env.example'):bad.append({'path':p,'kind':'forbidden_history_path'})
print(json.dumps({'scanned_index_paths':len(list(filter(None,paths))),'scanned_git_objects':len(objects),'findings':bad,'passed':not bad},indent=2))
sys.exit(bool(bad))
