import { describe, expect, it } from 'vitest'
import { STATE_VERSION, type GameState } from '#shared/types/game'
import { projectStateFor } from './projection'

function createFakeGameState(): GameState {
  return {
    version: STATE_VERSION,
    roomId: 'room-1',
    status: 'playing',
    rngState: 123,
    seed: 123,
    deckOverrides: {},
    players: [
      { id: 'p1', nickname: 'P1', avatarId: '1', seat: 0, hand: [{ uid: 'c1', id: 'defuse' }], alive: true, connected: true, ready: false, disconnectedAt: null },
      { id: 'p2', nickname: 'P2', avatarId: '2', seat: 1, hand: [{ uid: 'c2', id: 'attack-2x' }], alive: false, connected: true, ready: false, disconnectedAt: null },
      { id: 'p3', nickname: 'P3', avatarId: '3', seat: 2, hand: [{ uid: 'c3', id: 'skip' }], alive: false, connected: true, ready: false, disconnectedAt: null }
    ],
    drawPile: [{ uid: 'd1', id: 'favor' }],
    discardPile: [],
    turn: { seat: 0, direction: 1, turnsRemaining: 1 },
    actionStack: [],
    nopeWindow: null,
    interaction: null,
    peeks: {},
    limbo: [],
    turnDeadline: null,
    winnerId: null,
    eventSeq: 1,
    log: []
  }
}

describe('projectStateFor', () => {
  it('does not reveal hands to alive players', () => {
    const state = createFakeGameState()
    const projection = projectStateFor(state, 'p1')

    const p2 = projection.players.find((p) => p.id === 'p2')!
    expect(p2.hand).toBeUndefined()
  })

  it('reveals alive players hands to an eliminated seated player when playing', () => {
    const state = createFakeGameState()
    const projection = projectStateFor(state, 'p2')

    // p1 is alive, their hand should be revealed to eliminated p2
    const p1 = projection.players.find((p) => p.id === 'p1')!
    expect(p1.hand).toBeDefined()
    expect(p1.hand).toEqual([{ uid: 'c1', id: 'defuse' }])
  })

  it('does not reveal eliminated players hands to an eliminated viewer', () => {
    const state = createFakeGameState()
    const projection = projectStateFor(state, 'p2')

    // p3 is dead, their hand should NOT be revealed to eliminated p2
    const p3 = projection.players.find((p) => p.id === 'p3')!
    expect(p3.hand).toBeUndefined()
  })

  it('does not reveal hands to unseated spectators', () => {
    const state = createFakeGameState()
    const projection = projectStateFor(state, 'spectator-id')

    const p1 = projection.players.find((p) => p.id === 'p1')!
    expect(p1.hand).toBeUndefined()
  })

  it('does not reveal hands if game is not in playing status', () => {
    const state = createFakeGameState()
    state.status = 'over'
    const projection = projectStateFor(state, 'p2')

    const p1 = projection.players.find((p) => p.id === 'p1')!
    expect(p1.hand).toBeUndefined()
  })
})
