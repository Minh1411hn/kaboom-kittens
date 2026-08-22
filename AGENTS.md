# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Online Exploding Kittens for 2–10 players. Nuxt 4 + Nitro WebSockets + Redis in one container.
`README.md` is the product-level doc (rules, deck scaling, artwork pipeline, env vars) — read it for
those. This file covers what you need to change code safely.

## Commands

Always run scripts and commands through docker-compose, not directly on the host (no bare
`npm`/`npx`/`nuxi`). `docker compose up -d` starts `redis` and `web`; the dev override builds the
`web` service's `development` stage and runs `npm run gen:art && npm run dev -- --host 0.0.0.0`
against a bind-mounted source tree with HMR. `node_modules` lives in a named volume
(`node_modules:/app/node_modules`) that masks the host copy — after changing `package.json` you must
drop it (`docker compose down -v`) or the container keeps the stale snapshot and modules resolve as
"not found". Run everything else with `docker compose exec web <cmd>` against
that running container.

```bash
docker compose up -d                              # start redis + web (dev server, HMR, needs Redis reachable at NUXT_REDIS_URL)

docker compose exec web npm run test:unit         # engine + catalog tests (node project) — fast, no Redis
docker compose exec web npm run test:integration  # WebSocket tests; needs the web service already running
docker compose exec web npm test                  # both projects
docker compose exec web npm run typecheck         # vue-tsc; nuxt.config has typeCheck:false so builds skip it

docker compose exec web npx vitest run server/game/engine.test.ts   # one file
docker compose exec web npx vitest run server -t 'nope'             # one test by name
docker compose exec web npx vitest run --project nuxt               # component tests only

docker compose exec web npm run gen:manifest      # regenerate shared/generated/card-art.json
docker compose down                               # stop the stack
```

There is no linter configured.

**Every project command runs through docker-compose — no bare `npm`/`npx`/`nuxi` on the host.** When
a task needs a new library, do not hand-edit `package.json` with a guessed version range: write out
the `docker compose exec web npm install …` line and **ask the user before running it**. The install
happens inside the running container, which writes the resolved latest versions back into the
bind-mounted `package.json`/`package-lock.json` and into the `node_modules` volume, so no
`down -v` rebuild is needed afterwards.

```bash
docker compose exec web npm install <pkg>        # runtime dependency
docker compose exec web npm install -D <pkg>     # dev dependency
```

`docker compose exec web npm run typecheck` prints a `vue-router/volar/sfc-route-blocks` resolve
error from Volar on every run. It is noise — check the exit code, not the output.

`npm test` reports green even when the integration suite never ran: `tests/integration.test.ts`
probes `${KK_BASE_URL:-http://localhost:3000}/api/health` at collection time and `describe.skipIf`s
itself when nothing answers. Bring up `docker compose up -d` first if you actually need it.

`npm run build` runs `gen:art` first. `shared/generated/card-art.json` is generated but committed —
regenerate with `docker compose exec web npm run gen:manifest` after adding files under
`public/cards/<id>/artworks/`. Artwork is the whole card face at 140x195 — `CardImage.vue` draws
no frame of its own.

This checkout's `.env` uses Redis port **6380** (6379 is taken by another project on this machine).

## The command path

Every state change in a room takes exactly one route. Nothing should bypass it.

```
ws message ──▶ _ws.ts ──▶ applyCommand(roomId, command)      [server/services/roomService.ts]
                              └─ withRoomLock(roomId)         [lock.ts — Redis SET NX + token]
                                   ├─ loadState               [roomRepo.ts]
                                   ├─ reduce(state, command)  [game/engine.ts — pure]
                                   ├─ saveState
                                   └─ armRoomTimer            [timers.ts]
                              └─ publishRoomChanged / publishLobbyChanged   [bus.ts → Redis pub/sub]

every process ──▶ broadcastRoom ──▶ projectStateFor(state, viewerId) ──▶ one send per peer
```

Three invariants (also stated in the README, repeated here because breaking one is silent):

1. **`server/game/` is pure.** No Redis, no sockets, no `Date.now()`, no `Math.random()`. Time
   arrives as `command.now`; randomness comes from `rngState` inside `GameState` via `game/rng.ts`;
   interaction ids come from `env.nextId()`, derived from `eventSeq`. `engine.test.ts` asserts a game
   replays byte-identically from `(seed, command log)` — introducing ambient time or randomness
   breaks that test rather than producing a subtle bug.
2. **`projectStateFor` (`game/projection.ts`) is the only way state reaches a client.** It reduces
   other hands and the draw pile to counts, sends peeks only to the player who looked, sends
   interaction `cards` only to the players who must answer, and drops interaction `context` entirely
   (it carries the uid of a kitten mid-reinsertion and where it was hidden). Pub/sub publishes only a
   room id, never a payload, so each process re-reads and re-projects per viewer.
3. **One command at a time per room.** `withRoomLock` serialises mutations. Two simultaneous plays
   cannot interleave.

`reduce` clones the input and returns the **original** state plus an `error` string on rejection, so
a rejected command cannot half-apply. `applyCommand` returns that string and `_ws.ts` reports it to
the one player who tried it — never to the table.

Non-engine mutations (joining, connection flags, host migration) go through `mutateRoom`, which is
the same lock/save/publish wrapper with a callback instead of `reduce`.

## Engine structure

- `engine.ts` — `reduce` dispatches on command type, then `settle()` does the post-command
  housekeeping (game-over check, skip eliminated current player, re-arm the turn deadline).
- `effects.ts` — the `Effect` union is the complete vocabulary of state mutation. Card definitions
  return `Effect[]` and never touch state. A genuinely new mechanic is one new variant plus its case.
- `registry.ts` — `CardDefinition`: `playWindow`, `nopeable`, `requiresTarget`, `canPlay`, `resolve`,
  `onInteractionComplete`. `resolve` runs only *after* the Nope window closes in the card's favour.
- `nope.ts` — the action stack. Entry 0 is the action, everything above is a Nope negating the entry
  below; odd count cancels, even lets it through. A window never opens if `eligibleNopers` is empty
  and closes early once every eligible player has passed.
- `turn.ts` — seat arithmetic. Turn order is `seat` + `direction` + `turnsRemaining`; attacks work by
  setting `turnsRemaining`, not by queueing turns.
- `deck.ts` — counts come from `catalog.json` and scale with player count.

Two behaviours sit off the obvious path:

- **Cat combos bypass the registry.** `nope.ts` routes `action.combo` to `resolveCombo` in
  `cards/cats.ts`, and `engine.ts` routes combo interactions to `resolveComboInteraction`. Individual
  cat `CardDefinition`s only refuse solo plays.
- **Defuse is consumed inside the `DRAW` effect**, not played as a card, because it is mandatory. The
  drawn kitten sits in `state.limbo` until the `choose-deck-position` prompt resolves.

## Timers

Deadlines live in `GameState` (`turnDeadline`, `nopeWindow.deadline`, `interaction.deadline`) so
clients can render a countdown and a restarted process can recover them. `timers.ts` holds only the
in-memory `setTimeout`, re-armed on every save from `nextDeadline(state)`. When it fires it calls
`applyCommand` with `timeout-turn` / `timeout-interaction` / `close-nope-window` — timeouts re-enter
the same path as a real player action, lock and all.

## Voice chat

Group audio over the **Cloudflare Realtime SFU**: one `RTCPeerConnection` per
tab, pushing one mic track and pulling everyone else's over that same
connection. It is deliberately bolted *beside* the command path, not into it.

```
browser ──▶ /api/voice/{session,tracks,renegotiate,close}   [server/api/voice/]
                └─ sessionFromEvent + ownsVoiceSession       [services/voice.ts]
                └─ services/sfu.ts ──▶ rtc.live.cloudflare.com

browser ──▶ ws `voice-join` / `voice-mic` / `voice-leave`    [_ws.ts]
                └─ setVoiceMember / patchVoiceMic            [roomRepo.ts, room:${id}:voice]
                └─ publishRoomChanged ──▶ snapshot.voice     [roomService.snapshotFor]
```

Three things to keep straight:

- **The App Secret never leaves the server.** `NUXT_REALTIME_APP_ID` /
  `NUXT_REALTIME_APP_SECRET`; unset means voice is off and `/api/voice/*`
  answers `503`, which the client reads as "hide the voice UI".
- **Session ids are capabilities.** Anyone holding one can renegotiate it or cut
  its tracks, so every session we mint is stamped with its owner
  (`voice:owner:${sessionId}`) and the proxy routes refuse to act on someone
  else's. Only the *path* session is checked — the `sessionId` inside a remote
  track object is meant to be another player's.
- **Voice never enters `GameState`.** The roster lives in its own Redis hash
  alongside chat, so `server/game/` stays pure and **`STATE_VERSION` does not
  move** when the voice shape changes. It reaches clients as the `voice` field
  on the `snapshot` message, which means a mic toggle reuses the whole existing
  `publishRoomChanged` → `broadcastRoom` fanout and needs no new channel.

Client side, `app/composables/useVoiceChat/index.ts` owns the WebRTC lifecycle. Its
watchers are bound **once** at module scope, not per call site — the composable
is used from three components and a per-instance watcher would fire three
simultaneous pulls per roster change. Negotiation is serialised through one
promise chain for the same reason: two offers in flight is glare. Speaking
detection is a local `AnalyserNode` per stream, which is why
`VoiceAudioSinks.vue` must keep a real `<audio>` element per member — Chrome
only feeds WebAudio from a PeerConnection stream that is also attached to one.

## Adding a card

Five steps, listed in `README.md` and in the doc comment on `registry.ts`. `catalog.test.ts` fails
the build if `catalog.json` and the registry ever disagree about targets, out-of-turn play, or which
cards can be played solo — the client greys out cards from the catalog hints while the server
enforces the registry, and a mismatch means offering a play that then gets rejected.

## Styling

`app/assets/css/main.css` is still the source of truth: the token block under `:root` plus the base
rules for `button`, `input`, `.panel` and friends. Tailwind v4 and Sass sit on top of it.

- **Tailwind** is wired through `@tailwindcss/vite` (`vite.plugins` in `nuxt.config.ts`), not the
  Nuxt module. `app/assets/css/tailwind.css` is the entry and is loaded **after** `main.css`.
  It imports utilities **unlayered and without preflight** on purpose — main.css is unlayered, and
  unlayered rules beat any `@layer`, so layered utilities would lose to bare `button { … }`. Both
  reasons are written out at the top of that file; read it before changing the imports.
- The tokens are re-exported as theme keys in `@theme`, so `bg-parchment`, `text-ink`,
  `font-display`, `rounded-card` resolve to the same custom properties. They are aliases —
  add new colours to `main.css` first, then alias them.
- **Sass** is available in any `<style lang="scss">`. `app/assets/scss/_index.scss` is auto-injected
  via `vite.css.preprocessorOptions.scss.additionalData`, so `$parchment`, `$shadow` and
  `@include respond-to('md')` work with no import. Nothing in those partials may emit CSS — the
  file is prepended to every style block and would duplicate the output once per component.

### `.vue` file conventions

Every SFC keeps its three blocks in this order, each with the same attributes every time:

```vue
<template lang="pug">
  ...
</template>

<script setup lang="ts">
  ...
</script>

<style scoped lang="scss">
  ...
</style>
```

- `<template lang="pug">` — Pug, not HTML. `pug` is a devDependency for this.
- `<script setup lang="ts">` — always Composition API with `setup`, never Options API and never a
  bare `<script>` for component logic.
- `<style scoped lang="scss">` — always `scoped`, always SCSS, never a global `<style>` in a
  component.
- Inside `<style>`, name classes with **BEM** (`block__element--modifier`) and nest with SCSS's
  **parent selector (`&`)** instead of repeating the block name:

  ```scss
  .card {
    &__title { ... }
    &__title--active { ... }
    &--disabled { ... }
  }
  ```
- Reach for `app/components/common/Modal.vue` before hand-rolling a new dialog/overlay — pass a
  `title` (prop or slot) and body content via its default slot; it owns the backdrop, focus trap
  (Headless UI's `Dialog`), and card chrome.
- Reach for `app/components/common/Button.vue` before writing new button markup — see its doc
  comment for the available `variant`/`size`/`loading` props.

## Things that bite

- **Changing the `GameState` shape requires bumping `STATE_VERSION`** (`shared/types/game.ts`).
  `loadState` deletes any room whose stored version differs rather than half-migrating a live game.
  Forgetting the bump means old JSON is parsed as the new type.
- **Identity comes from the session cookie on the WebSocket upgrade**, resolved in `_ws.ts` and
  stored in the peer context. No client message carries a `playerId`. Do not add one.
- **`bus.ts` keys peers by `peer.id`, not object identity** — crossws does not guarantee the same
  `Peer` object across `open`/`message`/`close`, and a missed lookup silently drops commands.
- **`open` is async** (session lookup hits Redis), so a message can beat it. `markOpening`/`awaitOpen`
  park the handshake promise; `message` and `close` both await it.
- **Host lives in `RoomMeta` (Redis hash), not in `GameState`.** `projectStateFor` sets
  `you.isHost = false` and `snapshotFor` fills it in. Chat is likewise stored outside `GameState` so
  it never touches the engine.
- **Path aliases are declared twice.** `#shared` and `~~` come from Nuxt at runtime but must also be
  spelled out in `vitest.config.ts` for the `node` project; the `nuxt` project gets them from
  `defineVitestProject`.
- **The client never patches state.** Every command produces a full redacted snapshot; the client
  diffs `state.log` by `seq` to find events worth animating. Reconnect recovery is just "take the
  next snapshot".
- Mid-game leavers are **eliminated, not removed**, so seats stay stable. Only lobby leavers free a
  seat.

## Strict Environment Restrictions
- NEVER run `npm run dev`, `npm run build`, `nuxt prepare`, `nuxi`, or any other project build/development scripts.
- DO NOT attempt to compile, bundle, or verify code changes locally using terminal commands.
- You are ONLY permitted to use `cat`, `grep`, or file system tools to read files, standard file editing tools to make changes
- Assume all code changes you write are correct; do not attempt to verify them by running any scripts without asking permissions from user.

## Layout

```
shared/          types, zod protocol schemas, card catalog + combo rules (client + server)
server/game/     the pure engine — engine, effects, registry, nope, turn, deck, rng, projection, cards/
server/services/ redis, roomRepo, lock, bus (pub/sub + peer registry), roomService, sessions, timers
server/api/      REST: session, rooms, health, and the voice/* SFU proxy
server/routes/   _ws.ts — the single socket entrypoint
server/plugins/  realtime.ts — starts the bus and timer dispatcher once per process
app/             pages, components, composables
tests/           WebSocket integration tests (need a running server)
```
