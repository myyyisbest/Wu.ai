// 从 lobehub icons 包的 svg 提取 path，包装成白色圆底图标
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const tmp = process.env.TEMP || '/tmp'
const srcDir = join(tmp, 'package', 'icons')
const outDir = new URL('../src/renderer/src/assets/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')

for (const [src, name, fill] of [
  ['openai.svg', 'chatgpt.svg', '#0d0d0d'],
  ['grok.svg', 'grok.svg', '#0d0d0d']
]) {
  const svg = readFileSync(join(srcDir, src), 'utf-8')
  const paths = [...svg.matchAll(/<path\b[^>]*?\sd="([^"]+)"/g)]
    .map((m) => `<path d="${m[1]}"/>`)
    .join('')
  if (!paths) {
    console.error('NO PATH FOUND in ' + src)
    continue
  }
  const out =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">' +
    `<g transform="translate(1,1) scale(0.917)" fill="${fill}">${paths}</g></svg>`
  writeFileSync(join(outDir, name), out)
  console.log(name, out.length, 'bytes')
}
