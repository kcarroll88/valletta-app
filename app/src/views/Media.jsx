import { useState, useEffect, useRef, useCallback } from 'react'
import useIsMobile from '../hooks/useIsMobile'

// ─── Helpers ────────────────────────────────────────────────────────────────

const token = () => localStorage.getItem('vlt_token')

const mediaFetch = (path, opts = {}) =>
  fetch('/api' + path, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token()}`,
      ...(opts.headers || {}),
    },
  })

function formatDate(dateStr) {
  if (!dateStr) return ''
  try {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  } catch {
    return dateStr
  }
}

function publicationGradient(publication) {
  const gradients = [
    'linear-gradient(135deg, #667eea, #764ba2)',
    'linear-gradient(135deg, #f093fb, #f5576c)',
    'linear-gradient(135deg, #4facfe, #00f2fe)',
    'linear-gradient(135deg, #43e97b, #38f9d7)',
    'linear-gradient(135deg, #fa709a, #fee140)',
    'linear-gradient(135deg, #a18cd1, #fbc2eb)',
    'linear-gradient(135deg, #fccb90, #d57eeb)',
  ]
  const idx = (publication || 'x').charCodeAt(0) % gradients.length
  return gradients[idx]
}

// ─── Skeleton Card ───────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.04)',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 14,
      overflow: 'hidden',
    }}>
      <div style={{ height: 180, background: 'rgba(255,255,255,0.06)' }} />
      <div style={{ padding: '14px 16px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ height: 10, width: '40%', background: 'rgba(255,255,255,0.07)', borderRadius: 4 }} />
        <div style={{ height: 14, width: '90%', background: 'rgba(255,255,255,0.07)', borderRadius: 4 }} />
        <div style={{ height: 14, width: '70%', background: 'rgba(255,255,255,0.07)', borderRadius: 4 }} />
        <div style={{ height: 11, width: '95%', background: 'rgba(255,255,255,0.05)', borderRadius: 4 }} />
        <div style={{ height: 11, width: '80%', background: 'rgba(255,255,255,0.05)', borderRadius: 4 }} />
      </div>
    </div>
  )
}

// ─── Article Card ────────────────────────────────────────────────────────────

function ArticleCard({ article, onDelete }) {
  const [hovered, setHovered]           = useState(false)
  const [deleteHovered, setDeleteHovered] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [yesHovered, setYesHovered]     = useState(false)
  const [noHovered, setNoHovered]       = useState(false)

  const handleDeleteClick = () => setConfirmDelete(true)
  const handleNo          = () => setConfirmDelete(false)
  const handleYes         = () => onDelete(article.id)

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); setDeleteHovered(false) }}
      style={{
        background: 'rgba(255,255,255,0.05)',
        border: `1px solid ${hovered ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.08)'}`,
        borderRadius: 14,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        transform: hovered ? 'translateY(-2px)' : 'translateY(0)',
        transition: 'transform 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease',
        boxShadow: hovered ? '0 8px 28px rgba(0,0,0,0.35)' : '0 2px 8px rgba(0,0,0,0.20)',
      }}
    >
      {/* Image / Placeholder */}
      {article.image_url ? (
        <img
          src={article.image_url}
          alt={article.title || ''}
          style={{
            width: '100%',
            height: 180,
            objectFit: 'cover',
            borderRadius: '14px 14px 0 0',
            display: 'block',
          }}
          onError={e => { e.currentTarget.style.display = 'none' }}
        />
      ) : (
        <div style={{
          width: '100%',
          height: 180,
          background: publicationGradient(article.publication),
          borderRadius: '14px 14px 0 0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column',
          gap: 4,
        }}>
          <span style={{ fontSize: 42, fontWeight: 700, color: 'rgba(255,255,255,0.55)', letterSpacing: '-2px', userSelect: 'none' }}>
            {(article.publication || '?').charAt(0).toUpperCase()}
          </span>
          {article.publication && (
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.50)', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', maxWidth: 180, textAlign: 'center', padding: '0 12px' }}>
              {article.publication}
            </span>
          )}
        </div>
      )}

      {/* Body */}
      <div style={{ padding: '14px 16px 14px', display: 'flex', flexDirection: 'column', flex: 1, gap: 6 }}>
        {/* Publication + Date */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          {article.publication && (
            <span style={{ fontSize: 11, fontWeight: 700, color: '#7c6af7', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              {article.publication}
            </span>
          )}
          {article.publication && article.published_date && (
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.30)' }}>•</span>
          )}
          {article.published_date && (
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.38)' }}>
              {formatDate(article.published_date)}
            </span>
          )}
        </div>

        {/* Title */}
        {article.title && (
          <div style={{
            fontSize: 15,
            fontWeight: 700,
            color: '#fff',
            lineHeight: '1.35',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}>
            {article.title}
          </div>
        )}

        {/* Summary */}
        {article.summary && (
          <div style={{
            fontSize: 13,
            color: 'rgba(255,255,255,0.60)',
            lineHeight: '1.5',
            display: '-webkit-box',
            WebkitLineClamp: 3,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
            flex: 1,
          }}>
            {article.summary}
          </div>
        )}

        {/* Author */}
        {article.author && (
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.38)', marginTop: 2 }}>
            By {article.author}
          </div>
        )}

        {/* Footer row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 6, gap: 8 }}>
          <a
            href={article.url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              fontSize: 13,
              color: '#a89fff',
              textDecoration: 'none',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              fontWeight: 500,
              transition: 'color 0.12s',
            }}
            onMouseEnter={e => e.currentTarget.style.color = '#c4b5fd'}
            onMouseLeave={e => e.currentTarget.style.color = '#a89fff'}
          >
            ↗ Read article
          </a>

          {/* Delete / Confirm */}
          {confirmDelete ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'rgba(255,255,255,0.65)' }}>
              <span>Sure?</span>
              <button
                onMouseEnter={() => setYesHovered(true)}
                onMouseLeave={() => setYesHovered(false)}
                onClick={handleYes}
                style={{
                  background: yesHovered ? 'rgba(239,68,68,0.25)' : 'rgba(239,68,68,0.12)',
                  border: '1px solid rgba(239,68,68,0.35)',
                  borderRadius: 5,
                  color: '#f87171',
                  fontSize: 12,
                  padding: '2px 8px',
                  cursor: 'pointer',
                  transition: 'background 0.12s',
                }}
              >
                Yes
              </button>
              <button
                onMouseEnter={() => setNoHovered(true)}
                onMouseLeave={() => setNoHovered(false)}
                onClick={handleNo}
                style={{
                  background: noHovered ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.14)',
                  borderRadius: 5,
                  color: 'rgba(255,255,255,0.55)',
                  fontSize: 12,
                  padding: '2px 8px',
                  cursor: 'pointer',
                  transition: 'background 0.12s',
                }}
              >
                No
              </button>
            </div>
          ) : (
            <button
              onMouseEnter={() => setDeleteHovered(true)}
              onMouseLeave={() => setDeleteHovered(false)}
              onClick={handleDeleteClick}
              style={{
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                fontSize: 15,
                color: deleteHovered ? '#f87171' : 'rgba(255,255,255,0.28)',
                opacity: hovered ? 1 : 0,
                transition: 'color 0.12s, opacity 0.15s',
                padding: '2px 4px',
                lineHeight: 1,
              }}
              title="Delete article"
            >
              🗑
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function Media() {
  const isMobile = useIsMobile()

  const [articles, setArticles]     = useState([])
  const [loading, setLoading]       = useState(true)
  const [urlInput, setUrlInput]     = useState('')
  const [adding, setAdding]         = useState(false)
  const [addError, setAddError]     = useState('')
  const [search, setSearch]         = useState('')
  const [sort, setSort]             = useState('newest')
  const debounceRef                 = useRef(null)

  // ── Fetch articles ──────────────────────────────────────────────────────

  const fetchArticles = useCallback(async (q = search, s = sort) => {
    try {
      const params = new URLSearchParams()
      if (q)  params.set('search', q)
      if (s)  params.set('sort', s)
      const res = await mediaFetch('/media/articles?' + params.toString())
      if (res.ok) {
        const data = await res.json()
        setArticles(data)
      }
    } catch {
      // silently ignore network errors on fetch
    } finally {
      setLoading(false)
    }
  }, [search, sort])

  useEffect(() => {
    fetchArticles(search, sort)
  }, [sort]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Search debounce ─────────────────────────────────────────────────────

  const handleSearchChange = (val) => {
    setSearch(val)
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setLoading(true)
      fetchArticles(val, sort)
    }, 300)
  }

  // ── Add article ─────────────────────────────────────────────────────────

  const handleAdd = async () => {
    const url = urlInput.trim()
    if (!url) return
    setAdding(true)
    setAddError('')
    try {
      const res = await mediaFetch('/media/articles', {
        method: 'POST',
        body: JSON.stringify({ url }),
      })
      if (res.ok) {
        const article = await res.json()
        setArticles(prev => [article, ...prev])
        setUrlInput('')
      } else if (res.status === 409) {
        setAddError('Already saved')
      } else {
        const body = await res.text()
        setAddError(body || 'Failed to add article')
      }
    } catch {
      setAddError('Network error — please try again')
    } finally {
      setAdding(false)
    }
  }

  const handleUrlKeyDown = (e) => {
    if (e.key === 'Enter') handleAdd()
  }

  // ── Delete article ──────────────────────────────────────────────────────

  const handleDelete = async (id) => {
    try {
      const res = await mediaFetch(`/media/articles/${id}`, { method: 'DELETE' })
      if (res.ok || res.status === 204) {
        setArticles(prev => prev.filter(a => a.id !== id))
      }
    } catch {
      // silently ignore
    }
  }

  // ─── Render ──────────────────────────────────────────────────────────────

  const hasSearch = search.trim().length > 0

  return (
    <div style={{ padding: isMobile ? '24px 16px' : '36px 40px', maxWidth: 1200, margin: '0 auto' }}>

      {/* ── Page Header ── */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: isMobile ? 24 : 28, fontWeight: 700, color: '#fff', margin: 0, letterSpacing: '-0.5px' }}>
          Press &amp; Media
        </h1>
        <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.38)', marginTop: 4 }}>
          {loading ? 'Loading…' : `${articles.length} article${articles.length !== 1 ? 's' : ''}`}
        </div>
      </div>

      {/* ── Add Article Bar ── */}
      <div style={{ marginBottom: 20 }}>
        <div style={{
          display: 'flex',
          gap: 10,
          flexDirection: isMobile ? 'column' : 'row',
        }}>
          <input
            type="url"
            value={urlInput}
            onChange={e => { setUrlInput(e.target.value); setAddError('') }}
            onKeyDown={handleUrlKeyDown}
            placeholder="Paste article URL…"
            style={{
              flex: 1,
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 10,
              color: '#fff',
              fontSize: 14,
              padding: '10px 14px',
              outline: 'none',
              transition: 'border-color 0.15s',
            }}
            onFocus={e => e.target.style.borderColor = 'rgba(124,106,247,0.55)'}
            onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.12)'}
          />
          <button
            onClick={handleAdd}
            disabled={adding || !urlInput.trim()}
            style={{
              background: adding || !urlInput.trim() ? 'rgba(124,106,247,0.40)' : '#7c6af7',
              border: 'none',
              borderRadius: 10,
              color: '#fff',
              fontSize: 14,
              fontWeight: 600,
              padding: '10px 22px',
              cursor: adding || !urlInput.trim() ? 'not-allowed' : 'pointer',
              transition: 'background 0.15s',
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
            onMouseEnter={e => { if (!adding && urlInput.trim()) e.currentTarget.style.background = '#9080ff' }}
            onMouseLeave={e => { if (!adding && urlInput.trim()) e.currentTarget.style.background = '#7c6af7' }}
          >
            {adding ? 'Adding…' : 'Add'}
          </button>
        </div>

        {/* Inline error / duplicate message */}
        {addError && (
          <div style={{
            marginTop: 8,
            fontSize: 13,
            color: addError === 'Already saved' ? '#facc15' : '#f87171',
            paddingLeft: 2,
          }}>
            {addError}
          </div>
        )}
      </div>

      {/* ── Search + Sort Row ── */}
      <div style={{
        display: 'flex',
        gap: 10,
        marginBottom: 28,
        flexWrap: 'wrap',
        alignItems: 'center',
      }}>
        {/* Search */}
        <div style={{ position: 'relative', flex: 1, minWidth: 180 }}>
          <span style={{
            position: 'absolute',
            left: 11,
            top: '50%',
            transform: 'translateY(-50%)',
            color: 'rgba(255,255,255,0.35)',
            fontSize: 14,
            pointerEvents: 'none',
          }}>
            🔍
          </span>
          <input
            type="text"
            value={search}
            onChange={e => handleSearchChange(e.target.value)}
            placeholder="Search articles…"
            style={{
              width: '100%',
              boxSizing: 'border-box',
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.10)',
              borderRadius: 10,
              color: '#fff',
              fontSize: 14,
              padding: '9px 34px 9px 34px',
              outline: 'none',
              transition: 'border-color 0.15s',
            }}
            onFocus={e => e.target.style.borderColor = 'rgba(124,106,247,0.55)'}
            onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.10)'}
          />
          {hasSearch && (
            <button
              onClick={() => handleSearchChange('')}
              style={{
                position: 'absolute',
                right: 10,
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'none',
                border: 'none',
                color: 'rgba(255,255,255,0.40)',
                cursor: 'pointer',
                fontSize: 14,
                padding: 0,
                lineHeight: 1,
              }}
            >
              ×
            </button>
          )}
        </div>

        {/* Sort pills */}
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          {[{ val: 'newest', label: 'Newest first' }, { val: 'oldest', label: 'Oldest first' }].map(opt => (
            <button
              key={opt.val}
              onClick={() => { setSort(opt.val); setLoading(true); fetchArticles(search, opt.val) }}
              style={{
                background: sort === opt.val ? 'rgba(124,106,247,0.22)' : 'rgba(255,255,255,0.06)',
                border: `1px solid ${sort === opt.val ? 'rgba(124,106,247,0.50)' : 'rgba(255,255,255,0.10)'}`,
                borderRadius: 8,
                color: sort === opt.val ? '#c4b5fd' : 'rgba(255,255,255,0.50)',
                fontSize: 13,
                fontWeight: sort === opt.val ? 600 : 400,
                padding: '8px 14px',
                cursor: 'pointer',
                transition: 'all 0.15s',
                whiteSpace: 'nowrap',
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Content ── */}
      {loading ? (
        <div style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(320px, 1fr))',
          gap: 20,
        }}>
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : articles.length === 0 ? (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '80px 20px',
          textAlign: 'center',
          gap: 12,
        }}>
          <div style={{ fontSize: 48, opacity: 0.35 }}>📰</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: 'rgba(255,255,255,0.55)' }}>
            {hasSearch ? 'No articles match your search.' : 'No press coverage yet.'}
          </div>
          {!hasSearch && (
            <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.30)', maxWidth: 360 }}>
              Drop an article URL above to add your first clipping.
            </div>
          )}
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(320px, 1fr))',
          gap: 20,
        }}>
          {articles.map(article => (
            <ArticleCard
              key={article.id}
              article={article}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}
    </div>
  )
}
