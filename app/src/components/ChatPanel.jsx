import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { api } from '../api'

const mdComponents = {
  p:      ({ children }) => <p style={{ margin: '0 0 8px', lineHeight: 1.6 }}>{children}</p>,
  h1:     ({ children }) => <h1 style={{ fontSize: 17, fontWeight: 700, margin: '12px 0 6px', color: '#e8e8f8' }}>{children}</h1>,
  h2:     ({ children }) => <h2 style={{ fontSize: 15, fontWeight: 700, margin: '10px 0 5px', color: '#e8e8f8' }}>{children}</h2>,
  h3:     ({ children }) => <h3 style={{ fontSize: 14, fontWeight: 600, margin: '8px 0 4px', color: '#e8e8f8' }}>{children}</h3>,
  ul:     ({ children }) => <ul style={{ margin: '4px 0 8px', paddingLeft: 20 }}>{children}</ul>,
  ol:     ({ children }) => <ol style={{ margin: '4px 0 8px', paddingLeft: 20 }}>{children}</ol>,
  li:     ({ children }) => <li style={{ margin: '2px 0', lineHeight: 1.55 }}>{children}</li>,
  strong: ({ children }) => <strong style={{ fontWeight: 700, color: '#e8e8f8' }}>{children}</strong>,
  em:     ({ children }) => <em style={{ fontStyle: 'italic', color: '#c8c8e8' }}>{children}</em>,
  code:   ({ inline, children }) => inline
    ? <code style={{ background: '#363650', borderRadius: 4, padding: '1px 5px', fontSize: 12.5, fontFamily: 'monospace', color: '#a89fff' }}>{children}</code>
    : <code>{children}</code>,
  pre:    ({ children }) => (
    <pre style={{
      background: '#1c1c24', border: '1px solid #363650', borderRadius: 8,
      padding: '10px 14px', overflowX: 'auto', margin: '6px 0 10px',
      fontSize: 12.5, lineHeight: 1.6, fontFamily: 'monospace',
    }}>{children}</pre>
  ),
  blockquote: ({ children }) => (
    <blockquote style={{
      borderLeft: '3px solid #7c6af7', paddingLeft: 12, margin: '6px 0',
      color: '#9595b8', fontStyle: 'italic',
    }}>{children}</blockquote>
  ),
  hr: () => <hr style={{ border: 'none', borderTop: '1px solid #363650', margin: '10px 0' }} />,
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" style={{ color: '#a89fff', textDecoration: 'underline' }}>{children}</a>
  ),
  table: ({ children }) => (
    <div style={{ overflowX: 'auto', margin: '6px 0 10px' }}>
      <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th style={{ borderBottom: '1px solid #363650', padding: '5px 10px', textAlign: 'left', color: '#e8e8f8', fontWeight: 600 }}>{children}</th>
  ),
  td: ({ children }) => (
    <td style={{ borderBottom: '1px solid #2c2c3a', padding: '5px 10px', color: '#9595b8' }}>{children}</td>
  ),
}

export default function ChatPanel({ member, onClose }) {
  const [messages, setMessages]   = useState([])
  const [input,    setInput]      = useState('')
  const [loading,  setLoading]    = useState(false)
  const bottomRef                 = useRef(null)
  const inputRef                  = useRef(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const send = async () => {
    const text = input.trim()
    if (!text || loading) return
    setInput('')
    setLoading(true)

    const userMsg = { role: 'user', content: text }
    const history = messages.map(m => ({ role: m.role, content: m.content }))
    setMessages(prev => [...prev, userMsg, { role: 'assistant', content: '', streaming: true }])

    try {
      const res = await api.chatStream(member.id, text, history)
      if (!res.ok) throw new Error('Chat request failed')

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let assistantText = ''
      let streamDone = false

      while (!streamDone) {
        const { value, done } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value, { stream: true })
        for (const line of chunk.split('\n')) {
          if (!line.startsWith('data: ')) continue
          const payload = line.slice(6).trim()
          if (payload === '[DONE]') { streamDone = true; break }
          try {
            const data = JSON.parse(payload)
            if (data.text) {
              assistantText += data.text
              setMessages(prev => {
                const updated = [...prev]
                updated[updated.length - 1] = { role: 'assistant', content: assistantText, streaming: true }
                return updated
              })
            }
          } catch {}
        }
      }

      // Mark streaming done
      setMessages(prev => {
        const updated = [...prev]
        updated[updated.length - 1] = { role: 'assistant', content: assistantText }
        return updated
      })
    } catch (err) {
      setMessages(prev => {
        const updated = [...prev]
        updated[updated.length - 1] = {
          role: 'assistant',
          content: err.message.includes('ANTHROPIC_API_KEY')
            ? 'API key not configured. Add ANTHROPIC_API_KEY to the .env file and restart the server.'
            : 'Something went wrong. Check that the API server is running.',
          error: true,
        }
        return updated
      })
    } finally {
      setLoading(false)
      inputRef.current?.focus()
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(0,0,0,0.75)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 200,
    }} onClick={onClose}>
      <div style={{
        background: '#242430', border: '1px solid #363650',
        borderRadius: 16, width: 640, maxWidth: '95vw',
        height: '80vh', maxHeight: 700,
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
      }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 14,
          padding: '18px 22px', borderBottom: '1px solid #363650', flexShrink: 0,
        }}>
          <Avatar member={member} size={44} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#e8e8f8' }}>{member.name}</div>
            <div style={{ fontSize: 12, color: '#9595b8', marginTop: 1 }}>{member.title}</div>
          </div>
          <button onClick={onClose} style={{
            background: 'transparent', border: 'none',
            color: '#56567a', fontSize: 22, cursor: 'pointer', lineHeight: 1, padding: 4,
          }}>×</button>
        </div>

        {/* Messages */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {messages.length === 0 && (
            <div style={{
              flex: 1, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', gap: 10,
              color: '#56567a', fontSize: 13, textAlign: 'center',
            }}>
              <div style={{ fontSize: 28 }}>💬</div>
              <div>Ask {member.name} anything about {member.area}.</div>
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} style={{
              display: 'flex',
              flexDirection: m.role === 'user' ? 'row-reverse' : 'row',
              gap: 10, alignItems: 'flex-start',
            }}>
              {m.role === 'assistant' && <Avatar member={member} size={30} />}
              <div style={{
                maxWidth: '78%',
                background: m.role === 'user' ? '#7c6af7' : '#2c2c3a',
                border: m.role === 'assistant' ? '1px solid #363650' : 'none',
                borderRadius: m.role === 'user' ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                padding: '10px 14px',
                fontSize: 14, lineHeight: 1.55,
                color: m.error ? '#f87171' : '#e8e8f8',
              }}>
                {m.role === 'user' ? (
                  <span style={{ whiteSpace: 'pre-wrap' }}>{m.content}</span>
                ) : (
                  <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
                    {m.content}
                  </ReactMarkdown>
                )}
                {m.streaming && <span style={{ opacity: 0.5 }}>▋</span>}
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div style={{
          borderTop: '1px solid #363650', padding: '14px 18px',
          display: 'flex', gap: 10, flexShrink: 0,
        }}>
          <input
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
            placeholder={`Ask ${member.name}…`}
            disabled={loading}
            style={{
              flex: 1, background: '#1c1c24',
              border: '1px solid #363650', borderRadius: 10,
              color: '#e8e8f8', padding: '10px 14px',
              fontSize: 14, outline: 'none',
            }}
          />
          <button
            onClick={send}
            disabled={loading || !input.trim()}
            style={{
              background: loading || !input.trim() ? '#363650' : '#7c6af7',
              border: 'none', borderRadius: 10,
              color: loading || !input.trim() ? '#56567a' : '#fff',
              width: 44, fontSize: 18, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}
          >↑</button>
        </div>
      </div>
    </div>
  )
}

function Avatar({ member, size }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: `${member.color}22`,
      border: `2px solid ${member.color}44`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.38, fontWeight: 700, color: member.color,
      letterSpacing: '-0.02em',
    }}>
      {member.initials}
    </div>
  )
}
