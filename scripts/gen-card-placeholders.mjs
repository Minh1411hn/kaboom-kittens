#!/usr/bin/env node
/**
 * Writes an SVG placeholder into every `public/cards/<id>/` folder that has no
 * artwork yet, so the game is fully playable before any real card scans exist.
 * Folders that already contain an image are left untouched — drop real scans in
 * as `2.jpg`, `3.png`, ... and rerun; nothing is overwritten. To *replace* the
 * placeholders after editing this file you must delete them first:
 *
 *     rm public/cards/*\/1.svg && npm run gen:art
 *
 * Faces are ILLUSTRATION ONLY — square, no title, no rules text, no border.
 * `app/components/CardImage.vue` draws the frame (coloured border, icon badge,
 * label, title) from the catalog around whatever image lands here, so anything
 * baked into the art would print twice.
 */
import { mkdir, readdir, writeFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import catalog from '../shared/cards/catalog.json' with { type: 'json' }

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const cardsDir = join(root, 'public', 'cards')

const IMAGE_RE = /\.(png|jpe?g|webp|avif|svg)$/i

/** Faces are square: the frame's art window is 1:1 and uses object-fit: contain. */
const FACE = 512

/** The back is a whole card, so it keeps the real 2.5" x 3.5" proportions. */
const W = 500
const H = 700

const escapeXml = (s) =>
  s.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c])

/**
 * A wash of the card's own colour behind its emoji. Light enough that the
 * frame's white paper and black title stay dominant.
 */
function faceSvg({ name, color, emoji }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${FACE} ${FACE}" width="${FACE}" height="${FACE}" role="img" aria-label="${escapeXml(name)}">
  <defs>
    <linearGradient id="wash" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${color}" stop-opacity="0.26"/>
      <stop offset="62%" stop-color="${color}" stop-opacity="0.08"/>
      <stop offset="100%" stop-color="${color}" stop-opacity="0.02"/>
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="44%" r="52%">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.85"/>
      <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${FACE}" height="${FACE}" fill="#ffffff"/>
  <rect width="${FACE}" height="${FACE}" fill="url(#wash)"/>
  <ellipse cx="${FACE / 2}" cy="${FACE * 0.46}" rx="${FACE * 0.36}" ry="${FACE * 0.32}" fill="url(#glow)"/>
  <text x="${FACE / 2}" y="350" font-size="300" text-anchor="middle">${emoji}</text>
</svg>
`
}

/**
 * The draw pile. A mask builds the kitten as one silhouette with the eyes
 * punched out, so the gradient shows through the holes.
 */
function backSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Card back">
  <defs>
    <linearGradient id="heat" x1="0" y1="0" x2="0.35" y2="1">
      <stop offset="0%" stop-color="#f5771c"/>
      <stop offset="55%" stop-color="#e8352e"/>
      <stop offset="100%" stop-color="#c31d1f"/>
    </linearGradient>
    <mask id="kitten" maskUnits="userSpaceOnUse" x="0" y="0" width="${W}" height="${H}">
      <rect width="${W}" height="${H}" fill="#000"/>
      <g fill="#fff" transform="translate(112 210) scale(1.38)">
        <!--
          Ears and tail are drawn first with their roots buried inside the
          head, so the body painted over them hides every seam. The tail is a
          single open arc — curl it back on itself and it reads as a handle.
        -->
        <path d="M52 74 L44 16 L86 52 Z"/>
        <path d="M148 74 L156 16 L114 52 Z"/>
        <path d="M84 156 C44 178 20 186 4 184" fill="none" stroke="#fff" stroke-width="19" stroke-linecap="round"/>
        <path d="M100 52 C146 52 168 92 168 130 C168 154 152 168 128 168 L72 168 C48 168 32 154 32 130 C32 92 54 52 100 52 Z"/>
        <circle cx="78" cy="104" r="12" fill="#000"/>
        <circle cx="122" cy="104" r="12" fill="#000"/>
      </g>
    </mask>
  </defs>
  <rect width="${W}" height="${H}" rx="40" fill="url(#heat)"/>
  <rect width="${W}" height="${H}" rx="40" fill="none" stroke="#ffffff" stroke-opacity="0.28" stroke-width="10"/>
  <rect width="${W}" height="${H}" fill="#7d1210" fill-opacity="0.55" mask="url(#kitten)"/>
</svg>
`
}

async function hasArtwork(dir) {
  try {
    const entries = await readdir(dir)
    return entries.some((f) => IMAGE_RE.test(f))
  } catch {
    return false
  }
}

const targets = [
  ...catalog.cards.map((card) => ({ slug: card.id, svg: () => faceSvg(card) })),
  { slug: 'card-back', svg: backSvg },
]

let written = 0
let skipped = 0

for (const { slug, svg } of targets) {
  const dir = join(cardsDir, slug)
  await mkdir(dir, { recursive: true })
  if (await hasArtwork(dir)) {
    skipped += 1
    continue
  }
  await writeFile(join(dir, '1.svg'), svg(), 'utf8')
  written += 1
}

console.log(
  `[placeholders] ${written} generated, ${skipped} folders already had artwork (${targets.length} total)`,
)
