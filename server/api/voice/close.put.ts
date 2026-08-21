import { voiceCloseBodySchema } from '#shared/protocol/voice'
import { closeTracks, realtimeConfigured } from '../../services/sfu'
import { sessionFromEvent } from '../../services/sessions'
import { ownsVoiceSession } from '../../services/voice'

/**
 * Proxies `PUT /sessions/{id}/tracks/close`. We always send `force: true` so
 * dropping a departed player's audio costs no renegotiation round trip.
 */
export default defineEventHandler(async (event) => {
  const session = await sessionFromEvent(event)
  if (!session) throw createError({ statusCode: 401, statusMessage: 'Pick a nickname first.' })
  if (!realtimeConfigured()) {
    throw createError({ statusCode: 503, statusMessage: 'Voice chat is not configured.' })
  }

  const parsed = voiceCloseBodySchema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Invalid request.' })

  const { sessionId, ...rest } = parsed.data
  if (!(await ownsVoiceSession(sessionId, session.playerId))) {
    throw createError({ statusCode: 403, statusMessage: "That voice session isn't yours." })
  }

  return await closeTracks(sessionId, rest)
})
