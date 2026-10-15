import { useState } from 'react'
import type { AppStatePayload } from '../../shared/types'
import chatgptIcon from './assets/chatgpt.svg'
import deepseekIcon from './assets/deepseek.ico'
import doubaoIcon from './assets/doubao.png'
import grokIcon from './assets/grok.svg'
import qwenIcon from './assets/qwen.png'

interface IconSpec {
  src: string
  /** 白底图标：夜间反色成黑底白标 */
  invertInDark?: boolean
  /** 原始图片自带留白：视觉放大补偿 */
  enlarge?: boolean
}

const ICONS: Record<string, IconSpec> = {
  deepseek: { src: deepseekIcon, enlarge: true },
  doubao: { src: doubaoIcon },
  qwen: { src: qwenIcon, enlarge: true },
  chatgpt: { src: chatgptIcon, invertInDark: true },
  grok: { src: grokIcon, invertInDark: true }
}

interface Props {
  state: AppStatePayload
  overlay: 'vault' | 'notes' | 'settings' | null
  onSelect: (id: string) => void
  onOpenVault: () => void
  onOpenNotes: () => void
  onOpenSettings: () => void
  onToggleTheme: () => void
}

function serviceMark(id: string, name: string): string {
  return name.charAt(0)
}

export default function Sidebar({
  state,
  overlay,
  onSelect,
  onOpenVault,
  onOpenNotes,
  onOpenSettings,
  onToggleTheme
}: Props) {
  const { services, settings, statuses } = state
  const light = settings.theme === 'light'
  const [dragId, setDragId] = useState<string | null>(null)

  function reorder(targetId: string) {
    if (!dragId || dragId === targetId) return
    const ids = services.map((s) => s.id)
    const from = ids.indexOf(dragId)
    const to = ids.indexOf(targetId)
    if (from < 0 || to < 0) return
    ids.splice(to, 0, ids.splice(from, 1)[0])
    window.wu.updateSettings({ order: ids })
    setDragId(null)
  }

  return (
    <div className="sidebar">
      <div className="svc-list">
        {services.map((svc) => {
          const status = statuses[svc.id] ?? 'idle'
          const icon = ICONS[svc.id]
          const iconClass =
            'svc-icon' +
            (icon?.invertInDark && !light ? ' invert-in-dark' : '') +
            (icon?.enlarge ? ' enlarge' : '')
          return (
            <button
              key={svc.id}
              className={'svc-btn' + (settings.selected === svc.id ? ' active' : '')}
              title={svc.name + '（Ctrl+' + (services.indexOf(svc) + 1) + '，按住可拖动排序）'}
              onClick={() => onSelect(svc.id)}
              draggable={true}
              onDragStart={() => setDragId(svc.id)}
              onDragEnd={() => setDragId(null)}
              onDragOver={(e) => {
                if (dragId && dragId !== svc.id) e.preventDefault()
              }}
              onDrop={(e) => {
                e.preventDefault()
                reorder(svc.id)
              }}
            >
              {icon ? (
                <img className={iconClass} src={icon.src} alt={svc.name} draggable={false} />
              ) : (
                <span className="svc-mark" style={{ background: svc.color }}>
                  {serviceMark(svc.id, svc.name)}
                </span>
              )}
              <span className={'status-dot ' + status} />
            </button>
          )
        })}
      </div>

      <div className="sidebar-bottom">
        <button
          className={'icon-btn' + (overlay === 'notes' ? ' active' : '')}
          title="笔记"
          onClick={onOpenNotes}
        >
          {/* 便签纸（右下折角），与钥匙/滑杆/日月区分 */}
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
            <path d="M4 4h16v10l-6 6H4z" />
            <path d="M14 20v-6h6" />
            <path d="M8 9h8M8 13h5" strokeLinecap="round" />
          </svg>
        </button>
        <button className="theme-btn" title={light ? '夜间模式（全局）' : '日间模式（全局）'} onClick={onToggleTheme}>
          {light ? (
            // 月亮（靛蓝填充）：当前日间，点击切夜间
            <svg width="20" height="20" viewBox="0 0 24 24">
              <path
                d="M20.5 14.2A8.5 8.5 0 0 1 9.8 3.5 8.5 8.5 0 1 0 20.5 14.2z"
                fill="#6366f1"
              />
            </svg>
          ) : (
            // 太阳（琥珀填充 + 光线）：当前夜间，点击切日间
            <svg width="20" height="20" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="4.4" fill="#fbbf24" />
              <g stroke="#fbbf24" strokeWidth="1.8" strokeLinecap="round">
                <path d="M12 3v2.2M12 18.8V21M3 12h2.2M18.8 12H21M5.6 5.6l1.6 1.6m9.6 9.6 1.6 1.6M5.6 18.4l1.6-1.6M16.8 7.2l1.6-1.6" />
              </g>
            </svg>
          )}
        </button>
        <button
          className={'icon-btn' + (overlay === 'vault' ? ' active' : '')}
          title="密码本"
          onClick={onOpenVault}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <circle cx="8" cy="15" r="4" />
            <path d="M10.8 12.2 20 3m-3 3 3 3m-5.5 0.5 2.5 2.5" />
          </svg>
        </button>
        <button
          className={'icon-btn' + (overlay === 'settings' ? ' active' : '')}
          title="设置"
          onClick={onOpenSettings}
        >
          {/* 滑杆样式，与钥匙/日月明显区分 */}
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <path d="M3.5 7h17M3.5 12h17M3.5 17h17" />
            <circle cx="9" cy="7" r="2.1" fill="currentColor" stroke="none" />
            <circle cx="15" cy="12" r="2.1" fill="currentColor" stroke="none" />
            <circle cx="7.5" cy="17" r="2.1" fill="currentColor" stroke="none" />
          </svg>
        </button>
      </div>
    </div>
  )
}
