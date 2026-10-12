"""Interactive local password setup; no password in shell args/logs."""
import getpass
import json
import subprocess
import warnings

warnings.simplefilter('error', getpass.GetPassWarning)

from pathlib import Path
import re
root = Path(__file__).resolve().parents[1]
username = input('新用户名（3～32位英文字母、数字、下划线）：').strip().lower()
if not re.fullmatch(r'[a-z0-9_]{3,32}', username): raise SystemExit('用户名无效，未作修改。')
password = getpass.getpass('新密码（8～256个字符）：')
if not 8 <= len(password) <= 256: raise SystemExit('密码长度无效，未作修改。')
if password != getpass.getpass('再输入一次密码：'):
    raise SystemExit('两次密码不同，未作修改。')
subprocess.run(['node', 'scripts/owner_admin.mjs', '--rotate'],
               input=json.dumps({'username': username, 'password': password}), text=True, encoding='utf-8', cwd=root, check=True)
