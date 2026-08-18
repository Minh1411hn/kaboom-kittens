import type { VoiceMember } from '#shared/protocol/voice'

/**
 * Room-wide voice chat over the Cloudflare Realtime SFU.
 *
 * One RTCPeerConnection per tab, not a mesh: we push our mic once and pull
 * every other member's track over that same connection, so a ten-player table
 * still costs one connection per browser.
 *
 * Who is in the call travels on the game socket (the `voice` roster inside each
 * snapshot); the SDP round trips go over `/api/voice/*`, which holds the
 * Cloudflare App Secret. Nothing here touches game state.
 *
 * Everything is a singleton — `useState` for the reactive surface, module
 * scope for the WebRTC objects, which must not be wrapped in a Vue proxy.
 */

const PREFS_KEY = 'kk:voice'

/** Above this RMS we call it speech; below, silence. */
const SPEAKING_THRESHOLD = 0.045
/** How long the speaking ring stays lit after the last loud sample. */
const SPEAKING_DECAY_MS = 350
const LEVEL_INTERVAL_MS = 120
/** The SFU refuses work until the peer connection is up. */
const CONNECT_TIMEOUT_MS = 10_000

export interface VoicePrefs {
  micOn: boolean
  speakerOn: boolean
  volume: number
  micDeviceId: string | null
  /** playerId -> muted for me only. Never leaves this browser. */
  muted: Record<string, boolean>
}

const DEFAULT_PREFS: VoicePrefs = {
  micOn: true,
  speakerOn: true,
  volume: 1,
  micDeviceId: null,
  muted: {},
}

export interface VoiceChatDeps {
  getMedia?: (constraints: MediaStreamConstraints) => Promise<MediaStream>
  createPeer?: () => RTCPeerConnection
}

// ---------------------------------------------------------------------------
// Pure helpers — exported so they can be tested without any media plumbing
// ---------------------------------------------------------------------------

export interface RosterDiff {
  /** Members whose track we do not have yet. */
  added: VoiceMember[]
  /** Player ids we are still pulling but who have left the call. */
  removed: string[]
}

/**
 * What changed between the tracks we are pulling and the roster the server
 * just sent. `selfId` is skipped in both directions — pulling your own mic
 * back would just be an echo.
 */
export function diffRoster(
  pulled: Iterable<string>,
  roster: VoiceMember[],
  selfId: string,
): RosterDiff {
  const have = new Set(pulled)
  const wanted = roster.filter((member) => member.playerId !== selfId)
  const wantedIds = new Set(wanted.map((member) => member.playerId))

  return {
    added: wanted.filter((member) => !have.has(member.playerId)),
    removed: [...have].filter((id) => !wantedIds.has(id)),
  }
}

export function loadVoicePrefs(): VoicePrefs {
  if (!import.meta.client) return { ...DEFAULT_PREFS }
  try {
    const raw = localStorage.getItem(PREFS_KEY)
    if (!raw) return { ...DEFAULT_PREFS }
    const parsed = JSON.parse(raw) as Partial<VoicePrefs>
    return {
      ...DEFAULT_PREFS,
      ...parsed,
      // A hand-edited or half-written blob must not break the room.
      muted: typeof parsed.muted === 'object' && parsed.muted ? parsed.muted : {},
    }
  } catch {
    return { ...DEFAULT_PREFS }
  }
}

export function saveVoicePrefs(prefs: VoicePrefs): void {
  if (!import.meta.client) return
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs))
  } catch {
    // Private mode / quota — the call still works, the preference just
    // will not survive a refresh.
  }
}

// ---------------------------------------------------------------------------
// Module-scope WebRTC state (client only; never reactive)
// ---------------------------------------------------------------------------

interface Live {
  sessionId: string
  pc: RTCPeerConnection
  micTrack: MediaStreamTrack | null
  /** The silent track we publish when the mic is unavailable. */
  silentTrack: MediaStreamTrack | null
  trackName: string
}

let live: Live | null = null
let starting: Promise<void> | null = null

/** playerId -> the audio we pull for them. */
const streams = new Map<string, MediaStream>()
/** transceiver mid -> playerId, filled before the SDP that creates the track. */
const midToPlayer = new Map<string, string>()
/** Tracks that arrived before we knew whose mid they were. */
const orphanTracks: { mid: string | null; track: MediaStreamTrack }[] = []

let audioContext: AudioContext | null = null
const analysers = new Map<string, AnalyserNode>()
let localAnalyser: AnalyserNode | null = null
let levelTimer: ReturnType<typeof setInterval> | undefined
const lastLoudAt = new Map<string, number>()

/**
 * `useVoiceChat()` is called from several components, but the roster watchers
 * must be registered exactly once — otherwise every snapshot triggers as many
 * simultaneous pulls as there are call sites.
 */
let unwatch: (() => void)[] = []

/** Negotiation is single-file: two offers in flight at once is glare. */
let chain: Promise<unknown> = Promise.resolve()
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const next = chain.then(fn, fn)
  chain = next.catch(() => undefined)
  return next
}

function resetModuleState(): void {
  for (const stop of unwatch.splice(0)) stop()
  live = null
  starting = null
  streams.clear()
  midToPlayer.clear()
  orphanTracks.length = 0
  analysers.clear()
  localAnalyser = null
  lastLoudAt.clear()
  clearInterval(levelTimer)
  levelTimer = undefined
  audioContext?.close().catch(() => undefined)
  audioContext = null
  chain = Promise.resolve()
}

// ---------------------------------------------------------------------------

export function useVoiceChat(deps: VoiceChatDeps = {}) {
  const { voice, playerId, status: socketStatus, send } = useGameSocket()

  /** `false` once the server tells us voice is not configured at all. */
  const available = useState<boolean>('kk:voice:available', () => true)
  const status = useState<'idle' | 'starting' | 'live' | 'error'>(
    'kk:voice:status',
    () => 'idle',
  )
  const micOn = useState<boolean>('kk:voice:micOn', () => true)
  const speakerOn = useState<boolean>('kk:voice:speakerOn', () => true)
  const volume = useState<number>('kk:voice:volume', () => 1)
  const micDeviceId = useState<string | null>('kk:voice:micDevice', () => null)
  const micError = useState<string>('kk:voice:micError', () => '')
  /** The browser blocked autoplay; the UI has to ask for a click. */
  const needsGesture = useState<boolean>('kk:voice:needsGesture', () => false)
  const muted = useState<Record<string, boolean>>('kk:voice:muted', () => ({}))
  const devices = useState<MediaDeviceInfo[]>('kk:voice:devices', () => [])
  /** Players whose audio we currently hold, in roster order. */
  const remoteIds = useState<string[]>('kk:voice:remotes', () => [])
  const speaking = useState<Record<string, boolean>>('kk:voice:speaking', () => ({}))
  const localLevel = useState<number>('kk:voice:level', () => 0)

  const getMedia =
    deps.getMedia ?? ((c: MediaStreamConstraints) => navigator.mediaDevices.getUserMedia(c))
  const createPeer =
    deps.createPeer ??
    (() =>
      new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.cloudflare.com:3478' }],
        bundlePolicy: 'max-bundle',
      }))

  function prefsSnapshot(): VoicePrefs {
    return {
      micOn: micOn.value,
      speakerOn: speakerOn.value,
      volume: volume.value,
      micDeviceId: micDeviceId.value,
      muted: muted.value,
    }
  }

  function hydratePrefs(): void {
    const prefs = loadVoicePrefs()
    micOn.value = prefs.micOn
    speakerOn.value = prefs.speakerOn
    volume.value = prefs.volume
    micDeviceId.value = prefs.micDeviceId
    muted.value = prefs.muted
  }

  // -------------------------------------------------------------------- audio

  function ensureAudioContext(): AudioContext | null {
    if (!import.meta.client) return null
    if (audioContext) return audioContext
    const Ctor = window.AudioContext ?? (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return null
    audioContext = new Ctor()
    return audioContext
  }

  function watchLevels(): void {
    if (levelTimer) return
    const buffer = new Uint8Array(1024)

    const rms = (analyser: AnalyserNode): number => {
      const view = buffer.subarray(0, analyser.fftSize)
      analyser.getByteTimeDomainData(view)
      let sum = 0
      for (const sample of view) {
        const centred = (sample - 128) / 128
        sum += centred * centred
      }
      return Math.sqrt(sum / view.length)
    }

    levelTimer = setInterval(() => {
      const now = Date.now()

      if (localAnalyser) {
        const level = micOn.value ? rms(localAnalyser) : 0
        localLevel.value = level
        if (level > SPEAKING_THRESHOLD) lastLoudAt.set('self', now)
      }
      for (const [id, analyser] of analysers) {
        if (rms(analyser) > SPEAKING_THRESHOLD) lastLoudAt.set(id, now)
      }

      const next: Record<string, boolean> = {}
      for (const [id, at] of lastLoudAt) next[id] = now - at < SPEAKING_DECAY_MS
      speaking.value = next
    }, LEVEL_INTERVAL_MS)
  }

  /**
   * Tap a stream for level metering. Chrome only feeds WebAudio from a
   * PeerConnection stream that is also attached to a media element — the
   * `<audio>` sinks in VoiceAudioSinks.vue are what make this work.
   */
  function tap(id: string, stream: MediaStream): void {
    const ctx = ensureAudioContext()
    if (!ctx) return
    try {
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 1024
      ctx.createMediaStreamSource(stream).connect(analyser)
      analysers.set(id, analyser)
      watchLevels()
    } catch {
      // Metering is cosmetic; a failure here must not break the call.
    }
  }

  function tapLocal(track: MediaStreamTrack): void {
    const ctx = ensureAudioContext()
    if (!ctx) return
    try {
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 1024
      ctx.createMediaStreamSource(new MediaStream([track])).connect(analyser)
      localAnalyser = analyser
      watchLevels()
    } catch {
      // as above
    }
  }

  /** A track we can publish when there is no mic, so listen-only still uses
   *  the one push-then-pull code path instead of a second, rarer one. */
  function silentTrack(): MediaStreamTrack | null {
    const ctx = ensureAudioContext()
    if (!ctx) return null
    const destination = ctx.createMediaStreamDestination()
    const oscillator = ctx.createOscillator()
    const gain = ctx.createGain()
    gain.gain.value = 0
    oscillator.connect(gain).connect(destination)
    oscillator.start()
    return destination.stream.getAudioTracks()[0] ?? null
  }

  // ---------------------------------------------------------------- transport

  async function acquireMic(): Promise<MediaStreamTrack | null> {
    try {
      const stream = await getMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          ...(micDeviceId.value ? { deviceId: { exact: micDeviceId.value } } : {}),
        },
      })
      micError.value = ''
      return stream.getAudioTracks()[0] ?? null
    } catch (error) {
      micError.value =
        (error as DOMException)?.name === 'NotAllowedError'
          ? 'Bạn đã từ chối quyền micro — bạn vẫn nghe được nhưng không nói được.'
          : 'Không mở được micro. Bạn vẫn nghe được người khác.'
      return null
    }
  }

  async function refreshDevices(): Promise<void> {
    if (!import.meta.client || !navigator.mediaDevices?.enumerateDevices) return
    try {
      const all = await navigator.mediaDevices.enumerateDevices()
      devices.value = all.filter((device) => device.kind === 'audioinput')
    } catch {
      devices.value = []
    }
  }

  function waitConnected(pc: RTCPeerConnection): Promise<void> {
    if (pc.connectionState === 'connected') return Promise.resolve()
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pc.removeEventListener('connectionstatechange', onChange)
        reject(new Error('voice-connect-timeout'))
      }, CONNECT_TIMEOUT_MS)

      function onChange() {
        if (pc.connectionState === 'connected') {
          clearTimeout(timer)
          pc.removeEventListener('connectionstatechange', onChange)
          resolve()
        } else if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
          clearTimeout(timer)
          pc.removeEventListener('connectionstatechange', onChange)
          reject(new Error('voice-connect-failed'))
        }
      }
      pc.addEventListener('connectionstatechange', onChange)
    })
  }

  function adoptTrack(mid: string | null, track: MediaStreamTrack): void {
    const owner = mid ? midToPlayer.get(mid) : undefined
    if (!owner) {
      // The SDP beat the tracks response; retried after the next pull settles.
      orphanTracks.push({ mid, track })
      return
    }
    const stream = new MediaStream([track])
    streams.set(owner, stream)
    remoteIds.value = [...streams.keys()]
    tap(owner, stream)
  }

  function flushOrphans(): void {
    for (const orphan of orphanTracks.splice(0)) adoptTrack(orphan.mid, orphan.track)
  }

  async function pull(members: VoiceMember[]): Promise<void> {
    if (!live || !members.length) return
    const { pc, sessionId } = live

    const response = await $fetch<{
      requiresImmediateRenegotiation?: boolean
      sessionDescription?: { type: 'offer' | 'answer'; sdp: string }
      tracks?: { mid?: string; errorCode?: string }[]
    }>('/api/voice/tracks', {
      method: 'POST',
      body: {
        sessionId,
        tracks: members.map((member) => ({
          location: 'remote' as const,
          sessionId: member.sessionId,
          trackName: member.trackName,
        })),
      },
    })

    // Claim the mids *before* applying the SDP: `ontrack` can fire inside
    // setRemoteDescription, and an unclaimed mid becomes an orphan.
    response.tracks?.forEach((track, index) => {
      const member = members[index]
      if (track.mid && !track.errorCode && member) midToPlayer.set(track.mid, member.playerId)
    })

    if (response.requiresImmediateRenegotiation && response.sessionDescription) {
      await pc.setRemoteDescription(response.sessionDescription)
      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)
      await $fetch('/api/voice/renegotiate', {
        method: 'PUT',
        body: {
          sessionId,
          sessionDescription: { type: 'answer', sdp: pc.localDescription?.sdp ?? answer.sdp ?? '' },
        },
      })
    }

    flushOrphans()
  }

  async function drop(playerIds: string[]): Promise<void> {
    if (!live || !playerIds.length) return
    const mids: string[] = []

    for (const id of playerIds) {
      for (const [mid, owner] of midToPlayer) {
        if (owner === id) {
          mids.push(mid)
          midToPlayer.delete(mid)
        }
      }
      streams.get(id)?.getTracks().forEach((track) => track.stop())
      streams.delete(id)
      analysers.delete(id)
      lastLoudAt.delete(id)
    }
    remoteIds.value = [...streams.keys()]

    if (!mids.length) return
    try {
      await $fetch('/api/voice/close', {
        method: 'PUT',
        // `force` skips a renegotiation round trip; we only want the audio to
        // stop, and the transceiver can be reused if they come back.
        body: { sessionId: live.sessionId, tracks: mids.map((mid) => ({ mid })), force: true },
      })
    } catch {
      // The SFU drops the track when the publisher's session dies anyway.
    }
  }

  // -------------------------------------------------------------- lifecycle

  async function start(): Promise<void> {
    if (!import.meta.client || live || starting || !available.value) return

    hydratePrefs()
    status.value = 'starting'
    bindWatchers()

    starting = (async () => {
      let sessionId: string
      try {
        const result = await $fetch<{ sessionId: string }>('/api/voice/session', { method: 'POST' })
        sessionId = result.sessionId
      } catch (error) {
        // 503 means this deployment simply has no Cloudflare credentials.
        if ((error as { statusCode?: number })?.statusCode === 503) available.value = false
        status.value = available.value ? 'error' : 'idle'
        return
      }

      const micTrack = micOn.value ? await acquireMic() : null
      if (micTrack) {
        micTrack.enabled = micOn.value
        tapLocal(micTrack)
      } else if (micOn.value) {
        // acquireMic already set micError.
        micOn.value = false
      }

      const fallback = micTrack ? null : silentTrack()
      const publishing = micTrack ?? fallback
      if (!publishing) {
        status.value = 'error'
        return
      }

      const pc = createPeer()
      pc.addEventListener('track', (event) => adoptTrack(event.transceiver?.mid ?? null, event.track))

      const trackName = crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
      live = { sessionId, pc, micTrack, silentTrack: fallback, trackName }

      try {
        const transceiver = pc.addTransceiver(publishing, { direction: 'sendonly' })
        const offer = await pc.createOffer()
        await pc.setLocalDescription(offer)

        const response = await $fetch<{ sessionDescription?: { type: 'offer' | 'answer'; sdp: string } }>(
          '/api/voice/tracks',
          {
            method: 'POST',
            body: {
              sessionId,
              sessionDescription: { type: 'offer', sdp: pc.localDescription?.sdp ?? offer.sdp ?? '' },
              tracks: [{ location: 'local', mid: transceiver.mid ?? '0', trackName }],
            },
          },
        )
        if (!response.sessionDescription) throw new Error('voice-no-answer')
        await pc.setRemoteDescription(response.sessionDescription)
        await waitConnected(pc)
      } catch {
        status.value = 'error'
        teardown()
        return
      }

      status.value = 'live'
      send({ type: 'voice-join', sessionId, trackName })
      if (!micOn.value) send({ type: 'voice-mic', on: false })
      void refreshDevices()
      void syncRoster()
    })()

    await starting
    starting = null
  }

  function teardown(): void {
    const current = live
    resetModuleState()
    remoteIds.value = []
    speaking.value = {}
    localLevel.value = 0
    if (!current) return
    current.micTrack?.stop()
    current.silentTrack?.stop()
    try {
      current.pc.close()
    } catch {
      // already closed
    }
  }

  function stop(): void {
    if (!import.meta.client) return
    if (live) send({ type: 'voice-leave' })
    teardown()
    status.value = 'idle'
  }

  /** Pull anyone new, drop anyone gone. Serialised: no two negotiations race. */
  function syncRoster(): Promise<void> {
    if (!live) return Promise.resolve()

    // The diff is computed *inside* the queue, not before it. Two roster
    // updates arriving back to back would otherwise both see an empty pull
    // set and each ask the SFU for the same track.
    return serial(async () => {
      if (!live) return
      const { added, removed } = diffRoster(streams.keys(), voice.value, playerId.value)
      // A member whose mid is already claimed is mid-flight, not missing.
      const pending = new Set(midToPlayer.values())
      const fresh = added.filter((member) => !pending.has(member.playerId))

      if (removed.length) await drop(removed)
      if (fresh.length) await pull(fresh)
    }).catch(() => undefined)
  }

  // ------------------------------------------------------------------ actions

  function setMicOn(on: boolean): void {
    micOn.value = on
    saveVoicePrefs(prefsSnapshot())
    // Keep publishing either way: flipping `enabled` avoids renegotiating the
    // whole session every time somebody taps mute.
    if (live?.micTrack) live.micTrack.enabled = on
    if (live) send({ type: 'voice-mic', on })
    if (on && live && !live.micTrack) void restartMic()
  }

  /** Someone turned the mic on after starting without one (or denied, then allowed). */
  async function restartMic(): Promise<void> {
    const current = live
    if (!current) return
    const track = await acquireMic()
    if (!track) {
      micOn.value = false
      return
    }
    // The silent placeholder holds the transceiver we published with; swapping
    // the track keeps the SDP untouched, so nobody has to renegotiate.
    const sender = current.pc
      .getSenders()
      .find((s) => s.track === current.silentTrack || s.track === null)
    if (!sender) {
      micOn.value = false
      return
    }
    await sender.replaceTrack(track)
    current.silentTrack?.stop()
    current.silentTrack = null
    current.micTrack = track
    track.enabled = true
    tapLocal(track)
    send({ type: 'voice-mic', on: true })
  }

  function setSpeakerOn(on: boolean): void {
    speakerOn.value = on
    saveVoicePrefs(prefsSnapshot())
  }

  function setVolume(next: number): void {
    volume.value = Math.min(1, Math.max(0, next))
    saveVoicePrefs(prefsSnapshot())
  }

  async function setMicDevice(deviceId: string | null): Promise<void> {
    micDeviceId.value = deviceId
    saveVoicePrefs(prefsSnapshot())
    const current = live
    if (!current) return
    const previous = current.micTrack
    const track = await acquireMic()
    if (!track) return
    const sender = current.pc.getSenders().find((s) => s.track === previous)
    if (!sender) return
    await sender.replaceTrack(track)
    previous?.stop()
    current.micTrack = track
    track.enabled = micOn.value
    tapLocal(track)
  }

  function isMuted(id: string): boolean {
    return Boolean(muted.value[id])
  }

  function toggleMute(id: string): void {
    const next = { ...muted.value }
    if (next[id]) delete next[id]
    else next[id] = true
    muted.value = next
    saveVoicePrefs(prefsSnapshot())
  }

  function streamFor(id: string): MediaStream | undefined {
    return streams.get(id)
  }

  function isSpeaking(id: string): boolean {
    return Boolean(speaking.value[id])
  }

  /** True while the person is publishing with their mic live. */
  function micOnFor(id: string): boolean | null {
    if (id === playerId.value) return status.value === 'live' ? micOn.value : null
    const member = voice.value.find((entry) => entry.playerId === id)
    return member ? member.micOn : null
  }

  // ------------------------------------------------------------------ watchers

  function bindWatchers(): void {
    if (unwatch.length) return

    unwatch.push(watch(voice, () => void syncRoster(), { deep: true }))

    // A reconnect clears our roster entry on the server (the socket close
    // handler drops it), but the SFU session is still alive — re-announce.
    unwatch.push(
      watch(socketStatus, (next, previous) => {
        if (next !== 'open' || previous === 'open' || !live) return
        send({ type: 'voice-join', sessionId: live.sessionId, trackName: live.trackName })
        if (!micOn.value) send({ type: 'voice-mic', on: false })
      }),
    )
  }

  return {
    // state
    available,
    status,
    micOn,
    speakerOn,
    volume,
    micDeviceId,
    micError,
    needsGesture,
    devices,
    muted,
    remoteIds,
    localLevel,
    // reads
    streamFor,
    isMuted,
    isSpeaking,
    micOnFor,
    // actions
    start,
    stop,
    setMicOn,
    setSpeakerOn,
    setVolume,
    setMicDevice,
    toggleMute,
    refreshDevices,
  }
}
