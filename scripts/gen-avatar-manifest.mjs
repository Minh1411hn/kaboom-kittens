#!/usr/bin/env node
/**
 * Globs public/avatars/artworks/*.{png,jpg,jpeg,webp,avif} and writes
 * shared/generated/avatar-art.json — a flat id -> [public url] map the client
 * uses to render the avatar picker and everywhere a player's avatar is shown.
 *
 * Unlike the card artwork pool, avatars have no per-id subfolder and no
 * catalog to cross-check against: the id is just the filename without its
 * extension (`art_02.png` -> `art_02`). Adding a new avatar is therefore a
 * pure content change: drop the file in and rerun `npm run gen:manifest`.
 *
 * `public/avatars/common/death.png` is deliberately NOT included here — it is
 * a fixed system avatar shown for an eliminated player, not something a
 * player can pick, so `useAvatarArt.ts` references its path as a constant
 * instead of reading it from this manifest.
 */
import { mkdir, readdir, writeFile } from 'node:fs/promises'
import { basename, dirname, extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const artDir = join(root, 'public', 'avatars', 'artworks')
const outFile = join(root, 'shared', 'generated', 'avatar-art.json')

const IMAGE_RE = /\.(png|jpe?g|webp|avif)$/i

let files = []
try {
  files = (await readdir(artDir)).filter((f) => IMAGE_RE.test(f)).sort()
} catch {
  console.error(`[avatar-manifest] ${artDir} does not exist.`)
  process.exit(1)
}

if (!files.length) {
  console.error(`[avatar-manifest] ${artDir} has no avatar images.`)
  process.exit(1)
}

const manifest = {}
for (const file of files) {
  const id = basename(file, extname(file))
  manifest[id] = `/avatars/artworks/${file}`
}

await mkdir(dirname(outFile), { recursive: true })
await writeFile(outFile, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
console.log(`[avatar-manifest] ${Object.keys(manifest).length} avatars -> shared/generated/avatar-art.json`)
