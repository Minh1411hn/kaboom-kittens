import { lobbyPeers, send, startBus } from '../services/bus'
import { listRooms } from '../services/roomRepo'
import { broadcastRoom, wireTimers } from '../services/roomService'

/**
 * Starts the cross-process bus and the timer dispatcher once per server.
 * Redis pub/sub carries only a room id; this process then re-reads the state
 * and projects it per viewer, so nothing private ever rides on the channel.
 */
export default defineNitroPlugin(async () => {
  wireTimers()

  await startBus(
    async (roomId) => {
      try {
        await broadcastRoom(roomId)
      } catch (error) {
        console.error(`[realtime] broadcast for ${roomId} failed:`, error)
      }
    },
    async () => {
      const watchers = lobbyPeers()
      if (!watchers.length) return
      try {
        const rooms = await listRooms()
        for (const peer of watchers) send(peer, { type: 'room-list', rooms })
      } catch (error) {
        console.error('[realtime] lobby broadcast failed:', error)
      }
    },
  )
})
