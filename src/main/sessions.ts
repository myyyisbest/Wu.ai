import { app, session, type Session } from 'electron'
import type { ServiceDef } from '../shared/services'

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

  // Google 登录会拒绝"嵌入式浏览器"：识别依据之一是 Sec-CH-UA 自报品牌为
  // "Chromium"（Electron 内核如此），改写成真实 Chrome 品牌后 OAuth 可正常走通
  const major = /Chrome\/(\d+)/.exec(ua)?.[1] ?? '130'
  ses.webRequest.onBeforeSendHeaders(
    { urls: ['*://*.google.com/*'] },
    (details, callback) => {
      const headers = { ...details.requestHeaders }
      headers['Sec-CH-UA'] = `"Google Chrome";v="${major}", "Chromium";v="${major}", "Not=A?Brand";v="24"`
      headers['Sec-CH-UA-Full-Version-List'] = `"Google Chrome";v="${major}.0.0.0", "Chromium";v="${major}.0.0.0", "Not=A?Brand";v="24.0.0.0"`
      headers['Sec-CH-UA-Platform'] = '"Windows"'
      callback({ requestHeaders: headers })
    }
  )

  uaCache.set(def.partition, ses)
  return ses
}
