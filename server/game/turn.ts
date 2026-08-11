import type { GameEvent, GameState, Player } from '#shared/types/game'

export function alivePlayers(state: GameState): Player[] {
  return state.players.filter((p) => p.alive)
}

export function playerById(state: GameState, id: string): Player | undefined {
  return state.players.find((p) => p.id === id)
}

export function playerBySeat(state: GameState, seat: number): Player | undefined {
  return state.players.find((p) => p.seat === seat)
}

export function currentPlayer(state: GameState): Player | undefined {
  return playerBySeat(state, state.turn.seat)
}

/** Next living seat walking in `direction`, skipping eliminated players. */
export function nextAliveSeat(state: GameState, fromSeat: number, direction: 1 | -1): number {
  const total = state.players.length
  for (let step = 1; step <= total; step++) {
    const seat = (((fromSeat + direction * step) % total) + total) % total
    const player = playerBySeat(state, seat)
    if (player?.alive) return seat
  }
  return fromSeat
}

/** Finishes one turn. Only when the player owes no more does play move on. */
export function endTurn(state: GameState): void {
  state.turn.turnsRemaining -= 1
  if (state.turn.turnsRemaining > 0) return
  state.turn.seat = nextAliveSeat(state, state.turn.seat, state.turn.direction)
  state.turn.turnsRemaining = 1
}

/** Hands the turn to a specific player with an explicit number of turns. */
export function passTurns(state: GameState, toSeat: number, turns: number): void {
  state.turn.seat = toSeat
  state.turn.turnsRemaining = Math.max(1, turns)
}

/** Whoever the current player is has exploded: their outstanding turns vanish. */
export function skipEliminatedCurrent(state: GameState): void {
  const current = currentPlayer(state)
  if (current?.alive) return
  state.turn.seat = nextAliveSeat(state, state.turn.seat, state.turn.direction)
  state.turn.turnsRemaining = 1
}

export function logEvent(state: GameState, event: Omit<GameEvent, 'seq' | 'at'>, now: number): void {
  state.eventSeq += 1
  state.log.push({ ...event, seq: state.eventSeq, at: now })
  // Keep the log bounded; the client only renders the recent tail anyway.
  if (state.log.length > 200) state.log.splice(0, state.log.length - 200)
}
