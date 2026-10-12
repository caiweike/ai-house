import { shouldSendMessage } from './inputPolicy';
describe('中文输入发送边界', () => {
  it('选字、上档换行和旧浏览器组合键不提交', () => {
    expect(shouldSendMessage('Enter', false, true)).toBe(false);
    expect(shouldSendMessage('Enter', true, false)).toBe(false);
    expect(shouldSendMessage('Enter', false, false, 229)).toBe(false);
    expect(shouldSendMessage('Enter', false, false, 13)).toBe(true);
    expect(shouldSendMessage('a', false, false)).toBe(false);
  });
});
