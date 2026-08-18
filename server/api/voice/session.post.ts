import { newSession, realtimeConfigured } from '../../services/sfu'
import { sessionFromEvent } from '../../services/sessions'
import { rememberVoiceSession } from '../../services/voice'

/**
 * Mints a Cloudflare SFU session for the caller. The App Secret stays here;
 * the browser only ever sees the returned `sessionId`.
 */
export default defineEventHandler(async (event) => {
  const session = await sessionFromEvent(event)
  if (!session) throw createError({ statusCode: 401, statusMessage: 'Pick a nickname first.' })

  if (!realtimeConfigured()) {
    // 503, not 500: the deployment simply has voice switched off, and the
    // client treats this as "hide the voice UI" rather than as a failure.
    throw createError({ statusCode: 503, statusMessage: 'Voice chat chưa được cấu hình.' })
  }

  const { sessionId } = await newSession()
  await rememberVoiceSession(sessionId, session.playerId)
  return { sessionId }
})
