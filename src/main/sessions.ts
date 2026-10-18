import { app, session, type Session } from 'electron'
import type { ServiceDef } from '../shared/services'
import { clientHintHeaders } from '../shared/identity'

/**
 * 真实 Chrome UA：Electron 自带 UA 里含 "Electron/x.y.z" 等标记，
 * 部分站点会据此弹"请用浏览器打开"或限制功能，这里剥掉这些标记。
 * Chromium 版本号来自本机 Electron，比写死一个版本更可信。
 */
export function chromeUA(): string {
  const raw = session.defaultSession.getUserAgent()
  return raw
    .replace(new RegExp(`\\s${app.getName()}/[\\d.]+`, 'i'), '')
    .replace(/\sElectron\/[\d.]+/i, '')
    .replace(/\s+$/, '')
}

const uaCache = new Map<string, Session>()

/** 每家一个持久化分区：cookie / localStorage 落盘，重启后保持登录态 */
export function serviceSession(def: ServiceDef): Session {
  const existing = uaCache.get(def.partition)
  if (existing) return existing
  const ses = session.fromPartition(def.partition, { cache: true })
  const ua = chromeUA()
  ses.setUserAgent(ua)

  // 浏览器身份一致性：Cloudflare（grok.com 验证）等风控交叉比对 Sec-CH-UA 请求头
  // 与页面内 navigator.userAgentData，Electron 原生头自报 "Chromium" 而页面补丁是
  // "Google Chrome"，不一致即判机器人 → 安全验证无限转圈。这里对所有 http(s)
  // 请求统一改写，取值与 shared/identity.ts 的页面补丁逐字相同（只改 http/https，
  // 避免 devtools/file 等内部请求被误改）。
  const major = /Chrome\/(\d+)/.exec(ua)?.[1] ?? '130'
  const full = /Chrome\/([\d.]+)/.exec(ua)?.[1] ?? `${major}.0.0.0`
  const hintHeaders = clientHintHeaders(major, full)
  ses.webRequest.onBeforeSendHeaders(
    { urls: ['http://*/*', 'https://*/*'] },
    (details, callback) => {
      callback({
        requestHeaders: {
          ...details.requestHeaders,
          ...hintHeaders,
          // Electron 原生只发 "zh-CN" 单值，真实 Chrome 是带权重列表（与页面内
          // navigator.languages 补丁一致）
          'Accept-Language': 'zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7'
        }
      })
    }
  )

  uaCache.set(def.partition, ses)
  return ses
}
