// @vitest-environment nuxt
import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import type { Card, PendingAction, PublicGameState, PublicPlayer } from '#shared/types/game'
import CardImage from './CardImage.vue'
import HandFan from './HandFan.vue'
import InteractionModal from './InteractionModal.vue'
import NopeBar from './NopeBar.vue'
import PlayerSeat from './PlayerSeat.vue'
import TableCenter from './TableCenter.vue'
import TurnBanner from './TurnBanner.vue'

/**
 * Smoke tests for the table. These render the components that only ever run in
 * a browser, so a broken template or a bad prop shows up here instead of at
 * the table mid-game.
 */

const card = (id: Card['id'], uid: string): Card => ({ id, uid })

const player = (overrides: Partial<PublicPlayer> = {}): PublicPlayer => ({
  id: 'p1',
  nickname: 'Whiskers',
  seat: 0,
  handCount: 5,
  alive: true,
  connected: true,
  ...overrides,
})

describe('CardImage', () => {
  it('shows a card face with its name and rules text', async () => {
    const wrapper = await mountSuspended(CardImage, {
      props: { cardId: 'attack-2x', uid: 'c1' },
    })
    const img = wrapper.get('img')
    expect(img.attributes('src')).toContain('/cards/attack-2x/')
    expect(img.attributes('alt')).toBe('Attack 2x')
    expect(wrapper.get('.card').attributes('title')).toContain('next player takes 2 turns')
  })

  it('shows the back when face down, and never leaks the face', async () => {
    const wrapper = await mountSuspended(CardImage, {
      props: { cardId: 'exploding-kitten', uid: 'c9', faceDown: true },
    })
    expect(wrapper.get('img').attributes('src')).toContain('/cards/card-back/')
    expect(wrapper.html()).not.toContain('exploding-kitten')
  })

  it('keeps the same artwork variant for a given card', async () => {
    const first = await mountSuspended(CardImage, { props: { cardId: 'nope', uid: 'abc' } })
    const second = await mountSuspended(CardImage, { props: { cardId: 'nope', uid: 'abc' } })
    expect(first.get('img').attributes('src')).toBe(second.get('img').attributes('src'))
  })

  it('frames a face-up card with its catalog label and title', async () => {
    // Favor's label ("Demand a card") differs from its name, so this proves
    // both catalog fields reach the frame rather than one being echoed twice.
    const wrapper = await mountSuspended(CardImage, {
      props: { cardId: 'favor', uid: 'f1' },
    })
    expect(wrapper.get('.card').classes()).toContain('framed')
    expect(wrapper.get('.card-label').text()).toBe('Demand a card')
    expect(wrapper.get('.card-title').text()).toBe('Favor')
    // The border colour comes from the catalog, not a per-card stylesheet.
    expect(wrapper.get('.card').attributes('style')).toContain('#c2185b')
  })

  it('prints no identity at all on a back', async () => {
    const wrapper = await mountSuspended(CardImage, {
      props: { cardId: 'exploding-kitten', uid: 'c9', faceDown: true },
    })
    expect(wrapper.get('.card').classes()).toContain('plain')
    expect(wrapper.find('.card-head').exists()).toBe(false)
    // "Kaboom" is the kitten's label — leaking it would give the back away.
    expect(wrapper.text()).not.toContain('Kaboom')
    expect(wrapper.text()).not.toContain('Exploding Kitten')
  })

  it('drops the frame when asked for a plain image', async () => {
    const wrapper = await mountSuspended(CardImage, {
      props: { cardId: 'skip', uid: 's1', variant: 'plain' },
    })
    expect(wrapper.find('.card-head').exists()).toBe(false)
    expect(wrapper.get('img').attributes('src')).toContain('/cards/skip/')
  })
})

describe('PlayerSeat', () => {
  it('marks the current player, the host and an eliminated player', async () => {
    const current = await mountSuspended(PlayerSeat, {
      props: {
        player: player(),
        isCurrent: true,
        isHost: true,
        isYou: true,
        turnsRemaining: 2,
      },
    })
    expect(current.get('.seat').classes()).toContain('current')
    expect(current.text()).toContain('Whiskers')
    expect(current.text()).toContain('5 cards')
    expect(current.text()).toContain('2 turns left')
    expect(current.text()).toContain('👑')

    const dead = await mountSuspended(PlayerSeat, {
      props: {
        player: player({ alive: false, handCount: 0 }),
        isCurrent: false,
        isHost: false,
        isYou: false,
        turnsRemaining: 1,
      },
    })
    expect(dead.get('.seat').classes()).toContain('dead')
    expect(dead.text()).toContain('💀')
  })

  it('is only clickable while it is a legal target', async () => {
    const wrapper = await mountSuspended(PlayerSeat, {
      props: {
        player: player(),
        isCurrent: false,
        isHost: false,
        isYou: false,
        turnsRemaining: 1,
        targetable: true,
      },
    })
    await wrapper.get('.seat').trigger('click')
    expect(wrapper.emitted('pick')?.[0]).toEqual(['p1'])

    const locked = await mountSuspended(PlayerSeat, {
      props: {
        player: player(),
        isCurrent: false,
        isHost: false,
        isYou: false,
        turnsRemaining: 1,
      },
    })
    await locked.get('.seat').trigger('click')
    expect(locked.emitted('pick')).toBeUndefined()
  })

  it('fans a card per held card, and caps the fan with an overflow chip', async () => {
    const few = await mountSuspended(PlayerSeat, {
      props: { player: player({ handCount: 3 }), isCurrent: false, isHost: false, isYou: false, turnsRemaining: 1 },
    })
    expect(few.findAll('.mini')).toHaveLength(3)
    expect(few.find('.more').exists()).toBe(false)

    // An opening hand is 8 cards, so the chip must not appear at 8.
    const opening = await mountSuspended(PlayerSeat, {
      props: { player: player({ handCount: 8 }), isCurrent: false, isHost: false, isYou: false, turnsRemaining: 1 },
    })
    expect(opening.findAll('.mini')).toHaveLength(8)
    expect(opening.find('.more').exists()).toBe(false)

    const many = await mountSuspended(PlayerSeat, {
      props: { player: player({ handCount: 12 }), isCurrent: false, isHost: false, isYou: false, turnsRemaining: 1 },
    })
    expect(many.findAll('.mini')).toHaveLength(8)
    expect(many.get('.more').text()).toBe('+4')
  })

  it('gives each seat its own avatar colour, and drains it on death', async () => {
    const mount = (seat: number, alive = true) =>
      mountSuspended(PlayerSeat, {
        props: { player: player({ seat, alive }), isCurrent: false, isHost: false, isYou: false, turnsRemaining: 1 },
      })

    const first = await mount(0)
    const second = await mount(1)
    const disc = (w: Awaited<ReturnType<typeof mount>>) => w.get('.avatar').attributes('style')

    expect(disc(first)).not.toBe(disc(second))
    // Seat colours wrap, so the eleventh seat reuses the first seat's colour.
    expect(disc(await mount(10))).toBe(disc(first))
    expect(disc(await mount(0, false))).not.toBe(disc(first))
  })
})

describe('HandFan', () => {
  it('renders every card and reports which one was clicked', async () => {
    const hand = [card('skip', 'a'), card('nope', 'b'), card('tacocat', 'c')]
    const wrapper = await mountSuspended(HandFan, {
      props: { hand, selected: ['b'] },
    })
    expect(wrapper.findAll('.slot')).toHaveLength(3)
    expect(wrapper.findAll('.card.selected')).toHaveLength(1)

    await wrapper.findAll('.pick')[2]!.trigger('click')
    expect(wrapper.emitted('toggle')?.[0]).toEqual(['c'])
  })

  it('copes with an empty hand', async () => {
    const wrapper = await mountSuspended(HandFan, { props: { hand: [], selected: [] } })
    expect(wrapper.text()).toContain('No cards left')
  })
})

describe('TableCenter', () => {
  it('shows both pile counts and only allows a draw when it is your turn', async () => {
    const wrapper = await mountSuspended(TableCenter, {
      props: {
        drawCount: 31,
        discardTop: card('favor', 'd1'),
        discardCount: 4,
        direction: 1,
        canDraw: false,
        deadline: null,
        peek: null,
      },
    })
    expect(wrapper.text()).toContain('31')
    expect(wrapper.text()).toContain('4')
    expect(wrapper.get('.deck').attributes('disabled')).toBeDefined()

    await wrapper.setProps({ canDraw: true })
    await wrapper.get('.deck').trigger('click')
    expect(wrapper.emitted('draw')).toHaveLength(1)
  })

  it('shows a peek only to the player who looked', async () => {
    const wrapper = await mountSuspended(TableCenter, {
      props: {
        drawCount: 10,
        discardTop: null,
        discardCount: 0,
        direction: -1,
        canDraw: false,
        deadline: null,
        peek: [card('skip', 'p1'), card('defuse', 'p2')],
      },
    })
    expect(wrapper.text()).toContain('You see, from the top')
    expect(wrapper.findAll('.peek-cards .card')).toHaveLength(2)
    // Direction arrow flips with the turn order.
    expect(wrapper.get('.direction').text()).toBe('↺')
  })
})

describe('TurnBanner', () => {
  const base = {
    isYourTurn: false,
    currentPlayerName: 'Mittens',
    deadline: null,
    actorColor: '#2f9bdb',
  }

  it('names whoever is on the clock, and shouts when it is you', async () => {
    const waiting = await mountSuspended(TurnBanner, { props: base })
    expect(waiting.text()).toContain('Waiting for Mittens')
    expect(waiting.classes()).not.toContain('live')

    const yours = await mountSuspended(TurnBanner, { props: { ...base, isYourTurn: true } })
    expect(yours.text()).toContain("It's your turn!")
    expect(yours.classes()).toContain('live')
  })

  it('shows the hint and the slotted controls', async () => {
    const wrapper = await mountSuspended(TurnBanner, {
      props: { ...base, isYourTurn: true, hint: 'Now pick a player above.' },
      slots: { default: '<button>Play</button>' },
    })
    expect(wrapper.get('.hint').text()).toBe('Now pick a player above.')
    expect(wrapper.get('.controls button').text()).toBe('Play')
  })

  it('counts down only once there is a deadline', async () => {
    const none = await mountSuspended(TurnBanner, { props: base })
    expect(none.find('.clock').exists()).toBe(false)

    const ticking = await mountSuspended(TurnBanner, {
      props: { ...base, deadline: Date.now() + 30_000 },
    })
    expect(ticking.get('.clock-text').text()).toMatch(/^\d+s$/)
  })
})

describe('NopeBar', () => {
  const stack: PendingAction[] = [
    {
      id: 'a1',
      playerId: 'p1',
      cardId: 'attack-2x',
      cardUids: ['x'],
      combo: null,
      targetPlayerId: null,
      namedCardId: null,
      nopeable: true,
    },
  ]

  it('offers NOPE only to someone holding one who did not play the top card', async () => {
    const wrapper = await mountSuspended(NopeBar, {
      props: {
        stack,
        deadline: Date.now() + 5000,
        players: [player(), player({ id: 'p2', nickname: 'Mittens' })],
        hasNope: true,
        youPlayedTop: false,
        passed: false,
      },
    })
    expect(wrapper.text()).toContain('Whiskers played Attack 2x')
    await wrapper.get('button.danger').trigger('click')
    expect(wrapper.emitted('nope')).toHaveLength(1)

    const own = await mountSuspended(NopeBar, {
      props: {
        stack,
        deadline: Date.now() + 5000,
        players: [player()],
        hasNope: true,
        youPlayedTop: true,
        passed: false,
      },
    })
    expect(own.find('button.danger').exists()).toBe(false)
    expect(own.text()).toContain('Waiting')
  })

  it('spells out the verdict as Nopes stack up', async () => {
    const twoNopes: PendingAction[] = [
      stack[0]!,
      { ...stack[0]!, id: 'a2', cardId: 'nope', playerId: 'p2' },
      { ...stack[0]!, id: 'a3', cardId: 'nope', playerId: 'p1' },
    ]
    const wrapper = await mountSuspended(NopeBar, {
      props: {
        stack: twoNopes,
        deadline: Date.now() + 5000,
        players: [player(), player({ id: 'p2', nickname: 'Mittens' })],
        hasNope: false,
        youPlayedTop: false,
        passed: false,
      },
    })
    expect(wrapper.text()).toContain('2 Nopes')
    expect(wrapper.text()).toContain('The Nopes cancel out')
  })
})

describe('InteractionModal', () => {
  const base = {
    id: 'i1',
    kind: 'choose-card-from-hand' as const,
    cardId: 'favor' as const,
    requiredFrom: ['p1'],
    prompt: 'Choose a card to give to Mittens',
    deadline: Date.now() + 30000,
    isForYou: true,
    answered: [] as string[],
  }

  it('lets the chosen player pick a card and confirm', async () => {
    const wrapper = await mountSuspended(InteractionModal, {
      props: {
        interaction: { ...base, cards: [card('skip', 's1'), card('shuffle', 's2')] },
        hand: [],
        players: [player()],
      },
    })
    expect(wrapper.text()).toContain('Choose a card to give')
    const confirm = wrapper.findAll('button').at(-1)!
    expect(confirm.attributes('disabled')).toBeDefined()

    await wrapper.findAll('.choice')[1]!.trigger('click')
    await confirm.trigger('click')
    expect(wrapper.emitted('submit')?.[0]).toEqual([{ type: 'card', uid: 's2' }])
  })

  it('shows bystanders who is being waited on, and no cards', async () => {
    const wrapper = await mountSuspended(InteractionModal, {
      props: {
        interaction: {
          ...base,
          isForYou: false,
          cards: undefined,
          requiredFrom: ['p1'],
        },
        hand: [],
        players: [player()],
      },
    })
    expect(wrapper.text()).toContain('Waiting for Whiskers')
    expect(wrapper.findAll('.choice')).toHaveLength(0)
  })

  it('submits a deck position for a defused kitten', async () => {
    const wrapper = await mountSuspended(InteractionModal, {
      props: {
        interaction: {
          ...base,
          kind: 'choose-deck-position',
          cardId: 'defuse',
          prompt: 'Secretly put the Exploding Kitten back into the deck',
          maxPosition: 20,
        },
        hand: [],
        players: [player()],
      },
    })
    expect(wrapper.text()).toContain('the very top')

    // "Bottom" is one of the quick buttons.
    const bottom = wrapper.findAll('button').find((b) => b.text() === 'Bottom')!
    await bottom.trigger('click')
    expect(wrapper.text()).toContain('the very bottom')

    await wrapper.findAll('button').at(-1)!.trigger('click')
    expect(wrapper.emitted('submit')?.[0]).toEqual([{ type: 'position', index: 20 }])
  })

  it('reorders the top of the deck and submits the new order', async () => {
    const cards = [card('skip', 'r1'), card('favor', 'r2'), card('shuffle', 'r3')]
    const wrapper = await mountSuspended(InteractionModal, {
      props: {
        interaction: { ...base, kind: 'reorder-cards', cardId: 'alter-the-future-3x', cards },
        hand: [],
        players: [player()],
      },
    })
    // Move the third card up twice so it lands on top.
    const rows = () => wrapper.findAll('.reorder-row')
    await rows()[2]!.findAll('button')[0]!.trigger('click')
    await rows()[1]!.findAll('button')[0]!.trigger('click')

    await wrapper.findAll('button').at(-1)!.trigger('click')
    expect(wrapper.emitted('submit')?.[0]).toEqual([{ type: 'order', uids: ['r3', 'r1', 'r2'] }])
  })
})

describe('usePlayIntent', () => {
  const state = (overrides: Partial<PublicGameState> = {}) =>
    ref({
      actionStack: [],
      discardCount: 3,
      you: { id: 'p1', hand: [], peek: null, isHost: false },
      ...overrides,
    } as unknown as PublicGameState)

  it('accepts a lone action card on your turn and refuses it off-turn', () => {
    const selected = ref([card('skip', 's1')])
    expect(usePlayIntent(selected, state(), ref(true)).value.ok).toBe(true)
    expect(usePlayIntent(selected, state(), ref(false)).value.reason).toMatch(/wait for your turn/i)
  })

  it('refuses a lone cat card and explains why', () => {
    const selected = ref([card('tacocat', 'c1')])
    expect(usePlayIntent(selected, state(), ref(true)).value.reason).toMatch(/combo of 2, 3 or 5/i)
  })

  it('accepts matching cat pairs, including with Feral Cat', () => {
    const pair = usePlayIntent(ref([card('tacocat', 'a'), card('tacocat', 'b')]), state(), ref(true))
    expect(pair.value).toMatchObject({ ok: true, combo: 'pair', needsTarget: true })

    const feral = usePlayIntent(ref([card('beard-cat', 'a'), card('feral-cat', 'b')]), state(), ref(true))
    expect(feral.value.combo).toBe('pair')

    const mismatch = usePlayIntent(ref([card('beard-cat', 'a'), card('tacocat', 'b')]), state(), ref(true))
    expect(mismatch.value.ok).toBe(false)
  })

  it('asks for a named card on a three-of-a-kind', () => {
    const triple = usePlayIntent(
      ref([card('tacocat', 'a'), card('tacocat', 'b'), card('feral-cat', 'c')]),
      state(),
      ref(true),
    )
    expect(triple.value).toMatchObject({ combo: 'triple', needsTarget: true, needsNamedCard: true })
  })

  it('needs a non-empty discard pile for the five-card combo', () => {
    const five = [
      card('skip', 'a'),
      card('favor', 'b'),
      card('shuffle', 'c'),
      card('nope', 'd'),
      card('reverse', 'e'),
    ]
    expect(usePlayIntent(ref(five), state(), ref(true)).value.combo).toBe('five-different')
    expect(usePlayIntent(ref(five), state({ discardCount: 0 }), ref(true)).value.reason).toMatch(
      /discard pile is empty/i,
    )
  })

  it('allows Nope out of turn, but not against your own card', () => {
    const nope = ref([card('nope', 'n1')])
    const withAction = state({
      actionStack: [{ playerId: 'p2' } as PendingAction],
    })
    expect(usePlayIntent(nope, withAction, ref(false)).value.ok).toBe(true)

    const yours = state({ actionStack: [{ playerId: 'p1' } as PendingAction] })
    expect(usePlayIntent(nope, yours, ref(false)).value.reason).toMatch(/your own card/i)

    expect(usePlayIntent(nope, state(), ref(false)).value.reason).toMatch(/nothing to Nope/i)
  })
})
