import { useEffect, useRef, useState } from 'react'
import type { Note } from '../../shared/types'

interface Props {
  onClose: () => void
}

function noteTitle(content: string): string {
  const first = content.split('\n').map((l) => l.trim()).find(Boolean)
  return first ? first.slice(0, 24) : '无标题'
}

function fmtTime(ts: number): string {
  const d = new Date(ts)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

export default function NotesPanel({ onClose }: Props) {
  const [notes, setNotes] = useState<Note[]>([])
  const [activeId, setActiveId] = useState<string>('')
  const [content, setContent] = useState('')
  const [keyword, setKeyword] = useState('')
  const [saved, setSaved] = useState('')
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    void window.wu.notesList().then((list) => {
      setNotes(list)
      if (list.length) {
        setActiveId(list[0].id)
        setContent(list[0].content)
      }
    })
  }, [])

  const filtered = notes.filter((n) =>
    keyword.trim() ? n.content.toLowerCase().includes(keyword.trim().toLowerCase()) : true
  )
  const active = notes.find((n) => n.id === activeId)

  function selectNote(n: Note) {
    flushSave()
    setActiveId(n.id)
    setContent(n.content)
  }

  function newNote() {
    flushSave()
    void window.wu.notesSave({ id: '', content: '' }).then((n) => {
      setNotes((prev) => [n, ...prev])
      setActiveId(n.id)
      setContent('')
    })
  }

  function deleteNote(id: string) {
    if (!window.confirm('删除这条笔记？')) return
    flushSave()
    void window.wu.notesDelete(id).then(() => {
      setNotes((prev) => prev.filter((n) => n.id !== id))
      if (activeId === id) {
        setActiveId('')
        setContent('')
      }
    })
  }

  /** 防抖自动保存：停止输入 0.8 秒后落盘 */
  function scheduleSave(next: string, id: string) {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      void window.wu.notesSave({ id, content: next }).then((n) => {
        setNotes((prev) => prev.map((x) => (x.id === n.id ? n : x)))
        setSaved('已保存 ' + fmtTime(n.updatedAt).slice(-5))
        setTimeout(() => setSaved(''), 2000)
      })
    }, 800)
  }

  function flushSave() {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    if (activeId && content !== (notes.find((n) => n.id === activeId)?.content ?? '')) {
      void window.wu.notesSave({ id: activeId, content })
    }
  }

  return (
    <div className="notes-page">
      <div className="notes-title-bar">
        <h2>笔记</h2>
        <span className="panel-sub">{saved}</span>
        <button className="close-btn" onClick={() => { flushSave(); onClose() }}>
          ✕
        </button>
      </div>
      <div className="notes-layout">
        <aside className="notes-side">
          <div className="notes-side-actions">
            <input
              className="notes-search"
              placeholder="搜索"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
            />
            <button className="notes-new" title="新建笔记" onClick={newNote}>
              ＋
            </button>
          </div>
          <div className="notes-list">
            {filtered.length === 0 && <div className="empty-tip">还没有笔记，点右上角 ＋ 新建</div>}
            {filtered.map((n) => (
              <button
                key={n.id}
                className={'note-item' + (n.id === activeId ? ' active' : '')}
                onClick={() => selectNote(n)}
              >
                <span className="note-item-title">{noteTitle(n.content)}</span>
                <span className="note-item-time">{fmtTime(n.updatedAt)}</span>
              </button>
            ))}
          </div>
        </aside>
        <main className="notes-editor">
          {active ? (
            <>
              <div className="notes-editor-head">
                <span className="notes-editor-title">{noteTitle(content)}</span>
                {active && (
                  <button className="danger" onClick={() => deleteNote(active.id)}>
                    删除
                  </button>
                )}
              </div>
              <textarea
                value={content}
                onChange={(e) => {
                  setContent(e.target.value)
                  if (active) scheduleSave(e.target.value, active.id)
                }}
                placeholder="随手记下与 AI 交互的记录…（自动保存）"
              />
            </>
          ) : (
            <div className="empty-tip" style={{ padding: 40 }}>
              选择或新建一条笔记
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
