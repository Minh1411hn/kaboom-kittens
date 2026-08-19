/**
 * Per-seat avatar colours. Keyed on `PublicPlayer.seat`, which the projection
 * ships and the engine never reshuffles mid-game, so a player keeps one colour
 * for the whole game and every client agrees on it without any extra state.
 */
export interface SeatColors {
  base: string
  light: string
  dark: string
}

const SEAT_COLORS: SeatColors[] = [
  { base: '#2f9bdb', light: '#8ad8ff', dark: '#175b85' },
  { base: '#63c132', light: '#b9f272', dark: '#356d19' },
  { base: '#f5931f', light: '#ffd188', dark: '#8f5006' },
  { base: '#e5389c', light: '#ff97d0', dark: '#8a1a5b' },
  { base: '#8e44d0', light: '#cfa0f5', dark: '#51217c' },
  { base: '#12b5a5', light: '#79f0e4', dark: '#0a6a60' },
  { base: '#e8352e', light: '#ff9490', dark: '#8b1a16' },
  { base: '#d3ba14', light: '#f7ec7d', dark: '#7a6a05' },
  { base: '#5b6ee1', light: '#aab6ff', dark: '#2f3d8f' },
  { base: '#7a9b1f', light: '#cbe273', dark: '#455a0d' },
]

/** Eliminated players go to bone-and-ash regardless of their seat. */
const DEAD_COLORS: SeatColors = { base: '#6b5844', light: '#a08c74', dark: '#3d3125' }

export function seatColors(seat: number, alive = true): SeatColors {
  if (!alive) return DEAD_COLORS
  const index = ((seat % SEAT_COLORS.length) + SEAT_COLORS.length) % SEAT_COLORS.length
  return SEAT_COLORS[index]!
}

export const SEAT_COLOR_COUNT = SEAT_COLORS.length
