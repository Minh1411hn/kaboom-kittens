#!/usr/bin/env node
/**
 * Globs public/cards/<slug>/artworks/*.{png,jpg,jpeg,webp,avif} and writes
 * shared/generated/card-art.json — a slug -> [public url] map the client uses to
 * pick an artwork variant. Adding real card scans is therefore a pure content
 * change: drop the files in and rerun `npm run gen:manifest`.
 *
 * A slug is usually a card id, but `catalog.json` may point a card at a shared
 * pool with an `art` field — the five named cat cards all read `normal-cat`.
 *
 * Artwork is the WHOLE card face at 140x195: frame, title and rules text are
 * printed into the image. `app/components/CardImage.vue` draws no chrome of its
 * own, so anything the art omits is simply missing.
 */
import { mkdir, readdir, writeFile, open } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import catalog from '../shared/cards/catalog.json' with { type: 'json' }

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const cardsDir = join(root, 'public', 'cards')
const outFile = join(root, 'shared', 'generated', 'card-art.json')

const IMAGE_RE = /\.(png|jpe?g|webp|avif)$/i

/** Every artwork is authored at the card's own pixel size. */
const ART_W = 140
const ART_H = 195

/** `10.jpg` must sort after `9.jpg`, so compare numeric prefixes when present. */
function naturalSort(a, b) {
  const na = Number.parseInt(a, 10)
  const nb = Number.parseInt(b, 10)
  if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb
  return a.localeCompare(b)
}

/**
 * Width/height straight out of the file header, so the size check costs one
 * short read per artwork and no dependency. PNG keeps them in the IHDR chunk
 * at a fixed offset; JPEG hides them in whichever SOFn marker comes first, so
 * that one walks the marker chain. Anything else returns null and is skipped.
 */
async function imageSize(path) {
  const fh = await open(path, 'r')
  try {
    const head = Buffer.alloc(65536)
    const { bytesRead } = await fh.read(head, 0, head.length, 0)
    const buf = head.subarray(0, bytesRead)

    if (buf.length >= 24 && buf.toString('ascii', 1, 4) === 'PNG') {
      return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) }
    }

    if (buf.length >= 4 && buf.readUInt16BE(0) === 0xffd8) {
      let i = 2
      while (i + 9 < buf.length) {
        if (buf[i] !== 0xff) {
          i += 1
          continue
        }
        const marker = buf[i + 1]
        // SOF0..SOF15, minus the DHT/JPG/DAC markers that share the range.
        if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
          return { width: buf.readUInt16BE(i + 7), height: buf.readUInt16BE(i + 5) }
        }
        i += 2 + buf.readUInt16BE(i + 2)
      }
    }

    return null
  } finally {
    await fh.close()
  }
}

const manifest = {}
const missing = []
const wrongSize = []

let dirs = []
try {
  dirs = (await readdir(cardsDir, { withFileTypes: true }))
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
} catch {
  console.error(`[manifest] ${cardsDir} does not exist.`)
  process.exit(1)
}

for (const slug of dirs.sort()) {
  const artDir = join(cardsDir, slug, 'artworks')
  let files = []
  try {
    files = (await readdir(artDir)).filter((f) => IMAGE_RE.test(f)).sort(naturalSort)
  } catch {
    continue // no artworks/ subfolder yet
  }
  if (!files.length) continue

  manifest[slug] = files.map((f) => `/cards/${slug}/artworks/${f}`)

  for (const f of files) {
    const size = await imageSize(join(artDir, f))
    if (size && (size.width !== ART_W || size.height !== ART_H)) {
      wrongSize.push(`${slug}/artworks/${f} is ${size.width}x${size.height}`)
    }
  }
}

/** Cards sharing a pool (`art`) only need that pool to exist. */
for (const slug of new Set(catalog.cards.map((card) => card.art ?? card.id))) {
  if (!manifest[slug]) missing.push(slug)
}
if (!manifest['card-back']) missing.push('card-back')

await mkdir(dirname(outFile), { recursive: true })
await writeFile(outFile, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')

const variants = Object.values(manifest).reduce((n, list) => n + list.length, 0)
console.log(`[manifest] ${Object.keys(manifest).length} slugs, ${variants} artwork files -> shared/generated/card-art.json`)
if (missing.length) {
  console.warn(`[manifest] WARNING: no artwork for: ${missing.sort().join(', ')}`)
}
if (wrongSize.length) {
  console.warn(`[manifest] WARNING: artwork must be ${ART_W}x${ART_H} —\n  ${wrongSize.join('\n  ')}`)
}
