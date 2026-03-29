import { useEffect, useState } from 'react'
import { api } from '../api'

const PLATFORMS = [
  {
    id:       'google',
    label:    'Google',
    sublabel: 'Gmail + YouTube',
    icon:     'G',
    color:    '#4285f4',
    description: 'Read recent emails and YouTube channel analytics.',
    oauth:    true,
  },
  {
    id:       'discord',
    label:    'Discord',
    sublabel: 'Server messages',
    icon:     'D',
    color:    '#5865f2',
    description: 'Read messages from your band\'s Discord server.',
    oauth:    false,
  },
  {
    id:       'instagram',
    label:    'Instagram',
    sublabel: 'Posts + metrics',
    icon:     'IG',
    color:    '#e1306c',
    description: 'Read recent posts and engagement metrics.',
    oauth:    true,
  },
  {
    id:       'tiktok',
    label:    'TikTok',
    sublabel: 'Videos + metrics',
    icon:     'TT',
    color:    '#ff0050',
    description: 'Read recent videos and performance data.',
    oauth:    true,
  },
]

export default function Integrations() {
  const [connections, setConnections] = useState([])
  const [loading, setLoading]         = useState(true)
  const [syncing, setSyncing]         = useState({})
  const [toast, setToast]             = useState(null)
  const [discordModal, setDiscordModal] = useState(false)
  const [preview, setPreview]         = useState({})

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 4000)
  }

  const loadStatus = async () => {
    try {
      const data = await api.integrations.status()
      setConnections(data)
    } catch (e) {
      showToast('Could not load integration status', 'error')
    } finally {
      setLoading(false)
    }
  }

  // Handle OAuth redirect return
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const connected = params.get('connected')
    const error = params.get('error')
    if (connected) {
      showToast(`${connected.charAt(0).toUpperCase() + connected.slice(1)} connected successfully`)
      window.history.replaceState({}, '', window.location.pathname)
    }
    if (error) {
      const reason = params.get('reason') || 'unknown error'
      showToast(`Failed to connect ${error}: ${reason}`, 'error')
      window.history.replaceState({}, '', window.location.pathname)
    }
    loadStatus()
  }, [])

  const getConnection = (id) => connections.find(c => c.platform === id) || {}

  const handleConnect = async (platform) => {
    if (platform === 'discord') {
      setDiscordModal(true)
      return
    }
    try {
      const { url } = await api.integrations.startAuth(platform)
      window.location.href = url
    } catch (e) {
      showToast(e.message || `Could not start ${platform} auth`, 'error')
    }
  }

  const handleDisconnect = async (platform) => {
    try {
      await api.integrations.disconnect(platform)
      showToast(`Disconnected ${platform}`)
      loadStatus()
      setPreview(p => { const copy = {...p}; delete copy[platform]; return copy })
    } catch (e) {
      showToast('Disconnect failed', 'error')
    }
  }

  const handleSync = async (platform) => {
    setSyncing(s => ({ ...s, [platform]: true }))
    try {
      const result = await api.integrations.sync(platform)
      showToast(`Synced ${result.synced} items from ${platform}`)
      loadStatus()
      loadPreview(platform)
    } catch (e) {
      showToast(`Sync failed: ${e.message}`, 'error')
    } finally {
      setSyncing(s => ({ ...s, [platform]: false }))
    }
  }

  const loadPreview = async (platform) => {
    try {
      const data = {}
      if (platform === 'google') {
        data.messages = await api.integrations.messages({ platform: 'gmail', limit: 5 })
        data.posts = await api.integrations.posts({ platform: 'youtube', limit: 3 })
        data.metrics = await api.integrations.metrics({ platform: 'youtube', metric_type: 'account' })
      } else if (platform === 'discord') {
        data.messages = await api.integrations.messages({ platform: 'discord', limit: 8 })
      } else {
        data.posts = await api.integrations.posts({ platform, limit: 5 })
        data.metrics = await api.integrations.metrics({ platform, metric_type: 'account' })
      }
      setPreview(p => ({ ...p, [platform]: data }))
    } catch (e) {}
  }

  useEffect(() => {
    connections.forEach(c => {
      if (c.status === 'connected' && !preview[c.platform]) {
        loadPreview(c.platform)
      }
    })
  }, [connections])

  if (loading) return (
    <div style={{ padding: '32px 40px', color: '#9595b8', fontSize: 14 }}>Loading…</div>
  )

  return (
    <div style={{ padding: '32px 40px', maxWidth: 900 }}>
      {toast && <Toast toast={toast} />}
      {discordModal && (
        <DiscordModal
          onClose={() => setDiscordModal(false)}
          onSuccess={() => { showToast('Discord connected'); setDiscordModal(false); loadStatus() }}
          showToast={showToast}
        />
      )}

      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0, background: 'linear-gradient(135deg, #ffffff 0%, rgba(255,255,255,0.75) 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>Integrations</h1>
        <p style={{ color: '#9595b8', marginTop: 6, fontSize: 14 }}>
          Connect your platforms so the team has live context when you chat with them.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))', gap: 16 }}>
        {PLATFORMS.map(platform => {
          const conn = getConnection(platform.id)
          const isConnected = conn.status === 'connected'
          const isError = conn.status === 'error'
          const isSyncing = syncing[platform.id]
          const platformPreview = preview[platform.id]

          return (
            <div key={platform.id} style={{
              background: 'rgba(255,255,255,0.04)',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
              border: `1px solid ${isConnected ? platform.color + '44' : 'rgba(255,255,255,0.08)'}`,
              borderRadius: 14,
              padding: '22px',
              display: 'flex', flexDirection: 'column', gap: 16,
              transition: 'border-color 0.2s',
            }}>
              {/* Header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{
                  width: 48, height: 48, borderRadius: 12, flexShrink: 0,
                  background: `${platform.color}18`,
                  border: `2px solid ${platform.color}44`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 13, fontWeight: 800, color: platform.color, letterSpacing: '-0.02em',
                }}>
                  {platform.icon}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#e8e8f8' }}>{platform.label}</div>
                  <div style={{ fontSize: 11, color: '#9595b8', marginTop: 1 }}>{platform.sublabel}</div>
                </div>
                <StatusBadge status={conn.status || 'disconnected'} />
              </div>

              {/* Account label + last sync */}
              {isConnected && (
                <div style={{ fontSize: 12, color: '#9595b8' }}>
                  {conn.account_label && <span style={{ color: '#a89fff' }}>{conn.account_label}</span>}
                  {conn.last_sync_at && (
                    <span style={{ marginLeft: conn.account_label ? 8 : 0 }}>
                      · synced {relativeTime(conn.last_sync_at)}
                    </span>
                  )}
                  {!conn.last_sync_at && <span> · never synced</span>}
                </div>
              )}

              {isError && conn.last_error && (
                <div style={{ fontSize: 12, color: '#f87171', background: '#f8717111', borderRadius: 6, padding: '6px 10px' }}>
                  {conn.last_error.slice(0, 120)}
                </div>
              )}

              {!isConnected && (
                <div style={{ fontSize: 13, color: '#9595b8' }}>{platform.description}</div>
              )}

              {/* Preview */}
              {isConnected && platformPreview && (
                <DataPreview platform={platform.id} data={platformPreview} />
              )}

              {/* Actions */}
              <div style={{ display: 'flex', gap: 8, marginTop: 'auto' }}>
                {isConnected ? (
                  <>
                    <button
                      onClick={() => handleSync(platform.id)}
                      disabled={isSyncing}
                      style={btnStyle(isSyncing ? '#363650' : platform.color + '22', platform.color, isSyncing)}
                    >
                      {isSyncing ? 'Syncing…' : 'Sync Now'}
                    </button>
                    <button
                      onClick={() => handleDisconnect(platform.id)}
                      style={btnStyle('transparent', '#56567a', false)}
                    >
                      Disconnect
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => handleConnect(platform.id)}
                    style={btnStyle(platform.color + '22', platform.color, false)}
                  >
                    Connect {platform.label}
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function StatusBadge({ status }) {
  const map = {
    connected:    { color: '#4ade80', label: 'Connected' },
    disconnected: { color: '#56567a', label: 'Not connected' },
    error:        { color: '#f87171', label: 'Error' },
  }
  const { color, label } = map[status] || map.disconnected
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 5,
      fontSize: 11, color, fontWeight: 600,
    }}>
      <div style={{ width: 6, height: 6, borderRadius: '50%', background: color }} />
      {label}
    </div>
  )
}

function DataPreview({ platform, data }) {
  if (platform === 'google' || platform === 'discord') {
    const messages = data.messages || []
    const posts = data.posts || []
    const metric = data.metrics?.[0]

    return (
      <div style={{ fontSize: 12, color: '#9595b8', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {metric && <MetricLine metric={metric} />}
        {messages.slice(0, 4).map((m, i) => (
          <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
            <span style={{ color: '#56567a', flexShrink: 0 }}>·</span>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {m.subject || m.body_preview || '(no content)'}
            </span>
          </div>
        ))}
        {posts.slice(0, 2).map((p, i) => (
          <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
            <span style={{ color: '#56567a', flexShrink: 0 }}>▸</span>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {p.caption || '(no caption)'}
            </span>
          </div>
        ))}
      </div>
    )
  }

  const posts = data.posts || []
  const metric = data.metrics?.[0]
  return (
    <div style={{ fontSize: 12, color: '#9595b8', display: 'flex', flexDirection: 'column', gap: 6 }}>
      {metric && <MetricLine metric={metric} />}
      {posts.slice(0, 3).map((p, i) => (
        <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
          <span style={{ color: '#56567a', flexShrink: 0 }}>▸</span>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {p.caption || '(no caption)'}
          </span>
        </div>
      ))}
    </div>
  )
}

function MetricLine({ metric }) {
  try {
    const d = JSON.parse(metric.data)
    const parts = []
    if (d.followers != null)   parts.push(`${Number(d.followers).toLocaleString()} followers`)
    if (d.subscribers != null) parts.push(`${Number(d.subscribers).toLocaleString()} subscribers`)
    if (d.total_views != null) parts.push(`${Number(d.total_views).toLocaleString()} total views`)
    if (d.video_count != null) parts.push(`${d.video_count} videos`)
    if (!parts.length) return null
    return <div style={{ color: '#a89fff', fontWeight: 600 }}>{parts.join(' · ')}</div>
  } catch {
    return null
  }
}

function DiscordModal({ onClose, onSuccess, showToast }) {
  const [botToken, setBotToken] = useState('')
  const [serverId, setServerId] = useState('')
  const [loading, setLoading]   = useState(false)

  const handleSubmit = async () => {
    if (!botToken.trim() || !serverId.trim()) return
    setLoading(true)
    try {
      await api.integrations.connectDiscord({ bot_token: botToken.trim(), server_id: serverId.trim() })
      onSuccess()
    } catch (e) {
      showToast(e.message || 'Discord connection failed', 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit() }
    if (e.key === 'Escape') onClose()
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200,
    }} onClick={onClose}>
      <div style={{
        background: 'rgba(255,255,255,0.07)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 14,
        padding: 28, width: 440, maxWidth: '90vw', boxShadow: '0 8px 40px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.10)',
      }} onClick={e => e.stopPropagation()} onKeyDown={handleKeyDown}>
        <div style={{ fontSize: 16, fontWeight: 700, color: '#e8e8f8', marginBottom: 6 }}>Connect Discord</div>
        <div style={{ fontSize: 13, color: '#9595b8', marginBottom: 20, lineHeight: 1.5 }}>
          Create a bot at <span style={{ color: '#5865f2' }}>discord.com/developers</span>, add it to your server, and paste the bot token and server ID below.
        </div>
        {[
          { label: 'Bot Token', value: botToken, set: setBotToken, placeholder: 'MTEx...' },
          { label: 'Server ID', value: serverId, set: setServerId, placeholder: '1234567890' },
        ].map(({ label, value, set, placeholder }) => (
          <div key={label} style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 12, color: '#9595b8', marginBottom: 5, fontWeight: 600 }}>{label}</div>
            <input
              value={value}
              onChange={e => set(e.target.value)}
              placeholder={placeholder}
              style={{
                width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)',
                borderRadius: 8, color: '#e8e8f8', padding: '9px 12px',
                fontSize: 13, outline: 'none', boxSizing: 'border-box',
              }}
            />
          </div>
        ))}
        <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
          <button
            onClick={handleSubmit}
            disabled={loading || !botToken.trim() || !serverId.trim()}
            style={btnStyle('#5865f222', '#5865f2', loading)}
          >
            {loading ? 'Connecting…' : 'Connect'}
          </button>
          <button onClick={onClose} style={btnStyle('transparent', '#56567a', false)}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

function Toast({ toast }) {
  return (
    <div style={{
      position: 'fixed', bottom: 28, right: 28, zIndex: 300,
      background: toast.type === 'error' ? '#2a1118' : '#111a18',
      border: `1px solid ${toast.type === 'error' ? '#f87171' : '#4ade80'}44`,
      borderRadius: 10, padding: '12px 18px',
      color: toast.type === 'error' ? '#f87171' : '#4ade80',
      fontSize: 13, fontWeight: 500, maxWidth: 360,
      boxShadow: '0 4px 24px rgba(0,0,0,0.5)',
    }}>
      {toast.msg}
    </div>
  )
}

function btnStyle(bg, color, disabled) {
  return {
    flex: 1, background: disabled ? '#2c2c3a' : bg,
    border: `1px solid ${disabled ? '#363650' : color + '66'}`,
    borderRadius: 8, color: disabled ? '#56567a' : color,
    padding: '9px', fontSize: 13, fontWeight: 600,
    cursor: disabled ? 'not-allowed' : 'pointer',
    transition: 'all 0.15s',
    opacity: disabled ? 0.6 : 1,
  }
}

function relativeTime(iso) {
  try {
    const dt = new Date(iso)
    const diff = Date.now() - dt.getTime()
    const mins = Math.floor(diff / 60000)
    const hours = Math.floor(diff / 3600000)
    const days = Math.floor(diff / 86400000)
    if (mins < 2)  return 'just now'
    if (hours < 1) return `${mins}m ago`
    if (days < 1)  return `${hours}h ago`
    return `${days}d ago`
  } catch {
    return ''
  }
}
