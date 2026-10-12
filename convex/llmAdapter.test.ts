import { llmConfig, reserveCost } from './llmPolicy';
import { requestModel } from './llmTransport';
import { wireRequest } from './llmAdapter';
import { modelTiming, PRIVATE_WATCHDOG_MAX_MS } from './llmTiming';
const env = { HOUSE_LLM_BASE_URL:'https://ai.lfree.org/bot/fixture-tenant', HOUSE_LLM_MODEL:'muse-spark-1.3-contributor',
  HOUSE_LLM_INPUT_CNY_PER_MILLION:'0.02',HOUSE_LLM_OUTPUT_CNY_PER_MILLION:'0.02' };
const c=llmConfig(env), messages=[{role:'user' as const,content:'中文测试'}];
const body=(content: unknown='中文测试回复', extra: any={})=>({model:c.model,choices:[{index:0,message:{content,tool_calls:[]},finish_reason:'stop',...extra}],usage:{prompt_tokens:100,completion_tokens:10,total_tokens:110}});
const fake=(data:unknown, media='application/json')=>(async()=>new Response(JSON.stringify(data),{headers:{'Content-Type':media}})) as typeof fetch;
test('保留已确认的bot Base URL；路径可显式配置且不会重复拼接或默认切换DeepSeek',()=>{
  expect(c.url).toBe('https://ai.lfree.org/bot/fixture-tenant/chat/completions');
  expect(llmConfig({...env,HOUSE_LLM_ENDPOINT_PATH:'/v1/chat/completions'}).url).toBe('https://ai.lfree.org/bot/fixture-tenant/v1/chat/completions');
  expect(llmConfig({...env,HOUSE_LLM_BASE_URL:c.url}).url).toBe(c.url);
  expect(()=>llmConfig({...env,HOUSE_LLM_BASE_URL:undefined})).toThrow('config');
  expect(()=>llmConfig({...env,HOUSE_LLM_ENDPOINT_PATH:'/chat/completions?key=secret'})).toThrow('config');
  expect(()=>llmConfig({...env,HOUSE_LLM_PROTOCOL:'guess'})).toThrow('config');
  expect(()=>llmConfig({...env,HOUSE_LLM_BASE_URL:'https://ai.lfree.org/bot/fixture/v1/messages'})).toThrow('config');
  expect(wireRequest(c,'fake',messages).body).not.toHaveProperty('thinking');
});
test('空tool_calls数组不再误判；不可信usage只有reported字段没有已知Token',async()=>{
  const result=await requestModel(c,'fake',messages,fake(body()));
  expect(result).toMatchObject({text:'中文测试回复',usageKnown:false,evidence:{toolCallCount:0,usageState:'untrusted',reportedInputTokens:100,reportedOutputTokens:10}});
  expect(result.inputTokens).toBeUndefined();
});
test('中转标识记录已知家族的安全ID，拒绝任意供应商文本且不验证上游身份',async()=>{
  const result=await requestModel(c,'fake',messages,fake({...body(),model:'mimo-v2.6-flash'}));
  expect(result.evidence).toMatchObject({responseModelMatches:false,responseModelFamily:'mimo',responseModelId:'mimo-v2.6-flash'});
  for (const model of ['mimo-secret key','mimo://secret.example','mimo-'+ 'x'.repeat(130)]) {
    expect((await requestModel(c,'fake',messages,fake({...body(),model}))).evidence.responseModelId).toBeUndefined();
  }
  const malicious=await requestModel(c,'fake',messages,fake({...body(),model:'sensitive-provider-controlled-string'}));
  expect(malicious.evidence.responseModelFamily).toBe('other');
  expect(JSON.stringify(malicious.evidence)).not.toContain('sensitive-provider');
});
test('兼容明确的文本分块及lfree外层data；不从任意字段猜测正文',async()=>{
  const result=await requestModel(c,'fake',messages,fake({data:body([{type:'text',text:'第一段中文。'},{type:'output_text',text:'第二段。'}])}));
  expect(result.text).toBe('第一段中文。第二段。');
  await expect(requestModel(c,'fake',messages,fake({answer:'不能从这个字段猜测正文'}))).rejects.toMatchObject({evidence:{reason:'missing_choices'}});
});
test('缺choices、message、非中文、实际工具调用提供独立诊断原因',async()=>{
  for(const [data,reason] of [[{choices:[]},'missing_choices'],[{choices:[{}]},'missing_message'],[body('English only'),'non_chinese'],
    [body('中文',{message:{content:'中文',tool_calls:[{id:'private-secret'}]}}),'tool_call']] as const){
    await expect(requestModel(c,'fake',messages,fake(data))).rejects.toMatchObject({code:'invalid',evidence:{reason}});
  }
});
test('仅推理和max_tokens收尾与合法截短中文回复区分',async()=>{
  const data=body(null,{message:{content:null,reasoning_content:'私有推理测试'},finish_reason:'length'});
  await expect(requestModel(c,'fake',messages,fake(data))).rejects.toMatchObject({evidence:{reason:'reasoning_only',finishReason:'length',truncated:true}});
  const good=await requestModel(c,'fake',messages,fake(body('已经生成部分中文',{finish_reason:'length'})));
  expect(good.evidence).toMatchObject({reason:'ok',finishReason:'length',truncated:true});
});
test('任务5.1实测结构回归：正文缺失、仅推理且256 Token截断不变成AI回复或自动重试',async()=>{
  // Synthetic structure only. Never store/replay the supplier's hidden reasoning.
  const config={...c,model:'claude-opus-5',maxTokens:256};
  const data={model:'mimo-local-regression',choices:[{index:0,message:{role:'assistant',reasoning_content:'仅本机合成占位'},finish_reason:'length'}],
    usage:{prompt_tokens:2171,completion_tokens:256,total_tokens:2427}};
  try {
    await requestModel(config,'not-a-real-key',messages,fake(data));
    throw new Error('expected rejection');
  } catch(e:any) {
    expect(e).toMatchObject({code:'invalid',retryable:false,evidence:{httpStatus:200,reason:'reasoning_only',contentType:'missing',contentChars:0,
      finishReason:'length',truncated:true,maxOutputTokens:256,reportedInputTokens:2171,reportedOutputTokens:256,
      responseModelFamily:'mimo',responseModelMatches:false,usageState:'untrusted'}});
    expect(JSON.stringify(e.evidence)).not.toMatch(/合成占位|not-a-real-key/);
  }
});
test('用量缺失、不一致、字符串数字和超过请求上限不伪造可信用量',async()=>{
  const missing=body();delete (missing as any).usage;
  expect((await requestModel(c,'fake',messages,fake(missing))).evidence.usageState).toBe('missing');
  const inconsistent={...body(),usage:{prompt_tokens:100,completion_tokens:10,total_tokens:1}};
  expect((await requestModel({...c,usagePolicy:'reported'},'fake',messages,fake(inconsistent))).usageKnown).toBe(false);
  const strings={...body(),usage:{prompt_tokens:'100',completion_tokens:'10',total_tokens:'110'}};
  expect((await requestModel(c,'fake',messages,fake(strings))).evidence).toMatchObject({usageState:'untrusted',reportedOutputTokens:10});
  const over={...body(),usage:{prompt_tokens:100,completion_tokens:300,total_tokens:400}};
  expect((await requestModel(c,'fake',messages,fake(over))).evidence.usageState).toBe('over_limit');
  await expect(requestModel({...c,usagePolicy:'reported'},'fake',messages,fake(over))).rejects.toMatchObject({evidence:{reason:'output_limit'}});
});
test('Claude协议的请求与响应独立适配，不能把协议不符归为中文异常',async()=>{
  const native=llmConfig({...env,HOUSE_LLM_PROTOCOL:'anthropic-messages'});
  expect(native.url).toBe('https://ai.lfree.org/bot/fixture-tenant/v1/messages');
  const wire=wireRequest(native,'fake',[{role:'system',content:'系统测试'},...messages]);
  expect(wire.headers).toHaveProperty('x-api-key','fake');expect(wire.headers).not.toHaveProperty('Authorization');
  expect(wire.body).toMatchObject({system:'系统测试',messages,max_tokens:256});
  const response={type:'message',content:[{type:'thinking',thinking:'秘密推理'},{type:'text',text:'普通中文回答'}],stop_reason:'end_turn',usage:{input_tokens:20,output_tokens:30}};
  expect((await requestModel(native,'fake',messages,fake(response))).text).toBe('普通中文回答');
  expect((await requestModel(native,'fake',messages,fake({...response,content:[{type:'redacted_thinking',data:'masked'},{type:'text',text:'不展示推理的中文'}]}))).text).toBe('不展示推理的中文');
  await expect(requestModel(c,'fake',messages,fake(response))).rejects.toMatchObject({evidence:{reason:'protocol_mismatch'}});
});
test('HTML/SSE与非法JSON能区分，诊断不含Key、请求正文或私有推理',async()=>{
  await expect(requestModel(c,'secret-key',messages,fake(body(),'text/html'))).rejects.toMatchObject({evidence:{reason:'non_json',mediaType:'html'}});
  try { await requestModel(c,'secret-key',[{role:'user',content:'私人消息秘密'}],fake(body(null,{message:{content:null,reasoning_content:'私人推理秘密'},finish_reason:'length'}))); }
  catch(e:any){const record=JSON.stringify(e.evidence);expect(record).not.toMatch(/secret-key|私人消息秘密|私人推理秘密/);}
});
test('60秒请求租约90秒、两次尝试看门狗165秒；不可信价格保守预留而不是沿用0.02报价',()=>{
  expect(modelTiming(60000)).toEqual({leaseMs:90000,privateWatchdogMs:165000});
  expect(PRIVATE_WATCHDOG_MAX_MS).toBe(225000);
  expect(reserveCost(messages,c)).toBe(1000000);
  const verified=llmConfig({...env,HOUSE_LLM_PRICE_CONFIRMED:'1',HOUSE_LLM_BILLING_MODE:'token',HOUSE_LLM_USAGE_TRUST:'reported'});
  expect(reserveCost(messages,verified)).toBeLessThan(1000000);
});
test('延迟与Abort只在本地假fetch验证，不调用中转站',async()=>{
  const delayed=((_u:any,init:any)=>new Promise<Response>((resolve,reject)=>{
    const timer=setTimeout(()=>resolve(new Response(JSON.stringify(body()))),30);
    init.signal.addEventListener('abort',()=>{clearTimeout(timer);reject(new Error('private wire text'));});
  })) as typeof fetch;
  expect((await requestModel({...c,timeoutMs:100},'fake',messages,delayed)).text).toContain('中文');
  await expect(requestModel({...c,timeoutMs:10},'fake',messages,delayed)).rejects.toMatchObject({code:'timeout',evidence:{reason:'timeout',stage:'headers'}});
});
