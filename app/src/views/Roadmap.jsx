import { useEffect, useRef, useState } from 'react'
import { api } from '../api'

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const MONTH_H = 56 // px per month row

const CATEGORIES = [
  { key: 'show',      label: 'Shows',     color: '#4ade80' },
  { key: 'release',   label: 'Releases',  color: '#60a5fa' },
  { key: 'pr',        label: 'PR',        color: '#a89fff' },
  { key: 'recording', label: 'Recording', color: '#fbbf24' },
  { key: 'writing',   label: 'Writing',   color: '#2dd4bf' },
  { key: 'other',     label: 'Other',     color: '#9595b8' },
]

const CAT_COLOR = Object.fromEntries(CATEGORIES.map(c => [c.key, c.color]))

const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi)

function getSpan(item, isEvent) {
  if (isEvent) {
    const m = item.start_dt ? parseInt(item.start_dt.slice(5, 7), 10) : null
    if (!m) return null
    // If end_dt is set and on a different month, span across months
    const endM = item.end_dt ? parseInt(item.end_dt.slice(5, 7), 10) : m
    return { startM: m, endM: Math.max(m, endM) }
  }
  const start = item.start_date ? parseInt(item.start_date.slice(5, 7), 10) : null
  const end   = item.due_date   ? parseInt(item.due_date.slice(5, 7), 10)   : null
  const s = start || end
  const e = end   || start
  return s ? { startM: s, endM: e } : null
}

function stackItems(items) {
  const result  = []
  const subCols = []

  items.forEach(entry => {
    const span = getSpan(entry.item, entry.isEvent)
    if (!span) return
    let placed = false
    for (let ci = 0; ci < subCols.length; ci++) {
      const overlaps = subCols[ci].some(ex => {
        const es = getSpan(ex.item, ex.isEvent)
        return es && span.startM <= es.endM && span.endM >= es.startM
      })
      if (!overlaps) {
        subCols[ci].push(entry)
        result.push({ ...entry, subColIdx: ci })
        placed = true
        break
      }
    }
    if (!placed) {
      subCols.push([entry])
      result.push({ ...entry, subColIdx: subCols.length - 1 })
    }
  })

  return { items: result, totalSubCols: Math.max(subCols.length, 1) }
}

function getTodayLine(year) {
  const now = new Date()
  if (now.getFullYear() !== year) return null
  const m = now.getMonth() + 1
  const d = now.getDate()
  const daysInMonth = new Date(now.getFullYear(), m, 0).getDate()
  return (12 - m) * MONTH_H + (1 - d / daysInMonth) * MONTH_H
}

// ─── ItemPopover ────────────────────────────────────────────────────────────

const STATUS_LABEL_MAP = { todo: 'To Do', in_progress: 'In Progress', done: 'Done', blocked: 'Blocked' }

function fmtEventDate(iso) {
  if (!iso) return ''
  try {
    const d = new Date(iso.replace('T', ' ').slice(0, 16))
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) +
      ' · ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  } catch {
    return iso.slice(0, 10)
  }
}

function ItemPopover({ item, isEvent, onClose, onEdit, onDelete, onNavigate }) {
  const color    = isEvent ? CAT_COLOR.show : (CAT_COLOR[item.roadmap_category] || '#9595b8')
  const span     = getSpan(item, isEvent)
  const dateStr  = isEvent
    ? fmtEventDate(item.start_dt)
    : (span ? (span.startM === span.endM
        ? MONTHS[span.startM - 1]
        : `${MONTHS[span.startM - 1]} – ${MONTHS[span.endM - 1]}`) : '')

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={{
        background: 'rgba(255,255,255,0.07)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
        border: `1px solid ${color}44`,
        borderRadius: 16, boxShadow: '0 8px 40px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.10)',
        padding: 24, width: 380, maxWidth: '90vw',
      }} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4 }}>
              {isEvent ? 'Show' : item.roadmap_category}
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'rgba(255,255,255,0.88)' }}>{item.title}</div>
            {dateStr && <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', marginTop: 4 }}>{dateStr}</div>}
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.30)', cursor: 'pointer', fontSize: 20, lineHeight: 1 }}>×</button>
        </div>

        {item.description && (
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', margin: '0 0 14px', lineHeight: 1.5 }}>{item.description}</p>
        )}
        {isEvent && item.location && (
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', marginBottom: 12 }}>📍 {item.location}</div>
        )}
        {!isEvent && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
            <span style={{
              background: `${color}22`, border: `1px solid ${color}44`, borderRadius: 4, color,
              fontSize: 10, fontWeight: 700, padding: '2px 7px',
              letterSpacing: '0.05em', textTransform: 'uppercase',
            }}>
              {STATUS_LABEL_MAP[item.status] || item.status}
            </span>
            <span style={{
              background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 4, color: 'rgba(255,255,255,0.45)',
              fontSize: 10, fontWeight: 600, padding: '2px 7px',
              letterSpacing: '0.05em', textTransform: 'uppercase',
            }}>
              {item.priority} priority
            </span>
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => { onEdit(); onClose() }}
            style={{ ...saveBtnStyle, flex: 1 }}
          >
            Edit
          </button>
          <button
            onClick={() => { onNavigate(isEvent ? 'calendar' : 'tasks'); onClose() }}
            style={{ background: `${color}22`, border: `1px solid ${color}55`, borderRadius: 8, color, padding: '8px 12px', fontSize: 13, fontWeight: 600, cursor: 'pointer', flex: 1 }}
          >
            {isEvent ? 'Calendar →' : 'Tasks →'}
          </button>
          <button
            onClick={() => { onDelete(); onClose() }}
            style={{ background: '#ff4d4d18', border: '1px solid #ff4d4d44', borderRadius: 8, color: '#ff6b6b', padding: '8px 12px', fontSize: 13, cursor: 'pointer' }}
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── EditItemModal ───────────────────────────────────────────────────────────

function EditItemModal({ item, isEvent, onClose, onSave, onDelete }) {
  const pad = n => String(n).padStart(2, '0')

  // Parse existing values
  const parseTaskForm = () => {
    const startYear  = item.start_date ? parseInt(item.start_date.slice(0, 4), 10) : (item.due_date ? parseInt(item.due_date.slice(0, 4), 10) : new Date().getFullYear())
    const startMonth = item.start_date ? parseInt(item.start_date.slice(5, 7), 10) : (item.due_date ? parseInt(item.due_date.slice(5, 7), 10) : 1)
    const endMonth   = item.due_date   ? parseInt(item.due_date.slice(5, 7), 10)   : startMonth
    return {
      title:            item.title || '',
      roadmap_category: item.roadmap_category || 'release',
      start_month:      startMonth,
      end_month:        endMonth,
      year:             startYear,
      description:      item.description || '',
      priority:         item.priority || 'medium',
      status:           item.status || 'todo',
    }
  }

  const parseEventForm = () => ({
    title:       item.title || '',
    date:        item.start_dt ? item.start_dt.slice(0, 10) : '',
    end_date:    item.end_dt  ? item.end_dt.slice(0, 10)  : '',
    time:        item.start_dt ? item.start_dt.slice(11, 16) : '18:00',
    location:    item.location || '',
    description: item.description || '',
  })

  const [form,    setForm]    = useState(isEvent ? parseEventForm() : parseTaskForm())
  const [confirm, setConfirm] = useState(false)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSave = () => {
    if (!form.title) return
    if (isEvent) {
      const editEventBody = {
        title:       form.title,
        start_dt:    `${form.date}T${form.time}:00`,
        location:    form.location,
        description: form.description,
      }
      if (form.end_date) editEventBody.end_dt = `${form.end_date}T23:59:00`
      else editEventBody.end_dt = null
      onSave(editEventBody)
    } else {
      const startDate = `${form.year}-${pad(form.start_month)}-01`
      const endDay    = new Date(form.year, form.end_month, 0).getDate()
      const dueDate   = `${form.year}-${pad(form.end_month)}-${endDay}`
      onSave({
        title:            form.title,
        roadmap_category: form.roadmap_category,
        start_date:       startDate,
        due_date:         dueDate,
        description:      form.description,
        priority:         form.priority,
        status:           form.status,
      })
    }
  }

  const color = isEvent ? CAT_COLOR.show : (CAT_COLOR[form.roadmap_category] || '#9595b8')

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={modalStyle} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, color: 'rgba(255,255,255,0.88)', margin: 0 }}>
            Edit {isEvent ? 'Show' : 'Roadmap Item'}
          </h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.30)', cursor: 'pointer', fontSize: 20 }}>×</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input
            placeholder="Title *"
            value={form.title}
            onChange={e => set('title', e.target.value)}
            style={fieldStyle}
          />

          {isEvent ? (
            // Show: specific date + time + location
            <>
              <div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.30)', marginBottom: 4 }}>Date</div>
                <input
                  type="date"
                  value={form.date}
                  onChange={e => set('date', e.target.value)}
                  style={fieldStyle}
                />
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.30)', marginBottom: 4 }}>End Date (optional — for tours)</div>
                <input
                  type="date"
                  value={form.end_date}
                  onChange={e => set('end_date', e.target.value)}
                  style={fieldStyle}
                />
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.30)', marginBottom: 4 }}>Time</div>
                <input
                  type="time"
                  value={form.time}
                  onChange={e => set('time', e.target.value)}
                  style={fieldStyle}
                />
              </div>
              <input
                placeholder="Location"
                value={form.location}
                onChange={e => set('location', e.target.value)}
                style={fieldStyle}
              />
            </>
          ) : (
            // Task: category, month range, year, status, priority
            <>
              <div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.30)', marginBottom: 4 }}>Category</div>
                <select value={form.roadmap_category} onChange={e => set('roadmap_category', e.target.value)} style={fieldStyle}>
                  {CATEGORIES.filter(c => c.key !== 'show').map(c => (
                    <option key={c.key} value={c.key}>{c.label}</option>
                  ))}
                </select>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                <div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.30)', marginBottom: 4 }}>Start Month</div>
                  <select value={form.start_month} onChange={e => set('start_month', +e.target.value)} style={fieldStyle}>
                    {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                  </select>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.30)', marginBottom: 4 }}>End Month</div>
                  <select value={form.end_month} onChange={e => set('end_month', +e.target.value)} style={fieldStyle}>
                    {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                  </select>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.30)', marginBottom: 4 }}>Year</div>
                  <select value={form.year} onChange={e => set('year', +e.target.value)} style={fieldStyle}>
                    {[2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.30)', marginBottom: 4 }}>Status</div>
                  <select value={form.status} onChange={e => set('status', e.target.value)} style={fieldStyle}>
                    <option value="todo">To Do</option>
                    <option value="in_progress">In Progress</option>
                    <option value="done">Done</option>
                    <option value="blocked">Blocked</option>
                  </select>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.30)', marginBottom: 4 }}>Priority</div>
                  <select value={form.priority} onChange={e => set('priority', e.target.value)} style={fieldStyle}>
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                </div>
              </div>
            </>
          )}

          <textarea
            placeholder="Notes"
            value={form.description}
            onChange={e => set('description', e.target.value)}
            style={{ ...fieldStyle, height: 60, resize: 'vertical' }}
          />
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
          {confirm ? (
            <>
              <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', alignSelf: 'center', flex: 1 }}>Delete this item?</span>
              <button onClick={() => setConfirm(false)} style={cancelBtnStyle}>No</button>
              <button onClick={onDelete} style={{ ...cancelBtnStyle, color: '#ff6b6b', borderColor: '#ff4d4d44' }}>Yes, delete</button>
            </>
          ) : (
            <>
              <button onClick={() => setConfirm(true)} style={{ ...cancelBtnStyle, color: '#ff6b6b', borderColor: '#ff4d4d44', marginRight: 'auto' }}>
                Delete
              </button>
              <button onClick={onClose} style={cancelBtnStyle}>Cancel</button>
              <button onClick={handleSave} style={saveBtnStyle}>Save Changes</button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── AddItemModal ────────────────────────────────────────────────────────────

function AddItemModal({ prefill, onClose, onSave }) {
  const pad = n => String(n).padStart(2, '0')
  const [form, setForm] = useState({
    title:            '',
    roadmap_category: prefill?.category || 'release',
    start_month:      prefill?.month || 1,
    end_month:        prefill?.month || 1,
    year:             prefill?.year  || 2026,
    // show-specific
    date:             prefill?.year && prefill?.month ? `${prefill.year}-${pad(prefill.month)}-01` : '',
    end_date:         '',
    time:             '18:00',
    location:         '',
    description:      '',
    priority:         'medium',
  })
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const isShow = form.roadmap_category === 'show'

  const handleSave = () => {
    if (!form.title) return
    if (isShow) {
      const dateVal = form.date || `${form.year}-${pad(form.start_month)}-01`
      const eventBody = {
        title: form.title, event_type: 'show',
        start_dt: `${dateVal}T${form.time}:00`,
        location: form.location, description: form.description,
      }
      if (form.end_date) eventBody.end_dt = `${form.end_date}T23:59:00`
      onSave('event', eventBody)
    } else {
      const startDate = `${form.year}-${pad(form.start_month)}-01`
      const endDay    = new Date(form.year, form.end_month, 0).getDate()
      onSave('task', {
        title:            form.title,
        roadmap_category: form.roadmap_category,
        start_date:       startDate,
        due_date:         `${form.year}-${pad(form.end_month)}-${endDay}`,
        description:      form.description,
        priority:         form.priority,
        status:           'todo',
      })
    }
  }

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={modalStyle} onClick={e => e.stopPropagation()}>
        <h3 style={{ fontSize: 16, fontWeight: 600, color: 'rgba(255,255,255,0.88)', margin: '0 0 20px' }}>Add Roadmap Item</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input placeholder="Title *" value={form.title} onChange={e => set('title', e.target.value)} style={fieldStyle} />
          <select value={form.roadmap_category} onChange={e => set('roadmap_category', e.target.value)} style={fieldStyle}>
            {CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>

          {isShow ? (
            <>
              <div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.30)', marginBottom: 4 }}>Date</div>
                <input type="date" value={form.date} onChange={e => set('date', e.target.value)} style={fieldStyle} />
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.30)', marginBottom: 4 }}>End Date (optional — for tours)</div>
                <input type="date" value={form.end_date} onChange={e => set('end_date', e.target.value)} style={fieldStyle} />
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.30)', marginBottom: 4 }}>Time</div>
                <input type="time" value={form.time} onChange={e => set('time', e.target.value)} style={fieldStyle} />
              </div>
              <input placeholder="Location" value={form.location} onChange={e => set('location', e.target.value)} style={fieldStyle} />
            </>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
              <div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.30)', marginBottom: 4 }}>Start Month</div>
                <select value={form.start_month} onChange={e => set('start_month', +e.target.value)} style={fieldStyle}>
                  {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                </select>
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.30)', marginBottom: 4 }}>End Month</div>
                <select value={form.end_month} onChange={e => set('end_month', +e.target.value)} style={fieldStyle}>
                  {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                </select>
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.30)', marginBottom: 4 }}>Year</div>
                <select value={form.year} onChange={e => set('year', +e.target.value)} style={fieldStyle}>
                  {[2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
            </div>
          )}

          {!isShow && (
            <select value={form.priority} onChange={e => set('priority', e.target.value)} style={fieldStyle}>
              <option value="high">High priority</option>
              <option value="medium">Medium priority</option>
              <option value="low">Low priority</option>
            </select>
          )}
          <textarea placeholder="Notes" value={form.description} onChange={e => set('description', e.target.value)}
            style={{ ...fieldStyle, height: 60, resize: 'vertical' }} />
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={cancelBtnStyle}>Cancel</button>
          <button onClick={handleSave} style={saveBtnStyle}>Add to Roadmap</button>
        </div>
      </div>
    </div>
  )
}

// ─── Main ────────────────────────────────────────────────────────────────────

export default function Roadmap({ onNavigate }) {
  const [year,        setYear]        = useState(2026)
  const [data,        setData]        = useState({ tasks: [], events: [] })
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState(null)
  const [popover,     setPopover]     = useState(null)   // { item, isEvent }
  const [editing,     setEditing]     = useState(null)   // { item, isEvent }
  const [adding,      setAdding]      = useState(null)   // true | { category, month, year }
  const [dragDisplay, setDragDisplay] = useState(null)   // { id, isEvent, startM, endM, catKey }

  // Refs to avoid stale closures in global mouse handlers
  const dragInfo   = useRef(null)  // full drag state, mutated directly
  const didDragRef = useRef(false) // true if mouse moved enough during drag
  const loadRef    = useRef(null)
  const yearRef    = useRef(year)
  const gridRef    = useRef(null)  // ref on the grid body div

  const todayTop = getTodayLine(year)

  const load = () => {
    setLoading(true)
    setError(null)
    api.roadmap(yearRef.current)
      .then(setData)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }

  // Keep refs in sync
  loadRef.current = load
  yearRef.current = year

  useEffect(load, [year])

  // ─── Global drag handlers ───────────────────────────────────────────────

  useEffect(() => {
    const pad = n => String(n).padStart(2, '0')

    const onMouseMove = e => {
      const d = dragInfo.current
      if (!d) return

      const deltaY = e.clientY - d.startY

      // Mark as a real drag once movement exceeds threshold
      if (!didDragRef.current && (Math.abs(deltaY) > 4)) {
        didDragRef.current = true
      }

      // Moving UP = towards Dec = shift positive
      const shift = Math.round(-deltaY / MONTH_H)

      let newStartM = d.origStartM
      let newEndM   = d.origEndM
      let newCatKey = d.origCatKey

      if (d.mode === 'move') {
        newStartM = clamp(d.origStartM + shift, 1, 12)
        newEndM   = clamp(d.origEndM   + shift, 1, 12)
        // Keep span width intact — if one side hits the boundary, clamp both
        const span = d.origEndM - d.origStartM
        if (newStartM < 1) { newStartM = 1; newEndM = 1 + span }
        if (newEndM > 12)  { newEndM = 12; newStartM = 12 - span }
        newStartM = clamp(newStartM, 1, 12)
        newEndM   = clamp(newEndM,   1, 12)

        // Horizontal category detection (tasks only — shows stay in their column)
        if (!d.isEvent && gridRef.current) {
          const rect      = gridRef.current.getBoundingClientRect()
          const mouseX    = e.clientX
          const colWidth  = (rect.width - 64) / CATEGORIES.length
          const colIdx    = Math.floor((mouseX - rect.left - 64) / colWidth)
          const clamped   = clamp(colIdx, 0, CATEGORIES.length - 1)
          const candidate = CATEGORIES[clamped].key
          // Tasks can't move into 'show' column
          if (candidate !== 'show') {
            if (candidate !== d.origCatKey) didDragRef.current = true
            newCatKey = candidate
          }
        }
      } else if (d.mode === 'resize-top') {
        // Top handle changes endM (visual top = Dec/high month)
        newEndM = clamp(d.origEndM + shift, d.origStartM, 12)
      } else if (d.mode === 'resize-bottom') {
        // Bottom handle changes startM (visual bottom = Jan/low month)
        newStartM = clamp(d.origStartM + shift, 1, d.origEndM)
      }

      // Only update display state if something visually changed
      const prev = dragInfo.current.display
      if (!prev || prev.startM !== newStartM || prev.endM !== newEndM || prev.catKey !== newCatKey) {
        dragInfo.current.display = { startM: newStartM, endM: newEndM, catKey: newCatKey }
        setDragDisplay({ id: d.id, isEvent: d.isEvent, startM: newStartM, endM: newEndM, catKey: newCatKey })
      }
    }

    const onMouseUp = async () => {
      const d = dragInfo.current
      if (!d) return

      const display = d.display
      dragInfo.current = null
      setDragDisplay(null)
      document.body.style.cursor = ''

      // Clear didDragRef after the click handler has fired
      setTimeout(() => { didDragRef.current = false }, 0)

      if (!display) return

      const { startM, endM, catKey } = display
      const yr = yearRef.current

      // Only save if something changed
      const changed =
        startM !== d.origStartM ||
        endM   !== d.origEndM   ||
        catKey !== d.origCatKey

      if (!changed) return

      try {
        if (d.isEvent) {
          // For events: preserve day-of-month if valid, else clamp to last day
          const origDt    = d.item.start_dt  // e.g. "2026-03-15T20:00:00"
          const origDay   = origDt ? parseInt(origDt.slice(8, 10), 10) : 1
          const origTime  = origDt ? origDt.slice(11) : '18:00:00'
          const daysInNew = new Date(yr, startM, 0).getDate()
          const day       = Math.min(origDay, daysInNew)
          const newDt     = `${yr}-${pad(startM)}-${pad(day)}T${origTime}`
          await api.updateEvent(d.id, { start_dt: newDt })
        } else {
          const startDate = `${yr}-${pad(startM)}-01`
          const endDay    = new Date(yr, endM, 0).getDate()
          const dueDate   = `${yr}-${pad(endM)}-${endDay}`
          await api.updateTask(d.id, {
            start_date:       startDate,
            due_date:         dueDate,
            roadmap_category: catKey,
          })
        }
        loadRef.current()
      } catch (err) {
        console.error('Drag save failed:', err)
        loadRef.current()
      }
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup',   onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup',   onMouseUp)
    }
  }, []) // mount once — reads from refs to avoid stale closures

  // ─── startDrag ─────────────────────────────────────────────────────────

  const startDrag = (item, isEvent, mode, e) => {
    e.preventDefault()
    e.stopPropagation()
    const span = getSpan(item, isEvent)
    if (!span) return

    dragInfo.current = {
      id:         item.id,
      item,
      isEvent,
      mode,
      startY:     e.clientY,
      origStartM: span.startM,
      origEndM:   span.endM,
      origCatKey: isEvent ? 'show' : (item.roadmap_category || 'other'),
      display:    null,
    }
    document.body.style.cursor = 'grabbing'
  }

  // ─── Data handlers ──────────────────────────────────────────────────────

  const handleAddSave = async (type, body) => {
    if (type === 'event') await api.createEvent(body)
    else                   await api.createTask(body)
    setAdding(null)
    load()
  }

  const handleEditSave = async (body) => {
    const { item, isEvent } = editing
    if (isEvent) await api.updateEvent(item.id, body)
    else          await api.updateTask(item.id, body)
    setEditing(null)
    load()
  }

  const handleDelete = async () => {
    const { item, isEvent } = editing
    if (isEvent) await api.deleteEvent(item.id)
    else          await api.deleteTask(item.id)
    setEditing(null)
    load()
  }

  // ─── Build display data (merge drag overrides) ──────────────────────────

  // Compute effective data by overriding the dragged item's span/category
  const displayData = (() => {
    if (!dragDisplay) return data

    const { id, isEvent: dragIsEvent, startM, endM, catKey } = dragDisplay
    const pad = n => String(n).padStart(2, '0')

    if (dragIsEvent) {
      const events = data.events.map(ev => {
        if (ev.id !== id) return ev
        // Build a synthetic start_dt preserving time
        const origDt   = ev.start_dt || `${year}-01-01T18:00:00`
        const origTime = origDt.slice(11)
        const daysInM  = new Date(year, startM, 0).getDate()
        const origDay  = parseInt(origDt.slice(8, 10), 10)
        const day      = Math.min(origDay, daysInM)
        return { ...ev, start_dt: `${year}-${pad(startM)}-${pad(day)}T${origTime}` }
      })
      return { ...data, events }
    } else {
      const tasks = data.tasks.map(t => {
        if (t.id !== id) return t
        const endDay = new Date(year, endM, 0).getDate()
        return {
          ...t,
          start_date:       `${year}-${pad(startM)}-01`,
          due_date:         `${year}-${pad(endM)}-${endDay}`,
          roadmap_category: catKey,
        }
      })
      return { ...data, tasks }
    }
  })()

  // Group and stack items per category using displayData
  const grouped = {}
  CATEGORIES.forEach(cat => {
    const raw = cat.key === 'show'
      ? displayData.events.map(e => ({ item: e, isEvent: true }))
      : displayData.tasks.filter(t => t.roadmap_category === cat.key).map(t => ({ item: t, isEvent: false }))
    grouped[cat.key] = stackItems(raw)
  })

  const totalItems = data.tasks.length + data.events.length

  return (
    <div style={{ padding: '32px 40px' }}>
      {/* Popover */}
      {popover && (
        <ItemPopover
          item={popover.item}
          isEvent={popover.isEvent}
          onClose={() => setPopover(null)}
          onEdit={() => setEditing({ item: popover.item, isEvent: popover.isEvent })}
          onDelete={() => setEditing({ item: popover.item, isEvent: popover.isEvent, deleteMode: true })}
          onNavigate={onNavigate || (() => {})}
        />
      )}

      {/* Edit modal */}
      {editing && (
        <EditItemModal
          item={editing.item}
          isEvent={editing.isEvent}
          onClose={() => setEditing(null)}
          onSave={handleEditSave}
          onDelete={handleDelete}
        />
      )}

      {/* Add modal */}
      {adding && (
        <AddItemModal
          prefill={typeof adding === 'object' ? adding : null}
          onClose={() => setAdding(null)}
          onSave={handleAddSave}
        />
      )}

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0, letterSpacing: '-0.02em', background: 'linear-gradient(135deg, #ffffff 0%, rgba(255,255,255,0.75) 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>Roadmap</h1>
          <p style={{ color: 'rgba(255,255,255,0.45)', marginTop: 6, fontSize: 14 }}>{totalItems} items · {year}</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ display: 'flex', background: 'rgba(255,255,255,0.04)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 8, overflow: 'hidden' }}>
            {[2025, 2026, 2027].map((y, i) => (
              <button key={y} onClick={() => setYear(y)} style={{
                background: year === y ? '#7c6af722' : 'transparent',
                border: 'none',
                borderRight: i < 2 ? '1px solid rgba(255,255,255,0.08)' : 'none',
                color: year === y ? '#a89fff' : 'rgba(255,255,255,0.45)',
                padding: '7px 14px', fontSize: 13, fontWeight: year === y ? 600 : 400, cursor: 'pointer',
              }}>{y}</button>
            ))}
          </div>
          <button onClick={() => setAdding(true)} style={saveBtnStyle}
            onMouseEnter={e => { e.currentTarget.style.background = 'linear-gradient(135deg, rgba(124,106,247,0.90) 0%, rgba(99,102,241,0.80) 100%)'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(124,106,247,0.40), inset 0 1px 0 rgba(255,255,255,0.20)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'linear-gradient(135deg, rgba(124,106,247,0.80) 0%, rgba(99,102,241,0.70) 100%)'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(124,106,247,0.25), inset 0 1px 0 rgba(255,255,255,0.15)' }}
            onMouseDown={e => { e.currentTarget.style.transform = 'scale(0.97)'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(124,106,247,0.30)' }}
            onMouseUp={e => { e.currentTarget.style.transform = 'scale(1)' }}
          >+ Add Item</button>
        </div>
      </div>

      {error && (
        <div style={{ background: '#ff4d4d22', border: '1px solid #ff4d4d44', borderRadius: 8, padding: '10px 14px', color: '#ff6b6b', fontSize: 13, marginBottom: 16 }}>
          Failed to load roadmap: {error}. Make sure the server is running.
        </div>
      )}

      {loading ? (
        <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: 14 }}>Loading…</div>
      ) : (
        <div style={{ background: 'rgba(255,255,255,0.04)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, boxShadow: '0 4px 24px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.06)', overflow: 'auto' }}>
          {/* Column headers */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: `64px repeat(${CATEGORIES.length}, 1fr)`,
            borderBottom: '1px solid rgba(255,255,255,0.08)',
            position: 'sticky', top: 0, background: 'rgba(15,15,22,0.85)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', zIndex: 10,
          }}>
            <div style={{ padding: '12px 0', borderRight: '1px solid rgba(255,255,255,0.07)' }} />
            {CATEGORIES.map((cat, i) => (
              <div key={cat.key} style={{
                padding: '12px 8px', textAlign: 'center',
                fontSize: 11, fontWeight: 700, color: cat.color,
                letterSpacing: '0.08em', textTransform: 'uppercase',
                borderRight: i < CATEGORIES.length - 1 ? '1px solid rgba(255,255,255,0.07)' : 'none',
              }}>{cat.label}</div>
            ))}
          </div>

          {/* Timeline body */}
          <div
            ref={gridRef}
            style={{ display: 'grid', gridTemplateColumns: `64px repeat(${CATEGORIES.length}, 1fr)` }}
          >
            {/* Month labels — Dec at top, Jan at bottom */}
            <div style={{ borderRight: '1px solid rgba(255,255,255,0.07)' }}>
              {[...MONTHS].reverse().map((m, i) => (
                <div key={i} style={{
                  height: MONTH_H,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.05em',
                  borderBottom: i < 11 ? '1px solid rgba(255,255,255,0.05)' : 'none',
                }}>{m}</div>
              ))}
            </div>

            {/* Category columns */}
            {CATEGORIES.map((cat, catIdx) => {
              const { items, totalSubCols } = grouped[cat.key]
              return (
                <div
                  key={cat.key}
                  style={{
                    position: 'relative', height: MONTH_H * 12,
                    borderRight: catIdx < CATEGORIES.length - 1 ? '1px solid rgba(255,255,255,0.07)' : 'none',
                    cursor: 'pointer',
                  }}
                  onClick={e => {
                    if (e.target !== e.currentTarget) return
                    const rect   = e.currentTarget.getBoundingClientRect()
                    const rowIdx = Math.floor((e.clientY - rect.top) / MONTH_H)
                    const month  = 12 - rowIdx
                    setAdding({ category: cat.key, month: Math.min(Math.max(month, 1), 12), year })
                  }}
                >
                  {/* Month dividers */}
                  {MONTHS.map((_, i) => i < 11 && (
                    <div key={i} style={{
                      position: 'absolute', top: (i + 1) * MONTH_H, left: 0, right: 0, height: 1,
                      background: 'rgba(255,255,255,0.04)', pointerEvents: 'none',
                    }} />
                  ))}

                  {/* Today line */}
                  {todayTop !== null && (
                    <div style={{
                      position: 'absolute', top: todayTop, left: 0, right: 0, height: 2,
                      background: 'rgba(124,106,247,0.6)', pointerEvents: 'none', zIndex: 5,
                    }}>
                      {catIdx === 0 && (
                        <div style={{
                          position: 'absolute', left: 4, top: -9,
                          fontSize: 9, fontWeight: 700, color: '#a89fff',
                          letterSpacing: '0.06em', textTransform: 'uppercase',
                          background: 'rgba(10,10,18,0.85)', padding: '1px 4px', borderRadius: 3, whiteSpace: 'nowrap',
                        }}>Today</div>
                      )}
                    </div>
                  )}

                  {/* Items */}
                  {items.map(({ item, isEvent, subColIdx }) => {
                    const span = getSpan(item, isEvent)
                    if (!span) return null
                    const { startM, endM } = span
                    const color    = cat.color
                    const top      = (12 - endM) * MONTH_H + 4
                    const height   = (endM - startM + 1) * MONTH_H - 8
                    const subW     = 100 / totalSubCols
                    const left     = `calc(${subColIdx * subW}% + 3px)`
                    const width    = `calc(${subW}% - 6px)`

                    // Is this item currently being dragged?
                    const isDragging = dragDisplay && dragDisplay.id === item.id && dragDisplay.isEvent === isEvent

                    return (
                      <div
                        key={item.id + (isEvent ? '-ev' : '-t')}
                        onClick={e => {
                          // Don't open popover if we just finished a drag
                          if (didDragRef.current) return
                          e.stopPropagation()
                          setPopover({ item, isEvent })
                        }}
                        onMouseDown={e => {
                          // Only start move-drag on the block body (not handles)
                          if (e.target !== e.currentTarget && e.target.dataset.handle) return
                          startDrag(item, isEvent, 'move', e)
                        }}
                        title={item.title}
                        style={{
                          position: 'absolute', top, left, width, height,
                          background: isDragging ? `${color}44` : `${color}22`,
                          border: `1px solid ${color}${isDragging ? 'aa' : '66'}`,
                          borderRadius: 6, padding: '5px 7px',
                          cursor: isDragging ? 'grabbing' : 'grab',
                          overflow: 'hidden', display: 'flex',
                          alignItems: height > 48 ? 'flex-start' : 'center',
                          transition: isDragging ? 'none' : 'background 0.12s',
                          userSelect: 'none',
                          zIndex: isDragging ? 20 : 1,
                        }}
                        onMouseEnter={e => {
                          if (!dragDisplay) e.currentTarget.style.background = `${color}40`
                        }}
                        onMouseLeave={e => {
                          if (!isDragging) e.currentTarget.style.background = `${color}22`
                        }}
                      >
                        {/* Top resize handle (changes endM) — events don't get handles */}
                        {!isEvent && (
                          <div
                            data-handle="top"
                            onMouseDown={e => { e.stopPropagation(); startDrag(item, isEvent, 'resize-top', e) }}
                            style={{
                              position: 'absolute', top: 0, left: 0, right: 0, height: 5,
                              cursor: 'ns-resize', zIndex: 2,
                            }}
                          />
                        )}

                        <span style={{
                          fontSize: 11, fontWeight: 600, color, lineHeight: 1.3,
                          overflow: 'hidden', display: '-webkit-box',
                          WebkitLineClamp: Math.max(1, Math.floor(height / 18)),
                          WebkitBoxOrient: 'vertical',
                          pointerEvents: 'none',
                        }}>
                          {item.title}
                        </span>

                        {/* Bottom resize handle (changes startM) — events don't get handles */}
                        {!isEvent && (
                          <div
                            data-handle="bottom"
                            onMouseDown={e => { e.stopPropagation(); startDrag(item, isEvent, 'resize-bottom', e) }}
                            style={{
                              position: 'absolute', bottom: 0, left: 0, right: 0, height: 5,
                              cursor: 'ns-resize', zIndex: 2,
                            }}
                          />
                        )}
                      </div>
                    )
                  })}

                  {/* Empty hint */}
                  {items.length === 0 && (
                    <div style={{
                      position: 'absolute', inset: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 11, color: 'rgba(255,255,255,0.12)', pointerEvents: 'none',
                    }}>click to add</div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Legend */}
      <div style={{ display: 'flex', gap: 16, marginTop: 14, flexWrap: 'wrap' }}>
        {CATEGORIES.map(c => (
          <div key={c.key} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 10, height: 10, borderRadius: 2, background: c.color }} />
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.40)' }}>{c.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

const overlayStyle   = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }
const modalStyle     = { background: 'rgba(255,255,255,0.07)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 16, boxShadow: '0 8px 40px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.10)', padding: 28, width: 460, maxWidth: '90vw' }
const fieldStyle     = { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 8, color: 'rgba(255,255,255,0.90)', padding: '9px 12px', fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box', transition: 'border-color 0.15s ease, box-shadow 0.15s ease' }
const saveBtnStyle   = { background: 'linear-gradient(135deg, rgba(124,106,247,0.80) 0%, rgba(99,102,241,0.70) 100%)', border: '1px solid rgba(124,106,247,0.60)', borderRadius: 8, boxShadow: '0 4px 16px rgba(124,106,247,0.25), inset 0 1px 0 rgba(255,255,255,0.15)', color: '#ffffff', padding: '9px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer', transition: 'all 150ms ease' }
const cancelBtnStyle = { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, color: 'rgba(255,255,255,0.65)', padding: '9px 18px', fontSize: 13, cursor: 'pointer', transition: 'all 150ms ease' }
