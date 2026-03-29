import { useEffect, useState } from 'react'
import { api } from './api'
import Login from './components/Login'
import Sidebar from './components/Sidebar'
import BottomNav from './components/BottomNav'
import useIsMobile from './hooks/useIsMobile'
import GlobalChat from './components/GlobalChat'
import Dashboard from './views/Dashboard'
import Files from './views/Files'
import Calendar from './views/Calendar'
import Tasks from './views/Tasks'
import Contacts from './views/Contacts'
import Integrations from './views/Integrations'
import Insights from './views/Insights'
import Roadmap from './views/Roadmap'
import Finance from './views/Finance'
import Ideas from './views/Ideas'
import Setlist from './views/Setlist'

const VIEWS = {
  dashboard:    Dashboard,
  roadmap:      Roadmap,
  finance:      Finance,
  files:        Files,
  calendar:     Calendar,
  tasks:        Tasks,
  ideas:        Ideas,
  setlist:      Setlist,
  contacts:     Contacts,
  insights:     Insights,
  integrations: Integrations,
}

export default function App() {
  const [authed,        setAuthed]        = useState(null) // null = checking, true/false = known
  const [view,          setView]          = useState('dashboard')
  const [chatOpen,      setChatOpen]      = useState(false)
  const [ideasRefreshKey, setIdeasRefreshKey] = useState(0)
  const [sidebarOpen,   setSidebarOpen]   = useState(false)
  const isMobile = useIsMobile()

  const navigateTo = (target) => {
    if (target === 'ideas') {
      setIdeasRefreshKey(k => k + 1)
    }
    setView(target)
    if (isMobile) setSidebarOpen(false)
  }

  // Verify token on load (also handles ?token= redirect from Google OAuth callback)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const urlToken = params.get('token')
    if (urlToken) {
      localStorage.setItem('vlt_token', urlToken)
      window.history.replaceState({}, '', '/')
    }
    const token = localStorage.getItem('vlt_token')
    if (!token) { setAuthed(false); return }
    api.verify()
      .then(() => setAuthed(true))
      .catch(() => { localStorage.removeItem('vlt_token'); setAuthed(false) })
  }, [])

  const handleLogout = () => {
    localStorage.removeItem('vlt_token')
    setAuthed(false)
  }

  // Global Cmd/Ctrl+K shortcut to toggle chat
  useEffect(() => {
    if (!authed) return
    const handler = (e) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setChatOpen(v => !v)
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [authed])

  if (authed === null) return (
    <div style={{ minHeight: '100vh', background: '#0d0d14', backgroundImage: 'radial-gradient(ellipse at 15% 10%, rgba(124,106,247,0.18) 0%, transparent 40%)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ color: 'rgba(255,255,255,0.25)', fontSize: 14 }}>Loading…</div>
    </div>
  )

  if (!authed) return <Login onLogin={() => setAuthed(true)} />

  const View = VIEWS[view] || Dashboard

  return (
    <div className="flex w-full min-h-screen" style={{
      background: '#0d0d14',
      backgroundImage: `
        radial-gradient(ellipse at 15% 10%, rgba(124,106,247,0.18) 0%, transparent 40%),
        radial-gradient(ellipse at 85% 80%, rgba(45,212,191,0.10) 0%, transparent 35%),
        radial-gradient(ellipse at 60% 40%, rgba(99,102,241,0.07) 0%, transparent 50%)
      `,
    }}>
      <style>{`
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.12); border-radius: 3px; }
        ::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.22); }
        * { scrollbar-width: thin; scrollbar-color: rgba(255,255,255,0.12) transparent; }
        ::selection { background: rgba(124,106,247,0.35); color: #fff; }
      `}</style>

      {/* Mobile backdrop overlay */}
      {isMobile && sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(0,0,0,0.55)',
            backdropFilter: 'blur(4px)',
            WebkitBackdropFilter: 'blur(4px)',
            zIndex: 999,
          }}
        />
      )}

      <Sidebar
        active={view}
        onNav={navigateTo}
        onLogout={handleLogout}
        onChatOpen={() => setChatOpen(true)}
        isMobile={isMobile}
        sidebarOpen={sidebarOpen}
        setSidebarOpen={setSidebarOpen}
      />

      <main
        className="flex-1 overflow-auto"
        style={{
          minWidth: 0,
          ...(isMobile && {
            marginLeft: 0,
            // Push content above the bottom nav bar (50px) + safe area
            paddingBottom: 'calc(50px + env(safe-area-inset-bottom, 16px))',
          }),
        }}
      >
        <View key={view === 'ideas' ? ideasRefreshKey : undefined} onNavigate={navigateTo} />
      </main>

      {/* Bottom tab bar — mobile only, replaces the hamburger pattern */}
      {isMobile && (
        <BottomNav
          activeView={view}
          onNav={navigateTo}
          onMoreOpen={() => setSidebarOpen(true)}
        />
      )}

      <GlobalChat
        open={chatOpen}
        onClose={() => setChatOpen(false)}
        onNavigate={navigateTo}
        isMobile={isMobile}
      />
    </div>
  )
}
