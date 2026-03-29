import { useEffect, useState } from 'react'
import { api } from '../api'
import useIsMobile from '../hooks/useIsMobile'

// ─── iOS Sheet helpers ────────────────────────────────────────────────────────

function iosSheetOverlay(onClick) {
  return {
    position: 'fixed', inset: 0,
    background: 'rgba(0,0,0,0.6)',
    backdropFilter: 'blur(4px)',
    WebkitBackdropFilter: 'blur(4px)',
    display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
    zIndex: 100,
  }
}

function iosSheetContent(extraStyle = {}) {
  return {
    width: '100%',
    maxHeight: '90vh',
    background: 'rgba(22,22,32,0.97)',
    backdropFilter: 'blur(24px)',
    WebkitBackdropFilter: 'blur(24px)',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: '20px 20px 0 0',
    boxShadow: '0 -8px 40px rgba(0,0,0,0.5)',
    padding: '0 24px 24px',
    overflowY: 'auto',
    // iOS spring physics transition
    transition: 'transform 0.35s cubic-bezier(0.32, 0.72, 0, 1)',
    // Safe area for home indicator
    paddingBottom: 'calc(24px + env(safe-area-inset-bottom, 16px))',
    overscrollBehavior: 'contain',
    WebkitOverflowScrolling: 'touch',
    ...extraStyle,
  }
}

function DragHandle() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 12, paddingBottom: 4 }}>
      <div style={{
        width: 36, height: 4, borderRadius: 2,
        background: 'rgba(255,255,255,0.2)',
      }} />
    </div>
  )
}

const STATUS_COLOR = { todo: '#9595b8', in_progress: '#7c6af7', done: '#4ade80', blocked: '#f87171', backlog: '#56567a' }
const STATUS_LABEL = { todo: 'To Do', in_progress: 'In Progress', done: 'Done', blocked: 'Blocked', backlog: 'Backlog' }
const PRIORITY_COLOR = { high: '#f87171', medium: '#fbbf24', low: '#4ade80' }
const ROADMAP_COLOR  = { release: '#60a5fa', pr: '#a89fff', recording: '#fbbf24', writing: '#2dd4bf', other: '#9595b8' }
const STATUSES   = ['todo', 'in_progress', 'blocked', 'done', 'backlog']
const PRIORITIES = ['high', 'medium', 'low']
const MEMBERS    = ['Felix', 'Nina', 'Cass', 'Marco', 'Priya', 'Eli', 'Quinn']

function fmtDate(iso) {
  if (!iso) return ''
  try {
    const d = new Date(iso + 'T00:00:00')
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  } catch {
    return iso
  }
}

function TaskModal({ initial, parentId, onClose, onSave }) {
  const isMobile = useIsMobile()
  const blank = { title: '', description: '', status: 'todo', priority: 'medium', due_date: '', assignee: '' }
  const [form, setForm] = useState(initial || blank)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const isEdit    = !!initial?.id
  const isSubtask = !!parentId

  const handleSubmit = () => {
    if (form.title) onSave({ ...form, ...(parentId ? { parent_id: parentId } : {}) })
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey && e.target.tagName !== 'TEXTAREA') {
      e.preventDefault()
      handleSubmit()
    }
    if (e.key === 'Escape') onClose()
  }

  if (isMobile) {
    // iOS bottom sheet presentation
    return (
      <div style={iosSheetOverlay()} onClick={onClose}>
        <div
          className="ios-sheet-enter"
          style={iosSheetContent()}
          onClick={e => e.stopPropagation()}
          onKeyDown={handleKeyDown}
        >
          <DragHandle />
          <h3 style={{ fontSize: 18, fontWeight: 700, color: 'rgba(255,255,255,0.92)', margin: '16px 0 20px', letterSpacing: '-0.01em' }}>
            {isEdit ? 'Edit Task' : isSubtask ? 'Add Subtask' : 'New Task'}
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <input autoFocus placeholder="Title *" value={form.title} onChange={e => set('title', e.target.value)} style={fieldStyle} />
            <textarea placeholder="Description" value={form.description} onChange={e => set('description', e.target.value)} style={{ ...fieldStyle, height: 80, resize: 'vertical' }} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <select value={form.status} onChange={e => set('status', e.target.value)} style={fieldStyle}>
                {STATUSES.map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
              </select>
              <select value={form.priority} onChange={e => set('priority', e.target.value)} style={fieldStyle}>
                {PRIORITIES.map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
              </select>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <input type="date" value={form.due_date} onChange={e => set('due_date', e.target.value)} style={fieldStyle} />
              <select value={form.assignee} onChange={e => set('assignee', e.target.value)} style={fieldStyle}>
                <option value="">Assignee</option>
                {MEMBERS.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 24 }}>
            <button onClick={onClose} style={{ ...cancelBtnStyle, flex: 1, minHeight: 44 }}>Cancel</button>
            <button onClick={handleSubmit} style={{ ...saveBtnStyle, flex: 2, minHeight: 44 }}>
              {isEdit ? 'Save Changes' : isSubtask ? 'Add Subtask' : 'Add Task'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={modalStyle} onClick={e => e.stopPropagation()} onKeyDown={handleKeyDown}>
        <h3 style={{ fontSize: 16, fontWeight: 600, color: 'rgba(255,255,255,0.88)', margin: '0 0 20px' }}>
          {isEdit ? 'Edit Task' : isSubtask ? 'Add Subtask' : 'Add Task'}
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input autoFocus placeholder="Title *" value={form.title} onChange={e => set('title', e.target.value)} style={fieldStyle} />
          <textarea placeholder="Description" value={form.description} onChange={e => set('description', e.target.value)} style={{ ...fieldStyle, height: 70, resize: 'vertical' }} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <select value={form.status} onChange={e => set('status', e.target.value)} style={fieldStyle}>
              {STATUSES.map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
            </select>
            <select value={form.priority} onChange={e => set('priority', e.target.value)} style={fieldStyle}>
              {PRIORITIES.map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
            </select>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <input type="date" value={form.due_date} onChange={e => set('due_date', e.target.value)} style={fieldStyle} />
            <select value={form.assignee} onChange={e => set('assignee', e.target.value)} style={fieldStyle}>
              <option value="">Assignee</option>
              {MEMBERS.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={cancelBtnStyle}>Cancel</button>
          <button onClick={handleSubmit} style={saveBtnStyle}>
            {isEdit ? 'Save Changes' : isSubtask ? 'Add Subtask' : 'Add Task'}
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
        <div style={{ fontSize: 15, fontWeight: 600, color: 'rgba(255,255,255,0.88)', marginBottom: 6 }}>Delete Task?</div>
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', marginBottom: 24 }}>"{label}" will be permanently deleted.</div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
          <button onClick={onCancel} style={cancelBtnStyle}>Cancel</button>
          <button onClick={onConfirm} style={{ ...saveBtnStyle, background: '#f87171' }}>Delete</button>
        </div>
      </div>
    </div>
  )
}

function SubtaskRow({ task, onEdit, onDelete, onStatusChange }) {
  const isBacklog = task.status === 'backlog'
  return (
    <div style={{
      background: 'rgba(255,255,255,0.04)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
      border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8,
      boxShadow: '0 4px 24px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.06)',
      padding: '10px 14px', marginBottom: 6,
      borderLeft: `2px solid ${PRIORITY_COLOR[task.priority] || 'rgba(255,255,255,0.12)'}`,
      display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12,
      opacity: isBacklog ? 0.6 : 1,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: 'rgba(255,255,255,0.88)' }}>{task.title}</div>
        {task.description && (
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.40)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {task.description}
          </div>
        )}
        {(task.due_date || task.assignee) && (
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.40)', marginTop: 2 }}>
            {task.due_date && <span style={{ marginRight: 10 }}>Due {fmtDate(task.due_date)}</span>}
            {task.assignee && <span>→ {task.assignee}</span>}
          </div>
        )}
      </div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
        <select
          value={task.status}
          onChange={e => onStatusChange(task.id, e.target.value)}
          style={{
            background: `${STATUS_COLOR[task.status] || '#56567a'}22`,
            border: `1px solid ${STATUS_COLOR[task.status] || '#56567a'}`,
            borderRadius: 5, color: STATUS_COLOR[task.status] || '#56567a',
            padding: '3px 6px', fontSize: 11, cursor: 'pointer', outline: 'none',
          }}
        >
          {STATUSES.map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </select>
        <button
          onClick={() => onStatusChange(task.id, isBacklog ? 'todo' : 'backlog')}
          title={isBacklog ? 'Restore to To Do' : 'Move to Backlog'}
          style={{
            background: 'transparent',
            border: '1px solid rgba(255,255,255,0.10)',
            borderRadius: 5,
            color: 'rgba(255,255,255,0.40)',
            cursor: 'pointer',
            fontSize: 11,
            padding: '3px 6px',
            transition: 'border-color 0.12s, color 0.12s',
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.22)'; e.currentTarget.style.color = 'rgba(255,255,255,0.65)' }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.10)'; e.currentTarget.style.color = 'rgba(255,255,255,0.40)' }}
        >{isBacklog ? '↑ Restore' : '↓ Backlog'}</button>
        <button onClick={() => onEdit(task)} style={iconBtnStyle}>Edit</button>
        <button onClick={() => onDelete(task)} style={{ ...iconBtnStyle, border: 'none', fontSize: 16, color: 'rgba(255,255,255,0.30)' }}>×</button>
      </div>
    </div>
  )
}

function TaskRow({ task, onEdit, onDelete, onStatusChange, onAddSubtask }) {
  const isMobile = useIsMobile()
  const [expanded,  setExpanded]  = useState(false)
  const [subtasks,  setSubtasks]  = useState([])
  const [loadingSub, setLoadingSub] = useState(false)

  const hasSubtasks = task.subtask_count > 0
  const isBacklog = task.status === 'backlog'

  const loadSubtasks = async () => {
    if (!expanded) {
      setLoadingSub(true)
      const all = await api.tasks({ parent_id: String(task.id) })
      setSubtasks(all)
      setLoadingSub(false)
    }
    setExpanded(prev => !prev)
  }

  // Reload subtasks when something changes
  const reloadSubtasks = async () => {
    const all = await api.tasks({ parent_id: String(task.id) })
    setSubtasks(all)
  }

  const roadmapColor = task.roadmap_category ? (ROADMAP_COLOR[task.roadmap_category] || '#9595b8') : null

  return (
    <div style={{ marginBottom: isMobile ? 10 : 8 }}>
      <div style={{
        background: 'rgba(255,255,255,0.04)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
        border: '1px solid rgba(255,255,255,0.08)',
        // iOS-feel card: 14px radius on mobile
        borderRadius: isMobile ? 14 : 10,
        boxShadow: '0 4px 24px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.06)',
        padding: isMobile ? '14px 16px' : '14px 18px',
        borderLeft: `3px solid ${PRIORITY_COLOR[task.priority] || '#9595b8'}`,
        // On mobile: vertical layout — title+meta on top, actions in footer
        display: 'flex',
        flexDirection: isMobile ? 'column' : 'row',
        justifyContent: isMobile ? 'flex-start' : 'space-between',
        alignItems: isMobile ? 'flex-start' : 'center',
        gap: isMobile ? 10 : 16,
        transition: 'box-shadow 150ms ease, background 150ms ease',
      }}
        onMouseEnter={e => { if (!isMobile) { e.currentTarget.style.boxShadow = '0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.10), 0 0 0 1px rgba(255,255,255,0.12)'; e.currentTarget.style.background = 'rgba(255,255,255,0.06)' }}}
        onMouseLeave={e => { if (!isMobile) { e.currentTarget.style.boxShadow = '0 4px 24px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.06)'; e.currentTarget.style.background = 'rgba(255,255,255,0.04)' }}}
      >
        {/* Title + meta */}
        <div style={{ flex: 1, minWidth: 0, width: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {/* Title — 16px medium on mobile for clear hierarchy */}
            <span style={{ fontSize: isMobile ? 16 : 14, fontWeight: isMobile ? 600 : 600, color: 'rgba(255,255,255,0.88)', lineHeight: 1.4 }}>{task.title}</span>
            {roadmapColor && (
              <span style={{
                background: `${roadmapColor}22`, border: `1px solid ${roadmapColor}44`,
                borderRadius: 4, color: roadmapColor, fontSize: 10, fontWeight: 700,
                padding: '1px 6px', letterSpacing: '0.06em', textTransform: 'uppercase', flexShrink: 0,
              }}>{task.roadmap_category}</span>
            )}
          </div>
          {task.description && (
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.5 }}>
              {task.description}
            </div>
          )}
          {/* Metadata row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4, flexWrap: 'wrap' }}>
            {task.due_date && <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>Due {fmtDate(task.due_date)}</span>}
            {task.assignee && <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>→ {task.assignee}</span>}
            {task.subtask_count > 0 && (
              <button
                onClick={loadSubtasks}
                style={{
                  background: 'transparent', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 5,
                  color: 'rgba(255,255,255,0.40)', cursor: 'pointer', fontSize: 11,
                  padding: isMobile ? '4px 10px' : '2px 7px',
                  minHeight: isMobile ? 32 : 'auto',
                  display: 'flex', alignItems: 'center', gap: 4, transition: 'border-color 0.12s, color 0.12s',
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.22)'; e.currentTarget.style.color = 'rgba(255,255,255,0.65)' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.10)'; e.currentTarget.style.color = 'rgba(255,255,255,0.40)' }}
              >
                {expanded ? '▾' : '▸'}
                <span>{task.subtasks_done}/{task.subtask_count} subtasks</span>
              </button>
            )}
          </div>
        </div>

        {/* Action row — stacks below title on mobile */}
        <div style={{
          display: 'flex', gap: 8, alignItems: 'center',
          flexShrink: 0,
          // On mobile: full width row at bottom of card
          ...(isMobile && { width: '100%', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 10, flexWrap: 'wrap' }),
          ...(!isMobile && { flexWrap: 'wrap', maxWidth: 'min-content' }),
        }}>
          <select
            value={task.status}
            onChange={e => onStatusChange(task.id, e.target.value)}
            style={{
              background: `${STATUS_COLOR[task.status] || '#56567a'}22`,
              border: `1px solid ${STATUS_COLOR[task.status] || '#56567a'}`,
              borderRadius: 6, color: STATUS_COLOR[task.status] || '#56567a',
              padding: '4px 8px', fontSize: 12, cursor: 'pointer', outline: 'none',
              minHeight: isMobile ? 36 : 'auto',
            }}
          >
            {STATUSES.map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </select>
          <button
            onClick={() => onStatusChange(task.id, isBacklog ? 'todo' : 'backlog')}
            title={isBacklog ? 'Restore to To Do' : 'Move to Backlog'}
            style={{
              background: 'transparent',
              border: '1px solid rgba(255,255,255,0.10)',
              borderRadius: 6,
              color: 'rgba(255,255,255,0.40)',
              cursor: 'pointer',
              fontSize: 12,
              padding: '4px 8px',
              minHeight: isMobile ? 36 : 'auto',
              transition: 'border-color 0.12s, color 0.12s',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.22)'; e.currentTarget.style.color = 'rgba(255,255,255,0.65)' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.10)'; e.currentTarget.style.color = 'rgba(255,255,255,0.40)' }}
          >{isBacklog ? '↑ Restore' : '↓ Backlog'}</button>
          <button
            onClick={() => onEdit(task)}
            style={{ ...iconBtnStyle, ...(isMobile && { minHeight: 36, padding: '4px 12px' }) }}
          >Edit</button>
          <button
            onClick={() => onAddSubtask(task.id)}
            style={{ ...iconBtnStyle, ...(isMobile && { minHeight: 36, padding: '4px 12px' }) }}
            title="Add subtask"
          >+ Sub</button>
          <button
            onClick={() => onDelete(task)}
            style={{
              background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.30)', cursor: 'pointer',
              fontSize: 18, lineHeight: 1, transition: 'color 0.12s',
              // 44×44 touch target on mobile
              ...(isMobile && { minWidth: 44, minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center' }),
            }}
            onMouseEnter={e => { e.currentTarget.style.color = '#f87171' }}
            onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.30)' }}
          >×</button>
        </div>
      </div>

      {/* Subtasks */}
      {expanded && (
        <div style={{ paddingLeft: isMobile ? 12 : 24, marginTop: 4 }}>
          {loadingSub && <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.30)', padding: '8px 0' }}>Loading…</div>}
          {subtasks.map(sub => (
            <SubtaskRow
              key={sub.id}
              task={sub}
              onEdit={onEdit}
              onDelete={onDelete}
              onStatusChange={async (id, s) => { await onStatusChange(id, s); reloadSubtasks() }}
            />
          ))}
          {!loadingSub && subtasks.length === 0 && (
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.30)', padding: '6px 0' }}>No subtasks yet.</div>
          )}
        </div>
      )}
    </div>
  )
}

function StatusSection({ status, tasks, collapsed, onToggle, onEdit, onDelete, onStatusChange, onAddSubtask }) {
  const color = STATUS_COLOR[status]
  const label = STATUS_LABEL[status]

  // Special tinting for blocked and in_progress
  const headerBg = status === 'blocked'     ? '#ff4d4d22'
                 : status === 'in_progress' ? '#7c6af722'
                 : 'transparent'
  const headerColor = status === 'blocked'     ? '#ff6b6b'
                    : status === 'in_progress' ? '#a89fff'
                    : color

  return (
    <div style={{ marginBottom: 24 }}>
      <button
        onClick={onToggle}
        style={{
          background: headerBg,
          border: status === 'blocked'     ? '1px solid #ff4d4d33'
               : status === 'in_progress' ? '1px solid #7c6af733'
               : '1px solid transparent',
          borderRadius: 8,
          cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 8,
          marginBottom: collapsed ? 0 : 10,
          padding: '6px 10px',
          width: '100%',
          textAlign: 'left',
          position: 'sticky', top: 0,
          zIndex: 2,
          transition: 'opacity 0.12s',
        }}
        onMouseEnter={e => { e.currentTarget.style.opacity = '0.85' }}
        onMouseLeave={e => { e.currentTarget.style.opacity = '1' }}
      >
        <span style={{ color: headerColor, fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
          {label}
        </span>
        <span style={{
          background: `${headerColor}22`, border: `1px solid ${headerColor}44`,
          borderRadius: 10, color: headerColor, fontSize: 11, fontWeight: 600,
          padding: '1px 7px',
        }}>
          {tasks.length}
        </span>
        <span style={{ color: 'rgba(255,255,255,0.30)', fontSize: 12, marginLeft: 2 }}>{collapsed ? '▸' : '▾'}</span>
      </button>

      {!collapsed && tasks.map(t => (
        <TaskRow
          key={t.id}
          task={t}
          onEdit={onEdit}
          onDelete={onDelete}
          onStatusChange={onStatusChange}
          onAddSubtask={onAddSubtask}
        />
      ))}
    </div>
  )
}

function BacklogSection({ tasks, collapsed, onToggle, onEdit, onDelete, onStatusChange, onAddSubtask }) {
  return (
    <div style={{ marginTop: 8, marginBottom: 24 }}>
      <button
        onClick={onToggle}
        style={{
          background: 'transparent',
          border: '1px solid transparent',
          borderRadius: 8,
          cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 8,
          marginBottom: collapsed ? 0 : 10,
          padding: '6px 10px',
          width: '100%',
          textAlign: 'left',
          position: 'sticky', top: 0,
          zIndex: 2,
          transition: 'opacity 0.12s',
        }}
        onMouseEnter={e => { e.currentTarget.style.opacity = '0.75' }}
        onMouseLeave={e => { e.currentTarget.style.opacity = '1' }}
      >
        <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
          Backlog
        </span>
        <span style={{
          background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.10)',
          borderRadius: 10, color: 'rgba(255,255,255,0.35)', fontSize: 11, fontWeight: 600,
          padding: '1px 7px',
        }}>
          {tasks.length}
        </span>
        <span style={{ color: 'rgba(255,255,255,0.25)', fontSize: 12, marginLeft: 2 }}>{collapsed ? '▸' : '▾'}</span>
      </button>

      {!collapsed && (
        <div style={{ opacity: 0.7 }}>
          {tasks.map(t => (
            <TaskRow
              key={t.id}
              task={t}
              onEdit={onEdit}
              onDelete={onDelete}
              onStatusChange={onStatusChange}
              onAddSubtask={onAddSubtask}
            />
          ))}
        </div>
      )}
    </div>
  )
}

const ACTIVE_STATUSES = ['todo', 'in_progress', 'blocked', 'done']

export default function Tasks() {
  const isMobile = useIsMobile()
  const [tasks,       setTasks]       = useState([])
  const [priority,    setPriority]    = useState('')
  const [adding,      setAdding]      = useState(false)
  const [addingSubTo, setAddingSubTo] = useState(null) // parent task id
  const [editing,     setEditing]     = useState(null)
  const [deleting,    setDeleting]    = useState(null)
  const [loading,     setLoading]     = useState(true)
  const [collapsed,   setCollapsed]   = useState({ done: true, backlog: true })

  const load = () => {
    setLoading(true)
    const params = { parent_id: 'null', ...(priority ? { priority } : {}) }
    api.tasks(params).then(setTasks).finally(() => setLoading(false))
  }

  useEffect(load, [priority])

  const handleSave = async (form) => {
    await api.createTask(form)
    setAdding(false)
    load()
  }

  const handleSubtaskSave = async (form) => {
    await api.createTask(form)
    setAddingSubTo(null)
    load()
  }

  const handleEdit = async (form) => {
    await api.updateTask(editing.id, form)
    setEditing(null)
    load()
  }

  const handleStatusChange = async (id, newStatus) => {
    // Optimistic update
    setTasks(prev => prev.map(t => t.id === id ? { ...t, status: newStatus } : t))
    await api.updateTask(id, { status: newStatus })
    load()
  }

  const handleDeleteConfirm = async () => {
    await api.deleteTask(deleting.id)
    setDeleting(null)
    load()
  }

  const toggleSection = (status) => {
    setCollapsed(prev => ({ ...prev, [status]: !prev[status] }))
  }

  const activeTasks  = tasks.filter(t => t.status !== 'backlog')
  const backlogTasks = tasks.filter(t => t.status === 'backlog')

  const grouped = ACTIVE_STATUSES.reduce((acc, s) => {
    acc[s] = activeTasks.filter(t => t.status === s)
    return acc
  }, {})

  const openCount = tasks.filter(t => t.status !== 'done' && t.status !== 'backlog').length

  return (
    <div style={{ padding: isMobile ? '16px 16px' : '32px 40px' }}>
      {adding      && <TaskModal onClose={() => setAdding(false)} onSave={handleSave} />}
      {addingSubTo && <TaskModal parentId={addingSubTo} onClose={() => setAddingSubTo(null)} onSave={handleSubtaskSave} />}
      {editing     && <TaskModal initial={editing} onClose={() => setEditing(null)} onSave={handleEdit} />}
      {deleting    && <ConfirmDelete label={deleting.title} onCancel={() => setDeleting(null)} onConfirm={handleDeleteConfirm} />}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, ...(isMobile && { paddingTop: 'calc(16px + env(safe-area-inset-top, 0px))' }) }}>
        <div>
          {/* 22px on mobile, 28px on desktop */}
          <h1 style={{ fontSize: isMobile ? 22 : 28, fontWeight: 700, margin: 0, letterSpacing: '-0.02em', background: 'linear-gradient(135deg, #ffffff 0%, rgba(255,255,255,0.75) 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>Tasks</h1>
          <p style={{ color: 'rgba(255,255,255,0.45)', marginTop: 6, fontSize: 14, lineHeight: 1.5 }}>
            {openCount} open · {tasks.length} total
          </p>
        </div>
        <button
          onClick={() => setAdding(true)}
          style={saveBtnStyle}
          onMouseEnter={e => { e.currentTarget.style.background = 'linear-gradient(135deg, rgba(124,106,247,0.90) 0%, rgba(99,102,241,0.80) 100%)'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(124,106,247,0.40), inset 0 1px 0 rgba(255,255,255,0.20)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'linear-gradient(135deg, rgba(124,106,247,0.80) 0%, rgba(99,102,241,0.70) 100%)'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(124,106,247,0.25), inset 0 1px 0 rgba(255,255,255,0.15)' }}
          onMouseDown={e => { e.currentTarget.style.transform = 'scale(0.97)'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(124,106,247,0.30)' }}
          onMouseUp={e => { e.currentTarget.style.transform = 'scale(1)' }}
        >+ Add Task</button>
      </div>

      {/* Priority filter — 44px min height on mobile (Apple HIG) */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 28, flexWrap: 'wrap' }}>
        {['', ...PRIORITIES].map(p => (
          <button
            key={p}
            onClick={() => setPriority(p)}
            className="filter-pill"
            style={{
              background: priority === p ? `${PRIORITY_COLOR[p] || '#7c6af7'}22` : 'transparent',
              border: `1px solid ${priority === p ? (PRIORITY_COLOR[p] || '#7c6af7') : 'rgba(255,255,255,0.10)'}`,
              borderRadius: 8,
              color: priority === p ? (PRIORITY_COLOR[p] || '#a89fff') : 'rgba(255,255,255,0.45)',
              padding: '5px 14px', fontSize: 13, cursor: 'pointer', transition: 'all 0.12s',
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
            }}
          >
            {p ? p.charAt(0).toUpperCase() + p.slice(1) : 'All'}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: 14, padding: '20px 0' }}>Loading…</div>
      ) : tasks.length === 0 ? (
        <div style={{
          background: 'rgba(255,255,255,0.04)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 12, boxShadow: '0 4px 24px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.06)',
          padding: '40px 20px', textAlign: 'center',
        }}>
          <div style={{ fontSize: 20, color: 'rgba(255,255,255,0.12)', marginBottom: 10 }}>⊞</div>
          <div style={{ color: 'rgba(255,255,255,0.40)', fontSize: 14, marginBottom: 16 }}>No tasks found.</div>
          <button onClick={() => setAdding(true)} style={{ ...saveBtnStyle, fontSize: 12, padding: '7px 16px' }}>
            + Add your first task
          </button>
        </div>
      ) : (
        <>
          {ACTIVE_STATUSES.map(s => (
            grouped[s].length > 0 && (
              <StatusSection
                key={s}
                status={s}
                tasks={grouped[s]}
                collapsed={!!collapsed[s]}
                onToggle={() => toggleSection(s)}
                onEdit={setEditing}
                onDelete={setDeleting}
                onStatusChange={handleStatusChange}
                onAddSubtask={setAddingSubTo}
              />
            )
          ))}

          {backlogTasks.length > 0 && (
            <>
              <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', marginBottom: 16 }} />
              <BacklogSection
                tasks={backlogTasks}
                collapsed={!!collapsed.backlog}
                onToggle={() => toggleSection('backlog')}
                onEdit={setEditing}
                onDelete={setDeleting}
                onStatusChange={handleStatusChange}
                onAddSubtask={setAddingSubTo}
              />
            </>
          )}
        </>
      )}
    </div>
  )
}

const overlayStyle   = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }
const modalStyle     = { background: 'rgba(255,255,255,0.07)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 16, boxShadow: '0 8px 40px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.10)', padding: 28, width: 460, maxWidth: '90vw' }
const fieldStyle     = { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 8, color: 'rgba(255,255,255,0.90)', padding: '9px 12px', fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box', transition: 'border-color 0.15s ease, box-shadow 0.15s ease' }
const saveBtnStyle   = { background: 'linear-gradient(135deg, rgba(124,106,247,0.80) 0%, rgba(99,102,241,0.70) 100%)', border: '1px solid rgba(124,106,247,0.60)', borderRadius: 8, boxShadow: '0 4px 16px rgba(124,106,247,0.25), inset 0 1px 0 rgba(255,255,255,0.15)', color: '#ffffff', padding: '9px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer', transition: 'all 150ms ease' }
const cancelBtnStyle = { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, color: 'rgba(255,255,255,0.65)', padding: '9px 18px', fontSize: 13, cursor: 'pointer', transition: 'all 150ms ease' }
const iconBtnStyle   = { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 6, color: 'rgba(255,255,255,0.45)', cursor: 'pointer', fontSize: 12, padding: '4px 8px', transition: 'border-color 0.12s, color 0.12s' }
