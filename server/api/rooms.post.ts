import { roomNameSchema } from '#shared/protocol/messages'
import { publishLobbyChanged } from '../services/bus'
import { createRoom } from '../services/roomRepo'
import { sessionFromEvent } from '../services/sessions'

export default defineEventHandler(async (event) => {
  const session = await sessionFromEvent(event)
  if (!session) throw createError({ statusCode: 401, statusMessage: 'Pick a nickname first.' })

  const body = await readBody<{ name?: string }>(event)
  const fallback = `${session.nickname}'s room`
  const parsed = roomNameSchema.safeParse(body?.name?.trim() || fallback)
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'That room name will not work.' })
  }

  // The creator is the host; players actually join over the socket.
  const room = await createRoom(parsed.data, session.playerId, session.nickname)
  await publishLobbyChanged()

  return { roomId: room.id, name: room.name }
})
