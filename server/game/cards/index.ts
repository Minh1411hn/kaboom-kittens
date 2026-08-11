import { assertCatalogMatchesUnion } from '#shared/types/game'
import { assertRegistryComplete, registerCard } from '../registry'
import { alterTheFuture3x, alterTheFuture5x } from './alter-the-future'
import { attack2x, personalAttack3x, targetedAttack2x } from './attacks'
import { catCards } from './cats'
import { defuse, explodingKitten } from './defuse'
import { favor } from './favor'
import { garbageCollection } from './garbage-collection'
import { nope } from './nope'
import { drawFromTheBottom, reverse, seeTheFuture3x, seeTheFuture5x, shuffleCard, skip } from './simple'

let registered = false

/** Idempotent so tests and hot reloads can call it freely. */
export function registerAllCards(): void {
  if (registered) return
  registered = true

  assertCatalogMatchesUnion()

  for (const definition of [
    explodingKitten,
    defuse,
    nope,
    attack2x,
    targetedAttack2x,
    personalAttack3x,
    skip,
    reverse,
    shuffleCard,
    favor,
    drawFromTheBottom,
    seeTheFuture3x,
    seeTheFuture5x,
    alterTheFuture3x,
    alterTheFuture5x,
    garbageCollection,
    ...catCards,
  ]) {
    registerCard(definition)
  }

  assertRegistryComplete()
}
