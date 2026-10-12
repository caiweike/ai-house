import { residents } from '../data/house';

export type PrivateReply = { text: string; mode: 'mock' };
// Stage 4 replaces this adapter behind a validated, budgeted backend gateway.
// It receives only this resident's permitted context; never writes public world memory.
export function privateReply(residentIndex: number): PrivateReply {
  const replies = [
    '我会把这段话留在我们的小窗里。现在可以一起聊聊读书或今天的安排。',
    '收到你的悄悄话啦！可以说说今天的小开心，也可以慢慢写下想说的话。',
    '这条消息已记录在我们的独立会话中。你可以继续补充问题或想法。',
  ];
  return { text: `【模拟回复 · 中文模板】${residents[residentIndex].name}：${replies[residentIndex]}（未调用真实模型，不代表理解或推理。）`, mode: 'mock' };
}
