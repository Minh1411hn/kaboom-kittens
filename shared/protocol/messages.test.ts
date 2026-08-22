import { describe, expect, it } from 'vitest'
import { clientMessageSchema, parseClientMessage, type ClientMessage } from './messages'

/**
 * `parseClientMessage` is the only thing standing between a hand-written
 * socket frame and `applyCommand`. Nothing downstream re-checks these shapes,
 * so a schema that quietly widens is a schema that lets a malformed command
 * into the engine.
 *
 * The voice variants are asserted in `server/services/sfu.test.ts`, next to
 * the SFU wire format they belong to; everything else lives here.
 */

const valid: Array<[string, ClientMessage]> = [
  ['join', { type: 'join', roomId: 'ABCD' }],
  ['leave', { type: 'leave' }],
  ['watch-lobby', { type: 'watch-lobby' }],
  ['chat', { type: 'chat', text: 'hello' }],
  ['start-game', { type: 'start-game' }],
  ['set-deck-overrides', { type: 'set-deck-overrides', overrides: { nope: 4 } }],
  ['play-card', { type: 'play-card', uids: ['c1'], combo: null }],
  ['draw-card', { type: 'draw-card' }],
  ['pass-nope', { type: 'pass-nope' }],
  ['quit-game', { type: 'quit-game' }],
  ['return-to-lobby', { type: 'return-to-lobby' }],
  ['kick-player', { type: 'kick-player', targetPlayerId: 'p2' }],
  ['update-profile', { type: 'update-profile', nickname: 'Whiskers', avatarId: 'art_02' }],
  [
    'submit-interaction',
    {
      type: 'submit-interaction',
      interactionId: 'i1',
      response: { type: 'position', index: 0 },
    },
  ],
  ['voice-join', { type: 'voice-join', sessionId: 'sess-1', trackName: 'mic-1' }],
  ['voice-leave', { type: 'voice-leave' }],
  ['voice-mic', { type: 'voice-mic', on: true }],
  ['ping', { type: 'ping' }],
]

const invalid: Array<[string, unknown]> = [
  ['an unknown message type', { type: 'nuke-the-table' }],
  ['no type at all', { roomId: 'ABCD' }],
  ['a non-object frame', 'draw-card'],
  ['join without a room', { type: 'join' }],
  ['an empty chat line', { type: 'chat', text: '   ' }],
  ['a chat line past the length cap', { type: 'chat', text: 'x'.repeat(201) }],
  ['a play with no cards', { type: 'play-card', uids: [], combo: null }],
  ['a play of six cards', { type: 'play-card', uids: ['a', 'b', 'c', 'd', 'e', 'f'], combo: null }],
  ['an invented combo', { type: 'play-card', uids: ['c1'], combo: 'quadruple' }],
  ['an invented named card', { type: 'play-card', uids: ['c1'], combo: null, namedCardId: 'bazooka' }],
  ['an override for a card that does not exist', { type: 'set-deck-overrides', overrides: { bazooka: 2 } }],
  ['a fractional override', { type: 'set-deck-overrides', overrides: { nope: 1.5 } }],
  ['a negative override', { type: 'set-deck-overrides', overrides: { nope: -1 } }],
  ['a one-character nickname', { type: 'update-profile', nickname: 'W', avatarId: 'art_02' }],
  ['a nickname past the length cap', { type: 'update-profile', nickname: 'x'.repeat(17), avatarId: 'art_02' }],
  ['a nickname with punctuation', { type: 'update-profile', nickname: 'Whisk<ers>', avatarId: 'art_02' }],
  // `common/death.png` is not in the avatar manifest, so it is not pickable.
  ['an avatar that is not in the manifest', { type: 'update-profile', nickname: 'Whiskers', avatarId: 'death' }],
  ['a kick with no target', { type: 'kick-player' }],
  [
    'an interaction response of an unknown kind',
    { type: 'submit-interaction', interactionId: 'i1', response: { type: 'guess', value: 3 } },
  ],
  [
    'a negative deck position',
    { type: 'submit-interaction', interactionId: 'i1', response: { type: 'position', index: -1 } },
  ],
  [
    'a fractional deck position',
    { type: 'submit-interaction', interactionId: 'i1', response: { type: 'position', index: 1.5 } },
  ],
  ['an interaction response with no interaction id', { type: 'submit-interaction', response: { type: 'card', uid: 'c1' } }],
]

describe('parseClientMessage', () => {
  it.each(valid)('accepts %s', (_name, message) => {
    const result = parseClientMessage(message)
    expect(result.success).toBe(true)
    expect(result.data).toMatchObject({ type: message.type })
  })

  it.each(invalid)('rejects %s', (_name, message) => {
    expect(parseClientMessage(message).success).toBe(false)
  })

  it('covers every variant the schema declares', () => {
    // A new client message with no test here fails this rather than sliding in
    // unvalidated.
    const declared = clientMessageSchema.options.map((option) => option.shape.type.value)
    expect([...declared].sort()).toEqual(valid.map(([name]) => name).sort())
  })

  it('defaults a play with no combo field to a solo play', () => {
    const result = parseClientMessage({ type: 'play-card', uids: ['c1'] })
    expect(result.success).toBe(true)
    expect(result.data).toMatchObject({ combo: null })
  })

  it('trims a nickname rather than rejecting the padding', () => {
    const result = parseClientMessage({
      type: 'update-profile',
      nickname: '  Whiskers  ',
      avatarId: 'art_02',
    })
    expect(result.success).toBe(true)
    expect(result.data).toMatchObject({ nickname: 'Whiskers' })
  })
})
