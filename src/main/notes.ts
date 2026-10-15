import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import type { Note, NoteSaveInput } from '../shared/types'

const NOTES_FILE = 'notes.json'

function notesPath(): string {
  return path.join(app.getPath('userData'), NOTES_FILE)
}

function readAll(): Note[] {
  try {
    if (existsSync(notesPath())) {
      const raw = JSON.parse(readFileSync(notesPath(), 'utf-8'))
      if (Array.isArray(raw.notes)) return raw.notes as Note[]
    }
  } catch {
    // 笔记文件损坏时按空处理
  }
  return []
}

function writeAll(notes: Note[]): void {
  const dir = app.getPath('userData')
  mkdirSync(dir, { recursive: true })
  writeFileSync(notesPath(), JSON.stringify({ notes }, null, 2), 'utf-8')
}

export function list(): Note[] {
  return readAll().sort((a, b) => b.updatedAt - a.updatedAt)
}

export function save(input: NoteSaveInput): Note {
  const notes = readAll()
  const now = Date.now()
  const existing = input.id ? notes.find((n) => n.id === input.id) : undefined
  if (existing) {
    existing.content = input.content
    existing.updatedAt = now
    writeAll(notes)
    return existing
  }
  const note: Note = { id: randomUUID(), content: input.content, updatedAt: now }
  notes.push(note)
  writeAll(notes)
  return note
}

export function remove(id: string): void {
  writeAll(readAll().filter((n) => n.id !== id))
}
