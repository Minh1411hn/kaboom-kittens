// @vitest-environment nuxt
import { nextTick } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { ALL_CARD_IDS, HAND_SIZE, type Card, type CardId, type PublicGameState, type PublicPlayer } from '#shared/types/game'
import type { ClientMessage } from '#shared/protocol/messages'
import RoomPage from './[id].vue'

/**
 * Layout tests for the table stage. The individual pieces are covered in
 * `app/components/table.test.ts`; this asserts the page wires them together —
 * that you are lifted out of the opponent arc into your own corner, that the
 * banner speaks for the right player, and that the endgame curtain only falls
 * when the game is actually over.
 *
 * `useGameSocket` and `useSession` are both `useState`-backed, so the mocks
 * below keep the real reactive state and only stub the network calls.
 */

const card = (id: Card['id'], uid: string): Card => ({ id, uid })

const player = (overrides: Partial<PublicPlayer> = {}): PublicPlayer => ({
  id: 'p1',
  nickname: 'Whiskers',
  avatarId: 'art_02',
  seat: 0,
  handCount: 3,
  alive: true,
  connected: true,
  ready: false,
  ...overrides,
})

/** Set by each test before it mounts; read when the mocked socket is called. */
let fixture: PublicGameState | null = null
/** Messages the mocked `send` has captured, reset on every mount. */
let sent: ClientMessage[] = []

/** Placeholder deck composition — these tests care about layout, not counts. */
const deckCounts = Object.fromEntries(ALL_CARD_IDS.map((id) => [id, 3])) as Record<CardId, number>

function playing(overrides: Partial<PublicGameState> = {}): PublicGameState {
  const players = [
    player({ id: 'p1', nickname: 'Whiskers', seat: 0 }),
    player({ id: 'p2', nickname: 'Mittens', seat: 1, handCount: 5 }),
    player({ id: 'p3', nickname: 'Boots', seat: 2, handCount: 7 }),
  ]
  return {
    roomId: 'ABCD',
    status: 'playing',
    players,
    drawCount: 14,
    discardTop: card('defuse', 'd1'),
    discardCount: 2,
    discardPile: [card('defuse', 'd1')],
    turn: { seat: 0, direction: 1, turnsRemaining: 1 },
    deck: { counts: deckCounts, overrides: {}, handSize: HAND_SIZE, total: 66 },
    currentPlayerId: 'p1',
    actionStack: [],
    nopeWindow: null,
    interaction: null,
    turnDeadline: null,
    winnerId: null,
    you: {
      id: 'p1',
      hand: [card('skip', 'h1'), card('favor', 'h2'), card('tacocat', 'h3')],
      peek: null,
      isHost: true,
    },
    log: [],
    ...overrides,
  } as PublicGameState
}

mockNuxtImport('useSession', () => () => ({
  nickname: useState<string>('kk:nickname', () => 'Whiskers'),
  avatarId: useState<string>('kk:avatarId', () => 'art_02'),
  playerId: useState<string>('kk:sessionPlayerId', () => 'p1'),
  ready: useState<boolean>('kk:sessionReady', () => true),
  load: async () => {},
  setNickname: async () => {},
  setProfile: async () => {},
  remembered: () => 'Whiskers',
}))

mockNuxtImport('useGameSocket', () => () => {
  const state = useState<PublicGameState | null>('kk:state', () => null)
  // Re-seeded on every setup so state cannot bleed between tests.
  state.value = fixture
  const hostId = useState<string>('kk:hostId', () => '')
  hostId.value = 'p1'
  sent = []

  return {
    state,
    hostId,
    roomName: useState<string>('kk:roomName', () => 'The Litter Box'),
    rooms: useState('kk:rooms', () => []),
    chat: useState('kk:chat', () => []),
    voice: useState('kk:voice', () => []),
    pending: useState('kk:events', () => []),
    playerId: useState<string>('kk:playerId', () => 'p1'),
    status: useState<string>('kk:wsStatus', () => 'open'),
    error: useState<string>('kk:wsError', () => ''),
    kicked: useState<string>('kk:kicked', () => ''),
    connect: () => {},
    send: (message: ClientMessage) => {
      sent.push(message)
    },
    resetRoom: () => {},
    leaveOnPageHide: () => () => {},
  }
})

const mount = () => mountSuspended(RoomPage, { route: '/room/ABCD' })

describe('the table stage', () => {
  it('seats the opponents in the arc and you in your own corner', async () => {
    fixture = playing()
    const wrapper = await mount()

    expect(wrapper.find('.stage').exists()).toBe(true)

    // Three players, but only the two opponents belong in the arc.
    const arc = wrapper.findAll('.stage__arc .seat')
    expect(arc).toHaveLength(2)
    expect(wrapper.get('.stage__arc').text()).toContain('Mittens')
    expect(wrapper.get('.stage__arc').text()).toContain('Boots')
    expect(wrapper.get('.stage__arc').text()).not.toContain('Whiskers')

    const self = wrapper.get('.stage__self .seat')
    expect(self.classes()).toContain('you')
    expect(self.text()).toContain('Whiskers')

    // The middle of the arc is lifted, the ends are not.
    expect(wrapper.findAll('.stage__arc-slot')[0]!.attributes('style')).toContain('none')
  })

  it('shows the deck, the discard and your hand', async () => {
    fixture = playing()
    const wrapper = await mount()

    expect(wrapper.text()).toContain('14 left')
    expect(wrapper.text()).toContain('Discarded · 2')
    // The discard top prints no text — its name only reaches the DOM as the
    // artwork's alt, which is what a screen reader reads out.
    expect(wrapper.get('.discard img').attributes('alt')).toBe('Defuse')
    expect(wrapper.findAll('.stage__hand .slot')).toHaveLength(3)
  })

  it('offers no button that draws — the deck has to be dragged onto the hand', async () => {
    fixture = playing()
    const wrapper = await mount()

    const controls = wrapper.get('.controls').text()
    expect(controls).toContain('Deselect')
    expect(controls).not.toContain('Draw')

    // The hand only lights up as a target while a card is being dragged.
    expect(wrapper.get('.stage__hand').classes()).not.toContain('stage__hand--drop-active')
    // And pressing the deck starts a gesture rather than drawing outright.
    await wrapper.get('.deck').trigger('pointerdown')
    expect(wrapper.find('.ghost').exists()).toBe(false)
  })

  it('lets the banner speak for whoever is on the clock', async () => {
    fixture = playing()
    const yours = await mount()
    expect(yours.get('.headline').text()).toBe('Đến lượt của bạn!')
    expect(yours.get('.stage__banner .banner').classes()).toContain('live')

    fixture = playing({ currentPlayerId: 'p2' })
    const theirs = await mount()
    expect(theirs.get('.headline').text()).toBe('Waiting for Mittens…')
  })

  it('keeps the table visible after you explode, and curtains it when the game ends', async () => {
    // Eliminated but the game is still going: no curtain, no hand, a notice.
    fixture = playing({
      players: [
        player({ id: 'p1', nickname: 'Whiskers', seat: 0, alive: false, handCount: 0 }),
        player({ id: 'p2', nickname: 'Mittens', seat: 1 }),
      ],
      currentPlayerId: 'p2',
    })
    const dead = await mount()
    expect(dead.find('.stage__curtain').exists()).toBe(false)
    expect(dead.find('.stage__hand .slot').exists()).toBe(false)
    expect(dead.get('.stage__watching').text()).toContain('You exploded')

    fixture = playing({ status: 'over', winnerId: 'p2', currentPlayerId: null })
    const over = await mount()
    expect(over.get('.stage__curtain').text()).toContain('Mittens won!')
  })

  it('offers a way back to the waiting room, gated on being ready', async () => {
    fixture = playing({
      status: 'over',
      winnerId: 'p2',
      currentPlayerId: null,
      players: [
        player({ id: 'p1', nickname: 'Whiskers', seat: 0, ready: false }),
        player({ id: 'p2', nickname: 'Mittens', seat: 1, ready: true }),
        player({ id: 'p3', nickname: 'Boots', seat: 2, ready: false }),
      ],
    })
    const notReady = await mount()
    const curtain = notReady.get('.stage__curtain')
    const button = curtain.get('.stage__ready')
    expect(button.text()).toBe('Ready for new game')
    expect(button.attributes('disabled')).toBeUndefined()
    // Only Mittens (ready: true) has readied up so far.
    expect(curtain.findAll('.ready-badge')).toHaveLength(1)

    fixture = playing({
      status: 'over',
      winnerId: 'p2',
      currentPlayerId: null,
      players: [
        player({ id: 'p1', nickname: 'Whiskers', seat: 0, ready: true }),
        player({ id: 'p2', nickname: 'Mittens', seat: 1, ready: true }),
        player({ id: 'p3', nickname: 'Boots', seat: 2, ready: false }),
      ],
    })
    const ready = await mount()
    expect(ready.find('.stage__curtain').exists()).toBe(false)
    expect(ready.find('.lobby').exists()).toBe(true)
    const waitingButton = ready.get('.lobby__start button')
    expect(waitingButton.text()).toBe('Waiting for everyone…')
    expect(waitingButton.attributes('disabled')).toBeDefined()
  })

  it('renders the lobby instead of the stage before the game starts', async () => {
    fixture = playing({ status: 'lobby' })
    const wrapper = await mount()

    expect(wrapper.find('.stage').exists()).toBe(false)
    expect(wrapper.get('.lobby').text()).toContain('Room settings')
    // Everyone shows in the lobby, including you.
    expect(wrapper.findAll('.lobby__seats .seat')).toHaveLength(3)
  })

  it('lets the host kick another player from the waiting room, but not themself', async () => {
    fixture = playing({ status: 'lobby' })
    const wrapper = await mount()

    // p1 is you and the host: no kick button on your own seat.
    const seats = wrapper.findAll('.lobby__seat')
    expect(seats).toHaveLength(3)
    expect(seats[0]!.find('.lobby__kick').exists()).toBe(false)
    expect(seats[1]!.find('.lobby__kick').exists()).toBe(true)
    expect(seats[2]!.find('.lobby__kick').exists()).toBe(true)

    await seats[1]!.get('.lobby__kick').trigger('click')
    expect(sent.at(-1)).toEqual({ type: 'kick-player', targetPlayerId: 'p2' })
  })

  it('makes the deck-position dialog wait for the kitten ceremony', async () => {
    fixture = playing()
    const wrapper = await mount()
    const state = useState<PublicGameState | null>('kk:state')

    // A baseline snapshot, so the ceremony knows where the log stood before
    // — and so it can see which card leaves the hand next.
    state.value = playing({
      you: {
        id: 'p1',
        hand: [card('skip', 'h1'), card('defuse', 'd1')],
        peek: null,
        isHost: true,
      },
      log: [{ seq: 1, at: 1, type: 'card-drawn', playerId: 'p2' }],
    } as Partial<PublicGameState>)
    await nextTick()

    vi.useFakeTimers()
    try {
      // Now the real thing: kitten, Defuse and the prompt, all in one snapshot,
      // exactly as the server sends them.
      state.value = playing({
        you: { id: 'p1', hand: [card('skip', 'h1')], peek: null, isHost: true },
        interaction: {
          id: 'i1',
          kind: 'choose-deck-position',
          cardId: 'defuse',
          requiredFrom: ['p1'],
          deadline: Date.now() + 30000,
          isForYou: true,
          answered: [],
          maxPosition: 14,
        },
        log: [
          { seq: 1, at: 1, type: 'card-drawn', playerId: 'p2' },
          { seq: 2, at: 2, type: 'kitten-drawn', playerId: 'p1' },
          { seq: 3, at: 3, type: 'kitten-defused', playerId: 'p1' },
        ],
      } as Partial<PublicGameState>)
      await nextTick()

      // The kitten is centre stage; the dialog has not shown its face yet.
      expect(wrapper.find('.reveal').exists()).toBe(true)
      expect(wrapper.find('.slot.held').exists()).toBe(true)
      expect(wrapper.text()).not.toContain('Secretly put the Exploding Kitten back')

      // Long enough for the whole ceremony, including its safety ceiling
      // (MAX_CEREMONY_MS in useKittenCeremony.ts).
      vi.advanceTimersByTime(4600)
      await nextTick()

      expect(wrapper.find('.reveal').exists()).toBe(false)
      expect(wrapper.text()).toContain('Secretly put the Exploding Kitten back')
    } finally {
      vi.useRealTimers()
    }
  })

  it('toggles the log dock when clicking the toggle button', async () => {
    fixture = playing()
    const wrapper = await mount()

    const dock = wrapper.get('.log-dock')
    expect(dock.classes()).toContain('log-dock--open')

    await wrapper.get('.log-dock__toggle').trigger('click')
    expect(wrapper.get('.log-dock').classes()).not.toContain('log-dock--open')
  })
})
