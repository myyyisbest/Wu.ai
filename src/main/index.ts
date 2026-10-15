import {
  BrowserWindow,
  Menu,
  Tray,
  WebContentsView,
  app,
  ipcMain,
  nativeImage,
  shell
} from 'electron'
import path from 'node:path'
import { SERVICES, serviceById } from '../shared/services'
import type {
  AppStatePayload,
  Insets,
  ServiceStatus,
  Settings,
  VaultSaveInput
} from '../shared/types'
import { chromeUA, serviceSession } from './sessions'
import { buildCleanupScript } from './cleanup'
import { loadSettings, normalizeMinutes, saveSettings } from './store'
import * as vault from './vault'
import * as notes from './notes'

const SIDEBAR_DEFAULT_WIDTH = 60

let win: BrowserWindow | null = null
let tray: Tray | null = null
let settings: Settings
let overlaysOpen = false
let insets: Insets = { left: SIDEBAR_DEFAULT_WIDTH, top: 0, right: 0, bottom: 0 }

import type { NoteSaveInput } from '../shared/types'

const views = new Map<string, WebContentsView>()
const attached = new Set<string>()
const statuses: Record<string, ServiceStatus> = {}
const retryCounts: Record<string, number> = {}
const lastShown = new Map<string, number>()

/** 用户拖动排序后的服务顺序（无序则按注册表顺序） */
function orderedIds(): string[] {
  const order = (settings.order ?? []).filter((id) => serviceById(id))
  for (const def of SERVICES) if (!order.includes(def.id)) order.push(def.id)
  return order
}

function resourcePath(...names: string[]): string {
  // 打包后 extraResources 落在 process.resourcesPath，开发态在项目根
  const root = app.isPackaged ? path.join(process.resourcesPath, 'resources') : path.join(app.getAppPath(), 'resources')
  return path.join(root, ...names)
}

function pushState(): void {
  if (!win || win.isDestroyed()) return
  const byId = new Map(SERVICES.map((s) => [s.id, s]))
  const payload: AppStatePayload = {
    services: orderedIds().map((id) => {
      const s = byId.get(id)!
      return { id: s.id, name: s.name, color: s.color, url: s.url, browserLogin: s.browserLogin }
    }),
    settings,
    statuses
  }
  win.webContents.send('wu:state', payload)
}

function setStatus(id: string, status: ServiceStatus): void {
  if (statuses[id] === status) return
  statuses[id] = status
  pushState()
}

/* ---------------------------------- 布局 ---------------------------------- */

function applyLayout(): void {
  if (!win || win.isDestroyed()) return
  const ids = overlaysOpen ? [] : [settings.selected]
  for (const def of SERVICES) {
    const view = views.get(def.id)
    if (!view) continue
    const show = ids.includes(def.id)
    if (!show) {
      if (attached.has(def.id)) {
        win.contentView.removeChildView(view)
        attached.delete(def.id)
      }
      continue
    }
    const [w, h] = win.getContentSize()
    view.setBounds({
      x: insets.left,
      y: insets.top,
      width: Math.max(0, w - insets.left - insets.right),
      height: Math.max(0, h - insets.top - insets.bottom)
    })
    if (!attached.has(def.id)) {
      win.contentView.addChildView(view)
      attached.add(def.id)
    }
  }
}

/* ------------------------------ 服务视图管理 ------------------------------ */

/** 惰性加载：页面在首次选中时才创建；后台页面闲置超时后整体释放（登录态在分区里，重进自动重载） */
function ensureServiceView(defId: string): void {
  if (views.has(defId)) {
    lastShown.set(defId, Date.now())
    return
  }
  createServiceView(defId)
  lastShown.set(defId, Date.now())
}

/** 释放切走太久、不再显示的后台页面，回收渲染进程内存（时长用户可在设置调整） */
function unloadStaleViews(): void {
  if (!settings.unloadBackground) return
  const now = Date.now()
  const threshold = normalizeMinutes(settings.unloadMinutes) * 60_000
  for (const def of SERVICES) {
    if (def.id === settings.selected) continue
    const shown = lastShown.get(def.id)
    if (!shown || now - shown < threshold) continue
    destroyServiceView(def.id)
  }
}

function destroyServiceView(defId: string): void {
  const view = views.get(defId)
  if (!view) return
  if (attached.has(defId)) {
    try {
      win?.contentView.removeChildView(view)
    } catch {
      // 窗口可能已销毁
    }
    attached.delete(defId)
  }
  views.delete(defId)
  lastShown.delete(defId)
  if (!view.webContents.isDestroyed()) view.webContents.close()
  setStatus(defId, 'idle')
}

function injectCleanup(defId: string): void {
  const def = serviceById(defId)
  const view = views.get(defId)
  if (!def || !view) return
  try {
    const css = [def.cleanupCss.join('\n'), settings.customCss[defId] ?? '']
      .filter(Boolean)
      .join('\n')
    if (css) void view.webContents.insertCSS(css)
    if (settings.cleanupEnabled[`${defId}-promo`] !== false) {
      void view.webContents.executeJavaScript(
        buildCleanupScript(def.cleanupKeywords, def.hideBottomLeftIcon)
      )
    }
  } catch {
    // 净化属装饰性优化，失败静默
  }
}

function createServiceView(defId: string): void {
  const def = serviceById(defId)
  if (!def || views.has(defId)) return

  // 确保分区会话已创建并设置好 UA（见 sessions.ts）
  serviceSession(def)
  const view = new WebContentsView({
    webPreferences: {
      partition: def.partition,
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
      // 浏览器身份伪装补丁（Google OAuth 拒绝嵌入式浏览器的对策）
      preload: path.join(__dirname, '../preload/identity.js')
    }
  })
  views.set(defId, view)
  statuses[defId] = 'loading'

  const wc = view.webContents
  wc.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  wc.on('dom-ready', () => {
    injectCleanup(defId)
    applyWebTheme(defId)
  })
  wc.on('did-finish-load', () => {
    retryCounts[defId] = 0
    setStatus(defId, 'ready')
  })
  wc.on('did-fail-load', (_e, code, _desc, _url, isMainFrame) => {
    if (!isMainFrame || code === -3) return
    const tries = (retryCounts[defId] ?? 0) + 1
    retryCounts[defId] = tries
    if (tries <= 3) {
      setTimeout(() => {
        if (!view.webContents.isDestroyed()) view.webContents.reload()
      }, 1200 * tries)
    } else {
      setStatus(defId, 'error')
    }
  })
  wc.on('render-process-gone', (_e, details) => {
    if (details.reason === 'clean-exit') return
    // 渲染进程崩溃：销毁并标记，下次选中时重建
    destroyServiceView(defId)
  })
  wc.loadURL(settings.urls[defId] || def.url, { userAgent: chromeUA() })
}

function reloadService(defId: string): void {
  const view = views.get(defId)
  if (!view) return
  retryCounts[defId] = 0
  setStatus(defId, 'loading')
  view.webContents.loadURL(settings.urls[defId] || serviceById(defId)!.url, {
    userAgent: chromeUA()
  })
}

/** 全局夜间模式：三家网页都不跟随系统主题，用 CSS 反色滤镜实现
 *  可实时切换的全局夜间（图片/视频二次反色还原原色）。
 *  通过注入/移除 <style> 标签实现，避免 insertCSS/removeInsertedCSS 的状态残留问题。 */
const DARK_CSS =
  'html{filter:invert(0.90) hue-rotate(180deg);background:#fff}' +
  'img,video,picture,canvas,svg{filter:invert(1) hue-rotate(180deg)}'

function applyWebTheme(defId: string): void {
  const view = views.get(defId)
  if (!view) return
  const js =
    settings.theme === 'dark'
      ? `(function(){var s=document.getElementById('wu-dark-style')||document.createElement('style');s.id='wu-dark-style';s.textContent=${JSON.stringify(DARK_CSS)};document.head.appendChild(s)})()`
      : `(function(){var s=document.getElementById('wu-dark-style');if(s)s.parentNode.removeChild(s)})()`
  void view.webContents.executeJavaScript(js).catch(() => {})
}

function applyThemeAll(): void {
  for (const def of SERVICES) applyWebTheme(def.id)
}

/** 应用内代理：显式指定后优先于 Windows 系统代理（系统代理关了也照常工作）；留空跟随系统 */
function applyProxy(): void {
  const raw = (settings.proxy ?? '').trim()
  const config = raw ? { proxyRules: raw } : { mode: 'system' as const }
  for (const def of SERVICES) {
    try {
      void serviceSession(def).setProxy(config)
    } catch {
      // 会话尚未创建时忽略（创建时会重新应用）
    }
  }
}

/* --------------------------------- IPC ---------------------------------- */

function registerIpc(): void {
  ipcMain.handle('wu:get-state', (): AppStatePayload => {
    return {
      services: SERVICES.map((s) => ({
        id: s.id,
        name: s.name,
        color: s.color,
        url: s.url,
        browserLogin: s.browserLogin
      })),
      settings,
      statuses
    }
  })

  ipcMain.on('wu:select', (_e, id: string) => {
    selectService(id)
  })

  ipcMain.on('wu:insets', (_e, next: Insets) => {
    insets = next
    applyLayout()
  })

  ipcMain.on('wu:overlay', (_e, open: boolean) => {
    overlaysOpen = Boolean(open)
    applyLayout()
  })

  ipcMain.on('wu:reload', (_e, id: string) => reloadService(id))

  ipcMain.handle('wu:clear-session', async (_e, id: string) => {
    const def = serviceById(id)
    if (!def) return
    await serviceSession(def).clearStorageData()
    reloadService(id)
  })

  ipcMain.handle('wu:update-settings', (_e, partial: Partial<Settings>) => {
    const urlChanged = partial.urls && Object.entries(partial.urls).some(([id, url]) => url && url !== settings.urls[id])
    settings = { ...settings, ...partial }
    saveSettings(settings)
    if (partial.theme) applyThemeAll()
    if (partial.proxy !== undefined) applyProxy()
    if (urlChanged) {
      for (const [id, url] of Object.entries(partial.urls ?? {})) {
        if (url && views.has(id)) reloadService(id)
      }
    } else {
      // 净化开关 / 自定义 CSS 变化时重新注入
      for (const def of SERVICES) injectCleanup(def.id)
    }
    applyLayout()
    pushState()
  })

  ipcMain.handle(
    'wu:cookies-import',
    async (_e, serviceId: string, text: string): Promise<{ imported: number; failed: number }> => {
      const def = serviceById(serviceId)
      if (!def) return { imported: 0, failed: 0 }
      const ses = serviceSession(def)
      let imported = 0
      let failed = 0
      // 支持两种格式：每行 name=value；或整段 "a=1; b=2"（从 F12 请求头复制的 Cookie 值）
      const lines = String(text ?? '')
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean)
      const pairs = lines.flatMap((line) =>
        line
          .replace(/^cookie:\s*/i, '')
          .split(';')
          .map((p) => p.trim())
      )
      for (const pair of pairs) {
        const eq = pair.indexOf('=')
        if (eq <= 0) continue
        const name = pair.slice(0, eq).trim()
        const value = pair.slice(eq + 1).trim()
        if (!name || !value) continue
        try {
          await ses.cookies.set({
            url: new URL(settings.urls[serviceId] || def.url).origin,
            name,
            value,
            domain: new URL(settings.urls[serviceId] || def.url).hostname.replace(/^www\./, '.'),
            path: '/',
            secure: true,
            httpOnly: false,
            sameSite: 'no_restriction'
          })
          imported++
        } catch {
          failed++
        }
      }
      if (imported > 0) reloadService(serviceId)
      return { imported, failed }
    }
  )

  ipcMain.handle('wu:browser-login', async (_e, id: string) => {
    const { launchBrowserLogin } = await import('./browser-auth')
    return launchBrowserLogin(id, settings.urls[id] || serviceById(id)!.url)
  })

  ipcMain.handle('wu:import-browser-session', async (_e, id: string) => {
    const { importSessionFromBrowser, DEBUG_PORT: BROWSER_DEBUG_PORT } = await import('./browser-auth')
    const fetchBrowserCookies = () => {
      // 在壳页面里连 9223 读 Cookie（渲染进程 WebSocket 自动聚合分片，主进程 ws 包有丢消息问题）
      const expr = `(async () => {
        const ver = await (await fetch('http://127.0.0.1:${BROWSER_DEBUG_PORT}/json/version')).json()
        const ws = new WebSocket(ver.webSocketDebuggerUrl)
        return await new Promise((resolve, reject) => {
          const t = setTimeout(() => reject(new Error('读取超时')), 8000)
          ws.onopen = () => ws.send(JSON.stringify({ id: 1, method: 'Storage.getCookies' }))
          ws.onmessage = (ev) => {
            if (!ev.data) return
            const m = JSON.parse(ev.data)
            if (m.id === 1) { clearTimeout(t); resolve(m.result?.cookies ?? []); ws.close() }
          }
          ws.onerror = () => { clearTimeout(t); reject(new Error('无法连接登录浏览器')) }
        })
      })()`
      if (!win || win.isDestroyed()) return Promise.reject(new Error('窗口未就绪'))
      return Promise.race([
        win.webContents.executeJavaScript(expr, true),
        new Promise((_, rej) => setTimeout(() => rej(new Error('读取登录状态超时')), 15000))
      ])
    }
    return importSessionFromBrowser(id, {
      getUrl: (sid) => settings.urls[sid] || serviceById(sid)!.url,
      getSession: (sid) => serviceSession(serviceById(sid)!),
      reload: (sid) => reloadService(sid),
      fetchBrowserCookies
    })
  })

  ipcMain.handle('wu:notes-list', () => notes.list())
  ipcMain.handle('wu:notes-save', (_e, note: NoteSaveInput) => notes.save(note))
  ipcMain.handle('wu:notes-delete', (_e, id: string) => notes.remove(id))

  ipcMain.handle('wu:vault-list', () => vault.list())
  ipcMain.handle('wu:vault-save', (_e, entry: VaultSaveInput) => vault.save(entry))
  ipcMain.handle('wu:vault-remove', (_e, id: string) => vault.remove(id))
  ipcMain.handle('wu:vault-reveal', (_e, id: string) => vault.reveal(id))
  ipcMain.handle('wu:vault-copy', (_e, id: string, field: 'account' | 'password') =>
    vault.copy(id, field)
  )
}

/* ------------------------------ 菜单 / 托盘 ------------------------------ */

function selectService(id: string): void {
  if (!serviceById(id)) return
  settings.selected = id
  saveSettings(settings)
  ensureServiceView(id)
  unloadStaleViews()
  applyLayout()
  pushState()
}

function buildMenu(): void {
  const ids = orderedIds()
  const menu = Menu.buildFromTemplate([
    {
      label: '服务',
      submenu: ids.map((id, i) => {
        const def = serviceById(id)!
        return {
          label: def.name,
          accelerator: `CmdOrCtrl+${i + 1}`,
          click: () => selectService(def.id)
        }
      })
    },
    {
      label: '视图',
      submenu: [
        { label: '重新加载当前服务', accelerator: 'CmdOrCtrl+Alt+R', click: () => reloadService(settings.selected) },
        { type: 'separator' },
        { role: 'toggleDevTools' }
      ]
    }
  ])
  Menu.setApplicationMenu(menu)
}

function showWindow(): void {
  if (!win || win.isDestroyed()) {
    createWindow()
    return
  }
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
}

function createTray(): void {
  const icon = nativeImage.createFromPath(resourcePath('tray.png'))
  tray = new Tray(icon)
  tray.setToolTip('Wu.ai')
  tray.on('click', showWindow)
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: '显示主窗口', click: showWindow },
      { type: 'separator' },
      {
        label: '退出',
        click: () => app.quit()
      }
    ])
  )
}

/* -------------------------------- 启动 ---------------------------------- */

function createWindow(): void {
  win = new BrowserWindow({
    width: 1200,
    height: 860,
    minWidth: 760,
    minHeight: 560,
    backgroundColor: '#111318',
    title: 'Wu.ai',
    show: false,
    autoHideMenuBar: true,
    icon: app.isPackaged ? undefined : path.join(app.getAppPath(), 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  win.once('ready-to-show', () => {
    win?.show()
    // 窗口显示后 Windows 可能调整尺寸，重算一次布局避免视图留缝
    applyLayout()
  })
  win.on('resize', applyLayout)
  win.on('maximize', applyLayout)
  win.on('unmaximize', applyLayout)
  if (process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void win.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  // 远程桌面/截屏环境下窗口遮挡计算会误判，导致 WebContentsView 停止渲染（黑屏）
  app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion')
  if (!app.isPackaged) app.commandLine.appendSwitch('remote-debugging-port', '9222')
  app.on('second-instance', showWindow)
  app.whenReady().then(() => {
    settings = loadSettings()
    if (!serviceById(settings.selected)) settings.selected = SERVICES[0].id
    applyProxy()
    // 惰性加载：只创建当前选中的服务，切换时再加载其他家
    ensureServiceView(settings.selected)
    createWindow()
    buildMenu()
    createTray()
    registerIpc()
    applyLayout()
  })

  app.on('before-quit', () => {
    tray?.destroy()
    tray = null
  })

  app.on('window-all-closed', () => {
    app.quit()
  })
}
