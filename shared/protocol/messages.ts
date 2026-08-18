import { z } from 'zod'
import avatarManifest from '../generated/avatar-art.json'
import { ALL_CARD_IDS, DECK_COUNT_MAX, type CardId, type PublicGameState } from '../types/game'
import { rtcSessionIdSchema, trackNameSchema, type VoiceMember } from './voice'

/**
 * Every byte crossing the socket is validated against these schemas, in both
 * directions, so the client and the server cannot drift apart silently.
 */

// Cast keeps the literal union in the parsed output, so `namedCardId` comes
// out as CardId rather than a widened string.
export const cardIdSchema = z.enum(ALL_CARD_IDS as [CardId, ...CardId[]])
export const comboSchema = z.enum(['pair', 'triple', 'five-different'])

export const nicknameSchema = z
  .string()
  .trim()
  .min(2, 'Biệt danh phải có ít nhất 2 ký tự.')
  .max(16, 'Biệt danh tối đa 16 ký tự.')
  .regex(/^[\p{L}\p{N} _'-]+$/u, 'Biệt danh chỉ được dùng chữ cái, chữ số, khoảng trắng, - và _.')

export const roomNameSchema = z.string().trim().min(2).max(32)

// Every id in the generated avatar manifest is a pickable avatar; anything
// else (including `common/death.png`, which is not in this manifest) is
// rejected the same way an unknown CardId is.
const AVATAR_IDS = Object.keys(avatarManifest) as [string, ...string[]]
export const avatarIdSchema = z.enum(AVATAR_IDS)

export const interactionResponseSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('card'), uid: z.string().max(64) }),
  z.object({ type: z.literal('position'), index: z.number().int().min(0).max(500) }),
  z.object({ type: z.literal('order'), uids: z.array(z.string().max(64)).max(10) }),
])

// ---------------------------------------------------------------------------
// Client -> server
// ---------------------------------------------------------------------------

export const clientMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('join'), roomId: z.string().max(64) }),
  z.object({ type: z.literal('leave') }),
  z.object({ type: z.literal('watch-lobby') }),
  z.object({ type: z.literal('chat'), text: z.string().trim().min(1).max(200) }),
  z.object({ type: z.literal('start-game') }),
  // Host-only (enforced in _ws.ts). A card left out of `overrides` keeps
  // scaling with the player count; anything present is an absolute count.
  z.object({
    type: z.literal('set-deck-overrides'),
    // partialRecord, not record: a plain z.record over an enum key demands
    // every card id be present, which is the opposite of what an override is.
    overrides: z.partialRecord(cardIdSchema, z.number().int().min(0).max(DECK_COUNT_MAX)),
  }),
  z.object({
    type: z.literal('play-card'),
    uids: z.array(z.string().max(64)).min(1).max(5),
    combo: comboSchema.nullable().default(null),
    targetPlayerId: z.string().max(64).optional(),
    namedCardId: cardIdSchema.optional(),
  }),
  z.object({ type: z.literal('draw-card') }),
  z.object({ type: z.literal('pass-nope') }),
  z.object({ type: z.literal('quit-game') }),
  z.object({ type: z.literal('return-to-lobby') }),
  z.object({ type: z.literal('kick-player'), targetPlayerId: z.string().max(64) }),
  z.object({ type: z.literal('update-profile'), nickname: nicknameSchema, avatarId: avatarIdSchema }),
  z.object({
    type: z.literal('submit-interaction'),
    interactionId: z.string().max(64),
    response: interactionResponseSchema,
  }),
  // Voice chat signaling. None of this reaches the engine — the server writes
  // it to the room's voice roster in Redis and re-broadcasts a snapshot.
  z.object({
    type: z.literal('voice-join'),
    sessionId: rtcSessionIdSchema,
    trackName: trackNameSchema,
  }),
  z.object({ type: z.literal('voice-leave') }),
  z.object({ type: z.literal('voice-mic'), on: z.boolean() }),
  z.object({ type: z.literal('ping') }),
])

export type ClientMessage = z.infer<typeof clientMessageSchema>

// ---------------------------------------------------------------------------
// Server -> client
// ---------------------------------------------------------------------------

export interface RoomSummary {
  id: string
  name: string
  hostNickname: string
  playerCount: number
  maxPlayers: number
  status: 'lobby' | 'playing' | 'over'
  createdAt: number
}

export interface ChatMessage {
  id: string
  playerId: string
  nickname: string
  text: string
  at: number
}

export type ServerMessage =
  | { type: 'welcome'; playerId: string; nickname: string; avatarId: string }
  /**
   * Full redacted state, sent after every command — the client never patches.
   * New events are whatever in `state.log` the client has not seen, keyed by
   * `seq`, so animation needs no separate delta channel.
   */
  | {
      type: 'snapshot'
      state: PublicGameState
      hostId: string
      roomName: string
      /** Who is currently in the voice call, and which SFU track to pull. */
      voice: VoiceMember[]
    }
  | { type: 'room-list'; rooms: RoomSummary[] }
  | { type: 'chat'; message: ChatMessage }
  | { type: 'error'; code: string; message: string }
  | { type: 'kicked'; reason: string }
  | { type: 'pong'; at: number }

export const parseClientMessage = (raw: unknown) => clientMessageSchema.safeParse(raw)
