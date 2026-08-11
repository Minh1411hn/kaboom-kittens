import { nicknameSchema } from '#shared/protocol/messages'
import { createSession, saveSession, sessionFromEvent, setSessionCookie } from '../services/sessions'

/**
 * Claims (or renames) a nickname. Reuses the existing session where there is
 * one so a rename keeps the same playerId — and therefore the same seat.
 */
export default defineEventHandler(async (event) => {
  const body = await readBody<{ nickname?: string }>(event)
  const parsed = nicknameSchema.safeParse(body?.nickname ?? '')
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: parsed.error.issues[0]!.message })
  }

  const existing = await sessionFromEvent(event)
  const session = existing
    ? { ...existing, nickname: parsed.data }
    : await createSession(parsed.data)

  if (existing) await saveSession(session)
  setSessionCookie(event, session.token)

  return { playerId: session.playerId, nickname: session.nickname }
})
