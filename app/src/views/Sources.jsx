import { useEffect, useState } from 'react'
import { api } from '../api'

const TYPE_COLOR = {
  web: '#60a5fa', document: '#f87171', tool: '#a89fff',
  service: '#4ade80', contact: '#f472b6', other: '#9595b8',
}
const TYPES = ['web', 'document', 'tool', 'service', 'contact', 'other']

function fmtDate(iso) {
  if (!iso) return ''
  try {
    const d = new Date(iso.replace('T', ' ').slice(0, 10))
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  } catch {
    return iso.slice(0, 10)
  }
}

function SourceModal({ initial, onClose, onSave }) {
  const blank = { title: '', url: '', source_type: 'web', description: '', used_by: '', used_for: '' }
  const [form, setForm] = useState(initial || blank)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const isEdit = !!initial?.id

  const handleSubmit = () => {
    if (form.title) onSave(form)
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey && e.target.tagName !== 'TEXTAREA') {
      e.preventDefault()
      handleSubmit()
    }
    if (e.key === 'Escape') onClose()
  }

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={modalStyle} onClick={e => e.stopPropagation()} onKeyDown={handleKeyDown}>
        <h3 style={{ fontSize: 16, fontWeight: 600, color: '#e8e8f8', margin: '0 0 20px' }}>
          {isEdit ? 'Edit Source' : 'Log Source'}
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input autoFocus placeholder="Title *" value={form.title} onChange={e => set('title', e.target.value)} style={fieldStyle} />
          <input placeholder="URL" value={form.url} onChange={e => set('url', e.target.value)} style={fieldStyle} />
          <select value={form.source_type} onChange={e => set('source_type', e.target.value)} style={fieldStyle}>
            {TYPES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
          </select>
          <textarea placeholder="Why was this useful?" value={form.description} onChange={e => set('description', e.target.value)} style={{ ...fieldStyle, height: 70, resize: 'vertical' }} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <input placeholder="Used by (team member)" value={form.used_by} onChange={e => set('used_by', e.target.value)} style={fieldStyle} />
            <input placeholder="Used for (task/context)" value={form.used_for} onChange={e => set('used_for', e.target.value)} style={fieldStyle} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={cancelBtnStyle}>Cancel</button>
          <button onClick={handleSubmit} style={saveBtnStyle}>
            {isEdit ? 'Save Changes' : 'Log Source'}
          </button>
        </div>
      </div>
    </div>
  )
}

function ConfirmDelete({ label, onCancel, onConfirm }) {
  return (
    <div style={overlayStyle} onClick={onCancel}>
      <div style={{ ...modalStyle, width: 360, textAlign: 'center' }} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 22, marginBottom: 12, color: '#f87171' }}>⚠</div>
        <div style={{ fontSize: 15, fontWeight: 600, color: '#e8e8f8', marginBottom: 6 }}>Delete Source?</div>
        <div style={{ fontSize: 13, color: '#9595b8', marginBottom: 24 }}>"{label}" will be permanently removed.</div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
          <button onClick={onCancel} style={cancelBtnStyle}>Cancel</button>
          <button onClick={onConfirm} style={{ ...saveBtnStyle, background: '#f87171' }}>Delete</button>
        </div>
      </div>
    </div>
  )
}

export default function Sources() {
  const [sources,  setSources]  = useState([])
  const [filter,   setFilter]   = useState('')
  const [adding,   setAdding]   = useState(false)
  const [editing,  setEditing]  = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [loading,  setLoading]  = useState(true)

  const load = () => {
    setLoading(true)
    const params = filter ? { source_type: filter } : {}
    api.sources(params).then(setSources).finally(() => setLoading(false))
  }

  useEffect(load, [filter])

  const handleSave = async (form) => {
    await api.createSource(form)
    setAdding(false)
    load()
  }

  const handleEdit = async (form) => {
    await api.updateSource(editing.id, form)
    setEditing(null)
    load()
  }

  const handleDeleteConfirm = async () => {
    await api.deleteSource(deleting.id)
    setDeleting(null)
    load()
  }

  return (
    <div style={{ padding: '32px 40px' }}>
      {adding   && <SourceModal onClose={() => setAdding(false)} onSave={handleSave} />}
      {editing  && <SourceModal initial={editing} onClose={() => setEditing(null)} onSave={handleEdit} />}
      {deleting && <ConfirmDelete label={deleting.title} onCancel={() => setDeleting(null)} onConfirm={handleDeleteConfirm} />}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0, background: 'linear-gradient(135deg, #ffffff 0%, rgba(255,255,255,0.75) 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>Sources</h1>
          <p style={{ color: '#9595b8', marginTop: 6, fontSize: 14 }}>Reference library — {sources.length} logged</p>
        </div>
        <button
          onClick={() => setAdding(true)}
          style={saveBtnStyle}
          onMouseEnter={e => { e.currentTarget.style.background = 'linear-gradient(135deg, rgba(148,130,255,0.90) 0%, rgba(120,123,255,0.80) 100%)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'linear-gradient(135deg, rgba(124,106,247,0.80) 0%, rgba(99,102,241,0.70) 100%)' }}
        >+ Log Source</button>
      </div>

      {/* Type filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {['', ...TYPES].map(t => (
          <button key={t} onClick={() => setFilter(t)} style={{
            background: filter === t ? `${TYPE_COLOR[t] || '#7c6af7'}22` : 'transparent',
            border: `1px solid ${filter === t ? (TYPE_COLOR[t] || '#7c6af7') : 'rgba(255,255,255,0.10)'}`,
            borderRadius: 6, color: filter === t ? (TYPE_COLOR[t] || '#a89fff') : '#9595b8',
            padding: '5px 12px', fontSize: 12, cursor: 'pointer', transition: 'all 0.12s',
          }}>
            {t ? t.charAt(0).toUpperCase() + t.slice(1) : 'All'}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ color: '#9595b8', fontSize: 14, padding: '20px 0' }}>Loading…</div>
      ) : sources.length === 0 ? (
        <div style={{
          background: 'rgba(255,255,255,0.03)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 10, padding: '40px 20px', textAlign: 'center',
        }}>
          <div style={{ fontSize: 20, color: '#2c2c3a', marginBottom: 10 }}>◎</div>
          <div style={{ color: '#56567a', fontSize: 14, marginBottom: 16 }}>No sources logged yet.</div>
          <button onClick={() => setAdding(true)} style={{ ...saveBtnStyle, fontSize: 12, padding: '7px 16px' }}>
            + Log your first source
          </button>
        </div>
      ) : (
        sources.map(s => (
          <div key={s.id} style={{
            background: 'rgba(255,255,255,0.04)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10,
            padding: '16px 20px', marginBottom: 10,
            borderLeft: `3px solid ${TYPE_COLOR[s.source_type] || '#9595b8'}`,
            display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: '#e8e8f8' }}>{s.title}</span>
                <span style={{
                  fontSize: 10, fontWeight: 700, color: TYPE_COLOR[s.source_type],
                  background: `${TYPE_COLOR[s.source_type]}22`,
                  border: `1px solid ${TYPE_COLOR[s.source_type]}44`,
                  padding: '1px 6px', borderRadius: 4,
                  letterSpacing: '0.05em', textTransform: 'uppercase',
                }}>{s.source_type}</span>
              </div>
              {s.url && (
                <a
                  href={s.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ fontSize: 12, color: '#7c6af7', marginTop: 4, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: 'underline' }}
                >
                  {s.url}
                </a>
              )}
              {s.description && <div style={{ fontSize: 12, color: '#9595b8', marginTop: 4 }}>{s.description}</div>}
              <div style={{ fontSize: 11, color: '#56567a', marginTop: 6 }}>
                {s.used_by && <span style={{ marginRight: 12 }}>by {s.used_by}</span>}
                {s.used_for && <span>for: {s.used_for}</span>}
                {s.accessed_at && <span style={{ marginLeft: 12 }}>{fmtDate(s.accessed_at)}</span>}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginLeft: 12, flexShrink: 0 }}>
              <button
                onClick={() => setEditing(s)}
                style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, color: 'rgba(255,255,255,0.45)', cursor: 'pointer', fontSize: 12, padding: '4px 8px', transition: 'border-color 0.12s, color 0.12s' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.25)'; e.currentTarget.style.color = '#e8e8f8' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)'; e.currentTarget.style.color = 'rgba(255,255,255,0.45)' }}
              >
                Edit
              </button>
              <button
                onClick={() => setDeleting(s)}
                style={{ background: 'transparent', border: 'none', color: '#56567a', cursor: 'pointer', fontSize: 18, lineHeight: 1, transition: 'color 0.12s' }}
                onMouseEnter={e => { e.currentTarget.style.color = '#f87171' }}
                onMouseLeave={e => { e.currentTarget.style.color = '#56567a' }}
              >×</button>
            </div>
          </div>
        ))
      )}
    </div>
  )
}

const overlayStyle   = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }
const modalStyle     = { background: 'rgba(255,255,255,0.07)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 14, padding: 28, width: 460, maxWidth: '90vw', boxShadow: '0 8px 40px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.10)' }
const fieldStyle     = { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 8, color: '#e8e8f8', padding: '9px 12px', fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box', transition: 'border-color 0.12s' }
const saveBtnStyle   = { background: 'linear-gradient(135deg, rgba(124,106,247,0.80) 0%, rgba(99,102,241,0.70) 100%)', border: '1px solid rgba(124,106,247,0.60)', borderRadius: 8, color: '#fff', padding: '9px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer', transition: 'background 0.15s', boxShadow: '0 4px 16px rgba(124,106,247,0.25), inset 0 1px 0 rgba(255,255,255,0.15)' }
const cancelBtnStyle = { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, color: 'rgba(255,255,255,0.55)', padding: '9px 18px', fontSize: 13, cursor: 'pointer', transition: 'border-color 0.12s, color 0.12s' }
