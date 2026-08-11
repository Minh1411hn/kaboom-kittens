import { randomUUID } from 'node:crypto'
import type { H3Event } from 'h3'
import { useRedis } from './redis'

/**
 * Nickname-only identity. The cookie holds an opaque token; the token maps to
 * a stable playerId in Redis, which is what lets a refresh — or a crashed tab —
 * rejoin the same seat instead of arriving as a stranger.
 */

export const SESSION_COOKIE = 'kk_session'
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7

export interface Session {
  token: string
  playerId: string
  nickname: string
}

const key = (token: string) => `session:${token}`

export async function createSession(nickname: string): Promise<Session> {
  const session: Session = { token: randomUUID(), playerId: randomUUID(), nickname }
  await saveSession(session)
  return session
}

export async function saveSession(session: Session): Promise<void> {
  await useRedis().set(
    key(session.token),
    JSON.stringify({ playerId: session.playerId, nickname: session.nickname }),
    'EX',
    SESSION_TTL_SECONDS,
  )
}

export async function readSession(token: string | undefined): Promise<Session | null> {
  if (!token) return null
  const raw = await useRedis().get(key(token))
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as { playerId: string; nickname: string }
    // Touch the TTL so an active player's session does not expire under them.
    await useRedis().expire(key(token), SESSION_TTL_SECONDS)
    return { token, ...parsed }
  } catch {
    return null
  }
}

export function setSessionCookie(event: H3Event, token: string): void {
  setCookie(event, SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
    secure: getRequestProtocol(event) === 'https',
  })
}

export async function sessionFromEvent(event: H3Event): Promise<Session | null> {
  return readSession(getCookie(event, SESSION_COOKIE))
}

/** Parses the session cookie off a raw WebSocket upgrade request. */
export async function sessionFromCookieHeader(header: string | undefined): Promise<Session | null> {
  if (!header) return null
  const match = header
    .split(';')
    .map((part) => part.trim().split('='))
    .find(([name]) => name === SESSION_COOKIE)
  return readSession(match?.[1] ? decodeURIComponent(match[1]) : undefined)
}
