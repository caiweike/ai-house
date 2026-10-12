// Original indoor layout, shared by the server collision map and the Pixi view.
export const HOUSE_WIDTH = 36;
export const HOUSE_HEIGHT = 26;
export const TILE = 20;
export type Point = { x: number; y: number };
export type Furniture = {
  id: string; name: string; kind: 'bed' | 'desk' | 'shelf' | 'sofa' | 'table' | 'plant';
  x: number; y: number; w: number; h: number;
  owner?: number; seats?: Point[];
};
export const residents = [
  { name: '艾莉丝', character: 'f3', color: 0x7c94c0, hair: 0x493e50, tag: '理性 · 细致',
    identity: '喜欢把问题想清楚，也喜欢安静的阅读时光。说话温和、严谨，偶尔有一点冷幽默。',
    plan: '在自己的书桌整理笔记，到客厅和室友交换新发现。', spawn: { x: 6, y: 8 } },
  { name: '桃桃', character: 'f1', color: 0xc88075, hair: 0x76523d, tag: '活泼 · 亲切',
    identity: '喜欢画画、暖色和日常的小惊喜。说话轻快亲切，愿意主动关心室友。',
    plan: '照顾小屋的植物，读一会儿书，再邀请室友坐下来聊聊。', spawn: { x: 18, y: 8 } },
  { name: '诺瓦', character: 'f6', color: 0x879d7c, hair: 0x353f4d, tag: '好奇 · 简洁',
    identity: '总想知道事物为什么会这样。喜欢做笔记和提问，表达简洁、直接而友善。',
    plan: '阅读公共书架上的书，记录问题，然后听听室友的不同想法。', spawn: { x: 30, y: 8 } },
];
export const doors = [{ x: 6, y: 11 }, { x: 18, y: 11 }, { x: 30, y: 11 }];
export const furniture: Furniture[] = [
  ...residents.flatMap((resident, owner): Furniture[] => [
    { id: `bed-${owner}`, name: `${resident.name}的床`, kind: 'bed', owner,
      x: 2 + owner * 12, y: 3, w: 3, h: 4, seats: [{ x: 3 + owner * 12, y: 7 }] },
    { id: `desk-${owner}`, name: `${resident.name}的书桌`, kind: 'desk', owner,
      x: 8 + owner * 12, y: 4, w: 3, h: 2, seats: [{ x: 9 + owner * 12, y: 6 }] },
    { id: `plant-${owner}`, name: '窗边绿植', kind: 'plant', owner,
      x: 9 + owner * 12, y: 2, w: 1, h: 1 },
  ]),
  { id: 'shelf', name: '公共书架', kind: 'shelf', x: 2, y: 16, w: 5, h: 2,
    seats: [{ x: 3, y: 18 }, { x: 5, y: 18 }] },
  { id: 'sofa', name: '客厅沙发', kind: 'sofa', x: 13, y: 16, w: 7, h: 2,
    seats: [{ x: 14, y: 18 }, { x: 18, y: 18 }] },
  { id: 'coffee', name: '茶几', kind: 'table', x: 15, y: 20, w: 4, h: 2 },
  { id: 'plant-public', name: '客厅绿植', kind: 'plant', x: 32, y: 16, w: 2, h: 2 },
  { id: 'table-public', name: '交流小桌', kind: 'table', x: 28, y: 20, w: 3, h: 2 },
];
export function wallAt(x: number, y: number): boolean {
  if (x === 0 || y === 0 || x === 35 || y === 25) return true;
  if ((x === 12 || x === 24) && y < 11) return true;
  return y === 11 && !doors.some((door) => door.x === x);
}
export function solidAt(x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= HOUSE_WIDTH || y >= HOUSE_HEIGHT) return true;
  return wallAt(x, y) || furniture.some((f) =>
    x >= f.x && x < f.x + f.w && y >= f.y && y < f.y + f.h);
}
export function roomAt(position: Point): string {
  if (position.y < 11) {
    const owner = Math.max(0, Math.min(2, Math.floor(position.x / 12)));
    return `${residents[owner].name}的卧室`;
  }
  return position.y < 14 ? '连通走廊' : '公共客厅';
}
export const mapwidth = HOUSE_WIDTH;
export const mapheight = HOUSE_HEIGHT;
export const tiledim = TILE;
export const tilesetpath = '/house/原创室内地图'; // Graphics renderer; no external texture.
export const tilesetpxw = TILE;
export const tilesetpxh = TILE;
export const bgtiles = [Array.from({ length: HOUSE_WIDTH }, () => Array(HOUSE_HEIGHT).fill(0))];
export const objmap = [Array.from({ length: HOUSE_WIDTH }, (_, x) =>
  Array.from({ length: HOUSE_HEIGHT }, (_, y) => solidAt(x, y) ? 0 : -1))];
export const animatedsprites: never[] = [];

export type HouseTask = {
  furnitureId: string; destination: Point; activity: string; emoji: string;
  started: number; stage: 'walking' | 'using';
};
export function routine(owner: number, cycle: number): Omit<HouseTask, 'started' | 'stage'> {
  const steps = [
    { id: `bed-${owner}`, activity: '在床边休息', emoji: '休' },
    { id: `desk-${owner}`, activity: '在书桌整理笔记', emoji: '思' },
    { id: 'shelf', activity: '在公共书架阅读', emoji: '读' },
    { id: 'sofa', activity: '在沙发旁放松', emoji: '闲' },
    { id: 'chat', activity: '在客厅和室友交流', emoji: '聊' },
  ];
  const step = steps[cycle % steps.length];
  if (step.id === 'chat') return { furnitureId: `chat-${owner}`, destination: { x: 24 + owner, y: 19 }, activity: step.activity, emoji: step.emoji };
  const f = furniture.find((item) => item.id === step.id)!;
  const seat = owner % f.seats!.length;
  return { furnitureId: `${step.id}:${seat}`, destination: f.seats![seat], activity: step.activity, emoji: step.emoji };
}
