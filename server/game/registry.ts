import {
  ALL_CARD_IDS,
  CARD_BY_ID,
  type CardId,
  type GameState,
  type PendingAction,
  type PendingInteraction,
  type Player,
} from '#shared/types/game'
import type { Effect } from './effects'

/**
 * The extension point. A card is data (catalog.json) plus a definition here.
 * Nothing in the turn loop, the Nope stack or the UI knows any card by name:
 * behaviour is `resolve()` returning Effects, and prompts are declarative
 * InteractionSpecs the client renders generically.
 *
 * To add a card:
 *   1. add an entry to shared/cards/catalog.json (id, name, counts, art colour)
 *   2. add the id to the CardId union in shared/types/game.ts
 *   3. create server/game/cards/<id>.ts exporting a CardDefinition
 *   4. register it in server/game/cards/index.ts
 *   5. drop artwork into public/cards/<id>/
 * Only a genuinely new mechanic needs more: one new Effect variant + its case.
 */
export interface CardDefinition {
  id: CardId

  /** `anytime` cards (Nope) may be played out of turn, including mid-window. */
  playWindow: 'own-turn' | 'anytime'

  /** Can this be stopped by a Nope? False for Defuse and Exploding Kitten. */
  nopeable: boolean

  /** Player must name a target when playing. Validated in `validatePlay`. */
  requiresTarget?: boolean

  /** Extra, card-specific legality checks. Return a reason string to reject. */
  canPlay?(ctx: PlayContext): true | string

  /** Pure. Runs only after the Nope window closes in the card's favour. */
  resolve(ctx: ResolveContext): Effect[]

  /** Called once every required response to this card's prompt has arrived. */
  onInteractionComplete?(ctx: InteractionContext): Effect[]
}

export interface PlayContext {
  state: GameState
  player: Player
  action: PendingAction
}

export interface ResolveContext {
  state: GameState
  player: Player
  action: PendingAction
  now: number
}

export interface InteractionContext {
  state: GameState
  interaction: PendingInteraction
  now: number
}

const registry = new Map<CardId, CardDefinition>()

export function registerCard(definition: CardDefinition): void {
  if (registry.has(definition.id)) throw new Error(`Card already registered: ${definition.id}`)
  if (!CARD_BY_ID[definition.id]) throw new Error(`Card ${definition.id} is missing from catalog.json`)
  registry.set(definition.id, definition)
}

export function getCardDefinition(id: CardId): CardDefinition {
  const definition = registry.get(id)
  if (!definition) throw new Error(`No card definition registered for: ${id}`)
  return definition
}

export function hasCardDefinition(id: CardId): boolean {
  return registry.has(id)
}

/** Startup invariant: every catalogued card has behaviour and vice versa. */
export function assertRegistryComplete(): void {
  const missing = ALL_CARD_IDS.filter((id) => !registry.has(id))
  if (missing.length) throw new Error(`Cards with no definition: ${missing.join(', ')}`)
}
