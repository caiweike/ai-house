"""Local-only HTTP client; avoids the Node 24 one-shot CLI exit issue."""
import json
import sys
import urllib.request
from pathlib import Path
from pathlib import Path

def call(kind, path, args):
    cfg = json.loads((Path(__file__).resolve().parents[1]/'.convex/local/default/config.json').read_text())
    if cfg['ports']['cloud'] != 4212 or cfg['ports']['site'] != 4213:
        raise RuntimeError('Release copy requires its isolated backend on 4212/4213')
    headers = {'Content-Type': 'application/json'}
    if kind == 'function': headers['Authorization'] = 'Convex ' + cfg['adminKey']
    cfg = json.loads((Path(__file__).resolve().parents[1]/'.convex/local/default/config.json').read_text())
    if cfg['ports']['cloud'] != 4212 or cfg['ports']['site'] != 4213:
        raise RuntimeError('Release copy requires its isolated backend on 4212/4213')
    headers = {'Content-Type': 'application/json'}
    if kind == 'function': headers['Authorization'] = 'Convex ' + cfg['adminKey']
    request = urllib.request.Request('http://127.0.0.1:4212/api/' + kind,
        json.dumps({'path': path, 'args': args, 'format': 'json'}, ensure_ascii=False).encode(),
        headers)
    with urllib.request.urlopen(request, timeout=30) as response:
        result = json.load(response)
    if result.get('status') != 'success':
        raise RuntimeError(result.get('errorMessage', '本地服务请求失败'))
    return result.get('value')

def records():
    """Paginated diagnostic reads also work after the world exceeds 8192 events."""
    result = {}
    for table in ('messages', 'demo', 'events'):
        rows, cursor = [], None
        while True:
            page = call('query', 'houseDiagnostics:recordsPage', {'table': table, 'cursor': cursor})
            rows.extend(page['page'])
            if page['isDone']: break
            cursor = page['continueCursor']
        result[table] = rows
    return result

if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    print(json.dumps(call(sys.argv[1], sys.argv[2], json.loads(sys.argv[3]) if len(sys.argv) > 3 else {}), ensure_ascii=False))
