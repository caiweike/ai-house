import { messageSource } from './messageSource';
test('真实、假接口、模拟和无回复系统提示不能混淆，旧记录默认模拟', () => {
  expect(messageSource('live')).toBe('真实 AI');
  expect(messageSource('test')).toContain('非真实 AI');
  expect(messageSource('mock')).toContain('模拟');
  expect(messageSource('rule')).toContain('未生成');
  expect(messageSource()).toBe(messageSource('mock'));
});
