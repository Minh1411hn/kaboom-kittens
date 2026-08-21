import { voiceRenegotiateBodySchema } from '#shared/protocol/voice'
import { realtimeConfigured, renegotiate } from '../../services/sfu'
import { sessionFromEvent } from '../../services/sessions'
import { ownsVoiceSession } from '../../services/voice'

/**
 * Proxies `PUT /sessions/{id}/renegotiate` — our answer to the offer the SFU
 * sent back when we pulled a remote track.
 */
export default defineEventHandler(async (event) => {
  const session = await sessionFromEvent(event)
  if (!session) throw createError({ statusCode: 401, statusMessage: 'Pick a nickname first.' })
  if (!realtimeConfigured()) {
    throw createError({ statusCode: 503, statusMessage: 'Voice chat is not configured.' })
  }

  const parsed = voiceRenegotiateBodySchema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Invalid request.' })

  const { sessionId, sessionDescription } = parsed.data
  if (!(await ownsVoiceSession(sessionId, session.playerId))) {
    throw createError({ statusCode: 403, statusMessage: "That voice session isn't yours." })
  }

  return await renegotiate(sessionId, sessionDescription)
})
