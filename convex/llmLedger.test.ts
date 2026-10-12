import { reserve, settle, expire, authorizeDebug, debugPublicWindow, retireDebug, setPaused } from './llmLedger';
import { jest } from '@jest/globals';

// In-memory contexts only. Never invoke a mutation/action against the user's database.
function fixture() {
  const rows: any[] = [], scheduled: any[] = [];
  const db: any = {
    query: (table: string) => {
      const filters: any[] = [];
      const q: any = { eq: (k:string,v:any)=>{filters.push((r:any)=>r[k]===v);return q;},
        lte:(k:string,v:any)=>{filters.push((r:any)=>r[k]<=v);return q;} };
      const query: any = { withIndex: (_:string, cb:any)=>{cb(q);return query;},
        unique:async()=>rows.find(r=>r.table===table && filters.every(f=>f(r)))??null,
        take:async(n:number)=>rows.filter(r=>r.table===table && filters.every(f=>f(r))).slice(0,n) };
      return query;
    },
    get:async(id:string)=>rows.find(r=>r._id===id)??null,
    insert:async(table:string,row:any)=>{const id=`${table}:${rows.length}`;rows.push({...row,_id:id,table});return id;},
    patch:async(id:string,values:any)=>{Object.assign(rows.find(r=>r._id===id),values);},
  };
  return { rows, scheduled, ctx:{db,scheduler:{runAfter:async(delay:number,_ref:any,args:any)=>{scheduled.push({delay,args});}}} };
}
const keys = { HOUSE_MODE:'live',HOUSE_LLM_TEST_ONLY:'1',HOUSE_LLM_BASE_URL:'http://127.0.0.1:8765',HOUSE_LLM_MODEL:'fixture',
  HOUSE_LLM_UNLIMITED_DEV:'0',HOUSE_ENVIRONMENT:'',CONVEX_CLOUD_URL:'http://127.0.0.1:3212',CONVEX_SITE_URL:'http://127.0.0.1:3213',
  HOUSE_LLM_AUTONOMOUS_ENABLED:'1',CONVEX_DEPLOYMENT:'',
  HOUSE_LLM_API_KEY:'fake-only',HOUSE_LLM_INPUT_CNY_PER_MILLION:'2',HOUSE_LLM_OUTPUT_CNY_PER_MILLION:'8',
  HOUSE_LLM_TIMEOUT_MS:'60000',HOUSE_LLM_USAGE_TRUST:'reported',HOUSE_LLM_BILLING_MODE:'token',HOUSE_LLM_PRICE_CONFIRMED:'1',
  HOUSE_LLM_REAL_TEST:'', HOUSE_LLM_PAID_ENABLED:'0', HOUSE_LLM_DAILY_CNY:'1', HOUSE_LLM_MONTHLY_CNY:'30' };
const original: Record<string,string|undefined> = {};
beforeEach(()=>{for(const [k,v] of Object.entries(keys)){original[k]=process.env[k];process.env[k]=v;}});
afterEach(()=>{for(const k of Object.keys(keys)){if(original[k]===undefined)delete process.env[k];else process.env[k]=original[k];}jest.restoreAllMocks();});
const runReserve=(ctx:any,key='test')=>(reserve as any)._handler(ctx,{key,scope:'private',inputBound:512});
const runSettle=(ctx:any,args:any)=>(settle as any)._handler(ctx,args);
test('60秒HTTP请求的预留租约为90秒；55秒回收不能抢先结束',async()=>{
  const f=fixture(), now=1000000;const clock=jest.spyOn(Date,'now').mockReturnValue(now);
  const r=await runReserve(f.ctx);expect(r.config.leaseMs).toBe(90000);expect(f.scheduled[0].delay).toBe(91000);
  clock.mockReturnValue(now+55000);await (expire as any)._handler(f.ctx,{id:r.id});
  expect(f.rows.find(a=>a._id===r.id).status).toBe('reserved');
  clock.mockReturnValue(now+91000);await (expire as any)._handler(f.ctx,{id:r.id});
  const a=f.rows.find(a=>a._id===r.id);expect(a.status).toBe('expired');expect(a.cost).toBe(a.reserve);
  expect(f.rows.find(a=>a.table==='llmControl').active).toBe(0);
});

test('自主调试没有窗口不能收费；窗口过期或用满8次自动关闭，保留总授权计数',async()=>{
  Object.assign(process.env,{HOUSE_LLM_REAL_TEST:'stage51-debug-windowtest',HOUSE_LLM_TEST_ONLY:'0',HOUSE_LLM_PAID_ENABLED:'1',HOUSE_LLM_BASE_URL:'https://ai.lfree.org/bot/test',HOUSE_LLM_DAILY_CNY:'11'});
  const f=fixture();const clock=jest.spyOn(Date,'now').mockReturnValue(1000000);
  await (authorizeDebug as any)._handler(f.ctx,{key:process.env.HOUSE_LLM_REAL_TEST});
  const publicReserve=(key:string)=>(reserve as any)._handler(f.ctx,{key,scope:'public',inputBound:512});
  expect((await publicReserve('public:missing-window')).error).toBe('disabled');
  await (debugPublicWindow as any)._handler(f.ctx,{key:process.env.HOUSE_LLM_REAL_TEST,open:true});
  for(let i=0;i<8;i++) {
    clock.mockReturnValue(1000000+i*60001);
    const r=await publicReserve(`public:window-${i}`);expect(r.id).toBeDefined();await runSettle(f.ctx,{id:r.id,success:true});
  }
  expect((await publicReserve('public:ninth')).error).toBe('disabled');
  await (debugPublicWindow as any)._handler(f.ctx,{key:process.env.HOUSE_LLM_REAL_TEST,open:true});
  clock.mockReturnValue(Date.now()+480001);
  expect((await publicReserve('public:expired-window')).error).toBe('disabled');
  expect(f.rows.find(a=>a.table==='llmRealTests').calls).toBe(8);
  await (retireDebug as any)._handler(f.ctx,{key:process.env.HOUSE_LLM_REAL_TEST});
  expect((await runReserve(f.ctx,'after-retirement')).error).toBe('budget');
  expect(f.rows.find(a=>a.table==='llmRealTests').committed).toBe(1600000);
});

test('新调试授权最多50次10元；失败收费、重建拒绝且月度保护仍生效',async()=>{
  Object.assign(process.env,{HOUSE_LLM_REAL_TEST:'stage51-debug-authorized',HOUSE_LLM_TEST_ONLY:'0',HOUSE_LLM_PAID_ENABLED:'1',HOUSE_LLM_BASE_URL:'https://ai.lfree.org/bot/test',HOUSE_LLM_DAILY_CNY:'11'});
  const f=fixture();const clock=jest.spyOn(Date,'now').mockReturnValue(1000000);
  await (authorizeDebug as any)._handler(f.ctx,{key:process.env.HOUSE_LLM_REAL_TEST});
  await expect((authorizeDebug as any)._handler(f.ctx,{key:process.env.HOUSE_LLM_REAL_TEST})).rejects.toThrow('duplicate');
  for(let i=0;i<50;i++) {
    clock.mockReturnValue(1000000+i*301001);
    const r=await runReserve(f.ctx,`debug-${i}`);expect(r.id).toBeDefined();
    await runSettle(f.ctx,{id:r.id,success:false,error:'timeout'});
  }
  const run=f.rows.find(a=>a.table==='llmRealTests');expect(run.calls).toBe(50);expect(run.committed).toBe(10000000);
  expect((await runReserve(f.ctx,'fifty-first')).error).toBe('budget');
  const g=fixture();await (authorizeDebug as any)._handler(g.ctx,{key:process.env.HOUSE_LLM_REAL_TEST});
  const periods=await import('./llmPolicy');
  await g.ctx.db.insert('llmBudgets',{period:`month:${periods.periods(Date.now()).month}`,spent:29900000,reserved:0,calls:1,inputTokens:0,outputTokens:0,uncertain:0});
  expect((await runReserve(g.ctx)).error).toBe('budget');expect(g.rows.find(a=>a.table==='llmRealTests').calls).toBe(0);
});
test('缺失用量或超时保留全额预留且结算幂等',async()=>{
  const f=fixture(),r=await runReserve(f.ctx);
  await runSettle(f.ctx,{id:r.id,success:false,error:'timeout'});
  const budget=f.rows.find(a=>a.table==='llmBudgets');const spent=budget.spent;
  await runSettle(f.ctx,{id:r.id,success:false,error:'timeout'});
  expect(budget.spent).toBe(spent);expect(budget.reserved).toBe(0);expect(budget.uncertain).toBe(1);
});
test('不可信usage不能通过传入Token绕开保守收费',async()=>{
  process.env.HOUSE_LLM_USAGE_TRUST='untrusted';const f=fixture(),r=await runReserve(f.ctx);
  await runSettle(f.ctx,{id:r.id,success:true,inputTokens:1,outputTokens:1});
  const a=f.rows.find(a=>a._id===r.id);expect(a.usageKnown).toBe(false);expect(a.cost).toBe(a.reserve);
  expect(f.rows.find(a=>a.table==='llmBudgets').inputTokens).toBe(0);
});
test('不可信超限usage触发暂停但保留合格正文对应的成功状态及保守费用',async()=>{
  process.env.HOUSE_LLM_USAGE_TRUST='untrusted';const f=fixture(),r=await runReserve(f.ctx);
  const accepted=await runSettle(f.ctx,{id:r.id,success:true,evidence:{reason:'ok',protocol:'openai-chat',stage:'validate',durationMs:10,timeoutMs:60000,maxOutputTokens:256,usageState:'over_limit',reportedOutputTokens:1000}});
  expect(accepted).toBe(true);expect(f.rows.find(a=>a.table==='llmControl').circuit).toBe('usage');
  expect(f.rows.find(a=>a._id===r.id).cost).toBe(f.rows.find(a=>a._id===r.id).reserve);
});
test('失败响应也结算可信供应商用量；实际超限不能释放预算并继续调用',async()=>{
  const f=fixture(),r=await runReserve(f.ctx);
  const accepted=await runSettle(f.ctx,{id:r.id,success:false,inputTokens:512,outputTokens:10000,error:'invalid'});
  expect(accepted).toBe(false);expect(f.rows.find(a=>a.table==='llmControl').circuit).toBe('usage');
  expect(f.rows.find(a=>a._id===r.id).cost).toBeGreaterThan(f.rows.find(a=>a._id===r.id).reserve);
});
test('真实验收共享八次终身上限；失败不退次数和费用，日期变化不重置',async()=>{
  Object.assign(process.env,{HOUSE_LLM_REAL_TEST:'authorized-test',HOUSE_LLM_TEST_ONLY:'0',HOUSE_LLM_PAID_ENABLED:'1',HOUSE_LLM_BASE_URL:'https://ai.lfree.org/bot/test'});
  const f=fixture();const clock=jest.spyOn(Date,'now').mockReturnValue(1000000);
  for(let i=0;i<8;i++) {
    clock.mockReturnValue(1000000+i*301001);
    const r=await runReserve(f.ctx,`real-${i}`);expect(r.id).toBeDefined();expect(r.config.concurrency).toBe(1);
    expect(r.config.usagePolicy).toBe('untrusted');
    if(i===0) expect((await runReserve(f.ctx,'parallel')).error).toBe('concurrency');
    await runSettle(f.ctx,{id:r.id,success:false,error:'timeout'});
  }
  const run=f.rows.find(a=>a.table==='llmRealTests');expect(run.calls).toBe(8);expect(run.committed).toBe(960000);
  expect((await runReserve(f.ctx,'ninth')).error).toBe('budget');
  clock.mockReturnValue(1000000+86400000);
  expect((await runReserve(f.ctx,'next-day')).error).toBe('budget');
});

function dev() {
  Object.assign(process.env,{HOUSE_LLM_UNLIMITED_DEV:'1',HOUSE_ENVIRONMENT:'local-development',HOUSE_LLM_TEST_ONLY:'0',
    HOUSE_LLM_PAID_ENABLED:'1',HOUSE_LLM_BASE_URL:'https://ai.lfree.org/bot/test',HOUSE_LLM_REAL_TEST:'expired-old-grant',
    HOUSE_LLM_USAGE_TRUST:'untrusted',HOUSE_LLM_BILLING_MODE:'unknown',HOUSE_LLM_PRICE_CONFIRMED:'0'});
}
test('本地无限开发超过50次与日月费用次数硬上限，原封存授权不变，每次仍计费',async()=>{
  dev();const f=fixture(),clock=jest.spyOn(Date,'now').mockReturnValue(1000000);
  const grant={key:'expired-old-grant',calls:50,committed:10000000,expires:1};
  await f.ctx.db.insert('llmRealTests',grant);
  const {periods}=await import('./llmPolicy');const p=periods(Date.now());
  for(const period of [`day:${p.day}`,`month:${p.month}`]) await f.ctx.db.insert('llmBudgets',
    {period,spent:100000000,reserved:0,calls:10001,inputTokens:0,outputTokens:0,uncertain:0});
  for(let i=0;i<51;i++) {
    clock.mockReturnValue(1000000+i*60001);
    const r=await runReserve(f.ctx,`dev-${i}`);expect(r.id).toBeDefined();expect(r.config.unlimitedDev).toBe(true);
    await runSettle(f.ctx,{id:r.id,success:true});
  }
  const old=f.rows.find(a=>a.table==='llmRealTests');expect(old.calls).toBe(50);expect(old.committed).toBe(10000000);expect(old.expires).toBe(1);
  expect(f.rows.filter(a=>a.table==='llmAttempts')).toHaveLength(51);
  for(const b of f.rows.filter(a=>a.table==='llmBudgets')) {expect(b.calls).toBe(10052);expect(b.spent).toBe(151000000);expect(b.reserved).toBe(0);}
});
test('开发暂停、私聊独立开关、去重、并发、分钟限流仍受服务器校验',async()=>{
  dev();const f=fixture();jest.spyOn(Date,'now').mockReturnValue(1000000);
  await (setPaused as any)._handler(f.ctx,{paused:true});expect((await runReserve(f.ctx)).error).toBe('paused');
  await (setPaused as any)._handler(f.ctx,{paused:false});process.env.HOUSE_LLM_AUTONOMOUS_ENABLED='0';
  expect((await (reserve as any)._handler(f.ctx,{key:'public:test',scope:'public',inputBound:512})).error).toBe('disabled');
  const a=await runReserve(f.ctx,'a'),b=await runReserve(f.ctx,'b');expect(a.id).toBeDefined();expect(b.id).toBeDefined();
  expect((await runReserve(f.ctx,'a')).error).toBe('duplicate');expect((await runReserve(f.ctx,'c')).error).toBe('concurrency');
  for(const r of [a,b]) await runSettle(f.ctx,{id:r.id,success:true});
  for(let i=0;i<4;i++) {const r=await runReserve(f.ctx,`minute-${i}`);await runSettle(f.ctx,{id:r.id,success:true});}
  expect((await runReserve(f.ctx,'seventh')).error).toBe('concurrency');
});
test('连续三次故障触发五分钟冷却，冷却不产生新请求，认证保护保持人工解除',async()=>{
  dev();const f=fixture(),clock=jest.spyOn(Date,'now').mockReturnValue(1000000);
  for(let i=0;i<3;i++) {const r=await runReserve(f.ctx,`bad-${i}`);await runSettle(f.ctx,{id:r.id,success:false,error:'timeout'});}
  expect((await runReserve(f.ctx,'fast-retry')).error).toBe('circuit');expect(f.rows.filter(a=>a.table==='llmAttempts')).toHaveLength(3);
  clock.mockReturnValue(1300001);const r=await runReserve(f.ctx,'cooled');expect(r.id).toBeDefined();
  await runSettle(f.ctx,{id:r.id,success:false,error:'auth'});clock.mockReturnValue(2000000);
  expect((await runReserve(f.ctx,'auth-retry')).error).toBe('circuit');
});
test('无限开发移植到生产或假接口时拒绝，关闭后旧额度立即重新生效',async()=>{
  dev();const f=fixture();process.env.CONVEX_CLOUD_URL='https://example.convex.cloud';
  expect((await runReserve(f.ctx)).error).toBe('config');
  process.env.CONVEX_CLOUD_URL='http://127.0.0.1:3212';process.env.HOUSE_LLM_TEST_ONLY='1';
  expect((await runReserve(f.ctx)).error).toBe('config');
  process.env.HOUSE_LLM_TEST_ONLY='0';process.env.HOUSE_LLM_UNLIMITED_DEV='0';
  await f.ctx.db.insert('llmRealTests',{key:'expired-old-grant',calls:50,committed:10000000,expires:1});
  expect((await runReserve(f.ctx)).error).toBe('budget');
});
