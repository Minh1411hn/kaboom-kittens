/** Nickname + avatar identity. The server holds the real session; this mirrors it. */
export function useSession() {
  const nickname = useState<string>('kk:nickname', () => '')
  const avatarId = useState<string>('kk:avatarId', () => '')
  const playerId = useState<string>('kk:sessionPlayerId', () => '')
  const ready = useState<boolean>('kk:sessionReady', () => false)

  async function load(): Promise<void> {
    // Already resolved during SSR and carried over in the payload.
    if (ready.value) return

    // `useRequestFetch` forwards the incoming cookie header, so the server
    // render knows who you are and the nickname gate does not flash on load.
    const request = useRequestFetch()
    try {
      const result = await request<{ playerId: string | null; nickname: string | null; avatarId: string | null }>(
        '/api/session',
      )
      nickname.value = result.nickname ?? ''
      avatarId.value = result.avatarId ?? ''
      playerId.value = result.playerId ?? ''
    } catch {
      nickname.value = ''
      avatarId.value = ''
    } finally {
      ready.value = true
    }
  }

  /** Claims or renames; the playerId (and therefore the seat) is preserved.
   *  Leaves the avatar untouched — first-time claim keeps whatever the
   *  server randomized, a plain rename keeps whatever was already chosen. */
  async function setNickname(value: string): Promise<void> {
    const result = await $fetch<{ playerId: string; nickname: string; avatarId: string }>('/api/session', {
      method: 'POST',
      body: { nickname: value },
    })
    nickname.value = result.nickname
    avatarId.value = result.avatarId
    playerId.value = result.playerId
    if (import.meta.client) localStorage.setItem('kk:nickname', result.nickname)
  }

  /** Gives a shared-link visitor a valid identity; the server assigns its avatar. */
  async function createGuest(): Promise<void> {
    const suffix = Math.floor(1000 + Math.random() * 9000)
    await setNickname(`Guest-${suffix}`)
  }

  /** Sets both nickname and avatar together — the profile dialog's save. */
  async function setProfile(nicknameValue: string, avatarIdValue: string): Promise<void> {
    const result = await $fetch<{ playerId: string; nickname: string; avatarId: string }>('/api/session', {
      method: 'POST',
      body: { nickname: nicknameValue, avatarId: avatarIdValue },
    })
    nickname.value = result.nickname
    avatarId.value = result.avatarId
    playerId.value = result.playerId
    if (import.meta.client) localStorage.setItem('kk:nickname', result.nickname)
  }

  /** Best guess for prefilling the input on a fresh browser session. */
  function remembered(): string {
    return import.meta.client ? (localStorage.getItem('kk:nickname') ?? '') : ''
  }

  return { nickname, avatarId, playerId, ready, load, setNickname, createGuest, setProfile, remembered }
}
