import { useEffect, useState } from 'react'
import { api } from '../api'
import useIsMobile from '../hooks/useIsMobile'

// ─── iOS Sheet helpers ────────────────────────────────────────────────────────

function DragHandle() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 12, paddingBottom: 4 }}>
      <div style={{ width: 36, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.2)' }} />
    </div>
  )
}

const TYPE_COLOR = {
  show: '#a89fff', rehearsal: '#4ade80', recording: '#fbbf24',
  press: '#f472b6', deadline: '#f87171', meeting: '#60a5fa', other: '#9595b8',
}
const EVENT_TYPES = ['show', 'rehearsal', 'recording', 'press', 'deadline', 'meeting', 'other']
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']

// Parse a date string in LOCAL time to avoid the UTC-offset day-shift bug.
// new Date("YYYY-MM-DD") treats the string as UTC midnight, which rolls the
// displayed day backward by the UTC offset on machines west of UTC (e.g., EDT
// shifts "2026-04-01" to Mar 31 at 8pm local). Strings that contain a 'T'
// (datetime) are left for the browser to parse normally.
function parseLocalDate(s) {
  if (!s) return null
  if (s.length === 10 && !s.includes('T')) {
    const [y, mo, d] = s.split('-').map(Number)
    return new Date(y, mo - 1, d)
  }
  return new Date(s)
}

function GoogleBadge() {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      width: 14, height: 14, borderRadius: 3,
      background: '#4285F422', border: '1px solid #4285F455',
      fontSize: 8, fontWeight: 700, color: '#4285F4',
      letterSpacing: 0, lineHeight: 1, flexShrink: 0,
    }}>G</span>
  )
}

function GoogleEventPopover({ event, onClose }) {
  const color = TYPE_COLOR[event.event_type] || '#9595b8'
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }} onClick={onClose}>
      <div style={{ background: 'rgba(255,255,255,0.07)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 16, boxShadow: '0 8px 40px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.10)', padding: 28, width: 420, maxWidth: '90vw' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <GoogleBadge />
          <span style={{ fontSize: 11, color: '#4285F4' }}>Google Calendar</span>
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.30)', marginLeft: 'auto' }}>Read-only</span>
        </div>
        <div style={{ fontSize: 16, fontWeight: 600, color: 'rgba(255,255,255,0.88)', marginBottom: 8 }}>{event.title}</div>
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', marginBottom: event.location || event.description ? 12 : 0 }}>
          <span style={{ background: `${color}22`, border: `1px solid ${color}44`, borderRadius: 4, color: color, fontSize: 10, fontWeight: 700, padding: '1px 6px', letterSpacing: '0.05em', textTransform: 'uppercase', marginRight: 8, display: 'inline-block' }}>
            {event.event_type}
          </span>
          {event.start_dt && fmtDateTime(event.start_dt)}
          {event.end_dt && (() => {
            const s = parseLocalDate(event.start_dt), en = parseLocalDate(event.end_dt)
            if (s.toDateString() !== en.toDateString()) {
              const fmt = d => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
              return ` – ${fmt(en)}`
            }
            return ''
          })()}
        </div>
        {event.location && <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', marginBottom: 8 }}>📍 {event.location}</div>}
        {event.description && <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', lineHeight: 1.5, marginTop: 8 }}>{event.description}</div>}
        <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, color: 'rgba(255,255,255,0.55)', padding: '8px 18px', fontSize: 13, cursor: 'pointer' }}>Close</button>
        </div>
      </div>
    </div>
  )
}

function fmtDateTime(iso) {
  if (!iso) return ''
  try {
    // Date-only strings (YYYY-MM-DD) must be parsed as local midnight;
    // new Date("YYYY-MM-DD") treats them as UTC and shifts the day backward
    // on machines west of UTC.
    let d
    if (iso.length === 10 && !iso.includes('T')) {
      const [y, mo, day] = iso.split('-').map(Number)
      d = new Date(y, mo - 1, day)
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    }
    d = new Date(iso.replace('T', ' ').slice(0, 16))
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) +
      ' · ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  } catch {
    return iso.slice(0, 16).replace('T', ' ')
  }
}

function EventModal({ initial, onClose, onSave, onDelete }) {
  const isMobile = useIsMobile()
  // Derive initial date/time parts from existing start_dt if editing
  const initDate = () => {
    if (initial?.start_dt) return initial.start_dt.slice(0, 10)
    return ''
  }
  const initTime = () => {
    if (initial?.start_dt && initial.start_dt.includes('T')) return initial.start_dt.slice(11, 16)
    return '09:00'
  }
  const initAllDay = () => {
    if (initial?.start_dt) return !initial.start_dt.includes('T')
    return true
  }

  const [title,       setTitle]       = useState(initial?.title       || '')
  const [startDate,   setStartDate]   = useState(initDate)
  const [startTime,   setStartTime]   = useState(initTime)
  const [endDate,     setEndDate]     = useState(() => initial?.end_dt ? initial.end_dt.slice(0, 10) : '')
  const [endTime,     setEndTime]     = useState(() => {
    if (initial?.end_dt && initial.end_dt.includes('T')) return initial.end_dt.slice(11, 16)
    return '23:00'
  })
  const [allDay,      setAllDay]      = useState(initAllDay)
  const [eventType,   setEventType]   = useState(initial?.event_type  || 'show')
  const [location,    setLocation]    = useState(initial?.location     || '')
  const [description, setDescription] = useState(initial?.description || '')
  const [error,         setError]         = useState('')
  const [saving,        setSaving]        = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deletingNow,   setDeletingNow]   = useState(false)

  const isEdit = !!initial?.id

  const handleSubmit = async () => {
    if (!title.trim()) { setError('Title is required.'); return }
    if (!startDate)    { setError('Start date is required.'); return }
    setError('')
    setSaving(true)

    const start_dt = allDay ? startDate : `${startDate}T${startTime}`
    const body = { title: title.trim(), start_dt, event_type: eventType }
    if (endDate) body.end_dt = allDay ? endDate : `${endDate}T${endTime}`
    if (location.trim())    body.location    = location.trim()
    if (description.trim()) body.description = description.trim()

    try {
      await onSave(body)
    } catch (err) {
      setError(err?.message || 'Failed to save event. Please try again.')
      setSaving(false)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey && e.target.tagName !== 'TEXTAREA') {
      e.preventDefault()
      handleSubmit()
    }
    if (e.key === 'Escape') onClose()
  }

  const labelStyle = { fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.40)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 4 }

  const mobileSheetOverlayStyle = {
    position: 'fixed', inset: 0,
    background: 'rgba(0,0,0,0.6)',
    backdropFilter: 'blur(4px)',
    WebkitBackdropFilter: 'blur(4px)',
    display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
    zIndex: 100,
  }
  const mobileSheetStyle = {
    width: '100%',
    maxHeight: '90vh',
    background: 'rgba(22,22,32,0.97)',
    backdropFilter: 'blur(24px)',
    WebkitBackdropFilter: 'blur(24px)',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: '20px 20px 0 0',
    boxShadow: '0 -8px 40px rgba(0,0,0,0.5)',
    padding: '0 24px',
    paddingBottom: 'calc(24px + env(safe-area-inset-bottom, 16px))',
    overflowY: 'auto',
    transition: 'transform 0.35s cubic-bezier(0.32, 0.72, 0, 1)',
    overscrollBehavior: 'contain',
    WebkitOverflowScrolling: 'touch',
  }

  return (
    <div style={isMobile ? mobileSheetOverlayStyle : overlayStyle} onClick={onClose}>
      <div
        className={isMobile ? 'ios-sheet-enter' : ''}
        style={isMobile ? mobileSheetStyle : { ...modalStyle, width: 'min(480px, 94vw)' }}
        onClick={e => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {isMobile && <DragHandle />}
        <h3 style={{ fontSize: isMobile ? 18 : 16, fontWeight: isMobile ? 700 : 600, color: 'rgba(255,255,255,0.88)', margin: isMobile ? '16px 0 20px' : '0 0 20px', letterSpacing: isMobile ? '-0.01em' : 'normal' }}>
          {isEdit ? 'Edit Event' : 'New Event'}
        </h3>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Title */}
          <div>
            <div style={labelStyle}>Title *</div>
            <input
              autoFocus
              placeholder="Event title"
              value={title}
              onChange={e => setTitle(e.target.value)}
              style={fieldStyle}
            />
          </div>

          {/* Date row */}
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1 }}>
              <div style={labelStyle}>Date *</div>
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} style={fieldStyle} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={labelStyle}>End Date <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(optional)</span></div>
              <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} style={fieldStyle} />
            </div>
          </div>

          {/* All Day toggle */}
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', userSelect: 'none' }}>
            <div
              onClick={() => setAllDay(v => !v)}
              style={{
                width: 36, height: 20, borderRadius: 10,
                background: allDay ? 'rgba(124,106,247,0.75)' : 'rgba(255,255,255,0.12)',
                border: allDay ? '1px solid rgba(124,106,247,0.80)' : '1px solid rgba(255,255,255,0.15)',
                position: 'relative', transition: 'background 0.15s, border-color 0.15s', flexShrink: 0,
              }}
            >
              <div style={{
                position: 'absolute', top: 2, left: allDay ? 18 : 2,
                width: 14, height: 14, borderRadius: '50%',
                background: '#ffffff', transition: 'left 0.15s',
                boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
              }} />
            </div>
            <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.65)' }}>All Day</span>
          </label>

          {/* Time fields — only when not all-day */}
          {!allDay && (
            <div style={{ display: 'flex', gap: 10 }}>
              <div style={{ flex: 1 }}>
                <div style={labelStyle}>Start Time</div>
                <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} style={fieldStyle} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={labelStyle}>End Time <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(optional)</span></div>
                <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} style={fieldStyle} />
              </div>
            </div>
          )}

          {/* Event Type */}
          <div>
            <div style={labelStyle}>Event Type</div>
            <select value={eventType} onChange={e => setEventType(e.target.value)} style={fieldStyle}>
              {EVENT_TYPES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
            </select>
          </div>

          {/* Location */}
          <div>
            <div style={labelStyle}>Location <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(optional)</span></div>
            <input placeholder="Venue or address" value={location} onChange={e => setLocation(e.target.value)} style={fieldStyle} />
          </div>

          {/* Description */}
          <div>
            <div style={labelStyle}>Notes <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(optional)</span></div>
            <textarea
              placeholder="Additional details..."
              value={description}
              onChange={e => setDescription(e.target.value)}
              style={{ ...fieldStyle, height: 72, resize: 'vertical' }}
            />
          </div>

          {/* Error message */}
          {error && (
            <div style={{ fontSize: 12, color: '#f87171', background: 'rgba(248,113,113,0.10)', border: '1px solid rgba(248,113,113,0.25)', borderRadius: 6, padding: '8px 12px' }}>
              {error}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 22, justifyContent: 'space-between', alignItems: 'center' }}>
          {/* Delete section — only shown when editing an existing event */}
          {isEdit && onDelete ? (
            confirmDelete ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>Confirm delete?</span>
                <button
                  onClick={async () => {
                    setDeletingNow(true)
                    try { await onDelete(initial) } catch (err) { setError(err?.message || 'Delete failed.'); setDeletingNow(false); setConfirmDelete(false) }
                  }}
                  disabled={deletingNow}
                  style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.50)', borderRadius: 7, color: '#ef4444', padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', opacity: deletingNow ? 0.6 : 1 }}
                >{deletingNow ? 'Deleting…' : 'Yes, delete'}</button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  style={cancelBtnStyle}
                >Cancel</button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmDelete(true)}
                disabled={saving || deletingNow}
                style={{ background: 'transparent', border: '1px solid rgba(239,68,68,0.35)', borderRadius: 7, color: '#ef4444', padding: '7px 14px', fontSize: 12, fontWeight: 500, cursor: 'pointer', transition: 'border-color 0.12s, background 0.12s', opacity: (saving || deletingNow) ? 0.5 : 1 }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.10)'; e.currentTarget.style.borderColor = 'rgba(239,68,68,0.65)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'rgba(239,68,68,0.35)' }}
              >Delete</button>
            )
          ) : (
            <div />
          )}
          <div style={{ display: 'flex', gap: 10, ...(isMobile && { flexDirection: 'row' }) }}>
            <button onClick={onClose} style={{ ...cancelBtnStyle, ...(isMobile && { flex: 1, minHeight: 44 }) }} disabled={saving}>Cancel</button>
            <button onClick={handleSubmit} style={{ ...saveBtnStyle, opacity: saving ? 0.65 : 1, ...(isMobile && { flex: 2, minHeight: 44 }) }} disabled={saving}>
              {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Event'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function ConfirmDelete({ label, onCancel, onConfirm }) {
  const isMobile = useIsMobile()
  const mobileSheetOverlayStyle = {
    position: 'fixed', inset: 0,
    background: 'rgba(0,0,0,0.6)',
    backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)',
    display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
    zIndex: 100,
  }
  const mobileSheetStyle = {
    width: '100%',
    background: 'rgba(22,22,32,0.97)',
    backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: '20px 20px 0 0',
    padding: '0 24px',
    paddingBottom: 'calc(24px + env(safe-area-inset-bottom, 16px))',
    transition: 'transform 0.35s cubic-bezier(0.32, 0.72, 0, 1)',
    textAlign: 'center',
  }
  return (
    <div style={isMobile ? mobileSheetOverlayStyle : overlayStyle} onClick={onCancel}>
      <div
        className={isMobile ? 'ios-sheet-enter' : ''}
        style={isMobile ? mobileSheetStyle : { ...modalStyle, width: 360, textAlign: 'center' }}
        onClick={e => e.stopPropagation()}
      >
        {isMobile && <DragHandle />}
        <div style={{ fontSize: 22, marginBottom: 12, color: '#f87171' }}>⚠</div>
        <div style={{ fontSize: 15, fontWeight: 600, color: 'rgba(255,255,255,0.88)', marginBottom: 6 }}>Delete Event?</div>
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', marginBottom: 24 }}>"{label}" will be permanently deleted.</div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
          <button onClick={onCancel} style={cancelBtnStyle}>Cancel</button>
          <button onClick={onConfirm} style={{ ...saveBtnStyle, background: '#f87171' }}>Delete</button>
        </div>
      </div>
    </div>
  )
}

function CalendarGrid({ events, month, year, onDayClick, onEventClick }) {
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const today = new Date()
  const isToday = (d) => today.getFullYear() === year && today.getMonth() === month && today.getDate() === d

  // Build map: day → events (including multi-day spans)
  const eventsByDay = {}
  events.forEach(e => {
    if (!e.start_dt) return
    const startDt  = parseLocalDate(e.start_dt)
    const endDt    = e.end_dt ? parseLocalDate(e.end_dt) : startDt
    // Determine range of days in this month that the event covers
    const monthStart = new Date(year, month, 1)
    const monthEnd   = new Date(year, month + 1, 0)
    const clampedStart = startDt < monthStart ? monthStart : startDt
    const clampedEnd   = endDt   > monthEnd   ? monthEnd   : endDt
    if (clampedStart > monthEnd || clampedEnd < monthStart) return
    // Walk each day in the clamped range
    const cursor = new Date(clampedStart)
    while (cursor <= clampedEnd) {
      if (cursor.getFullYear() === year && cursor.getMonth() === month) {
        const d = cursor.getDate()
        if (!eventsByDay[d]) eventsByDay[d] = []
        // Avoid duplicates when same event appears on multiple days
        if (!eventsByDay[d].find(x => x.id === e.id)) eventsByDay[d].push(e)
      }
      cursor.setDate(cursor.getDate() + 1)
    }
  })

  const cells = []
  for (let i = 0; i < firstDay; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)

  return (
    <div style={{ width: '100%', minWidth: 0, boxSizing: 'border-box' }}>
      {/* Day headers */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, marginBottom: 2 }}>
        {DAYS.map(d => (
          <div key={d} style={{ textAlign: 'center', fontSize: 'clamp(9px, 1.1vw, 11px)', fontWeight: 600, color: 'rgba(255,255,255,0.30)', padding: '6px 0', letterSpacing: '0.06em' }}>
            {d}
          </div>
        ))}
      </div>
      {/* Day cells */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
        {cells.map((d, i) => {
          const dayEvents = d ? (eventsByDay[d] || []) : []
          return (
            <div
              key={i}
              onClick={() => d && onDayClick(d)}
              style={{
                minHeight: 'clamp(52px, 8vw, 90px)', background: d ? 'rgba(255,255,255,0.04)' : 'transparent',
                backdropFilter: d ? 'blur(12px)' : undefined,
                WebkitBackdropFilter: d ? 'blur(12px)' : undefined,
                border: d ? `1px solid ${isToday(d) ? '#7c6af7' : 'rgba(255,255,255,0.07)'}` : 'none',
                borderRadius: 8, padding: 'clamp(3px, 0.6vw, 8px)', cursor: d ? 'pointer' : 'default',
                position: 'relative', transition: d ? 'box-shadow 150ms ease' : 'none',
                minWidth: 0, overflow: 'hidden', boxSizing: 'border-box',
              }}
              onMouseEnter={e => { if (d && !isToday(d)) { e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.3), 0 0 0 1px rgba(255,255,255,0.12)'; e.currentTarget.style.background = 'rgba(255,255,255,0.06)' } }}
              onMouseLeave={e => { if (d && !isToday(d)) { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.background = 'rgba(255,255,255,0.04)' } }}
            >
              {d && (
                <>
                  <div style={{
                    fontSize: 'clamp(10px, 1.2vw, 12px)', fontWeight: isToday(d) ? 700 : 400,
                    color: isToday(d) ? '#a89fff' : 'rgba(255,255,255,0.45)',
                    marginBottom: 4,
                  }}>{d}</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {dayEvents.slice(0, 3).map(e => {
                      // Build optional "→ Apr 3" suffix for multi-day events
                      let multiSuffix = ''
                      if (e.end_dt) {
                        const startDay = parseLocalDate(e.start_dt).toDateString()
                        const endDay   = parseLocalDate(e.end_dt).toDateString()
                        if (startDay !== endDay) {
                          const endDtObj = parseLocalDate(e.end_dt)
                          multiSuffix = ` → ${endDtObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
                        }
                      }
                      return (
                        <div
                          key={e.id}
                          onClick={ev => { ev.stopPropagation(); onEventClick(e) }}
                          style={{
                            background: `${TYPE_COLOR[e.event_type] || '#9595b8'}22`,
                            border: `1px solid ${TYPE_COLOR[e.event_type] || '#9595b8'}55`,
                            borderRadius: 4, padding: '2px 5px',
                            fontSize: 'clamp(9px, 1vw, 10px)', color: TYPE_COLOR[e.event_type] || '#9595b8',
                            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3,
                          }}
                        >
                          {e.google_event_id && <GoogleBadge />}
                          {' '}{e.title}{multiSuffix}
                        </div>
                      )
                    })}
                    {dayEvents.length > 3 && (
                      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.30)' }}>+{dayEvents.length - 3} more</div>
                    )}
                  </div>
                </>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function Calendar() {
  const isMobile = useIsMobile()
  const [events,    setEvents]    = useState([])
  const [filter,    setFilter]    = useState('')
  const [adding,    setAdding]    = useState(false)
  const [addDate,   setAddDate]   = useState(null)
  const [editing,   setEditing]   = useState(null)
  const [deleting,  setDeleting]  = useState(null)
  const [googleEvent, setGoogleEvent] = useState(null)
  const [loading,   setLoading]   = useState(true)
  const [viewMode,  setViewMode]  = useState(() => typeof window !== 'undefined' && window.innerWidth < 768 ? 'list' : 'calendar') // default 'list' on mobile
  const [calMonth,  setCalMonth]  = useState(new Date().getMonth())
  const [calYear,   setCalYear]   = useState(new Date().getFullYear())
  const [toast,     setToast]     = useState(null) // { message, type }
  const [syncing,   setSyncing]   = useState(false)
  const [syncMsg,   setSyncMsg]   = useState(null) // { text, ok }

  const showToast = (message, type = 'success') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3500)
  }

  const load = () => {
    setLoading(true)
    // Fetch ±1 month around the displayed month so multi-day events that span
    // month boundaries are included. Using date range params avoids pulling all
    // 1000+ events in a single request.
    const prevMonth = new Date(calYear, calMonth - 1, 1)
    const nextMonth = new Date(calYear, calMonth + 2, 0) // last day of calMonth+1
    const pad = (n) => String(n).padStart(2, '0')
    const startParam = `${prevMonth.getFullYear()}-${pad(prevMonth.getMonth() + 1)}-01`
    const endParam   = `${nextMonth.getFullYear()}-${pad(nextMonth.getMonth() + 1)}-${pad(nextMonth.getDate())}`
    const params = { start: startParam, end: endParam }
    if (filter) params.event_type = filter
    api.events(params).then(setEvents).finally(() => setLoading(false))
  }

  useEffect(load, [filter, calMonth, calYear])

  const handleSave = async (form) => {
    await api.createEvent(form)   // throws on error — modal catches it
    setAdding(false)
    setAddDate(null)
    load()
    showToast('Event created and synced to Google Calendar.')
  }

  const handleEdit = async (form) => {
    await api.updateEvent(editing.id, form)
    setEditing(null)
    load()
    showToast('Event updated.')
  }

  const handleDeleteConfirm = async () => {
    await api.deleteEvent(deleting.id)
    setDeleting(null)
    load()
    showToast('Event deleted.')
  }

  const handleDeleteFromModal = async (event) => {
    await api.deleteEvent(event.id)
    setEditing(null)
    load()
    showToast('Event deleted.')
  }

  const handleDayClick = (day) => {
    const pad = n => String(n).padStart(2, '0')
    // Pass date-only so EventModal opens with All Day = true pre-filled for that date
    const dateStr = `${calYear}-${pad(calMonth + 1)}-${pad(day)}`
    setAddDate(dateStr)
    setAdding(true)
  }

  const prevMonth = () => {
    if (calMonth === 0) { setCalMonth(11); setCalYear(y => y - 1) }
    else setCalMonth(m => m - 1)
  }
  const nextMonth = () => {
    if (calMonth === 11) { setCalMonth(0); setCalYear(y => y + 1) }
    else setCalMonth(m => m + 1)
  }

  const handleGoogleSync = async () => {
    setSyncing(true)
    setSyncMsg(null)
    try {
      const res = await fetch('/api/calendar/import', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('vlt_token')}` },
      })
      if (!res.ok) throw new Error('Server error')
      const data = await res.json()
      setSyncMsg({ text: `✓ ${data.imported} events imported, ${data.updated} updated`, ok: true })
      setTimeout(() => { setSyncMsg(null); load() }, 4000)
    } catch {
      setSyncMsg({ text: 'Sync failed', ok: false })
      setTimeout(() => setSyncMsg(null), 4000)
    } finally {
      setSyncing(false)
    }
  }

  const handleEventClick = (e) => {
    setEditing(e)
  }

  const initialForm = addDate ? { title: '', start_dt: addDate, event_type: 'show', location: '', description: '' } : null

  return (
    <div style={{ padding: isMobile ? '16px' : 'clamp(16px, 3vw, 40px)', width: '100%', boxSizing: 'border-box', minWidth: 0, ...(isMobile && { paddingTop: 'calc(16px + env(safe-area-inset-top, 0px))' }) }}>
      {/* Success / error toast */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)',
          zIndex: 200, pointerEvents: 'none',
          background: toast.type === 'success' ? 'rgba(74,222,128,0.15)' : 'rgba(248,113,113,0.15)',
          border: `1px solid ${toast.type === 'success' ? 'rgba(74,222,128,0.40)' : 'rgba(248,113,113,0.40)'}`,
          backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
          borderRadius: 10, padding: '10px 20px',
          fontSize: 13, fontWeight: 500,
          color: toast.type === 'success' ? '#4ade80' : '#f87171',
          boxShadow: '0 4px 20px rgba(0,0,0,0.30)',
          whiteSpace: 'nowrap',
        }}>
          {toast.type === 'success' ? '✓ ' : '✕ '}{toast.message}
        </div>
      )}
      {adding && (
        <EventModal
          initial={initialForm}
          onClose={() => { setAdding(false); setAddDate(null) }}
          onSave={handleSave}
        />
      )}
      {editing  && <EventModal initial={editing} onClose={() => setEditing(null)} onSave={handleEdit} onDelete={handleDeleteFromModal} />}
      {deleting && <ConfirmDelete label={deleting.title} onCancel={() => setDeleting(null)} onConfirm={handleDeleteConfirm} />}
      {googleEvent && <GoogleEventPopover event={googleEvent} onClose={() => setGoogleEvent(null)} />}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: isMobile ? 22 : 28, fontWeight: 700, margin: 0, letterSpacing: '-0.02em', background: 'linear-gradient(135deg, #ffffff 0%, rgba(255,255,255,0.75) 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>Calendar</h1>
          <p style={{ color: 'rgba(255,255,255,0.45)', marginTop: 6, fontSize: 14, lineHeight: 1.5 }}>{events.length} events</p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Sync status message */}
          {syncMsg && (
            <span style={{
              fontSize: 12, fontWeight: 500,
              color: syncMsg.ok ? '#4ade80' : '#f87171',
              whiteSpace: 'nowrap',
            }}>
              {syncMsg.text}
            </span>
          )}
          {/* View toggle */}
          <div style={{ display: 'flex', background: 'rgba(255,255,255,0.04)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 8, overflow: 'hidden' }}>
            {['calendar', 'list'].map(v => (
              <button key={v} onClick={() => setViewMode(v)} style={{
                background: viewMode === v ? '#7c6af722' : 'transparent',
                border: 'none', borderRight: v === 'calendar' ? '1px solid rgba(255,255,255,0.08)' : 'none',
                color: viewMode === v ? '#a89fff' : 'rgba(255,255,255,0.45)',
                padding: '7px 14px', fontSize: 12, fontWeight: 500, cursor: 'pointer',
                transition: 'color 0.12s, background 0.12s',
              }}>
                {v === 'calendar' ? '⊞ Grid' : '☰ List'}
              </button>
            ))}
          </div>
          {/* Sync from Google */}
          <button
            onClick={handleGoogleSync}
            disabled={syncing}
            style={{
              background: 'rgba(66,133,244,0.12)',
              border: '1px solid rgba(66,133,244,0.35)',
              borderRadius: 8,
              color: syncing ? 'rgba(66,133,244,0.50)' : '#4285F4',
              padding: '7px 14px', fontSize: 12, fontWeight: 500,
              cursor: syncing ? 'not-allowed' : 'pointer',
              transition: 'background 0.12s, border-color 0.12s, color 0.12s',
              whiteSpace: 'nowrap',
              opacity: syncing ? 0.7 : 1,
            }}
            onMouseEnter={e => { if (!syncing) { e.currentTarget.style.background = 'rgba(66,133,244,0.20)'; e.currentTarget.style.borderColor = 'rgba(66,133,244,0.60)' } }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(66,133,244,0.12)'; e.currentTarget.style.borderColor = 'rgba(66,133,244,0.35)' }}
          >
            {syncing ? 'Syncing…' : '↓ Sync from Google'}
          </button>
          <button
            onClick={() => setAdding(true)}
            style={saveBtnStyle}
            onMouseEnter={e => { e.currentTarget.style.background = 'linear-gradient(135deg, rgba(124,106,247,0.90) 0%, rgba(99,102,241,0.80) 100%)'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(124,106,247,0.40), inset 0 1px 0 rgba(255,255,255,0.20)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'linear-gradient(135deg, rgba(124,106,247,0.80) 0%, rgba(99,102,241,0.70) 100%)'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(124,106,247,0.25), inset 0 1px 0 rgba(255,255,255,0.15)' }}
            onMouseDown={e => { e.currentTarget.style.transform = 'scale(0.97)'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(124,106,247,0.30)' }}
            onMouseUp={e => { e.currentTarget.style.transform = 'scale(1)' }}
          >+ Add Event</button>
        </div>
      </div>

      {/* Type filters — 44px min height on mobile (Apple HIG) */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
        {['', ...EVENT_TYPES].map(t => (
          <button
            key={t}
            onClick={() => setFilter(t)}
            className="filter-pill"
            style={{
              background: filter === t ? `${TYPE_COLOR[t] || '#7c6af7'}22` : 'transparent',
              border: `1px solid ${filter === t ? (TYPE_COLOR[t] || '#7c6af7') : 'rgba(255,255,255,0.10)'}`,
              borderRadius: 8,
              color: filter === t ? (TYPE_COLOR[t] || '#a89fff') : 'rgba(255,255,255,0.45)',
              padding: '5px 12px', fontSize: 12, cursor: 'pointer', transition: 'all 0.12s',
              letterSpacing: '0.04em',
            }}
          >
            {t ? t.charAt(0).toUpperCase() + t.slice(1) : 'All'}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: 14, padding: '20px 0' }}>Loading…</div>
      ) : viewMode === 'calendar' ? (
        <>
          {/* Month nav */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
            <button
              onClick={prevMonth}
              style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 6, color: 'rgba(255,255,255,0.45)', padding: '5px 10px', cursor: 'pointer', fontSize: 14, transition: 'border-color 0.12s, color 0.12s' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.22)'; e.currentTarget.style.color = 'rgba(255,255,255,0.88)' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.10)'; e.currentTarget.style.color = 'rgba(255,255,255,0.45)' }}
            >‹</button>
            <div style={{ fontSize: 16, fontWeight: 600, color: 'rgba(255,255,255,0.88)', minWidth: 160, textAlign: 'center' }}>
              {MONTHS[calMonth]} {calYear}
            </div>
            <button
              onClick={nextMonth}
              style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 6, color: 'rgba(255,255,255,0.45)', padding: '5px 10px', cursor: 'pointer', fontSize: 14, transition: 'border-color 0.12s, color 0.12s' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.22)'; e.currentTarget.style.color = 'rgba(255,255,255,0.88)' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.10)'; e.currentTarget.style.color = 'rgba(255,255,255,0.45)' }}
            >›</button>
            <button
              onClick={() => { setCalMonth(new Date().getMonth()); setCalYear(new Date().getFullYear()) }}
              style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 6, color: 'rgba(255,255,255,0.45)', padding: '5px 10px', cursor: 'pointer', fontSize: 12, marginLeft: 4, transition: 'border-color 0.12s, color 0.12s' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.22)'; e.currentTarget.style.color = 'rgba(255,255,255,0.88)' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.10)'; e.currentTarget.style.color = 'rgba(255,255,255,0.45)' }}
            >
              Today
            </button>
          </div>
          <CalendarGrid
            events={events}
            month={calMonth}
            year={calYear}
            onDayClick={handleDayClick}
            onEventClick={handleEventClick}
          />
        </>
      ) : events.length === 0 ? (
        <div style={{
          background: 'rgba(255,255,255,0.04)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 12, boxShadow: '0 4px 24px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.06)',
          padding: '40px 20px', textAlign: 'center',
        }}>
          <div style={{ fontSize: 20, color: 'rgba(255,255,255,0.12)', marginBottom: 10 }}>◻</div>
          <div style={{ color: 'rgba(255,255,255,0.40)', fontSize: 14, marginBottom: 16 }}>No events yet.</div>
          <button onClick={() => setAdding(true)} style={{ ...saveBtnStyle, fontSize: 12, padding: '7px 16px' }}>
            + Add your first event
          </button>
        </div>
      ) : (
        events.map(e => (
          <div key={e.id} style={{
            background: 'rgba(255,255,255,0.04)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
            border: '1px solid rgba(255,255,255,0.08)',
            // iOS-feel card: 10px on mobile
            borderRadius: isMobile ? 10 : 10,
            boxShadow: '0 4px 24px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.06)',
            padding: isMobile ? '14px 16px' : '16px 20px', marginBottom: 10,
            borderLeft: `3px solid ${TYPE_COLOR[e.event_type] || '#9595b8'}`,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8,
            transition: 'box-shadow 150ms ease, background 150ms ease',
          }}
            onMouseEnter={ev => { if (!isMobile) { ev.currentTarget.style.boxShadow = '0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.10), 0 0 0 1px rgba(255,255,255,0.12)'; ev.currentTarget.style.background = 'rgba(255,255,255,0.06)' }}}
            onMouseLeave={ev => { if (!isMobile) { ev.currentTarget.style.boxShadow = '0 4px 24px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.06)'; ev.currentTarget.style.background = 'rgba(255,255,255,0.04)' }}}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: isMobile ? 15 : 14, fontWeight: 600, color: 'rgba(255,255,255,0.88)', display: 'flex', alignItems: 'center', gap: 6, lineHeight: 1.4 }}>
                {e.google_event_id && <GoogleBadge />}
                {e.title}
              </div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', marginTop: 4, lineHeight: 1.5 }}>
                <span style={{
                  background: `${TYPE_COLOR[e.event_type]}22`,
                  border: `1px solid ${TYPE_COLOR[e.event_type]}44`,
                  borderRadius: 4, color: TYPE_COLOR[e.event_type] || '#9595b8',
                  fontSize: 10, fontWeight: 700, padding: '1px 6px',
                  letterSpacing: '0.05em', textTransform: 'uppercase',
                  marginRight: 10, display: 'inline-block',
                }}>
                  {e.event_type}
                </span>
                {(() => {
                  if (e.end_dt) {
                    const startDt = parseLocalDate(e.start_dt)
                    const endDt   = parseLocalDate(e.end_dt)
                    const sDay = startDt.toDateString()
                    const eDay = endDt.toDateString()
                    if (sDay !== eDay) {
                      const fmtDate = d => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                      return `${fmtDate(startDt)} – ${fmtDate(endDt)}`
                    }
                  }
                  return fmtDateTime(e.start_dt)
                })()}
                {e.location && ` · ${e.location}`}
              </div>
              {e.description && <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.40)', marginTop: 4, lineHeight: 1.5 }}>{e.description}</div>}
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
              {e.google_event_id ? (
                <span style={{ fontSize: 11, color: '#4285F455', fontStyle: 'italic' }}>synced</span>
              ) : (
                <>
                  <button
                    onClick={() => setEditing(e)}
                    style={{
                      background: 'transparent', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 6,
                      color: 'rgba(255,255,255,0.45)', cursor: 'pointer', fontSize: 12,
                      padding: isMobile ? '4px 12px' : '4px 8px',
                      minHeight: isMobile ? 36 : 'auto',
                      transition: 'border-color 0.12s, color 0.12s',
                    }}
                    onMouseEnter={el => { el.currentTarget.style.borderColor = 'rgba(255,255,255,0.22)'; el.currentTarget.style.color = 'rgba(255,255,255,0.88)' }}
                    onMouseLeave={el => { el.currentTarget.style.borderColor = 'rgba(255,255,255,0.10)'; el.currentTarget.style.color = 'rgba(255,255,255,0.45)' }}
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => setDeleting(e)}
                    style={{
                      background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.30)', cursor: 'pointer',
                      fontSize: 18, lineHeight: 1, transition: 'color 0.12s',
                      ...(isMobile && { minWidth: 44, minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center' }),
                    }}
                    onMouseEnter={el => { el.currentTarget.style.color = '#f87171' }}
                    onMouseLeave={el => { el.currentTarget.style.color = 'rgba(255,255,255,0.30)' }}
                  >×</button>
                </>
              )}
            </div>
          </div>
        ))
      )}
    </div>
  )
}

const overlayStyle   = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }
const modalStyle     = { background: 'rgba(255,255,255,0.07)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 16, boxShadow: '0 8px 40px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.10)', padding: 28, width: 'min(420px, 92vw)' }
const fieldStyle     = { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 8, color: 'rgba(255,255,255,0.90)', padding: '9px 12px', fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box', transition: 'border-color 0.15s ease, box-shadow 0.15s ease' }
const saveBtnStyle   = { background: 'linear-gradient(135deg, rgba(124,106,247,0.80) 0%, rgba(99,102,241,0.70) 100%)', border: '1px solid rgba(124,106,247,0.60)', borderRadius: 8, boxShadow: '0 4px 16px rgba(124,106,247,0.25), inset 0 1px 0 rgba(255,255,255,0.15)', color: '#ffffff', padding: '9px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer', transition: 'all 150ms ease' }
const cancelBtnStyle = { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, color: 'rgba(255,255,255,0.65)', padding: '9px 18px', fontSize: 13, cursor: 'pointer', transition: 'all 150ms ease' }
