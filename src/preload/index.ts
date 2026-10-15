import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type {
  AppStatePayload,
  Insets,
  NoteSaveInput,
  Settings,
  VaultSaveInput,
  WuApi
} from '../shared/types'

const api: WuApi = {
  getState: () => ipcRenderer.invoke('wu:get-state'),
  select: (id: string) => ipcRenderer.send('wu:select', id),
  setInsets: (insets: Insets) => ipcRenderer.send('wu:insets', insets),
  setOverlay: (open: boolean) => ipcRenderer.send('wu:overlay', open),
  reloadService: (id: string) => ipcRenderer.send('wu:reload', id),
  clearSession: (id: string) => ipcRenderer.invoke('wu:clear-session', id),
  importCookies: (id: string, text: string) =>
    ipcRenderer.invoke('wu:cookies-import', id, text),
  browserLogin: (id: string) => ipcRenderer.invoke('wu:browser-login', id),
  importBrowserSession: (id: string) => ipcRenderer.invoke('wu:import-browser-session', id),
  notesList: () => ipcRenderer.invoke('wu:notes-list'),
  notesSave: (note: NoteSaveInput) => ipcRenderer.invoke('wu:notes-save', note),
  notesDelete: (id: string) => ipcRenderer.invoke('wu:notes-delete', id),
  updateSettings: (partial: Partial<Settings>) => ipcRenderer.invoke('wu:update-settings', partial),
  vaultList: () => ipcRenderer.invoke('wu:vault-list'),
  vaultSave: (entry: VaultSaveInput) => ipcRenderer.invoke('wu:vault-save', entry),
  vaultRemove: (id: string) => ipcRenderer.invoke('wu:vault-remove', id),
  vaultReveal: (id: string) => ipcRenderer.invoke('wu:vault-reveal', id),
  vaultCopy: (id: string, field: 'account' | 'password') =>
    ipcRenderer.invoke('wu:vault-copy', id, field),
  onState: (cb: (s: AppStatePayload) => void) => {
    const handler = (_e: IpcRendererEvent, s: AppStatePayload) => cb(s)
    ipcRenderer.on('wu:state', handler)
    return () => ipcRenderer.removeListener('wu:state', handler)
  }
}

contextBridge.exposeInMainWorld('wu', api)
