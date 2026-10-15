export interface ServiceMeta {
  id: string
  name: string
  color: string
  url: string
  browserLogin?: boolean
}

export type ThemeMode = 'dark' | 'light'

export interface Settings {
  urls: Record<string, string>
  selected: string
  theme: ThemeMode
  /** 侧边栏服务顺序（可拖动排序），存服务 id */
  order: string[]
  /** 切走超过 10 分钟的后台页面自动释放（重进自动重载，登录态保留） */
  unloadBackground: boolean
  /** 后台页面释放的闲置分钟数 */
  unloadMinutes: number
  /** 应用内代理地址，如 http://127.0.0.1:7890；留空跟随 Windows 系统代理 */
  proxy: string
  cleanupEnabled: Record<string, boolean>
  customCss: Record<string, string>
}

export type ServiceStatus = 'idle' | 'loading' | 'ready' | 'error'

export interface AppStatePayload {
  services: ServiceMeta[]
  settings: Settings
  statuses: Record<string, ServiceStatus>
}

export interface VaultEntryMeta {
  id: string
  serviceId: string
  account: string
  notes: string
  updatedAt: number
  hasPassword: boolean
}

export interface VaultSaveInput {
  id?: string
  serviceId: string
  account: string
  password?: string
  notes?: string
}

export interface Insets {
  left: number
  top: number
  right: number
  bottom: number
}

export interface Note {
  id: string
  content: string
  updatedAt: number
}

export interface NoteSaveInput {
  id: string
  content: string
}

export interface WuApi {
  getState(): Promise<AppStatePayload>
  select(id: string): void
  setInsets(insets: Insets): void
  setOverlay(open: boolean): void
  reloadService(id: string): void
  clearSession(id: string): Promise<void>
  importCookies(id: string, text: string): Promise<{ imported: number; failed: number }>
  browserLogin(id: string): Promise<{ ok: boolean; message: string }>
  importBrowserSession(id: string): Promise<{ ok: boolean; message: string }>
  notesList(): Promise<Note[]>
  notesSave(note: NoteSaveInput): Promise<Note>
  notesDelete(id: string): Promise<void>
  updateSettings(partial: Partial<Settings>): Promise<void>
  vaultList(): Promise<VaultEntryMeta[]>
  vaultSave(entry: VaultSaveInput): Promise<void>
  vaultRemove(id: string): Promise<void>
  vaultReveal(id: string): Promise<string>
  vaultCopy(id: string, field: 'account' | 'password'): Promise<void>
  onState(cb: (s: AppStatePayload) => void): () => void
}
