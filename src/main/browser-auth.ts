import { spawn, exec } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { app } from 'electron'
import type { Session } from 'electron'
import { serviceById } from '../shared/services'

export const DEBUG_PORT = 9223

export interface BrowserAuthDeps {
  getUrl: (serviceId: string) => string
  getSession: (serviceId: string) => Session
  reload: (serviceId: string) => void
  /** 在壳页面里连浏览器调试端口读取全部 Cookie（渲染进程有原生 WebSocket） */
  fetchBrowserCookies: () => Promise<
    { name: string; value: string; domain: string; path: string; secure: boolean; httpOnly: boolean; expires: number; sameSite?: string }[]
  >
}

/** Chrome/Edge 可执行文件探测（常见安装路径 → 注册表 App Paths） */
function findBrowser(): Promise<string | null> {
  return new Promise((resolve) => {
    const tryPaths = [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
    ]
    for (const p of tryPaths) if (existsSync(p)) return resolve(p)
    exec(
      'reg query "HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\chrome.exe" /ve',
      (_e, stdout) => {
        const m = /REG_SZ\s+(\S+chrome\.exe)/i.exec(stdout || '')
        if (m) return resolve(m[1])
        exec(
          'reg query "HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\msedge.exe" /ve',
          (_e2, stdout2) => {
            const m2 = /REG_SZ\s+(\S+msedge\.exe)/i.exec(stdout2 || '')
            resolve(m2 ? m2[1] : null)
          }
        )
      }
    )
  })
}

let authProc: ReturnType<typeof spawn> | null = null

/** 拉起独立配置目录的浏览器（不碰用户日常 Chrome），打开服务的登录页 */
export async function launchBrowserLogin(
  serviceId: string,
  url: string
): Promise<{ ok: boolean; message: string }> {
  const def = serviceById(serviceId)
  if (!def) return { ok: false, message: '未知服务' }
  const browser = await findBrowser()
  if (!browser) return { ok: false, message: '未找到 Chrome 或 Edge，请先安装其一' }
  const profile = path.join(app.getPath('userData'), 'chrome-auth')
  if (authProc) {
    try {
      authProc.kill()
    } catch {
      // 进程可能已退出
    }
  }
  authProc = spawn(
    browser,
    [
      `--user-data-dir=${profile}`,
      `--remote-debugging-port=${DEBUG_PORT}`,
      '--no-first-run',
      '--no-default-browser-check',
      url
    ],
    { detached: true, stdio: 'ignore' }
  )
  authProc.unref()
  return { ok: true, message: '浏览器已打开，请在其中完成登录' }
}

type RawCookie = {
  name: string
  value: string
  domain: string
  path: string
  secure: boolean
  httpOnly: boolean
  expires: number
  sameSite?: string
}

/** 从系统浏览器收割会话 Cookie 到应用分区，成功后重载页面恢复登录态 */
export async function importSessionFromBrowser(
  serviceId: string,
  deps: BrowserAuthDeps
): Promise<{ ok: boolean; message: string }> {
  const def = serviceById(serviceId)
  if (!def) return { ok: false, message: '未知服务' }
  let cookies: RawCookie[]
  try {
    cookies = await deps.fetchBrowserCookies()
  } catch (e) {
    return { ok: false, message: (e as Error).message }
  }
  const host = new URL(deps.getUrl(serviceId)).hostname.replace(/^www\./, '')
  const domains = [host, ...(def.cookieDomains ?? [])]
  const matchDomain = (cookieDomain: string) => {
    const d = cookieDomain.replace(/^\./, '')
    return domains.some((allowed) => d === allowed || d.endsWith('.' + allowed))
  }
  const related = cookies.filter((c) => matchDomain(c.domain))
  // 登录完成的标志：关联域里存在长值的会话类 cookie（不同服务的命名差异大，
  // 如 ChatGPT 叫 __Secure-next-auth.session-token、Grok 叫 sso，只按值长度假定）
  const sessionCookie = related.find((c) => c.value.length > 20)
  if (!sessionCookie) {
    return { ok: false, message: '浏览器里尚未检测到登录状态，请先完成登录再导入' }
  }
  const ses = deps.getSession(serviceId)
  let imported = 0
  for (const c of related) {
    try {
      await ses.cookies.set({
        url: `${c.secure ? 'https' : 'http'}://${c.domain.replace(/^\./, '')}${c.path || '/'}`,
        name: c.name,
        value: c.value,
        domain: c.domain,
        path: c.path || '/',
        secure: c.secure,
        httpOnly: c.httpOnly,
        sameSite: (c.sameSite ? String(c.sameSite).toLowerCase() : 'no_restriction') as
          | 'no_restriction'
          | 'lax'
          | 'strict',
        expirationDate: c.expires > 0 ? c.expires : undefined
      })
      imported++
    } catch {
      // 个别 cookie 属性不兼容时跳过
    }
  }
  if (imported === 0) return { ok: false, message: '会话 Cookie 导入失败' }
  deps.reload(serviceId)
  return { ok: true, message: `已导入 ${imported} 条 Cookie，${def.name} 登录态恢复` }
}
