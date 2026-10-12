import { llmConfig } from './llmPolicy';
import { liveMode, unlimitedDev } from './llmDev';
const env = { HOUSE_LLM_UNLIMITED_DEV:'1',HOUSE_ENVIRONMENT:'local-development',
  CONVEX_CLOUD_URL:'http://127.0.0.1:3212',CONVEX_SITE_URL:'http://127.0.0.1:3213',
  HOUSE_LLM_BASE_URL:'https://example.test/v1',HOUSE_LLM_MODEL:'fake',
  HOUSE_LLM_INPUT_CNY_PER_MILLION:'2',HOUSE_LLM_OUTPUT_CNY_PER_MILLION:'8' };
test('显式本地开发默认真实与2048输出，单次可调整至8192，仍有硬上限',()=>{
  expect(unlimitedDev(env)).toBe(true);expect(liveMode(env)).toBe(true);
  expect(llmConfig(env).maxTokens).toBe(2048);
  expect(llmConfig({...env,HOUSE_LLM_MAX_OUTPUT_TOKENS:'8192'}).maxTokens).toBe(8192);
  expect(()=>llmConfig({...env,HOUSE_LLM_MAX_OUTPUT_TOKENS:'8193'})).toThrow();
});
test('生产、任意一侧非本机、缺少环境标记、测试假接口均拒绝无限模式',()=>{
  for(const changes of [{CONVEX_CLOUD_URL:'https://prod.convex.cloud'}, {CONVEX_SITE_URL:'https://prod.convex.site'},
    {CONVEX_CLOUD_URL:'http://0.0.0.0:3212'}, {HOUSE_ENVIRONMENT:'production'}, {HOUSE_ENVIRONMENT:undefined},
    {CONVEX_DEPLOYMENT:'prod:example'}, {HOUSE_LLM_TEST_ONLY:'1'}]) {
    expect(()=>unlimitedDev({...env,...changes})).toThrow();expect(liveMode({...env,...changes})).toBe(true);
  }
  expect(unlimitedDev({...env,HOUSE_LLM_UNLIMITED_DEV:'0'})).toBe(false);
});
