/** Nickname-only identity. The server holds the real session; this mirrors it. */
export function useSession() {
  const nickname = useState<string>('kk:nickname', () => '')
  const playerId = useState<string>('kk:sessionPlayerId', () => '')
  const ready = useState<boolean>('kk:sessionReady', () => false)

  async function load(): Promise<void> {
    // Already resolved during SSR and carried over in the payload.
    if (ready.value) return

    // `useRequestFetch` forwards the incoming cookie header, so the server
    // render knows who you are and the nickname gate does not flash on load.
    const request = useRequestFetch()
    try {
      const result = await request<{ playerId: string | null; nickname: string | null }>(
        '/api/session',
      )
      nickname.value = result.nickname ?? ''
      playerId.value = result.playerId ?? ''
    } catch {
      nickname.value = ''
    } finally {
      ready.value = true
    }
  }

  /** Claims or renames; the playerId (and therefore the seat) is preserved. */
  async function setNickname(value: string): Promise<void> {
    const result = await $fetch<{ playerId: string; nickname: string }>('/api/session', {
      method: 'POST',
      body: { nickname: value },
    })
    nickname.value = result.nickname
    playerId.value = result.playerId
    if (import.meta.client) localStorage.setItem('kk:nickname', result.nickname)
  }

  /** Best guess for prefilling the input on a fresh browser session. */
  function remembered(): string {
    return import.meta.client ? (localStorage.getItem('kk:nickname') ?? '') : ''
  }

  return { nickname, playerId, ready, load, setNickname, remembered }
}
