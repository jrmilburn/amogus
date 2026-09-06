import type {
  GameState,
  Role,
  WinReason,
  ServerMessages,
} from '@mutiny/shared';
import type { RoundAssignments } from './round.js';
export function evaluateWin(
  state: GameState,
  round: RoundAssignments,
  now = Date.now(),
): { winner: Role; reason: WinReason } | undefined {
  if (!['playing', 'ejection'].includes(state.phase) || !round.players.size)
    return;
  if (state.sabotage?.endsAt && now >= state.sabotage.endsAt)
    return {
      winner: 'impostor',
      reason: state.sabotage.kind as 'reactor' | 'o2',
    };
  const crew = [...round.players.values()].filter((p) => p.role === 'crew');
  if (crew.length && crew.every((p) => p.tasks.every((t) => t.completed)))
    return { winner: 'crew', reason: 'tasks' };
  const living = [...state.players.values()].filter((p) => p.alive);
  const impostors = living.filter(
    (p) => round.players.get(p.id)?.role === 'impostor',
  ).length;
  if (!impostors) return { winner: 'crew', reason: 'noImpostors' };
  if (impostors >= living.length - impostors)
    return { winner: 'impostor', reason: 'parity' };
}
export function resultPayload(
  state: GameState,
  round: RoundAssignments,
  result: { winner: Role; reason: WinReason },
): ServerMessages['gameOver'] {
  return {
    ...result,
    roundId: state.roundId,
    roles: Object.fromEntries(
      [...round.players].map(([id, p]) => [id, p.role]),
    ),
    lineup: [...state.players.values()].map((p) => ({
      id: p.id,
      name: p.name,
      color: p.color,
      role: round.players.get(p.id)!.role,
    })),
  };
}
