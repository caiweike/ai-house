// IME candidate confirmation must never be treated as message submission.
export function shouldSendMessage(key: string, shift: boolean, composing: boolean, keyCode?: number) {
  return key === 'Enter' && !shift && !composing && keyCode !== 229;
}
