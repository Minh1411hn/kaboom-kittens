// @vitest-environment nuxt
import { describe, expect, it } from 'vitest'
import manifest from '#shared/generated/avatar-art.json'
import { allAvatarIds, avatarUrl, deathAvatarUrl } from './useAvatarArt'

describe('useAvatarArt', () => {
  it('lists every avatar in the generated manifest', () => {
    expect(allAvatarIds()).toEqual(Object.keys(manifest))
    expect(allAvatarIds().length).toBeGreaterThan(0)
  })

  it('resolves a known id to its manifest url', () => {
    const id = allAvatarIds()[0]!
    expect(avatarUrl(id)).toBe((manifest as Record<string, string>)[id])
  })

  it('falls back to the first manifest avatar for an unknown or missing id', () => {
    const fallback = avatarUrl(allAvatarIds()[0])
    expect(avatarUrl('not-a-real-avatar')).toBe(fallback)
    expect(avatarUrl(undefined)).toBe(fallback)
    expect(avatarUrl(null)).toBe(fallback)
  })

  it('never falls back to the death avatar for unknown data', () => {
    expect(avatarUrl('not-a-real-avatar')).not.toBe(deathAvatarUrl())
  })

  it('returns the fixed death avatar path, not part of the pickable manifest', () => {
    expect(deathAvatarUrl()).toBe('/avatars/common/death.png')
    expect(allAvatarIds()).not.toContain('death')
  })
})
