import type { Peer } from 'crossws'
import type { Command, GameState } from '#shared/types/game'
import type { ServerMessage } from '#shared/protocol/messages'
import { addPlayer, DEFAULT_CONFIG, reduce, removePlayer, resetToLobby, setConnected, type EngineConfig } from '../game/engine'
import { projectStateFor } from '../game/projection'
import {
  loadState,
  getRoomMeta,
  saveState,
  setHost,
  deleteRoom,
  type RoomMeta,
} from './roomRepo'
import { withRoomLock } from './lock'
import { peersInRoom, publishLobbyChanged, publishRoomChanged, send } from './bus'
import { armRoomTimer, clearRoomTimer, setTimerHandler } from './timers'

export function engineConfig(): EngineConfig {
  const config = useRuntimeConfig()
  return {
    ...DEFAULT_CONFIG,
    nopeWindowMs: Number(config.nopeWindowMs) || DEFAULT_CONFIG.nopeWindowMs,
    turnTimeoutMs: Number(config.turnTimeoutMs) || DEFAULT_CONFIG.turnTimeoutMs,
  }
}

/**
 * Every state change funnels through here: take the room lock, load, reduce,
 * save, re-arm the timer, then tell everyone. Doing it in one place is what
 * keeps "who broadcasts what" from sprawling across the socket handler.
 *
 * Returns an error string when the engine rejected the command, so the caller
 * can report it to the one player who tried it rather than the whole table.
 */
export async function applyCommand(roomId: string, command: Command): Promise<string | undefined> {
  const result = await withRoomLock(roomId, async () => {
    const state = await loadState(roomId)
    if (!state) return { error: 'This room no longer exists.' }

    const reduced = reduce(state, command, engineConfig())
    if (reduced.error) return { error: reduced.error }

    await saveState(reduced.state)
    armRoomTimer(reduced.state)
    return { state: reduced.state }
  })

  if ('error' in result && result.error) return result.error

  await publishRoomChanged(roomId)
  // Player counts and status drive the lobby list, so it changes too.
  await publishLobbyChanged()
  return undefined
}

/** Mutations that are not engine commands (joining, connection flags). */
export async function mutateRoom(
  roomId: string,
  mutate: (state: GameState) => string | undefined | void,
): Promise<string | undefined> {
  const result = await withRoomLock(roomId, async () => {
    const state = await loadState(roomId)
    if (!state) return { error: 'Phòng chơi này không còn tồn tại.' }
    const error = mutate(state)
    if (error) return { error }
    await saveState(state)
    armRoomTimer(state)
    return { state }
  })

  if ('error' in result && result.error) return result.error
  await publishRoomChanged(roomId)
  await publishLobbyChanged()
  return undefined
}

export async function joinRoom(
  roomId: string,
  playerId: string,
  nickname: string,
): Promise<string | undefined> {
  return mutateRoom(roomId, (state) => {
    const existing = state.players.find((p) => p.id === playerId)
    if (existing) {
      // Reconnect: keep the seat, the hand and the eliminated flag intact.
      existing.connected = true
      existing.disconnectedAt = null
      existing.nickname = nickname
      return
    }
    return addPlayer(state, playerId, nickname) ?? undefined
  })
}

export async function markConnection(
  roomId: string,
  playerId: string,
  connected: boolean,
): Promise<void> {
  await mutateRoom(roomId, (state) => {
    setConnected(state, playerId, connected, Date.now())
  })
}

/**
 * Leaving the lobby frees the seat outright; leaving mid-game only marks the
 * player disconnected so they can come back to the same hand.
 */
export async function leaveRoom(roomId: string, playerId: string): Promise<void> {
  const meta = await getRoomMeta(roomId)

  await mutateRoom(roomId, (state) => {
    if (state.status === 'lobby') {
      state.players = state.players.filter((p) => p.id !== playerId)
      state.players.forEach((p, index) => (p.seat = index))
    } else {
      setConnected(state, playerId, false, Date.now())
    }
  })

  const state = await loadState(roomId)
  if (!state) return

  if (!state.players.length) {
    clearRoomTimer(roomId)
    await deleteRoom(roomId)
    await publishLobbyChanged()
    return
  }

  // Host migration: the longest-seated remaining player takes over.
  if (meta && meta.hostId === playerId) {
    const heir = state.players.find((p) => p.connected) ?? state.players[0]
    if (heir) {
      await setHost(roomId, heir.id)
      await publishRoomChanged(roomId)
      await publishLobbyChanged()
    }
  }
}

/**
 * Host-only removal, lobby phase only. Not a ban: the removed player can
 * `join` this room again afterwards exactly like a first-time joiner, since
 * `removePlayer` (lobby branch) drops their entry outright rather than
 * flagging it.
 */
export async function kickPlayer(roomId: string, targetPlayerId: string): Promise<string | undefined> {
  const error = await mutateRoom(roomId, (state) => {
    if (state.status !== 'lobby' && state.status !== 'over') return 'Chỉ có thể mời người chơi ra khỏi phòng khi ở phòng chờ.'
    if (!state.players.some((p) => p.id === targetPlayerId)) return 'Người chơi đó không có trong phòng này.'
    removePlayer(state, targetPlayerId)
    
    if (state.status === 'over') {
      const remaining = state.players.filter((p) => p.connected)
      if (remaining.length && remaining.every((p) => p.ready)) {
        resetToLobby(state, Date.now())
      }
    }
  })
  if (error) return error

  const target = peersInRoom(roomId).find((l) => l.context.playerId === targetPlayerId)
  if (target) send(target.peer, { type: 'kicked', reason: 'Chủ phòng đã mời bạn ra khỏi phòng chơi.' })
  return undefined
}

// ---------------------------------------------------------------------------
// Broadcasting
// ---------------------------------------------------------------------------

/** Redacts the state once per viewer and pushes it to that viewer only. */
export async function broadcastRoom(roomId: string): Promise<void> {
  const listeners = peersInRoom(roomId)
  if (!listeners.length) return

  const [state, meta] = await Promise.all([loadState(roomId), getRoomMeta(roomId)])
  if (!state) {
    for (const { peer } of listeners) {
      send(peer, { type: 'kicked', reason: 'Phòng chơi này đã bị đóng.' })
    }
    return
  }

  for (const { peer, context } of listeners) {
    send(peer, snapshotFor(state, meta, context.playerId))
  }
}

export function snapshotFor(state: GameState, meta: RoomMeta | null, viewerId: string): ServerMessage {
  const projected = projectStateFor(state, viewerId)
  if (projected.you) projected.you.isHost = meta?.hostId === viewerId
  return {
    type: 'snapshot',
    state: projected,
    hostId: meta?.hostId ?? '',
    roomName: meta?.name ?? 'Phòng chơi',
  }
}

export async function sendSnapshot(peer: Peer, roomId: string, viewerId: string): Promise<void> {
  const [state, meta] = await Promise.all([loadState(roomId), getRoomMeta(roomId)])
  if (!state) {
    send(peer, { type: 'kicked', reason: 'Phòng chơi này không còn tồn tại.' })
    return
  }
  send(peer, snapshotFor(state, meta, viewerId))
}

// ---------------------------------------------------------------------------
// Timer wiring
// ---------------------------------------------------------------------------

let wired = false

/** Timeouts re-enter the same command path as a real player action. */
export function wireTimers(): void {
  if (wired) return
  wired = true
  setTimerHandler(async (roomId, commandType) => {
    try {
      await applyCommand(roomId, { type: commandType, now: Date.now() } as Command)
    } catch (error) {
      console.error(`[timers] room ${roomId} ${commandType} failed:`, error)
    }
  })
}
