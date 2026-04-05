import React, { useEffect, useState, useRef } from 'react'
import { api } from '../api'
import useIsMobile from '../hooks/useIsMobile'

// ─── Shared Constants ─────────────────────────────────────────────────────────

const STATUSES = [
  { value: 'not_contacted', label: 'Not Contacted', bg: 'rgba(86,86,122,0.18)',    color: '#56567a', border: 'rgba(86,86,122,0.35)' },
  { value: 'reached_out',   label: 'Reached Out',   bg: 'rgba(96,165,250,0.12)',   color: '#60a5fa', border: 'rgba(96,165,250,0.3)' },
  { value: 'in_talks',      label: 'In Talks',      bg: 'rgba(168,159,255,0.14)',  color: '#a89fff', border: 'rgba(168,159,255,0.3)' },
  { value: 'passed',        label: 'Passed',         bg: 'rgba(255,107,107,0.12)', color: '#ff6b6b', border: 'rgba(255,107,107,0.28)' },
  { value: 'signed',        label: 'Signed',         bg: 'rgba(74,222,128,0.12)',  color: '#4ade80', border: 'rgba(74,222,128,0.28)' },
]

const STATUS_MAP = Object.fromEntries(STATUSES.map(s => [s.value, s]))

// ─── Company (Sources) Constants ──────────────────────────────────────────────

const COMPANY_CATEGORIES = ['Marketing', 'Management', 'Booking', 'PR', 'Label']

const COMPANY_CAT_COLORS = {
  Marketing:  { color: '#60a5fa', bg: 'rgba(96,165,250,0.1)',  border: 'rgba(96,165,250,0.25)' },
  Management: { color: '#a89fff', bg: 'rgba(168,159,255,0.1)', border: 'rgba(168,159,255,0.25)' },
  Booking:    { color: '#4ade80', bg: 'rgba(74,222,128,0.1)',  border: 'rgba(74,222,128,0.25)' },
  PR:         { color: '#f472b6', bg: 'rgba(244,114,182,0.1)', border: 'rgba(244,114,182,0.25)' },
  Label:      { color: '#a78bfa', bg: 'rgba(167,139,250,0.1)', border: 'rgba(167,139,250,0.25)' },
}

// ─── People Constants ──────────────────────────────────────────────────────────

const PEOPLE_CATEGORIES = ['All', 'Musician', 'Venue', 'Promoter', 'Press', 'Management', 'Other']

const PEOPLE_CAT_COLORS = {
  Musician:   { color: '#a89fff', bg: 'rgba(168,159,255,0.12)', border: 'rgba(168,159,255,0.3)' },
  Venue:      { color: '#4ade80', bg: 'rgba(74,222,128,0.12)',  border: 'rgba(74,222,128,0.3)' },
  Promoter:   { color: '#fbbf24', bg: 'rgba(251,191,36,0.12)',  border: 'rgba(251,191,36,0.3)' },
  Press:      { color: '#60a5fa', bg: 'rgba(96,165,250,0.12)',  border: 'rgba(96,165,250,0.3)' },
  Management: { color: '#2dd4bf', bg: 'rgba(45,212,191,0.12)',  border: 'rgba(45,212,191,0.3)' },
  Other:      { color: '#9595b8', bg: 'rgba(149,149,184,0.1)',  border: 'rgba(149,149,184,0.25)' },
}

// ─── People Tag Constants ──────────────────────────────────────────────────────

const PEOPLE_TAGS = ['Venue', 'Band', 'Booking', 'PR', 'Press', 'Label', 'Management', 'Collaborator', 'Fan', 'Other']

const PEOPLE_TAG_COLORS = {
  Venue:        { hex: '#3b82f6', bg: 'rgba(59,130,246,0.12)',   border: 'rgba(59,130,246,0.30)' },
  Band:         { hex: '#a855f7', bg: 'rgba(168,85,247,0.12)',   border: 'rgba(168,85,247,0.30)' },
  Booking:      { hex: '#f59e0b', bg: 'rgba(245,158,11,0.12)',   border: 'rgba(245,158,11,0.30)' },
  PR:           { hex: '#ec4899', bg: 'rgba(236,72,153,0.12)',   border: 'rgba(236,72,153,0.30)' },
  Press:        { hex: '#06b6d4', bg: 'rgba(6,182,212,0.12)',    border: 'rgba(6,182,212,0.30)' },
  Label:        { hex: '#8b5cf6', bg: 'rgba(139,92,246,0.12)',   border: 'rgba(139,92,246,0.30)' },
  Management:   { hex: '#6366f1', bg: 'rgba(99,102,241,0.12)',   border: 'rgba(99,102,241,0.30)' },
  Collaborator: { hex: '#2dd4bf', bg: 'rgba(45,212,191,0.12)',   border: 'rgba(45,212,191,0.30)' },
  Fan:          { hex: '#4ade80', bg: 'rgba(74,222,128,0.12)',   border: 'rgba(74,222,128,0.30)' },
  Other:        { hex: '#6b7280', bg: 'rgba(107,114,128,0.12)',  border: 'rgba(107,114,128,0.30)' },
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtRelativeDate(iso) {
  if (!iso) return null
  try {
    const d = new Date(iso.includes('T') ? iso : iso + 'T00:00:00')
    const now = new Date()
    const diffMs = now - d
    const diffDays = Math.floor(diffMs / 86400000)
    if (diffDays < 0) return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    if (diffDays === 0) return 'Today'
    if (diffDays === 1) return '1 day ago'
    if (diffDays < 30) return `${diffDays} days ago`
    if (diffDays < 365) {
      const months = Math.floor(diffDays / 30)
      return months === 1 ? '1 month ago' : `${months} months ago`
    }
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  } catch {
    return iso.slice(0, 10)
  }
}

function fmtDateTime(iso) {
  if (!iso) return ''
  try {
    const d = new Date(iso.includes('T') ? iso : iso + 'T00:00:00')
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) +
      ' · ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  } catch {
    return iso.slice(0, 10)
  }
}

function truncateUrl(url, max = 40) {
  if (!url) return ''
  const display = url.replace(/^https?:\/\/(www\.)?/, '')
  return display.length > max ? display.slice(0, max) + '…' : display
}

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

// ─── Shared Styles ────────────────────────────────────────────────────────────

const fieldStyle = {
  background: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(255,255,255,0.10)',
  borderRadius: 8,
  color: 'rgba(255,255,255,0.90)',
  padding: '9px 12px',
  fontSize: 13,
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box',
  transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
}

const saveBtnStyle = {
  background: 'linear-gradient(135deg, rgba(124,106,247,0.80) 0%, rgba(99,102,241,0.70) 100%)',
  border: '1px solid rgba(124,106,247,0.60)',
  borderRadius: 8,
  boxShadow: '0 4px 16px rgba(124,106,247,0.25), inset 0 1px 0 rgba(255,255,255,0.15)',
  color: '#ffffff',
  padding: '9px 18px',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
  transition: 'all 150ms ease',
}

const cancelBtnStyle = {
  background: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 8,
  color: 'rgba(255,255,255,0.65)',
  padding: '9px 18px',
  fontSize: 13,
  cursor: 'pointer',
  transition: 'all 150ms ease',
}

// ─── Status Badge ─────────────────────────────────────────────────────────────

function StatusBadge({ value, style: extraStyle = {} }) {
  const s = STATUS_MAP[value] || STATUS_MAP['not_contacted']
  return (
    <span style={{
      display: 'inline-block',
      fontSize: 10,
      fontWeight: 700,
      letterSpacing: '0.05em',
      textTransform: 'uppercase',
      padding: '2px 8px',
      borderRadius: 20,
      background: s.bg,
      color: s.color,
      border: `1px solid ${s.border}`,
      whiteSpace: 'nowrap',
      ...extraStyle,
    }}>
      {s.label}
    </span>
  )
}

// ─── Company Category Badge ────────────────────────────────────────────────────

function CompanyCatBadge({ cat }) {
  const c = COMPANY_CAT_COLORS[cat] || { color: '#9595b8', bg: 'rgba(149,149,184,0.1)', border: 'rgba(149,149,184,0.25)' }
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
      padding: '2px 8px', borderRadius: 4,
      background: c.bg, color: c.color, border: `1px solid ${c.border}`,
    }}>
      {cat}
    </span>
  )
}

// ─── People Category Badge ─────────────────────────────────────────────────────

function PeopleCatBadge({ cat }) {
  const c = PEOPLE_CAT_COLORS[cat] || PEOPLE_CAT_COLORS['Other']
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
      padding: '2px 8px', borderRadius: 4,
      background: c.bg, color: c.color, border: `1px solid ${c.border}`,
    }}>
      {cat || 'Other'}
    </span>
  )
}

// ─── People Tag Badge ──────────────────────────────────────────────────────────

function TagBadge({ tag }) {
  const t = PEOPLE_TAG_COLORS[tag] || PEOPLE_TAG_COLORS['Other']
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
      padding: '2px 8px', borderRadius: 4,
      background: t.bg, color: t.hex, border: `1px solid ${t.border}`,
    }}>
      {tag || 'Other'}
    </span>
  )
}

// ─── Outreach Timeline Entry ──────────────────────────────────────────────────

function OutreachEntry({ entry, onDelete }) {
  const [hovering, setHovering] = useState(false)
  const isSent = entry.direction === 'sent'
  return (
    <div
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      style={{
        display: 'flex', gap: 12, padding: '12px 0',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        position: 'relative',
      }}
    >
      <div style={{
        width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
        background: isSent ? 'rgba(124,106,247,0.15)' : 'rgba(74,222,128,0.1)',
        border: `1px solid ${isSent ? 'rgba(124,106,247,0.3)' : 'rgba(74,222,128,0.25)'}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 12, color: isSent ? '#a89fff' : '#4ade80',
        marginTop: 1,
      }}>
        {isSent ? '→' : '←'}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.40)', marginBottom: 4 }}>
          <span style={{ color: isSent ? '#a89fff' : '#4ade80', fontWeight: 600 }}>
            {isSent ? 'Sent' : 'Received'}
          </span>
          <span style={{ marginLeft: 8 }}>
            {entry.contacted_at ? fmtDateTime(entry.contacted_at) : fmtDateTime(entry.created_at)}
          </span>
        </div>
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.80)', lineHeight: 1.55, wordBreak: 'break-word' }}>
          {entry.message || entry.notes || '(no content)'}
        </div>
      </div>
      {hovering && (
        <button
          onClick={() => onDelete(entry.id)}
          style={{
            position: 'absolute', top: 12, right: 0,
            background: 'transparent', border: 'none',
            color: 'rgba(255,255,255,0.30)', cursor: 'pointer', fontSize: 16, lineHeight: 1,
            transition: 'color 0.12s', padding: '2px 4px',
          }}
          onMouseEnter={e => { e.currentTarget.style.color = '#ff6b6b' }}
          onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.30)' }}
          title="Delete entry"
        >×</button>
      )}
    </div>
  )
}

// ─── Outreach Log Form (shared) ───────────────────────────────────────────────

function OutreachLogForm({ onSubmit }) {
  const [direction,    setDirection]    = useState('sent')
  const [message,      setMessage]      = useState('')
  const [dateOverride, setDateOverride] = useState('')
  const [submitting,   setSubmitting]   = useState(false)
  const textareaRef = useRef(null)

  const handleLog = async () => {
    if (!message.trim()) return
    setSubmitting(true)
    try {
      await onSubmit({ direction, message: message.trim(), contacted_at: dateOverride || todayISO() })
      setMessage('')
      setDateOverride('')
    } catch (e) {
      console.error('Failed to log message', e)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={{
      padding: '20px 28px 28px',
      borderTop: '1px solid rgba(255,255,255,0.07)',
      background: 'rgba(10,10,18,0.80)',
      backdropFilter: 'blur(16px)',
      WebkitBackdropFilter: 'blur(16px)',
      position: 'sticky', bottom: 0,
    }}>
      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.30)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 12 }}>
        Log Message
      </div>

      <div style={{ display: 'flex', gap: 0, marginBottom: 12, border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, overflow: 'hidden', width: 'fit-content' }}>
        {['sent', 'received'].map(d => (
          <button
            key={d}
            onClick={() => setDirection(d)}
            style={{
              padding: '6px 16px',
              background: direction === d ? 'rgba(124,106,247,0.18)' : 'transparent',
              border: 'none',
              color: direction === d ? '#a89fff' : 'rgba(255,255,255,0.45)',
              fontSize: 12, fontWeight: direction === d ? 600 : 400,
              cursor: 'pointer', transition: 'all 0.12s',
              textTransform: 'capitalize',
              letterSpacing: '0.03em',
            }}
          >
            {d === 'sent' ? '→ Sent' : '← Received'}
          </button>
        ))}
      </div>

      <textarea
        ref={textareaRef}
        placeholder="Message content…"
        value={message}
        onChange={e => setMessage(e.target.value)}
        rows={3}
        style={{
          ...fieldStyle,
          resize: 'vertical',
          minHeight: 72,
          marginBottom: 10,
          display: 'block',
        }}
      />

      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <input
          type="date"
          value={dateOverride}
          onChange={e => setDateOverride(e.target.value)}
          style={{ ...fieldStyle, width: 'auto', flex: '0 0 auto', fontSize: 12, padding: '7px 10px' }}
        />
        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.30)', whiteSpace: 'nowrap' }}>or defaults to today</span>
        <div style={{ flex: 1 }} />
        <button
          onClick={handleLog}
          disabled={!message.trim() || submitting}
          style={{
            ...saveBtnStyle,
            opacity: (!message.trim() || submitting) ? 0.45 : 1,
            cursor: (!message.trim() || submitting) ? 'not-allowed' : 'pointer',
            whiteSpace: 'nowrap',
          }}
          onMouseEnter={e => { if (message.trim() && !submitting) e.currentTarget.style.background = '#9085f9' }}
          onMouseLeave={e => { e.currentTarget.style.background = '#7c6af7' }}
        >
          {submitting ? 'Logging…' : 'Log Message'}
        </button>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════════
// COMPANIES TAB
// ════════════════════════════════════════════════════════════════════════════════

// ─── Company Detail Modal ─────────────────────────────────────────────────────

function CompanyDetailModal({ source, contacts = [], onClose, onStatusChange, onPersonAdded }) {
  const isMobile = useIsMobile()
  const [outreach,        setOutreach]        = useState([])
  const [loadingLog,      setLoadingLog]      = useState(true)
  const [status,          setStatus]          = useState(source.outreach_status || 'not_contacted')
  const [showAddPerson,   setShowAddPerson]   = useState(false)
  const [selectedPerson,  setSelectedPerson]  = useState(null)

  // People who belong to this company
  const companyPeople = contacts.filter(
    c => c.name && c.company?.toLowerCase() === source.title?.toLowerCase()
  )

  const loadOutreach = () => {
    setLoadingLog(true)
    api.outreach({ source_id: source.id })
      .then(data => setOutreach(Array.isArray(data) ? data : []))
      .catch(() => setOutreach([]))
      .finally(() => setLoadingLog(false))
  }

  useEffect(() => { loadOutreach() }, [source.id])

  const handleStatusChange = async (newStatus) => {
    setStatus(newStatus)
    await api.updateSource(source.id, { outreach_status: newStatus })
    onStatusChange(source.id, newStatus)
  }

  const handleDelete = async (id) => {
    await api.deleteOutreach(id)
    loadOutreach()
  }

  const cat = source.used_for || 'Other'
  const sortedOutreach = [...outreach].sort((a, b) => {
    const ta = a.contacted_at || a.created_at || ''
    const tb = b.contacted_at || b.created_at || ''
    return tb.localeCompare(ta)
  })

  return (
    <div
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.72)',
        backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: isMobile ? 'flex-end' : 'flex-start',
        justifyContent: isMobile ? 'stretch' : 'flex-end',
        zIndex: 200,
      }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={isMobile ? {
          width: '100%',
          maxHeight: '90vh',
          overflowY: 'auto',
          background: 'rgba(12,12,20,0.97)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          border: '1px solid rgba(255,255,255,0.12)',
          // iOS standard: 20px top radius
          borderRadius: '20px 20px 0 0',
          boxShadow: '0 -8px 40px rgba(0,0,0,0.5)',
          display: 'flex',
          flexDirection: 'column',
          // iOS spring physics transition
          transition: 'transform 0.35s cubic-bezier(0.32, 0.72, 0, 1)',
          overscrollBehavior: 'contain',
          WebkitOverflowScrolling: 'touch',
          // Safe area for home indicator
          paddingBottom: 'env(safe-area-inset-bottom, 16px)',
        } : {
          width: 520,
          maxWidth: '95vw',
          height: '100vh',
          overflowY: 'auto',
          background: 'rgba(12,12,20,0.85)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          borderLeft: '1px solid rgba(255,255,255,0.10)',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Header */}
        <div style={{ borderBottom: '1px solid rgba(255,255,255,0.07)', position: 'sticky', top: 0, background: 'rgba(12,12,20,0.90)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', zIndex: 10, borderRadius: isMobile ? '20px 20px 0 0' : 0, overflow: 'hidden' }}>
          {/* Drag handle pill — iOS standard */}
          {isMobile && (
            <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 12, paddingBottom: 4 }}>
              <div style={{ width: 36, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.2)' }} />
            </div>
          )}
          <div style={{ padding: isMobile ? '12px 20px 20px' : '24px 28px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h2 style={{ fontSize: 20, fontWeight: 700, color: 'rgba(255,255,255,0.88)', margin: '0 0 6px', lineHeight: 1.2 }}>
                {source.title}
              </h2>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                {source.url && (
                  <a href={source.url} target="_blank" rel="noopener noreferrer"
                    style={{ fontSize: 12, color: '#7c6af7', textDecoration: 'underline' }}>
                    {truncateUrl(source.url, 48)}
                  </a>
                )}
                <CompanyCatBadge cat={cat} />
              </div>
            </div>
            {/* 44×44 touch target on mobile */}
            <button onClick={onClose}
              style={{
                background: isMobile ? 'rgba(255,255,255,0.07)' : 'transparent',
                border: isMobile ? '1px solid rgba(255,255,255,0.10)' : 'none',
                borderRadius: isMobile ? 8 : 0,
                color: 'rgba(255,255,255,0.55)', cursor: 'pointer', fontSize: 20, lineHeight: 1, flexShrink: 0,
                // 44×44 on mobile
                minWidth: isMobile ? 44 : 'auto',
                minHeight: isMobile ? 44 : 'auto',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'color 0.12s',
              }}
              onMouseEnter={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.88)' }}
              onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.55)' }}
            >×</button>
          </div>

          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.30)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>Status</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {STATUSES.map(s => (
                <button key={s.value} onClick={() => handleStatusChange(s.value)}
                  style={{
                    background: status === s.value ? s.bg : 'transparent',
                    border: `1px solid ${status === s.value ? s.border : 'rgba(255,255,255,0.10)'}`,
                    borderRadius: 20,
                    color: status === s.value ? s.color : 'rgba(255,255,255,0.45)',
                    fontSize: 11, fontWeight: status === s.value ? 700 : 400,
                    letterSpacing: '0.04em', padding: '4px 12px',
                    cursor: 'pointer', transition: 'all 0.12s', textTransform: 'uppercase',
                  }}
                  onMouseEnter={e => { if (status !== s.value) { e.currentTarget.style.borderColor = s.border; e.currentTarget.style.color = s.color } }}
                  onMouseLeave={e => { if (status !== s.value) { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.10)'; e.currentTarget.style.color = 'rgba(255,255,255,0.45)' } }}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Outreach log */}
        <div style={{ flex: 1, padding: '20px 28px 0' }}>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.30)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 12 }}>
            Outreach Log
            {outreach.length > 0 && (
              <span style={{ marginLeft: 8, color: '#a89fff', fontWeight: 700 }}>{outreach.length}</span>
            )}
          </div>

          {loadingLog ? (
            <div style={{ color: 'rgba(255,255,255,0.30)', fontSize: 13, padding: '16px 0' }}>Loading…</div>
          ) : sortedOutreach.length === 0 ? (
            <div style={{ background: 'rgba(255,255,255,0.04)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, boxShadow: '0 4px 24px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.06)', padding: '24px', textAlign: 'center', marginBottom: 20 }}>
              <div style={{ fontSize: 20, color: 'rgba(255,255,255,0.12)', marginBottom: 8 }}>◎</div>
              <div style={{ color: 'rgba(255,255,255,0.40)', fontSize: 13 }}>No messages logged yet.</div>
            </div>
          ) : (
            <div>
              {sortedOutreach.map(entry => (
                <OutreachEntry key={entry.id} entry={entry} onDelete={handleDelete} />
              ))}
            </div>
          )}
        </div>

        {/* People section */}
        <div style={{ padding: '0 28px', marginTop: 16, marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.30)', letterSpacing: '0.08em', textTransform: 'uppercase', fontVariant: 'small-caps' }}>
              People
              {companyPeople.length > 0 && (
                <span style={{ marginLeft: 8, color: '#a78bfa', fontWeight: 700 }}>{companyPeople.length}</span>
              )}
            </div>
            <button
              onClick={() => setShowAddPerson(true)}
              style={{
                background: 'rgba(167,139,250,0.10)',
                border: '1px solid rgba(167,139,250,0.28)',
                borderRadius: 6,
                color: '#a78bfa',
                fontSize: 11,
                fontWeight: 600,
                padding: '3px 10px',
                cursor: 'pointer',
                transition: 'background 0.12s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(167,139,250,0.20)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(167,139,250,0.10)' }}
            >
              + Add person
            </button>
          </div>

          {companyPeople.length === 0 ? (
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.28)', padding: '8px 0 4px', fontStyle: 'italic' }}>
              No people linked to this company yet.
            </div>
          ) : (
            <div>
              {companyPeople.map(person => {
                const avatarColor = nameInitialColor(person.name)
                const initial = person.name ? person.name.charAt(0).toUpperCase() : '?'
                return (
                  <div
                    key={person.id}
                    onClick={() => setSelectedPerson(person)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '6px 0',
                      borderBottom: '1px solid rgba(255,255,255,0.05)',
                      cursor: 'pointer',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.03)' }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                  >
                    <div style={{
                      width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
                      background: `${avatarColor}22`,
                      border: `1px solid ${avatarColor}55`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 11, fontWeight: 700, color: avatarColor,
                      userSelect: 'none',
                    }}>
                      {initial}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ fontSize: 13, fontWeight: 500, color: 'rgba(255,255,255,0.85)' }}>
                        {person.name}
                      </span>
                      {person.role && (
                        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.40)', marginLeft: 6 }}>
                          {person.role}
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Add-person modal (pre-fills company) */}
        {showAddPerson && (
          <ContactFormModal
            initial={{ company: source.title }}
            contacts={contacts}
            onClose={() => setShowAddPerson(false)}
            onSave={async (form) => {
              await api.createContact(form)
              setShowAddPerson(false)
              if (onPersonAdded) onPersonAdded()
            }}
          />
        )}

        {/* Person detail modal opened from within company drawer */}
        {selectedPerson && (
          <PersonDetailModal
            contact={selectedPerson}
            onClose={() => setSelectedPerson(null)}
            onStatusChange={() => {}}
            onEdit={() => {}}
            onDelete={async () => { setSelectedPerson(null) }}
          />
        )}

        <OutreachLogForm onSubmit={async ({ direction, message, contacted_at }) => {
          await api.createOutreach({ source_id: source.id, direction, message, contacted_at })
          loadOutreach()
        }} />
      </div>
    </div>
  )
}

// ─── Company Card ─────────────────────────────────────────────────────────────

function CompanyCard({ source, onOpen, onStatusChange }) {
  const [hovered,    setHovered]    = useState(false)
  const [showSelect, setShowSelect] = useState(false)
  const status   = source.outreach_status || 'not_contacted'
  const relDate  = fmtRelativeDate(source.last_contacted)
  const msgCount = source.outreach_count || 0

  const handleStatusChange = async (e) => {
    e.stopPropagation()
    const newStatus = e.target.value
    await api.updateSource(source.id, { outreach_status: newStatus })
    onStatusChange(source.id, newStatus)
    setShowSelect(false)
  }

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); setShowSelect(false) }}
      onClick={() => onOpen(source)}
      style={{
        background: hovered ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.04)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 10,
        padding: '14px 16px',
        cursor: 'pointer',
        boxShadow: hovered ? '0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.10), 0 0 0 1px rgba(255,255,255,0.12)' : '0 4px 24px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.06)',
        transition: 'box-shadow 150ms ease, background 150ms ease',
        position: 'relative',
        marginBottom: 8,
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.88)', marginBottom: 4, paddingRight: hovered ? 80 : 0, transition: 'padding 0.12s' }}>
        {source.title}
      </div>

      {source.url && (
        <a
          href={source.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={e => e.stopPropagation()}
          style={{ display: 'block', fontSize: 11, color: 'rgba(255,255,255,0.45)', textDecoration: 'none', marginBottom: 8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 180 }}
          onMouseEnter={e => { e.currentTarget.style.color = '#7c6af7'; e.currentTarget.style.textDecoration = 'underline' }}
          onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.45)'; e.currentTarget.style.textDecoration = 'none' }}
        >
          {truncateUrl(source.url, 30)}
        </a>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <StatusBadge value={status} />
        {msgCount > 0 && (
          <span style={{ fontSize: 10, fontWeight: 600, color: '#7c6af7', background: 'rgba(124,106,247,0.12)', border: '1px solid rgba(124,106,247,0.22)', borderRadius: 20, padding: '2px 7px' }}>
            {msgCount} {msgCount === 1 ? 'message' : 'messages'}
          </span>
        )}
        {relDate && <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.40)', marginLeft: 2 }}>{relDate}</span>}
      </div>

      {hovered && (
        <div style={{ position: 'absolute', top: 12, right: 12 }} onClick={e => e.stopPropagation()}>
          {showSelect ? (
            <select
              autoFocus
              value={status}
              onChange={handleStatusChange}
              onBlur={() => setShowSelect(false)}
              style={{ ...fieldStyle, fontSize: 11, padding: '3px 7px', width: 'auto', minWidth: 120, cursor: 'pointer' }}
            >
              {STATUSES.map(s => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          ) : (
            <button
              onClick={e => { e.stopPropagation(); setShowSelect(true) }}
              style={{
                background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6,
                color: 'rgba(255,255,255,0.55)', fontSize: 10, fontWeight: 600, padding: '3px 8px',
                cursor: 'pointer', letterSpacing: '0.04em', transition: 'color 0.12s, border-color 0.12s', whiteSpace: 'nowrap',
              }}
              onMouseEnter={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.88)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.22)' }}
              onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.55)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)' }}
            >
              ⇅ Status
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Category Column ──────────────────────────────────────────────────────────

function CategoryColumn({ cat, sources, onOpen, onStatusChange }) {
  const c = COMPANY_CAT_COLORS[cat] || { color: '#9595b8', bg: 'rgba(149,149,184,0.06)', border: 'rgba(149,149,184,0.15)' }
  return (
    <div style={{ flex: '1 1 0', minWidth: 220, maxWidth: 340, display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, paddingBottom: 12, borderBottom: `2px solid ${c.color}33` }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: c.color, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{cat}</span>
        <span style={{ fontSize: 10, fontWeight: 700, color: c.color, background: c.bg, border: `1px solid ${c.border}`, borderRadius: 20, padding: '1px 7px' }}>
          {sources.length}
        </span>
      </div>

      <div style={{ flex: 1 }}>
        {sources.length === 0 ? (
          <div style={{ border: '1px dashed rgba(255,255,255,0.08)', borderRadius: 10, padding: '24px 16px', textAlign: 'center' }}>
            <div style={{ color: 'rgba(255,255,255,0.30)', fontSize: 12 }}>No companies</div>
          </div>
        ) : (
          sources.map(s => (
            <CompanyCard key={s.id} source={s} onOpen={onOpen} onStatusChange={onStatusChange} />
          ))
        )}
      </div>
    </div>
  )
}

// ─── Add Company Modal ────────────────────────────────────────────────────────

function AddCompanyModal({ onClose, onSaved }) {
  const CATS = ['Marketing', 'Management', 'Booking', 'PR', 'Label']
  const [form, setForm] = useState({ title: '', url: '', used_for: 'Marketing', description: '' })
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSave = async () => {
    if (!form.title.trim()) return
    setSaving(true)
    try {
      await api.createSource({
        title: form.title.trim(),
        url: form.url.trim() || null,
        source_type: 'service',
        used_for: form.used_for,
        description: form.description.trim() || null,
      })
      onSaved()
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }} onClick={onClose}>
      <div style={{ background: 'rgba(255,255,255,0.07)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 16, boxShadow: '0 8px 40px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.10)', padding: 28, width: 420, maxWidth: '92vw' }} onClick={e => e.stopPropagation()}>
        <h3 style={{ fontSize: 16, fontWeight: 600, color: 'rgba(255,255,255,0.88)', margin: '0 0 20px' }}>Add Company</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input autoFocus placeholder="Company name *" value={form.title} onChange={e => set('title', e.target.value)}
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 8, color: 'rgba(255,255,255,0.90)', padding: '9px 12px', fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box' }} />
          <input placeholder="Website URL" value={form.url} onChange={e => set('url', e.target.value)}
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 8, color: 'rgba(255,255,255,0.90)', padding: '9px 12px', fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box' }} />
          <select value={form.used_for} onChange={e => set('used_for', e.target.value)}
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 8, color: 'rgba(255,255,255,0.90)', padding: '9px 12px', fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box' }}>
            {CATS.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <textarea placeholder="Notes (optional)" value={form.description} onChange={e => set('description', e.target.value)} rows={3}
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 8, color: 'rgba(255,255,255,0.90)', padding: '9px 12px', fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit' }} />
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, color: 'rgba(255,255,255,0.65)', padding: '8px 18px', fontSize: 13, cursor: 'pointer' }}>Cancel</button>
          <button onClick={handleSave} disabled={saving || !form.title.trim()} style={{ background: saving || !form.title.trim() ? 'rgba(255,255,255,0.08)' : 'linear-gradient(135deg, rgba(124,106,247,0.80) 0%, rgba(99,102,241,0.70) 100%)', border: saving || !form.title.trim() ? 'none' : '1px solid rgba(124,106,247,0.60)', borderRadius: 8, color: saving || !form.title.trim() ? 'rgba(255,255,255,0.30)' : '#fff', padding: '8px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            {saving ? 'Saving…' : 'Add Company'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Companies Tab ────────────────────────────────────────────────────────────

function CompaniesTab() {
  const [sources,   setSources]   = useState([])
  const [contacts,  setContacts]  = useState([])
  const [loading,   setLoading]   = useState(true)
  const [selected,  setSelected]  = useState(null)
  const [showAdd,   setShowAdd]   = useState(false)

  const load = () => {
    setLoading(true)
    Promise.all([
      api.sources().catch(() => []),
      api.contacts().catch(() => []),
    ]).then(([srcs, cts]) => {
      setSources(Array.isArray(srcs) ? srcs : [])
      setContacts(Array.isArray(cts) ? cts : [])
    }).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const handleStatusChange = (id, newStatus) => {
    setSources(prev => prev.map(s => s.id === id ? { ...s, outreach_status: newStatus } : s))
  }

  const handleModalStatusChange = (id, newStatus) => {
    handleStatusChange(id, newStatus)
    setSelected(prev => prev && prev.id === id ? { ...prev, outreach_status: newStatus } : prev)
  }

  const total  = sources.length
  const notYet = sources.filter(s => !s.outreach_status || s.outreach_status === 'not_contacted').length

  const grouped = {}
  COMPANY_CATEGORIES.forEach(cat => {
    grouped[cat] = sources.filter(s => {
      if (!s.used_for) return false
      return s.used_for.trim().toLowerCase().includes(cat.toLowerCase())
    })
  })

  return (
    <>
      {selected && (
        <CompanyDetailModal
          source={selected}
          contacts={contacts}
          onClose={() => setSelected(null)}
          onStatusChange={handleModalStatusChange}
          onPersonAdded={load}
        />
      )}
      {showAdd && (
        <AddCompanyModal onClose={() => setShowAdd(false)} onSaved={load} />
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 14, margin: 0 }}>
          {loading ? 'Loading…' : (
            <>
              {total} {total === 1 ? 'company' : 'companies'}
              {notYet > 0 && <span style={{ color: 'rgba(255,255,255,0.30)', marginLeft: 8 }}>· {notYet} not yet contacted</span>}
            </>
          )}
        </p>
        <button
          onClick={() => setShowAdd(true)}
          style={{ background: 'linear-gradient(135deg, rgba(124,106,247,0.80) 0%, rgba(99,102,241,0.70) 100%)', border: '1px solid rgba(124,106,247,0.60)', borderRadius: 8, boxShadow: '0 4px 16px rgba(124,106,247,0.25), inset 0 1px 0 rgba(255,255,255,0.15)', color: '#fff', padding: '7px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer', transition: 'all 150ms ease' }}
          onMouseEnter={e => { e.currentTarget.style.background = 'linear-gradient(135deg, rgba(124,106,247,0.90) 0%, rgba(99,102,241,0.80) 100%)'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(124,106,247,0.40), inset 0 1px 0 rgba(255,255,255,0.20)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'linear-gradient(135deg, rgba(124,106,247,0.80) 0%, rgba(99,102,241,0.70) 100%)'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(124,106,247,0.25), inset 0 1px 0 rgba(255,255,255,0.15)' }}
          onMouseDown={e => { e.currentTarget.style.transform = 'scale(0.97)'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(124,106,247,0.30)' }}
          onMouseUp={e => { e.currentTarget.style.transform = 'scale(1)' }}
        >
          + Add Company
        </button>
      </div>

      {loading ? (
        <div style={{ color: 'rgba(255,255,255,0.30)', fontSize: 14 }}>Loading…</div>
      ) : (
        <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start', overflowX: 'auto', paddingBottom: 24 }}>
          {COMPANY_CATEGORIES.map(cat => (
            <CategoryColumn
              key={cat}
              cat={cat}
              sources={grouped[cat] || []}
              onOpen={setSelected}
              onStatusChange={handleStatusChange}
            />
          ))}
        </div>
      )}
    </>
  )
}

// ════════════════════════════════════════════════════════════════════════════════
// PEOPLE TAB
// ════════════════════════════════════════════════════════════════════════════════

// ─── Add/Edit Contact Modal ───────────────────────────────────────────────────

function ContactFormModal({ initial, contacts = [], onClose, onSave }) {
  const blank = { name: '', role: '', company: '', category: 'Other', tag: 'Other', city: '', state: '', email: '', phone: '', notes: '', social_links: {} }
  const [form,        setForm]        = useState(initial ? { ...blank, ...initial, social_links: initial.social_links || {} } : blank)
  const [roles,       setRoles]       = useState(Array.isArray(initial?.roles) ? initial.roles : [])
  const [newRoleBand, setNewRoleBand] = useState('')
  const [newRoleRole, setNewRoleRole] = useState('')
  const [submitting,  setSubmitting]  = useState(false)
  const isEdit = !!initial?.id

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  // Duplicate detection (client-side, case-insensitive, only when adding)
  const dupMatch = !isEdit && form.name.trim()
    ? contacts.find(c => c.name.toLowerCase() === form.name.trim().toLowerCase())
    : null

  const handleAddRole = () => {
    if (!newRoleBand.trim() && !newRoleRole.trim()) return
    const entry = { band: newRoleBand.trim(), role: newRoleRole.trim() }
    if (!roles.some(r => r.band === entry.band && r.role === entry.role)) {
      setRoles(prev => [...prev, entry])
    }
    setNewRoleBand('')
    setNewRoleRole('')
  }

  const handleRemoveRole = (idx) => {
    setRoles(prev => prev.filter((_, i) => i !== idx))
  }

  const handleSubmit = async () => {
    if (!form.name.trim()) return
    setSubmitting(true)
    try {
      await onSave({ ...form, roles })
    } finally {
      setSubmitting(false)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey && e.target.tagName !== 'TEXTAREA') {
      e.preventDefault()
      handleSubmit()
    }
    if (e.key === 'Escape') onClose()
  }

  const smallFieldStyle = {
    ...fieldStyle,
    fontSize: 12,
    padding: '6px 10px',
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300 }}
      onClick={onClose}>
      <div style={{ background: 'rgba(255,255,255,0.07)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 16, boxShadow: '0 8px 40px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.10)', padding: 28, width: 480, maxWidth: '92vw', maxHeight: '90vh', overflowY: 'auto' }}
        onClick={e => e.stopPropagation()} onKeyDown={handleKeyDown}>
        <h3 style={{ fontSize: 16, fontWeight: 600, color: 'rgba(255,255,255,0.88)', margin: '0 0 20px' }}>
          {isEdit ? 'Edit Contact' : 'Add Contact'}
        </h3>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <input
              autoFocus
              placeholder="Name *"
              value={form.name}
              onChange={e => set('name', e.target.value)}
              style={fieldStyle}
            />
            {dupMatch && (
              <div style={{ fontSize: 11, color: '#fbbf24', marginTop: 4 }}>
                ⚠ {dupMatch.name} already exists — adding this will merge the role into their record
              </div>
            )}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <input
              placeholder="Role (e.g. Booking Agent)"
              value={form.role}
              onChange={e => set('role', e.target.value)}
              style={fieldStyle}
            />
            <input
              placeholder="Company (optional)"
              value={form.company}
              onChange={e => set('company', e.target.value)}
              style={fieldStyle}
            />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <select value={form.category} onChange={e => set('category', e.target.value)} style={fieldStyle}>
              {['Musician', 'Venue', 'Promoter', 'Press', 'Management', 'Other'].map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <select value={form.tag || 'Other'} onChange={e => set('tag', e.target.value)} style={fieldStyle}>
              {PEOPLE_TAGS.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: 10 }}>
            <input
              placeholder="City (optional)"
              value={form.city || ''}
              onChange={e => set('city', e.target.value)}
              style={fieldStyle}
            />
            <input
              placeholder="State (optional)"
              value={form.state || ''}
              onChange={e => set('state', e.target.value)}
              style={fieldStyle}
            />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <input
              type="email"
              placeholder="Email (optional)"
              value={form.email}
              onChange={e => set('email', e.target.value)}
              style={fieldStyle}
            />
            <input
              placeholder="Phone (optional)"
              value={form.phone}
              onChange={e => set('phone', e.target.value)}
              style={fieldStyle}
            />
          </div>
          {/* Social Links section */}
          <div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.30)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>
              Social Links
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <input
                placeholder="Instagram — @handle or URL"
                value={(form.social_links || {}).instagram || ''}
                onChange={e => set('social_links', { ...(form.social_links || {}), instagram: e.target.value })}
                style={fieldStyle}
              />
              <input
                placeholder="Twitter/X — @handle or URL"
                value={(form.social_links || {}).twitter || ''}
                onChange={e => set('social_links', { ...(form.social_links || {}), twitter: e.target.value })}
                style={fieldStyle}
              />
              <input
                placeholder="Spotify — Artist URL"
                value={(form.social_links || {}).spotify || ''}
                onChange={e => set('social_links', { ...(form.social_links || {}), spotify: e.target.value })}
                style={fieldStyle}
              />
              <input
                placeholder="Bandcamp — URL"
                value={(form.social_links || {}).bandcamp || ''}
                onChange={e => set('social_links', { ...(form.social_links || {}), bandcamp: e.target.value })}
                style={fieldStyle}
              />
              <input
                placeholder="YouTube — Channel URL"
                value={(form.social_links || {}).youtube || ''}
                onChange={e => set('social_links', { ...(form.social_links || {}), youtube: e.target.value })}
                style={fieldStyle}
              />
              <input
                placeholder="Website — https://..."
                value={(form.social_links || {}).website || ''}
                onChange={e => set('social_links', { ...(form.social_links || {}), website: e.target.value })}
                style={fieldStyle}
              />
              <input
                placeholder="Facebook — URL"
                value={(form.social_links || {}).facebook || ''}
                onChange={e => set('social_links', { ...(form.social_links || {}), facebook: e.target.value })}
                style={fieldStyle}
              />
            </div>
          </div>

          <textarea
            placeholder="Notes (optional)"
            value={form.notes}
            onChange={e => set('notes', e.target.value)}
            rows={3}
            style={{ ...fieldStyle, resize: 'vertical', minHeight: 70 }}
          />

          {/* Roles section */}
          <div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.30)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>
              Roles
            </div>
            {roles.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 8 }}>
                {roles.map((r, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, padding: '5px 10px' }}>
                    <span style={{ flex: 1, fontSize: 12, color: 'rgba(255,255,255,0.70)' }}>
                      {r.role && r.band ? `${r.role} @ ${r.band}` : r.role || (r.band ? `@ ${r.band}` : '—')}
                    </span>
                    <button
                      onClick={() => handleRemoveRole(i)}
                      style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.30)', cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: '1px 3px', transition: 'color 0.12s' }}
                      onMouseEnter={e => { e.currentTarget.style.color = '#ff6b6b' }}
                      onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.30)' }}
                      title="Remove role"
                    >×</button>
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 8, alignItems: 'center' }}>
              <input
                placeholder="Band"
                value={newRoleBand}
                onChange={e => setNewRoleBand(e.target.value)}
                style={smallFieldStyle}
              />
              <input
                placeholder="Role"
                value={newRoleRole}
                onChange={e => setNewRoleRole(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddRole() } }}
                style={smallFieldStyle}
              />
              <button
                onClick={handleAddRole}
                style={{ background: 'rgba(124,106,247,0.15)', border: '1px solid rgba(124,106,247,0.30)', borderRadius: 6, color: '#a89fff', fontSize: 16, fontWeight: 600, cursor: 'pointer', padding: '4px 10px', lineHeight: 1, transition: 'background 0.12s' }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(124,106,247,0.28)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(124,106,247,0.15)' }}
                title="Add role"
              >+</button>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={cancelBtnStyle}
            onMouseEnter={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.88)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.22)' }}
            onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.55)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)' }}>
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!form.name.trim() || submitting}
            style={{
              ...saveBtnStyle,
              opacity: (!form.name.trim() || submitting) ? 0.45 : 1,
              cursor: (!form.name.trim() || submitting) ? 'not-allowed' : 'pointer',
            }}
            onMouseEnter={e => { if (form.name.trim() && !submitting) e.currentTarget.style.background = '#9085f9' }}
            onMouseLeave={e => { e.currentTarget.style.background = '#7c6af7' }}
          >
            {submitting ? 'Saving…' : (isEdit ? 'Save Changes' : 'Add Contact')}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Confirm Delete Modal ─────────────────────────────────────────────────────

function ConfirmDeleteModal({ label, onCancel, onConfirm }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 400 }}
      onClick={onCancel}>
      <div style={{ background: 'rgba(255,255,255,0.07)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 16, boxShadow: '0 8px 40px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.10)', padding: 28, width: 360, maxWidth: '90vw', textAlign: 'center' }}
        onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 22, marginBottom: 12, color: '#ff6b6b' }}>⚠</div>
        <div style={{ fontSize: 15, fontWeight: 600, color: 'rgba(255,255,255,0.88)', marginBottom: 6 }}>Delete Contact?</div>
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', marginBottom: 24 }}>"{label}" will be permanently removed.</div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
          <button onClick={onCancel} style={cancelBtnStyle}
            onMouseEnter={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.88)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.22)' }}
            onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.55)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)' }}>
            Cancel
          </button>
          <button onClick={onConfirm} style={{ ...saveBtnStyle, background: '#ff6b6b' }}
            onMouseEnter={e => { e.currentTarget.style.background = '#f87171' }}
            onMouseLeave={e => { e.currentTarget.style.background = '#ff6b6b' }}>
            Delete
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Person Detail Modal ──────────────────────────────────────────────────────

function PersonDetailModal({ contact, onClose, onStatusChange, onEdit, onDelete }) {
  const isMobile = useIsMobile()
  const [outreach,   setOutreach]   = useState([])
  const [loadingLog, setLoadingLog] = useState(true)
  const [status,     setStatus]     = useState(contact.outreach_status || 'not_contacted')
  const [showDelete, setShowDelete] = useState(false)

  const loadOutreach = () => {
    setLoadingLog(true)
    api.outreach({ contact_id: contact.id })
      .then(data => setOutreach(Array.isArray(data) ? data : []))
      .catch(() => setOutreach([]))
      .finally(() => setLoadingLog(false))
  }

  useEffect(() => { loadOutreach() }, [contact.id])

  const handleStatusChange = async (newStatus) => {
    setStatus(newStatus)
    await api.updateContact(contact.id, { outreach_status: newStatus })
    onStatusChange(contact.id, newStatus)
  }

  const handleDeleteEntry = async (id) => {
    await api.deleteOutreach(id)
    loadOutreach()
  }

  const handleDeleteContact = async () => {
    await onDelete(contact.id)
    onClose()
  }

  const sortedOutreach = [...outreach].sort((a, b) => {
    const ta = a.contacted_at || a.created_at || ''
    const tb = b.contacted_at || b.created_at || ''
    return tb.localeCompare(ta)
  })

  return (
    <React.Fragment>
      {showDelete && (
        <ConfirmDeleteModal
          label={contact.name}
          onCancel={() => setShowDelete(false)}
          onConfirm={handleDeleteContact}
        />
      )}

      <div
        style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: isMobile ? 'flex-end' : 'flex-start',
          justifyContent: isMobile ? 'stretch' : 'flex-end',
          zIndex: 200,
        }}
        onClick={onClose}
      >
        <div
          onClick={e => e.stopPropagation()}
          className={isMobile ? 'ios-sheet-enter' : ''}
          style={isMobile ? {
            width: '100%', maxHeight: '90vh', overflowY: 'auto',
            background: 'rgba(12,12,20,0.97)',
            backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: '20px 20px 0 0',
            boxShadow: '0 -8px 40px rgba(0,0,0,0.5)',
            display: 'flex', flexDirection: 'column',
            transition: 'transform 0.35s cubic-bezier(0.32, 0.72, 0, 1)',
            overscrollBehavior: 'contain',
            WebkitOverflowScrolling: 'touch',
            paddingBottom: 'env(safe-area-inset-bottom, 16px)',
          } : {
            width: 540, maxWidth: '95vw', height: '100vh', overflowY: 'auto',
            background: 'rgba(12,12,20,0.85)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
            borderLeft: '1px solid rgba(255,255,255,0.10)',
            display: 'flex', flexDirection: 'column',
          }}
        >
          {/* Header */}
          <div style={{ borderBottom: '1px solid rgba(255,255,255,0.07)', position: 'sticky', top: 0, background: 'rgba(12,12,20,0.90)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', zIndex: 10, borderRadius: isMobile ? '20px 20px 0 0' : 0, overflow: 'hidden' }}>
            {/* Drag handle pill — iOS standard */}
            {isMobile && (
              <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 12, paddingBottom: 4 }}>
                <div style={{ width: 36, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.2)' }} />
              </div>
            )}
            <div style={{ padding: isMobile ? '12px 20px 20px' : '24px 28px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
                <h2 style={{ fontSize: 20, fontWeight: 700, color: 'rgba(255,255,255,0.88)', margin: '0 0 4px', lineHeight: 1.2 }}>
                  {contact.name}
                </h2>
                {(contact.role || contact.company) && (
                  <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', marginBottom: 8 }}>
                    {contact.role}
                    {contact.role && contact.company && ' @ '}
                    {contact.company}
                  </div>
                )}
                {(() => {
                  const c = (contact.city || '').trim()
                  const s = (contact.state || '').trim()
                  const loc = c && s ? `${c}, ${s}` : c || s || null
                  return loc ? (
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.38)', marginBottom: 6, marginTop: -2 }}>
                      {loc}
                    </div>
                  ) : null
                })()}
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                  <PeopleCatBadge cat={contact.category} />
                  <TagBadge tag={contact.tag || 'Other'} />
                  {contact.email && (
                    <a href={`mailto:${contact.email}`}
                      style={{ fontSize: 12, color: '#7c6af7', textDecoration: 'underline' }}>
                      {contact.email}
                    </a>
                  )}
                  {contact.phone && (
                    <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>{contact.phone}</span>
                  )}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0, marginTop: -2 }}>
                <button onClick={() => onEdit(contact)}
                  style={{
                    background: 'transparent', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 6,
                    color: 'rgba(255,255,255,0.45)', cursor: 'pointer', fontSize: 12,
                    padding: isMobile ? '4px 12px' : '4px 10px',
                    minHeight: isMobile ? 36 : 'auto',
                    transition: 'all 0.12s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.88)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.22)' }}
                  onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.45)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.10)' }}>
                  Edit
                </button>
                {/* 44×44 touch target on mobile */}
                <button onClick={onClose}
                  style={{
                    background: isMobile ? 'rgba(255,255,255,0.07)' : 'transparent',
                    border: isMobile ? '1px solid rgba(255,255,255,0.10)' : 'none',
                    borderRadius: isMobile ? 8 : 0,
                    color: 'rgba(255,255,255,0.55)', cursor: 'pointer', fontSize: 20, lineHeight: 1,
                    minWidth: isMobile ? 44 : 'auto', minHeight: isMobile ? 44 : 'auto',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transition: 'color 0.12s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.88)' }}
                  onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.55)' }}
                  title="Close">
                  ×
                </button>
              </div>
            </div>

            {contact.notes && (
              <div style={{ marginTop: 12, padding: '10px 14px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, fontSize: 13, color: 'rgba(255,255,255,0.45)', lineHeight: 1.55 }}>
                {contact.notes}
              </div>
            )}

            {/* Status selector */}
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.30)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>Status</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {STATUSES.map(s => (
                  <button key={s.value} onClick={() => handleStatusChange(s.value)}
                    style={{
                      background: status === s.value ? s.bg : 'transparent',
                      border: `1px solid ${status === s.value ? s.border : 'rgba(255,255,255,0.10)'}`,
                      borderRadius: 20,
                      color: status === s.value ? s.color : 'rgba(255,255,255,0.45)',
                      fontSize: 11, fontWeight: status === s.value ? 700 : 400,
                      letterSpacing: '0.04em', padding: '4px 12px',
                      cursor: 'pointer', transition: 'all 0.12s', textTransform: 'uppercase',
                    }}
                    onMouseEnter={e => { if (status !== s.value) { e.currentTarget.style.borderColor = s.border; e.currentTarget.style.color = s.color } }}
                    onMouseLeave={e => { if (status !== s.value) { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.10)'; e.currentTarget.style.color = 'rgba(255,255,255,0.45)' } }}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Outreach log */}
          <div style={{ flex: 1, padding: '20px 28px 0' }}>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.30)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 12 }}>
              Outreach Log
              {outreach.length > 0 && (
                <span style={{ marginLeft: 8, color: '#a89fff', fontWeight: 700 }}>{outreach.length}</span>
              )}
            </div>

            {loadingLog ? (
              <div style={{ color: 'rgba(255,255,255,0.30)', fontSize: 13, padding: '16px 0' }}>Loading…</div>
            ) : sortedOutreach.length === 0 ? (
              <div style={{ background: 'rgba(255,255,255,0.04)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, boxShadow: '0 4px 24px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.06)', padding: '24px', textAlign: 'center', marginBottom: 20 }}>
                <div style={{ fontSize: 20, color: 'rgba(255,255,255,0.12)', marginBottom: 8 }}>◎</div>
                <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: 13 }}>No messages logged yet.</div>
              </div>
            ) : (
              <div>
                {sortedOutreach.map(entry => (
                  <OutreachEntry key={entry.id} entry={entry} onDelete={handleDeleteEntry} />
                ))}
              </div>
            )}
          </div>

          <OutreachLogForm onSubmit={async ({ direction, message, contacted_at }) => {
            await api.createOutreach({ contact_id: contact.id, direction, message, contacted_at })
            loadOutreach()
          }} />

          {/* Delete Contact footer */}
          <div style={{ padding: '12px 28px 20px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            <button
              onClick={() => setShowDelete(true)}
              style={{ background: 'transparent', border: '1px solid rgba(255,107,107,0.30)', borderRadius: 8, color: 'rgba(255,107,107,0.65)', cursor: 'pointer', fontSize: 12, fontWeight: 600, padding: '7px 16px', transition: 'all 0.15s', width: '100%' }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,107,107,0.10)'; e.currentTarget.style.borderColor = 'rgba(255,107,107,0.55)'; e.currentTarget.style.color = '#ff6b6b' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'rgba(255,107,107,0.30)'; e.currentTarget.style.color = 'rgba(255,107,107,0.65)' }}
            >
              Delete Contact
            </button>
          </div>
        </div>
      </div>
    </React.Fragment>
  )
}

// ─── Person Row (table layout) ────────────────────────────────────────────────

function nameInitialColor(name) {
  if (!name) return '#7c6af7'
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  const colors = ['#a89fff', '#60a5fa', '#4ade80', '#fbbf24', '#f472b6', '#2dd4bf', '#fb923c']
  return colors[Math.abs(hash) % colors.length]
}

function PersonRow({ contact, onOpen, onTagChange }) {
  const [hovered, setHovered] = useState(false)
  const [showTagSelect, setShowTagSelect] = useState(false)
  const tag = contact.tag || 'Other'

  const locationLine = (() => {
    const c = (contact.city || '').trim()
    const s = (contact.state || '').trim()
    if (c && s) return `${c}, ${s}`
    if (c) return c
    if (s) return s
    return null
  })()

  const handleTagChange = async (e) => {
    e.stopPropagation()
    const newTag = e.target.value
    await api.updateContact(contact.id, { tag: newTag })
    onTagChange(contact.id, newTag)
    setShowTagSelect(false)
  }

  const SOCIAL_ICONS = { instagram: 'ig', twitter: '𝕏', spotify: '♫', bandcamp: 'bc', youtube: '▶', website: '↗', facebook: 'f' }
  const socialEntries = contact.social_links
    ? Object.entries(contact.social_links).filter(([, v]) => v).slice(0, 4)
    : []

  const avatarColor = nameInitialColor(contact.name)
  const initial = contact.name ? contact.name.charAt(0).toUpperCase() : '?'

  const objectRoles = Array.isArray(contact.roles)
    ? contact.roles.filter(r => r && typeof r === 'object')
    : []

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); setShowTagSelect(false) }}
      onClick={() => onOpen(contact)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '10px 16px',
        borderBottom: '1px solid rgba(255,255,255,0.05)',
        background: hovered ? 'rgba(255,255,255,0.03)' : 'transparent',
        cursor: 'pointer',
        transition: 'background 0.1s',
      }}
    >
      {/* Avatar */}
      <div style={{
        width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
        background: `${avatarColor}22`,
        border: `1px solid ${avatarColor}55`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 13, fontWeight: 700, color: avatarColor,
        userSelect: 'none',
      }}>
        {initial}
      </div>

      {/* Name + roles */}
      <div style={{ flex: 2, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 500, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {contact.name}
        </div>
        {objectRoles.length > 0 ? (
          <div style={{ display: 'flex', gap: 4, flexWrap: 'nowrap', overflow: 'hidden', marginTop: 2 }}>
            {objectRoles.slice(0, 2).map((r, i) => {
              const label = r.role && r.band ? `${r.role} @ ${r.band}` : r.role || (r.band ? `@ ${r.band}` : null)
              return label ? (
                <span key={i} style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 140 }}>
                  {i > 0 ? ' · ' : ''}{label}
                </span>
              ) : null
            })}
            {objectRoles.length > 2 && (
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.30)', flexShrink: 0 }}>+{objectRoles.length - 2}</span>
            )}
          </div>
        ) : (contact.role || contact.company) ? (
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {contact.role}{contact.role && contact.company ? ' @ ' : ''}{contact.company}
          </div>
        ) : null}
        {Array.isArray(contact.bands) && contact.bands.length > 1 && (
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.30)', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {contact.bands.join(' · ')}
          </div>
        )}
      </div>

      {/* Location */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {locationLine && (
          <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block' }}>
            {locationLine}
          </span>
        )}
      </div>

      {/* Tag */}
      <div style={{ flex: '0 0 100px' }} onClick={e => e.stopPropagation()}>
        {showTagSelect ? (
          <select
            autoFocus
            value={tag}
            onChange={handleTagChange}
            onBlur={() => setShowTagSelect(false)}
            style={{ ...fieldStyle, fontSize: 11, padding: '3px 7px', width: 'auto', minWidth: 96, cursor: 'pointer' }}
          >
            {PEOPLE_TAGS.map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        ) : (
          <span
            onClick={e => { e.stopPropagation(); setShowTagSelect(true) }}
            title="Click to change tag"
            style={{ cursor: 'pointer', display: 'inline-block' }}
          >
            <TagBadge tag={tag} />
          </span>
        )}
      </div>

      {/* Social */}
      <div style={{ flex: '0 0 120px', display: 'flex', gap: 4, flexWrap: 'nowrap', overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
        {socialEntries.map(([platform, url]) => {
          const href = url.startsWith('http') ? url : (platform === 'instagram' || platform === 'twitter' ? `https://${platform === 'twitter' ? 'x.com' : 'instagram.com'}/${url.replace(/^@/, '')}` : `https://${url}`)
          return (
            <a
              key={platform}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              title={platform.charAt(0).toUpperCase() + platform.slice(1)}
              style={{ fontSize: 11, padding: '2px 6px', background: 'rgba(255,255,255,0.06)', borderRadius: 4, color: 'rgba(255,255,255,0.50)', textDecoration: 'none', transition: 'color 0.12s, background 0.12s', flexShrink: 0 }}
              onMouseEnter={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.85)'; e.currentTarget.style.background = 'rgba(255,255,255,0.12)' }}
              onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.50)'; e.currentTarget.style.background = 'rgba(255,255,255,0.06)' }}
            >
              {SOCIAL_ICONS[platform] || platform}
            </a>
          )
        })}
      </div>

      {/* Email / Phone */}
      <div style={{ flex: 1, minWidth: 0 }} onClick={e => e.stopPropagation()}>
        {contact.email && (
          <a
            href={`mailto:${contact.email}`}
            style={{ fontSize: 12, color: 'rgba(255,255,255,0.40)', textDecoration: 'none', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block' }}
            onMouseEnter={e => { e.currentTarget.style.textDecoration = 'underline'; e.currentTarget.style.color = 'rgba(255,255,255,0.70)' }}
            onMouseLeave={e => { e.currentTarget.style.textDecoration = 'none'; e.currentTarget.style.color = 'rgba(255,255,255,0.40)' }}
          >
            {contact.email}
          </a>
        )}
      </div>

      {/* Actions */}
      <div style={{ flex: '0 0 40px', display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }} onClick={e => e.stopPropagation()}>
        <button
          onClick={e => { e.stopPropagation(); onOpen(contact) }}
          style={{
            background: 'transparent', border: 'none',
            color: hovered ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.18)',
            cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: '4px 6px',
            transition: 'color 0.12s',
          }}
          onMouseEnter={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.88)' }}
          onMouseLeave={e => { e.currentTarget.style.color = hovered ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.18)' }}
          title="Open detail"
        >
          ···
        </button>
      </div>
    </div>
  )
}

// ─── People Table Header ───────────────────────────────────────────────────────

function PeopleTableHeader() {
  const labelStyle = {
    fontSize: 11,
    color: 'rgba(255,255,255,0.28)',
    fontWeight: 600,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
  }
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      padding: '0 16px 6px',
      borderBottom: '1px solid rgba(255,255,255,0.08)',
      marginBottom: 0,
    }}>
      {/* Avatar placeholder */}
      <div style={{ width: 32, flexShrink: 0 }} />
      {/* Name */}
      <div style={{ flex: 2, minWidth: 0 }}><span style={labelStyle}>Name</span></div>
      {/* Location */}
      <div style={{ flex: 1, minWidth: 0 }}><span style={labelStyle}>Location</span></div>
      {/* Tag */}
      <div style={{ flex: '0 0 100px' }}><span style={labelStyle}>Tag</span></div>
      {/* Social */}
      <div style={{ flex: '0 0 120px' }}><span style={labelStyle}>Social</span></div>
      {/* Email */}
      <div style={{ flex: 1, minWidth: 0 }}><span style={labelStyle}>Email</span></div>
      {/* Actions */}
      <div style={{ flex: '0 0 40px' }} />
    </div>
  )
}

// ─── People Tab ───────────────────────────────────────────────────────────────

function matchesSearch(c, q) {
  if (!q) return true
  const lower = q.toLowerCase()
  return [c.name, c.role, c.company, c.city, c.state, c.tag, c.email, c.notes].some(
    f => f && f.toLowerCase().includes(lower)
  )
}

function PeopleTab() {
  const [contacts,    setContacts]    = useState([])
  const [loading,     setLoading]     = useState(true)
  const [catFilter,   setCatFilter]   = useState('All')
  const [search,      setSearch]      = useState('')
  const [searchFocus, setSearchFocus] = useState(false)
  const [selected,    setSelected]    = useState(null)
  const [showAdd,     setShowAdd]     = useState(false)
  const [editContact, setEditContact] = useState(null)

  const load = () => {
    setLoading(true)
    api.contacts()
      .then(data => setContacts(Array.isArray(data) ? data : []))
      .catch(() => setContacts([]))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const handleStatusChange = (id, newStatus) => {
    setContacts(prev => prev.map(c => c.id === id ? { ...c, outreach_status: newStatus } : c))
  }

  const handleModalStatusChange = (id, newStatus) => {
    handleStatusChange(id, newStatus)
    setSelected(prev => prev && prev.id === id ? { ...prev, outreach_status: newStatus } : prev)
  }

  const handleTagChange = (id, newTag) => {
    setContacts(prev => prev.map(c => c.id === id ? { ...c, tag: newTag } : c))
    setSelected(prev => prev && prev.id === id ? { ...prev, tag: newTag } : prev)
  }

  const handleAdd = async (form) => {
    await api.createContact(form)
    setShowAdd(false)
    load()
  }

  const handleEdit = async (form) => {
    await api.updateContact(editContact.id, form)
    setEditContact(null)
    // Update in place if detail modal open
    setSelected(prev => prev && prev.id === editContact.id ? { ...prev, ...form } : prev)
    load()
  }

  const handleDelete = async (id) => {
    await api.deleteContact(id)
    load()
  }

  const catFiltered = catFilter === 'All'
    ? contacts
    : contacts.filter(c => (c.category || 'Other') === catFilter)

  const filtered = search.trim()
    ? catFiltered.filter(c => matchesSearch(c, search.trim()))
    : catFiltered

  const countLabel = (() => {
    if (loading) return 'Loading…'
    if (search.trim() && filtered.length !== catFiltered.length) {
      return `${filtered.length} of ${catFiltered.length} contacts`
    }
    return `${catFiltered.length} ${catFiltered.length === 1 ? 'contact' : 'contacts'}`
  })()

  return (
    <>
      {selected && (
        <PersonDetailModal
          contact={selected}
          onClose={() => setSelected(null)}
          onStatusChange={handleModalStatusChange}
          onEdit={(c) => { setEditContact(c) }}
          onDelete={handleDelete}
        />
      )}
      {showAdd && (
        <ContactFormModal contacts={contacts} onClose={() => setShowAdd(false)} onSave={handleAdd} />
      )}
      {editContact && (
        <ContactFormModal
          initial={editContact}
          contacts={contacts}
          onClose={() => setEditContact(null)}
          onSave={handleEdit}
        />
      )}

      {/* Search bar */}
      <div style={{ position: 'relative', marginBottom: 16 }}>
        <input
          type="text"
          placeholder="Search by name, location, role..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          onFocus={() => setSearchFocus(true)}
          onBlur={() => setSearchFocus(false)}
          style={{
            width: '100%',
            boxSizing: 'border-box',
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.10)',
            borderRadius: 8,
            padding: '9px 36px 9px 14px',
            color: '#fff',
            fontSize: 14,
            outline: searchFocus ? '1px solid rgba(168,159,255,0.4)' : 'none',
            transition: 'outline 0.12s',
          }}
        />
        {search && (
          <button
            onClick={() => setSearch('')}
            style={{
              position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
              background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.40)',
              cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: '2px 4px',
              transition: 'color 0.12s',
            }}
            onMouseEnter={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.85)' }}
            onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.40)' }}
            title="Clear search"
          >
            ✕
          </button>
        )}
      </div>

      {/* Subheader: count + Add button */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
        <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 14, margin: 0 }}>
          {countLabel}
        </p>
        <button
          onClick={() => setShowAdd(true)}
          style={saveBtnStyle}
          onMouseEnter={e => { e.currentTarget.style.background = 'linear-gradient(135deg, rgba(124,106,247,0.90) 0%, rgba(99,102,241,0.80) 100%)'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(124,106,247,0.40), inset 0 1px 0 rgba(255,255,255,0.20)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'linear-gradient(135deg, rgba(124,106,247,0.80) 0%, rgba(99,102,241,0.70) 100%)'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(124,106,247,0.25), inset 0 1px 0 rgba(255,255,255,0.15)' }}
          onMouseDown={e => { e.currentTarget.style.transform = 'scale(0.97)'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(124,106,247,0.30)' }}
          onMouseUp={e => { e.currentTarget.style.transform = 'scale(1)' }}
        >
          + Add Contact
        </button>
      </div>

      {/* Category filter pills */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 20 }}>
        {PEOPLE_CATEGORIES.map(cat => (
          <button
            key={cat}
            onClick={() => setCatFilter(cat)}
            style={{
              background: catFilter === cat ? 'rgba(124,106,247,0.14)' : 'transparent',
              border: `1px solid ${catFilter === cat ? '#7c6af7' : 'rgba(255,255,255,0.10)'}`,
              borderRadius: 20,
              color: catFilter === cat ? '#a89fff' : 'rgba(255,255,255,0.40)',
              padding: '5px 14px',
              fontSize: 12,
              fontWeight: catFilter === cat ? 600 : 400,
              cursor: 'pointer',
              transition: 'all 0.12s',
              letterSpacing: '0.03em',
            }}
            onMouseEnter={e => { if (catFilter !== cat) { e.currentTarget.style.color = 'rgba(255,255,255,0.65)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.22)' } }}
            onMouseLeave={e => { if (catFilter !== cat) { e.currentTarget.style.color = 'rgba(255,255,255,0.40)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.10)' } }}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div style={{ color: 'rgba(255,255,255,0.30)', fontSize: 14 }}>Loading…</div>
      ) : filtered.length === 0 ? (
        <div style={{ background: 'rgba(255,255,255,0.04)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, boxShadow: '0 4px 24px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.06)', padding: '48px 20px', textAlign: 'center' }}>
          <div style={{ fontSize: 24, color: 'rgba(255,255,255,0.12)', marginBottom: 10 }}>⊡</div>
          <div style={{ color: 'rgba(255,255,255,0.40)', fontSize: 14, marginBottom: 18 }}>
            {search.trim() ? `No contacts match "${search.trim()}".` : catFilter === 'All' ? 'No contacts yet.' : `No ${catFilter} contacts yet.`}
          </div>
          {catFilter === 'All' && !search.trim() && (
            <button
              onClick={() => setShowAdd(true)}
              style={{ ...saveBtnStyle, fontSize: 12, padding: '7px 16px' }}
              onMouseEnter={e => { e.currentTarget.style.background = '#9085f9' }}
              onMouseLeave={e => { e.currentTarget.style.background = '#7c6af7' }}
            >
              + Add your first contact
            </button>
          )}
        </div>
      ) : (
        <div style={{ paddingBottom: 32 }}>
          <PeopleTableHeader />
          {filtered.map(c => (
            <PersonRow
              key={c.id}
              contact={c}
              onOpen={setSelected}
              onTagChange={handleTagChange}
            />
          ))}
        </div>
      )}
    </>
  )
}

// ════════════════════════════════════════════════════════════════════════════════
// MAIN VIEW
// ════════════════════════════════════════════════════════════════════════════════

export default function Contacts() {
  const isMobile = useIsMobile()
  const [tab, setTab] = useState('people')

  return (
    <div style={{ padding: isMobile ? '16px 14px' : '32px 36px', minHeight: '100vh' }}>
      {/* Page header */}
      <div style={{ marginBottom: 24, ...(isMobile && { paddingTop: 'env(safe-area-inset-top, 0px)' }) }}>
        <h1 style={{ fontSize: isMobile ? 22 : 28, fontWeight: 700, margin: 0, letterSpacing: '-0.02em', background: 'linear-gradient(135deg, #ffffff 0%, rgba(255,255,255,0.75) 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
          Contacts
        </h1>
      </div>

      {/* Tab pills */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 28 }}>
        {[
          { key: 'companies', label: 'Companies' },
          { key: 'people',    label: 'People' },
        ].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            style={{
              background: tab === key ? '#7c6af722' : 'transparent',
              border: `1px solid ${tab === key ? '#7c6af7' : 'rgba(255,255,255,0.10)'}`,
              borderRadius: 20,
              color: tab === key ? '#a89fff' : 'rgba(255,255,255,0.45)',
              padding: '6px 18px',
              fontSize: 13,
              fontWeight: tab === key ? 600 : 400,
              cursor: 'pointer',
              transition: 'all 0.12s',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'companies' ? <CompaniesTab /> : <PeopleTab />}
    </div>
  )
}
