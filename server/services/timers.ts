import type { Command, GameState } from '#shared/types/game'
import { nextDeadline } from '../game/engine'

/**
 * Server-authoritative clocks for the Nope window, interaction prompts and the
 * turn timeout. The deadline itself lives in GameState (so clients can render
 * a countdown and a restarted process can recover it); this module only holds
 * the in-memory setTimeout that fires the corresponding command.
 *
 * Re-armed on every state save, so a deadline is never orphaned.
 */

type Fire = (roomId: string, command: Command['type']) => void | Promise<void>

const timers = new Map<string, NodeJS.Timeout>()
let fire: Fire = () => {}

export function setTimerHandler(handler: Fire): void {
  fire = handler
}

export function clearRoomTimer(roomId: string): void {
  const timer = timers.get(roomId)
  if (timer) {
    clearTimeout(timer)
    timers.delete(roomId)
  }
}

export function armRoomTimer(state: GameState): void {
  clearRoomTimer(state.roomId)
  const next = nextDeadline(state)
  if (!next) return

  // A deadline already in the past (process restart, long GC pause) fires on
  // the next tick rather than being lost.
  const delay = Math.max(0, next.at - Date.now())
  const timer = setTimeout(() => {
    timers.delete(state.roomId)
    void fire(state.roomId, next.command)
  }, delay)
  timer.unref?.()
  timers.set(state.roomId, timer)
}

export function activeTimerCount(): number {
  return timers.size
}
