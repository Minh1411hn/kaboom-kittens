import type { ClientMessage, ChatMessage, RoomSummary, ServerMessage } from '#shared/protocol/messages'
import type { VoiceMember } from '#shared/protocol/voice'
import type { GameEvent, PublicGameState } from '#shared/types/game'

/**
 * One reconnecting socket, shared by every component through `useState`.
 *
 * The server sends a full redacted snapshot after each command, so recovery
 * from a dropped connection is just "reconnect and take the next snapshot" —
 * there is no replay buffer or patch stream to get out of sync.
 */
export function useGameSocket() {
  const state = useState<PublicGameState | null>('kk:state', () => null)
  const hostId = useState<string>('kk:hostId', () => '')
  const roomName = useState<string>('kk:roomName', () => '')
  const rooms = useState<RoomSummary[]>('kk:rooms', () => [])
  const chat = useState<ChatMessage[]>('kk:chat', () => [])
  /** Who is in the voice call right now — rides along on every snapshot. */
  const voice = useState<VoiceMember[]>('kk:voice', () => [])
  const playerId = useState<string>('kk:playerId', () => '')
  const status = useState<'idle' | 'connecting' | 'open' | 'closed'>('kk:wsStatus', () => 'idle')
  const error = useState<string>('kk:wsError', () => '')
  const kicked = useState<string>('kk:kicked', () => '')
  /** Events the UI has not animated yet, newest last. */
  const pending = useState<GameEvent[]>('kk:events', () => [])

  const socket = useState<WebSocket | null>('kk:socket', () => shallowRef(null) as never)
  const seenSeq = useState<number>('kk:seenSeq', () => 0)
  const queue = useState<ClientMessage[]>('kk:queue', () => [])
  const attempts = useState<number>('kk:attempts', () => 0)
  const wantOpen = useState<boolean>('kk:wantOpen', () => false)

  let retryTimer: ReturnType<typeof setTimeout> | undefined
  let heartbeat: ReturnType<typeof setInterval> | undefined

  function url(): string {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
    return `${protocol}//${location.host}/_ws`
  }

  function connect(): void {
    if (!import.meta.client) return
    wantOpen.value = true
    if (socket.value && (socket.value.readyState === 0 || socket.value.readyState === 1)) return

    status.value = 'connecting'
    const ws = new WebSocket(url())
    socket.value = ws

    ws.onopen = () => {
      status.value = 'open'
      attempts.value = 0
      error.value = ''
      for (const message of queue.value.splice(0)) ws.send(JSON.stringify(message))
      heartbeat = setInterval(() => send({ type: 'ping' }), 25000)
    }

    ws.onmessage = (raw) => {
      let message: ServerMessage
      try {
        message = JSON.parse(raw.data as string) as ServerMessage
      } catch {
        return
      }
      handle(message)
    }

    ws.onclose = () => {
      status.value = 'closed'
      clearInterval(heartbeat)
      if (!wantOpen.value) return
      // Exponential backoff, capped, so a server restart does not stampede.
      attempts.value += 1
      const delay = Math.min(500 * 2 ** Math.min(attempts.value, 5), 10000)
      retryTimer = setTimeout(connect, delay)
    }

    ws.onerror = () => {
      // `onclose` always follows; retrying is handled there.
    }
  }

  function handle(message: ServerMessage): void {
    switch (message.type) {
      case 'welcome':
        playerId.value = message.playerId
        break

      case 'snapshot': {
        state.value = message.state
        hostId.value = message.hostId
        roomName.value = message.roomName
        voice.value = message.voice ?? []
        // Anything newer than we have seen is fresh for animation.
        const fresh = message.state.log.filter((event) => event.seq > seenSeq.value)
        if (fresh.length) {
          pending.value = [...pending.value, ...fresh].slice(-300)
          seenSeq.value = fresh[fresh.length - 1]!.seq
        }
        break
      }

      case 'room-list':
        rooms.value = message.rooms
        break

      case 'chat':
        if (!chat.value.some((c) => c.id === message.message.id)) {
          chat.value = [...chat.value, message.message].slice(-300)
        }
        break

      case 'error':
        error.value = message.message
        setTimeout(() => {
          if (error.value === message.message) error.value = ''
        }, 4000)
        break

      case 'kicked':
        kicked.value = message.reason
        wantOpen.value = false
        socket.value?.close()
        break

      case 'pong':
        break
    }
  }

  function send(message: ClientMessage): void {
    const ws = socket.value
    if (ws && ws.readyState === 1) ws.send(JSON.stringify(message))
    // Buffer while reconnecting so a click during a blip is not simply lost.
    else queue.value.push(message)
  }

  /**
   * Tell the server we are gone before the tab dies. `onBeforeUnmount` does not
   * run when a tab is closed, and `pagehide` (not `beforeunload`) is the event
   * Safari/iOS actually fires. Best effort only — the server's socket-close
   * handler is what really frees the seat.
   */
  function leaveOnPageHide(): () => void {
    if (!import.meta.client) return () => {}
    const onHide = () => {
      const ws = socket.value
      if (ws && ws.readyState === 1) ws.send(JSON.stringify({ type: 'leave' } satisfies ClientMessage))
    }
    window.addEventListener('pagehide', onHide)
    return () => window.removeEventListener('pagehide', onHide)
  }

  function disconnect(): void {
    wantOpen.value = false
    clearTimeout(retryTimer)
    clearInterval(heartbeat)
    socket.value?.close()
    socket.value = null
    status.value = 'idle'
  }

  function resetRoom(): void {
    state.value = null
    chat.value = []
    voice.value = []
    pending.value = []
    seenSeq.value = 0
    kicked.value = ''
  }

  return {
    // state
    state,
    hostId,
    roomName,
    rooms,
    chat,
    voice,
    playerId,
    status,
    error,
    kicked,
    pending,
    // actions
    connect,
    disconnect,
    send,
    resetRoom,
    leaveOnPageHide,
  }
}
