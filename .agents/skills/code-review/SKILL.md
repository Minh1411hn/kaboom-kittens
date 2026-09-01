---
name: code-review
description: Performs a comprehensive static review of Kaboom Kitten changes for game-flow regressions, hidden-state leaks, WebSocket and Redis safety, multilingual UI coverage, and project conventions. Use when user says "review my code", "check my code", "prepare for PR", "review this commit", "review commit <hash>", or asks to inspect changes between branches or commits.
---

# Code Review

Perform a deep, static review of proposed Kaboom Kitten changes. Prioritize bugs,
game-flow regressions, hidden-information leaks, protocol incompatibilities, and
violations of the architecture's purity, locking, and projection invariants.

## Strict Environment Restrictions

- Do not run development, build, generation, test, typecheck, package-manager, or database commands.
- Use only read-only git inspection and file reading/search tools to inspect the change and its call sites.
- Do not modify files as part of a review unless the user explicitly asks for fixes.
- Review all supplied commits and their combined diff, not only the latest commit. For working-tree reviews, inspect both staged and unstaged changes.

## Review Workflow

### 1. Identify and Inspect Changes

- Inspect the requested commit, branch range, or working-tree diff. Identify modified, added, renamed, and deleted files.
- Read the affected implementation, its tests, types, protocol definitions, and all meaningful call sites before reporting a finding.
- Compare the change with the current architecture in `README.md` and `AGENTS.md`; do not apply conventions from unrelated repositories.
- State the review scope and any assumptions when the target branch, commit range, or requirements are ambiguous.

### 2. Compatibility and Existing-Flow Analysis

For every changed public type, function, component, composable, route, message, or persisted shape, search the repository for producers and consumers. Verify existing flows remain compatible:

- **HTTP and WebSocket contracts**: Check REST routes, Zod message schemas, client senders, server handlers, and snapshot consumers together. Identity must come from the WebSocket session cookie, never a client-supplied `playerId`.
- **Room mutation path**: Network game commands must enter through `_ws.ts` and call `applyCommand(roomId, command)`; timer commands must re-enter that same service path. Room metadata changes must use `mutateRoom`. Both paths must retain the room lock, persistence, timer re-arming, and room/lobby publication. Do not permit a direct state write or a mutation that bypasses the lock.
- **Reconnect and cross-process delivery**: A snapshot is authoritative; clients must not patch game state locally. Pub/sub may carry a room id only, so each process reloads and projects state per viewer. Peer lookups must continue to use `peer.id`, and `open`, `message`, and `close` must preserve the asynchronous-open handshake.
- **Persisted state**: When `GameState` changes, require a `STATE_VERSION` bump and verify load behavior. Changes to room metadata, chat, or voice roster must not incorrectly move into `GameState`.
- **Timers and deadlines**: Deadlines belong in `GameState`; timer callbacks must re-enter `applyCommand` rather than mutate state independently. Verify stale timers are replaced when the next deadline changes.
- **Shared artifacts and cards**: For a card or catalog change, inspect `shared/cards/catalog.json`, `CardId`, registry/card modules, effects, protocol/UI consumers, artwork folders, and committed generated manifests as applicable. Catalog play hints and registry enforcement must agree.
- **Voice flow**: For voice changes, verify SFU credentials stay server-side; session capabilities remain owner-checked; voice remains outside `GameState`; and WebRTC negotiation/roster updates do not introduce duplicate watchers, glare, or missing audio sinks.
- **Stale shared implementations**: If a shared helper, composable, service, protocol schema, or engine mechanism is rewritten, compare the replacement with the old behavior to ensure prior edge-case handling was not silently removed.

### 3. Engine, Information-Safety, and Concurrency Invariants

Apply these checks whenever the change touches `server/game/`, `shared/types/game.ts`, the command path, or client-visible game state:

- **Pure engine**: `server/game/` must not use Redis, sockets, filesystem/network I/O, `Date.now()`, `new Date()`, `Math.random()`, or other ambient nondeterminism. Time arrives in `command.now`; randomness uses `rngState`; interaction ids derive from `eventSeq` through the supplied environment.
- **Atomic rejection and deterministic replay**: `reduce` must leave the original state unchanged on rejection. Check that effect ordering, event sequencing, seeded randomness, and command handling remain replayable from the same seed and command log.
- **Hidden information**: `projectStateFor` is the only game-state path to a client. Other players' hands and the draw pile must remain counts; peeks and interaction cards must reach only entitled players; interaction context must never be exposed; and raw `GameState` must never be broadcast.
- **Turn and action semantics**: Check turn seat arithmetic, direction, `turnsRemaining`, attack stacking, eliminations, Nope stack parity, eligible-player passes, timeouts, and interaction resolution. Verify a new or changed effect cannot leave `limbo`, an action stack, interaction, or deadline in an invalid state.
- **Card mechanics**: Preserve the separate cat-combo path, declarative registry effects, mandatory Defuse handling inside `DRAW`, and the no-Nopers fast path. A new mechanic belongs in the `Effect` union and its reducer case, not in an unrelated card or UI special case.
- **Locking**: Concurrent commands for the same room must serialize through `withRoomLock`; check every branch, including errors, disconnects, timeouts, and host migration.

### 4. Project Conventions

#### Shared and Server (Nuxt 4, Nitro, Redis, Zod, TypeScript)

- Keep shared protocol schemas and TypeScript types aligned with all server and client uses. Validate untrusted HTTP/WebSocket input before use.
- Keep business rules in the pure engine and services; route handlers should coordinate authentication, validation, and the prescribed command/mutation path.
- Preserve Redis key ownership, TTL behavior, lock-token release safety, and failure handling. Do not apply persistence conventions from unrelated repositories.
- Keep server-only secrets, especially `NUXT_REALTIME_APP_SECRET`, out of client code, public runtime config, snapshots, logs, and errors.
- Preserve existing import aliases and module boundaries. Do not introduce direct client imports of server code or server imports of browser-only APIs.

#### Client (Nuxt 4, Vue 3, Pug, Pinia, Tailwind v4, Sass)

- Vue SFCs use `<template lang="pug">`, then `<script setup lang="ts">`, then `<style scoped lang="scss">`.
- Prefer the existing common `Button` and `Dialog` components rather than duplicating their behavior. Keep component styles scoped and use BEM names with SCSS parent-selector nesting.
- Preserve `main.css` as the token/base-rule source of truth. New visual tokens belong there before their Tailwind theme aliases; do not reintroduce Tailwind preflight or layered utilities that lose to the established base rules.
- Follow existing reactive patterns. Inspect watchers, lifecycle cleanup, DOM/event listeners, timers, audio contexts, and WebRTC peer connections for leaks, duplicate registration, stale closures, and race conditions.
- Treat server snapshots as immutable input. UI affordances may predict intent locally, but must not apply game-state mutations without a returned snapshot.
- For card artwork changes, verify whole-card 140x195 assets, catalog art mapping, and generated art manifests remain consistent. `CardImage.vue` must not add duplicate card chrome.

#### Internationalization and User-Facing Language

- Always inspect both `i18n/locales/en.json` and `i18n/locales/vi.json` for any changed user-facing text, including button labels, errors, toasts, aria labels, interaction prompts, event-log text, and card text.
- New or renamed i18n keys must exist in both locale files with the same object structure. Verify interpolation placeholders and plural/count parameters match exactly between English and Vietnamese.
- Flag hard-coded user-facing strings in templates, composables, and components when an i18n key is appropriate. Use `$t(...)` in templates and `useI18n().t(...)` in script code.
- Check that locale changes do not alter internal card ids, protocol values, error codes, routes, or persisted state. Those remain stable machine-readable identifiers.
- Review accessibility text in both languages: translated `aria-label`, `title`, `alt`, and other non-visible strings require the same locale coverage as visible UI text.

### 5. Bugs, Edge Cases, Security, and Tests

- Look for null/undefined handling, empty hands/decks, invalid targets, eliminated or disconnected players, spectators, host migration, duplicate or late WebSocket messages, expired sessions, no eligible Nope players, and timeout races.
- Check external calls and async boundaries for errors, cancellation, cleanup, ownership validation, and a safe failure mode. Pay particular attention to Redis locks, session capabilities, WebRTC negotiation, and timer callbacks.
- Flag regressions in responsiveness or resource use: excessive snapshot work, unnecessary rerenders, unbounded Redis data, leaked listeners/timers/media tracks, or repeated network/SFU calls.
- Verify tests cover changed behavior at the appropriate boundary: pure engine/unit tests for rules and projection, protocol tests for schemas, component/composable tests for UI state, and integration tests for WebSocket flows. Do not execute tests; report missing or mismatched coverage.

### 6. Review Report

Produce the review using [Report Format](./references/report_format.md) without changing its headings, ordering, status labels, or severity sections.

- Populate every required report section. Order findings within `Issues by Severity` from Critical to Warning to Suggestion, with precise `path:line` references and concrete fixes.
- Do not manufacture findings. If none are found, explicitly say so in the relevant severity section and describe residual test or runtime-validation gaps in `Impact Analysis (Old Flows)`.
- Keep the report in the user's requested language. Preserve technical identifiers, source paths, and code snippets exactly.

Base directory for this skill: /Users/ducminh/code/kaboom-kittens/.agents/skills/code-review
Relative paths in this skill (for example, `references/`) are relative to this base directory.
