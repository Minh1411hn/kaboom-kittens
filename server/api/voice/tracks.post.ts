import { voiceTracksBodySchema } from '#shared/protocol/voice'
import { newTracks, realtimeConfigured } from '../../services/sfu'
import { sessionFromEvent } from '../../services/sessions'
import { ownsVoiceSession } from '../../services/voice'

/**
 * Proxies `POST /sessions/{id}/tracks/new` — used both to publish our mic
 * (`location: 'local'`, with our offer) and to subscribe to someone else's
 * (`location: 'remote'`, no SDP; the SFU offers back).
 *
 * Only the path session is ownership-checked. The `sessionId` inside a remote
 * track object is deliberately somebody else's — that is what pulling means.
 */
export default defineEventHandler(async (event) => {
  const session = await sessionFromEvent(event)
  if (!session) throw createError({ statusCode: 401, statusMessage: 'Pick a nickname first.' })
  if (!realtimeConfigured()) {
    throw createError({ statusCode: 503, statusMessage: 'Voice chat is not configured.' })
  }

  const parsed = voiceTracksBodySchema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Invalid request.' })

  const { sessionId, ...rest } = parsed.data
  if (!(await ownsVoiceSession(sessionId, session.playerId))) {
    throw createError({ statusCode: 403, statusMessage: "That voice session isn't yours." })
  }

  return await newTracks(sessionId, rest)
})
