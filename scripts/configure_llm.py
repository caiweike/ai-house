"""Local operator configuration, hidden Key entry, never performs model requests.
Run from app. Keys only enter the Convex backend environment, never .env/VITE or logs.
"""
from pathlib import Path
import argparse, getpass, json, sys, urllib.request
sys.stdout.reconfigure(encoding='utf-8')
root=Path(__file__).resolve().parents[1]
cfg=json.loads((root/'.convex/local/default/config.json').read_text())
if cfg['ports']['cloud']!=4212: raise SystemExit('请使用现有 app 本地后端。')
parser=argparse.ArgumentParser(description='后端模型配置；不会调用模型。')
group=parser.add_mutually_exclusive_group(required=True)
group.add_argument('--configure',action='store_true',help='隐藏输入Key，保存设置，保持模拟模式')
group.add_argument('--mock',action='store_true',help='关闭付费调用，切换模拟模式，保留Key与记录')
group.add_argument('--enable-paid',action='store_true',help='明确授权后打开付费网关')
group.add_argument('--reset-circuit',action='store_true',help='检查供应商后解除熔断，不清除账本')
parser.add_argument('--autonomous',action='store_true',help='与enable-paid一起使用，允许无人访问时自动产生费用')
args=parser.parse_args()

def admin(path,values,kind='function'):
    request=urllib.request.Request('http://127.0.0.1:4212/api/'+kind,
        json.dumps({'path':path,'args':values,'format':'json'}).encode(),
        {'Content-Type':'application/json','Authorization':'Convex '+cfg['adminKey']})
    with urllib.request.urlopen(request,timeout=30) as response: result=json.load(response)
    if result.get('status')!='success': raise SystemExit('后端操作失败；未显示敏感配置。')
    return result.get('value')

changes={}
if args.configure:
    print('先核对供应商官方价格。输入缓存未命中及输出的最高价格（元／百万Token）。')
    base=input('供应商确认的Base URL（保留租户路径，不使用默认供应商）：').strip()
    model=input('模型名（按中转站可用列表）：').strip()
    protocol=input('协议 [openai-chat / anthropic-messages]：').strip()
    path=input('相对于Base URL的请求路径（如 /chat/completions 或 /v1/messages）：').strip()
    price_in=input('供应商最高输入价（元／百万Token，不使用官方直连报价代替）：').strip()
    price_out=input('供应商最高输出价（元／百万Token）：').strip()
    confirmed=input('已经核对中转站计费单位、币种和分组倍率？输入“已核对”：').strip()=='已核对'
    key=getpass.getpass('API Key（隐藏输入，不写入文件）：').strip()
    if not key or not model or not base.startswith('https://') or protocol not in ['openai-chat','anthropic-messages'] or not path.startswith('/') or not all(0<float(p)<=1000 for p in [price_in,price_out]): raise SystemExit('配置无效。')
    changes={'HOUSE_LLM_BASE_URL':base,'HOUSE_LLM_MODEL':model,'HOUSE_LLM_API_KEY':key,
             'HOUSE_LLM_INPUT_CNY_PER_MILLION':price_in,'HOUSE_LLM_OUTPUT_CNY_PER_MILLION':price_out,
             'HOUSE_MODE':'mock','HOUSE_LLM_PAID_ENABLED':'0','HOUSE_LLM_TEST_ONLY':'0','HOUSE_LLM_UNLIMITED_DEV':'0',
             'HOUSE_LLM_DAILY_CNY':'1','HOUSE_LLM_MONTHLY_CNY':'30','HOUSE_LLM_MAX_OUTPUT_TOKENS':'2048',
             'HOUSE_LLM_CONCURRENCY':'2','HOUSE_LLM_DAILY_CALLS':'120','HOUSE_LLM_MONTHLY_CALLS':'3000',
             'HOUSE_LLM_TIMEOUT_MS':'60000','HOUSE_LLM_AUTONOMOUS_ENABLED':'0',
             'HOUSE_LLM_PROTOCOL':protocol,'HOUSE_LLM_ENDPOINT_PATH':path,'HOUSE_LLM_BILLING_MODE':'token',
             'HOUSE_LLM_PRICE_CONFIRMED':'1' if confirmed else '0','HOUSE_LLM_USAGE_TRUST':'untrusted'}
elif args.enable_paid:
    values={r['name']:r['value'] for r in admin('_system/cli/queryEnvironmentVariables',{},'query')}
    effective=admin('llmDiagnostics:configuration',{})
    if not effective.get('valid') or not effective.get('protocolExplicit') or not effective.get('requestPathExplicit'): raise SystemExit('请先明确配置协议与供应商请求路径。')
    if values.get('HOUSE_LLM_PRICE_CONFIRMED')!='1': raise SystemExit('中转站收费规则尚未确认，保持模拟模式。')
    if not values.get('HOUSE_LLM_API_KEY') or not all(values.get(k) for k in ['HOUSE_LLM_INPUT_CNY_PER_MILLION','HOUSE_LLM_OUTPUT_CNY_PER_MILLION']): raise SystemExit('请先运行 --configure。')
    print('usage默认不可信，每次请求至少保守预留当日额度，次数与预算仍限制。')
    print('将启用真实付费请求。默认日记账上限1元、月记账上限30元；供应商价格/usage异常可能影响实际账单。')
    print('自动对话也会立即开始产生费用。' if args.autonomous else '本次仅允许屋主私聊；自主模型交流暂时关闭。')
    if input('确认后输入“授权付费”：').strip()!='授权付费': raise SystemExit('未启用。')
    changes={'HOUSE_MODE':'live','HOUSE_LLM_PAID_ENABLED':'1','HOUSE_LLM_TEST_ONLY':'0','HOUSE_LLM_UNLIMITED_DEV':'0',
             'HOUSE_LLM_AUTONOMOUS_ENABLED':'1' if args.autonomous else '0'}
elif args.mock:
    changes={'HOUSE_MODE':'mock','HOUSE_LLM_PAID_ENABLED':'0','HOUSE_LLM_TEST_ONLY':'0','HOUSE_LLM_UNLIMITED_DEV':'0','HOUSE_LLM_AUTONOMOUS_ENABLED':'0'}
else:
    if input('已检查价格、用量和供应商余额？输入“解除熔断”：').strip()!='解除熔断': raise SystemExit('保持暂停。')
    admin('llmLedger:resetCircuit',{})
if changes:
    request=urllib.request.Request('http://127.0.0.1:4212/api/update_environment_variables',
        json.dumps({'changes':[{'name':k,'value':v} for k,v in changes.items()]}).encode(),
        {'Content-Type':'application/json','Authorization':'Convex '+cfg['adminKey']})
    with urllib.request.urlopen(request,timeout=30) as response:
        if response.status!=200: raise SystemExit('配置失败。')
print('后端配置已更新；此工具未向模型API发送请求。')
