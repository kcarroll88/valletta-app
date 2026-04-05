import React, { useEffect, useState, useRef, useCallback } from 'react'
import { api } from '../api'
import useIsMobile from '../hooks/useIsMobile'

// ─── Constants ───────────────────────────────────────────────────────────────

const STATUS_COLOR = { todo: '#9595b8', in_progress: '#7c6af7', done: '#4ade80', blocked: '#f87171', backlog: '#56567a' }
const STATUS_LABEL = { todo: 'To Do', in_progress: 'In Progress', done: 'Done', blocked: 'Blocked', backlog: 'Backlog' }
const PRIORITY_COLOR = { high: '#f87171', medium: '#fbbf24', low: '#4ade80' }
const BOARD_STATUSES = ['todo', 'in_progress', 'blocked', 'done']
const ALL_STATUSES = ['todo', 'in_progress', 'blocked', 'done', 'backlog']

// Status sort order for table default sort
const STATUS_ORDER = { todo: 0, in_progress: 1, blocked: 2, done: 3, backlog: 4 }
const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 }

const TEAM_MEMBERS = [
  'Keenan', 'Justin',
  'Felix', 'Nina', 'Cass', 'Marco', 'Priya', 'Eli', 'Quinn', 'Finn',
  'Tara', 'Iris', 'Milo', 'Rex', 'Jade', 'Nova', 'Scout',
  'Leo', 'Vera', 'Dot',
]

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtDate(iso) {
  if (!iso) return ''
  try {
    const d = new Date(iso + 'T00:00:00')
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  } catch { return iso }
}

function isOverdue(iso) {
  if (!iso) return false
  const today = new Date(); today.setHours(0,0,0,0)
  const d = new Date(iso + 'T00:00:00')
  return d < today
}

function timeAgo(iso) {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

function getToken() {
  return localStorage.getItem('vlt_token') || ''
}

async function fetchComments(taskId) {
  const token = getToken()
  const res = await fetch(`/api/tasks/${taskId}/comments`, {
    headers: { Authorization: `Bearer ${token}` }
  })
  if (!res.ok) return []
  return res.json()
}

async function postComment(taskId, author, body) {
  const token = getToken()
  const res = await fetch(`/api/tasks/${taskId}/comments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ author, body })
  })
  if (!res.ok) throw new Error('Failed to post comment')
  return res.json()
}

async function deleteComment(taskId, commentId) {
  const token = getToken()
  await fetch(`/api/tasks/${taskId}/comments/${commentId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` }
  })
}

function renderCommentBody(text) {
  if (!text) return null
  const parts = text.split(/(@\w+)/g)
  return parts.map((part, i) =>
    part.startsWith('@')
      ? <span key={i} style={{ color: '#7c6af7', fontWeight: 600 }}>{part}</span>
      : <span key={i}>{part}</span>
  )
}

// ─── Shared Input Styles ─────────────────────────────────────────────────────

const fieldStyle = {
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 8,
  color: 'rgba(255,255,255,0.88)',
  padding: '8px 12px',
  fontSize: 13,
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box',
}

// ─── MentionTextarea ─────────────────────────────────────────────────────────

function MentionTextarea({ value, onChange, placeholder, style }) {
  const [showMentions, setShowMentions] = useState(false)
  const [mentionQuery, setMentionQuery] = useState('')
  const ref = useRef(null)

  const handleChange = (e) => {
    const val = e.target.value
    onChange(val)
    const cursor = e.target.selectionStart
    const before = val.slice(0, cursor)
    const match = before.match(/@(\w*)$/)
    if (match) {
      setMentionQuery(match[1])
      setShowMentions(true)
    } else {
      setShowMentions(false)
    }
  }

  const pickMention = (name) => {
    const cursor = ref.current.selectionStart
    const before = value.slice(0, cursor)
    const after = value.slice(cursor)
    const newBefore = before.replace(/@\w*$/, `@${name} `)
    onChange(newBefore + after)
    setShowMentions(false)
    ref.current.focus()
  }

  const filtered = mentionQuery
    ? TEAM_MEMBERS.filter(m => m.toLowerCase().startsWith(mentionQuery.toLowerCase()))
    : TEAM_MEMBERS

  return (
    <div style={{ position: 'relative' }}>
      <textarea
        ref={ref}
        value={value}
        onChange={handleChange}
        placeholder={placeholder}
        style={{ ...fieldStyle, resize: 'none', height: 72, ...style }}
      />
      {showMentions && filtered.length > 0 && (
        <div style={{
          position: 'absolute', bottom: '100%', left: 0, zIndex: 50,
          background: 'rgba(22,22,35,0.98)', border: '1px solid rgba(255,255,255,0.15)',
          borderRadius: 8, padding: 4, minWidth: 160, maxHeight: 180, overflowY: 'auto',
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        }}>
          {filtered.map(m => (
            <div
              key={m}
              onMouseDown={() => pickMention(m)}
              style={{
                padding: '6px 12px', fontSize: 13, color: 'rgba(255,255,255,0.85)',
                cursor: 'pointer', borderRadius: 5,
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(124,106,247,0.2)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              @{m}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Task Detail Panel ────────────────────────────────────────────────────────

function TaskDetailPanel({ taskId, onClose, onUpdate, onDelete, isMobile, currentUser }) {
  const [task, setTask]             = useState(null)
  const [loading, setLoading]       = useState(true)
  const [editTitle, setEditTitle]   = useState(false)
  const [titleVal, setTitleVal]     = useState('')
  const [descVal, setDescVal]       = useState('')
  const [subtasksOpen, setSubtasksOpen] = useState(true)
  const [subtasks, setSubtasks]     = useState([])
  const [newSubtask, setNewSubtask] = useState('')
  const [comments, setComments]     = useState([])
  const [commentText, setCommentText] = useState('')
  const [commentPosting, setCommentPosting] = useState(false)
  const [saving, setSaving]         = useState(false)
  const [visible, setVisible]       = useState(false)

  const authorName = currentUser || localStorage.getItem('vlt_author') || 'You'

  useEffect(() => {
    setTimeout(() => setVisible(true), 10)
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [t, c] = await Promise.all([
        api.task(taskId),
        fetchComments(taskId),
      ])
      setTask(t)
      setTitleVal(t.title)
      setDescVal(t.description || '')
      setSubtasks(t.subtasks || [])
      setComments(c)
    } finally {
      setLoading(false)
    }
  }, [taskId])

  useEffect(() => { load() }, [load])

  const patch = async (fields) => {
    setSaving(true)
    try {
      const updated = await api.updateTask(taskId, fields)
      setTask(prev => ({ ...prev, ...updated }))
      onUpdate(updated)
    } finally {
      setSaving(false)
    }
  }

  const handleTitleBlur = () => {
    setEditTitle(false)
    if (titleVal.trim() && titleVal !== task.title) patch({ title: titleVal.trim() })
  }

  const handleDescBlur = () => {
    if (descVal !== task.description) patch({ description: descVal })
  }

  const handleAddSubtask = async () => {
    if (!newSubtask.trim()) return
    const sub = await api.createTask({ title: newSubtask.trim(), status: 'todo', priority: 'medium', parent_id: taskId })
    setSubtasks(prev => [...prev, sub])
    setNewSubtask('')
    onUpdate({ ...task, subtask_count: (task.subtask_count || 0) + 1 })
  }

  const handleDeleteSubtask = async (subId) => {
    await api.deleteTask(subId)
    setSubtasks(prev => prev.filter(s => s.id !== subId))
    onUpdate({ ...task, subtask_count: Math.max(0, (task.subtask_count || 1) - 1) })
  }

  const handleSubtaskStatus = async (subId, status) => {
    await api.updateTask(subId, { status })
    setSubtasks(prev => prev.map(s => s.id === subId ? { ...s, status } : s))
  }

  const handlePostComment = async () => {
    if (!commentText.trim()) return
    setCommentPosting(true)
    try {
      const c = await postComment(taskId, authorName, commentText.trim())
      setComments(prev => [...prev, c])
      setCommentText('')
      if (onUpdate) onUpdate({ ...task, comment_count: (task.comment_count || 0) + 1 })
    } catch(e) {
      console.error('Comment post error:', e)
      alert('Failed to post comment: ' + e.message)
    } finally {
      setCommentPosting(false)
    }
  }

  const handleDeleteComment = async (cid) => {
    await deleteComment(taskId, cid)
    setComments(prev => prev.filter(c => c.id !== cid))
    onUpdate({ ...task, comment_count: Math.max(0, (task.comment_count || 1) - 1) })
  }

  const handleClose = () => {
    setVisible(false)
    setTimeout(onClose, 300)
  }

  // Panel sizing
  const panelStyle = isMobile ? {
    position: 'fixed', left: 0, right: 0, bottom: 0,
    height: '92vh',
    background: 'rgba(18,18,30,0.97)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    borderRadius: '20px 20px 0 0',
    zIndex: 500,
    display: 'flex', flexDirection: 'column',
    transform: visible ? 'translateY(0)' : 'translateY(100%)',
    transition: 'transform 0.3s cubic-bezier(0.32,0.72,0,1)',
    boxShadow: '0 -8px 40px rgba(0,0,0,0.6)',
    overflowY: 'auto',
  } : {
    position: 'fixed', top: 0, right: 0,
    width: 420, height: '100vh',
    background: 'rgba(18,18,30,0.97)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    zIndex: 500,
    display: 'flex', flexDirection: 'column',
    transform: visible ? 'translateX(0)' : 'translateX(100%)',
    transition: 'transform 0.3s cubic-bezier(0.32,0.72,0,1)',
    boxShadow: '-8px 0 40px rgba(0,0,0,0.5)',
    borderLeft: '1px solid rgba(255,255,255,0.08)',
    overflowY: 'auto',
  }

  return (
    <>
      {/* Overlay */}
      <div
        onClick={handleClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 499,
          background: 'rgba(0,0,0,0.4)',
          opacity: visible ? 1 : 0,
          transition: 'opacity 0.3s ease',
        }}
      />
      {/* Panel */}
      <div style={panelStyle}>
        {isMobile && (
          <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 12, paddingBottom: 4 }}>
            <div style={{ width: 36, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.2)' }} />
          </div>
        )}

        {loading ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.4)', fontSize: 14 }}>
            Loading…
          </div>
        ) : task ? (
          <div style={{ padding: '16px 24px 40px', display: 'flex', flexDirection: 'column', gap: 20 }}>

            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <div style={{ flex: 1 }}>
                {editTitle ? (
                  <input
                    autoFocus
                    value={titleVal}
                    onChange={e => setTitleVal(e.target.value)}
                    onBlur={handleTitleBlur}
                    onKeyDown={e => { if (e.key === 'Enter') handleTitleBlur(); if (e.key === 'Escape') { setEditTitle(false); setTitleVal(task.title) } }}
                    style={{ ...fieldStyle, fontSize: 18, fontWeight: 700, padding: '6px 10px' }}
                  />
                ) : (
                  <div
                    onClick={() => setEditTitle(true)}
                    title="Click to edit"
                    style={{ fontSize: 18, fontWeight: 700, color: 'rgba(255,255,255,0.92)', lineHeight: 1.3, cursor: 'text' }}
                  >
                    {task.title}
                  </div>
                )}
              </div>
              <button
                onClick={handleClose}
                style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.45)', fontSize: 22, cursor: 'pointer', lineHeight: 1, padding: '2px 6px', flexShrink: 0 }}
              >×</button>
            </div>

            {/* Status pills */}
            <div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Status</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {Object.keys(STATUS_LABEL).map(s => (
                  <button
                    key={s}
                    onClick={() => patch({ status: s })}
                    style={{
                      padding: '5px 12px', borderRadius: 20, fontSize: 12, cursor: 'pointer',
                      border: `1px solid ${STATUS_COLOR[s]}`,
                      background: task.status === s ? STATUS_COLOR[s] + '33' : 'transparent',
                      color: task.status === s ? STATUS_COLOR[s] : 'rgba(255,255,255,0.5)',
                      fontWeight: task.status === s ? 600 : 400,
                      transition: 'all 0.15s',
                    }}
                  >
                    {STATUS_LABEL[s]}
                  </button>
                ))}
              </div>
            </div>

            {/* Priority pills */}
            <div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Priority</div>
              <div style={{ display: 'flex', gap: 6 }}>
                {['high', 'medium', 'low'].map(p => (
                  <button
                    key={p}
                    onClick={() => patch({ priority: p })}
                    style={{
                      padding: '5px 14px', borderRadius: 20, fontSize: 12, cursor: 'pointer',
                      border: `1px solid ${PRIORITY_COLOR[p]}`,
                      background: task.priority === p ? PRIORITY_COLOR[p] + '33' : 'transparent',
                      color: task.priority === p ? PRIORITY_COLOR[p] : 'rgba(255,255,255,0.5)',
                      fontWeight: task.priority === p ? 600 : 400,
                      transition: 'all 0.15s',
                    }}
                  >
                    {p.charAt(0).toUpperCase() + p.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {/* Assignee + Due date */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Assignee</div>
                <select
                  value={task.assignee || ''}
                  onChange={e => patch({ assignee: e.target.value || null })}
                  style={{ ...fieldStyle, fontSize: 13 }}
                >
                  <option value="">Unassigned</option>
                  {TEAM_MEMBERS.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Due Date</div>
                <input
                  type="date"
                  value={task.due_date || ''}
                  onChange={e => patch({ due_date: e.target.value || null })}
                  style={{ ...fieldStyle, fontSize: 13, colorScheme: 'dark' }}
                />
              </div>
            </div>

            {/* Description */}
            <div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Description</div>
              <textarea
                value={descVal}
                onChange={e => setDescVal(e.target.value)}
                onBlur={handleDescBlur}
                placeholder="Add a description…"
                rows={4}
                style={{ ...fieldStyle, resize: 'vertical', minHeight: 80 }}
              />
            </div>

            {/* Subtasks */}
            <div>
              <button
                onClick={() => setSubtasksOpen(o => !o)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, padding: 0, marginBottom: 8 }}
              >
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Subtasks</span>
                <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', transform: subtasksOpen ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s', display: 'inline-block' }}>▶</span>
                {subtasks.length > 0 && (
                  <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>
                    {subtasks.filter(s => s.status === 'done').length}/{subtasks.length}
                  </span>
                )}
              </button>
              {subtasksOpen && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {subtasks.map(s => (
                    <div key={s.id} style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      background: 'rgba(255,255,255,0.04)', borderRadius: 8,
                      padding: '8px 10px', border: '1px solid rgba(255,255,255,0.08)',
                    }}>
                      <input
                        type="checkbox"
                        checked={s.status === 'done'}
                        onChange={e => handleSubtaskStatus(s.id, e.target.checked ? 'done' : 'todo')}
                        style={{ cursor: 'pointer', accentColor: '#7c6af7', width: 14, height: 14, flexShrink: 0 }}
                      />
                      <span style={{
                        flex: 1, fontSize: 13, color: s.status === 'done' ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.8)',
                        textDecoration: s.status === 'done' ? 'line-through' : 'none',
                      }}>{s.title}</span>
                      <button
                        onClick={() => handleDeleteSubtask(s.id)}
                        style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.25)', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: '0 2px' }}
                        onMouseEnter={e => e.currentTarget.style.color = '#f87171'}
                        onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.25)'}
                      >×</button>
                    </div>
                  ))}
                  {/* Add subtask inline */}
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input
                      value={newSubtask}
                      onChange={e => setNewSubtask(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleAddSubtask() }}
                      placeholder="Add subtask…"
                      style={{ ...fieldStyle, fontSize: 12, padding: '6px 10px' }}
                    />
                    <button
                      onClick={handleAddSubtask}
                      style={{
                        background: 'rgba(124,106,247,0.2)', border: '1px solid rgba(124,106,247,0.4)',
                        borderRadius: 8, color: '#a89fff', fontSize: 12, cursor: 'pointer', padding: '6px 12px', flexShrink: 0,
                      }}
                    >Add</button>
                  </div>
                </div>
              )}
            </div>

            {/* Divider */}
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 4 }}>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
                Comments {comments.length > 0 ? `(${comments.length})` : ''}
              </div>

              {/* Comments list */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
                {comments.map(c => (
                  <CommentItem key={c.id} comment={c} onDelete={() => handleDeleteComment(c.id)} />
                ))}
                {comments.length === 0 && (
                  <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.25)', fontStyle: 'italic' }}>No comments yet</div>
                )}
              </div>

              {/* Comment input */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <MentionTextarea
                  value={commentText}
                  onChange={setCommentText}
                  placeholder="Write a comment… use @ to mention"
                />
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    onClick={handlePostComment}
                    disabled={!commentText.trim() || commentPosting}
                    style={{
                      background: commentText.trim() && !commentPosting ? 'rgba(124,106,247,0.25)' : 'rgba(255,255,255,0.05)',
                      border: `1px solid ${commentText.trim() && !commentPosting ? 'rgba(124,106,247,0.5)' : 'rgba(255,255,255,0.1)'}`,
                      borderRadius: 8, color: commentText.trim() && !commentPosting ? '#a89fff' : 'rgba(255,255,255,0.3)',
                      fontSize: 13, cursor: commentText.trim() && !commentPosting ? 'pointer' : 'default',
                      padding: '7px 18px', transition: 'all 0.15s',
                    }}
                  >{commentPosting ? 'Posting…' : 'Post'}</button>
                </div>
              </div>
            </div>

            {/* Delete task */}
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 16 }}>
              <button
                onClick={() => onDelete(task)}
                style={{
                  background: 'transparent', border: '1px solid rgba(248,113,113,0.3)',
                  borderRadius: 8, color: 'rgba(248,113,113,0.7)', fontSize: 13,
                  cursor: 'pointer', padding: '8px 16px', transition: 'all 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(248,113,113,0.1)'; e.currentTarget.style.color = '#f87171' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'rgba(248,113,113,0.7)' }}
              >Delete Task</button>
            </div>
          </div>
        ) : (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.4)', fontSize: 14 }}>
            Task not found.
          </div>
        )}
      </div>
    </>
  )
}

function CommentItem({ comment, onDelete }) {
  const [hovered, setHovered] = useState(false)
  return (
    <div
      style={{ display: 'flex', flexDirection: 'column', gap: 4 }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: '#7c6af7' }}>{comment.author}</span>
        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>{timeAgo(comment.created_at)}</span>
        {hovered && (
          <button
            onClick={onDelete}
            style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'rgba(255,255,255,0.25)', cursor: 'pointer', fontSize: 15, lineHeight: 1 }}
            onMouseEnter={e => e.currentTarget.style.color = '#f87171'}
            onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.25)'}
          >×</button>
        )}
      </div>
      <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.75)', lineHeight: 1.5 }}>
        {renderCommentBody(comment.body)}
      </div>
    </div>
  )
}

// ─── Inline Add Task Form ─────────────────────────────────────────────────────

function InlineAddTask({ status, onAdd, onCancel }) {
  const [title, setTitle]       = useState('')
  const [assignee, setAssignee] = useState('')
  const [priority, setPriority] = useState('medium')

  const handleAdd = () => {
    if (!title.trim()) return
    onAdd({ title: title.trim(), status, priority, assignee: assignee || undefined })
  }

  return (
    <div style={{
      background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)',
      borderRadius: 10, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8,
    }}>
      <input
        autoFocus
        value={title}
        onChange={e => setTitle(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') handleAdd(); if (e.key === 'Escape') onCancel() }}
        placeholder="Task title…"
        style={{ ...fieldStyle, fontSize: 13, padding: '6px 10px' }}
      />
      <div style={{ display: 'flex', gap: 6 }}>
        <select
          value={assignee}
          onChange={e => setAssignee(e.target.value)}
          style={{ ...fieldStyle, fontSize: 12, padding: '5px 8px', flex: 1 }}
        >
          <option value="">Assignee</option>
          {TEAM_MEMBERS.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
        <select
          value={priority}
          onChange={e => setPriority(e.target.value)}
          style={{ ...fieldStyle, fontSize: 12, padding: '5px 8px', flex: 1 }}
        >
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <button
          onClick={handleAdd}
          style={{
            flex: 1, background: 'rgba(124,106,247,0.2)', border: '1px solid rgba(124,106,247,0.4)',
            borderRadius: 8, color: '#a89fff', fontSize: 12, cursor: 'pointer', padding: '7px',
          }}
        >Add</button>
        <button
          onClick={onCancel}
          style={{
            flex: 1, background: 'transparent', border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 8, color: 'rgba(255,255,255,0.45)', fontSize: 12, cursor: 'pointer', padding: '7px',
          }}
        >Cancel</button>
      </div>
    </div>
  )
}

// ─── Task Card ────────────────────────────────────────────────────────────────

function TaskCard({ task, onClick, onDragStart, onDragEnd }) {
  const [hovered, setHovered] = useState(false)
  const [dragging, setDragging] = useState(false)

  const handleDragStart = (e) => {
    setDragging(true)
    e.dataTransfer.setData('taskId', String(task.id))
    e.dataTransfer.effectAllowed = 'move'
    onDragStart?.(task.id)
  }

  const handleDragEnd = () => {
    setDragging(false)
    onDragEnd?.()
  }

  const overdueDate = isOverdue(task.due_date)
  const hasSubtasks = task.subtask_count > 0
  const hasComments = task.comment_count > 0

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: hovered ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.05)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderLeft: `4px solid ${PRIORITY_COLOR[task.priority] || '#9595b8'}`,
        borderRadius: 10,
        padding: '10px 12px',
        cursor: 'pointer',
        opacity: dragging ? 0.5 : 1,
        transform: hovered && !dragging ? 'translateY(-1px)' : 'none',
        transition: 'background 0.15s, transform 0.15s, opacity 0.15s',
        userSelect: 'none',
        position: 'relative',
      }}
    >
      {/* Drag handle */}
      {hovered && (
        <div style={{
          position: 'absolute', left: -3, top: '50%', transform: 'translateY(-50%)',
          color: 'rgba(255,255,255,0.2)', fontSize: 14, pointerEvents: 'none', lineHeight: 1,
        }}>⠿</div>
      )}

      {/* Title */}
      <div style={{ fontSize: 14, fontWeight: 700, color: 'rgba(255,255,255,0.92)', lineHeight: 1.35, marginBottom: 4 }}>
        {task.title}
      </div>

      {/* Description preview */}
      {task.description && (
        <div style={{
          fontSize: 12, color: 'rgba(255,255,255,0.4)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          marginBottom: 8,
        }}>
          {task.description}
        </div>
      )}

      {/* Bottom row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
        {/* Priority dot */}
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: PRIORITY_COLOR[task.priority] || '#9595b8', display: 'inline-block', flexShrink: 0 }} />
          <span style={{ fontSize: 11, color: PRIORITY_COLOR[task.priority] || 'rgba(255,255,255,0.4)' }}>
            {task.priority ? task.priority.charAt(0).toUpperCase() + task.priority.slice(1) : ''}
          </span>
        </span>

        <span style={{ flex: 1 }} />

        {/* Subtask progress */}
        {hasSubtasks && (
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', display: 'flex', alignItems: 'center', gap: 3 }}>
            {task.subtasks_done ?? 0}/{task.subtask_count} ✓
          </span>
        )}

        {/* Comment count */}
        {hasComments && (
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', display: 'flex', alignItems: 'center', gap: 3 }}>
            💬 {task.comment_count}
          </span>
        )}

        {/* Due date */}
        {task.due_date && (
          <span style={{ fontSize: 11, color: overdueDate ? '#f87171' : 'rgba(255,255,255,0.4)' }}>
            {fmtDate(task.due_date)}
          </span>
        )}

        {/* Assignee bubble */}
        {task.assignee && (
          <div style={{
            width: 24, height: 24, borderRadius: '50%',
            background: 'rgba(124,106,247,0.4)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 11, fontWeight: 700, color: 'white', flexShrink: 0,
          }}>
            {task.assignee.charAt(0).toUpperCase()}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Kanban Column ────────────────────────────────────────────────────────────

function KanbanColumn({ status, tasks, onCardClick, onAddTask, onDrop, dragOverStatus, setDragOverStatus }) {
  const [showAddForm, setShowAddForm] = useState(false)
  const isDragOver = dragOverStatus === status

  const handleDragOver = (e) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverStatus(status)
  }

  const handleDragLeave = (e) => {
    if (!e.currentTarget.contains(e.relatedTarget)) {
      setDragOverStatus(null)
    }
  }

  const handleDrop = (e) => {
    e.preventDefault()
    const taskId = e.dataTransfer.getData('taskId')
    if (taskId) onDrop(Number(taskId), status)
    setDragOverStatus(null)
  }

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      style={{
        width: 280, minWidth: 280, flexShrink: 0,
        display: 'flex', flexDirection: 'column',
        background: isDragOver ? 'rgba(124,106,247,0.08)' : 'rgba(255,255,255,0.02)',
        border: `1px solid ${isDragOver ? 'rgba(124,106,247,0.35)' : 'rgba(255,255,255,0.07)'}`,
        borderTop: `3px solid ${STATUS_COLOR[status]}`,
        borderRadius: 12,
        transition: 'background 0.15s, border-color 0.15s',
        height: 'calc(100vh - 120px)',
        overflow: 'hidden',
      }}
    >
      {/* Column header */}
      <div style={{ padding: '12px 14px 8px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: 'rgba(255,255,255,0.88)' }}>
            {STATUS_LABEL[status]}
          </span>
          <span style={{
            fontSize: 11, fontWeight: 600,
            background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.5)',
            borderRadius: 10, padding: '1px 7px',
          }}>{tasks.length}</span>
        </div>
      </div>

      {/* Cards scroll area */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 10px 10px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {tasks.map(task => (
          <TaskCard
            key={task.id}
            task={task}
            onClick={() => onCardClick(task.id)}
          />
        ))}
      </div>

      {/* Add task footer */}
      <div style={{ padding: '6px 10px 10px', flexShrink: 0 }}>
        {showAddForm ? (
          <InlineAddTask
            status={status}
            onAdd={(data) => { onAddTask(data); setShowAddForm(false) }}
            onCancel={() => setShowAddForm(false)}
          />
        ) : (
          <button
            onClick={() => setShowAddForm(true)}
            style={{
              width: '100%', background: 'transparent',
              border: '1px dashed rgba(255,255,255,0.15)', borderRadius: 8,
              color: 'rgba(255,255,255,0.35)', fontSize: 13, cursor: 'pointer', padding: '8px',
              transition: 'border-color 0.15s, color 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.3)'; e.currentTarget.style.color = 'rgba(255,255,255,0.6)' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)'; e.currentTarget.style.color = 'rgba(255,255,255,0.35)' }}
          >+ Add task</button>
        )}
      </div>
    </div>
  )
}

// ─── Mobile Tab View ──────────────────────────────────────────────────────────

function MobileKanban({ tasks, onCardClick, onAddTask, onUpdateTask }) {
  const [activeStatus, setActiveStatus] = useState('todo')
  const [showAddForm, setShowAddForm]   = useState(false)

  const filtered = tasks.filter(t => t.status === activeStatus)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 80px)' }}>
      {/* Tab row */}
      <div style={{
        display: 'flex', overflowX: 'auto', gap: 4, padding: '8px 0 12px',
        scrollbarWidth: 'none',
      }}>
        {BOARD_STATUSES.map(s => (
          <button
            key={s}
            onClick={() => setActiveStatus(s)}
            style={{
              flexShrink: 0, padding: '6px 14px', borderRadius: 20, fontSize: 12, cursor: 'pointer',
              border: `1px solid ${STATUS_COLOR[s]}`,
              background: activeStatus === s ? STATUS_COLOR[s] + '33' : 'transparent',
              color: activeStatus === s ? STATUS_COLOR[s] : 'rgba(255,255,255,0.45)',
              fontWeight: activeStatus === s ? 600 : 400,
              transition: 'all 0.15s',
            }}
          >
            {STATUS_LABEL[s]} {tasks.filter(t => t.status === s).length > 0 ? `(${tasks.filter(t => t.status === s).length})` : ''}
          </button>
        ))}
      </div>

      {/* Cards */}
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {filtered.map(task => (
          <TaskCard key={task.id} task={task} onClick={() => onCardClick(task.id)} />
        ))}
        {filtered.length === 0 && (
          <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.25)', fontSize: 14, paddingTop: 40 }}>
            No tasks in {STATUS_LABEL[activeStatus]}
          </div>
        )}
      </div>

      {/* Add button */}
      <div style={{ padding: '10px 0' }}>
        {showAddForm ? (
          <InlineAddTask
            status={activeStatus}
            onAdd={(data) => { onAddTask(data); setShowAddForm(false) }}
            onCancel={() => setShowAddForm(false)}
          />
        ) : (
          <button
            onClick={() => setShowAddForm(true)}
            style={{
              width: '100%', background: 'rgba(124,106,247,0.1)',
              border: '1px solid rgba(124,106,247,0.3)', borderRadius: 10,
              color: '#a89fff', fontSize: 14, cursor: 'pointer', padding: '12px',
            }}
          >+ Add task to {STATUS_LABEL[activeStatus]}</button>
        )}
      </div>
    </div>
  )
}

// ─── Backlog Section ──────────────────────────────────────────────────────────

function BacklogSection({ tasks, onAddTask, onDelete, onStatusChange }) {
  const [open, setOpen]             = useState(false)
  const [showAddForm, setShowAddForm] = useState(false)
  const [newTitle, setNewTitle]     = useState('')

  const handleAdd = () => {
    if (!newTitle.trim()) return
    onAddTask({ title: newTitle.trim(), status: 'backlog', priority: 'low' })
    setNewTitle('')
    setShowAddForm(false)
  }

  return (
    <div style={{
      background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)',
      borderTop: `3px solid ${STATUS_COLOR.backlog}`,
      borderRadius: 12, padding: '10px 16px',
    }}>
      {/* Toggle header */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 8, padding: 0, width: '100%',
        }}
      >
        <span style={{
          fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.7)',
          transform: open ? 'rotate(90deg)' : 'rotate(0deg)',
          transition: 'transform 0.15s', display: 'inline-block',
        }}>▶</span>
        <span style={{ fontSize: 14, fontWeight: 700, color: 'rgba(255,255,255,0.7)' }}>Backlog</span>
        <span style={{
          fontSize: 11, background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.4)',
          borderRadius: 10, padding: '1px 7px',
        }}>{tasks.length}</span>
      </button>

      {open && (
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {tasks.map(task => (
            <BacklogRow
              key={task.id}
              task={task}
              onDelete={() => onDelete(task)}
              onMoveTo={() => onStatusChange(task.id, 'todo')}
            />
          ))}
          {tasks.length === 0 && (
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.25)', fontStyle: 'italic' }}>Backlog is empty</div>
          )}

          {showAddForm ? (
            <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
              <input
                autoFocus
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleAdd(); if (e.key === 'Escape') setShowAddForm(false) }}
                placeholder="Task title…"
                style={{ ...fieldStyle, fontSize: 13, padding: '6px 10px', flex: 1 }}
              />
              <button onClick={handleAdd} style={{ background: 'rgba(124,106,247,0.2)', border: '1px solid rgba(124,106,247,0.4)', borderRadius: 8, color: '#a89fff', fontSize: 12, cursor: 'pointer', padding: '6px 12px', flexShrink: 0 }}>Add</button>
              <button onClick={() => setShowAddForm(false)} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, color: 'rgba(255,255,255,0.4)', fontSize: 12, cursor: 'pointer', padding: '6px 12px', flexShrink: 0 }}>Cancel</button>
            </div>
          ) : (
            <button
              onClick={() => setShowAddForm(true)}
              style={{
                background: 'transparent', border: '1px dashed rgba(255,255,255,0.15)',
                borderRadius: 8, color: 'rgba(255,255,255,0.35)', fontSize: 13,
                cursor: 'pointer', padding: '7px', marginTop: 2, transition: 'all 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.3)'; e.currentTarget.style.color = 'rgba(255,255,255,0.6)' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)'; e.currentTarget.style.color = 'rgba(255,255,255,0.35)' }}
            >+ Add to backlog</button>
          )}
        </div>
      )}
    </div>
  )
}

function BacklogRow({ task, onDelete, onMoveTo }) {
  const [hovered, setHovered] = useState(false)
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '7px 10px', borderRadius: 8,
        background: hovered ? 'rgba(255,255,255,0.05)' : 'transparent',
        transition: 'background 0.12s',
      }}
    >
      <input
        type="checkbox"
        onChange={onMoveTo}
        style={{ cursor: 'pointer', accentColor: '#7c6af7', width: 14, height: 14, flexShrink: 0 }}
        title="Move to To Do"
      />
      <span style={{ flex: 1, fontSize: 13, color: 'rgba(255,255,255,0.7)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {task.title}
      </span>
      <span style={{ fontSize: 11, color: PRIORITY_COLOR[task.priority] || 'rgba(255,255,255,0.3)', flexShrink: 0 }}>
        {task.priority}
      </span>
      {task.assignee && (
        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', flexShrink: 0 }}>→ {task.assignee}</span>
      )}
      {task.due_date && (
        <span style={{ fontSize: 11, color: isOverdue(task.due_date) ? '#f87171' : 'rgba(255,255,255,0.3)', flexShrink: 0 }}>
          {fmtDate(task.due_date)}
        </span>
      )}
      {hovered && (
        <button
          onClick={onDelete}
          style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: '0 2px', flexShrink: 0 }}
          onMouseEnter={e => e.currentTarget.style.color = '#f87171'}
          onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.3)'}
        >×</button>
      )}
    </div>
  )
}

// ─── Confirm Delete ───────────────────────────────────────────────────────────

function ConfirmDelete({ label, onCancel, onConfirm }) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 600, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'rgba(22,22,35,0.98)', border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 16, padding: '28px 32px', width: 340, textAlign: 'center',
          boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
        }}
      >
        <div style={{ fontSize: 28, marginBottom: 12 }}>⚠</div>
        <div style={{ fontSize: 16, fontWeight: 600, color: 'rgba(255,255,255,0.9)', marginBottom: 8 }}>Delete Task?</div>
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', marginBottom: 24 }}>
          "{label}" will be permanently deleted.
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
          <button onClick={onCancel} style={{ padding: '9px 24px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.15)', background: 'transparent', color: 'rgba(255,255,255,0.6)', fontSize: 13, cursor: 'pointer' }}>Cancel</button>
          <button onClick={onConfirm} style={{ padding: '9px 24px', borderRadius: 8, border: 'none', background: '#f87171', color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Delete</button>
        </div>
      </div>
    </div>
  )
}

// ─── Table View Popover ───────────────────────────────────────────────────────

function Popover({ anchorRef, onClose, children }) {
  const popRef = useRef(null)

  useEffect(() => {
    const handler = (e) => {
      if (popRef.current && !popRef.current.contains(e.target) &&
          anchorRef.current && !anchorRef.current.contains(e.target)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose, anchorRef])

  // Position below anchor
  const [pos, setPos] = useState({ top: 0, left: 0 })
  useEffect(() => {
    if (anchorRef.current) {
      const rect = anchorRef.current.getBoundingClientRect()
      setPos({ top: rect.bottom + 4, left: rect.left })
    }
  }, [anchorRef])

  return (
    <div
      ref={popRef}
      style={{
        position: 'fixed',
        top: pos.top, left: pos.left,
        zIndex: 200,
        background: 'rgba(28,28,42,0.98)',
        border: '1px solid rgba(255,255,255,0.12)',
        borderRadius: 8,
        padding: 8,
        minWidth: 140,
        boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
      }}
    >
      {children}
    </div>
  )
}

function PopoverOption({ label, color, active, onClick }) {
  const [hov, setHov] = useState(false)
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        height: 32, display: 'flex', alignItems: 'center', gap: 8,
        padding: '0 10px', borderRadius: 6, cursor: 'pointer',
        background: hov ? 'rgba(255,255,255,0.08)' : active ? 'rgba(255,255,255,0.05)' : 'transparent',
        fontSize: 13,
        color: color || 'rgba(255,255,255,0.8)',
        fontWeight: active ? 600 : 400,
      }}
    >
      {color && <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />}
      {label}
    </div>
  )
}

// ─── Table View ───────────────────────────────────────────────────────────────

function TableView({ tasks, onTaskClick, onUpdateTask, onAddTask, isMobile }) {
  const [sortCol, setSortCol]   = useState('status')
  const [sortDir, setSortDir]   = useState('asc')
  const [popover, setPopover]   = useState(null) // { taskId, field, anchorRef }
  const [addingStatus, setAddingStatus] = useState(null) // status key for inline add row
  const [addTitle, setAddTitle] = useState('')
  const popAnchorRefs = useRef({})

  const toggleSort = (col) => {
    if (sortCol === col) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortCol(col)
      setSortDir('asc')
    }
  }

  const sortedTasks = [...tasks].sort((a, b) => {
    let aVal, bVal
    if (sortCol === 'status') {
      aVal = STATUS_ORDER[a.status] ?? 99
      bVal = STATUS_ORDER[b.status] ?? 99
      if (aVal === bVal) {
        aVal = PRIORITY_ORDER[a.priority] ?? 99
        bVal = PRIORITY_ORDER[b.priority] ?? 99
      }
    } else if (sortCol === 'priority') {
      aVal = PRIORITY_ORDER[a.priority] ?? 99
      bVal = PRIORITY_ORDER[b.priority] ?? 99
    } else if (sortCol === 'title') {
      aVal = a.title?.toLowerCase() || ''
      bVal = b.title?.toLowerCase() || ''
    } else if (sortCol === 'assignee') {
      aVal = a.assignee?.toLowerCase() || 'zzz'
      bVal = b.assignee?.toLowerCase() || 'zzz'
    } else if (sortCol === 'due_date') {
      aVal = a.due_date || '9999-12-31'
      bVal = b.due_date || '9999-12-31'
    } else {
      aVal = 0; bVal = 0
    }
    if (aVal < bVal) return sortDir === 'asc' ? -1 : 1
    if (aVal > bVal) return sortDir === 'asc' ? 1 : -1
    return 0
  })

  // Group by status when sorting by status
  const groupedByStatus = sortCol === 'status'
  const groups = groupedByStatus
    ? ALL_STATUSES.map(s => ({ status: s, rows: sortedTasks.filter(t => t.status === s) })).filter(g => g.rows.length > 0 || addingStatus === g.status)
    : [{ status: null, rows: sortedTasks }]

  const openPopover = (taskId, field, ref) => {
    setPopover({ taskId, field, anchorRef: ref })
  }
  const closePopover = () => setPopover(null)

  const handleInlinePatch = async (taskId, fields) => {
    closePopover()
    const updated = await api.updateTask(taskId, fields)
    onUpdateTask(updated)
  }

  const handleAddInGroup = async (status) => {
    if (!addTitle.trim()) { setAddingStatus(null); return }
    await onAddTask({ title: addTitle.trim(), status, priority: 'medium' })
    setAddTitle('')
    setAddingStatus(null)
  }

  const colHeader = (label, col, width, hide) => {
    if (hide) return null
    const active = sortCol === col
    return (
      <th
        key={col}
        onClick={() => toggleSort(col)}
        style={{
          width, minWidth: width, padding: '0 12px',
          fontSize: 11, fontWeight: 600, color: active ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.35)',
          textTransform: 'uppercase', letterSpacing: '0.07em',
          cursor: 'pointer', userSelect: 'none',
          textAlign: 'left', whiteSpace: 'nowrap',
        }}
      >
        {label} {active ? (sortDir === 'asc' ? '▲' : '▼') : ''}
      </th>
    )
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', position: 'relative' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
        {/* Sticky header */}
        <thead style={{ overflow: 'hidden' }}>
          <tr style={{
            position: 'sticky', top: 0,
            background: 'rgba(18,18,30,0.95)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            zIndex: 10,
            height: 36,
            overflow: 'hidden',
          }}>
            {!isMobile && (
              <th style={{ width: 24, minWidth: 24, padding: '0 4px' }} />
            )}
            {colHeader('Title', 'title', undefined, false)}
            {colHeader('Status', 'status', 130, false)}
            {colHeader('Priority', 'priority', 100, false)}
            {!isMobile && colHeader('Assignee', 'assignee', 110, false)}
            {!isMobile && colHeader('Due Date', 'due_date', 110, false)}
            {!isMobile && (
              <th style={{ width: 90, minWidth: 90, padding: '0 12px', fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.07em', textAlign: 'left' }}>
                Subtasks
              </th>
            )}
            {!isMobile && (
              <th style={{ width: 70, minWidth: 70, padding: '0 12px', fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.07em', textAlign: 'left' }}>
                Comments
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {groups.map(({ status, rows }) => (
            <React.Fragment key={status ?? '__all__'}>
              {/* Group header row (only when sorting by status) */}
              {groupedByStatus && status && (
                <tr key={`group-${status}`} style={{ background: STATUS_COLOR[status] + '18' }}>
                  <td
                    colSpan={isMobile ? 3 : 8}
                    style={{
                      padding: '6px 12px',
                      fontSize: 12, fontWeight: 700,
                      color: STATUS_COLOR[status],
                      letterSpacing: '0.04em',
                      borderBottom: `1px solid ${STATUS_COLOR[status]}33`,
                      borderLeft: `3px solid ${STATUS_COLOR[status]}`,
                    }}
                  >
                    {STATUS_LABEL[status]}
                    <span style={{
                      marginLeft: 8, fontSize: 11, fontWeight: 400,
                      background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.4)',
                      borderRadius: 10, padding: '1px 7px',
                    }}>{rows.length}</span>
                  </td>
                </tr>
              )}

              {/* Task rows */}
              {rows.map(task => (
                <TableRow
                  key={task.id}
                  task={task}
                  isMobile={isMobile}
                  onTitleClick={() => onTaskClick(task.id)}
                  onPatch={(fields) => handleInlinePatch(task.id, fields)}
                  popover={popover}
                  openPopover={openPopover}
                  closePopover={closePopover}
                  popAnchorRefs={popAnchorRefs}
                />
              ))}

              {/* Add task row for this group */}
              {groupedByStatus && status && (
                <tr key={`add-${status}`}>
                  <td
                    colSpan={isMobile ? 3 : 8}
                    style={{ padding: '2px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}
                  >
                    {addingStatus === status ? (
                      <div style={{ display: 'flex', gap: 6, padding: '4px 12px' }}>
                        <input
                          autoFocus
                          value={addTitle}
                          onChange={e => setAddTitle(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') handleAddInGroup(status)
                            if (e.key === 'Escape') { setAddingStatus(null); setAddTitle('') }
                          }}
                          placeholder="Task title…"
                          style={{ ...fieldStyle, fontSize: 13, padding: '5px 10px', flex: 1 }}
                        />
                        <button
                          onClick={() => handleAddInGroup(status)}
                          style={{ background: 'rgba(124,106,247,0.2)', border: '1px solid rgba(124,106,247,0.4)', borderRadius: 6, color: '#a89fff', fontSize: 12, cursor: 'pointer', padding: '5px 12px', flexShrink: 0 }}
                        >Add</button>
                        <button
                          onClick={() => { setAddingStatus(null); setAddTitle('') }}
                          style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, color: 'rgba(255,255,255,0.4)', fontSize: 12, cursor: 'pointer', padding: '5px 10px', flexShrink: 0 }}
                        >Cancel</button>
                      </div>
                    ) : (
                      <button
                        onClick={() => { setAddingStatus(status); setAddTitle('') }}
                        style={{
                          background: 'transparent', border: 'none', cursor: 'pointer',
                          color: 'rgba(255,255,255,0.2)', fontSize: 13, padding: '5px 12px',
                          width: '100%', textAlign: 'left', transition: 'color 0.12s',
                        }}
                        onMouseEnter={e => e.currentTarget.style.color = 'rgba(255,255,255,0.45)'}
                        onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.2)'}
                      >+ Add task</button>
                    )}
                  </td>
                </tr>
              )}
            </React.Fragment>
          ))}
        </tbody>
      </table>

      {/* Popover rendered outside table */}
      {popover && (
        <PopoverLayer
          popover={popover}
          onClose={closePopover}
          onPatch={(fields) => handleInlinePatch(popover.taskId, fields)}
          tasks={tasks}
        />
      )}
    </div>
  )
}

function TableRow({ task, isMobile, onTitleClick, onPatch, popover, openPopover, closePopover, popAnchorRefs }) {
  const [hov, setHov] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [subtasks, setSubtasks] = useState([])
  const overdueDate = isOverdue(task.due_date)

  const getRef = (field) => {
    const key = `${task.id}-${field}`
    if (!popAnchorRefs.current[key]) popAnchorRefs.current[key] = { current: null }
    return popAnchorRefs.current[key]
  }

  const isPopOpen = (field) => popover?.taskId === task.id && popover?.field === field

  const cellClick = (field, e) => {
    e.stopPropagation()
    const key = `${task.id}-${field}`
    if (!popAnchorRefs.current[key]) popAnchorRefs.current[key] = { current: e.currentTarget }
    else popAnchorRefs.current[key].current = e.currentTarget
    if (isPopOpen(field)) {
      closePopover()
    } else {
      openPopover(task.id, field, popAnchorRefs.current[key])
    }
  }

  return (
    <React.Fragment>
      <tr
        onMouseEnter={() => setHov(true)}
        onMouseLeave={() => setHov(false)}
        style={{
          height: 44,
          background: hov ? 'rgba(255,255,255,0.04)' : 'transparent',
          borderLeft: `3px solid ${PRIORITY_COLOR[task.priority] || '#9595b8'}`,
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          transition: 'background 0.1s',
          cursor: 'default',
        }}
      >
        {/* Drag handle — desktop only */}
        {!isMobile && (
          <td style={{ width: 24, padding: '0 4px', color: 'rgba(255,255,255,0.15)', fontSize: 14, textAlign: 'center' }}>
            {hov ? '⠿' : ''}
          </td>
        )}

        {/* Title */}
        <td
          onClick={onTitleClick}
          style={{
            padding: '0 12px', fontWeight: 700, fontSize: 14,
            color: 'rgba(255,255,255,0.92)', cursor: 'pointer',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}
        >
          {task.title}
        </td>

        {/* Status */}
        <td
          onClick={(e) => cellClick('status', e)}
          style={{ width: 130, padding: '0 12px', cursor: 'pointer' }}
        >
          <span style={{
            display: 'inline-block', padding: '3px 10px', borderRadius: 20,
            fontSize: 12, fontWeight: 600,
            background: (STATUS_COLOR[task.status] || '#9595b8') + '28',
            color: STATUS_COLOR[task.status] || '#9595b8',
            border: `1px solid ${(STATUS_COLOR[task.status] || '#9595b8')}55`,
            whiteSpace: 'nowrap',
          }}>
            {STATUS_LABEL[task.status] || task.status}
          </span>
        </td>

        {/* Priority */}
        <td
          onClick={(e) => cellClick('priority', e)}
          style={{ width: 100, padding: '0 12px', cursor: 'pointer' }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: PRIORITY_COLOR[task.priority] || '#9595b8', flexShrink: 0 }} />
            <span style={{ fontSize: 12, color: PRIORITY_COLOR[task.priority] || 'rgba(255,255,255,0.5)' }}>
              {task.priority ? task.priority.charAt(0).toUpperCase() + task.priority.slice(1) : '—'}
            </span>
          </span>
        </td>

        {/* Assignee — desktop only */}
        {!isMobile && (
          <td
            onClick={(e) => cellClick('assignee', e)}
            style={{ width: 110, padding: '0 12px', cursor: 'pointer' }}
          >
            {task.assignee ? (
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{
                  width: 22, height: 22, borderRadius: '50%',
                  background: 'rgba(124,106,247,0.4)',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 700, color: 'white', flexShrink: 0,
                }}>{task.assignee.charAt(0).toUpperCase()}</span>
                <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {task.assignee}
                </span>
              </span>
            ) : (
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.25)' }}>—</span>
            )}
          </td>
        )}

        {/* Due Date — desktop only */}
        {!isMobile && (
          <td
            onClick={(e) => cellClick('due_date', e)}
            style={{ width: 110, padding: '0 12px', cursor: 'pointer' }}
          >
            <span style={{ fontSize: 12, color: overdueDate ? '#f87171' : 'rgba(255,255,255,0.45)' }}>
              {task.due_date ? fmtDate(task.due_date) : <span style={{ color: 'rgba(255,255,255,0.2)' }}>—</span>}
            </span>
          </td>
        )}

        {/* Subtasks — desktop only */}
        {!isMobile && (
          <td style={{ width: 90, padding: '0 12px' }}>
            {task.subtask_count > 0 ? (
              <span
                onClick={async (e) => {
                  e.stopPropagation()
                  if (!expanded) {
                    const full = await api.task(task.id)
                    setSubtasks(full.subtasks || [])
                  }
                  setExpanded(v => !v)
                }}
                style={{ cursor: 'pointer', fontSize: 12, color: 'rgba(255,255,255,0.5)', display: 'flex', alignItems: 'center', gap: 4 }}
              >
                <span style={{ fontSize: 10 }}>{expanded ? '▼' : '▶'}</span>
                {task.subtasks_done ?? 0}/{task.subtask_count} ✓
              </span>
            ) : (
              <span style={{ color: 'rgba(255,255,255,0.15)', fontSize: 12 }}>—</span>
            )}
          </td>
        )}

        {/* Comments — desktop only */}
        {!isMobile && (
          <td style={{ width: 70, padding: '0 12px' }}>
            {task.comment_count > 0 ? (
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>💬 {task.comment_count}</span>
            ) : null}
          </td>
        )}
      </tr>
      {expanded && subtasks.map(sub => (
        <tr key={sub.id} style={{ background: 'rgba(255,255,255,0.02)' }}>
          <td style={{ width: 24 }} />
          <td style={{ padding: '8px 12px', paddingLeft: 32 }}>
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{
                width: 14, height: 14, borderRadius: '50%', border: '1.5px solid',
                borderColor: sub.status === 'done' ? '#4ade80' : 'rgba(255,255,255,0.3)',
                background: sub.status === 'done' ? '#4ade80' : 'transparent',
                flexShrink: 0
              }} />
              <span style={{ textDecoration: sub.status === 'done' ? 'line-through' : 'none', opacity: sub.status === 'done' ? 0.5 : 1 }}>
                {sub.title}
              </span>
            </span>
          </td>
          <td style={{ padding: '8px 12px' }}>
            <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: STATUS_COLOR[sub.status] + '33', color: STATUS_COLOR[sub.status] }}>
              {STATUS_LABEL[sub.status]}
            </span>
          </td>
          <td colSpan={6} style={{ padding: '8px 12px' }}>
            <span style={{ fontSize: 11, color: PRIORITY_COLOR[sub.priority] }}>
              {sub.priority}
            </span>
          </td>
        </tr>
      ))}
    </React.Fragment>
  )
}

function PopoverLayer({ popover, onClose, onPatch, tasks }) {
  const task = tasks.find(t => t.id === popover.taskId)
  if (!task) return null

  const { field, anchorRef } = popover

  // Get anchor position
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const popRef = useRef(null)

  useEffect(() => {
    if (anchorRef?.current) {
      const rect = anchorRef.current.getBoundingClientRect()
      setPos({ top: rect.bottom + 4, left: rect.left })
    }
  }, [anchorRef])

  useEffect(() => {
    const handler = (e) => {
      if (popRef.current && !popRef.current.contains(e.target) &&
          anchorRef?.current && !anchorRef.current.contains(e.target)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose, anchorRef])

  const [dateVal, setDateVal] = useState(task.due_date || '')

  const popStyle = {
    position: 'fixed',
    top: pos.top, left: pos.left,
    zIndex: 200,
    background: 'rgba(28,28,42,0.98)',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 8,
    padding: 8,
    minWidth: field === 'due_date' ? 180 : 150,
    boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
  }

  if (field === 'status') {
    return (
      <div ref={popRef} style={popStyle}>
        {ALL_STATUSES.map(s => (
          <PopoverOption
            key={s}
            label={STATUS_LABEL[s]}
            color={STATUS_COLOR[s]}
            active={task.status === s}
            onClick={() => onPatch({ status: s })}
          />
        ))}
      </div>
    )
  }

  if (field === 'priority') {
    return (
      <div ref={popRef} style={popStyle}>
        {['high', 'medium', 'low'].map(p => (
          <PopoverOption
            key={p}
            label={p.charAt(0).toUpperCase() + p.slice(1)}
            color={PRIORITY_COLOR[p]}
            active={task.priority === p}
            onClick={() => onPatch({ priority: p })}
          />
        ))}
      </div>
    )
  }

  if (field === 'assignee') {
    return (
      <div ref={popRef} style={{ ...popStyle, maxHeight: 240, overflowY: 'auto' }}>
        <PopoverOption
          label="Unassigned"
          color={null}
          active={!task.assignee}
          onClick={() => onPatch({ assignee: null })}
        />
        {TEAM_MEMBERS.map(m => (
          <PopoverOption
            key={m}
            label={m}
            color={null}
            active={task.assignee === m}
            onClick={() => onPatch({ assignee: m })}
          />
        ))}
      </div>
    )
  }

  if (field === 'due_date') {
    return (
      <div ref={popRef} style={popStyle}>
        <input
          type="date"
          value={dateVal}
          autoFocus
          onChange={e => setDateVal(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') onPatch({ due_date: dateVal || null })
            if (e.key === 'Escape') onClose()
          }}
          style={{ ...fieldStyle, fontSize: 13, colorScheme: 'dark', width: 160 }}
        />
        <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
          <button
            onClick={() => onPatch({ due_date: dateVal || null })}
            style={{ flex: 1, background: 'rgba(124,106,247,0.2)', border: '1px solid rgba(124,106,247,0.4)', borderRadius: 6, color: '#a89fff', fontSize: 12, cursor: 'pointer', padding: '5px' }}
          >Set</button>
          {task.due_date && (
            <button
              onClick={() => onPatch({ due_date: null })}
              style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, color: 'rgba(255,255,255,0.4)', fontSize: 12, cursor: 'pointer', padding: '5px 8px' }}
            >Clear</button>
          )}
        </div>
      </div>
    )
  }

  return null
}

// ─── Main Tasks View ──────────────────────────────────────────────────────────

export default function Tasks() {
  const isMobile = useIsMobile()

  const [tasks, setTasks]                 = useState([])
  const [loading, setLoading]             = useState(true)
  const [error, setError]                 = useState(null)
  const [selectedTaskId, setSelectedTaskId] = useState(null)
  const [deleteTarget, setDeleteTarget]   = useState(null)
  const [dragOverStatus, setDragOverStatus] = useState(null)
  const [currentUser, setCurrentUser]     = useState('')

  useEffect(() => {
    const token = localStorage.getItem('vlt_token')
    if (!token) return
    fetch('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(u => { if (u?.name) setCurrentUser(u.name) })
      .catch(() => {})
  }, [])

  // View toggle: 'board' | 'table'
  const [view, setView] = useState(() => localStorage.getItem('vlt_tasks_view') || 'board')

  const switchView = (v) => {
    setView(v)
    localStorage.setItem('vlt_tasks_view', v)
  }

  // Filters
  const [search, setSearch]               = useState('')
  const [filterPriority, setFilterPriority] = useState('all')
  const [filterAssignee, setFilterAssignee] = useState('')

  // ── Fetch ALL tasks then filter client-side for top-level tasks.
  // Uses loose equality (== null) to correctly match both null and undefined
  // without accidentally filtering out tasks whose parent_id is 0.
  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const all = await api.tasks({})
      const topLevel = all.filter(t => t.parent_id == null)
      setTasks(topLevel)
    } catch(e) {
      console.error('Tasks load error:', e)
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // Apply filters
  const applyFilters = (list) => {
    return list.filter(t => {
      if (search && !t.title.toLowerCase().includes(search.toLowerCase())) return false
      if (filterPriority !== 'all' && t.priority !== filterPriority) return false
      if (filterAssignee && t.assignee !== filterAssignee) return false
      return true
    })
  }

  const boardTasks = (status) => applyFilters(tasks.filter(t => t.status === status))
  const backlogTasks = applyFilters(tasks.filter(t => t.status === 'backlog'))
  const allFilteredTasks = applyFilters(tasks)

  const handleAddTask = async (data) => {
    const created = await api.createTask(data)
    setTasks(prev => [...prev, created])
  }

  const handleUpdateTask = (updated) => {
    setTasks(prev => prev.map(t => t.id === updated.id ? { ...t, ...updated } : t))
  }

  const handleDrop = async (taskId, newStatus) => {
    const task = tasks.find(t => t.id === taskId)
    if (!task || task.status === newStatus) return
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: newStatus } : t))
    try {
      await api.updateTask(taskId, { status: newStatus })
    } catch {
      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: task.status } : t))
    }
  }

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return
    await api.deleteTask(deleteTarget.id)
    setTasks(prev => prev.filter(t => t.id !== deleteTarget.id))
    if (selectedTaskId === deleteTarget.id) setSelectedTaskId(null)
    setDeleteTarget(null)
  }

  const handleBacklogStatusChange = async (taskId, status) => {
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status } : t))
    await api.updateTask(taskId, { status })
  }

  const allAssignees = [...new Set(tasks.map(t => t.assignee).filter(Boolean))]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', padding: isMobile ? '16px 12px' : '20px 24px', boxSizing: 'border-box', overflow: 'hidden' }}>

      {/* Top bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap', flexShrink: 0 }}>
        <h1 style={{ margin: 0, fontSize: isMobile ? 20 : 22, fontWeight: 800, color: 'rgba(255,255,255,0.92)', letterSpacing: '-0.02em' }}>
          Tasks
        </h1>

        {/* View toggle — left of search */}
        {!isMobile && (
          <div style={{
            display: 'flex', gap: 2, padding: 3,
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 8,
          }}>
            <button
              onClick={() => switchView('board')}
              title="Board view"
              style={{
                padding: '5px 12px', borderRadius: 6, fontSize: 13, cursor: 'pointer', border: 'none',
                background: view === 'board' ? '#7c6af7' : 'transparent',
                color: view === 'board' ? 'white' : 'rgba(255,255,255,0.45)',
                fontWeight: view === 'board' ? 600 : 400,
                transition: 'all 0.15s',
                display: 'flex', alignItems: 'center', gap: 5,
              }}
            >
              <span style={{ fontSize: 14 }}>⊞</span> Board
            </button>
            <button
              onClick={() => switchView('table')}
              title="Table view"
              style={{
                padding: '5px 12px', borderRadius: 6, fontSize: 13, cursor: 'pointer', border: 'none',
                background: view === 'table' ? '#7c6af7' : 'transparent',
                color: view === 'table' ? 'white' : 'rgba(255,255,255,0.45)',
                fontWeight: view === 'table' ? 600 : 400,
                transition: 'all 0.15s',
                display: 'flex', alignItems: 'center', gap: 5,
              }}
            >
              <span style={{ fontSize: 14 }}>≡</span> Table
            </button>
          </div>
        )}

        {/* Search */}
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search tasks…"
          style={{
            ...fieldStyle, width: isMobile ? '100%' : 220, padding: '7px 12px',
            marginLeft: isMobile ? 0 : 0,
          }}
        />

        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginLeft: 'auto' }}>
          {/* Priority filter */}
          {['all', 'high', 'medium', 'low'].map(p => (
            <button
              key={p}
              onClick={() => setFilterPriority(p)}
              style={{
                padding: '5px 12px', borderRadius: 20, fontSize: 12, cursor: 'pointer',
                border: `1px solid ${p === 'all' ? 'rgba(255,255,255,0.2)' : PRIORITY_COLOR[p]}`,
                background: filterPriority === p
                  ? (p === 'all' ? 'rgba(255,255,255,0.1)' : PRIORITY_COLOR[p] + '33')
                  : 'transparent',
                color: filterPriority === p
                  ? (p === 'all' ? 'rgba(255,255,255,0.85)' : PRIORITY_COLOR[p])
                  : 'rgba(255,255,255,0.45)',
                fontWeight: filterPriority === p ? 600 : 400,
                transition: 'all 0.15s',
              }}
            >
              {p === 'all' ? 'All' : p.charAt(0).toUpperCase() + p.slice(1)}
            </button>
          ))}

          {/* Assignee filter */}
          {allAssignees.length > 0 && (
            <select
              value={filterAssignee}
              onChange={e => setFilterAssignee(e.target.value)}
              style={{ ...fieldStyle, width: 'auto', padding: '6px 10px', fontSize: 12 }}
            >
              <option value="">All assignees</option>
              {allAssignees.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          )}
        </div>
      </div>

      {loading ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.4)', fontSize: 16 }}>
          Loading tasks…
        </div>
      ) : error ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{
            background: 'rgba(248,113,113,0.12)',
            border: '1px solid rgba(248,113,113,0.4)',
            borderRadius: 12,
            padding: '24px 32px',
            textAlign: 'center',
            maxWidth: 420,
          }}>
            <div style={{ fontSize: 28, marginBottom: 10 }}>⚠</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#f87171', marginBottom: 6 }}>
              Failed to load tasks
            </div>
            <div style={{ fontSize: 13, color: 'rgba(248,113,113,0.8)', marginBottom: 18 }}>
              {error}
            </div>
            <button
              onClick={load}
              style={{
                background: 'rgba(248,113,113,0.2)', border: '1px solid rgba(248,113,113,0.4)',
                borderRadius: 8, color: '#f87171', fontSize: 13,
                cursor: 'pointer', padding: '8px 20px',
              }}
            >Retry</button>
          </div>
        </div>
      ) : isMobile ? (
        /* Mobile view — always uses kanban-style tab view */
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <MobileKanban
            tasks={applyFilters(tasks.filter(t => t.status !== 'backlog'))}
            onCardClick={setSelectedTaskId}
            onAddTask={handleAddTask}
            onUpdateTask={handleUpdateTask}
          />
          <div style={{ marginTop: 20 }}>
            <BacklogSection
              tasks={backlogTasks}
              onAddTask={handleAddTask}
              onDelete={setDeleteTarget}
              onStatusChange={handleBacklogStatusChange}
            />
          </div>
        </div>
      ) : view === 'table' ? (
        /* Table view */
        <TableView
          tasks={allFilteredTasks}
          onTaskClick={setSelectedTaskId}
          onUpdateTask={handleUpdateTask}
          onAddTask={handleAddTask}
          isMobile={isMobile}
        />
      ) : (
        /* Desktop kanban board */
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div style={{ overflowX: 'auto', flex: 1, display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', gap: 16, minWidth: 'max-content', paddingBottom: 16, flex: 'none' }}>
              {BOARD_STATUSES.map(status => (
                <KanbanColumn
                  key={status}
                  status={status}
                  tasks={boardTasks(status)}
                  onCardClick={setSelectedTaskId}
                  onAddTask={handleAddTask}
                  onDrop={handleDrop}
                  dragOverStatus={dragOverStatus}
                  setDragOverStatus={setDragOverStatus}
                />
              ))}
            </div>

            {/* Backlog section */}
            <div style={{ minWidth: 'max-content', width: `calc(${BOARD_STATUSES.length} * 280px + ${(BOARD_STATUSES.length - 1)} * 16px)`, paddingBottom: 24 }}>
              <BacklogSection
                tasks={backlogTasks}
                onAddTask={handleAddTask}
                onDelete={setDeleteTarget}
                onStatusChange={handleBacklogStatusChange}
              />
            </div>
          </div>
        </div>
      )}

      {/* Task Detail Panel */}
      {selectedTaskId && (
        <TaskDetailPanel
          taskId={selectedTaskId}
          isMobile={isMobile}
          currentUser={currentUser}
          onClose={() => setSelectedTaskId(null)}
          onUpdate={handleUpdateTask}
          onDelete={(task) => { setDeleteTarget(task); setSelectedTaskId(null) }}
        />
      )}

      {/* Confirm Delete */}
      {deleteTarget && (
        <ConfirmDelete
          label={deleteTarget.title}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={handleDeleteConfirm}
        />
      )}
    </div>
  )
}
