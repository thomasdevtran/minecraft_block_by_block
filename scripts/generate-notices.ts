import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const lock = JSON.parse(readFileSync('package-lock.json', 'utf8')) as {
  packages: Record<string, {
    dependencies?: Record<string, string>
    optionalDependencies?: Record<string, string>
    version?: string
    license?: string
  }>
}
const runtimePackages = new Set<string>()
const pendingPackages: string[] = []
const resolveDependency = (fromPath: string, dependency: string) => {
  let base = fromPath
  for (;;) {
    const candidate = base ? `${base}/node_modules/${dependency}` : `node_modules/${dependency}`
    if (lock.packages[candidate]) return candidate
    const parentIndex = base.lastIndexOf('/node_modules/')
    if (parentIndex >= 0) base = base.slice(0, parentIndex)
    else if (base) base = ''
    else return undefined
  }
}
const queueDependencies = (fromPath: string, dependencies: Record<string, string> = {}) => {
  for (const dependency of Object.keys(dependencies)) {
    const path = resolveDependency(fromPath, dependency)
    if (path && !runtimePackages.has(path)) pendingPackages.push(path)
  }
}
queueDependencies('', lock.packages[''].dependencies)
while (pendingPackages.length) {
  const path = pendingPackages.shift()!
  if (runtimePackages.has(path)) continue
  runtimePackages.add(path)
  const metadata = lock.packages[path]
  queueDependencies(path, metadata.dependencies)
  queueDependencies(path, metadata.optionalDependencies)
}
const notices = [
  'THIRD-PARTY SOFTWARE NOTICES',
  "Generated from the application's installed runtime dependency tree.",
  'These software licenses do not license Minecraft artwork or names.',
]
for (const path of [...runtimePackages].sort()) {
  const metadata = lock.packages[path]
  if (!metadata.license) continue
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
