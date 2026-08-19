import WebSocket from 'ws'
import type { ClientMessage, ServerMessage } from '#shared/protocol/messages'
import type { PublicGameState } from '#shared/types/game'

/**
 * A scripted player for the integration tests: claims a nickname over the REST
 * endpoint, carries the resulting cookie into the socket upgrade, and keeps
 * the latest snapshot so assertions can look at exactly what a real browser
 * would have received.
 */
export class TestClient {
  ws!: WebSocket
  cookie = ''
  playerId = ''
  state: PublicGameState | null = null
  hostId = ''
  errors: string[] = []
  /**
   * Everything received so far. `waitFor` scans this before parking a waiter:
   * a message can arrive between the socket's `open` event resolving and the
   * next `await` registering its handler, and without a log it would be lost
   * and the wait would hang forever.
   */
  received: ServerMessage[] = []
  private waiters: Array<(message: ServerMessage) => boolean> = []

  constructor(
    readonly baseUrl: string,
    readonly nickname: string,
  ) {}

  async login(): Promise<void> {
    const response = await fetch(`${this.baseUrl}/api/session`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ nickname: this.nickname }),
    })
    if (!response.ok) throw new Error(`login failed for ${this.nickname}: ${response.status}`)
    const setCookie = response.headers.get('set-cookie') ?? ''
    this.cookie = setCookie.split(';')[0] ?? ''
    this.playerId = ((await response.json()) as { playerId: string }).playerId
  }

  async connect(): Promise<void> {
    const url = `${this.baseUrl.replace(/^http/, 'ws')}/_ws`
    this.ws = new WebSocket(url, { headers: { cookie: this.cookie } })

    this.ws.on('message', (raw) => {
      const message = JSON.parse(String(raw)) as ServerMessage
      this.received.push(message)
      if (message.type === 'snapshot') {
        this.state = message.state
        this.hostId = message.hostId
      }
      if (message.type === 'error') this.errors.push(message.message)
      this.waiters = this.waiters.filter((waiter) => !waiter(message))
    })

    await new Promise<void>((resolve, reject) => {
      this.ws.once('open', () => resolve())
      this.ws.once('error', reject)
    })
    await this.waitFor((message) => message.type === 'welcome', 5000, 'the welcome message')
  }

  send(message: ClientMessage): void {
    this.ws.send(JSON.stringify(message))
  }

  /** Resolves once a message satisfying `predicate` arrives. */
  waitFor(
    predicate: (message: ServerMessage) => boolean,
    timeoutMs = 5000,
    what = 'a message',
  ): Promise<ServerMessage> {
    const idx = this.received.findIndex(predicate)
    if (idx !== -1) {
      const [already] = this.received.splice(idx, 1)
      return Promise.resolve(already!)
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () =>
          reject(
            new Error(
              `${this.nickname}: timed out waiting for ${what}. ` +
                `socket=${this.ws.readyState} errors=[${this.errors.join(' | ')}] ` +
                `state=${JSON.stringify({
                  status: this.state?.status,
                  players: this.state?.players.length,
                  you: Boolean(this.state?.you),
                })}`,
            ),
          ),
        timeoutMs,
      )
      this.waiters.push((message) => {
        if (!predicate(message)) return false
        clearTimeout(timer)
        resolve(message)
        return true
      })
    })
  }

  /** Resolves once the snapshot satisfies `predicate` (checks the current one first). */
  async waitForState(
    predicate: (state: PublicGameState) => boolean,
    timeoutMs = 5000,
    what = 'a matching snapshot',
  ): Promise<PublicGameState> {
    if (this.state && predicate(this.state)) return this.state
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () =>
          reject(
            new Error(
              `${this.nickname}: timed out waiting for ${what}. ` +
                `socket=${this.ws.readyState} errors=[${this.errors.join(' | ')}] ` +
                `state=${JSON.stringify({
                  status: this.state?.status,
                  players: this.state?.players.length,
                  you: Boolean(this.state?.you),
                })}`,
            ),
          ),
        timeoutMs,
      )
      this.waiters.push((message) => {
        if (message.type === 'snapshot' && predicate(message.state)) {
          clearTimeout(timer)
          resolve()
          return true
        }
        return false
      })
    })
    return this.state!
  }

  close(): void {
    this.ws?.close()
  }
}

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
