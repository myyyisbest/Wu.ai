import { useEffect, useState } from 'react'
import type { AppStatePayload, VaultEntryMeta, VaultSaveInput } from '../../shared/types'

interface Props {
  state: AppStatePayload
  onClose: () => void
}

interface FormState {
  id?: string
  serviceId: string
  account: string
  password: string
  notes: string
}

function emptyForm(serviceId: string): FormState {
  return { serviceId, account: '', password: '', notes: '' }
}

export default function VaultPanel({ state, onClose }: Props) {
  const [entries, setEntries] = useState<VaultEntryMeta[]>([])
  const [form, setForm] = useState<FormState>(emptyForm(state.services[0]?.id ?? ''))
  const [revealed, setRevealed] = useState<Record<string, string>>({})
  const [error, setError] = useState('')

  useEffect(() => {
    void refresh()
  }, [])

  async function refresh() {
    setEntries(await window.wu.vaultList())
  }

  async function save() {
    setError('')
    if (!form.account.trim()) {
      setError('请填写账号（手机号/邮箱/用户名）')
      return
    }
    const input: VaultSaveInput = {
      id: form.id,
      serviceId: form.serviceId,
      account: form.account.trim(),
      notes: form.notes,
      // 编辑时留空 = 保留原密码；新条目留空 = 不存密码
      password: form.password.length > 0 ? form.password : undefined
    }
    try {
      await window.wu.vaultSave(input)
      setForm(emptyForm(state.services[0]?.id ?? ''))
      await refresh()
    } catch (e) {
      setError(String(e).replace(/^.*Error: /, ''))
    }
  }

  async function toggleReveal(entry: VaultEntryMeta) {
    if (revealed[entry.id] !== undefined) {
      const next = { ...revealed }
      delete next[entry.id]
      setRevealed(next)
      return
    }
    const pwd = await window.wu.vaultReveal(entry.id)
    setRevealed({ ...revealed, [entry.id]: pwd })
  }

  async function remove(entry: VaultEntryMeta) {
    if (!window.confirm(`删除 ${serviceName(entry.serviceId)}（${entry.account}）的这条凭据？`)) return
    await window.wu.vaultRemove(entry.id)
    await refresh()
  }

  function serviceName(id: string): string {
    return state.services.find((s) => s.id === id)?.name ?? id
  }

  return (
    <div className="overlay" onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      <div className="panel vault-panel">
        <div className="panel-head">
          <h2>密码本</h2>
          <span className="panel-sub">密码用系统级加密（Windows DPAPI）保存在本机，仅在你点“显示/复制”时解密</span>
          <button className="close-btn" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="vault-form">
          <select
            value={form.serviceId}
            onChange={(e) => setForm({ ...form, serviceId: e.target.value })}
          >
            {state.services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <input
            placeholder="账号（手机号/邮箱）"
            value={form.account}
            onChange={(e) => setForm({ ...form, account: e.target.value })}
          />
          <input
            type="password"
            placeholder={form.id ? '密码（留空则保留原密码）' : '密码（可留空）'}
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
          <input
            placeholder="备注（选填）"
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
          <button className="primary" onClick={() => void save()}>
            {form.id ? '保存修改' : '添加'}
          </button>
          {form.id && (
            <button onClick={() => setForm(emptyForm(state.services[0]?.id ?? ''))}>取消编辑</button>
          )}
        </div>
        {error && <div className="form-error">{error}</div>}

        <div className="vault-list">
          {entries.length === 0 && (
            <div className="empty-tip">
              还没有保存过凭据。登录各家后如果担心忘记密码，把账号密码存到这里——会话过期时打开密码本复制登录即可。
            </div>
          )}
          {entries.map((entry) => (
            <div className="vault-row" key={entry.id}>
              <span className="svc-name">{serviceName(entry.serviceId)}</span>
              <span className="acct">{entry.account}</span>
              <span className="pwd">
                {entry.hasPassword
                  ? revealed[entry.id] !== undefined
                    ? revealed[entry.id]
                    : '••••••••'
                  : '未存密码'}
              </span>
              <span className="row-actions">
                {entry.hasPassword && (
                  <>
                    <button onClick={() => void toggleReveal(entry)}>
                      {revealed[entry.id] !== undefined ? '隐藏' : '显示'}
                    </button>
                    <button onClick={() => void window.wu.vaultCopy(entry.id, 'password')}>
                      复制密码
                    </button>
                  </>
                )}
                <button onClick={() => void window.wu.vaultCopy(entry.id, 'account')}>
                  复制账号
                </button>
                <button
                  onClick={() =>
                    setForm({
                      id: entry.id,
                      serviceId: entry.serviceId,
                      account: entry.account,
                      password: '',
                      notes: entry.notes
                    })
                  }
                >
                  编辑
                </button>
                <button className="danger" onClick={() => void remove(entry)}>
                  删除
                </button>
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
