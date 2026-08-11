#!/usr/bin/env node
/**
 * Globs public/cards/<slug>/*.{png,jpg,jpeg,webp,avif,svg} and writes
 * shared/generated/card-art.json — a slug -> [public url] map the client uses to
 * pick an artwork variant. Adding real card scans is therefore a pure content
 * change: drop the files in and rerun `npm run gen:manifest`.
 */
import { mkdir, readdir, writeFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import catalog from '../shared/cards/catalog.json' with { type: 'json' }

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const cardsDir = join(root, 'public', 'cards')
const outFile = join(root, 'shared', 'generated', 'card-art.json')

const IMAGE_RE = /\.(png|jpe?g|webp|avif|svg)$/i

/** `10.jpg` must sort after `9.jpg`, so compare numeric prefixes when present. */
function naturalSort(a, b) {
  const na = Number.parseInt(a, 10)
  const nb = Number.parseInt(b, 10)
  if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb
  return a.localeCompare(b)
}

const manifest = {}
const missing = []

let dirs = []
try {
  dirs = (await readdir(cardsDir, { withFileTypes: true }))
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
} catch {
  console.error(`[manifest] ${cardsDir} does not exist — run \`npm run gen:placeholders\` first.`)
  process.exit(1)
}

for (const slug of dirs.sort()) {
  const files = (await readdir(join(cardsDir, slug)))
    .filter((f) => IMAGE_RE.test(f))
    .sort(naturalSort)
  if (files.length) manifest[slug] = files.map((f) => `/cards/${slug}/${f}`)
}

for (const card of catalog.cards) {
  if (!manifest[card.id]) missing.push(card.id)
}
if (!manifest['card-back']) missing.push('card-back')

await mkdir(dirname(outFile), { recursive: true })
await writeFile(outFile, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')

const variants = Object.values(manifest).reduce((n, list) => n + list.length, 0)
console.log(`[manifest] ${Object.keys(manifest).length} slugs, ${variants} artwork files -> shared/generated/card-art.json`)
if (missing.length) {
  console.warn(`[manifest] WARNING: no artwork for: ${missing.join(', ')}`)
}
