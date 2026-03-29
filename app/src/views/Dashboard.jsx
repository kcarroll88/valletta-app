import { useEffect, useRef, useState, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { api } from '../api'
import useIsMobile from '../hooks/useIsMobile'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function hexToRgb(hex) {
  const r = parseInt(hex.slice(1,3),16)
  const g = parseInt(hex.slice(3,5),16)
  const b = parseInt(hex.slice(5,7),16)
  return `${r},${g},${b}`
}

// ─── Constants ───────────────────────────────────────────────────────────────

const STORAGE_KEY = 'vlt_chat_history_v2'
const MAX_HISTORY = 40
const STREAM_TIMEOUT_MS = 60_000

const MEMBERS = [
  { id: 'dot',   label: 'All Team', role: 'Routes to the best person', color: '#7c6af7' },
  { id: 'felix', label: 'Felix',    role: 'Band Manager',              color: '#f59e0b' },
  { id: 'nina',  label: 'Nina',     role: 'Publicist',                 color: '#ec4899' },
  { id: 'cass',  label: 'Cass',     role: 'Social Media',              color: '#8b5cf6' },
  { id: 'marco', label: 'Marco',    role: 'Booking Agent',             color: '#3b82f6' },
  { id: 'priya', label: 'Priya',    role: 'Marketing',                 color: '#10b981' },
  { id: 'eli',   label: 'Eli',      role: 'Sync & Licensing',          color: '#f97316' },
  { id: 'quinn', label: 'Quinn',    role: 'Legal Advisor',             color: '#6366f1' },
  { id: 'scout', label: 'Scout',    role: 'Creative Intelligence',     color: '#2dd4bf' },
  { id: 'finn',  label: 'Finn',     role: 'Finance Specialist',        color: '#34d399' },
]

const MEMBER_MAP = Object.fromEntries(MEMBERS.map(m => [m.id, m]))

// ─── Markdown components ─────────────────────────────────────────────────────

const mdComponents = {
  p:      ({ children }) => <p style={{ margin: '0 0 8px', lineHeight: 1.6 }}>{children}</p>,
  h1:     ({ children }) => <h1 style={{ fontSize: 16, fontWeight: 700, margin: '10px 0 5px', color: 'rgba(255,255,255,0.88)' }}>{children}</h1>,
  h2:     ({ children }) => <h2 style={{ fontSize: 14, fontWeight: 700, margin: '8px 0 4px', color: 'rgba(255,255,255,0.88)' }}>{children}</h2>,
  h3:     ({ children }) => <h3 style={{ fontSize: 13, fontWeight: 600, margin: '6px 0 3px', color: 'rgba(255,255,255,0.88)' }}>{children}</h3>,
  ul:     ({ children }) => <ul style={{ margin: '4px 0 8px', paddingLeft: 18 }}>{children}</ul>,
  ol:     ({ children }) => <ol style={{ margin: '4px 0 8px', paddingLeft: 18 }}>{children}</ol>,
  li:     ({ children }) => <li style={{ margin: '2px 0', lineHeight: 1.55 }}>{children}</li>,
  strong: ({ children }) => <strong style={{ fontWeight: 700, color: 'rgba(255,255,255,0.92)' }}>{children}</strong>,
  em:     ({ children }) => <em style={{ fontStyle: 'italic', color: 'rgba(255,255,255,0.65)' }}>{children}</em>,
  code:   ({ inline, children }) => inline
    ? <code style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 4, padding: '1px 5px', fontSize: 12, fontFamily: 'monospace', color: '#a89fff' }}>{children}</code>
    : <code>{children}</code>,
  pre:    ({ children }) => (
    <pre style={{
      background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 8,
      padding: '8px 12px', overflowX: 'auto', margin: '6px 0 10px',
      fontSize: 12, lineHeight: 1.6, fontFamily: 'monospace',
    }}>{children}</pre>
  ),
  blockquote: ({ children }) => (
    <blockquote style={{
      borderLeft: '3px solid #7c6af7', paddingLeft: 10, margin: '4px 0',
      color: 'rgba(255,255,255,0.45)', fontStyle: 'italic',
    }}>{children}</blockquote>
  ),
  hr: () => <hr style={{ border: 'none', borderTop: '1px solid rgba(255,255,255,0.08)', margin: '8px 0' }} />,
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" style={{ color: '#a89fff', textDecoration: 'underline' }}>{children}</a>
  ),
}

// ─── Small sub-components ─────────────────────────────────────────────────────

function MemberAvatar({ memberId, size = 32 }) {
  const m = MEMBER_MAP[memberId] || { label: memberId || '?', color: '#9595b8' }
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: m.color + '22',
      border: `1px solid ${m.color}44`,
      boxShadow: `0 0 12px rgba(${hexToRgb(m.color)}, 0.5)`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.4, fontWeight: 700, color: m.color,
      flexShrink: 0,
    }}>
      {m.label.charAt(0).toUpperCase()}
    </div>
  )
}

function HandoffCard({ from, to, note }) {
  const fromM = MEMBER_MAP[from] || { label: from, color: '#9595b8' }
  const toM   = MEMBER_MAP[to]   || { label: to,   color: '#9595b8' }
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '6px 12px', borderRadius: 8,
      background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)',
      fontSize: 11, color: 'rgba(255,255,255,0.35)', alignSelf: 'center',
      maxWidth: '80%', animation: 'dc-fadeIn 0.25s ease',
    }}>
      <span style={{ color: fromM.color, fontWeight: 600 }}>{fromM.label}</span>
      <span style={{ opacity: 0.5, fontSize: 13 }}>→</span>
      <span style={{ color: toM.color, fontWeight: 600 }}>{toM.label}</span>
      {note && (
        <>
          <span style={{ opacity: 0.3 }}>·</span>
          <span style={{ fontStyle: 'italic', color: 'rgba(255,255,255,0.30)' }}>{note}</span>
        </>
      )}
    </div>
  )
}

function TaskCreatedCard({ task, onNavigate }) {
  const [hovered, setHovered] = useState(false)
  return (
    <div style={{
      background: '#4ade8022', border: '1px solid #4ade80',
      borderRadius: 10, padding: '10px 14px', fontSize: 13, marginTop: 4,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#4ade80', fontWeight: 600, marginBottom: 6 }}>
        <span>✓</span>
        <span>Task created: "{task.title}"</span>
      </div>
      <button
        onClick={() => onNavigate('tasks')}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          background: 'transparent', border: 'none',
          color: hovered ? '#86efac' : '#4ade80',
          fontSize: 12, cursor: 'pointer', padding: 0,
          textDecoration: hovered ? 'underline' : 'none',
          display: 'flex', alignItems: 'center', gap: 4,
        }}
      >
        View in Tasks →
      </button>
    </div>
  )
}

function IdeaCreatedCard({ idea, onNavigate }) {
  const [hovered, setHovered] = useState(false)
  return (
    <div style={{
      background: '#a89fff22', border: '1px solid #a89fff',
      borderRadius: 10, padding: '10px 14px', fontSize: 13, marginTop: 4,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#a89fff', fontWeight: 600, marginBottom: 6 }}>
        <span>✓</span>
        <span>Idea captured: "{idea.title || (idea.id ? `#${idea.id}` : 'saved')}"</span>
      </div>
      <button
        onClick={() => onNavigate('ideas')}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          background: 'transparent', border: 'none',
          color: hovered ? '#c4b8ff' : '#a89fff',
          fontSize: 12, cursor: 'pointer', padding: 0,
          textDecoration: hovered ? 'underline' : 'none',
          display: 'flex', alignItems: 'center', gap: 4,
        }}
      >
        View in Ideas Inbox →
      </button>
    </div>
  )
}

function FileUploadCard({ file }) {
  const isImage = file.mime_type?.startsWith('image/')
  const icon = isImage ? '🖼' : file.mime_type?.includes('pdf') ? '📄' : file.mime_type?.includes('audio') ? '🎵' : '📎'

  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 10,
      background: 'rgba(255,255,255,0.05)',
      border: '1px solid rgba(255,255,255,0.10)',
      borderRadius: 10, padding: '10px 14px',
      maxWidth: 320,
    }}>
      <span style={{ fontSize: 20 }}>{icon}</span>
      <div>
        <div style={{ fontSize: 13, fontWeight: 500, color: 'rgba(255,255,255,0.88)' }}>
          {file.original_name || file.name}
        </div>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.40)', marginTop: 2 }}>
          {file.category} · {(file.size / 1024).toFixed(0)}KB · Sent to Milo to organize
        </div>
      </div>
    </div>
  )
}

// ─── Right panel context cards ────────────────────────────────────────────────

function ContextPanel({ onNavigate }) {
  const [ideas, setIdeas]   = useState([])
  const [events, setEvents] = useState([])
  const [tasks, setTasks]   = useState([])

  useEffect(() => {
    api.ideas({ limit: 3, status: 'inbox' })
      .then(r => setIdeas(Array.isArray(r) ? r.slice(0, 3) : (r?.ideas || []).slice(0, 3)))
      .catch(() => {})

    api.events({ limit: 3, upcoming: true })
      .then(r => setEvents(Array.isArray(r) ? r.slice(0, 3) : (r?.events || []).slice(0, 3)))
      .catch(() => {})

    api.tasks({ limit: 3, status: 'open', sort: 'due_date' })
      .then(r => setTasks(Array.isArray(r) ? r.slice(0, 3) : (r?.tasks || []).slice(0, 3)))
      .catch(() => {})
  }, [])

  const fmtDate = (iso) => {
    if (!iso) return ''
    try {
      const d = new Date(iso.replace('T', ' ').slice(0, 16))
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    } catch { return iso.slice(0, 10) }
  }

  const sectionTitle = (label) => (
    <div style={{
      fontSize: 10, fontWeight: 700, letterSpacing: '0.10em',
      color: 'rgba(255,255,255,0.30)', textTransform: 'uppercase', marginBottom: 8, marginTop: 20,
    }}>
      {label}
    </div>
  )

  const emptyState = (text) => (
    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.30)', padding: '8px 0', fontStyle: 'italic' }}>{text}</div>
  )

  const cardStyle = (accent) => ({
    background: 'rgba(255,255,255,0.04)',
    border: `1px solid rgba(255,255,255,0.07)`,
    borderLeft: `3px solid ${accent || 'rgba(255,255,255,0.12)'}`,
    borderRadius: 8,
    padding: '8px 10px',
    marginBottom: 6,
    cursor: 'pointer',
    transition: 'box-shadow 150ms ease',
  })

  return (
    <div style={{
      width: 260, flexShrink: 0,
      background: 'rgba(10,10,18,0.60)',
      backdropFilter: 'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)',
      borderLeft: '1px solid rgba(255,255,255,0.06)',
      overflowY: 'auto',
      padding: '20px 16px',
      display: 'flex',
      flexDirection: 'column',
    }}
      className="dc-scroll"
    >
      <div style={{ fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.88)', marginBottom: 4 }}>Context</div>
      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.40)' }}>Recent activity</div>

      {sectionTitle('Recent Ideas')}
      {ideas.length === 0
        ? emptyState('No inbox ideas')
        : ideas.map(idea => (
          <div
            key={idea.id}
            style={cardStyle('#a89fff')}
            onClick={() => onNavigate('ideas')}
            onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 0 0 1px rgba(255,255,255,0.12)' }}
            onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none' }}
          >
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.88)', fontWeight: 500, lineHeight: 1.4 }}>
              {idea.title || idea.content?.slice(0, 60) || 'Untitled'}
            </div>
            {idea.created_at && (
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.40)', marginTop: 3 }}>{fmtDate(idea.created_at)}</div>
            )}
          </div>
        ))
      }

      {sectionTitle('Upcoming Events')}
      {events.length === 0
        ? emptyState('No upcoming events')
        : events.map(ev => (
          <div
            key={ev.id}
            style={cardStyle('#60a5fa')}
            onClick={() => onNavigate('events')}
            onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 0 0 1px rgba(255,255,255,0.12)' }}
            onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none' }}
          >
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.88)', fontWeight: 500, lineHeight: 1.4 }}>{ev.title}</div>
            {ev.start_dt && (
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.40)', marginTop: 3 }}>{fmtDate(ev.start_dt)}</div>
            )}
          </div>
        ))
      }

      {sectionTitle('Open Tasks')}
      {tasks.length === 0
        ? emptyState('No open tasks')
        : tasks.map(t => (
          <div
            key={t.id}
            style={cardStyle('#fbbf24')}
            onClick={() => onNavigate('tasks')}
            onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 0 0 1px rgba(255,255,255,0.12)' }}
            onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none' }}
          >
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.88)', fontWeight: 500, lineHeight: 1.4 }}>{t.title}</div>
            {t.due_date && (
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.40)', marginTop: 3 }}>Due {fmtDate(t.due_date)}</div>
            )}
          </div>
        ))
      }
    </div>
  )
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────

export default function Dashboard({ onNavigate }) {
  const isMobile = useIsMobile()
  const [messages, setMessages]       = useState(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      return stored ? JSON.parse(stored) : []
    } catch { return [] }
  })
  const [input, setInput]             = useState('')
  const [loading, setLoading]         = useState(false)
  const [selectedMember, setSelected] = useState('dot')
  const [routingTo, setRoutingTo]     = useState(null)
  const [streaming, setStreaming]     = useState(false)
  const [clearConfirm, setClearConfirm] = useState(false)

  const [uploading, setUploading] = useState(false)

  const bottomRef          = useRef(null)
  const textareaRef        = useRef(null)
  const fileInputRef       = useRef(null)
  const userScrolledUpRef  = useRef(false)

  // Streaming refs — avoid stale closures
  const streamRef      = useRef({ member: null, text: '', scopedQuestion: '', bubbleId: null })
  const abortCtrlRef   = useRef(null)
  const streamTimeoutRef = useRef(null)

  // Typewriter refs
  const displayTextRef = useRef({})
  const charQueueRef   = useRef({})
  const rafRef         = useRef(null)

  // ── Persist messages to localStorage ───────────────────────────────────────
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-MAX_HISTORY)))
    } catch {}
  }, [messages])

  // ── Abort stream helper ─────────────────────────────────────────────────────
  const abortStream = useCallback((appendError = false) => {
    if (abortCtrlRef.current) {
      abortCtrlRef.current.abort()
      abortCtrlRef.current = null
    }
    if (streamTimeoutRef.current) {
      clearTimeout(streamTimeoutRef.current)
      streamTimeoutRef.current = null
    }
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    const bid = streamRef.current.bubbleId
    if (bid) {
      const finalText = streamRef.current.text
      setMessages(prev => prev.map(m =>
        m.id === bid
          ? {
              ...m,
              text: appendError
                ? (finalText || 'The response timed out or was interrupted.')
                : finalText,
              streaming: false,
              error: appendError && !finalText,
            }
          : m
      ))
    }
    streamRef.current      = { member: null, text: '', scopedQuestion: '', bubbleId: null }
    displayTextRef.current = {}
    charQueueRef.current   = {}
    setLoading(false)
    setStreaming(false)
    setRoutingTo(null)
  }, [])

  // ── Cleanup on unmount ──────────────────────────────────────────────────────
  useEffect(() => {
    return () => { abortStream(false) }
  }, [abortStream])

  // ── Typewriter drain loop ───────────────────────────────────────────────────
  const drainQueues = useCallback(() => {
    let anyRemaining = false

    for (const bubbleId of Object.keys(charQueueRef.current)) {
      const queue = charQueueRef.current[bubbleId]
      if (!queue || queue.length === 0) continue

      const chars = queue.splice(0, 4)
      if (chars.length > 0) {
        displayTextRef.current[bubbleId] = (displayTextRef.current[bubbleId] || '') + chars.join('')
        const snapshot = displayTextRef.current[bubbleId]
        setMessages(prev => prev.map(m =>
          m.id === bubbleId ? { ...m, text: snapshot } : m
        ))
      }

      if (queue.length > 0) anyRemaining = true
    }

    if (anyRemaining) {
      rafRef.current = requestAnimationFrame(drainQueues)
    } else {
      rafRef.current = null
    }
  }, [])

  // ── Auto-scroll ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!userScrolledUpRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages])

  // ── Focus textarea on mount ─────────────────────────────────────────────────
  useEffect(() => {
    setTimeout(() => textareaRef.current?.focus(), 80)
  }, [])

  // ── Input helpers ───────────────────────────────────────────────────────────
  const handleInputChange = (e) => {
    setInput(e.target.value)
    const ta = textareaRef.current
    if (ta) {
      ta.style.height = 'auto'
      ta.style.height = Math.min(ta.scrollHeight, 120) + 'px'
    }
  }

  const handleScroll = (e) => {
    const el = e.currentTarget
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    userScrolledUpRef.current = distFromBottom > 60
  }

  const resetStreamTimeout = (onTimeout) => {
    if (streamTimeoutRef.current) clearTimeout(streamTimeoutRef.current)
    streamTimeoutRef.current = setTimeout(onTimeout, STREAM_TIMEOUT_MS)
  }

  // ── Send message ────────────────────────────────────────────────────────────
  const send = async () => {
    const text = input.trim()
    if (!text || loading) return

    setInput('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
    setLoading(true)
    setRoutingTo(null)
    setStreaming(false)

    userScrolledUpRef.current  = false
    streamRef.current          = { member: null, text: '', scopedQuestion: '', bubbleId: null }
    displayTextRef.current     = {}
    charQueueRef.current       = {}

    const history = messages
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .slice(-MAX_HISTORY)
      .map(m => ({ role: m.role, content: m.text || '' }))

    const userMsg = { id: `u-${Date.now()}`, role: 'user', text, content: text, ts: new Date().toISOString() }
    setMessages(prev => [...prev, userMsg].slice(-MAX_HISTORY))

    const ctrl = new AbortController()
    abortCtrlRef.current = ctrl

    const onRoutingTo = (member, scopedQuestion) => {
      if (streamRef.current.member !== null) {
        const bid = streamRef.current.bubbleId
        setMessages(prev => prev.map(m =>
          m.id === bid ? { ...m, text: streamRef.current.text, streaming: false } : m
        ))
      }
      const bubbleId = `${Date.now()}-${Math.random()}`
      streamRef.current = { member, text: '', scopedQuestion, bubbleId }
      displayTextRef.current[bubbleId] = ''
      charQueueRef.current[bubbleId]   = []

      setMessages(prev => [
        ...prev,
        { id: bubbleId, role: 'assistant', member, scopedQuestion, text: '', streaming: true, ts: new Date().toISOString() },
      ].slice(-MAX_HISTORY))
    }

    const onText = (chunk) => {
      if (!streamRef.current.bubbleId) return
      streamRef.current.text += chunk
      const bid = streamRef.current.bubbleId
      if (!charQueueRef.current[bid]) charQueueRef.current[bid] = []
      for (const ch of chunk) charQueueRef.current[bid].push(ch)
      if (rafRef.current === null) rafRef.current = requestAnimationFrame(drainQueues)
    }

    const onMemberDone = () => {
      if (!streamRef.current.bubbleId) return
      const bid = streamRef.current.bubbleId
      const finalText = streamRef.current.text
      streamRef.current.member   = null
      streamRef.current.bubbleId = null

      const finalize = () => {
        setMessages(prev => prev.map(m =>
          m.id === bid ? { ...m, text: finalText, streaming: false } : m
        ))
      }

      if (!charQueueRef.current[bid] || charQueueRef.current[bid].length === 0) {
        finalize()
      } else {
        const poll = setInterval(() => {
          if (!charQueueRef.current[bid] || charQueueRef.current[bid].length === 0) {
            clearInterval(poll)
            finalize()
          }
        }, 16)
      }
    }

    try {
      const res = await api.chatStream(selectedMember, text, history, { signal: ctrl.signal })
      if (!res.ok) throw new Error('Chat request failed')

      const reader  = res.body.getReader()
      const decoder = new TextDecoder()

      resetStreamTimeout(() => ctrl.abort())

      let streamDone = false
      while (!streamDone) {
        const { value, done } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value, { stream: true })

        resetStreamTimeout(() => ctrl.abort())

        for (const line of chunk.split('\n')) {
          if (!line.startsWith('data: ')) continue
          const payload = line.slice(6).trim()
          if (payload === '[DONE]') { streamDone = true; break }
          if (payload === 'ping')   continue

          try {
            const data = JSON.parse(payload)

            if (data.routing_to) {
              onRoutingTo(data.routing_to, data.scoped_question || null)
              setRoutingTo(data.routing_to)
              setStreaming(false)
            }
            if (data.text) {
              onText(data.text)
              setStreaming(true)
            }
            if (data.member_done) {
              onMemberDone()
              setStreaming(false)
            }
            if (data.handoff) {
              setMessages(prev => [...prev, {
                id: `handoff-${Date.now()}`,
                role: 'handoff',
                from: data.handoff.from,
                to: data.handoff.to,
                note: data.handoff.note,
              }].slice(-MAX_HISTORY))
            }
            if (data.task_created) {
              setMessages(prev => [
                ...prev,
                { id: `tc-${Date.now()}`, role: 'task_created', task: data.task_created },
              ].slice(-MAX_HISTORY))
            }
            if (data.idea_created) {
              setMessages(prev => [
                ...prev,
                { id: `ic-${Date.now()}`, role: 'idea_created', idea: data.idea_created },
              ].slice(-MAX_HISTORY))
            }
          } catch {}
        }
      }

      if (streamTimeoutRef.current) {
        clearTimeout(streamTimeoutRef.current)
        streamTimeoutRef.current = null
      }

      const finalBid = streamRef.current.bubbleId
      if (finalBid) {
        const finalText = streamRef.current.text
        setMessages(prev => prev.map(m =>
          m.id === finalBid && m.streaming
            ? { ...m, text: finalText, streaming: false }
            : m
        ))
      }
      setRoutingTo(null)
      setStreaming(false)

    } catch (err) {
      if (streamTimeoutRef.current) {
        clearTimeout(streamTimeoutRef.current)
        streamTimeoutRef.current = null
      }
      if (err.name === 'AbortError' && abortCtrlRef.current === null) return

      setMessages(prev => {
        const last = prev[prev.length - 1]
        if (last && last.role === 'assistant') {
          return [
            ...prev.slice(0, -1),
            {
              ...last,
              text: err.name === 'AbortError'
                ? 'The response timed out. Please try again.'
                : 'Something went wrong. Check that the API server is running.',
              streaming: false,
              error: true,
            },
          ]
        }
        return [
          ...prev,
          {
            id: `err-${Date.now()}`,
            role: 'assistant',
            member: selectedMember,
            text: err.name === 'AbortError'
              ? 'The response timed out. Please try again.'
              : 'Something went wrong. Check that the API server is running.',
            streaming: false,
            error: true,
            ts: new Date().toISOString(),
          },
        ]
      })
      setRoutingTo(null)
      setStreaming(false)
    } finally {
      if (abortCtrlRef.current === ctrl) abortCtrlRef.current = null
      setLoading(false)
      setTimeout(() => textareaRef.current?.focus(), 50)
    }
  }

  const handleKeyDown = (e) => {
    if ((e.key === 'Enter' && e.metaKey) || (e.key === 'Enter' && !e.shiftKey)) {
      e.preventDefault()
      send()
    }
  }

  const clearChat = () => {
    if (!clearConfirm) { setClearConfirm(true); setTimeout(() => setClearConfirm(false), 3000); return }
    setMessages([])
    setClearConfirm(false)
    try { localStorage.removeItem(STORAGE_KEY) } catch {}
  }

  // ── File upload ─────────────────────────────────────────────────────────────
  const handleFileUpload = async (file) => {
    if (!file || uploading) return
    setUploading(true)
    try {
      const result = await api.uploadFile(file)
      const uploadMsg = {
        id: `fu-${Date.now()}`,
        role: 'file_upload',
        file: result,
        ts: new Date().toISOString(),
      }
      const followMsg = {
        id: `fu-note-${Date.now()}`,
        role: 'user',
        text: `I just uploaded ${result.original_name || file.name}. Milo has been tasked to organize it.`,
        content: `I just uploaded ${result.original_name || file.name}. Milo has been tasked to organize it.`,
        ts: new Date().toISOString(),
        _synthetic: true,
      }
      setMessages(prev => [...prev, uploadMsg, followMsg].slice(-MAX_HISTORY))
    } catch (err) {
      setMessages(prev => [...prev, {
        id: `fu-err-${Date.now()}`,
        role: 'assistant',
        member: selectedMember,
        text: `Upload failed: ${err.message}`,
        streaming: false,
        error: true,
        ts: new Date().toISOString(),
      }].slice(-MAX_HISTORY))
    } finally {
      setUploading(false)
    }
  }

  const handleDragOver = (e) => {
    e.preventDefault()
  }

  const handleDrop = (e) => {
    e.preventDefault()
    const file = e.dataTransfer.files?.[0]
    if (file) handleFileUpload(file)
  }

  // ── Date separator helpers ──────────────────────────────────────────────────
  const fmtTime = (iso) => {
    if (!iso) return ''
    try {
      return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    } catch { return '' }
  }

  const isSameDay = (a, b) => {
    if (!a || !b) return false
    const da = new Date(a), db = new Date(b)
    return da.getFullYear() === db.getFullYear() &&
           da.getMonth()    === db.getMonth() &&
           da.getDate()     === db.getDate()
  }

  const isToday = (iso) => {
    if (!iso) return false
    return isSameDay(iso, new Date().toISOString())
  }

  // Determine which messages need a date separator before them
  const withSeparators = messages.reduce((acc, msg, i) => {
    const prev = messages[i - 1]
    if (i === 0 || !isSameDay(msg.ts, prev?.ts)) {
      const d = msg.ts ? new Date(msg.ts) : null
      const label = d
        ? (isToday(msg.ts)
            ? 'Today'
            : d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }))
        : 'Earlier'
      acc.push({ type: 'separator', label, key: `sep-${i}` })
    }
    acc.push({ type: 'message', msg, key: msg.id || i })
    return acc
  }, [])

  // ── Render ──────────────────────────────────────────────────────────────────
  const activeMember = MEMBER_MAP[selectedMember] || MEMBER_MAP.dot

  return (
    <>
      <style>{`
        @keyframes dc-fadeIn {
          from { opacity: 0; transform: translateY(4px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes dc-pulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.35; }
        }
        .dc-scroll::-webkit-scrollbar { width: 4px; }
        .dc-scroll::-webkit-scrollbar-track { background: transparent; }
        .dc-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.10); border-radius: 4px; }
        .dc-sidebar-btn:hover { background: rgba(255,255,255,0.03) !important; }
        .dc-textarea:focus { outline: none; }
        .dc-textarea::placeholder { color: rgba(255,255,255,0.25); }
        .dc-send-btn:not(:disabled):hover { background: #9585fa !important; }
        .dc-context-card:hover { background: rgba(255,255,255,0.04) !important; }
        @keyframes dc-upload-pulse {
          0%, 100% { opacity: 1; box-shadow: 0 0 0 0 rgba(124,106,247,0.5); }
          50%       { opacity: 0.75; box-shadow: 0 0 0 4px rgba(124,106,247,0.0); }
        }
        .dc-attach-btn:hover { background: rgba(255,255,255,0.10) !important; border-color: rgba(255,255,255,0.20) !important; }
      `}</style>

      <div style={{
        display: 'flex',
        height: '100vh',
        background: 'transparent',
        overflow: 'hidden',
        fontFamily: 'inherit',
      }}>

        {/* ── Left Sidebar — Team Roster ─────────────────────────────────── */}
        {!isMobile && (
        <div style={{
          width: 200,
          flexShrink: 0,
          background: 'rgba(10,10,18,0.60)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderRight: '1px solid rgba(255,255,255,0.06)',
          display: 'flex',
          flexDirection: 'column',
          overflowY: 'auto',
          padding: '16px 0',
        }}
          className="dc-scroll"
        >
          <div style={{ padding: '0 12px 12px', fontSize: 10, fontWeight: 700, letterSpacing: '0.10em', color: 'rgba(255,255,255,0.30)', textTransform: 'uppercase' }}>
            Team
          </div>

          {MEMBERS.map(m => {
            const isActive = selectedMember === m.id
            return (
              <button
                key={m.id}
                className="dc-sidebar-btn"
                onClick={() => setSelected(m.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '8px 12px',
                  background: isActive ? `rgba(${hexToRgb(m.color)}, 0.12)` : 'transparent',
                  border: 'none',
                  borderLeft: isActive ? `3px solid ${m.color}` : '3px solid transparent',
                  borderRight: 'none',
                  borderTop: 'none',
                  borderBottom: 'none',
                  boxShadow: isActive ? `inset 0 0 20px rgba(${hexToRgb(m.color)}, 0.08)` : 'none',
                  cursor: 'pointer',
                  textAlign: 'left',
                  width: '100%',
                  transition: 'background 0.12s',
                }}
              >
                <div style={{
                  width: 30, height: 30, borderRadius: '50%',
                  background: isActive ? `${m.color}33` : `${m.color}16`,
                  border: `2px solid ${isActive ? m.color + '88' : m.color + '33'}`,
                  boxShadow: isActive ? `0 0 12px rgba(${hexToRgb(m.color)}, 0.5)` : 'none',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 12, fontWeight: 700, color: m.color,
                  flexShrink: 0,
                  transition: 'background 0.12s, border-color 0.12s, box-shadow 0.12s',
                }}>
                  {m.label.charAt(0)}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{
                    fontSize: 13, fontWeight: isActive ? 700 : 500,
                    color: isActive ? m.color : 'rgba(255,255,255,0.65)',
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    transition: 'color 0.12s',
                  }}>
                    {m.label}
                  </div>
                  <div style={{
                    fontSize: 10, color: 'rgba(255,255,255,0.30)',
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>
                    {m.role}
                  </div>
                </div>
              </button>
            )
          })}
        </div>
        )}

        {/* ── Center — Chat Thread ───────────────────────────────────────── */}
        <div
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            minWidth: 0,
          }}
        >
          {/* Header */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: isMobile ? '14px 24px 14px 64px' : '14px 24px',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
            flexShrink: 0,
            background: 'rgba(10,10,18,0.70)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <MemberAvatar memberId={selectedMember} size={36} />
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 15, fontWeight: 700, color: 'rgba(255,255,255,0.88)' }}>
                    {activeMember.label}
                  </span>
                  {/* Routing indicator */}
                  {routingTo && (
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 5,
                      fontSize: 11, color: 'rgba(255,255,255,0.45)',
                      animation: 'dc-fadeIn 0.25s ease',
                    }}>
                      <span style={{
                        width: 7, height: 7, borderRadius: '50%',
                        background: MEMBER_MAP[routingTo]?.color || '#9595b8',
                        boxShadow: `0 0 6px ${MEMBER_MAP[routingTo]?.color || '#9595b8'}`,
                        display: 'inline-block',
                        animation: 'dc-pulse 1.4s ease-in-out infinite',
                      }} />
                      <span style={{ color: MEMBER_MAP[routingTo]?.color || '#9595b8', fontWeight: 600 }}>
                        {MEMBER_MAP[routingTo]?.label || routingTo}
                      </span>
                      <span style={{ color: 'rgba(255,255,255,0.30)' }}>{streaming ? 'is answering...' : 'routing...'}</span>
                    </div>
                  )}
                </div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 1 }}>{activeMember.role}</div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {messages.length > 0 && (
                <button
                  onClick={clearChat}
                  style={{
                    background: clearConfirm ? '#f8717122' : 'transparent',
                    border: clearConfirm ? '1px solid #f8717144' : '1px solid transparent',
                    color: clearConfirm ? '#f87171' : 'rgba(255,255,255,0.30)',
                    fontSize: 12, cursor: 'pointer',
                    padding: '5px 10px', borderRadius: 6,
                    transition: 'all 0.12s',
                  }}
                  onMouseEnter={e => { if (!clearConfirm) e.currentTarget.style.color = 'rgba(255,255,255,0.55)' }}
                  onMouseLeave={e => { if (!clearConfirm) e.currentTarget.style.color = 'rgba(255,255,255,0.30)' }}
                >
                  {clearConfirm ? 'Confirm clear?' : 'Clear'}
                </button>
              )}
            </div>
          </div>

          {/* Messages */}
          <div
            className="dc-scroll"
            onScroll={handleScroll}
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: isMobile ? '16px 16px' : '24px 32px',
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
            }}
          >
            {messages.length === 0 && (
              <div style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 12,
                color: 'rgba(255,255,255,0.30)',
                fontSize: 13,
                textAlign: 'center',
                padding: '80px 40px',
              }}>
                <div style={{
                  width: 56, height: 56, borderRadius: '50%',
                  background: `${activeMember.color}18`,
                  border: `1px solid ${activeMember.color}44`,
                  boxShadow: `0 0 24px rgba(${hexToRgb(activeMember.color)}, 0.3)`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 24, color: activeMember.color, marginBottom: 4,
                }}>
                  {activeMember.label.charAt(0)}
                </div>
                <div style={{ color: 'rgba(255,255,255,0.55)', fontWeight: 600, fontSize: 16 }}>
                  {selectedMember === 'dot' ? 'Ask the team anything' : `Chat with ${activeMember.label}`}
                </div>
                <div style={{ maxWidth: 340, lineHeight: 1.6 }}>
                  {selectedMember === 'dot'
                    ? 'Strategy, shows, press, legal — Dot will route you to the right person.'
                    : `${activeMember.label} handles ${activeMember.role.toLowerCase()}. Ask away.`
                  }
                </div>
              </div>
            )}

            {withSeparators.map(item => {
              if (item.type === 'separator') {
                return (
                  <div key={item.key} style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    margin: '16px 0 8px',
                  }}>
                    <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.06)' }} />
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.30)', whiteSpace: 'nowrap' }}>{item.label}</div>
                    <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.06)' }} />
                  </div>
                )
              }

              const m = item.msg

              if (m.role === 'task_created') {
                return (
                  <div key={item.key} style={{ animation: 'dc-fadeIn 0.2s ease', marginBottom: 4 }}>
                    <TaskCreatedCard task={m.task} onNavigate={onNavigate} />
                  </div>
                )
              }

              if (m.role === 'idea_created') {
                return (
                  <div key={item.key} style={{ animation: 'dc-fadeIn 0.2s ease', marginBottom: 4 }}>
                    <IdeaCreatedCard idea={m.idea} onNavigate={onNavigate} />
                  </div>
                )
              }

              if (m.role === 'file_upload') {
                return (
                  <div key={item.key} style={{
                    display: 'flex', justifyContent: 'flex-end',
                    gap: 10, animation: 'dc-fadeIn 0.15s ease',
                    marginBottom: 4, marginTop: 8,
                  }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}>
                      {m.ts && (
                        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', paddingRight: 2 }}>{fmtTime(m.ts)}</div>
                      )}
                      <FileUploadCard file={m.file} />
                    </div>
                    <div style={{
                      width: 30, height: 30, borderRadius: '50%',
                      background: 'rgba(124,106,247,0.22)',
                      border: '1px solid rgba(124,106,247,0.40)',
                      boxShadow: '0 0 12px rgba(124,106,247,0.35)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 11, fontWeight: 700, color: '#7c6af7',
                      flexShrink: 0, marginTop: 18,
                    }}>
                      Y
                    </div>
                  </div>
                )
              }

              if (m.role === 'handoff') {
                return (
                  <div key={item.key} style={{ display: 'flex', justifyContent: 'center', margin: '8px 0', animation: 'dc-fadeIn 0.2s ease' }}>
                    <HandoffCard from={m.from} to={m.to} note={m.note} />
                  </div>
                )
              }

              if (m.role === 'user') {
                return (
                  <div key={item.key} style={{
                    display: 'flex', justifyContent: 'flex-end',
                    gap: 10, animation: 'dc-fadeIn 0.15s ease',
                    marginBottom: 12, marginTop: 8,
                  }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}>
                      {m.ts && (
                        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', paddingRight: 2 }}>{fmtTime(m.ts)}</div>
                      )}
                      <div style={{
                        maxWidth: isMobile ? '85vw' : 560,
                        background: 'linear-gradient(135deg, rgba(124,106,247,0.25) 0%, rgba(99,102,241,0.20) 100%)',
                        border: '1px solid rgba(124,106,247,0.35)',
                        borderRadius: '18px 18px 4px 18px',
                        boxShadow: '0 4px 20px rgba(124,106,247,0.15)',
                        backdropFilter: 'blur(8px)',
                        WebkitBackdropFilter: 'blur(8px)',
                        padding: '10px 14px',
                        fontSize: 13.5,
                        color: 'rgba(255,255,255,0.88)',
                        lineHeight: 1.6,
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                      }}>
                        {m.text || m.content}
                      </div>
                    </div>
                    <div style={{
                      width: 30, height: 30, borderRadius: '50%',
                      background: 'rgba(124,106,247,0.22)',
                      border: '1px solid rgba(124,106,247,0.40)',
                      boxShadow: '0 0 12px rgba(124,106,247,0.35)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 11, fontWeight: 700, color: '#7c6af7',
                      flexShrink: 0, marginTop: 18,
                    }}>
                      Y
                    </div>
                  </div>
                )
              }

              if (m.role === 'assistant') {
                const memberInfo  = MEMBER_MAP[m.member] || { label: m.member || 'Team', color: '#9595b8' }
                const memberColor = memberInfo.color
                const memberName  = memberInfo.label

                return (
                  <div key={item.key} style={{
                    display: 'flex', gap: 10,
                    animation: 'dc-fadeIn 0.15s ease',
                    marginBottom: 12, marginTop: 8,
                    alignItems: 'flex-start',
                  }}>
                    <div style={{
                      width: 30, height: 30, borderRadius: '50%',
                      background: `${memberColor}22`,
                      border: `1px solid ${memberColor}44`,
                      boxShadow: `0 0 12px rgba(${hexToRgb(memberColor)}, 0.35)`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 11, fontWeight: 700, color: memberColor,
                      flexShrink: 0, marginTop: 18,
                    }}>
                      {memberName.charAt(0)}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        fontSize: 11, color: 'rgba(255,255,255,0.30)', paddingLeft: 2, marginBottom: 3,
                        flexWrap: 'wrap',
                      }}>
                        <span style={{ color: memberColor, fontWeight: 700 }}>{memberName}</span>
                        {m.scopedQuestion && (
                          <>
                            <span style={{ color: 'rgba(255,255,255,0.20)' }}>·</span>
                            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.30)', fontStyle: 'italic' }}>{m.scopedQuestion}</span>
                          </>
                        )}
                        {m.ts && (
                          <span style={{ color: 'rgba(255,255,255,0.18)', marginLeft: 2 }}>{fmtTime(m.ts)}</span>
                        )}
                      </div>
                      <div style={{
                        maxWidth: isMobile ? '90vw' : 640,
                        background: 'rgba(255,255,255,0.04)',
                        border: `1px solid ${m.error ? '#f8717144' : 'rgba(255,255,255,0.09)'}`,
                        borderRadius: '4px 18px 18px 18px',
                        boxShadow: '0 4px 16px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.06)',
                        backdropFilter: 'blur(8px)',
                        WebkitBackdropFilter: 'blur(8px)',
                        padding: '10px 14px',
                        fontSize: 13.5,
                        color: m.error ? '#f87171' : 'rgba(255,255,255,0.88)',
                        lineHeight: 1.6,
                        wordBreak: 'break-word',
                      }}>
                        {m.text ? (
                          <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
                            {m.text}
                          </ReactMarkdown>
                        ) : m.streaming ? (
                          <span style={{ opacity: 0.4 }}>▋</span>
                        ) : null}
                        {m.streaming && m.text && (
                          <span style={{ opacity: 0.4 }}>▋</span>
                        )}
                      </div>
                    </div>
                  </div>
                )
              }

              return null
            })}

            <div ref={bottomRef} />
          </div>

          {/* ── Input Bar ─────────────────────────────────────────────────── */}
          <div style={{
            borderTop: '1px solid rgba(255,255,255,0.06)',
            padding: isMobile ? '10px 12px 12px' : '12px 24px 16px',
            flexShrink: 0,
            background: 'rgba(10,10,18,0.70)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
          }}>
            <div style={{
              display: 'flex', gap: 10, alignItems: 'flex-end',
              background: 'rgba(255,255,255,0.04)',
              backdropFilter: 'blur(16px)',
              WebkitBackdropFilter: 'blur(16px)',
              border: '1px solid rgba(255,255,255,0.10)',
              borderRadius: 14,
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06)',
              padding: '8px 10px 8px 14px',
              transition: 'border-color 200ms ease, box-shadow 200ms ease',
            }}>
              {/* Member pill */}
              <div style={{ position: 'relative', flexShrink: 0, alignSelf: 'flex-end', marginBottom: 2 }}>
                <select
                  value={selectedMember}
                  onChange={e => setSelected(e.target.value)}
                  style={{
                    background: `${activeMember.color}18`,
                    border: `1px solid ${activeMember.color}44`,
                    borderRadius: 8,
                    color: activeMember.color,
                    fontSize: 11,
                    fontWeight: 700,
                    padding: '4px 8px',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    appearance: 'none',
                    WebkitAppearance: 'none',
                    paddingRight: 20,
                  }}
                >
                  {MEMBERS.map(m => (
                    <option key={m.id} value={m.id} style={{ background: '#1c1c24', color: 'rgba(255,255,255,0.88)' }}>
                      {m.label}
                    </option>
                  ))}
                </select>
                <span style={{
                  position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)',
                  color: activeMember.color, fontSize: 8, pointerEvents: 'none',
                }}>▼</span>
              </div>

              {/* Hidden file input */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,application/pdf,.doc,.docx,.txt,.mp3,.wav,.mp4,.mov,.xls,.xlsx,.csv"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) handleFileUpload(file)
                  e.target.value = ''
                }}
              />

              {/* Attach button */}
              <button
                className="dc-attach-btn"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                title="Attach file"
                style={{
                  width: 24, height: 24,
                  background: uploading ? 'rgba(124,106,247,0.15)' : 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.12)',
                  borderRadius: 6,
                  color: uploading ? '#a89fff' : 'rgba(255,255,255,0.45)',
                  fontSize: 14,
                  cursor: uploading ? 'default' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                  alignSelf: 'flex-end',
                  marginBottom: 5,
                  transition: 'background 0.15s, color 0.15s, border-color 0.15s',
                  animation: uploading ? 'dc-upload-pulse 1.2s ease-in-out infinite' : 'none',
                  backdropFilter: 'blur(8px)',
                  WebkitBackdropFilter: 'blur(8px)',
                }}
              >
                📎
              </button>

              <textarea
                ref={textareaRef}
                className="dc-textarea"
                value={input}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                placeholder="Ask the team anything… (Enter to send, Shift+Enter for new line)"
                disabled={loading}
                rows={1}
                style={{
                  flex: 1,
                  background: 'transparent',
                  border: '1px solid transparent',
                  borderRadius: 8,
                  color: 'rgba(255,255,255,0.88)',
                  padding: '6px 4px',
                  fontSize: 13.5,
                  resize: 'none',
                  fontFamily: 'inherit',
                  lineHeight: '22px',
                  overflowY: 'hidden',
                  minHeight: 34,
                  maxHeight: 120,
                  transition: 'border-color 0.15s',
                }}
              />

              <button
                onClick={send}
                disabled={loading || !input.trim()}
                className="dc-send-btn"
                style={{
                  background: (loading || !input.trim()) ? 'rgba(255,255,255,0.06)' : 'linear-gradient(135deg, rgba(124,106,247,0.80) 0%, rgba(99,102,241,0.70) 100%)',
                  border: (loading || !input.trim()) ? 'none' : '1px solid rgba(124,106,247,0.60)',
                  borderRadius: 10,
                  boxShadow: (loading || !input.trim()) ? 'none' : '0 4px 16px rgba(124,106,247,0.25), inset 0 1px 0 rgba(255,255,255,0.15)',
                  color: (loading || !input.trim()) ? 'rgba(255,255,255,0.25)' : '#fff',
                  width: 36, height: 36,
                  fontSize: 16,
                  cursor: (loading || !input.trim()) ? 'default' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                  transition: 'background 0.15s, color 0.15s, box-shadow 0.15s',
                  alignSelf: 'flex-end',
                }}
              >
                ↑
              </button>
            </div>

            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.20)', marginTop: 6, paddingLeft: 4 }}>
              {uploading
                ? <span style={{ color: 'rgba(168,159,255,0.60)', animation: 'dc-pulse 1.4s ease-in-out infinite', display: 'inline-block' }}>Uploading…</span>
                : 'Enter to send · Shift+Enter for new line · 📎 to attach a file or drag & drop'
              }
            </div>
          </div>
        </div>

        {/* ── Right Panel — Context (hidden on mobile) ──────────────────── */}
        {!isMobile && <ContextPanel onNavigate={onNavigate} />}
      </div>
    </>
  )
}
