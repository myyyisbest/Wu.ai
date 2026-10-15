import { app, clipboard, safeStorage } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import type { VaultEntryMeta, VaultSaveInput } from '../shared/types'
import { serviceById } from '../shared/services'

interface VaultEntry {
  id: string
  serviceId: string
  account: string
  /** safeStorage 加密后 base64；仅在 reveal/copy 时解密 */
  passwordEnc?: string
  notes: string
  updatedAt: number
}

const VAULT_FILE = 'vault.json'

function vaultPath(): string {
  return path.join(app.getPath('userData'), VAULT_FILE)
}

function readAll(): VaultEntry[] {
  try {
    if (existsSync(vaultPath())) {
      const raw = JSON.parse(readFileSync(vaultPath(), 'utf-8'))
      if (Array.isArray(raw.entries)) return raw.entries as VaultEntry[]
    }
  } catch {
    // 密码本损坏时按空处理，避免整个面板不可用
  }
  return []
}

function writeAll(entries: VaultEntry[]): void {
  const dir = app.getPath('userData')
  mkdirSync(dir, { recursive: true })
  writeFileSync(vaultPath(), JSON.stringify({ entries }, null, 2), 'utf-8')
}

export function ensureEncryptionAvailable(): boolean {
  return safeStorage.isEncryptionAvailable()
}

export function list(): VaultEntryMeta[] {
  return readAll().map((e) => ({
    id: e.id,
    serviceId: e.serviceId,
    account: e.account,
    notes: e.notes,
    updatedAt: e.updatedAt,
    hasPassword: Boolean(e.passwordEnc)
  }))
}

export function save(input: VaultSaveInput): void {
  if (!serviceById(input.serviceId)) throw new Error('未知的服务: ' + input.serviceId)
  const entries = readAll()
  const now = Date.now()
  const existing = input.id ? entries.find((e) => e.id === input.id) : undefined
  let passwordEnc = existing?.passwordEnc
  if (typeof input.password === 'string' && input.password.length > 0) {
    if (!ensureEncryptionAvailable()) throw new Error('系统加密不可用，无法保存密码')
    passwordEnc = safeStorage.encryptString(input.password).toString('base64')
  }
  if (existing) {
    existing.account = input.account
    existing.notes = input.notes ?? existing.notes
    existing.serviceId = input.serviceId
    existing.updatedAt = now
    if (passwordEnc) existing.passwordEnc = passwordEnc
    else if (typeof input.password === 'string') existing.passwordEnc = undefined
  } else {
    entries.push({
      id: randomUUID(),
      serviceId: input.serviceId,
      account: input.account,
      passwordEnc,
      notes: input.notes ?? '',
      updatedAt: now
    })
  }
  writeAll(entries)
}

export function remove(id: string): void {
  writeAll(readAll().filter((e) => e.id !== id))
}

export function reveal(id: string): string {
  const entry = readAll().find((e) => e.id === id)
  if (!entry?.passwordEnc) return ''
  if (!ensureEncryptionAvailable()) throw new Error('系统加密不可用')
  return safeStorage.decryptString(Buffer.from(entry.passwordEnc, 'base64'))
}

export function copy(id: string, field: 'account' | 'password'): void {
  const entry = readAll().find((e) => e.id === id)
  if (!entry) return
  clipboard.writeText(field === 'account' ? entry.account : reveal(id))
}
