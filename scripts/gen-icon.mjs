// 生成应用图标：build/icon.png（512，安装包/任务栏用）和 resources/tray.png（32，托盘用）
// 设计：靛蓝→紫对角渐变圆角方块 + 白色聊天气泡（左下尾巴）+ 三个渐变色圆点
// 不引入依赖：手写 PNG 编码（RGBA + zlib deflate + CRC32）
import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const C1 = [99, 102, 241] // #6366f1 左上
const C2 = [168, 85, 247] // #a855f7 右下
const WHITE = [255, 255, 255, 255]
const DOT = [79, 70, 229, 255] // 圆点 #4F46E5

function inRoundRect(x, y, x0, y0, w, h, r) {
  const x1 = x0 + w
  const y1 = y0 + h
  if (x < x0 || x > x1 || y < y0 || y > y1) return false
  const cx = Math.max(x0 + r, Math.min(x, x1 - r))
  const cy = Math.max(y0 + r, Math.min(y, y1 - r))
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r
}

function inTri(x, y, ax, ay, bx, by, cx, cy) {
  const s1 = (bx - ax) * (y - ay) - (by - ay) * (x - ax)
  const s2 = (cx - bx) * (y - by) - (cy - by) * (x - bx)
  const s3 = (ax - cx) * (y - cy) - (ay - cy) * (x - cx)
  return (s1 >= 0 && s2 >= 0 && s3 >= 0) || (s1 <= 0 && s2 <= 0 && s3 <= 0)
}

function crc32(buf) {
  let table = crc32.table
  if (!table) {
    table = crc32.table = new Int32Array(256)
    for (let n = 0; n < 256; n++) {
      let c = n
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      table[n] = c
    }
  }
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

function png(size) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  const raw = Buffer.alloc(size * (1 + size * 4))
  const s = size / 512 // 设计稿 512 等比缩放
  for (let y = 0; y < size; y++) {
    raw[y * (1 + size * 4)] = 0
    for (let x = 0; x < size; x++) {
      let color = null
      // 圆角背景（22% 半径）
      const rx = Math.min(x, size - 1 - x)
      const ry = Math.min(y, size - 1 - y)
      const corner = size * 0.22
      if (rx < corner && ry < corner) {
        const dx = corner - rx
        const dy = corner - ry
        if (dx * dx + dy * dy > corner * corner) color = [0, 0, 0, 0]
      }
      if (!color) {
        const t = (x + y) / (2 * size)
        color = [
          Math.round(C1[0] + (C2[0] - C1[0]) * t),
          Math.round(C1[1] + (C2[1] - C1[1]) * t),
          Math.round(C1[2] + (C2[2] - C1[2]) * t),
          255
        ]
      }
      // 白色气泡 + 尾巴
      const hit =
        inRoundRect(x, y, 106 * s, 120 * s, 300 * s, 210 * s, 52 * s) ||
        inTri(x, y, 150 * s, 318 * s, 150 * s, 416 * s, 240 * s, 318 * s)
      if (hit) color = WHITE
      // 三个圆点
      for (const cx of [176, 256, 336]) {
        const dx = x - cx * s
        const dy = y - 225 * s
        if (dx * dx + dy * dy <= 24 * s * (24 * s)) color = DOT
      }
      const off = y * (1 + size * 4) + 1 + x * 4
      raw[off] = color[0]
      raw[off + 1] = color[1]
      raw[off + 2] = color[2]
      raw[off + 3] = color[3]
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ])
}

mkdirSync(path.join(root, 'build'), { recursive: true })
mkdirSync(path.join(root, 'resources'), { recursive: true })
writeFileSync(path.join(root, 'build', 'icon.png'), png(512))
writeFileSync(path.join(root, 'resources', 'tray.png'), png(32))
console.log('icons written: build/icon.png (512), resources/tray.png (32)')
