/**
 * Ownership bookkeeping for Cloudflare SFU sessions.
 *
 * Session ids are not secret, but they are capability-like: anyone holding one
 * can renegotiate it or close its tracks. The Cloudflare docs call this out
 * explicitly — a backend that does not authenticate request origins lets an
 * attacker cut other people's audio. So every session we mint is stamped with
 * the player who asked for it, and the proxy routes refuse to act on a session
 * that is not theirs.
 */
import { useRedis } from './redis'

const ownerKey = (sessionId: string) => `voice:owner:${sessionId}`

const ttl = () => useRuntimeConfig().roomTtlSeconds

export async function rememberVoiceSession(sessionId: string, playerId: string): Promise<void> {
  await useRedis().set(ownerKey(sessionId), playerId, 'EX', ttl())
}

export async function voiceSessionOwner(sessionId: string): Promise<string | null> {
  return await useRedis().get(ownerKey(sessionId))
}

/** Refreshes the TTL on a match, so a long game does not expire a live call. */
export async function ownsVoiceSession(sessionId: string, playerId: string): Promise<boolean> {
  const owner = await voiceSessionOwner(sessionId)
  if (owner !== playerId) return false
  await useRedis().expire(ownerKey(sessionId), ttl())
  return true
}
