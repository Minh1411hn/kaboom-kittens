import { z } from 'zod'

/**
 * Bodies for the `/api/voice/*` proxy routes, shared so the browser and the
 * Nitro handlers cannot drift — the same trick `nicknameSchema` plays for
 * `/api/session`.
 *
 * These describe the *proxy* hop only. The shapes Cloudflare itself expects
 * live in `server/services/realtime.ts`; the proxy forwards a validated subset.
 */

// SDP blobs are large but not unbounded — a 10-way audio session stays well
// under this, and the cap keeps a malicious client from posting megabytes.
const sdpSchema = z.string().max(64_000)

export const sessionDescriptionSchema = z.object({
  type: z.enum(['offer', 'answer']),
  sdp: sdpSchema,
})

/** Cloudflare session ids are 32 hex chars; keep the check loose but bounded. */
export const rtcSessionIdSchema = z.string().min(1).max(128)
export const trackNameSchema = z.string().min(1).max(128)
export const midSchema = z.string().min(1).max(16)

export const voiceTracksBodySchema = z.object({
  sessionId: rtcSessionIdSchema,
  sessionDescription: sessionDescriptionSchema.optional(),
  tracks: z
    .array(
      z.object({
        location: z.enum(['local', 'remote']),
        mid: midSchema.optional(),
        // Present only for `location: 'remote'` — the session we pull from.
        sessionId: rtcSessionIdSchema.optional(),
        trackName: trackNameSchema,
      }),
    )
    .min(1)
    .max(64),
})

export const voiceRenegotiateBodySchema = z.object({
  sessionId: rtcSessionIdSchema,
  sessionDescription: sessionDescriptionSchema,
})

export const voiceCloseBodySchema = z.object({
  sessionId: rtcSessionIdSchema,
  tracks: z.array(z.object({ mid: midSchema })).min(1).max(64),
  // `force` stops the data flow without a renegotiation round trip, which is
  // what we want when someone simply leaves the room.
  force: z.boolean().default(true),
})

export type VoiceTracksBody = z.infer<typeof voiceTracksBodySchema>
export type VoiceRenegotiateBody = z.infer<typeof voiceRenegotiateBodySchema>
export type VoiceCloseBody = z.infer<typeof voiceCloseBodySchema>

/**
 * One player's published mic, as the room advertises it. Lives in Redis
 * (`room:${id}:voice`) rather than in `GameState` — the engine must never see
 * it — and rides along on the `snapshot` message.
 */
export interface VoiceMember {
  playerId: string
  sessionId: string
  trackName: string
  micOn: boolean
}
