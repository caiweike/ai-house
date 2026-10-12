import type { Game } from './aiTown/game';
import type { Player } from './aiTown/player';
import type { Agent } from './aiTown/agent';
import { movePlayer, stopPlayer, blocked } from './aiTown/movement';
import { distance } from './util/geometry';
import { residents, routine } from '../data/house';
import { CONVERSATION_COOLDOWN } from './constants';

// The original engine calls this policy. No browser timer or second world loop.
export function houseRoutine(game: Game, now: number, player: Player, agent: Agent) {
  const description = game.playerDescriptions.get(player.id);
  const owner = residents.findIndex((r) => r.name === description?.name);
  if (owner < 0) return;
  if (agent.toRemember) delete agent.toRemember; // S1 keeps messages, no paid summarization.
  const task = player.houseTask;
  if (task?.stage === 'using') {
    if (player.activity && player.activity.until > now) {
      if (task.furnitureId.startsWith('chat-') &&
          (!agent.lastConversation || now > agent.lastConversation + CONVERSATION_COOLDOWN)) {
        const other = [...game.world.players.values()].find((p) =>
          p.id !== player.id && p.position.y >= 14 && distance(p.position, player.position) <= 2 &&
          !game.world.playerConversation(p) &&
          [...game.world.agents.values()].some(a => a.playerId === p.id &&
            (!a.lastConversation || now > a.lastConversation + CONVERSATION_COOLDOWN)));
        if (other) {
          game.handleInput(now, 'startConversation', { playerId: player.id, invitee: other.id });
          delete player.houseTask;
          delete other.houseTask;
          delete player.activity;
          delete other.activity;
          agent.lastInviteAttempt = now;
        }
      }
      return;
    }
    delete player.houseTask;
    delete player.activity;
    player.houseCycle = (player.houseCycle ?? 0) + 1;
  }
  if (player.houseTask?.stage === 'walking') {
    if (distance(player.position, player.houseTask.destination) < 0.05) {
      stopPlayer(player);
      player.houseTask.stage = 'using';
      player.activity = { description: player.houseTask.activity, emoji: player.houseTask.emoji,
        until: now + (player.houseTask.furnitureId.startsWith('chat-') ? 22_000 : 12_000) };
    } else if (!player.pathfinding) {
      // Dynamic obstruction is retried by the original pathfinder.
      movePlayer(game, now, player, player.houseTask.destination);
    }
    return;
  }
  const next = routine(owner, player.houseCycle ?? 0);
  const occupied = [...game.world.players.values()].some((p) =>
    p.id !== player.id && p.houseTask?.furnitureId === next.furnitureId);
  if (occupied || blocked(game, now, next.destination, player.id)) {
    player.activity = { description: '等待空闲座位', until: now + 1500 };
    return;
  }
  player.houseTask = { ...next, started: now, stage: 'walking' };
  player.activity = { description: `前往${next.activity.replace(/^在/, '')}`, until: now + 120_000 };
  movePlayer(game, now, player, next.destination);
}
