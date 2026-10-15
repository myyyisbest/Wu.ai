import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type { Settings } from '../shared/types'
import { SERVICES } from '../shared/services'

const SETTINGS_FILE = 'settings.json'

function defaults(): Settings {
  const urls: Record<string, string> = {}
  const cleanupEnabled: Record<string, boolean> = {}
  for (const s of SERVICES) {
    urls[s.id] = s.url
    cleanupEnabled[`${s.id}-promo`] = true
  }
  return {
    urls,
    selected: SERVICES[0].id,
    theme: 'dark',
    order: SERVICES.map((s) => s.id),
    unloadBackground: true,
    unloadMinutes: 15,
    proxy: '',
    cleanupEnabled,
    customCss: {}
  }
}

export function loadSettings(): Settings {
  const base = defaults()
  try {
    const file = path.join(app.getPath('userData'), SETTINGS_FILE)
    if (existsSync(file)) {
      const raw = JSON.parse(readFileSync(file, 'utf-8')) as Partial<Settings>
      const ids = new Set(SERVICES.map((s) => s.id))
      const order = (Array.isArray(raw.order) ? raw.order : base.order)
        .filter((id: unknown) => typeof id === 'string' && ids.has(id as string))
      for (const s of SERVICES) if (!order.includes(s.id)) order.push(s.id)
      return {
        ...base,
        ...raw,
        order,
        unloadMinutes: normalizeMinutes(raw.unloadMinutes),
        urls: { ...base.urls, ...(raw.urls ?? {}) },
        cleanupEnabled: { ...base.cleanupEnabled, ...(raw.cleanupEnabled ?? {}) },
        customCss: { ...(raw.customCss ?? {}) }
      }
    }
  } catch {
    // 设置文件损坏时回退到默认值
  }
  return base
}

export function normalizeMinutes(v: unknown): number {
  const n = Math.floor(Number(v))
  if (!Number.isFinite(n) || n < 1) return 15
  return Math.min(n, 1440)
}

export function saveSettings(settings: Settings): void {
  const dir = app.getPath('userData')
  mkdirSync(dir, { recursive: true })
  writeFileSync(path.join(dir, SETTINGS_FILE), JSON.stringify(settings, null, 2), 'utf-8')
}
