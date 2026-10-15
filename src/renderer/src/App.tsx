import { useEffect, useState } from 'react'
import type { AppStatePayload } from '../../shared/types'
import Sidebar from './Sidebar'
import VaultPanel from './VaultPanel'
import NotesPanel from './NotesPanel'
import SettingsPanel from './SettingsPanel'

type OverlayKind = 'vault' | 'notes' | 'settings' | null

const SIDEBAR_WIDTH = 60

export default function App() {
  const [state, setState] = useState<AppStatePayload | null>(null)
  const [overlay, setOverlay] = useState<OverlayKind>(null)

  useEffect(() => {
    void window.wu.getState().then(setState)
    return window.wu.onState(setState)
  }, [])

  useEffect(() => {
    window.wu.setOverlay(overlay !== null)
  }, [overlay])

  useEffect(() => {
    window.wu.setInsets({ left: SIDEBAR_WIDTH, top: 0, right: 0, bottom: 0 })
  }, [])

  if (!state) {
    return <div className="boot">启动中…</div>
  }

  return (
    <div className={'app' + (state.settings.theme === 'light' ? ' light' : '')}>
      <Sidebar
        state={state}
        overlay={overlay}
        onSelect={(id) => window.wu.select(id)}
        onOpenVault={() => setOverlay('vault')}
        onOpenNotes={() => setOverlay('notes')}
        onOpenSettings={() => setOverlay('settings')}
        onToggleTheme={() =>
          window.wu.updateSettings({ theme: state.settings.theme === 'light' ? 'dark' : 'light' })
        }
      />
      <div className="main">
        <div className="stage" />
      </div>
      {overlay === 'vault' && (
        <VaultPanel state={state} onClose={() => setOverlay(null)} />
      )}
      {overlay === 'notes' && <NotesPanel onClose={() => setOverlay(null)} />}
      {overlay === 'settings' && (
        <SettingsPanel state={state} onClose={() => setOverlay(null)} />
      )}
    </div>
  )
}
