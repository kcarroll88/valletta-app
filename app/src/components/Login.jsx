import { useState } from 'react'

export default function Login({ onLogin }) {
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')

  const handleGoogleLogin = async () => {
    setError('')
    setLoading(true)
    try {
      const { url } = await fetch('/api/auth/google/start').then(r => r.json())
      window.location.href = url
    } catch {
      setError('Something went wrong. Please try again.')
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh', width: '100%',
      background: '#1c1c24',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{ width: 360, textAlign: 'center' }}>
        {/* Logo / wordmark */}
        <div style={{ marginBottom: 40 }}>
          <div style={{
            width: 56, height: 56, borderRadius: '50%',
            background: 'linear-gradient(135deg, #7c6af7, #a89fff)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 16px',
            fontSize: 22, fontWeight: 800, color: '#fff',
          }}>V</div>
          <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '0.12em', color: '#e8e8f8' }}>
            VALLETTA
          </div>
          <div style={{ fontSize: 12, color: '#9595b8', letterSpacing: '0.15em', marginTop: 4 }}>
            COMMAND CENTER
          </div>
        </div>

        {/* Card */}
        <div style={{
          background: '#242430', border: '1px solid #363650',
          borderRadius: 16, padding: '32px 28px',
        }}>
          <p style={{ fontSize: 14, color: '#9595b8', margin: '0 0 24px' }}>
            Band members only. Sign in with your Google account.
          </p>

          {error && (
            <p style={{ fontSize: 12, color: '#f87171', margin: '0 0 16px' }}>{error}</p>
          )}

          <button
            onClick={handleGoogleLogin}
            disabled={loading}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
              width: '100%',
              background: loading ? '#f0f0f0' : '#ffffff',
              border: '1px solid #d1d1d6',
              borderRadius: 8,
              color: '#1f1f1f',
              padding: '11px 14px',
              fontSize: 14,
              fontWeight: 600,
              cursor: loading ? 'wait' : 'pointer',
              transition: 'all 0.15s',
              boxShadow: '0 1px 3px rgba(0,0,0,0.12)',
            }}
            onMouseEnter={e => { if (!loading) e.currentTarget.style.boxShadow = '0 2px 8px rgba(124,106,247,0.25)' }}
            onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.12)' }}
          >
            {/* Google "G" SVG icon */}
            <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
              <g fill="none" fillRule="evenodd">
                <path d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
                <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
                <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
                <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
              </g>
            </svg>
            {loading ? 'Redirecting…' : 'Sign in with Google'}
          </button>
        </div>
      </div>
    </div>
  )
}
