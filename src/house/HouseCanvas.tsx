import { useCallback } from 'react';
import { Container, Graphics, Stage, Text } from '@pixi/react';
import { Graphics as PixiGraphics, Rectangle, TextStyle } from 'pixi.js';
import { furniture, residents, TILE, HOUSE_WIDTH, HOUSE_HEIGHT, wallAt } from '../../data/house';
import type { HouseGame as ServerGame, HousePlayer as Player } from './houseGame';
import { useHistoricalValue } from '../hooks/useHistoricalValue';
import { Location, locationFields } from '../../convex/aiTown/location';
import type { Doc } from '../../convex/_generated/dataModel';
import type { GameId } from '../../convex/aiTown/ids';
import { useHistoricalTime } from '../hooks/useHistoricalTime';
import { messageSource } from './messageSource';

const font = 'Microsoft YaHei, PingFang SC, Noto Sans CJK SC, sans-serif';
const labelStyle = new TextStyle({ fontFamily: font, fontSize: 13, fill: 0x604e40, fontWeight: '500' });
const nameStyle = new TextStyle({ fontFamily: font, fontSize: 12, fill: 0x493f35, stroke: 0xfff6e4, strokeThickness: 3 });
const badgeStyle = new TextStyle({ fontFamily: font, fontSize: 12, fill: 0x4d6752, stroke: 0xfaf5e8, strokeThickness: 4 });
const corridorStyle = new TextStyle({ fontFamily: font, fontSize: 12, fill: 0x8b715a });
const residentHitArea = new Rectangle(-18, -25, 36, 48);

function drawInterior(g: PixiGraphics) {
  g.clear();
  const rect = (x: number, y: number, w: number, h: number, color: number) => { g.beginFill(color); g.drawRect(x, y, w, h); g.endFill(); };
  rect(0, 0, 720, 520, 0xc3a17b);
  for (let y = 1; y < 25; y++) for (let x = 1; x < 35; x++) {
    const shade = y < 11 ? [0xe9e4d9, 0xf0e1d4, 0xe7e9d7][Math.min(2, Math.floor(x / 12))] : y < 14 ? 0xd6b78f : (x + y) % 2 ? 0xe9cda8 : 0xe6c8a0;
    rect(x * TILE, y * TILE, TILE, TILE, shade);
    rect(x * TILE, y * TILE + 19, TILE, 1, 0xd6bd9b);
    if (y > 13) rect(x * TILE + (y % 2 ? 0 : 10), y * TILE, 1, 20, 0xdec09a);
  }
  rect(238, 300, 192, 170, 0xc09d85); rect(244, 306, 180, 158, 0xe5bd9e); rect(252, 314, 164, 142, 0xdcb28e);
  for (let y = 326; y < 450; y += 18) rect(260, y, 148, 2, 0xe9c9a9);
  for (let i = 0; i < 3; i++) {
    rect(142 + i * 240, 20, 54, 15, 0x9c7d65); rect(146 + i * 240, 20, 46, 11, 0xbad9da);
    rect(167 + i * 240, 20, 4, 13, 0xfaf1dc); rect(140 + i * 240, 33, 58, 4, 0xc3a17b);
  }
  for (let x = 0; x < HOUSE_WIDTH; x++) for (let y = 0; y < HOUSE_HEIGHT; y++) if (wallAt(x, y)) {
    rect(x * TILE, y * TILE, TILE, TILE, 0x8e725c); rect(x * TILE, y * TILE, TILE, 7, 0xcbb495);
    rect(x * TILE, y * TILE + 7, TILE, 9, 0xe7d7bc); rect(x * TILE, y * TILE + 16, TILE, 4, 0xa3886d);
  }
  for (const x of [6, 18, 30]) { rect(x * TILE, 220, 20, 20, 0xe1c4a0); rect(x * TILE, 220, 20, 3, 0x9f795d); rect(x * TILE, 237, 20, 3, 0x9f795d); }
  for (const f of furniture) {
    const x = f.x * TILE, y = f.y * TILE, w = f.w * TILE, h = f.h * TILE;
    rect(x + 4, y + 5, w, h, 0xc3aa8b);
    if (f.kind === 'bed') {
      rect(x, y, w, h, 0x997457); rect(x + 4, y + 4, w - 8, h - 8, 0xf5ead8);
      rect(x + 7, y + 9, w - 14, 15, 0xfffaf0); rect(x + 4, y + 30, w - 8, h - 36, residents[f.owner!].color);
      rect(x + 10, y + 35, w - 20, 3, 0xe9dfd0); rect(x, y, w, 5, 0xb28a62);
    } else if (f.kind === 'desk') {
      rect(x, y, w, h, 0x8e6849); rect(x + 3, y + 3, w - 6, h - 8, 0xc89865);
      rect(x + 8, y + 8, 20, 15, 0xf4ecda); rect(x + 9, y + 10, 8, 2, 0x8c9eaa); rect(x + 33, y + 7, 12, 14, residents[f.owner!].color); rect(x + 36, y + 9, 6, 8, 0xc8dedc);
    } else if (f.kind === 'shelf') {
      rect(x, y, w, h, 0x8e694a); rect(x + 4, y + 4, w - 8, h - 8, 0xc3986a);
      for (let i = 0; i < 10; i++) rect(x + 7 + i * 8, y + 6, 6, 21 + i % 5, [0x749197, 0xc7806c, 0x9ba97a, 0xe8d7a0][i % 4]);
      rect(x, y + h - 9, w, 4, 0x8e694a);
    } else if (f.kind === 'sofa') {
      rect(x, y, w, h, 0x677e6e); rect(x + 5, y + 4, w - 10, h - 7, 0x94ac91); rect(x + 10, y + 5, w - 20, 9, 0xa6bca0);
      for (let i = 0; i < 3; i++) rect(x + 15 + i * 37, y + 17, 33, 17, 0xb1c2a3);
      rect(x, y + 8, 8, 27, 0x789180); rect(x + w - 8, y + 8, 8, 27, 0x789180);
    } else if (f.kind === 'plant') {
      rect(x + w * .25, y + h * .65, w * .5, h * .3, 0xbd8463); rect(x + w * .45, y + h * .1, w * .1, h * .6, 0x56704b);
      rect(x + w * .1, y + h * .2, w * .35, h * .3, 0x809464); rect(x + w * .5, y + h * .1, w * .4, h * .3, 0x6a8759);
    } else {
      rect(x, y, w, h, 0x956d4d); rect(x + 3, y + 3, w - 6, h - 8, 0xcc9c6c);
      rect(x + 13, y + 12, 13, 13, 0xf3ead7); rect(x + 15, y + 14, 9, 9, 0x987753);
      rect(x + w - 25, y + 10, 16, 20, 0xe1d5b3); rect(x + w - 23, y + 14, 10, 2, 0xa6ad8b);
    }
  }
}

function ResidentSprite({ game, player, historicalTime, selected, onSelect }: { game: ServerGame; player: Player; historicalTime?: number; selected?: string; onSelect: (id: string) => void }) {
  const name = game.playerDescriptions.get(player.id)?.name;
  const resident = residents.find((r) => r.name === name) ?? residents[0];
  const point = useHistoricalValue<Location>(locationFields, historicalTime, { x: player.position.x, y: player.position.y, dx: player.facing.dx, dy: player.facing.dy, speed: player.speed }, game.world.historicalLocations.get(player.id));
  const walk = point && point.speed > 0 ? Math.floor((historicalTime ?? 0) / 180) % 2 : 0;
  const pose = player.houseTask?.stage === 'using' ? player.houseTask.emoji : '';
  const draw = useCallback((g: PixiGraphics) => {
    g.clear();
    const rect = (x: number, y: number, w: number, h: number, color: number) => { g.beginFill(color); g.drawRect(x, y, w, h); g.endFill(); };
    g.beginFill(0x664c38, .18); g.drawEllipse(0, 9, 10, 4); g.endFill();
    if (selected === player.id) { g.lineStyle(2, 0xa46e46); g.drawEllipse(0, 10, 13, 5); g.lineStyle(0); }
    rect(-6, -3, 12, 12, resident.color); rect(-8, 0, 3, 7, 0xe3b996); rect(5, 0, 3, 7, 0xe3b996);
    rect(-5, 8, 4, 5 - walk * 2, 0x584d49); rect(1, 8, 4, 3 + walk * 2, 0x584d49);
    rect(-6, -17, 12, 12, resident.hair); rect(-5, -12, 10, 9, 0xe8c3a3); rect(-7, -17, 14, 6, resident.hair);
    rect(-3, -9, 2, pose === '休' ? 1 : 2, 0x433b38); rect(2, -9, 2, pose === '休' ? 1 : 2, 0x433b38); rect(-1, -5, 3, 1, 0xb77f6c);
    if (pose === '读' || pose === '思') { rect(-7, 1, 14, 7, 0xf7e8c3); rect(0, 1, 1, 7, 0xa5916e); rect(-5, 3, 3, 1, 0xb9a585); }
  }, [resident, selected, player.id, walk, pose]);
  if (!point) return null;
  const conversation = game.world.playerConversation(player);
  const badge = conversation ? '聊' : player.houseTask?.stage === 'using' ? player.houseTask.emoji : player.pathfinding ? '走' : '待';
  return <Container x={point.x * TILE + TILE / 2} y={point.y * TILE + TILE / 2}>
    <Graphics draw={draw} eventMode="static" cursor="pointer" hitArea={residentHitArea} pointertap={() => onSelect(player.id)} />
    <Text text={resident.name} anchor={[.5, 0]} x={0} y={16} style={nameStyle} eventMode="none" />
    <Text text={badge} x={10} y={-27} style={badgeStyle} eventMode="none" />
  </Container>;
}

export function HouseCanvas({ game, engine, selected, onSelect, messages }: { game: ServerGame; engine?: Doc<'engines'>; selected?: string; onSelect: (id: string) => void; messages: Doc<'messages'>[] }) {
  const { historicalTime } = useHistoricalTime(engine);
  const draw = useCallback(drawInterior, []);
  return <div className="map-frame" aria-label="俯视像素小屋：上方是三间独立卧室，中间门与走廊连通，下方是客厅、沙发、茶几和公共书架。居民可在地图上点击。">
    <Stage width={HOUSE_WIDTH * TILE} height={HOUSE_HEIGHT * TILE} options={{ backgroundColor: 0xf1e6d3, antialias: false, resolution: 1, autoDensity: true }}>
      <Graphics draw={draw} />
      {residents.map((r, i) => <Text key={r.name} text={`${r.name}的卧室`} x={i * 240 + 76} y={185} style={labelStyle} eventMode="none" />)}
      <Text text="公共书架" x={62} y={286} style={labelStyle} eventMode="none" />
      <Text text="客厅 · 一起歇一会儿" x={268} y={478} style={labelStyle} eventMode="none" />
      <Text text="连通走廊" x={312} y={249} style={corridorStyle} eventMode="none" />
      {[...game.world.players.values()].sort((a, b) => a.position.y - b.position.y).map((p) => <ResidentSprite key={p.id} game={game} player={p} historicalTime={historicalTime} selected={selected} onSelect={onSelect} />)}
    </Stage>
    {[...game.world.conversations.values()].map((c) => {
      const latest = messages.filter((m) => m.conversationId === c.id).at(-1);
      if (!latest || (historicalTime ?? Date.now()) - latest._creationTime > 20000) return null;
      const p = game.world.players.get(latest.author as GameId<'players'>);
      if (!p) return null;
      return <div className="map-speech" key={c.id} style={{ left: `${Math.max(24, Math.min(76, (p.position.x + .5) / HOUSE_WIDTH * 100))}%`, top: `${(p.position.y - .8) / HOUSE_HEIGHT * 100}%` }}><small>{game.playerDescriptions.get(p.id)?.name} · {messageSource(latest.mode)}</small><p>{latest.text.replace(/^\[模拟对话\]\s*/, '')}</p></div>;
    })}
  </div>;
}
