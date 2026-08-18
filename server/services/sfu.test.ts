import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { parseClientMessage } from '#shared/protocol/messages'
import {
  closeTracks,
  newSession,
  newTracks,
  realtimeConfigured,
  renegotiate,
} from './sfu'

/**
 * `sfu.ts` reaches for Nitro's ambient `useRuntimeConfig` and `$fetch`.
 * Both are stubbed here so the SFU wire format can be asserted without a
 * network — the shapes are the part that is easy to get wrong.
 */
type Globals = typeof globalThis & {
  useRuntimeConfig: () => Record<string, unknown>
  $fetch: ReturnType<typeof vi.fn>
}

const globals = globalThis as Globals
let fetchMock: ReturnType<typeof vi.fn>

function configure(appId: string, secret: string) {
  globals.useRuntimeConfig = () => ({ realtimeAppId: appId, realtimeAppSecret: secret })
}

beforeEach(() => {
  configure('app-123', 'secret-abc')
  fetchMock = vi.fn().mockResolvedValue({})
  globals.$fetch = fetchMock
})

afterEach(() => {
  vi.restoreAllMocks()
})

const lastCall = () => fetchMock.mock.calls[0] as [string, Record<string, unknown>]

describe('realtimeConfigured', () => {
  it('is false until both credentials are present', () => {
    configure('', '')
    expect(realtimeConfigured()).toBe(false)

    configure('app-123', '')
    expect(realtimeConfigured()).toBe(false)

    configure('', 'secret-abc')
    expect(realtimeConfigured()).toBe(false)

    configure('app-123', 'secret-abc')
    expect(realtimeConfigured()).toBe(true)
  })

  it('refuses to call out without credentials rather than sending an empty bearer', async () => {
    configure('', '')
    await expect(newSession()).rejects.toThrow('realtime-not-configured')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('SFU wire format', () => {
  it('creates a session under the app id, with the secret as a bearer token', async () => {
    fetchMock.mockResolvedValue({ sessionId: 'sess-1' })
    await expect(newSession()).resolves.toEqual({ sessionId: 'sess-1' })

    const [path, options] = lastCall()
    expect(path).toBe('/apps/app-123/sessions/new')
    expect(options.method).toBe('POST')
    expect(options.baseURL).toBe('https://rtc.live.cloudflare.com/v1')
    expect(options.headers).toEqual({ Authorization: 'Bearer secret-abc' })
  })

  it('pushes a local track with our offer attached', async () => {
    await newTracks('sess-1', {
      sessionDescription: { type: 'offer', sdp: 'v=0' },
      tracks: [{ location: 'local', mid: '0', trackName: 'mic-1' }],
    })

    const [path, options] = lastCall()
    expect(path).toBe('/apps/app-123/sessions/sess-1/tracks/new')
    expect(options.method).toBe('POST')
    expect(options.body).toEqual({
      sessionDescription: { type: 'offer', sdp: 'v=0' },
      tracks: [{ location: 'local', mid: '0', trackName: 'mic-1' }],
    })
  })

  it('pulls a remote track with no SDP — the SFU is the one that offers', async () => {
    fetchMock.mockResolvedValue({
      requiresImmediateRenegotiation: true,
      sessionDescription: { type: 'offer', sdp: 'v=0' },
      tracks: [{ mid: '7' }],
    })

    const response = await newTracks('sess-1', {
      tracks: [{ location: 'remote', sessionId: 'sess-2', trackName: 'mic-2' }],
    })

    expect(response.requiresImmediateRenegotiation).toBe(true)
    expect(response.sessionDescription?.type).toBe('offer')
    expect(response.tracks?.[0]?.mid).toBe('7')
    expect(lastCall()[1].body).toEqual({
      tracks: [{ location: 'remote', sessionId: 'sess-2', trackName: 'mic-2' }],
    })
  })

  it('answers a renegotiation with a PUT', async () => {
    await renegotiate('sess-1', { type: 'answer', sdp: 'v=0' })

    const [path, options] = lastCall()
    expect(path).toBe('/apps/app-123/sessions/sess-1/renegotiate')
    expect(options.method).toBe('PUT')
    expect(options.body).toEqual({ sessionDescription: { type: 'answer', sdp: 'v=0' } })
  })

  it('closes tracks by mid', async () => {
    await closeTracks('sess-1', { tracks: [{ mid: '7' }], force: true })

    const [path, options] = lastCall()
    expect(path).toBe('/apps/app-123/sessions/sess-1/tracks/close')
    expect(options.method).toBe('PUT')
    expect(options.body).toEqual({ tracks: [{ mid: '7' }], force: true })
  })
})

describe('voice messages on the game socket', () => {
  it('accepts the three signaling messages', () => {
    expect(
      parseClientMessage({ type: 'voice-join', sessionId: 'sess-1', trackName: 'mic-1' }).success,
    ).toBe(true)
    expect(parseClientMessage({ type: 'voice-leave' }).success).toBe(true)
    expect(parseClientMessage({ type: 'voice-mic', on: false }).success).toBe(true)
  })

  it('rejects a join with no track to pull', () => {
    expect(parseClientMessage({ type: 'voice-join', sessionId: 'sess-1' }).success).toBe(false)
    expect(
      parseClientMessage({ type: 'voice-join', sessionId: '', trackName: 'mic-1' }).success,
    ).toBe(false)
    expect(parseClientMessage({ type: 'voice-mic', on: 'yes' }).success).toBe(false)
  })
})
