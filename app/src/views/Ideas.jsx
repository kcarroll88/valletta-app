import { useEffect, useState } from 'react'
import { api } from '../api'

const CATEGORIES = ['Song Idea', 'Marketing', 'Show', 'Visual', 'Other']

const CATEGORY_COLOR = {
  'Song Idea': '#a89fff',
  'Marketing': '#60a5fa',
  'Show':      '#4ade80',
  'Visual':    '#fbbf24',
  'Other':     '#9595b8',
}

function fmtDate(iso) {
  if (!iso) return ''
  try {
    const d = new Date(iso)
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  } catch {
    return iso.slice(0, 10)
  }
}

function NewIdeaModal({ onClose, onSave }) {
  const [form, setForm] = useState({ title: '', category: 'Song Idea', description: '' })
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSubmit = () => {
    if (!form.title.trim()) return
    onSave(form)
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
        <h3 style={{ fontSize: 16, fontWeight: 600, color: 'rgba(255,255,255,0.88)', margin: '0 0 20px' }}>New Idea</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input
            autoFocus
            placeholder="Title *"
            value={form.title}
            onChange={e => set('title', e.target.value)}
            style={fieldStyle}
          />
          <select value={form.category} onChange={e => set('category', e.target.value)} style={fieldStyle}>
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <textarea
            placeholder="Description (optional)"
            value={form.description}
            onChange={e => set('description', e.target.value)}
            style={{ ...fieldStyle, height: 90, resize: 'vertical' }}
          />
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={cancelBtnStyle}>Cancel</button>
          <button onClick={handleSubmit} style={saveBtnStyle}>Add Idea</button>
        </div>
      </div>
    </div>
  )
}

const STATUS_OPTIONS = ['inbox', 'active', 'backlog', 'done', 'dismissed', 'open', 'archived']

function EditIdeaModal({ idea, onClose, onSave, onDelete }) {
  const [form, setForm] = useState({
    title:       idea.title       || '',
    description: idea.description || '',
    status:      idea.status      || 'open',
    category:    idea.category    || '',
  })
  const [saving,   setSaving]   = useState(false)
  const [deleting, setDeleting] = useState(false)

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSave = async () => {
    if (!form.title.trim()) return
    setSaving(true)
    try {
      await onSave(idea.id, form)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!window.confirm('Delete this idea? This cannot be undone.')) return
    setDeleting(true)
    try {
      await onDelete(idea.id)
      onClose()
    } finally {
      setDeleting(false)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') onClose()
  }

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div
        style={{ ...modalStyle, width: 480 }}
        onClick={e => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <h3 style={{ fontSize: 16, fontWeight: 600, color: 'rgba(255,255,255,0.88)', margin: '0 0 20px' }}>Edit Idea</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input
            autoFocus
            placeholder="Title *"
            value={form.title}
            onChange={e => set('title', e.target.value)}
            style={fieldStyle}
          />
          <textarea
            placeholder="Notes / description"
            value={form.description}
            onChange={e => set('description', e.target.value)}
            rows={4}
            style={{ ...fieldStyle, height: 'auto', resize: 'vertical', lineHeight: 1.5 }}
          />
          <div style={{ display: 'flex', gap: 10 }}>
            <select
              value={form.status}
              onChange={e => set('status', e.target.value)}
              style={{ ...fieldStyle, flex: 1 }}
            >
              {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <input
              placeholder="Category (e.g. songwriting)"
              value={form.category}
              onChange={e => set('category', e.target.value)}
              style={{ ...fieldStyle, flex: 1 }}
            />
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 24 }}>
          <button
            onClick={handleDelete}
            disabled={deleting}
            style={{
              background: 'transparent',
              border: '1px solid #f8717155',
              borderRadius: 8,
              color: deleting ? 'rgba(255,255,255,0.25)' : '#f87171',
              padding: '8px 14px',
              fontSize: 13,
              cursor: deleting ? 'default' : 'pointer',
              transition: 'border-color 0.12s, color 0.12s',
            }}
            onMouseEnter={e => { if (!deleting) e.currentTarget.style.borderColor = '#f87171' }}
            onMouseLeave={e => { if (!deleting) e.currentTarget.style.borderColor = '#f8717155' }}
          >
            {deleting ? 'Deleting…' : 'Delete'}
          </button>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={onClose} style={cancelBtnStyle}>Cancel</button>
            <button
              onClick={handleSave}
              disabled={saving}
              style={{ ...saveBtnStyle, opacity: saving ? 0.7 : 1 }}
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function IdeaCard({ idea, onArchive, onRestore, onPromote, onMoveToBacklog, onDismiss, onCardClick }) {
  const [promoted, setPromoted] = useState(false)
  const catColor   = CATEGORY_COLOR[idea.category] || '#9595b8'
  const isArchived = idea.status === 'archived'
  const isInbox    = idea.status === 'inbox'
  const hasTask    = !!idea.task_id

  const handlePromote = async (e) => {
    e.stopPropagation()
    await onPromote(idea.id)
    setPromoted(true)
    setTimeout(() => setPromoted(false), 2000)
  }

  return (
    <div style={{
      background: 'rgba(255,255,255,0.04)',
      backdropFilter: 'blur(12px)',
      WebkitBackdropFilter: 'blur(12px)',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 12,
      boxShadow: '0 4px 24px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.06)',
      padding: '18px 20px',
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
      opacity: isArchived ? 0.7 : 1,
      transition: 'box-shadow 150ms ease, background 150ms ease, opacity 0.2s',
      position: 'relative',
      cursor: 'pointer',
    }}
      onClick={() => onCardClick && onCardClick(idea)}
      onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.10), 0 0 0 1px rgba(255,255,255,0.12)'; e.currentTarget.style.background = 'rgba(255,255,255,0.06)' }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 4px 24px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.06)'; e.currentTarget.style.background = 'rgba(255,255,255,0.04)' }}
    >
      {/* Category badge */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'space-between' }}>
        <span style={{
          background: `${catColor}22`,
          border: `1px solid ${catColor}55`,
          borderRadius: 5,
          color: catColor,
          fontSize: 10,
          fontWeight: 700,
          padding: '2px 8px',
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
        }}>
          {idea.category}
        </span>
        {hasTask && (
          <span style={{
            background: '#4ade8022',
            border: '1px solid #4ade8055',
            borderRadius: 5,
            color: '#4ade80',
            fontSize: 10,
            fontWeight: 700,
            padding: '2px 8px',
            letterSpacing: '0.05em',
          }}>
            → Task
          </span>
        )}
      </div>

      {/* Title */}
      <div style={{ fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,0.88)', lineHeight: 1.3 }}>
        {idea.title}
      </div>

      {/* Description preview */}
      {idea.description && (
        <div style={{
          fontSize: 12,
          color: 'rgba(255,255,255,0.45)',
          lineHeight: 1.5,
          overflow: 'hidden',
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
        }}>
          {idea.description}
        </div>
      )}

      {/* Footer: date + actions */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4, gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.40)' }}>
            {fmtDate(idea.created_at)}
          </span>
          {isInbox && idea.source_channel && (
            <span style={{
              fontSize: 10, fontWeight: 600, color: '#f472b6',
              background: 'rgba(244,114,182,0.1)', border: '1px solid rgba(244,114,182,0.25)',
              borderRadius: 4, padding: '1px 6px',
            }}>
              #{idea.source_channel}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {isInbox ? (
            <>
              <button
                onClick={(e) => { e.stopPropagation(); onMoveToBacklog && onMoveToBacklog(idea.id) }}
                style={{
                  background: 'transparent',
                  border: '1px solid rgba(255,255,255,0.10)',
                  borderRadius: 6,
                  color: 'rgba(255,255,255,0.45)',
                  fontSize: 11,
                  padding: '4px 10px',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = '#7c6af7'; e.currentTarget.style.color = '#a89fff' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.10)'; e.currentTarget.style.color = 'rgba(255,255,255,0.45)' }}
              >
                Move to Backlog
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onDismiss && onDismiss(idea.id) }}
                style={{
                  background: 'transparent',
                  border: '1px solid rgba(255,255,255,0.10)',
                  borderRadius: 6,
                  color: 'rgba(255,255,255,0.40)',
                  fontSize: 11,
                  padding: '4px 10px',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.22)'; e.currentTarget.style.color = 'rgba(255,255,255,0.65)' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.10)'; e.currentTarget.style.color = 'rgba(255,255,255,0.40)' }}
              >
                Dismiss
              </button>
            </>
          ) : (
            <>
              {!isArchived && !hasTask && (
                <button
                  onClick={handlePromote}
                  style={{
                    background: promoted ? '#4ade8022' : 'transparent',
                    border: `1px solid ${promoted ? '#4ade80' : 'rgba(255,255,255,0.10)'}`,
                    borderRadius: 6,
                    color: promoted ? '#4ade80' : 'rgba(255,255,255,0.45)',
                    fontSize: 11,
                    padding: '4px 10px',
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                    fontWeight: promoted ? 600 : 400,
                  }}
                  onMouseEnter={e => { if (!promoted) { e.currentTarget.style.borderColor = '#7c6af7'; e.currentTarget.style.color = '#a89fff' } }}
                  onMouseLeave={e => { if (!promoted) { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.10)'; e.currentTarget.style.color = 'rgba(255,255,255,0.45)' } }}
                >
                  {promoted ? 'Promoted!' : 'Promote to Task'}
                </button>
              )}
              {!isArchived ? (
                <button
                  onClick={(e) => { e.stopPropagation(); onArchive(idea.id) }}
                  style={{
                    background: 'transparent',
                    border: '1px solid rgba(255,255,255,0.10)',
                    borderRadius: 6,
                    color: 'rgba(255,255,255,0.40)',
                    fontSize: 11,
                    padding: '4px 10px',
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.22)'; e.currentTarget.style.color = 'rgba(255,255,255,0.65)' }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.10)'; e.currentTarget.style.color = 'rgba(255,255,255,0.40)' }}
                >
                  Archive
                </button>
              ) : (
                <button
                  onClick={(e) => { e.stopPropagation(); onRestore(idea.id) }}
                  style={{
                    background: 'transparent',
                    border: '1px solid rgba(255,255,255,0.10)',
                    borderRadius: 6,
                    color: 'rgba(255,255,255,0.45)',
                    fontSize: 11,
                    padding: '4px 10px',
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = '#a89fff'; e.currentTarget.style.color = '#a89fff' }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.10)'; e.currentTarget.style.color = 'rgba(255,255,255,0.45)' }}
                >
                  Restore
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default function Ideas() {
  const [ideas,        setIdeas]        = useState([])
  const [allIdeas,     setAllIdeas]     = useState([])
  const [tab,          setTab]          = useState('inbox') // 'inbox' | 'open' | 'archived'
  const [adding,       setAdding]       = useState(false)
  const [loading,      setLoading]      = useState(true)
  const [detecting,    setDetecting]    = useState(false)
  const [editingIdea,  setEditingIdea]  = useState(null)

  const load = () => {
    setLoading(true)
    api.ideas({ status: tab }).then(setIdeas).finally(() => setLoading(false))
  }

  const loadInboxCount = () => {
    api.ideas({ status: 'inbox' }).then(data => setAllIdeas(Array.isArray(data) ? data : [])).catch(() => {})
  }

  useEffect(() => { load(); if (tab !== 'inbox') loadInboxCount() }, [tab])

  const inboxCount = tab === 'inbox' ? ideas.filter(i => i.status === 'inbox').length : allIdeas.length

  const handleCreate = async (body) => {
    await api.createIdea({ ...body, status: 'open' })
    setAdding(false)
    load()
  }

  const handleArchive = async (id) => {
    await api.updateIdea(id, { status: 'archived' })
    load()
  }

  const handleRestore = async (id) => {
    await api.updateIdea(id, { status: 'open' })
    load()
  }

  const handlePromote = async (id) => {
    await api.promoteIdea(id)
    load()
  }

  const handleDetectFromDiscord = async () => {
    setDetecting(true)
    try {
      await api.detectIdeasFromDiscord()
      load()
    } finally {
      setDetecting(false)
    }
  }

  const handleEditSave = async (id, data) => {
    const updated = await api.updateIdea(id, data)
    setIdeas(prev => prev.map(i => i.id === id ? updated : i))
  }

  const handleEditDelete = async (id) => {
    await api.deleteIdea(id)
    setIdeas(prev => prev.filter(i => i.id !== id))
  }

  const openCount = ideas.filter(i => i.status === 'open').length

  return (
    <div style={{ padding: '32px 40px' }}>
      {adding && (
        <NewIdeaModal onClose={() => setAdding(false)} onSave={handleCreate} />
      )}
      {editingIdea && (
        <EditIdeaModal
          idea={editingIdea}
          onClose={() => setEditingIdea(null)}
          onSave={handleEditSave}
          onDelete={handleEditDelete}
        />
      )}

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0, letterSpacing: '-0.02em', background: 'linear-gradient(135deg, #ffffff 0%, rgba(255,255,255,0.75) 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>Ideas</h1>
          <p style={{ color: 'rgba(255,255,255,0.45)', marginTop: 6, fontSize: 14 }}>
            {tab === 'inbox' ? `${ideas.length} inbox idea${ideas.length !== 1 ? 's' : ''}` : tab === 'open' ? `${openCount} open idea${openCount !== 1 ? 's' : ''}` : `${ideas.length} archived`}
          </p>
        </div>
        <button
          onClick={() => setAdding(true)}
          style={saveBtnStyle}
          onMouseEnter={e => { e.currentTarget.style.background = 'linear-gradient(135deg, rgba(124,106,247,0.90) 0%, rgba(99,102,241,0.80) 100%)'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(124,106,247,0.40), inset 0 1px 0 rgba(255,255,255,0.20)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'linear-gradient(135deg, rgba(124,106,247,0.80) 0%, rgba(99,102,241,0.70) 100%)'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(124,106,247,0.25), inset 0 1px 0 rgba(255,255,255,0.15)' }}
          onMouseDown={e => { e.currentTarget.style.transform = 'scale(0.97)'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(124,106,247,0.30)' }}
          onMouseUp={e => { e.currentTarget.style.transform = 'scale(1)' }}
        >
          + New Idea
        </button>
      </div>

      {/* Tab pills */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 28, alignItems: 'center', flexWrap: 'wrap' }}>
        {[
          { key: 'inbox',    label: 'Inbox' },
          { key: 'open',     label: 'Open' },
          { key: 'archived', label: 'Archived' },
        ].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            style={{
              background: tab === key ? '#7c6af722' : 'transparent',
              border: `1px solid ${tab === key ? '#7c6af7' : 'rgba(255,255,255,0.10)'}`,
              borderRadius: 20,
              color: tab === key ? '#a89fff' : 'rgba(255,255,255,0.45)',
              padding: '6px 16px',
              fontSize: 13,
              fontWeight: tab === key ? 600 : 400,
              cursor: 'pointer',
              transition: 'all 0.12s',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            {label}
            {key === 'inbox' && inboxCount > 0 && (
              <span style={{ background: '#f472b6', borderRadius: 10, fontSize: 9, fontWeight: 700, padding: '1px 5px', color: '#fff', marginLeft: 4 }}>{inboxCount}</span>
            )}
          </button>
        ))}
        {tab === 'inbox' && (
          <button
            onClick={handleDetectFromDiscord}
            disabled={detecting}
            style={{ marginLeft: 'auto', background: detecting ? 'rgba(255,255,255,0.04)' : 'transparent', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 8, color: detecting ? 'rgba(255,255,255,0.30)' : 'rgba(255,255,255,0.45)', padding: '6px 14px', fontSize: 12, cursor: detecting ? 'default' : 'pointer', transition: 'all 0.12s' }}
            onMouseEnter={e => { if (!detecting) { e.currentTarget.style.borderColor = '#7c6af7'; e.currentTarget.style.color = '#a89fff' } }}
            onMouseLeave={e => { if (!detecting) { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.10)'; e.currentTarget.style.color = 'rgba(255,255,255,0.45)' } }}
          >
            {detecting ? 'Detecting…' : 'Detect from Discord'}
          </button>
        )}
      </div>

      {loading ? (
        <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: 14, padding: '20px 0' }}>Loading…</div>
      ) : ideas.length === 0 ? (
        <div style={{
          background: 'rgba(255,255,255,0.04)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 12,
          boxShadow: '0 4px 24px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.06)',
          padding: '48px 20px',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: 24, color: 'rgba(255,255,255,0.12)', marginBottom: 10 }}>◍</div>
          <div style={{ color: 'rgba(255,255,255,0.40)', fontSize: 14, marginBottom: 18 }}>
            {tab === 'inbox' ? 'No inbox ideas yet.' : tab === 'open' ? 'No open ideas yet.' : 'Nothing archived yet.'}
          </div>
          {tab === 'open' && (
            <button
              onClick={() => setAdding(true)}
              style={{ ...saveBtnStyle, fontSize: 12, padding: '7px 16px' }}
            >
              + Capture your first idea
            </button>
          )}
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: 16,
        }}>
          {ideas.map(idea => (
            <IdeaCard
              key={idea.id}
              idea={idea}
              onArchive={handleArchive}
              onRestore={handleRestore}
              onPromote={handlePromote}
              onMoveToBacklog={(id) => api.updateIdea(id, { status: 'open' }).then(load)}
              onDismiss={(id) => api.updateIdea(id, { status: 'archived' }).then(load)}
              onCardClick={setEditingIdea}
            />
          ))}
        </div>
      )}
    </div>
  )
}

const overlayStyle   = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }
const modalStyle     = { background: 'rgba(255,255,255,0.07)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 16, boxShadow: '0 8px 40px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.10)', padding: 28, width: 420, maxWidth: '90vw' }
const fieldStyle     = { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 8, color: 'rgba(255,255,255,0.90)', padding: '9px 12px', fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box', transition: 'border-color 0.15s ease, box-shadow 0.15s ease' }
const saveBtnStyle   = { background: 'linear-gradient(135deg, rgba(124,106,247,0.80) 0%, rgba(99,102,241,0.70) 100%)', border: '1px solid rgba(124,106,247,0.60)', borderRadius: 8, boxShadow: '0 4px 16px rgba(124,106,247,0.25), inset 0 1px 0 rgba(255,255,255,0.15)', color: '#ffffff', padding: '9px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer', transition: 'all 150ms ease' }
const cancelBtnStyle = { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, color: 'rgba(255,255,255,0.65)', padding: '9px 18px', fontSize: 13, cursor: 'pointer', transition: 'all 150ms ease' }
