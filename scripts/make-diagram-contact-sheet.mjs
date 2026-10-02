import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'

const dir = 'docs/ontwerp/diagrams'
const files = fs.readdirSync(dir).filter((file) => file.endsWith('.png')).sort()

function escapeXml(value) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
}

const thumbs = []
for (const file of files) {
  const label = `
    <svg xmlns="http://www.w3.org/2000/svg" width="560" height="50">
      <text x="280" y="32" text-anchor="middle" font-family="Segoe UI, Arial" font-size="24" font-weight="700" fill="#172033">${escapeXml(file)}</text>
    </svg>`
  const image = await sharp(path.join(dir, file))
    .resize({ width: 520, height: 360, fit: 'contain', background: '#ffffff' })
    .extend({ top: 50, bottom: 20, left: 20, right: 20, background: '#ffffff' })
    .composite([{ input: Buffer.from(label), top: 0, left: 0 }])
    .png()
    .toBuffer()
  thumbs.push(image)
}

const cols = 2
const cellWidth = 560
const cellHeight = 430
await sharp({
  create: {
    width: cols * cellWidth,
    height: Math.ceil(files.length / cols) * cellHeight,
    channels: 4,
    background: '#f6f8fb',
  },
})
  .composite(thumbs.map((input, index) => ({
    input,
    left: (index % cols) * cellWidth,
    top: Math.floor(index / cols) * cellHeight,
  })))
  .png()
  .toFile('docs/ontwerp/render-check-diagram-contact-sheet.png')

console.log(`Wrote contact sheet for ${files.length} diagrams.`)
