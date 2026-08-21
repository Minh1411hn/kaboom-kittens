import { avatarIdSchema, nicknameSchema } from '#shared/protocol/messages'
import { createSession, saveSession, sessionFromEvent, setSessionCookie } from '../services/sessions'

/**
 * Claims (or renames) a nickname, and optionally sets the avatar. Reuses the
 * existing session where there is one so a rename keeps the same playerId —
 * and therefore the same seat. `avatarId` is optional: `NicknameGate.vue`'s
 * first-time claim omits it and keeps whatever `createSession` picked (or the
 * existing session's avatar on a plain rename); `ProfileDialog.vue` sends it.
 */
export default defineEventHandler(async (event) => {
  const body = await readBody<{ nickname?: string; avatarId?: string }>(event)
  const parsed = nicknameSchema.safeParse(body?.nickname ?? '')
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request', data: { code: parsed.error.issues[0]!.message } })
  }

  let avatarId: string | undefined
  if (body?.avatarId !== undefined) {
    const avatarParsed = avatarIdSchema.safeParse(body.avatarId)
    if (!avatarParsed.success) {
      throw createError({ statusCode: 400, statusMessage: 'Bad Request', data: { code: 'avatar-invalid' } })
    }
    avatarId = avatarParsed.data
  }

  const existing = await sessionFromEvent(event)
  const session = existing
    ? { ...existing, nickname: parsed.data, avatarId: avatarId ?? existing.avatarId }
    : await createSession(parsed.data, avatarId)

  if (existing) await saveSession(session)
  setSessionCookie(event, session.token)

  return { playerId: session.playerId, nickname: session.nickname, avatarId: session.avatarId }
})
