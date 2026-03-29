import { useEffect, useRef, useState } from 'react'
import { api } from '../api'
import useIsMobile from '../hooks/useIsMobile'

function fmtDate(iso) {
  if (!iso) return ''
  try {
    const d = new Date(iso + 'T00:00:00')
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  } catch {
    return iso.slice(0, 10)
  }
}

// ─── New Setlist Modal ────────────────────────────────────────────────────────

function NewSetlistModal({ onClose, onSave }) {
  const [form, setForm] = useState({ name: '', date: '', venue: '' })
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSubmit = () => {
    if (!form.name.trim()) return
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
        <h3 style={{ fontSize: 16, fontWeight: 600, color: '#e8e8f8', margin: '0 0 20px' }}>New Setlist</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input
            autoFocus
            placeholder="Setlist name *"
            value={form.name}
            onChange={e => set('name', e.target.value)}
            style={fieldStyle}
          />
          <div>
            <div style={{ fontSize: 11, color: '#56567a', marginBottom: 4 }}>Date (optional)</div>
            <input type="date" value={form.date} onChange={e => set('date', e.target.value)} style={fieldStyle} />
          </div>
          <input
            placeholder="Venue (optional)"
            value={form.venue}
            onChange={e => set('venue', e.target.value)}
            style={fieldStyle}
          />
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={cancelBtnStyle}>Cancel</button>
          <button onClick={handleSubmit} style={saveBtnStyle}>Create Setlist</button>
        </div>
      </div>
    </div>
  )
}

// ─── Song Row ─────────────────────────────────────────────────────────────────

function SongRow({ song, index, total, onUpdate, onDelete, onDragStart, onDragEnter, onDragEnd, isDragging, isDragOver }) {
  return (
    <div
      onDragOver={e => { e.preventDefault(); onDragEnter(index) }}
      className="song-row-inner"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '8px 10px',
        background: isDragOver ? 'rgba(124,106,247,0.12)' : 'rgba(255,255,255,0.04)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        border: `1px solid ${isDragOver ? 'rgba(124,106,247,0.50)' : 'rgba(255,255,255,0.08)'}`,
        borderRadius: 8,
        marginBottom: 6,
        opacity: isDragging ? 0.4 : 1,
        transition: 'background 0.1s, border-color 0.1s, opacity 0.1s',
      }}
    >
      {/* Drag handle */}
      <div
        draggable
        onDragStart={e => onDragStart(e, index)}
        onDragEnd={onDragEnd}
        style={{
          cursor: 'grab',
          color: '#363650',
          fontSize: 16,
          lineHeight: 1,
          padding: '2px 4px',
          flexShrink: 0,
          userSelect: 'none',
        }}
        title="Drag to reorder"
      >
        ⠿
      </div>

      {/* Position number */}
      <span style={{
        fontSize: 12,
        color: '#56567a',
        fontWeight: 600,
        minWidth: 20,
        textAlign: 'right',
        flexShrink: 0,
      }}>
        {index + 1}
      </span>

      {/* Song title */}
      <input
        value={song.title}
        onChange={e => onUpdate(index, 'title', e.target.value)}
        placeholder="Song title"
        style={{
          ...fieldStyle,
          flex: '1 1 0',
          padding: '6px 10px',
          fontSize: 13,
        }}
      />

      {/* Notes */}
      <input
        value={song.notes || ''}
        onChange={e => onUpdate(index, 'notes', e.target.value)}
        placeholder="Notes"
        className="song-row-notes"
        style={{
          ...fieldStyle,
          flex: '0 1 160px',
          padding: '6px 10px',
          fontSize: 12,
          color: '#9595b8',
        }}
      />

      {/* Delete */}
      <button
        onClick={() => onDelete(index)}
        style={{
          background: 'transparent',
          border: 'none',
          color: '#56567a',
          cursor: 'pointer',
          fontSize: 18,
          lineHeight: 1,
          padding: '0 2px',
          flexShrink: 0,
          transition: 'color 0.12s',
        }}
        onMouseEnter={e => { e.currentTarget.style.color = '#f87171' }}
        onMouseLeave={e => { e.currentTarget.style.color = '#56567a' }}
      >×</button>
    </div>
  )
}

// ─── Active Setlist Editor ─────────────────────────────────────────────────────

function SetlistEditor({ setlistId, onUpdated }) {
  const [setlist,    setSetlist]    = useState(null)
  const [songs,      setSongs]      = useState([])
  const [loading,    setLoading]    = useState(true)
  const [saving,     setSaving]     = useState(false)
  const [saved,      setSaved]      = useState(false)
  const [editName,   setEditName]   = useState(false)
  const [nameVal,    setNameVal]    = useState('')
  const [dragIdx,    setDragIdx]    = useState(null)
  const [dragOver,   setDragOver]   = useState(null)
  const nameInputRef = useRef(null)

  useEffect(() => {
    if (!setlistId) return
    setLoading(true)
    api.setlist(setlistId).then(data => {
      setSetlist(data)
      setNameVal(data.name || '')
      setSongs((data.songs || []).map(s => ({ ...s, title: s.title || s.song_title || '' })))
    }).finally(() => setLoading(false))
  }, [setlistId])

  useEffect(() => {
    if (editName && nameInputRef.current) nameInputRef.current.focus()
  }, [editName])

  const updateSong = (idx, key, val) => {
    setSongs(prev => prev.map((s, i) => i === idx ? { ...s, [key]: val } : s))
  }

  const deleteSong = (idx) => {
    setSongs(prev => prev.filter((_, i) => i !== idx))
  }

  const addSong = () => {
    setSongs(prev => [...prev, { title: '', notes: '' }])
  }

  // Drag-and-drop handlers
  const handleDragStart = (e, idx) => {
    setDragIdx(idx)
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragEnter = (idx) => {
    if (dragIdx === null || idx === dragIdx) return
    setDragOver(idx)
  }

  const handleDragEnd = () => {
    if (dragIdx !== null && dragOver !== null && dragIdx !== dragOver) {
      setSongs(prev => {
        const next = [...prev]
        const [moved] = next.splice(dragIdx, 1)
        next.splice(dragOver, 0, moved)
        return next
      })
    }
    setDragIdx(null)
    setDragOver(null)
  }

  const handleSave = async () => {
    if (!setlist) return
    setSaving(true)
    try {
      const metadata = {
        name:  nameVal || setlist.name,
        date:  setlist.date,
        venue: setlist.venue,
        notes: setlist.notes,
      }
      const songsBody = songs.filter(s => s.title.trim()).map((s, i) => ({
        title:    s.title,
        notes:    s.notes || '',
        position: i + 1,
      }))
      await Promise.all([
        api.updateSetlist(setlist.id, metadata),
        api.replaceSetlistSongs(setlist.id, songsBody),
      ])
      setSetlist(prev => ({ ...prev, ...metadata }))
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
      if (onUpdated) onUpdated()
    } finally {
      setSaving(false)
    }
  }

  const handleMetaChange = (key, val) => {
    setSetlist(prev => ({ ...prev, [key]: val }))
  }

  if (!setlistId) {
    return (
      <div style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'rgba(255,255,255,0.30)',
        fontSize: 14,
        background: 'rgba(255,255,255,0.03)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        borderRadius: 12,
        border: '1px solid rgba(255,255,255,0.07)',
        padding: 40,
      }}>
        Select a setlist to edit
      </div>
    )
  }

  if (loading) {
    return (
      <div style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#9595b8',
        fontSize: 14,
      }}>
        Loading…
      </div>
    )
  }

  if (!setlist) return null

  return (
    <div style={{
      flex: 1,
      background: 'rgba(255,255,255,0.04)',
      backdropFilter: 'blur(12px)',
      WebkitBackdropFilter: 'blur(12px)',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 12,
      boxShadow: '0 4px 24px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.06)',
      padding: '24px 28px',
      display: 'flex',
      flexDirection: 'column',
      gap: 16,
      minWidth: 0,
    }}>
      {/* Setlist header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {editName ? (
            <input
              ref={nameInputRef}
              value={nameVal}
              onChange={e => setNameVal(e.target.value)}
              onBlur={() => setEditName(false)}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') setEditName(false) }}
              style={{ ...fieldStyle, fontSize: 18, fontWeight: 700, padding: '6px 10px' }}
            />
          ) : (
            <div
              onClick={() => setEditName(true)}
              title="Click to edit name"
              style={{
                fontSize: 18,
                fontWeight: 700,
                color: '#e8e8f8',
                cursor: 'text',
                padding: '4px 0',
                borderBottom: '1px dashed #363650',
                display: 'inline-block',
                minWidth: 80,
              }}
            >
              {nameVal || setlist.name}
            </div>
          )}
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            ...saveBtnStyle,
            background: saved ? '#4ade80' : saving ? '#56567a' : '#7c6af7',
            flexShrink: 0,
          }}
          onMouseEnter={e => { if (!saving && !saved) e.currentTarget.style.background = '#9085f9' }}
          onMouseLeave={e => { if (!saving && !saved) e.currentTarget.style.background = '#7c6af7' }}
        >
          {saved ? 'Saved!' : saving ? 'Saving…' : 'Save Setlist'}
        </button>
      </div>

      {/* Metadata fields */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div>
          <div style={{ fontSize: 11, color: '#56567a', marginBottom: 4 }}>Date</div>
          <input
            type="date"
            value={setlist.date || ''}
            onChange={e => handleMetaChange('date', e.target.value)}
            style={fieldStyle}
          />
        </div>
        <div>
          <div style={{ fontSize: 11, color: '#56567a', marginBottom: 4 }}>Venue</div>
          <input
            placeholder="Venue"
            value={setlist.venue || ''}
            onChange={e => handleMetaChange('venue', e.target.value)}
            style={fieldStyle}
          />
        </div>
      </div>
      <div>
        <div style={{ fontSize: 11, color: '#56567a', marginBottom: 4 }}>Notes</div>
        <textarea
          placeholder="Notes"
          value={setlist.notes || ''}
          onChange={e => handleMetaChange('notes', e.target.value)}
          style={{ ...fieldStyle, height: 60, resize: 'vertical' }}
        />
      </div>

      {/* Song list */}
      <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#56567a', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>
          {songs.filter(s => s.title).length} songs
        </div>

        <div>
          {songs.map((song, idx) => (
            <SongRow
              key={idx}
              song={song}
              index={idx}
              total={songs.length}
              onUpdate={updateSong}
              onDelete={deleteSong}
              onDragStart={handleDragStart}
              onDragEnter={handleDragEnter}
              onDragEnd={handleDragEnd}
              isDragging={dragIdx === idx}
              isDragOver={dragOver === idx}
            />
          ))}
        </div>

        <button
          onClick={addSong}
          style={{
            background: 'transparent',
            border: '1px dashed #363650',
            borderRadius: 8,
            color: '#56567a',
            padding: '8px 16px',
            fontSize: 13,
            cursor: 'pointer',
            width: '100%',
            marginTop: 4,
            transition: 'border-color 0.12s, color 0.12s',
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = '#7c6af7'; e.currentTarget.style.color = '#a89fff' }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = '#363650'; e.currentTarget.style.color = '#56567a' }}
        >
          + Add Song
        </button>
      </div>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function Setlist() {
  const isMobile = useIsMobile()
  const [setlists,   setSetlists]   = useState([])
  const [active,     setActive]     = useState(null)
  const [adding,     setAdding]     = useState(false)
  const [loading,    setLoading]    = useState(true)
  const [listRefresh, setListRefresh] = useState(0)

  const loadList = () => {
    setLoading(true)
    api.setlists().then(data => {
      // Sort by date descending (null dates go last)
      const sorted = [...data].sort((a, b) => {
        if (!a.date && !b.date) return 0
        if (!a.date) return 1
        if (!b.date) return -1
        return b.date.localeCompare(a.date)
      })
      setSetlists(sorted)
    }).finally(() => setLoading(false))
  }

  useEffect(loadList, [listRefresh])

  const handleCreate = async (body) => {
    const created = await api.createSetlist(body)
    setAdding(false)
    setListRefresh(r => r + 1)
    setActive(created.id)
  }

  const handleListRefresh = () => {
    setListRefresh(r => r + 1)
  }

  return (
    <div style={{ padding: isMobile ? '16px 14px' : '32px 40px' }}>
      {adding && (
        <NewSetlistModal onClose={() => setAdding(false)} onSave={handleCreate} />
      )}

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28, ...(isMobile && { paddingTop: 52 }) }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0, letterSpacing: '-0.02em', background: 'linear-gradient(135deg, #ffffff 0%, rgba(255,255,255,0.75) 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>Setlists</h1>
          <p style={{ color: 'rgba(255,255,255,0.45)', marginTop: 6, fontSize: 14 }}>{setlists.length} setlist{setlists.length !== 1 ? 's' : ''}</p>
        </div>
        <button
          onClick={() => setAdding(true)}
          style={saveBtnStyle}
          onMouseEnter={e => { e.currentTarget.style.background = 'linear-gradient(135deg, rgba(124,106,247,0.90) 0%, rgba(99,102,241,0.80) 100%)'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(124,106,247,0.40), inset 0 1px 0 rgba(255,255,255,0.20)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'linear-gradient(135deg, rgba(124,106,247,0.80) 0%, rgba(99,102,241,0.70) 100%)'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(124,106,247,0.25), inset 0 1px 0 rgba(255,255,255,0.15)' }}
          onMouseDown={e => { e.currentTarget.style.transform = 'scale(0.97)'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(124,106,247,0.30)' }}
          onMouseUp={e => { e.currentTarget.style.transform = 'scale(1)' }}
        >
          + New Setlist
        </button>
      </div>

      {/* Two-panel layout */}
      <div style={{
        display: 'flex',
        gap: 20,
        alignItems: 'flex-start',
        flexWrap: isMobile ? 'wrap' : 'wrap',
        flexDirection: isMobile ? 'column' : 'row',
      }}>
        {/* Left — Setlist history */}
        <div style={{
          width: isMobile ? '100%' : 280,
          flexShrink: 0,
          background: 'rgba(255,255,255,0.04)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 12,
          boxShadow: '0 4px 24px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.06)',
          overflow: 'hidden',
        }}>
          <div style={{
            padding: '14px 18px',
            borderBottom: '1px solid rgba(255,255,255,0.07)',
            fontSize: 12,
            fontWeight: 600,
            color: 'rgba(255,255,255,0.35)',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}>
            History
          </div>

          {loading ? (
            <div style={{ padding: '20px 18px', color: '#56567a', fontSize: 13 }}>Loading…</div>
          ) : setlists.length === 0 ? (
            <div style={{ padding: '24px 18px', color: '#56567a', fontSize: 13, textAlign: 'center' }}>
              No setlists yet.
            </div>
          ) : (
            <div>
              {setlists.map(sl => (
                <div
                  key={sl.id}
                  onClick={() => setActive(sl.id)}
                  style={{
                    padding: '12px 18px',
                    borderBottom: '1px solid rgba(255,255,255,0.06)',
                    cursor: 'pointer',
                    background: active === sl.id ? 'rgba(124,106,247,0.15)' : 'transparent',
                    borderLeft: `3px solid ${active === sl.id ? '#7c6af7' : 'transparent'}`,
                    boxShadow: active === sl.id ? 'inset 0 0 12px rgba(124,106,247,0.08)' : 'none',
                    transition: 'background 0.1s, border-color 0.1s',
                  }}
                  onMouseEnter={e => { if (active !== sl.id) e.currentTarget.style.background = 'rgba(255,255,255,0.03)' }}
                  onMouseLeave={e => { if (active !== sl.id) e.currentTarget.style.background = 'transparent' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: active === sl.id ? '#a89fff' : '#e8e8f8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }}>
                      {sl.name}
                    </div>
                    <span style={{
                      background: '#7c6af722',
                      border: '1px solid #7c6af744',
                      borderRadius: 10,
                      color: '#a89fff',
                      fontSize: 10,
                      fontWeight: 700,
                      padding: '1px 7px',
                      flexShrink: 0,
                    }}>
                      {sl.song_count ?? 0}
                    </span>
                  </div>
                  {(sl.date || sl.venue) && (
                    <div style={{ fontSize: 11, color: '#56567a', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {[sl.date ? fmtDate(sl.date) : null, sl.venue].filter(Boolean).join(' · ')}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right — Active setlist editor */}
        <SetlistEditor
          setlistId={active}
          onUpdated={handleListRefresh}
        />
      </div>
    </div>
  )
}

const overlayStyle   = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }
const modalStyle     = { background: 'rgba(255,255,255,0.07)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 16, boxShadow: '0 8px 40px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.10)', padding: 28, width: 420, maxWidth: '90vw' }
const fieldStyle     = { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 8, color: 'rgba(255,255,255,0.90)', padding: '9px 12px', fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box', transition: 'border-color 0.15s ease, box-shadow 0.15s ease' }
const saveBtnStyle   = { background: 'linear-gradient(135deg, rgba(124,106,247,0.80) 0%, rgba(99,102,241,0.70) 100%)', border: '1px solid rgba(124,106,247,0.60)', borderRadius: 8, boxShadow: '0 4px 16px rgba(124,106,247,0.25), inset 0 1px 0 rgba(255,255,255,0.15)', color: '#ffffff', padding: '9px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer', transition: 'all 150ms ease' }
const cancelBtnStyle = { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, color: 'rgba(255,255,255,0.65)', padding: '9px 18px', fontSize: 13, cursor: 'pointer', transition: 'all 150ms ease' }
