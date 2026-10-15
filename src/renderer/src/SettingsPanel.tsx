import { useState } from 'react'
import type { AppStatePayload } from '../../shared/types'

interface Props {
  state: AppStatePayload
  onClose: () => void
}

function normalizeUrl(raw: string): string {
  const v = raw.trim()
  if (!v) return v
  return /^https?:\/\//i.test(v) ? v : 'https://' + v
}

/** 每家服务的 Cookie 导入草稿（粘贴浏览器里复制的登录 Cookie） */

type SectionId = 'general' | string

export default function SettingsPanel({ state, onClose }: Props) {
  const { settings, services } = state
  const [active, setActive] = useState<SectionId>('general')
  const [urlDrafts, setUrlDrafts] = useState<Record<string, string>>({ ...settings.urls })
  const [cssDrafts, setCssDrafts] = useState<Record<string, string>>({ ...settings.customCss })
  const [proxyDraft, setProxyDraft] = useState<string>(settings.proxy ?? '')
  const [cookieDrafts, setCookieDrafts] = useState<Record<string, string>>({})
  const [cookieMsg, setCookieMsg] = useState<Record<string, string>>({})
  const [browserMsg, setBrowserMsg] = useState<Record<string, string>>({})
  const [minutesDraft, setMinutesDraft] = useState<string>(String(settings.unloadMinutes ?? 15))

  function saveUrl(id: string) {
    const url = normalizeUrl(urlDrafts[id] ?? '')
    if (!url || url === settings.urls[id]) return
    setUrlDrafts({ ...urlDrafts, [id]: url })
    void window.wu.updateSettings({ urls: { ...settings.urls, [id]: url } })
  }

  function saveCss(id: string) {
    void window.wu.updateSettings({ customCss: { ...settings.customCss, [id]: cssDrafts[id] ?? '' } })
  }

  async function clearSession(id: string) {
    const name = services.find((s) => s.id === id)?.name ?? id
    if (!window.confirm(`确定清除 ${name} 的登录数据吗？之后需要重新登录。`)) return
    await window.wu.clearSession(id)
  }

  const svc = services.find((s) => s.id === active)

  return (
    <div className="settings-page">
      <div className="settings-title-bar">
        <h2>设置</h2>
        <button className="close-btn" onClick={onClose}>
          ✕
        </button>
      </div>

      <div className="settings-layout">
        <nav className="settings-nav">
          <button
            className={'nav-item' + (active === 'general' ? ' active' : '')}
            onClick={() => setActive('general')}
          >
            通用
          </button>
          {services.map((s) => (
            <button
              key={s.id}
              className={'nav-item' + (active === s.id ? ' active' : '')}
              onClick={() => setActive(s.id)}
            >
              <span className="dot" style={{ background: s.color }} /> {s.name}
            </button>
          ))}
        </nav>

        <div className="settings-content">
          {active === 'general' && (
            <section className="flat-section">
              <h3>通用</h3>
              <div className="row">
                <label>代理地址</label>
                <input
                  className="url-input"
                  placeholder="留空跟随 Windows 系统代理，如 http://127.0.0.1:7890"
                  value={proxyDraft}
                  onChange={(e) => setProxyDraft(e.target.value)}
                  onBlur={() => {
                    const v = proxyDraft.trim()
                    if (v !== (settings.proxy ?? '')) {
                      setProxyDraft(v)
                      void window.wu.updateSettings({ proxy: v })
                    }
                  }}
                />
              </div>
              <div className="row">
                <label>后台页面闲置后自动释放（省内存，重进自动重载、登录不丢）</label>
                <input
                  type="checkbox"
                  checked={settings.unloadBackground}
                  onChange={(e) => window.wu.updateSettings({ unloadBackground: e.target.checked })}
                />
              </div>
              <div className="row">
                <label>后台页面释放的闲置时间（分钟，1~1440）</label>
                <input
                  className="url-input minutes-input"
                  type="number"
                  min={1}
                  max={1440}
                  value={minutesDraft}
                  onChange={(e) => setMinutesDraft(e.target.value)}
                  onBlur={() => {
                    const n = Math.max(1, Math.min(1440, Math.floor(Number(minutesDraft) || 15)))
                    setMinutesDraft(String(n))
                    if (n !== settings.unloadMinutes) {
                      void window.wu.updateSettings({ unloadMinutes: n })
                    }
                  }}
                />
              </div>
              <div className="shortcut-tip">
                快捷键：Ctrl+1~5 按侧边栏顺序切换服务 · 侧边栏图标可按住拖动排序
              </div>
            </section>
          )}

          {svc && (
            <section className="flat-section">
              <h3>
                <span className="dot" style={{ background: svc.color }} /> {svc.name}
              </h3>
              <div className="row">
                <label>网址</label>
                <input
                  className="url-input"
                  value={urlDrafts[svc.id] ?? ''}
                  onChange={(e) => setUrlDrafts({ ...urlDrafts, [svc.id]: e.target.value })}
                  onBlur={() => saveUrl(svc.id)}
                />
              </div>
              <div className="row">
                <label>屏蔽推广浮层（下载提示等）</label>
                <input
                  type="checkbox"
                  checked={settings.cleanupEnabled[`${svc.id}-promo`] !== false}
                  onChange={(e) =>
                    window.wu.updateSettings({
                      cleanupEnabled: {
                        ...settings.cleanupEnabled,
                        [`${svc.id}-promo`]: e.target.checked
                      }
                    })
                  }
                />
              </div>
              <div className="row col">
                <label>自定义 CSS（隐藏任何碍眼的东西，改完点保存）</label>
                <textarea
                  className="css-input"
                  placeholder={'例如：\n.some-banner { display: none !important; }'}
                  value={cssDrafts[svc.id] ?? ''}
                  onChange={(e) => setCssDrafts({ ...cssDrafts, [svc.id]: e.target.value })}
                  rows={4}
                />
                <button onClick={() => saveCss(svc.id)}>保存自定义 CSS</button>
              </div>
              <div className="row col">
                <label>
                  导入登录 Cookie（Google 登录被 Google 拦截时的替代方案：在系统
                  Chrome 里登录 {svc.name} → F12 → 网络/应用里复制 Cookie 值，粘贴到此处导入）
                </label>
                <textarea
                  className="css-input"
                  placeholder={'每行一条，或整段粘贴，例如：\n__Secure-next-auth.session-token=eyJhbGci...'}
                  value={cookieDrafts[svc.id] ?? ''}
                  onChange={(e) => setCookieDrafts({ ...cookieDrafts, [svc.id]: e.target.value })}
                  rows={3}
                />
                <button
                  onClick={async () => {
                    const text = cookieDrafts[svc.id] ?? ''
                    if (!text.trim()) return
                    const res = await window.wu.importCookies(svc.id, text)
                    setCookieMsg({
                      ...cookieMsg,
                      [svc.id]: `导入 ${res.imported} 条${res.failed ? `，失败 ${res.failed} 条` : ''}，页面已重载`
                    })
                  }}
                >
                  导入 Cookie 并重载
                </button>
                {cookieMsg[svc.id] && <div className="shortcut-tip">{cookieMsg[svc.id]}</div>}
              </div>
              {svc.browserLogin && (
                <div className="row col">
                  <label>
                    Google 登录被拦截？走系统浏览器：点“启动”会打开一个专用浏览器窗口，在里面用
                    Google 账号登录（真浏览器不会被拦截），完成后点“导入”把登录态收回到应用。
                  </label>
                  <div className="row">
                    <button
                      onClick={async () => {
                        const res = await window.wu.browserLogin(svc.id)
                        setBrowserMsg({ ...browserMsg, [svc.id]: res.message })
                      }}
                    >
                      启动系统浏览器登录
                    </button>
                    <button
                      onClick={async () => {
                        setBrowserMsg({ ...browserMsg, [svc.id]: '正在从浏览器收割登录状态…' })
                        const res = await window.wu.importBrowserSession(svc.id)
                        setBrowserMsg({ ...browserMsg, [svc.id]: res.message })
                      }}
                    >
                      我已登录完成，导入会话
                    </button>
                  </div>
                  {browserMsg[svc.id] && <div className="shortcut-tip">{browserMsg[svc.id]}</div>}
                </div>
              )}
              <div className="row">
                <button className="danger" onClick={() => void clearSession(svc.id)}>
                  清除 {svc.name} 登录数据
                </button>
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  )
}
