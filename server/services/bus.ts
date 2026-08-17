import type { Peer } from 'crossws'
import type { ServerMessage } from '#shared/protocol/messages'
import { useRedis, useSubscriber } from './redis'

/**
 * Fan-out has two halves:
 *
 *   - a local registry of connected peers (sockets live in one process only)
 *   - Redis pub/sub carrying "room X changed" pings between processes
 *
 * Payloads are deliberately not published: each process re-reads the state and
 * projects it per viewer, so a player's hidden cards can never ride along on a
 * broadcast meant for someone else.
 */

export interface PeerContext {
  playerId: string
  nickname: string
  avatarId: string
  roomId: string | null
  watchingLobby: boolean
}

/**
 * Keyed by `peer.id`, not by object identity: crossws does not guarantee that
 * the Peer handed to `message`/`close` is the same object as the one from
 * `open`, and a missed lookup would silently drop the player's commands.
 */
interface Entry {
  peer: Peer
  context: PeerContext
}

const entries = new Map<string, Entry>()

/**
 * Resolving the session needs a Redis round-trip, so `open` is async — and a
 * client that fires a message the instant the socket opens can beat it. The
 * pending promise is parked here so `message` can wait for it instead of
 * dropping the message on the floor.
 */
const opening = new Map<string, Promise<unknown>>()

export function markOpening(peer: Peer, promise: Promise<unknown>): void {
  opening.set(peer.id, promise)
  void promise.finally(() => opening.delete(peer.id))
}

/** Resolves once the peer's `open` handler has finished, if it is still running. */
export async function awaitOpen(peer: Peer): Promise<void> {
  const pending = opening.get(peer.id)
  if (pending) await pending.catch(() => {})
}

export function attachPeer(peer: Peer, context: PeerContext): void {
  entries.set(peer.id, { peer, context })
}

export function peerContext(peer: Peer): PeerContext | undefined {
  return entries.get(peer.id)?.context
}

export function detachPeer(peer: Peer): PeerContext | undefined {
  const entry = entries.get(peer.id)
  entries.delete(peer.id)
  opening.delete(peer.id)
  return entry?.context
}

export function peersInRoom(roomId: string): Entry[] {
  return [...entries.values()].filter((entry) => entry.context.roomId === roomId)
}

export function lobbyPeers(): Peer[] {
  return [...entries.values()]
    .filter((entry) => entry.context.watchingLobby)
    .map((entry) => entry.peer)
}

/** True while any socket in this process still holds a seat for that player. */
export function playerHasOtherPeer(roomId: string, playerId: string, except: Peer): boolean {
  return peersInRoom(roomId).some(
    (entry) => entry.peer.id !== except.id && entry.context.playerId === playerId,
  )
}

export function send(peer: Peer, message: ServerMessage): void {
  try {
    peer.send(JSON.stringify(message))
  } catch (error) {
    // A peer that vanished mid-send is cleaned up by its own close handler,
    // but anything else here means a client is silently missing an update.
    console.error(`[ws] send(${message.type}) to ${peer.id} failed:`, error)
  }
}

// ---------------------------------------------------------------------------
// Cross-process notifications
// ---------------------------------------------------------------------------

export const ROOM_CHANNEL = 'kk:room'
export const LOBBY_CHANNEL = 'kk:lobby'

type RoomListener = (roomId: string) => void | Promise<void>
type LobbyListener = () => void | Promise<void>

let roomListener: RoomListener | null = null
let lobbyListener: LobbyListener | null = null
let subscribed = false

export async function startBus(onRoom: RoomListener, onLobby: LobbyListener): Promise<void> {
  roomListener = onRoom
  lobbyListener = onLobby
  if (subscribed) return
  subscribed = true

  const subscriber = useSubscriber()
  await subscriber.subscribe(ROOM_CHANNEL, LOBBY_CHANNEL)
  subscriber.on('message', (channel, payload) => {
    if (channel === ROOM_CHANNEL) void roomListener?.(payload)
    else if (channel === LOBBY_CHANNEL) void lobbyListener?.()
  })
}

export async function publishRoomChanged(roomId: string): Promise<void> {
  await useRedis().publish(ROOM_CHANNEL, roomId)
}

export async function publishLobbyChanged(): Promise<void> {
  await useRedis().publish(LOBBY_CHANNEL, '1')
}
