import { sessionFromEvent } from '../services/sessions'

/** Lets the client tell whether it already has a nickname before rendering. */
export default defineEventHandler(async (event) => {
  const session = await sessionFromEvent(event)
  if (!session) return { playerId: null, nickname: null }
  return { playerId: session.playerId, nickname: session.nickname }
})
