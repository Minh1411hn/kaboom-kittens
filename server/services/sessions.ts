import { randomUUID } from 'node:crypto'
import type { H3Event } from 'h3'
import avatarManifest from '#shared/generated/avatar-art.json'
import { useRedis } from './redis'

/**
 * Nickname + avatar identity. The cookie holds an opaque token; the token maps
 * to a stable playerId in Redis, which is what lets a refresh — or a crashed
 * tab — rejoin the same seat instead of arriving as a stranger.
 */

export const SESSION_COOKIE = 'kk_session'
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7

export interface Session {
  token: string
  playerId: string
  nickname: string
  avatarId: string
}

const key = (token: string) => `session:${token}`

/** Import the raw manifest directly here rather than `avatarIdSchema` from
 *  the protocol layer, so this file stays free of zod/protocol dependencies. */
function randomAvatarId(): string {
  const ids = Object.keys(avatarManifest)
  return ids[Math.floor(Math.random() * ids.length)] ?? ''
}

export async function createSession(nickname: string, avatarId?: string): Promise<Session> {
  const session: Session = {
    token: randomUUID(),
    playerId: randomUUID(),
    nickname,
    avatarId: avatarId ?? randomAvatarId(),
  }
  await saveSession(session)
  return session
}

export async function saveSession(session: Session): Promise<void> {
  await useRedis().set(
    key(session.token),
    JSON.stringify({ playerId: session.playerId, nickname: session.nickname, avatarId: session.avatarId }),
    'EX',
    SESSION_TTL_SECONDS,
  )
}

export async function readSession(token: string | undefined): Promise<Session | null> {
  if (!token) return null
  const raw = await useRedis().get(key(token))
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as { playerId: string; nickname: string; avatarId?: string }
    // Touch the TTL so an active player's session does not expire under them.
    await useRedis().expire(key(token), SESSION_TTL_SECONDS)

    // Sessions created before avatars existed have no avatarId. Assign one
    // at random and persist it immediately, so it stays stable across
    // subsequent reads instead of re-randomizing on every request — the
    // player can then change it deliberately via the profile dialog.
    const session: Session = {
      token,
      playerId: parsed.playerId,
      nickname: parsed.nickname,
      avatarId: parsed.avatarId ?? randomAvatarId(),
    }
    if (!parsed.avatarId) await saveSession(session)
    return session
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
