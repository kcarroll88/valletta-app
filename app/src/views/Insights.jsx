import { useEffect, useState } from 'react'
import { api } from '../api'
import useIsMobile from '../hooks/useIsMobile'

const GLASS_CARD = {
  background: 'rgba(255,255,255,0.03)',
  backdropFilter: 'blur(12px)',
  WebkitBackdropFilter: 'blur(12px)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 12,
  padding: '20px 24px',
  boxShadow: '0 4px 24px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.06)',
}

const PLATFORM_CONFIG = {
  spotify: {
    label: 'Spotify',
    icon: '♫',
    accent: '#1db954',
    hint: 'Get credentials at developer.spotify.com',
    fields: [
      { key: 'artist_name', label: 'Artist Name', type: 'text' },
      { key: 'client_id',   label: 'Client ID',   type: 'text' },
      { key: 'client_secret', label: 'Client Secret', type: 'password' },
    ],
  },
  instagram: {
    label: 'Instagram',
    icon: '📷',
    accent: '#E1306C',
    hint: 'Connects via Instagram OAuth',
  },
  youtube: {
    label: 'YouTube',
    icon: '▶',
    accent: '#ff0000',
    hint: 'Get API key at console.cloud.google.com',
    fields: [
      { key: 'artist_name', label: 'Artist / Channel Name', type: 'text' },
      { key: 'api_key',     label: 'API Key',               type: 'text' },
    ],
  },
}

const PLATFORMS = ['spotify', 'instagram', 'youtube']

// ─── Helper ──────────────────────────────────────────────────────────────────

function fmt(n) {
  if (n == null) return '—'
  return Number(n).toLocaleString()
}

// ─── Connection Modal ─────────────────────────────────────────────────────────

function ConnectModal({ platform, onClose, onSuccess }) {
  const cfg = PLATFORM_CONFIG[platform]
  const [values, setValues]   = useState({})
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState(null)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      await api.insightsConnect({ platform, ...values })
      onSuccess()
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.65)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        ...GLASS_CARD,
        width: 420,
        padding: '28px 32px',
        border: `1px solid ${cfg.accent}33`,
        boxShadow: `0 8px 40px rgba(0,0,0,0.5), 0 0 0 1px ${cfg.accent}22`,
      }}>
        {/* Modal header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 22, color: cfg.accent }}>{cfg.icon}</span>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>Connect {cfg.label}</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 2 }}>{cfg.hint}</div>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: 'none', color: 'rgba(255,255,255,0.35)',
              fontSize: 18, cursor: 'pointer', padding: '4px 8px', borderRadius: 6,
              transition: 'color 150ms',
            }}
            onMouseEnter={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.75)' }}
            onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.35)' }}
          >✕</button>
        </div>

        <form onSubmit={handleSubmit}>
          {cfg.fields.map(field => (
            <div key={field.key} style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.45)', marginBottom: 6 }}>
                {field.label}
              </label>
              <input
                type={field.type}
                value={values[field.key] || ''}
                onChange={e => setValues(v => ({ ...v, [field.key]: e.target.value }))}
                required
                style={{
                  width: '100%',
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.12)',
                  borderRadius: 8,
                  padding: '9px 14px',
                  fontSize: 13,
                  color: '#fff',
                  outline: 'none',
                  boxSizing: 'border-box',
                  transition: 'border-color 150ms',
                }}
                onFocus={e => { e.currentTarget.style.borderColor = cfg.accent + '88' }}
                onBlur={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)' }}
              />
            </div>
          ))}

          {error && (
            <div style={{
              fontSize: 12, color: '#fca5a5',
              background: 'rgba(248,113,113,0.08)',
              border: '1px solid rgba(248,113,113,0.20)',
              borderRadius: 6, padding: '8px 12px', marginBottom: 16,
            }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '8px 18px', fontSize: 13, fontWeight: 500,
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.10)',
                borderRadius: 8, color: 'rgba(255,255,255,0.60)',
                cursor: 'pointer', transition: 'all 150ms',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.10)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)' }}
            >Cancel</button>
            <button
              type="submit"
              disabled={loading}
              style={{
                padding: '8px 18px', fontSize: 13, fontWeight: 600,
                background: loading ? `${cfg.accent}55` : cfg.accent,
                border: 'none',
                borderRadius: 8, color: '#fff',
                cursor: loading ? 'default' : 'pointer',
                opacity: loading ? 0.8 : 1,
                transition: 'all 150ms',
              }}
            >{loading ? 'Connecting…' : 'Connect'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Platform Card ────────────────────────────────────────────────────────────

function PlatformCard({ platform, data, ytAccount, igAccount, onConnect, onDisconnect }) {
  const cfg    = PLATFORM_CONFIG[platform]
  // For YouTube, treat connected if ytAccount has subscriber data
  // For Instagram, treat connected if igAccount has followers data or data.connected
  const isConn = platform === 'youtube'
    ? (!!data?.connected || (ytAccount && ytAccount.subscribers != null))
    : platform === 'instagram'
      ? (!!data?.connected || (igAccount && igAccount.followers != null))
      : !!data?.connected
  const [disconnecting, setDisconnecting] = useState(false)

  const handleDisconnect = async () => {
    setDisconnecting(true)
    try {
      await onDisconnect(platform)
    } finally {
      setDisconnecting(false)
    }
  }

  const renderMetrics = () => {
    if (!data) return null
    if (platform === 'spotify') {
      return (
        <>
          <div style={{ fontSize: 36, fontWeight: 700, color: '#fff', letterSpacing: '-0.02em', lineHeight: 1.1 }}>
            {fmt(data.followers)}
          </div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.40)', marginTop: 4, marginBottom: 12 }}>followers</div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {data.popularity != null && (
              <span style={{
                fontSize: 11, fontWeight: 600, padding: '3px 10px',
                borderRadius: 20, background: `${cfg.accent}22`,
                color: cfg.accent, border: `1px solid ${cfg.accent}44`,
              }}>
                Popularity {data.popularity}
              </span>
            )}
            {data.name && (
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>{data.name}</span>
            )}
          </div>
          {data.spotify_url && (
            <a href={data.spotify_url} target="_blank" rel="noopener noreferrer" style={{
              display: 'inline-block', marginTop: 10,
              fontSize: 11, color: cfg.accent, textDecoration: 'none', opacity: 0.75,
              transition: 'opacity 150ms',
            }}
              onMouseEnter={e => { e.currentTarget.style.opacity = 1 }}
              onMouseLeave={e => { e.currentTarget.style.opacity = 0.75 }}
            >↗ Open on Spotify</a>
          )}
        </>
      )
    }
    if (platform === 'instagram') {
      const ig = (igAccount && igAccount.followers != null) ? igAccount : data
      const followers   = ig?.followers
      const mediaCount  = ig?.media_count
      const username    = ig?.username
      return (
        <>
          <div style={{ fontSize: 36, fontWeight: 700, color: '#fff', letterSpacing: '-0.02em', lineHeight: 1.1 }}>
            {fmt(followers)}
          </div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.40)', marginTop: 4, marginBottom: 12 }}>followers</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {mediaCount != null && (
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)' }}>
                <span style={{ color: 'rgba(255,255,255,0.30)' }}>Posts: </span>
                {fmt(mediaCount)}
              </div>
            )}
            {username && (
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.40)', marginTop: 2 }}>
                @{username}
              </div>
            )}
          </div>
        </>
      )
    }
    if (platform === 'youtube') {
      // Prefer live ytAccount data from integration_metrics; fall back to legacy data
      const yt = (ytAccount && ytAccount.subscribers != null) ? ytAccount : data
      const subscribers  = yt?.subscribers  ?? yt?.subscribers
      const totalViews   = yt?.total_views  ?? yt?.views
      const videoCount   = yt?.video_count  ?? yt?.videos
      const channelTitle = yt?.channel_title
      return (
        <>
          <div style={{ fontSize: 36, fontWeight: 700, color: '#fff', letterSpacing: '-0.02em', lineHeight: 1.1 }}>
            {fmt(subscribers)}
          </div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.40)', marginTop: 4, marginBottom: 12 }}>subscribers</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {totalViews != null && (
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)' }}>
                <span style={{ color: 'rgba(255,255,255,0.30)' }}>Views: </span>
                {fmt(totalViews)}
              </div>
            )}
            {videoCount != null && (
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)' }}>
                <span style={{ color: 'rgba(255,255,255,0.30)' }}>Videos: </span>
                {fmt(videoCount)}
              </div>
            )}
            {channelTitle && (
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.40)', marginTop: 2 }}>
                {channelTitle}
              </div>
            )}
          </div>
          {data?.channel_url && (
            <a href={data.channel_url} target="_blank" rel="noopener noreferrer" style={{
              display: 'inline-block', marginTop: 10,
              fontSize: 11, color: cfg.accent, textDecoration: 'none', opacity: 0.75,
              transition: 'opacity 150ms',
            }}
              onMouseEnter={e => { e.currentTarget.style.opacity = 1 }}
              onMouseLeave={e => { e.currentTarget.style.opacity = 0.75 }}
            >↗ Open on YouTube</a>
          )}
        </>
      )
    }
    return null
  }

  return (
    <div style={{
      ...GLASS_CARD,
      border: isConn
        ? `1px solid ${cfg.accent}33`
        : '1px solid rgba(255,255,255,0.08)',
      boxShadow: isConn
        ? `0 4px 24px rgba(0,0,0,0.2), 0 0 0 1px ${cfg.accent}18, inset 0 1px 0 rgba(255,255,255,0.06)`
        : '0 4px 24px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.06)',
      display: 'flex', flexDirection: 'column',
    }}>
      {/* Card header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 8,
            background: `${cfg.accent}18`,
            border: `1px solid ${cfg.accent}33`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 18, color: cfg.accent,
          }}>
            {cfg.icon}
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>{cfg.label}</div>
            {data?.synced_at && (
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.30)', marginTop: 1 }}>
                Synced {new Date(data.synced_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </div>
            )}
          </div>
        </div>
        {/* Status dot */}
        <div style={{
          width: 8, height: 8, borderRadius: '50%',
          background: isConn ? '#4ade80' : 'rgba(255,255,255,0.25)',
          boxShadow: isConn ? '0 0 6px #4ade8088' : 'none',
        }} />
      </div>

      {/* Body */}
      <div style={{ flex: 1, minHeight: 90 }}>
        {isConn ? renderMetrics() : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 14 }}>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.35)', lineHeight: 1.5 }}>
              Not connected
            </div>
            <button
              onClick={async () => {
                if (platform === 'instagram') {
                  try {
                    const res = await api.instagramAuthStart()
                    if (res?.url) window.location.href = res.url
                  } catch (err) {
                    console.error('Instagram OAuth start failed:', err)
                  }
                } else {
                  onConnect(platform)
                }
              }}
              style={{
                padding: '8px 18px', fontSize: 12, fontWeight: 600,
                background: `${cfg.accent}22`,
                border: `1px solid ${cfg.accent}55`,
                borderRadius: 8, color: cfg.accent,
                cursor: 'pointer', transition: 'all 150ms',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = `${cfg.accent}38` }}
              onMouseLeave={e => { e.currentTarget.style.background = `${cfg.accent}22` }}
            >
              Connect {cfg.label}
            </button>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)' }}>{cfg.hint}</div>
          </div>
        )}
      </div>

      {/* Disconnect footer */}
      {isConn && (
        <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <button
            onClick={handleDisconnect}
            disabled={disconnecting}
            style={{
              fontSize: 11, fontWeight: 500,
              background: 'none', border: 'none', padding: 0,
              color: 'rgba(255,255,255,0.25)', cursor: disconnecting ? 'default' : 'pointer',
              transition: 'color 150ms',
            }}
            onMouseEnter={e => { if (!disconnecting) e.currentTarget.style.color = '#f87171' }}
            onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.25)' }}
          >
            {disconnecting ? 'Disconnecting…' : 'Disconnect'}
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Snapshot Table ───────────────────────────────────────────────────────────

function SnapshotTable({ snapshots }) {
  if (!snapshots || snapshots.length === 0) return null

  const thStyle = {
    fontSize: 11, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.35)', padding: '0 12px 12px 0', textAlign: 'left',
    borderBottom: '1px solid rgba(255,255,255,0.07)',
  }
  const tdStyle = {
    padding: '10px 12px 10px 0', fontSize: 12, color: 'rgba(255,255,255,0.70)',
    borderBottom: '1px solid rgba(255,255,255,0.04)',
  }

  return (
    <div style={{ ...GLASS_CARD, marginBottom: 24 }}>
      <div style={{
        fontSize: 11, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase',
        color: 'rgba(255,255,255,0.35)', marginBottom: 16,
      }}>Latest Snapshot</div>

      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={thStyle}>Platform</th>
            <th style={thStyle}>Metric</th>
            <th style={{ ...thStyle, textAlign: 'right', paddingRight: 0 }}>Value</th>
            <th style={{ ...thStyle, textAlign: 'right', paddingRight: 0 }}>Date</th>
          </tr>
        </thead>
        <tbody>
          {snapshots.map((row, i) => {
            const isEven = i % 2 === 0
            const cfg = PLATFORM_CONFIG[row.platform] || {}
            return (
              <tr
                key={i}
                style={{ background: isEven ? 'transparent' : 'rgba(255,255,255,0.015)' }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)' }}
                onMouseLeave={e => { e.currentTarget.style.background = isEven ? 'transparent' : 'rgba(255,255,255,0.015)' }}
              >
                <td style={tdStyle}>
                  <span style={{ color: cfg.accent || 'rgba(255,255,255,0.60)', fontWeight: 600 }}>
                    {cfg.icon} {cfg.label || row.platform}
                  </span>
                </td>
                <td style={{ ...tdStyle, color: 'rgba(255,255,255,0.50)', textTransform: 'capitalize' }}>
                  {row.metric}
                </td>
                <td style={{ ...tdStyle, textAlign: 'right', paddingRight: 0, fontWeight: 600, color: '#fff' }}>
                  {fmt(row.value)}
                </td>
                <td style={{ ...tdStyle, textAlign: 'right', paddingRight: 0, color: 'rgba(255,255,255,0.35)' }}>
                  {row.date ? new Date(row.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState({ onConnect }) {
  return (
    <div style={{
      ...GLASS_CARD,
      padding: '56px 32px',
      textAlign: 'center',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 20,
    }}>
      <div style={{ fontSize: 40, opacity: 0.25 }}>◈</div>
      <div>
        <div style={{ fontSize: 16, color: 'rgba(255,255,255,0.60)', fontWeight: 500, marginBottom: 8 }}>
          Connect your streaming platforms to track analytics
        </div>
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.30)' }}>
          Link Spotify, Instagram, and YouTube to see your audience metrics in one place.
        </div>
      </div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center', marginTop: 8 }}>
        {PLATFORMS.map(platform => {
          const cfg = PLATFORM_CONFIG[platform]
          return (
            <button
              key={platform}
              onClick={() => onConnect(platform)}
              style={{
                padding: '9px 20px', fontSize: 13, fontWeight: 600,
                background: `${cfg.accent}18`,
                border: `1px solid ${cfg.accent}44`,
                borderRadius: 8, color: cfg.accent,
                cursor: 'pointer', transition: 'all 150ms',
                display: 'flex', alignItems: 'center', gap: 8,
              }}
              onMouseEnter={e => { e.currentTarget.style.background = `${cfg.accent}30` }}
              onMouseLeave={e => { e.currentTarget.style.background = `${cfg.accent}18` }}
            >
              <span>{cfg.icon}</span> Connect {cfg.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ─── Recent Videos Section ────────────────────────────────────────────────────

function RecentVideos({ videos }) {
  if (!videos) return null

  if (videos.length === 0) {
    return (
      <div style={{ ...GLASS_CARD, marginBottom: 24 }}>
        <div style={{
          fontSize: 11, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase',
          color: 'rgba(255,255,255,0.35)', marginBottom: 16,
        }}>Recent Videos</div>
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.30)', padding: '12px 0' }}>
          No data yet — sync from Integrations
        </div>
      </div>
    )
  }

  const sorted = [...videos]
    .sort((a, b) => Number(b.views || 0) - Number(a.views || 0))
    .slice(0, 10)

  return (
    <div style={{ ...GLASS_CARD, marginBottom: 24 }}>
      <div style={{
        fontSize: 11, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase',
        color: 'rgba(255,255,255,0.35)', marginBottom: 16,
      }}>Recent Videos</div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {sorted.map((video, i) => {
          const title = video.title || 'Untitled'
          const truncated = title.length > 70 ? title.slice(0, 67) + '…' : title
          return (
            <div
              key={i}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '10px 14px',
                background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)',
                borderRadius: 8,
                transition: 'background 150ms',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)' }}
              onMouseLeave={e => { e.currentTarget.style.background = i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)' }}
            >
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.75)', flex: 1, minWidth: 0, marginRight: 16 }}>
                {truncated}
              </div>
              <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                {[
                  { label: 'Views',    value: video.views,    accent: '#ff0000' },
                  { label: 'Likes',    value: video.likes,    accent: '#a89fff' },
                  { label: 'Comments', value: video.comments, accent: 'rgba(255,255,255,0.40)' },
                ].map(stat => stat.value != null && (
                  <span
                    key={stat.label}
                    style={{
                      fontSize: 11, fontWeight: 600,
                      padding: '3px 9px',
                      borderRadius: 20,
                      background: `${stat.accent}18`,
                      color: stat.accent,
                      border: `1px solid ${stat.accent}44`,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    <span style={{ opacity: 0.6, fontWeight: 400, marginRight: 3, textTransform: 'uppercase', letterSpacing: '0.06em', fontSize: 9 }}>
                      {stat.label}
                    </span>
                    {fmt(stat.value)}
                  </span>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Recent Posts Section ─────────────────────────────────────────────────────

function RecentPosts({ posts }) {
  if (!posts || posts.length === 0) return null

  const sorted = [...posts]
    .sort((a, b) => Number(b.likes || 0) - Number(a.likes || 0))
    .slice(0, 10)

  const IG_ACCENT = '#E1306C'

  return (
    <div style={{ ...GLASS_CARD, marginBottom: 24 }}>
      <div style={{
        fontSize: 11, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase',
        color: 'rgba(255,255,255,0.35)', marginBottom: 16,
      }}>Recent Instagram Posts</div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {sorted.map((post, i) => (
          <div
            key={i}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '10px 14px',
              background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)',
              borderRadius: 8,
              transition: 'background 150ms',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)' }}
            onMouseLeave={e => { e.currentTarget.style.background = i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)' }}
          >
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', textTransform: 'capitalize' }}>
              {post.media_type ? post.media_type.toLowerCase().replace('_', ' ') : 'post'}
            </div>
            <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
              {[
                { label: 'Likes',    value: post.likes,    accent: IG_ACCENT },
                { label: 'Comments', value: post.comments, accent: 'rgba(255,255,255,0.40)' },
              ].map(stat => stat.value != null && (
                <span
                  key={stat.label}
                  style={{
                    fontSize: 11, fontWeight: 600,
                    padding: '3px 9px',
                    borderRadius: 20,
                    background: `${stat.accent}18`,
                    color: stat.accent,
                    border: `1px solid ${stat.accent}44`,
                    whiteSpace: 'nowrap',
                  }}
                >
                  <span style={{ opacity: 0.6, fontWeight: 400, marginRight: 3, textTransform: 'uppercase', letterSpacing: '0.06em', fontSize: 9 }}>
                    {stat.label}
                  </span>
                  {fmt(stat.value)}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Main Insights view ───────────────────────────────────────────────────────

export default function Insights({ onNavigate }) {
  const isMobile = useIsMobile()
  const [data,         setData]         = useState(null)
  const [loading,      setLoading]      = useState(true)
  const [syncing,      setSyncing]      = useState(false)
  const [error,        setError]        = useState(null)
  const [modal,        setModal]        = useState(null) // platform id or null
  const [ytAccount,    setYtAccount]    = useState(null)
  const [ytVideos,     setYtVideos]     = useState(null)
  const [igAccount,    setIgAccount]    = useState(null)
  const [igPosts,      setIgPosts]      = useState(null)

  const fetchInstagramData = () => {
    api.instagramMetrics('account')
      .then(res => {
        if (Array.isArray(res) && res.length > 0) {
          const record = res[res.length - 1]
          const d = typeof record.data === 'string' ? JSON.parse(record.data) : (record.data || record)
          setIgAccount({ ...d, synced_at: record.recorded_at || record.synced_at || null })
        } else if (res && !Array.isArray(res)) {
          setIgAccount(res)
        } else {
          setIgAccount({})
        }
      })
      .catch(() => setIgAccount({}))

    api.instagramMetrics('post')
      .then(res => {
        if (Array.isArray(res)) {
          const parsed = res.map(r => {
            const d = typeof r.data === 'string' ? JSON.parse(r.data) : (r.data || r)
            return d
          })
          setIgPosts(parsed)
        } else {
          setIgPosts([])
        }
      })
      .catch(() => setIgPosts([]))
  }

  const fetchYoutubeData = () => {
    api.youtubeMetrics('account')
      .then(res => {
        // res may be an array of records; take the most recent
        if (Array.isArray(res) && res.length > 0) {
          const record = res[res.length - 1]
          const d = typeof record.data === 'string' ? JSON.parse(record.data) : (record.data || record)
          setYtAccount({ ...d, synced_at: record.recorded_at || record.synced_at || null })
        } else if (res && !Array.isArray(res)) {
          setYtAccount(res)
        } else {
          setYtAccount({})
        }
      })
      .catch(() => setYtAccount({}))

    api.youtubeMetrics('post')
      .then(res => {
        if (Array.isArray(res)) {
          const parsed = res.map(r => {
            const d = typeof r.data === 'string' ? JSON.parse(r.data) : (r.data || r)
            return d
          })
          setYtVideos(parsed)
        } else {
          setYtVideos([])
        }
      })
      .catch(() => setYtVideos([]))
  }

  const fetchData = () => {
    setLoading(true)
    setError(null)
    api.insights()
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    // Handle OAuth callback redirect — clean up URL and refresh
    const params = new URLSearchParams(window.location.search)
    if (params.get('connected') === 'instagram') {
      const clean = window.location.pathname + window.location.hash
      window.history.replaceState({}, '', clean)
    }
    fetchData()
    fetchYoutubeData()
    fetchInstagramData()
  }, [])

  const handleSyncAll = () => {
    setSyncing(true)
    api.insightsSync()
      .then(() => {
        fetchYoutubeData()
        fetchInstagramData()
        return api.insights().then(setData)
      })
      .catch(e => setError(e.message))
      .finally(() => setSyncing(false))
  }

  const handleConnectSuccess = async () => {
    setModal(null)
    setSyncing(true)
    try {
      await api.insightsSync()
      const fresh = await api.insights()
      setData(fresh)
      fetchYoutubeData()
      fetchInstagramData()
    } catch (e) {
      setError(e.message)
    } finally {
      setSyncing(false)
    }
  }

  const handleDisconnect = async (platform) => {
    try {
      await api.insightsDisconnect(platform)
      fetchData()
    } catch (e) {
      setError(e.message)
    }
  }

  // Determine if any platform is connected
  const platformData = data?.platforms || {}
  const anyConnected = PLATFORMS.some(p => platformData[p]?.connected)
    || (igAccount && igAccount.followers != null)

  // Build snapshot rows from connected platforms
  const snapshots = []
  if (platformData.spotify?.connected) {
    const s = platformData.spotify
    if (s.followers != null)  snapshots.push({ platform: 'spotify', metric: 'followers', value: s.followers, date: s.synced_at })
    if (s.popularity != null) snapshots.push({ platform: 'spotify', metric: 'popularity', value: s.popularity, date: s.synced_at })
  }
  if (igAccount && igAccount.followers != null) {
    const ig = igAccount
    if (ig.followers   != null) snapshots.push({ platform: 'instagram', metric: 'followers',   value: ig.followers,   date: ig.synced_at })
    if (ig.media_count != null) snapshots.push({ platform: 'instagram', metric: 'media_count', value: ig.media_count, date: ig.synced_at })
  }
  if (platformData.youtube?.connected) {
    const y = platformData.youtube
    if (y.subscribers != null) snapshots.push({ platform: 'youtube', metric: 'subscribers', value: y.subscribers, date: y.synced_at })
    if (y.views       != null) snapshots.push({ platform: 'youtube', metric: 'views',        value: y.views,       date: y.synced_at })
    if (y.videos      != null) snapshots.push({ platform: 'youtube', metric: 'videos',       value: y.videos,      date: y.synced_at })
  }

  return (
    <div style={{ padding: isMobile ? '16px 14px' : '32px 40px', maxWidth: 1200, margin: '0 auto' }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: isMobile ? 'flex-start' : 'flex-start', flexDirection: isMobile ? 'column' : 'row', gap: isMobile ? 12 : 0, justifyContent: 'space-between', marginBottom: 32, ...(isMobile && { paddingTop: 52 }) }}>
        <div>
          <h1 style={{
            fontSize: 28, fontWeight: 700, letterSpacing: '-0.02em', margin: 0,
            background: 'linear-gradient(135deg, #ffffff 0%, #a89fff 100%)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
          }}>
            Insights
          </h1>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.35)', marginTop: 5 }}>
            Artist analytics across platforms
          </div>
        </div>

        <button
          onClick={handleSyncAll}
          disabled={syncing || loading}
          style={{
            padding: '8px 18px', fontSize: 13, fontWeight: 500,
            cursor: (syncing || loading) ? 'default' : 'pointer',
            background: 'linear-gradient(135deg, rgba(124,106,247,0.70) 0%, rgba(99,102,241,0.60) 100%)',
            border: '1px solid rgba(124,106,247,0.50)',
            borderRadius: 8, color: '#fff',
            opacity: (syncing || loading) ? 0.7 : 1,
            transition: 'all 150ms ease',
          }}
        >
          {syncing ? '↻ Syncing…' : '↻ Sync All'}
        </button>
      </div>

      {/* ── Error banner ── */}
      {error && (
        <div style={{
          ...GLASS_CARD,
          padding: '14px 20px',
          marginBottom: 24,
          border: '1px solid rgba(248,113,113,0.30)',
          background: 'rgba(248,113,113,0.07)',
        }}>
          <div style={{ fontSize: 13, color: '#fca5a5', fontWeight: 500, marginBottom: 2 }}>Error</div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>{error}</div>
        </div>
      )}

      {/* ── Loading state ── */}
      {loading && (
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: 16, marginBottom: 24 }}>
          {[0, 1, 2].map(i => (
            <div key={i} style={{ ...GLASS_CARD, minHeight: 200 }}>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.20)', paddingTop: 40, textAlign: 'center' }}>
                Loading…
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Empty state (no data at all, not just not connected) ── */}
      {!loading && !data && !error && (
        <EmptyState onConnect={setModal} />
      )}

      {/* ── Main content ── */}
      {!loading && data && (
        <>
          {/* Platform cards */}
          {anyConnected ? (
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: 16, marginBottom: 28 }}>
              {PLATFORMS.map(platform => (
                <PlatformCard
                  key={platform}
                  platform={platform}
                  data={platformData[platform] || null}
                  ytAccount={platform === 'youtube' ? ytAccount : undefined}
                  igAccount={platform === 'instagram' ? igAccount : undefined}
                  onConnect={setModal}
                  onDisconnect={handleDisconnect}
                />
              ))}
            </div>
          ) : (
            <EmptyState onConnect={setModal} />
          )}

          {/* Snapshot table */}
          {snapshots.length > 0 && <SnapshotTable snapshots={snapshots} />}

          {/* Recent Videos — shown whenever YouTube post data exists */}
          {ytVideos && ytVideos.length > 0 && <RecentVideos videos={ytVideos} />}

          {/* Recent Posts — shown whenever Instagram post data exists */}
          {igPosts && igPosts.length > 0 && <RecentPosts posts={igPosts} />}
        </>
      )}

      {/* ── Connection modal ── */}
      {modal && (
        <ConnectModal
          platform={modal}
          onClose={() => setModal(null)}
          onSuccess={handleConnectSuccess}
        />
      )}

    </div>
  )
}
