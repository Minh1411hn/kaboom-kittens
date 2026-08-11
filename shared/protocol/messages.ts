import { z } from 'zod'
import { ALL_CARD_IDS, type CardId, type PublicGameState } from '../types/game'

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
  .min(2, 'Nickname must be at least 2 characters.')
  .max(16, 'Nickname must be at most 16 characters.')
  .regex(/^[\p{L}\p{N} _'-]+$/u, 'Nicknames can only use letters, numbers, spaces, - and _.')

export const roomNameSchema = z.string().trim().min(2).max(32)

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
  z.object({
    type: z.literal('play-card'),
    uids: z.array(z.string().max(64)).min(1).max(5),
    combo: comboSchema.nullable().default(null),
    targetPlayerId: z.string().max(64).optional(),
    namedCardId: cardIdSchema.optional(),
  }),
  z.object({ type: z.literal('draw-card') }),
  z.object({ type: z.literal('pass-nope') }),
  z.object({
    type: z.literal('submit-interaction'),
    interactionId: z.string().max(64),
    response: interactionResponseSchema,
  }),
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
  | { type: 'welcome'; playerId: string; nickname: string }
  /**
   * Full redacted state, sent after every command — the client never patches.
   * New events are whatever in `state.log` the client has not seen, keyed by
   * `seq`, so animation needs no separate delta channel.
   */
  | { type: 'snapshot'; state: PublicGameState; hostId: string; roomName: string }
  | { type: 'room-list'; rooms: RoomSummary[] }
  | { type: 'chat'; message: ChatMessage }
  | { type: 'error'; code: string; message: string }
  | { type: 'kicked'; reason: string }
  | { type: 'pong'; at: number }

export const parseClientMessage = (raw: unknown) => clientMessageSchema.safeParse(raw)
