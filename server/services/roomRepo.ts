import { randomBytes } from 'node:crypto'
import { STATE_VERSION, type GameState } from '#shared/types/game'
import type { ChatMessage, RoomSummary } from '#shared/protocol/messages'
import { MAX_PLAYERS } from '../game/deck'
import { createGame } from '../game/engine'
import { useRedis } from './redis'

export interface RoomMeta {
  id: string
  name: string
  hostId: string
  /** Snapshot of the creator's nickname, so the lobby can name a room the
   *  moment it is created — before the host's socket has joined the game. */
  hostNickname: string
  createdAt: number
}

const ROOMS_INDEX = 'rooms:index'
const metaKey = (id: string) => `room:${id}`
const stateKey = (id: string) => `room:${id}:state`
const chatKey = (id: string) => `room:${id}:chat`

/** Short, unambiguous room codes — no 0/O/1/I to mistype from a shared link. */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
export function generateRoomId(): string {
  const bytes = randomBytes(6)
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('')
}

const ttl = () => useRuntimeConfig().roomTtlSeconds

export async function createRoom(
  name: string,
  hostId: string,
  hostNickname: string,
): Promise<RoomMeta> {
  const redis = useRedis()
  const id = generateRoomId()
  const meta: RoomMeta = { id, name, hostId, hostNickname, createdAt: Date.now() }

  await redis
    .multi()
    .hset(metaKey(id), {
      id,
      name,
      hostId,
      hostNickname,
      createdAt: String(meta.createdAt),
    })
    .expire(metaKey(id), ttl())
    .set(stateKey(id), JSON.stringify(createGame(id)), 'EX', ttl())
    .zadd(ROOMS_INDEX, meta.createdAt, id)
    .exec()

  return meta
}

export async function getRoomMeta(id: string): Promise<RoomMeta | null> {
  const raw = await useRedis().hgetall(metaKey(id))
  if (!raw?.id) return null
  return {
    id: raw.id,
    name: raw.name ?? 'Room',
    hostId: raw.hostId ?? '',
    hostNickname: raw.hostNickname ?? '',
    createdAt: Number(raw.createdAt ?? 0),
  }
}

export async function setHost(id: string, hostId: string): Promise<void> {
  await useRedis().hset(metaKey(id), { hostId })
}

export async function loadState(id: string): Promise<GameState | null> {
  const raw = await useRedis().get(stateKey(id))
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as GameState
    // A state written by an older build cannot be trusted; drop the room
    // rather than half-migrate a game in progress.
    if (parsed.version !== STATE_VERSION) {
      await deleteRoom(id)
      return null
    }
    return parsed
  } catch {
    return null
  }
}

export async function saveState(state: GameState): Promise<void> {
  const redis = useRedis()
  await redis
    .multi()
    .set(stateKey(state.roomId), JSON.stringify(state), 'EX', ttl())
    .expire(metaKey(state.roomId), ttl())
    .expire(chatKey(state.roomId), ttl())
    .exec()
}

export async function deleteRoom(id: string): Promise<void> {
  await useRedis()
    .multi()
    .del(metaKey(id), stateKey(id), chatKey(id))
    .zrem(ROOMS_INDEX, id)
    .exec()
}

export async function listRooms(limit = 50): Promise<RoomSummary[]> {
  const redis = useRedis()
  const ids = await redis.zrevrange(ROOMS_INDEX, 0, limit - 1)
  if (!ids.length) return []

  const pipeline = redis.pipeline()
  for (const id of ids) {
    pipeline.hgetall(metaKey(id))
    pipeline.get(stateKey(id))
  }
  const results = await pipeline.exec()
  if (!results) return []

  const rooms: RoomSummary[] = []
  const stale: string[] = []

  for (let i = 0; i < ids.length; i++) {
    const id = ids[i]!
    const meta = results[i * 2]?.[1] as Record<string, string> | undefined
    const rawState = results[i * 2 + 1]?.[1] as string | null | undefined

    if (!meta?.id || !rawState) {
      stale.push(id)
      continue
    }
    let state: GameState
    try {
      state = JSON.parse(rawState) as GameState
    } catch {
      stale.push(id)
      continue
    }

    const host = state.players.find((p) => p.id === meta.hostId)
    rooms.push({
      id,
      name: meta.name ?? 'Room',
      hostNickname: host?.nickname ?? meta.hostNickname ?? state.players[0]?.nickname ?? '—',
      playerCount: state.players.length,
      maxPlayers: MAX_PLAYERS,
      status: state.status,
      createdAt: Number(meta.createdAt ?? 0),
    })
  }

  // Rooms whose TTL expired leave dangling index entries; sweep them lazily.
  if (stale.length) await useRedis().zrem(ROOMS_INDEX, ...stale)

  return rooms
}

// ---------------------------------------------------------------------------
// Chat — kept out of GameState so it never touches the engine
// ---------------------------------------------------------------------------

export async function appendChat(roomId: string, message: ChatMessage): Promise<void> {
  const redis = useRedis()
  await redis
    .multi()
    .rpush(chatKey(roomId), JSON.stringify(message))
    .ltrim(chatKey(roomId), -50, -1)
    .expire(chatKey(roomId), ttl())
    .exec()
}

export async function loadChat(roomId: string): Promise<ChatMessage[]> {
  const raw = await useRedis().lrange(chatKey(roomId), 0, -1)
  return raw.flatMap((entry) => {
    try {
      return [JSON.parse(entry) as ChatMessage]
    } catch {
      return []
    }
  })
}
