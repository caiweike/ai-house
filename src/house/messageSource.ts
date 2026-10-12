export function messageSource(mode?: string) {
  return mode === 'live' ? '真实 AI' : mode === 'test' ? '本机测试接口 · 非真实 AI' : mode === 'rule' ? '系统提示 · 未生成 AI 回复' : '模拟回复 · 未调用真实模型';
}
