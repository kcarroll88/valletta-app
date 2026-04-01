import { useEffect, useState } from 'react'

const BASE = '/api'
function getToken() { return localStorage.getItem('vlt_token') || '' }
async function req(path, options = {}) {
  const token = getToken()
  const res = await fetch(BASE + path, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...options,
  })
  if (!res.ok) throw new Error(`API ${res.status}: ${path}`)
  if (res.status === 204) return null
  return res.json()
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const DAY_NAMES  = ['SUN','MON','TUE','WED','THU','FRI','SAT']
const MON_NAMES  = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC']

function fmtShowDate(str) {
  if (!str) return { day: '—', month: '', date: '' }
  // Parse as local date to avoid timezone shifting
  const [y, m, d] = str.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  return {
    dayName: DAY_NAMES[dt.getDay()],
    month:   MON_NAMES[dt.getMonth()],
    date:    String(d),
    full:    dt.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
  }
}

function fmtGuarantee(val) {
  if (val == null || val === 0) return null
  return '$' + Number(val).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

const STATUS_STYLES = {
  // Green family — booked/done
  'confirmed':   { stripe: '#22c55e', badge: 'rgba(34,197,94,0.2)',   text: '#4ade80', label: 'Confirmed' },
  'on sale':     { stripe: '#16a34a', badge: 'rgba(22,163,74,0.2)',   text: '#4ade80', label: 'On Sale' },
  'played':      { stripe: '#15803d', badge: 'rgba(21,128,61,0.2)',   text: '#4ade80', label: 'Played' },

  // Amber family — needs work / in progress
  'hold':        { stripe: '#f59e0b', badge: 'rgba(245,158,11,0.2)',  text: '#fbbf24', label: 'Hold' },
  '1st hold':    { stripe: '#f59e0b', badge: 'rgba(245,158,11,0.2)',  text: '#fbbf24', label: '1st Hold' },
  '2nd hold':    { stripe: '#d97706', badge: 'rgba(217,119,6,0.2)',   text: '#fbbf24', label: '2nd Hold' },
  'offer out':   { stripe: '#eab308', badge: 'rgba(234,179,8,0.2)',   text: '#fde047', label: 'Offer Out' },
  'offer sent':  { stripe: '#eab308', badge: 'rgba(234,179,8,0.2)',   text: '#fde047', label: 'Offer Sent' },
  'pending':     { stripe: '#ca8a04', badge: 'rgba(202,138,4,0.2)',   text: '#fde047', label: 'Pending' },

  // Blue family — routing/exploring
  'routing':     { stripe: '#3b82f6', badge: 'rgba(59,130,246,0.2)',  text: '#60a5fa', label: 'Routing' },
  'exploring':   { stripe: '#6366f1', badge: 'rgba(99,102,241,0.2)',  text: '#818cf8', label: 'Exploring' },
  'potential':   { stripe: '#6366f1', badge: 'rgba(99,102,241,0.2)',  text: '#818cf8', label: 'Potential' },

  // Red family — trouble/dead
  'cancelled':   { stripe: '#ef4444', badge: 'rgba(239,68,68,0.2)',   text: '#f87171', label: 'Cancelled' },
  'canceled':    { stripe: '#ef4444', badge: 'rgba(239,68,68,0.2)',   text: '#f87171', label: 'Cancelled' },
  'dropped':     { stripe: '#dc2626', badge: 'rgba(220,38,38,0.2)',   text: '#f87171', label: 'Dropped' },
  'lost':        { stripe: '#dc2626', badge: 'rgba(220,38,38,0.2)',   text: '#f87171', label: 'Lost' },
}

const getStatusStyle = (status) => {
  const key = (status || '').toLowerCase().trim()
  return STATUS_STYLES[key] || {
    stripe: '#6b7280',
    badge:  'rgba(107,114,128,0.2)',
    text:   '#9ca3af',
    label:  status || 'Unknown',
  }
}

// Legacy shim — keeps existing call sites that destructure { stripe, badge } working
function statusColors(status) {
  const s = getStatusStyle(status)
  return {
    stripe: s.stripe,
    badge: {
      color:      s.text,
      background: s.badge,
      border:     `1px solid ${s.badge.replace('0.2)', '0.35)')}`,
    },
  }
}

const GLASS_CARD = {
  background: 'rgba(255,255,255,0.03)',
  backdropFilter: 'blur(12px)',
  WebkitBackdropFilter: 'blur(12px)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 12,
  boxShadow: '0 4px 24px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.06)',
}

const STATUS_ORDER = ['Confirmed', 'On Sale', 'Played', 'Hold', '1st Hold', '2nd Hold', 'Offer Out', 'Offer Sent', 'Pending', 'Routing', 'Exploring', 'Potential', 'Cancelled', 'Dropped', 'Lost']

function statusCounts(shows) {
  const counts = {}
  for (const s of shows) {
    const k = s.status || 'Unknown'
    counts[k] = (counts[k] || 0) + 1
  }
  return counts
}

// ─── Status Pill ──────────────────────────────────────────────────────────────

function StatusPill({ status, count }) {
  const s = getStatusStyle(status)
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6,
      padding: '5px 12px',
      borderRadius: 99,
      background: s.badge,
      border: `1px solid ${s.badge.replace('0.2)', '0.35)')}`,
      color: s.text,
      fontSize: 13,
      fontWeight: 500,
      whiteSpace: 'nowrap',
    }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: s.stripe, display: 'inline-block', flexShrink: 0 }} />
      {count} {s.label}
    </div>
  )
}

// ─── Show Card ────────────────────────────────────────────────────────────────

const STATUS_OPTIONS = ['Confirmed', 'On Sale', 'Played', 'Hold', '1st Hold', '2nd Hold', 'Offer Out', 'Offer Sent', 'Pending', 'Routing', 'Exploring', 'Potential', 'Cancelled', 'Dropped', 'Lost']

function ShowCard({ show, onUpdated }) {
  const [expanded,   setExpanded]   = useState(false)
  const [editing,    setEditing]    = useState(false)
  const [saving,     setSaving]     = useState(false)
  const [editStatus, setEditStatus] = useState(show.status || '')
  const [editNotes,  setEditNotes]  = useState(show.notes  || '')
  const [editContact,  setEditContact]  = useState(show.contact   || '')
  const [editPromoter, setEditPromoter] = useState(show.promoter  || '')

  const colors = statusColors(show.status)
  const { dayName, month, date } = fmtShowDate(show.show_date)
  const guarantee = fmtGuarantee(show.guarantee)

  const handleSave = async () => {
    setSaving(true)
    try {
      await req(`/shows/${show.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status:   editStatus,
          notes:    editNotes,
          contact:  editContact,
          promoter: editPromoter,
        }),
      })
      setEditing(false)
      if (onUpdated) onUpdated()
    } catch (err) {
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  const handleCancel = () => {
    setEditStatus(show.status || '')
    setEditNotes(show.notes   || '')
    setEditContact(show.contact  || '')
    setEditPromoter(show.promoter || '')
    setEditing(false)
  }

  return (
    <div style={{ ...GLASS_CARD, overflow: 'hidden', transition: 'box-shadow 150ms' }}>
      {/* Clickable header row */}
      <button
        onClick={() => setExpanded(v => !v)}
        style={{
          display: 'flex',
          alignItems: 'stretch',
          width: '100%',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          padding: 0,
          textAlign: 'left',
        }}
      >
        {/* Status stripe */}
        <div style={{ width: 4, background: colors.stripe, borderRadius: '12px 0 0 0', flexShrink: 0 }} />

        {/* Main content */}
        <div style={{ flex: 1, padding: '16px 16px 16px 14px', minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
            {/* Date block */}
            <div style={{ textAlign: 'center', flexShrink: 0, minWidth: 48 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.40)', letterSpacing: '0.08em', lineHeight: 1 }}>
                {dayName}
              </div>
              <div style={{ fontSize: 28, fontWeight: 800, color: '#fff', lineHeight: 1, letterSpacing: '-0.02em', marginTop: 2 }}>
                {date}
              </div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.40)', letterSpacing: '0.08em', lineHeight: 1, marginTop: 1 }}>
                {month}
              </div>
            </div>

            {/* Venue + meta */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#fff', lineHeight: 1.3, marginBottom: 2 }}>
                {show.venue || '—'}
              </div>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', marginBottom: 6 }}>
                {[show.city, show.state].filter(Boolean).join(', ') || '—'}
              </div>

              {/* Status badge + capacity */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{
                  ...colors.badge,
                  fontSize: 11, fontWeight: 600,
                  padding: '2px 8px', borderRadius: 99,
                  letterSpacing: '0.04em',
                }}>
                  {show.status || 'Unknown'}
                </span>
                {show.capacity != null && (
                  <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.30)' }}>
                    Cap {show.capacity.toLocaleString()}
                  </span>
                )}
              </div>

              {/* Notes preview (collapsed) */}
              {!expanded && show.notes && (
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', marginTop: 6, lineHeight: 1.45, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {show.notes}
                </div>
              )}
            </div>

            {/* Right side: guarantee + chevron */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8, flexShrink: 0 }}>
              {guarantee && (
                <div style={{ fontSize: 14, fontWeight: 700, color: '#4ade80' }}>
                  {guarantee}
                </div>
              )}
              <div style={{
                fontSize: 11,
                color: 'rgba(255,255,255,0.25)',
                transform: expanded ? 'rotate(180deg)' : 'none',
                transition: 'transform 180ms',
                marginTop: guarantee ? 0 : 4,
              }}>
                ▾
              </div>
            </div>
          </div>
        </div>
      </button>

      {/* Expanded details */}
      {expanded && (
        <div style={{
          borderTop: '1px solid rgba(255,255,255,0.07)',
          padding: '16px 18px 18px',
          background: 'rgba(0,0,0,0.15)',
        }}>
          {/* Full date + contact/promoter row (read mode) */}
          {!editing && (
            <>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 20px', marginBottom: 10 }}>
                {show.contact && (
                  <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.40)' }}>
                    <span style={{ color: 'rgba(255,255,255,0.25)' }}>Contact: </span>{show.contact}
                  </span>
                )}
                {show.promoter && (
                  <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.40)' }}>
                    <span style={{ color: 'rgba(255,255,255,0.25)' }}>Promoter: </span>{show.promoter}
                  </span>
                )}
                {guarantee && (
                  <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.40)' }}>
                    <span style={{ color: 'rgba(255,255,255,0.25)' }}>Guarantee: </span>{guarantee}
                  </span>
                )}
                {show.capacity != null && (
                  <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.40)' }}>
                    <span style={{ color: 'rgba(255,255,255,0.25)' }}>Capacity: </span>{show.capacity.toLocaleString()}
                  </span>
                )}
              </div>

              {show.notes && (
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.50)', lineHeight: 1.55, marginBottom: 12 }}>
                  {show.notes}
                </div>
              )}

              <button
                onClick={() => setEditing(true)}
                style={{
                  padding: '7px 16px', fontSize: 12, fontWeight: 600,
                  background: 'rgba(124,106,247,0.12)',
                  border: '1px solid rgba(124,106,247,0.30)',
                  borderRadius: 7, color: '#c4b5fd',
                  cursor: 'pointer', transition: 'background 120ms',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(124,106,247,0.22)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(124,106,247,0.12)' }}
              >
                Edit
              </button>
            </>
          )}

          {/* Edit mode */}
          {editing && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {/* Status select */}
              <label style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                Status
                <select
                  value={editStatus}
                  onChange={e => setEditStatus(e.target.value)}
                  style={{
                    display: 'block', marginTop: 4,
                    width: '100%',
                    background: 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(255,255,255,0.14)',
                    borderRadius: 7,
                    padding: '8px 12px',
                    fontSize: 13, color: '#fff',
                    cursor: 'pointer',
                    outline: 'none',
                  }}
                >
                  {STATUS_OPTIONS.map(s => <option key={s} value={s} style={{ background: '#1a1a28' }}>{s}</option>)}
                </select>
              </label>

              {/* Contact */}
              <label style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                Contact
                <input
                  type="text"
                  value={editContact}
                  onChange={e => setEditContact(e.target.value)}
                  placeholder="Contact name / email"
                  style={{
                    display: 'block', marginTop: 4,
                    width: '100%', boxSizing: 'border-box',
                    background: 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(255,255,255,0.14)',
                    borderRadius: 7,
                    padding: '8px 12px',
                    fontSize: 13, color: '#fff',
                    outline: 'none',
                  }}
                  onFocus={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.28)' }}
                  onBlur={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.14)' }}
                />
              </label>

              {/* Promoter */}
              <label style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                Promoter
                <input
                  type="text"
                  value={editPromoter}
                  onChange={e => setEditPromoter(e.target.value)}
                  placeholder="Promoter name"
                  style={{
                    display: 'block', marginTop: 4,
                    width: '100%', boxSizing: 'border-box',
                    background: 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(255,255,255,0.14)',
                    borderRadius: 7,
                    padding: '8px 12px',
                    fontSize: 13, color: '#fff',
                    outline: 'none',
                  }}
                  onFocus={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.28)' }}
                  onBlur={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.14)' }}
                />
              </label>

              {/* Notes */}
              <label style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                Notes
                <textarea
                  value={editNotes}
                  onChange={e => setEditNotes(e.target.value)}
                  placeholder="Show notes…"
                  rows={3}
                  style={{
                    display: 'block', marginTop: 4,
                    width: '100%', boxSizing: 'border-box',
                    background: 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(255,255,255,0.14)',
                    borderRadius: 7,
                    padding: '8px 12px',
                    fontSize: 13, color: '#fff',
                    outline: 'none', resize: 'vertical',
                    fontFamily: 'inherit',
                    lineHeight: 1.5,
                  }}
                  onFocus={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.28)' }}
                  onBlur={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.14)' }}
                />
              </label>

              {/* Action buttons */}
              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  style={{
                    padding: '8px 20px', fontSize: 12, fontWeight: 600,
                    background: saving ? 'rgba(124,106,247,0.08)' : 'rgba(124,106,247,0.18)',
                    border: '1px solid rgba(124,106,247,0.35)',
                    borderRadius: 7, color: saving ? 'rgba(196,181,253,0.5)' : '#c4b5fd',
                    cursor: saving ? 'default' : 'pointer',
                    transition: 'background 120ms',
                  }}
                  onMouseEnter={e => { if (!saving) e.currentTarget.style.background = 'rgba(124,106,247,0.28)' }}
                  onMouseLeave={e => { if (!saving) e.currentTarget.style.background = 'rgba(124,106,247,0.18)' }}
                >
                  {saving ? 'Saving…' : 'Save'}
                </button>
                <button
                  onClick={handleCancel}
                  disabled={saving}
                  style={{
                    padding: '8px 16px', fontSize: 12, fontWeight: 500,
                    background: 'transparent',
                    border: '1px solid rgba(255,255,255,0.12)',
                    borderRadius: 7, color: 'rgba(255,255,255,0.45)',
                    cursor: saving ? 'default' : 'pointer',
                    transition: 'border-color 120ms, color 120ms',
                  }}
                  onMouseEnter={e => { if (!saving) { e.currentTarget.style.color = 'rgba(255,255,255,0.7)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.22)' } }}
                  onMouseLeave={e => { if (!saving) { e.currentTarget.style.color = 'rgba(255,255,255,0.45)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)' } }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Main View ────────────────────────────────────────────────────────────────

export default function Shows() {
  const [shows,      setShows]      = useState([])
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState(null)
  const [syncState,  setSyncState]  = useState('idle') // idle | syncing | success | error
  const [syncMsg,    setSyncMsg]    = useState('')
  const [refreshKey, setRefreshKey] = useState(0)

  const loadShows = async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await req('/shows?upcoming_only=true')
      setShows(Array.isArray(data) ? data : [])
    } catch (err) {
      setError('Failed to load shows.')
      setShows([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadShows() }, [refreshKey])

  const handleSync = async () => {
    if (syncState === 'syncing') return
    setSyncState('syncing')
    setSyncMsg('')
    try {
      const result = await req('/shows/sync', { method: 'POST' })
      setSyncState('success')
      setSyncMsg(`✓ ${result.synced} shows synced`)
      setTimeout(() => {
        setSyncState('idle')
        setSyncMsg('')
        setRefreshKey(k => k + 1)
      }, 4000)
    } catch (err) {
      setSyncState('error')
      setSyncMsg('Sync failed')
      setTimeout(() => { setSyncState('idle'); setSyncMsg('') }, 4000)
    }
  }

  const counts = statusCounts(shows)

  // Determine all statuses present, respecting canonical order + any others
  const presentStatuses = [
    ...STATUS_ORDER.filter(s => counts[s]),
    ...Object.keys(counts).filter(s => !STATUS_ORDER.includes(s)),
  ]

  return (
    <div style={{ padding: '28px 28px 48px', maxWidth: 780, margin: '0 auto' }}>

      {/* ── Header bar ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, gap: 12, flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#fff', letterSpacing: '-0.02em', margin: 0 }}>
          Upcoming Shows
        </h1>
        <button
          onClick={handleSync}
          disabled={syncState === 'syncing'}
          style={{
            display: 'flex', alignItems: 'center', gap: 7,
            padding: '8px 16px',
            background: syncState === 'success'
              ? 'rgba(34,197,94,0.12)'
              : syncState === 'error'
              ? 'rgba(239,68,68,0.12)'
              : 'rgba(124,106,247,0.12)',
            border: syncState === 'success'
              ? '1px solid rgba(34,197,94,0.30)'
              : syncState === 'error'
              ? '1px solid rgba(239,68,68,0.30)'
              : '1px solid rgba(124,106,247,0.30)',
            borderRadius: 8,
            color: syncState === 'success'
              ? '#4ade80'
              : syncState === 'error'
              ? '#f87171'
              : '#c4b5fd',
            fontSize: 13, fontWeight: 600,
            cursor: syncState === 'syncing' ? 'default' : 'pointer',
            transition: 'background 150ms, border-color 150ms, color 150ms',
            whiteSpace: 'nowrap',
          }}
          onMouseEnter={e => { if (syncState === 'idle') e.currentTarget.style.background = 'rgba(124,106,247,0.20)' }}
          onMouseLeave={e => { if (syncState === 'idle') e.currentTarget.style.background = 'rgba(124,106,247,0.12)' }}
        >
          {/* Sync icon or spinner */}
          {syncState === 'syncing' ? (
            <span style={{ display: 'inline-block', width: 14, height: 14, border: '2px solid rgba(196,181,253,0.3)', borderTopColor: '#c4b5fd', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="8 17 12 21 16 17"/>
              <line x1="12" y1="21" x2="12" y2="7"/>
              <path d="M3 15a9 9 0 1 1 17.8-2"/>
            </svg>
          )}
          {syncState === 'syncing' ? 'Syncing…'
            : syncState === 'success' ? syncMsg
            : syncState === 'error' ? syncMsg
            : '↓ Sync from Sheet'}
        </button>
      </div>

      {/* ── Status summary pills ── */}
      {presentStatuses.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 22 }}>
          {presentStatuses.map(s => (
            <StatusPill key={s} status={s} count={counts[s]} />
          ))}
        </div>
      )}

      {/* Spinner animation */}
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>

      {/* ── Loading ── */}
      {loading && (
        <div style={{ padding: '48px 0', textAlign: 'center', color: 'rgba(255,255,255,0.25)', fontSize: 14 }}>
          Loading shows…
        </div>
      )}

      {/* ── Error ── */}
      {!loading && error && (
        <div style={{ padding: '40px 0', textAlign: 'center', color: '#f87171', fontSize: 14 }}>
          {error}
        </div>
      )}

      {/* ── Empty state ── */}
      {!loading && !error && shows.length === 0 && (
        <div style={{
          ...GLASS_CARD,
          padding: '56px 32px',
          textAlign: 'center',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
        }}>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.20)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
            <line x1="16" y1="2" x2="16" y2="6"/>
            <line x1="8"  y1="2" x2="8"  y2="6"/>
            <line x1="3"  y1="10" x2="21" y2="10"/>
          </svg>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'rgba(255,255,255,0.45)' }}>
            No upcoming shows.
          </div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.25)' }}>
            Hit Sync to pull from Google Sheets.
          </div>
        </div>
      )}

      {/* ── Shows list ── */}
      {!loading && !error && shows.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {shows.map(show => (
            <ShowCard
              key={show.id}
              show={show}
              onUpdated={() => setRefreshKey(k => k + 1)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
