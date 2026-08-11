import { randomUUID } from 'node:crypto'
import { useRedis } from './redis'

const LOCK_TTL_MS = 5000
const RETRY_DELAY_MS = 25
const MAX_WAIT_MS = 4000

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Serialises every mutation of a room. Without this, two players clicking at
 * the same instant could both read the pre-play state and one write would win
 * silently, duplicating a card or losing a turn.
 *
 * Released with a token check so a lock that expired mid-work is never
 * released out from under whoever holds it now.
 */
export async function withRoomLock<T>(roomId: string, fn: () => Promise<T>): Promise<T> {
  const redis = useRedis()
  const key = `room:${roomId}:lock`
  const token = randomUUID()
  const deadline = Date.now() + MAX_WAIT_MS

  while (Date.now() < deadline) {
    const acquired = await redis.set(key, token, 'PX', LOCK_TTL_MS, 'NX')
    if (acquired) {
      try {
        return await fn()
      } finally {
        // Compare-and-delete: only the owner may release.
        await redis.eval(
          `if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end`,
          1,
          key,
          token,
        )
      }
    }
    await sleep(RETRY_DELAY_MS)
  }

  throw new Error(`Timed out waiting for the lock on room ${roomId}`)
}
