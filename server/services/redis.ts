import Redis from 'ioredis'

/**
 * Two connections: one for normal commands, one dedicated subscriber (a
 * subscribed ioredis client cannot issue other commands).
 */
let client: Redis | null = null
let subscriber: Redis | null = null

const OPTIONS = {
  maxRetriesPerRequest: 3,
  retryStrategy: (times: number) => Math.min(times * 200, 3000),
  lazyConnect: false,
} as const

export function useRedis(): Redis {
  if (!client) {
    client = new Redis(useRuntimeConfig().redisUrl, OPTIONS)
    client.on('error', (error) => console.error('[redis] client error:', error.message))
  }
  return client
}

export function useSubscriber(): Redis {
  if (!subscriber) {
    subscriber = new Redis(useRuntimeConfig().redisUrl, OPTIONS)
    subscriber.on('error', (error) => console.error('[redis] subscriber error:', error.message))
  }
  return subscriber
}

export async function closeRedis(): Promise<void> {
  await Promise.allSettled([client?.quit(), subscriber?.quit()])
  client = null
  subscriber = null
}
