/**
 * Thin, stateless wrapper over the Cloudflare Realtime SFU HTTPS API.
 *
 * The App Secret never leaves the server — every browser call goes through the
 * `/api/voice/*` proxy routes, which is also where the caller is authenticated
 * and where session ownership is checked. This file only speaks HTTP.
 *
 * Negotiation order (the part that is easy to get backwards):
 *   push  — we send an offer, the SFU answers.
 *   pull  — we send no SDP, the SFU offers, we answer via /renegotiate.
 *
 * https://developers.cloudflare.com/realtime/sfu/https-api/
 */

const BASE_URL = 'https://rtc.live.cloudflare.com/v1'

export interface SessionDescription {
  type: 'offer' | 'answer'
  sdp: string
}

export interface TrackRequest {
  location: 'local' | 'remote'
  /** Local: the transceiver mid we just created. Remote: leave unset. */
  mid?: string
  /** Remote only: the session publishing the track we want to hear. */
  sessionId?: string
  trackName: string
}

export interface TracksRequest {
  sessionDescription?: SessionDescription
  tracks: TrackRequest[]
}

export interface TrackResponse {
  mid?: string
  trackName?: string
  sessionId?: string
  errorCode?: string
  errorDescription?: string
}

export interface TracksResponse {
  requiresImmediateRenegotiation?: boolean
  sessionDescription?: SessionDescription
  tracks?: TrackResponse[]
  errorCode?: string
  errorDescription?: string
}

export interface CloseTracksRequest {
  tracks: { mid: string }[]
  sessionDescription?: SessionDescription
  force?: boolean
}

function credentials(): { appId: string; secret: string } | null {
  const config = useRuntimeConfig()
  const appId = String(config.realtimeAppId ?? '')
  const secret = String(config.realtimeAppSecret ?? '')
  if (!appId || !secret) return null
  return { appId, secret }
}

/** False when the two NUXT_REALTIME_* vars are unset — voice is then off. */
export function realtimeConfigured(): boolean {
  return credentials() !== null
}

async function call<T>(method: 'POST' | 'PUT', path: string, body?: unknown): Promise<T> {
  const creds = credentials()
  // Callers are expected to have checked `realtimeConfigured()` and answered
  // 503; reaching here without credentials is a bug, not a user error.
  if (!creds) throw new Error('realtime-not-configured')

  // `$fetch`'s inferred response type cannot be reconciled with a caller's
  // bare `T`, and its `body` is narrower than `unknown`; both are asserted
  // here so every endpoint wrapper below stays plainly typed.
  return (await $fetch(`/apps/${creds.appId}${path}`, {
    baseURL: BASE_URL,
    method,
    headers: { Authorization: `Bearer ${creds.secret}` },
    body: body as Record<string, unknown> | undefined,
  })) as T
}

export async function newSession(): Promise<{ sessionId: string }> {
  return await call<{ sessionId: string }>('POST', '/sessions/new')
}

export async function newTracks(sessionId: string, body: TracksRequest): Promise<TracksResponse> {
  return await call<TracksResponse>('POST', `/sessions/${sessionId}/tracks/new`, body)
}

export async function renegotiate(
  sessionId: string,
  sessionDescription: SessionDescription,
): Promise<unknown> {
  return await call('PUT', `/sessions/${sessionId}/renegotiate`, { sessionDescription })
}

export async function closeTracks(sessionId: string, body: CloseTracksRequest): Promise<unknown> {
  return await call('PUT', `/sessions/${sessionId}/tracks/close`, body)
}
