import type { GameEvent, PublicPlayer } from "#shared/types/game"

/**
 * Turns a structured `GameEvent` into localized display text. The server only
 * ever sends codes and structured fields (`server/game/` stays pure) — this is
 * the client-side mirror that resolves them, the same way `usePlayIntent`
 * resolves its own advisory reasons.
 */
export function useEventText() {
  const { t } = useI18n()
  const { cardName } = useCardText()

  function nicknameOf(players: PublicPlayer[], id: string | undefined): string {
    return players.find((p) => p.id === id)?.nickname ?? "?"
  }

  function eventText(event: GameEvent, players: PublicPlayer[]): string {
    const name = nicknameOf(players, event.playerId)
    const target = nicknameOf(players, event.targetId)
    const card = event.cardId ? cardName(event.cardId) : ""
    const count = event.count ?? 0

    switch (event.type) {
      case "game-started":
        return t("events.game-started", { count })
      case "card-played":
        return event.targetId
          ? t("events.card-played_targeted", { name, card, target })
          : t("events.card-played", { name, card })
      case "combo-played":
        return t(`events.combo-played.${event.combo ?? "pair"}`, { name, target, card })
      case "action-noped":
        return t("events.action-noped", { name, card, count }, count)
      case "action-resolved":
        return t("events.action-resolved", { card })
      case "card-drawn":
        return t("events.card-drawn", { name })
      case "card-stolen":
        return t("events.card-stolen", { name, target })
      case "card-given":
        return t("events.card-given", { name, target })
      case "card-demanded":
        return t("events.card-demanded", { name, target, card })
      case "card-demand-failed":
        return t("events.card-demand-failed", { name, card })
      case "card-taken-from-discard":
        return t("events.card-taken-from-discard", { name, card })
      case "deck-shuffled":
        return t("events.deck-shuffled")
      case "future-seen":
        return t("events.future-seen", { name })
      case "future-altered":
        return t("events.future-altered")
      case "garbage-collected":
        return t("events.garbage-collected", { name, count })
      case "kitten-drawn":
        return t("events.kitten-drawn", { name })
      case "kitten-defused":
        return t("events.kitten-defused", { name })
      case "player-exploded":
        return t("events.player-exploded", { name })
      case "player-quit":
        return t("events.player-quit", { name })
      case "turn-changed":
        return t("events.turn-changed", { name })
      case "player-attacked":
        return t("events.player-attacked", { target, count })
      case "direction-reversed":
        return t("events.direction-reversed")
      case "game-over":
        return event.playerId ? t("events.game-over_winner", { name }) : t("events.game-over")
      case "returned-to-lobby":
        return t("events.returned-to-lobby")
      default:
        return ""
    }
  }

  return { eventText }
}
