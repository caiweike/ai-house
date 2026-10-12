import { useMemo } from 'react';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import type { GameId } from '../../convex/aiTown/ids';
import type { SerializedPlayer } from '../../convex/aiTown/player';
import type { SerializedConversation } from '../../convex/aiTown/conversation';

export type HousePlayer = Omit<SerializedPlayer, 'id'> & { id: GameId<'players'> };
export type HouseGame = {
  world: {
    players: Map<GameId<'players'>, HousePlayer>;
    conversations: Map<string, SerializedConversation>;
    historicalLocations: Map<GameId<'players'>, ArrayBuffer>;
    playerConversation: (player: HousePlayer) => SerializedConversation | undefined;
  };
  playerDescriptions: Map<GameId<'players'>, { name: string; description: string; character: string }>;
};

// Read-only projection of Convex state. Simulation classes and server handlers stay on the server.
export function useHouseGame(worldId?: Id<'worlds'>): HouseGame | undefined {
  const snapshot = useQuery(api.world.worldState, worldId ? { worldId } : 'skip');
  const descriptions = useQuery(api.world.gameDescriptions, worldId ? { worldId } : 'skip');
  return useMemo(() => {
    if (!snapshot || !descriptions) return undefined;
    const players = new Map(snapshot.world.players.map((p) => [p.id as GameId<'players'>, { ...p, id: p.id as GameId<'players'> }]));
    const conversations = new Map(snapshot.world.conversations.map((c) => [c.id, c]));
    return {
      world: { players, conversations,
        historicalLocations: new Map((snapshot.world.historicalLocations ?? []).map((h) => [h.playerId as GameId<'players'>, h.location])),
        playerConversation: (p: HousePlayer) => [...conversations.values()].find((c) => c.participants.some((m) => m.playerId === p.id)),
      },
      playerDescriptions: new Map(descriptions.playerDescriptions.map((d) => [d.playerId as GameId<'players'>, d])),
    };
  }, [snapshot, descriptions]);
}
