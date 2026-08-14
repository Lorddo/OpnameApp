/** Rasterize public/favicon.svg into PWA/apple-touch PNG icons. */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Resvg } from '@resvg/resvg-js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const svg = readFileSync(join(root, 'public', 'favicon.svg'))

function render(size, filename) {
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: size },
    background: '#7B1E3C',
  })
  writeFileSync(join(root, 'public', filename), resvg.render().asPng())
}

render(192, 'pwa-192.png')
render(512, 'pwa-512.png')
render(180, 'apple-touch-icon.png')
