import type { GameState, PublicGameState } from '#shared/types/game'
import { playerBySeat } from './turn'

/**
 * The ONLY way game state reaches a client. Everything hidden in the physical
 * game stays hidden here:
 *
 *   - other players' hands become a count
 *   - the draw pile becomes a count (never its contents or order)
 *   - See/Alter the Future results go only to the player who looked
 *   - interaction `cards` go only to the players who must answer
 *   - interaction `context` is dropped entirely (it carries the uid of a
 *     kitten mid-reinsertion, and where a player hid it)
 *
 * The discard pile is deliberately public — it is face up on the table.
 */
export function projectStateFor(state: GameState, viewerId: string | null): PublicGameState {
  const viewer = viewerId ? state.players.find((p) => p.id === viewerId) : undefined
  const current = playerBySeat(state, state.turn.seat)

  let interaction: PublicGameState['interaction'] = null
  if (state.interaction) {
    const isForYou = Boolean(viewerId && state.interaction.requiredFrom.includes(viewerId))
    const { cards, context: _context, responses, ...rest } = state.interaction
    interaction = {
      ...rest,
      isForYou,
      cards: isForYou ? cards?.map((c) => ({ ...c })) : undefined,
      answered: Object.keys(responses),
    }
  }

  return {
    roomId: state.roomId,
    status: state.status,
    players: state.players.map((p) => ({
      id: p.id,
      nickname: p.nickname,
      seat: p.seat,
      handCount: p.hand.length,
      alive: p.alive,
      connected: p.connected,
    })),
    drawCount: state.drawPile.length,
    discardTop: state.discardPile[0] ? { ...state.discardPile[0] } : null,
    discardCount: state.discardPile.length,
    discardPile: state.discardPile.map((c) => ({ ...c })),
    turn: { ...state.turn },
    currentPlayerId: state.status === 'playing' ? (current?.id ?? null) : null,
    actionStack: state.actionStack.map((a) => ({ ...a })),
    nopeWindow: state.nopeWindow ? { ...state.nopeWindow, passed: [...state.nopeWindow.passed] } : null,
    interaction,
    turnDeadline: state.turnDeadline,
    winnerId: state.winnerId,
    you: viewer
      ? {
          id: viewer.id,
          hand: viewer.hand.map((c) => ({ ...c })),
          peek: state.peeks[viewer.id]?.map((c) => ({ ...c })) ?? null,
          isHost: false, // filled in by the room layer, which owns host identity
        }
      : null,
    log: state.log.slice(-60),
  }
}
