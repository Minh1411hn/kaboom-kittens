import { listRooms } from '../services/roomRepo'

/** Initial lobby paint; live updates arrive over the socket afterwards. */
export default defineEventHandler(async () => ({ rooms: await listRooms() }))
