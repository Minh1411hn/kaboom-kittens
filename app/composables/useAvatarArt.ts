import manifest from '#shared/generated/avatar-art.json'

const art = manifest as Record<string, string>
const AVATAR_IDS = Object.keys(art)

/** Shown in place of a chosen avatar for an eliminated player — not part of
 *  the pickable manifest, so it is referenced as a fixed constant instead. */
const DEATH_AVATAR_URL = '/avatars/common/death.png'

/** Unrecognised/missing ids fall back to the first avatar in the manifest —
 *  never to the death avatar, which represents a distinct game state rather
 *  than "unknown data". */
const FALLBACK = art[AVATAR_IDS[0]!] ?? DEATH_AVATAR_URL

export function avatarUrl(avatarId: string | undefined | null): string {
  if (!avatarId) return FALLBACK
  return art[avatarId] ?? FALLBACK
}

export function deathAvatarUrl(): string {
  return DEATH_AVATAR_URL
}

export function allAvatarIds(): string[] {
  return AVATAR_IDS
}
