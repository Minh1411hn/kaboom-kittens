import type { Peer } from 'crossws'
import type { Command } from '#shared/types/game'
import { parseClientMessage, type ClientMessage } from '#shared/protocol/messages'
import {
  attachPeer,
  awaitOpen,
  detachPeer,
  markOpening,
  peerContext,
  playerHasOtherPeer,
  send,
} from '../services/bus'
import { appendChat, getRoomMeta, listRooms, loadChat } from '../services/roomRepo'
import {
  applyCommand,
  broadcastRoom,
  joinRoom,
  kickPlayer,
  leaveRoom,
  markConnection,
  sendSnapshot,
} from '../services/roomService'
import { sessionFromCookieHeader } from '../services/sessions'
import { peersInRoom } from '../services/bus'

/**
 * The single socket entrypoint. Identity comes from the session cookie on the
 * upgrade — the client never tells the server who it is, so a player cannot
 * act as anyone else by editing a message.
 */

/** Cheap per-socket token bucket; stops a stuck client flooding the room. */
const buckets = new WeakMap<Peer, { tokens: number; last: number }>()
const BUCKET_SIZE = 25
const REFILL_PER_SECOND = 8

function allow(peer: Peer): boolean {
  const now = Date.now()
  const bucket = buckets.get(peer) ?? { tokens: BUCKET_SIZE, last: now }
  bucket.tokens = Math.min(BUCKET_SIZE, bucket.tokens + ((now - bucket.last) / 1000) * REFILL_PER_SECOND)
  bucket.last = now
  if (bucket.tokens < 1) {
    buckets.set(peer, bucket)
    return false
  }
  bucket.tokens -= 1
  buckets.set(peer, bucket)
  return true
}

const fail = (peer: Peer, code: string, message: string) =>
  send(peer, { type: 'error', code, message })

export default defineWebSocketHandler({
  open(peer) {
    // Registered before awaiting so a message racing the handshake can wait
    // for it rather than arriving to an empty registry and being dropped.
    const ready = (async () => {
      try {
        const session = await sessionFromCookieHeader(
          peer.request?.headers?.get('cookie') ?? undefined,
        )
        if (!session) {
          fail(peer, 'no-session', 'Pick a nickname first.')
          peer.close(4001, 'no-session')
          return
        }

        attachPeer(peer, {
          playerId: session.playerId,
          nickname: session.nickname,
          roomId: null,
          watchingLobby: false,
        })
        send(peer, { type: 'welcome', playerId: session.playerId, nickname: session.nickname })
      } catch (error) {
        // Without this the socket would sit open forever with no welcome.
        console.error('[ws] open failed:', error)
        fail(peer, 'open-failed', 'Không thể khởi tạo phiên kết nối. Vui lòng tải lại trang.')
        peer.close(1011, 'open-failed')
      }
    })()

    markOpening(peer, ready)
    return ready
  },

  async message(peer, message) {
    if (!peerContext(peer)) await awaitOpen(peer)
    const context = peerContext(peer)
    if (!context) return fail(peer, 'no-session', 'Phiên đăng nhập đã hết hạn — vui lòng tải lại trang.')

    let raw: unknown
    try {
      raw = JSON.parse(message.text())
    } catch {
      return fail(peer, 'bad-json', 'Tin nhắn không hợp lệ.')
    }

    const parsed = parseClientMessage(raw)
    if (!parsed.success) {
      return fail(peer, 'bad-message', parsed.error.issues[0]?.message ?? 'Tin nhắn không đúng định dạng.')
    }
    if (parsed.data.type !== 'ping' && !allow(peer)) {
      return fail(peer, 'rate-limited', 'Thao tác quá nhanh, vui lòng chờ trong giây lát.')
    }

    try {
      await handle(peer, parsed.data)
    } catch (error) {
      console.error('[ws] handler failed:', error)
      fail(peer, 'server-error', 'Đã xảy ra lỗi khi xử lý yêu cầu.')
    }
  },

  async close(peer) {
    // A socket can close mid-handshake; settle it first so the seat is freed.
    await awaitOpen(peer)
    const context = detachPeer(peer)
    if (!context?.roomId) return

    // Another tab may still hold the seat; only the last one counts as leaving.
    if (playerHasOtherPeer(context.roomId, context.playerId, peer)) return

    await markConnection(context.roomId, context.playerId, false)
  },
})

async function handle(peer: Peer, message: ClientMessage): Promise<void> {
  const context = peerContext(peer)
  if (!context) return
  const now = Date.now()

  switch (message.type) {
    case 'ping':
      return send(peer, { type: 'pong', at: now })

    case 'watch-lobby': {
      context.watchingLobby = true
      return send(peer, { type: 'room-list', rooms: await listRooms() })
    }

    case 'join': {
      const meta = await getRoomMeta(message.roomId)
      if (!meta) return fail(peer, 'no-room', 'Phòng chơi đó không còn tồn tại.')

      const error = await joinRoom(message.roomId, context.playerId, context.nickname)
      if (error) return fail(peer, 'join-failed', error)

      context.roomId = message.roomId
      context.watchingLobby = false
      await sendSnapshot(peer, message.roomId, context.playerId)
      for (const chat of await loadChat(message.roomId)) send(peer, { type: 'chat', message: chat })
      return broadcastRoom(message.roomId)
    }

    case 'leave': {
      if (!context.roomId) return
      const roomId = context.roomId
      context.roomId = null
      await leaveRoom(roomId, context.playerId)
      return broadcastRoom(roomId)
    }

    case 'chat': {
      if (!context.roomId) return fail(peer, 'not-in-room', 'Hãy tham gia phòng trước.')
      const chat = {
        id: `${now}-${context.playerId.slice(0, 8)}`,
        playerId: context.playerId,
        nickname: context.nickname,
        text: message.text,
        at: now,
      }
      await appendChat(context.roomId, chat)
      for (const { peer: target } of peersInRoom(context.roomId)) {
        send(target, { type: 'chat', message: chat })
      }
      return
    }

    case 'start-game': {
      if (!context.roomId) return fail(peer, 'not-in-room', 'Hãy tham gia phòng trước.')
      const meta = await getRoomMeta(context.roomId)
      if (meta?.hostId !== context.playerId) {
        return fail(peer, 'not-host', 'Chỉ chủ phòng mới có thể bắt đầu ván đấu.')
      }
      return report(peer, await applyCommand(context.roomId, {
        type: 'start-game',
        playerId: context.playerId,
        now,
      }))
    }

    case 'set-deck-overrides': {
      if (!context.roomId) return fail(peer, 'not-in-room', 'Hãy tham gia phòng trước.')
      const meta = await getRoomMeta(context.roomId)
      if (meta?.hostId !== context.playerId) {
        return fail(peer, 'not-host', 'Chỉ chủ phòng mới có thể chỉnh bộ bài.')
      }
      return report(peer, await applyCommand(context.roomId, {
        type: 'set-deck-overrides',
        playerId: context.playerId,
        overrides: message.overrides,
        now,
      }))
    }

    case 'play-card':
      return runCommand(peer, {
        type: 'play-card',
        playerId: context.playerId,
        uids: message.uids,
        combo: message.combo,
        targetPlayerId: message.targetPlayerId,
        namedCardId: message.namedCardId,
        now,
      })

    case 'draw-card':
      return runCommand(peer, { type: 'draw-card', playerId: context.playerId, now })

    case 'pass-nope':
      return runCommand(peer, { type: 'pass-nope', playerId: context.playerId, now })

    case 'quit-game':
      return runCommand(peer, { type: 'quit-game', playerId: context.playerId, now })

    case 'return-to-lobby':
      return runCommand(peer, { type: 'return-to-lobby', playerId: context.playerId, now })

    case 'kick-player': {
      if (!context.roomId) return fail(peer, 'not-in-room', 'Hãy tham gia phòng trước.')
      const meta = await getRoomMeta(context.roomId)
      if (meta?.hostId !== context.playerId) {
        return fail(peer, 'not-host', 'Chỉ chủ phòng mới có quyền mời người chơi ra ngoài.')
      }
      if (message.targetPlayerId === context.playerId) {
        return fail(peer, 'cant-kick-self', 'Bạn không thể tự mời chính mình ra khỏi phòng.')
      }
      const error = await kickPlayer(context.roomId, message.targetPlayerId)
      if (error) return fail(peer, 'kick-failed', error)
      return broadcastRoom(context.roomId)
    }

    case 'submit-interaction':
      return runCommand(peer, {
        type: 'submit-interaction',
        playerId: context.playerId,
        interactionId: message.interactionId,
        response: message.response,
        now,
      })
  }
}

async function runCommand(peer: Peer, command: Command): Promise<void> {
  const context = peerContext(peer)
  if (!context?.roomId) return fail(peer, 'not-in-room', 'Hãy tham gia phòng trước.')
  report(peer, await applyCommand(context.roomId, command))
}

/** Rejections go only to the player who tried it, never to the whole table. */
function report(peer: Peer, error: string | undefined): void {
  if (error) fail(peer, 'rejected', error)
}
