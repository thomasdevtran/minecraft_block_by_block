import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const lock = JSON.parse(readFileSync('package-lock.json', 'utf8')) as {
  packages: Record<string, { dev?: boolean; version?: string; license?: string }>
}
const notices = [
  'THIRD-PARTY SOFTWARE NOTICES',
  'Generated from installed production dependencies. Some entries may only be used at build time.',
  'These software licenses do not license Minecraft artwork or names.',
]
for (const [path, metadata] of Object.entries(lock.packages)) {
  if (!path || metadata.dev || !metadata.license) continue
  const directory = resolve(path)
  // Optional platform packages stay in the lockfile even when npm does not
  // install them for the current build machine.
  if (!existsSync(directory)) continue
  const files = readdirSync(directory).filter((file) => /^(licen[sc]e|copying|notice)([.-]|$)/i.test(file) && !/\.(js|cjs|mjs)$/i.test(file))
  if (!files.length) throw new Error(`Missing license file for ${path}; review before distribution.`)
  notices.push(`\n===== ${path.replace(/^node_modules\//, '')} ${metadata.version} (${metadata.license}) =====\n`)
  for (const file of files) notices.push(readFileSync(resolve(directory, file), 'utf8'))
}
notices.push('\n===== Pixelify Sans =====\n', readFileSync('public/fonts/OFL.txt', 'utf8'))
writeFileSync('public/third-party-notices.txt', notices.join('\n'), 'utf8')
console.log('Wrote third-party software and font notices.')
