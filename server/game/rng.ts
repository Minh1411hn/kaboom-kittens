/**
 * Deterministic PRNG. The generator's entire state is a single uint32 that
 * lives inside GameState, so a game replays identically from (seed, commands)
 * and every engine test is reproducible.
 */

export interface RngHolder {
  rngState: number
}

/** mulberry32 — small, fast, good enough for shuffling a card deck. */
export function nextFloat(holder: RngHolder): number {
  holder.rngState = (holder.rngState + 0x6d2b79f5) >>> 0
  let t = holder.rngState
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

/** Uniform integer in [0, maxExclusive). */
export function nextInt(holder: RngHolder, maxExclusive: number): number {
  if (maxExclusive <= 0) return 0
  return Math.floor(nextFloat(holder) * maxExclusive)
}

/** In-place Fisher-Yates. */
export function shuffle<T>(holder: RngHolder, items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = nextInt(holder, i + 1)
    const a = items[i]!
    items[i] = items[j]!
    items[j] = a
  }
  return items
}

export function pick<T>(holder: RngHolder, items: T[]): T | undefined {
  if (!items.length) return undefined
  return items[nextInt(holder, items.length)]
}

export function createSeed(): number {
  return (Math.random() * 0xffffffff) >>> 0
}
