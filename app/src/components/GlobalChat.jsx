import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { api } from '../api'

const MEMBER_COLORS = {
  felix: '#60a5fa',
  nina:  '#f472b6',
  cass:  '#a89fff',
  marco: '#4ade80',
  priya: '#fbbf24',
  eli:   '#2dd4bf',
  quinn: '#fb923c',
  dot:   '#7c6af7',
}

const MAX_HISTORY = 20

// How long to wait for any SSE activity before aborting the stream (ms)
const STREAM_TIMEOUT_MS = 60_000

const mdComponents = {
  p:      ({ children }) => <p style={{ margin: '0 0 8px', lineHeight: 1.6 }}>{children}</p>,
  h1:     ({ children }) => <h1 style={{ fontSize: 16, fontWeight: 700, margin: '10px 0 5px', color: '#e8e8f8' }}>{children}</h1>,
  h2:     ({ children }) => <h2 style={{ fontSize: 14, fontWeight: 700, margin: '8px 0 4px', color: '#e8e8f8' }}>{children}</h2>,
  h3:     ({ children }) => <h3 style={{ fontSize: 13, fontWeight: 600, margin: '6px 0 3px', color: '#e8e8f8' }}>{children}</h3>,
  ul:     ({ children }) => <ul style={{ margin: '4px 0 8px', paddingLeft: 18 }}>{children}</ul>,
  ol:     ({ children }) => <ol style={{ margin: '4px 0 8px', paddingLeft: 18 }}>{children}</ol>,
  li:     ({ children }) => <li style={{ margin: '2px 0', lineHeight: 1.55 }}>{children}</li>,
  strong: ({ children }) => <strong style={{ fontWeight: 700, color: '#e8e8f8' }}>{children}</strong>,
  em:     ({ children }) => <em style={{ fontStyle: 'italic', color: '#c8c8e8' }}>{children}</em>,
  code:   ({ inline, children }) => inline
    ? <code style={{ background: '#363650', borderRadius: 4, padding: '1px 5px', fontSize: 12, fontFamily: 'monospace', color: '#a89fff' }}>{children}</code>
    : <code>{children}</code>,
  pre:    ({ children }) => (
    <pre style={{
      background: '#1c1c24', border: '1px solid #363650', borderRadius: 8,
      padding: '8px 12px', overflowX: 'auto', margin: '6px 0 10px',
      fontSize: 12, lineHeight: 1.6, fontFamily: 'monospace',
    }}>{children}</pre>
  ),
  blockquote: ({ children }) => (
    <blockquote style={{
      borderLeft: '3px solid #7c6af7', paddingLeft: 10, margin: '4px 0',
      color: '#9595b8', fontStyle: 'italic',
    }}>{children}</blockquote>
  ),
  hr: () => <hr style={{ border: 'none', borderTop: '1px solid #363650', margin: '8px 0' }} />,
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" style={{ color: '#a89fff', textDecoration: 'underline' }}>{children}</a>
  ),
}

function RoutingIndicator({ routingTo, streaming }) {
  if (!routingTo) return null
  const color = MEMBER_COLORS[routingTo] || '#9595b8'
  const name = routingTo.charAt(0).toUpperCase() + routingTo.slice(1)

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6,
      fontSize: 11, color: '#9595b8',
      animation: 'fadeIn 0.25s ease',
      transition: 'opacity 0.2s ease',
    }}>
      <span style={{
        width: 7, height: 7, borderRadius: '50%',
        background: color,
        boxShadow: `0 0 6px ${color}`,
        display: 'inline-block',
        animation: 'pulse 1.4s ease-in-out infinite',
      }} />
      <span style={{ color }}>{name}</span>
      <span style={{ color: '#56567a' }}>{streaming ? 'is answering...' : 'routing...'}</span>
    </div>
  )
}

function HandoffCard({ from, to, note }) {
  const fromColor = MEMBER_COLORS[from] || '#9595b8'
  const toColor   = MEMBER_COLORS[to]   || '#9595b8'
  const fromName  = from.charAt(0).toUpperCase() + from.slice(1)
  const toName    = to.charAt(0).toUpperCase()   + to.slice(1)
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '6px 10px',
      borderRadius: 8,
      background: 'rgba(255,255,255,0.02)',
      border: '1px solid #363650',
      fontSize: 11,
      color: '#56567a',
      animation: 'fadeIn 0.25s ease',
      alignSelf: 'center',
      maxWidth: '90%',
    }}>
      <span style={{ color: fromColor, fontWeight: 600 }}>{fromName}</span>
      <span style={{ opacity: 0.5, fontSize: 13 }}>→</span>
      <span style={{ color: toColor, fontWeight: 600 }}>{toName}</span>
      {note && (
        <>
          <span style={{ opacity: 0.3 }}>·</span>
          <span style={{ fontStyle: 'italic', color: '#56567a' }}>{note}</span>
        </>
      )}
    </div>
  )
}

function TaskCreatedCard({ task, onNavigate }) {
  const [hovered, setHovered] = useState(false)
  return (
    <div style={{
      background: '#4ade8022',
      border: '1px solid #4ade80',
      borderRadius: 10,
      padding: '10px 14px',
      fontSize: 13,
      marginTop: 4,
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
          background: 'transparent',
          border: 'none',
          color: hovered ? '#86efac' : '#4ade80',
          fontSize: 12,
          cursor: 'pointer',
          padding: 0,
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
      background: '#a89fff22',
      border: '1px solid #a89fff',
      borderRadius: 10,
      padding: '10px 14px',
      fontSize: 13,
      marginTop: 4,
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
          background: 'transparent',
          border: 'none',
          color: hovered ? '#c4b8ff' : '#a89fff',
          fontSize: 12,
          cursor: 'pointer',
          padding: 0,
          textDecoration: hovered ? 'underline' : 'none',
          display: 'flex', alignItems: 'center', gap: 4,
        }}
      >
        View in Ideas Inbox →
      </button>
    </div>
  )
}

export default function GlobalChat({ open, onClose, onNavigate, isMobile = false }) {
  const [messages, setMessages]     = useState([])
  const [input, setInput]           = useState('')
  const [loading, setLoading]       = useState(false)
  const [minimized, setMinimized]   = useState(false)
  const [expanded, setExpanded]     = useState(false)
  const [routingTo, setRoutingTo]   = useState(null)
  const [streaming, setStreaming]   = useState(false)
  const bottomRef                   = useRef(null)
  const inputRef                    = useRef(null)
  const textareaRef                 = useRef(null)
  const userScrolledUpRef           = useRef(false)

  // Refs to track in-progress streaming state — avoids stale closure issues
  const streamRef = useRef({ member: null, text: '', scopedQuestion: '', bubbleId: null })

  // AbortController for the current in-flight fetch — allows cancellation on
  // timeout, close, or unmount
  const abortCtrlRef = useRef(null)

  // Inactivity timeout handle — reset on each SSE data event
  const streamTimeoutRef = useRef(null)

  // Typewriter effect refs
  const displayTextRef = useRef({})   // bubbleId → currently visible string
  const charQueueRef   = useRef({})   // bubbleId → string[] of pending characters
  const rafRef         = useRef(null) // current requestAnimationFrame id

  // Abort any active stream and reset all streaming-related state
  const abortStream = (appendErrorMessage = false) => {
    // Cancel the fetch
    if (abortCtrlRef.current) {
      abortCtrlRef.current.abort()
      abortCtrlRef.current = null
    }

    // Clear inactivity timeout
    if (streamTimeoutRef.current) {
      clearTimeout(streamTimeoutRef.current)
      streamTimeoutRef.current = null
    }

    // Cancel typewriter RAF
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }

    // Finalize any open streaming bubble
    const bid = streamRef.current.bubbleId
    if (bid) {
      const finalText = streamRef.current.text
      setMessages(prev => prev.map(m =>
        m.id === bid
          ? {
              ...m,
              text: appendErrorMessage
                ? (finalText || 'The response timed out or was interrupted.')
                : finalText,
              streaming: false,
              error: appendErrorMessage && !finalText,
            }
          : m
      ))
    }

    streamRef.current    = { member: null, text: '', scopedQuestion: '', bubbleId: null }
    displayTextRef.current = {}
    charQueueRef.current   = {}

    setLoading(false)
    setStreaming(false)
    setRoutingTo(null)
  }

  // When the chat is closed (open → false) or the component unmounts,
  // cancel any in-flight stream so it can't update state after remount
  useEffect(() => {
    if (!open) {
      abortStream(false)
    }
    return () => {
      // Cleanup on unmount (covers the case where open is still true)
      abortStream(false)
    }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  // Typewriter drain loop — runs via requestAnimationFrame
  const drainQueues = () => {
    let anyConsumed = false
    let anyRemaining = false

    for (const bubbleId of Object.keys(charQueueRef.current)) {
      const queue = charQueueRef.current[bubbleId]
      if (!queue || queue.length === 0) continue

      // Take up to 4 characters per frame
      const chars = queue.splice(0, 4)
      if (chars.length > 0) {
        displayTextRef.current[bubbleId] = (displayTextRef.current[bubbleId] || '') + chars.join('')
        const snapshot = displayTextRef.current[bubbleId]
        setMessages(prev => prev.map(m =>
          m.id === bubbleId ? { ...m, text: snapshot } : m
        ))
        anyConsumed = true
      }

      if (queue.length > 0) anyRemaining = true
    }

    if (anyRemaining) {
      rafRef.current = requestAnimationFrame(drainQueues)
    } else {
      rafRef.current = null
    }
  }

  // Escape closes the drawer
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  // Focus textarea when opening
  useEffect(() => {
    if (open && !minimized) {
      setTimeout(() => textareaRef.current?.focus(), 50)
    }
  }, [open, minimized])

  // Scroll to bottom on new messages
  useEffect(() => {
    if (!minimized && !userScrolledUpRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, minimized])

  // Auto-grow textarea
  const handleInputChange = (e) => {
    setInput(e.target.value)
    const ta = textareaRef.current
    if (ta) {
      ta.style.height = 'auto'
      const lineHeight = 20
      const maxHeight = lineHeight * 3 + 20
      ta.style.height = Math.min(ta.scrollHeight, maxHeight) + 'px'
    }
  }

  // Reset the inactivity timeout — called on each SSE data event
  const resetStreamTimeout = (onTimeout) => {
    if (streamTimeoutRef.current) clearTimeout(streamTimeoutRef.current)
    streamTimeoutRef.current = setTimeout(() => {
      onTimeout()
    }, STREAM_TIMEOUT_MS)
  }

  const send = async () => {
    const text = input.trim()
    if (!text || loading) return
    setInput('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
    setLoading(true)
    setRoutingTo(null)
    setStreaming(false)

    // Reset scroll pause and streaming ref and typewriter refs at the start of each send
    userScrolledUpRef.current = false
    streamRef.current    = { member: null, text: '', scopedQuestion: '', bubbleId: null }
    displayTextRef.current = {}
    charQueueRef.current   = {}

    const history = messages
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .slice(-MAX_HISTORY)
      .map(m => ({ role: m.role, content: m.text || '' }))

    const userMsg = { role: 'user', text, content: text }
    setMessages(prev => [...prev, userMsg].slice(-MAX_HISTORY))

    // Create a fresh AbortController for this request
    const ctrl = new AbortController()
    abortCtrlRef.current = ctrl

    // Helpers using streamRef to avoid stale closure issues

    const onRoutingTo = (member, scopedQuestion) => {
      // Finalize any existing in-progress bubble (mark it done)
      if (streamRef.current.member !== null) {
        const bid = streamRef.current.bubbleId
        setMessages(prev => prev.map(m =>
          m.id === bid ? { ...m, text: streamRef.current.text, streaming: false } : m
        ))
      }
      // Generate stable ID BEFORE the setMessages call so it's unaffected by
      // React StrictMode double-invocation of the updater function
      const bubbleId = `${Date.now()}-${Math.random()}`
      streamRef.current = { member, text: '', scopedQuestion, bubbleId }

      // Initialize typewriter state for this bubble
      displayTextRef.current[bubbleId] = ''
      charQueueRef.current[bubbleId]   = []

      setMessages(prev => [
        ...prev,
        { id: bubbleId, role: 'assistant', member, scopedQuestion, text: '', streaming: true },
      ].slice(-MAX_HISTORY))
    }

    const onText = (chunk) => {
      if (!streamRef.current.bubbleId) return
      // Still accumulate full text on streamRef for onMemberDone / context
      streamRef.current.text += chunk
      const bid = streamRef.current.bubbleId

      // Push each character into the typewriter queue
      if (!charQueueRef.current[bid]) charQueueRef.current[bid] = []
      for (const ch of chunk) {
        charQueueRef.current[bid].push(ch)
      }

      // Kick off the drain loop if not already running
      if (rafRef.current === null) {
        rafRef.current = requestAnimationFrame(drainQueues)
      }
    }

    const onMemberDone = () => {
      if (!streamRef.current.bubbleId) return
      const bid = streamRef.current.bubbleId
      const finalText = streamRef.current.text
      streamRef.current.member = null
      streamRef.current.bubbleId = null

      const finalize = () => {
        setMessages(prev => prev.map(m =>
          m.id === bid ? { ...m, text: finalText, streaming: false } : m
        ))
      }

      // Wait for the typewriter queue to fully drain before marking streaming: false
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
      const res = await api.chatStream('dot', text, history, { signal: ctrl.signal })
      if (!res.ok) throw new Error('Chat request failed')

      const reader = res.body.getReader()
      const decoder = new TextDecoder()

      // Start the inactivity timeout — abort if stream goes silent too long
      resetStreamTimeout(() => {
        ctrl.abort()
      })

      let streamDone = false
      while (!streamDone) {
        // reader.read() will reject with AbortError when ctrl.abort() is called
        const { value, done } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value, { stream: true })

        // Activity received — reset the inactivity timeout
        resetStreamTimeout(() => {
          ctrl.abort()
        })

        for (const line of chunk.split('\n')) {
          if (!line.startsWith('data: ')) continue
          const payload = line.slice(6).trim()
          if (payload === '[DONE]') { streamDone = true; break }

          try {
            const data = JSON.parse(payload)

            if (data.routing_to) {
              const incomingMember = data.routing_to
              const incomingScopedQuestion = data.scoped_question || null
              onRoutingTo(incomingMember, incomingScopedQuestion)
              setRoutingTo(incomingMember)
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
              // Append task card. Do NOT finalize the streaming bubble here —
              // the AI confirmation text arrives after this event.
              setMessages(prev => [
                ...prev,
                { role: 'task_created', task: data.task_created },
              ].slice(-MAX_HISTORY))
            }

            if (data.idea_created) {
              // Append an idea-captured confirmation card.
              // Do NOT finalize the streaming bubble here — text confirmation
              // from the AI arrives after this event and the bubble is finalized
              // naturally by member_done.
              setMessages(prev => [
                ...prev,
                { role: 'idea_created', idea: data.idea_created },
              ].slice(-MAX_HISTORY))
            }

          } catch {}
        }
      }

      // Clear inactivity timeout — stream ended normally
      if (streamTimeoutRef.current) {
        clearTimeout(streamTimeoutRef.current)
        streamTimeoutRef.current = null
      }

      // Finalize any remaining in-progress bubble
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
      // Clear inactivity timeout on any error path
      if (streamTimeoutRef.current) {
        clearTimeout(streamTimeoutRef.current)
        streamTimeoutRef.current = null
      }

      // Don't update state if the abort was triggered by close/unmount
      // (abortCtrlRef will have been nulled by abortStream in that case)
      if (err.name === 'AbortError' && abortCtrlRef.current === null) {
        return
      }

      setMessages(prev => {
        const last = prev[prev.length - 1]
        if (last && last.role === 'assistant') {
          return [
            ...prev.slice(0, -1),
            {
              ...last,
              text: err.name === 'AbortError'
                ? 'The response timed out. Please try again.'
                : err.message.includes('ANTHROPIC_API_KEY')
                  ? 'API key not configured. Add ANTHROPIC_API_KEY to the .env file and restart the server.'
                  : 'Something went wrong. Check that the API server is running.',
              streaming: false,
              error: true,
            },
          ]
        }
        // If no assistant bubble exists yet, append an error message
        return [
          ...prev,
          {
            id: `err-${Date.now()}`,
            role: 'assistant',
            member: 'dot',
            text: err.name === 'AbortError'
              ? 'The response timed out. Please try again.'
              : 'Something went wrong. Check that the API server is running.',
            streaming: false,
            error: true,
          },
        ]
      })
      setRoutingTo(null)
      setStreaming(false)
    } finally {
      // Only reset loading/abort ref if this request wasn't cancelled by
      // close/unmount (abortStream already handled that case)
      if (abortCtrlRef.current === ctrl) {
        abortCtrlRef.current = null
      }
      setLoading(false)
      setTimeout(() => textareaRef.current?.focus(), 50)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  const handleScroll = (e) => {
    const el = e.currentTarget
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    userScrolledUpRef.current = distFromBottom > 60
  }

  const clearChat = () => {
    setMessages([])
    setRoutingTo(null)
    setStreaming(false)
  }

  if (!open) return null

  const handleExpand = () => {
    setExpanded(true)
    setMinimized(false)
  }

  const handleCollapse = () => {
    setExpanded(false)
  }

  return (
    <>
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(4px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(20px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.4; }
        }
        .gc-drawer {
          animation: slideUp 0.22s ease;
        }
        .gc-input:focus {
          outline: none;
          border-color: #7c6af7 !important;
        }
        .gc-input::placeholder {
          color: #56567a;
        }
        .gc-scroll::-webkit-scrollbar {
          width: 4px;
        }
        .gc-scroll::-webkit-scrollbar-track {
          background: transparent;
        }
        .gc-scroll::-webkit-scrollbar-thumb {
          background: #363650;
          border-radius: 4px;
        }
      `}</style>

      {!isMobile && expanded && (
        <div
          onClick={handleCollapse}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.4)',
            zIndex: 299,
          }}
        />
      )}

      <div
        className="gc-drawer"
        style={{
          position: 'fixed',
          ...(isMobile
            ? {
                // Full-screen overlay on mobile — sits above sidebar backdrop (zIndex 999)
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                width: '100%',
                height: '100%',
                maxHeight: 'none',
                borderRadius: 0,
                transform: 'none',
                zIndex: 1100,
              }
            : expanded
              ? {
                  top: '50%',
                  left: '50%',
                  transform: 'translateX(-50%) translateY(-50%)',
                  bottom: 'auto',
                  width: 760,
                  height: '80vh',
                  maxHeight: 680,
                  borderRadius: 16,
                  zIndex: 300,
                }
              : {
                  bottom: 16,
                  left: 16,
                  top: 'auto',
                  transform: 'none',
                  width: minimized ? 220 : 420,
                  height: minimized ? 48 : 520,
                  borderRadius: 14,
                  zIndex: 300,
                }
          ),
          background: '#242430',
          border: isMobile ? 'none' : '1px solid #363650',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: isMobile ? 'none' : '0 8px 32px rgba(0,0,0,0.5), 0 0 0 1px rgba(124,106,247,0.1)',
          transition: isMobile ? 'none' : 'height 0.2s ease, bottom 0.2s ease, width 0.2s ease',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: (!isMobile && minimized) ? '0 12px' : '14px 16px',
          height: (!isMobile && minimized) ? 48 : 'auto',
          borderBottom: (!isMobile && minimized) ? 'none' : '1px solid #363650',
          flexShrink: 0,
          background: '#242430',
          cursor: (!isMobile && minimized) ? 'pointer' : 'default',
        }}
          onClick={(!isMobile && minimized) ? () => setMinimized(false) : undefined}
        >
          {/* Dot avatar */}
          <div style={{
            width: 36, height: 36, borderRadius: '50%',
            background: '#7c6af722',
            border: '2px solid #7c6af744',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 14, fontWeight: 700, color: '#7c6af7',
            flexShrink: 0,
          }}>
            D
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: '#e8e8f8' }}>Dot</span>
              <RoutingIndicator routingTo={routingTo} streaming={streaming} />
            </div>
            {!routingTo && (
              <div style={{ fontSize: 11, color: '#56567a', marginTop: 1 }}>
                Ask anything — I'll route to the right person
              </div>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {/* Clear */}
            {messages.length > 0 && !minimized && (
              <button
                onClick={clearChat}
                title="Clear chat"
                style={{
                  background: 'transparent', border: 'none',
                  color: '#56567a', fontSize: 11, cursor: 'pointer',
                  padding: '4px 6px', borderRadius: 4,
                  transition: 'color 0.12s',
                }}
                onMouseEnter={e => e.currentTarget.style.color = '#9595b8'}
                onMouseLeave={e => e.currentTarget.style.color = '#56567a'}
              >
                Clear
              </button>
            )}

            {/* Expand / Collapse — desktop only */}
            {!isMobile && !minimized && (
              <button
                onClick={expanded ? handleCollapse : handleExpand}
                title={expanded ? 'Collapse' : 'Expand'}
                style={{
                  background: 'transparent', border: 'none',
                  color: '#56567a', fontSize: 16, cursor: 'pointer',
                  padding: '4px 6px', lineHeight: 1, borderRadius: 4,
                  transition: 'color 0.12s',
                }}
                onMouseEnter={e => e.currentTarget.style.color = '#9595b8'}
                onMouseLeave={e => e.currentTarget.style.color = '#56567a'}
              >
                {expanded ? '⤡' : '⤢'}
              </button>
            )}

            {/* Minimize — desktop only */}
            {!isMobile && (
              <button
                onClick={() => setMinimized(v => !v)}
                title={minimized ? 'Expand' : 'Minimize'}
                style={{
                  background: 'transparent', border: 'none',
                  color: '#56567a', fontSize: 16, cursor: 'pointer',
                  padding: '4px 6px', lineHeight: 1, borderRadius: 4,
                  transition: 'color 0.12s',
                }}
                onMouseEnter={e => e.currentTarget.style.color = '#9595b8'}
                onMouseLeave={e => e.currentTarget.style.color = '#56567a'}
              >
                —
              </button>
            )}

            {/* Close */}
            <button
              onClick={onClose}
              title="Close"
              style={{
                background: 'transparent', border: 'none',
                color: isMobile ? 'rgba(255,255,255,0.6)' : '#56567a',
                fontSize: isMobile ? 26 : 20,
                cursor: 'pointer',
                padding: '4px 6px', lineHeight: 1, borderRadius: 4,
                transition: 'color 0.12s',
              }}
              onMouseEnter={e => e.currentTarget.style.color = '#9595b8'}
              onMouseLeave={e => e.currentTarget.style.color = isMobile ? 'rgba(255,255,255,0.6)' : '#56567a'}
            >
              ×
            </button>
          </div>
        </div>

        {/* Messages */}
        {(isMobile || !minimized) && (
          <div
            className="gc-scroll"
            onScroll={handleScroll}
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '14px 16px',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
          >
            {messages.length === 0 && (
              <div style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                color: '#56567a',
                fontSize: 12,
                textAlign: 'center',
                padding: '40px 20px',
              }}>
                <div style={{
                  width: 44, height: 44, borderRadius: '50%',
                  background: '#7c6af711',
                  border: '1px solid #7c6af733',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 20, color: '#7c6af7', marginBottom: 4,
                }}>
                  ◈
                </div>
                <div style={{ color: '#9595b8', fontWeight: 500 }}>Ask the team anything</div>
                <div>Strategy, shows, press, legal — Dot will<br />route you to the right person.</div>
              </div>
            )}

            {messages.map((m, i) => {
              if (m.role === 'task_created') {
                return (
                  <div key={m.id || i} style={{ animation: 'fadeIn 0.2s ease' }}>
                    <TaskCreatedCard task={m.task} onNavigate={onNavigate} />
                  </div>
                )
              }

              if (m.role === 'idea_created') {
                return (
                  <div key={m.id || i} style={{ animation: 'fadeIn 0.2s ease' }}>
                    <IdeaCreatedCard idea={m.idea} onNavigate={onNavigate} />
                  </div>
                )
              }

              if (m.role === 'user') {
                return (
                  <div key={m.id || i} style={{ display: 'flex', justifyContent: 'flex-end', animation: 'fadeIn 0.15s ease' }}>
                    <div style={{
                      maxWidth: '80%',
                      background: '#7c6af722',
                      border: '1px solid #7c6af755',
                      borderRadius: '14px 14px 4px 14px',
                      padding: '9px 13px',
                      fontSize: 13,
                      color: '#e8e8f8',
                      lineHeight: 1.55,
                      whiteSpace: 'pre-wrap',
                    }}>
                      {m.text || m.content}
                    </div>
                  </div>
                )
              }

              if (m.role === 'assistant') {
                const memberColor = MEMBER_COLORS[m.member] || '#9595b8'
                const memberName = m.member
                  ? m.member.charAt(0).toUpperCase() + m.member.slice(1)
                  : null

                return (
                  <div key={m.id || i} style={{ display: 'flex', flexDirection: 'column', gap: 4, animation: 'fadeIn 0.15s ease' }}>
                    {memberName && (
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: 5,
                        fontSize: 11, color: '#56567a', paddingLeft: 2,
                        flexWrap: 'wrap',
                      }}>
                        <span style={{
                          width: 6, height: 6, borderRadius: '50%',
                          background: memberColor, display: 'inline-block', flexShrink: 0,
                        }} />
                        <span style={{ color: memberColor, fontWeight: 600 }}>{memberName}</span>
                        {m.scopedQuestion && (
                          <>
                            <span style={{ color: '#56567a' }}>•</span>
                            <span style={{ fontSize: 10, color: '#56567a', fontStyle: 'italic' }}>
                              {m.scopedQuestion}
                            </span>
                          </>
                        )}
                      </div>
                    )}
                    <div style={{
                      maxWidth: '88%',
                      background: '#242430',
                      border: `1px solid ${m.error ? '#f8717144' : '#363650'}`,
                      borderRadius: '14px 14px 14px 4px',
                      padding: '9px 13px',
                      fontSize: 13,
                      color: m.error ? '#f87171' : '#e8e8f8',
                      lineHeight: 1.55,
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
                )
              }

              if (m.role === 'handoff') {
                return (
                  <div key={m.id || i} style={{ display: 'flex', justifyContent: 'center', animation: 'fadeIn 0.2s ease' }}>
                    <HandoffCard from={m.from} to={m.to} note={m.note} />
                  </div>
                )
              }

              return null
            })}
            <div ref={bottomRef} />
          </div>
        )}

        {/* Input */}
        {(isMobile || !minimized) && (
          <div style={{
            borderTop: '1px solid #363650',
            padding: isMobile ? '10px 12px 20px' : '10px 12px',
            display: 'flex',
            gap: 8,
            flexShrink: 0,
            alignItems: 'flex-end',
          }}>
            <textarea
              ref={textareaRef}
              className="gc-input"
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder="Ask anything about the band, strategy, shows..."
              disabled={loading}
              rows={1}
              style={{
                flex: 1,
                background: '#1c1c24',
                border: '1px solid #363650',
                borderRadius: 10,
                color: '#e8e8f8',
                padding: '9px 12px',
                fontSize: 13,
                resize: 'none',
                fontFamily: 'inherit',
                lineHeight: '20px',
                overflowY: 'hidden',
                transition: 'border-color 0.15s',
                minHeight: 38,
              }}
            />
            <button
              onClick={send}
              disabled={loading || !input.trim()}
              style={{
                background: loading || !input.trim() ? '#363650' : '#7c6af7',
                border: 'none',
                borderRadius: 10,
                color: loading || !input.trim() ? '#56567a' : '#fff',
                width: 38,
                height: 38,
                fontSize: 16,
                cursor: loading || !input.trim() ? 'default' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                transition: 'background 0.15s, color 0.15s',
              }}
            >
              ↑
            </button>
          </div>
        )}
      </div>
    </>
  )
}
