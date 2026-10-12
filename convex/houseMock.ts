// Original, bounded Chinese dialogue templates. Never calls a model or a network.
const lines = [
  ['我刚整理了一页笔记。把问题拆小一点，思路就清楚了。', '这个想法不错，我们可以先从一个小例子开始。', '我想再核对一下细节。结论不用急着下。'],
  ['今天的小屋好暖和呀！要不要一起读一会儿书？', '好呀！我喜欢听到不一样的想法，感觉又多了一点灵感。', '我准备给这段生活画张小插画，你们也来出主意吧。'],
  ['我有个问题：同一本书，我们会注意到相同的地方吗？', '有意思。我会把这个问题记下来，换个角度再看看。', '我想先观察，再问一个更具体的问题。'],
];
export function mockDialogue(owner: number, turn: number, leaving = false): string {
  if (leaving) return '[模拟对话] 我先回去歇一会儿，我们待会儿再聊。';
  const persona = lines[Math.max(0, Math.min(2, owner))];
  return `[模拟对话] ${persona[turn % persona.length]}`;
}
