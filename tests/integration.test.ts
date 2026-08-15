import { afterAll, describe, expect, it } from 'vitest'
import type { PublicGameState } from '#shared/types/game'
import { sleep, TestClient } from './client'

/**
 * Drives real WebSocket clients against a running server. Start it first:
 *
 *   docker compose up -d redis   (or any Redis)
 *   npm run dev
 *   npm run test:integration
 *
 * Skipped automatically when nothing is listening, so `npm test` stays fast
 * and hermetic.
 */
const BASE_URL = process.env.KK_BASE_URL ?? 'http://localhost:3000'

// Probed at module scope: `describe.skipIf` is evaluated during collection,
// which happens before any beforeAll hook could run.
const serverUp = await (async () => {
  try {
    const response = await fetch(`${BASE_URL}/api/health`, { signal: AbortSignal.timeout(2000) })
    return response.ok && ((await response.json()) as { ok: boolean }).ok
  } catch {
    return false
  }
})()

if (!serverUp) {
  console.warn(`[integration] no server at ${BASE_URL} — skipping. Run \`npm run dev\` first.`)
}

const clients: TestClient[] = []
afterAll(() => clients.forEach((client) => client.close()))

async function makeRoom(nicknames: string[]) {
  const players: TestClient[] = []
  for (const nickname of nicknames) {
    const client = new TestClient(BASE_URL, nickname)
    await client.login()
    await client.connect()
    players.push(client)
    clients.push(client)
  }

  const host = players[0]!
  const response = await fetch(`${BASE_URL}/api/rooms`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: host.cookie },
    body: JSON.stringify({ name: 'Integration table' }),
  })
  const { roomId } = (await response.json()) as { roomId: string }

  for (const player of players) {
    player.send({ type: 'join', roomId })
    await player.waitForState((state) => state.roomId === roomId, 5000, `to join ${roomId}`)
  }
  // Everyone must see every seat before the host presses Play.
  for (const player of players) {
    await player.waitForState(
      (state) => state.players.length === players.length,
      5000,
      `all ${players.length} seats`,
    )
  }
  return { roomId, players, host }
}

const current = (state: PublicGameState) => state.currentPlayerId

/** Plays out a started game by always drawing (and answering prompts) until it ends. */
async function playUntilOver(players: TestClient[]): Promise<void> {
  for (let step = 0; step < 400; step++) {
    const view = players[0]!.state!
    if (view.status === 'over') break

    const interaction = view.interaction
    if (interaction) {
      const responder = players.find((p) => interaction.requiredFrom.includes(p.playerId))
      if (responder) {
        const own = responder.state!.interaction!
        const response =
          own.kind === 'choose-deck-position'
            ? ({ type: 'position', index: 0 } as const)
            : own.kind === 'reorder-cards'
              ? ({ type: 'order', uids: (own.cards ?? []).map((c) => c.uid) } as const)
              : ({
                  type: 'card',
                  uid: (own.cards ?? responder.state!.you!.hand)[0]!.uid,
                } as const)
        responder.send({
          type: 'submit-interaction',
          interactionId: own.id,
          response,
        })
        await sleep(40)
        continue
      }
    }

    if (view.nopeWindow) {
      await sleep(80)
      continue
    }

    const turn = players.find((p) => p.playerId === current(view))
    if (!turn) {
      await sleep(40)
      continue
    }
    turn.send({ type: 'draw-card' })
    await sleep(40)
  }
}

/**
 * Every card uid anywhere in a payload, collected structurally. A substring
 * search over the JSON gives false positives — a short uid can appear inside
 * an unrelated key — so leak checks compare real uid values instead.
 */
function uidsIn(value: unknown, found = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value) uidsIn(item, found)
  } else if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      if (key === 'uid' && typeof item === 'string') found.add(item)
      else uidsIn(item, found)
    }
  }
  return found
}

describe.skipIf(!serverUp)('end-to-end over websockets', () => {
  it('reports the server is reachable', () => {
    expect(serverUp).toBe(true)
  })

  it('runs a three-player game from lobby to a winner', async () => {
    const { players, host } = await makeRoom(['Ada', 'Grace', 'Linus'])

    host.send({ type: 'start-game' })
    for (const player of players) {
      await player.waitForState((state) => state.status === 'playing', 5000, 'the game to start')
    }

    // Everyone was dealt a full hand plus a Defuse, and sees the same deck size.
    const decks = new Set(players.map((p) => p.state!.drawCount))
    expect(decks.size).toBe(1)
    for (const player of players) {
      expect(player.state!.you!.hand).toHaveLength(8)
      expect(player.state!.you!.hand.filter((c) => c.id === 'defuse')).toHaveLength(1)
    }

    // Play it out by always drawing (and answering any prompt) until it ends.
    await playUntilOver(players)

    const final = players[0]!.state!
    expect(final.status).toBe('over')
    expect(final.winnerId).toBeTruthy()

    // Every client agrees on who won and on the final table.
    for (const player of players) {
      await player.waitForState((state) => state.status === 'over')
      expect(player.state!.winnerId).toBe(final.winnerId)
      expect(player.state!.players.filter((p) => p.alive)).toHaveLength(1)
    }
  }, 60_000)

  it('never sends one player another player’s cards', async () => {
    const { players, host } = await makeRoom(['Mallory', 'Bob'])
    host.send({ type: 'start-game' })
    for (const player of players)
      await player.waitForState((state) => state.status === 'playing', 5000, 'the game to start')

    const [a, b] = players as [TestClient, TestClient]
    const visibleToA = uidsIn(a.state)
    for (const card of b.state!.you!.hand) {
      expect(visibleToA.has(card.uid)).toBe(false)
    }
    // A sees exactly their own hand plus whatever is face up in the discard.
    const ownAndDiscard = new Set([
      ...a.state!.you!.hand.map((c) => c.uid),
      ...a.state!.discardPile.map((c) => c.uid),
    ])
    for (const uid of visibleToA) expect(ownAndDiscard.has(uid)).toBe(true)

    // And the draw pile is a number, not a list.
    expect(typeof a.state!.drawCount).toBe('number')
    expect(Object.keys(a.state as object)).not.toContain('drawPile')
  }, 30_000)

  it('rejects a play from someone whose turn it is not', async () => {
    const { players, host } = await makeRoom(['Eve', 'Frank'])
    host.send({ type: 'start-game' })
    for (const player of players)
      await player.waitForState((state) => state.status === 'playing', 5000, 'the game to start')

    const waiting = players.find((p) => p.playerId !== players[0]!.state!.currentPlayerId)!
    waiting.errors = []
    waiting.send({ type: 'draw-card' })
    await waiting.waitFor((message) => message.type === 'error')
    expect(waiting.errors.join(' ')).toMatch(/not your turn/i)
  }, 30_000)

  it('lets a player reconnect to the same seat and hand', async () => {
    const { roomId, players, host } = await makeRoom(['Ken', 'Dennis'])
    host.send({ type: 'start-game' })
    for (const player of players)
      await player.waitForState((state) => state.status === 'playing', 5000, 'the game to start')

    const rejoining = players[1]!
    const handBefore = rejoining.state!.you!.hand.map((c) => c.uid).sort()

    rejoining.close()
    await sleep(200)

    const back = new TestClient(BASE_URL, rejoining.nickname)
    back.cookie = rejoining.cookie
    back.playerId = rejoining.playerId
    clients.push(back)
    await back.connect()
    back.send({ type: 'join', roomId })
    await back.waitForState((state) => Boolean(state.you), 5000, 'a snapshot after rejoining')

    expect(back.state!.you!.hand.map((c) => c.uid).sort()).toEqual(handBefore)
    expect(back.state!.players.find((p) => p.id === back.playerId)!.alive).toBe(true)
  }, 30_000)

  it('returns the whole table to the waiting room once everyone is ready, and deals a fresh round', async () => {
    const { players, host } = await makeRoom(['Marie', 'Niels', 'Rosalind'])

    host.send({ type: 'start-game' })
    for (const player of players) {
      await player.waitForState((state) => state.status === 'playing', 5000, 'the game to start')
    }
    await playUntilOver(players)
    for (const player of players) {
      await player.waitForState((state) => state.status === 'over', 5000, 'the game to end')
    }

    // Two of three ready up: the room stays on the results screen.
    players[0]!.send({ type: 'return-to-lobby' })
    players[1]!.send({ type: 'return-to-lobby' })
    for (const player of players) {
      await player.waitForState(
        (state) => state.players.find((p) => p.id === players[0]!.playerId)?.ready === true,
        5000,
        "seeing the first player's ready flag",
      )
    }
    expect(players[0]!.state!.status).toBe('over')

    // The last player readies up: everyone lands back in the lobby together.
    players[2]!.send({ type: 'return-to-lobby' })
    for (const player of players) {
      await player.waitForState((state) => state.status === 'lobby', 5000, 'the room to reset')
      expect(player.state!.players).toHaveLength(3)
      expect(player.state!.players.every((p) => p.handCount === 0 && !p.ready)).toBe(true)
      expect(player.state!.winnerId).toBeNull()
    }

    // A second round deals fresh hands to the same roster.
    host.send({ type: 'start-game' })
    for (const player of players) {
      await player.waitForState((state) => state.status === 'playing', 5000, 'round two to start')
      expect(player.state!.you!.hand).toHaveLength(8)
    }
  }, 60_000)

  it('lets the host remove a player from the waiting room, and lets them rejoin', async () => {
    const { roomId, players, host } = await makeRoom(['Rita', 'Barbara', 'Grace'])
    const target = players[1]!
    const bystander = players[2]!

    // Only the host can kick.
    bystander.send({ type: 'kick-player', targetPlayerId: target.playerId })
    await bystander.waitFor((message) => message.type === 'error')
    expect(bystander.errors.join(' ')).toMatch(/only the host/i)

    host.send({ type: 'kick-player', targetPlayerId: target.playerId })
    await target.waitFor((message) => message.type === 'kicked', 5000, 'the kick notice')
    await bystander.waitForState((state) => state.players.length === 2, 5000, 'the roster to shrink')
    expect(bystander.state!.players.some((p) => p.id === target.playerId)).toBe(false)

    // Kicking is not a ban: the same player can rejoin normally.
    const rejoined = new TestClient(BASE_URL, target.nickname)
    rejoined.cookie = target.cookie
    rejoined.playerId = target.playerId
    clients.push(rejoined)
    await rejoined.connect()
    rejoined.send({ type: 'join', roomId })
    await rejoined.waitForState((state) => Boolean(state.you), 5000, 'a snapshot after rejoining')
    expect(rejoined.state!.players.some((p) => p.id === target.playerId)).toBe(true)
  }, 30_000)
})
