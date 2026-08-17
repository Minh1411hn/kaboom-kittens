# 🙀 Kaboom Kitten

Online Exploding Kittens for **2–10 players**. Nuxt 4 + Nitro WebSockets + Redis, in one container.

- Pick a nickname, see the open rooms, create one and share the link.
- The host presses **Play** when the table is full enough.
- Full ruleset: real-time Nope windows with Nope-on-Nope chains, cat combos with
  Feral Cat wildcards, attack stacking, Reverse, Personal/Targeted Attack,
  Alter the Future, Garbage Collection, Defuse reinsertion.

## Run it

```bash
cp .env.example .env
docker compose up            # dev: HMR, bind-mounted source
docker compose -f docker-compose.yml up --build   # production build
```

Open http://localhost:3000. Open a second browser (or a private window) for the
second player — each browser needs its own session cookie.

### Dev server on the host

```bash
npm install
docker compose up -d redis   # published on REDIS_PORT (6379 by default)
npm run dev
```

If port 6379 is already taken on your machine, set `REDIS_PORT` and
`NUXT_REDIS_URL` in `.env` to a free port — the committed `.env.example` shows
both. (This checkout's `.env` already uses 6380 for exactly that reason.)

## Tests

```bash
npm run test:unit          # pure engine — fast, no server or Redis needed
npm run dev &              # integration tests need a running server
npm run test:integration   # drives real WebSocket clients through a full game
npm test                   # everything (integration self-skips if nothing is listening)
```

`KK_BASE_URL` points the integration tests at another server, e.g.
`KK_BASE_URL=http://localhost:3200 npm run test:integration` against a compose stack.

Component tests (`app/**/*.test.ts`) render the table in a DOM via
`@nuxt/test-utils`; engine and integration tests run in plain Node. Both live
under `vitest.config.ts` as separate projects.

## Card artwork

An artwork file is a **whole printed card face at 140x195** — border, title and
rules text are part of the image. `app/components/CardImage.vue` draws no chrome
of its own, so nothing prints twice. Drop files into the card's `artworks/`
folder and regenerate the manifest:

```
public/cards/attack-2x/artworks/anything.png   # png, jpg, jpeg, webp or avif
public/cards/attack-2x/artworks/whatever.jpg   # extra files = extra variants
```

```bash
npm run gen:manifest
```

Filenames are free-form; only the folder name matters. The generator warns about
any file that is not 140x195 and about any card with no artwork at all.

Each card keeps one variant for the whole game (chosen by hashing the card's
uid), and every client shows the same one.

There are 19 folders: 17 card ids, the shared `normal-cat` pool, and
`card-back`. The five named Cat Cards stay distinct types for combo matching but
share one artwork pool via the `art` field in `shared/cards/catalog.json`:

```
normal-cat/    tacocat, cattermelon, hairy-potato-cat, rainbow-ralphing-cat, beard-cat
feral-cat/     its own folder — it is the wildcard, so it should look different
```

Each of the five takes a different picture out of `normal-cat/artworks/` by
catalog order, and keeps it. Two cats of a kind therefore always look alike and
two cats of different kinds never do — which is how a player spots a combo. Put
at least five pictures in the pool or the slots wrap and two cats collide.

## Avatar artwork

Avatars work the same way, minus the per-card folder structure: drop any
number of images into `public/avatars/artworks/` and rerun `npm run
gen:manifest` — it also regenerates `shared/generated/avatar-art.json`, the
id -> url map the profile dialog picks from (id = filename without its
extension). `public/avatars/common/death.png` is a fixed avatar shown for an
eliminated player and is not part of the pickable manifest.

## Adding a new card type

The engine is a registry of card definitions; the turn loop, the Nope stack and
the UI never know any card by name.

1. Add an entry to `shared/cards/catalog.json` (id, name, deck counts, colour,
   and the `play` hints the client uses to grey out illegal cards).
2. Add the id to the `CardId` union in `shared/types/game.ts`.
3. Create `server/game/cards/<id>.ts` exporting a `CardDefinition` — `resolve()`
   returns `Effect[]`, and prompts are declarative `InteractionSpec`s the client
   renders generically.
4. Register it in `server/game/cards/index.ts`.
5. Drop 140x195 artwork in `public/cards/<id>/artworks/` and rerun
   `npm run gen:manifest`.

Only a genuinely new mechanic needs more than that: one new `Effect` variant in
`server/game/effects.ts` plus its case. `server/game/catalog.test.ts` fails the
build if the catalog and the registry ever disagree.

## Deck scaling

Counts come from `catalog.json` and scale with the player count in
`server/game/deck.ts`:

| Card | count |
| --- | --- |
| Exploding Kitten | `players − 1` |
| Defuse | `players + max(1, round(players / 4))` — 1 dealt each, rest in the deck |
| everything else | `round(base × players / 5)`, clamped to its `min` |

Opening hand is 5 cards plus 1 Defuse, so 6 in total (`handSize` in
`catalog.json`).

Every count above is only a **default**. The room host can pin any card to an
absolute number from the waiting room, and that number is used verbatim whatever
the player count — cards left alone keep scaling. The overrides live in
`GameState.deckOverrides`, so they survive `return-to-lobby` and hold for every
game played in that room. The whole composition is public: `projectStateFor`
ships it to every player as `state.deck`, and `DeckSettingsPanel.vue` renders it.

The server only rejects counts that are not integers in `0..DECK_COUNT_MAX`, and
a start whose dealable cards cannot fill everyone's hand. Balance is the host's
call — zero Exploding Kittens is legal.

## Architecture

```
Browser ──HTTP──▶ Nitro (pages, /api/session, /api/rooms)
   │
   └───WS /_ws──▶ crossws handler ──▶ withRoomLock(roomId)
                                        │
                                        ├─▶ reduce(state, command) → pure engine
                                        ├─▶ Redis  room:{id}:state (authoritative)
                                        └─▶ Redis pub/sub ──▶ every process
                                                                │
                                       projectStateFor(viewer) ◀┘
```

Three invariants hold the design together:

1. **The engine is pure.** `server/game/` imports no Redis and no sockets. All
   randomness comes from a seeded PRNG stored inside the state, so a game
   replays byte-identically from `(seed, command log)` — see the determinism
   test in `server/game/engine.test.ts`.
2. **Clients never see hidden state.** Everything outbound goes through
   `projectStateFor`, which turns other hands and the draw pile into counts and
   strips interaction context. There is no code path that broadcasts raw state.
3. **One command at a time per room.** Every mutation takes a Redis lock, so two
   simultaneous plays cannot interleave.

Pub/sub carries only a room id — each process re-reads and re-projects, so one
player's cards can never ride along on a broadcast meant for someone else.

### Layout

```
shared/          types, zod protocol schemas, card catalog + combo rules (client + server)
server/game/     the pure engine — registry, effects, turn loop, projection, cards/
server/services/ redis, room repo, lock, pub/sub bus, sessions, timers
server/routes/   _ws.ts — the single socket entrypoint
app/             pages, components, composables
scripts/         artwork placeholder + manifest generators
tests/           WebSocket integration tests
```

## Configuration

| Env var | Default | Meaning |
| --- | --- | --- |
| `NUXT_REDIS_URL` | `redis://localhost:6379` | Redis connection |
| `NUXT_PUBLIC_BASE_URL` | `http://localhost:3000` | Used for share links |
| `NUXT_NOPE_WINDOW_MS` | `5000` | How long a Nope window stays open |
| `NUXT_TURN_TIMEOUT_MS` | `45000` | Auto-draw for an idle or absent player |
| `NUXT_ROOM_TTL_SECONDS` | `21600` | Idle room expiry (6h) |

A Nope window closes early as soon as every player holding a Nope has passed —
and never opens at all if nobody is holding one.
# kaboom-kittens
