import { useRedis } from '../services/redis'

/** Used by the compose healthcheck and for a quick "is Redis wired up" check. */
export default defineEventHandler(async () => {
  try {
    const pong = await useRedis().ping()
    return { ok: pong === 'PONG', redis: pong }
  } catch (error) {
    return { ok: false, redis: (error as Error).message }
  }
})
