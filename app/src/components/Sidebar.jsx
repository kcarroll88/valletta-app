import { useState } from 'react'

const NAV_GROUPS = [
  {
    label: 'OVERVIEW',
    items: [
      { id: 'dashboard', label: 'Dashboard', icon: '⬡' },
      { id: 'roadmap',   label: 'Roadmap',   icon: '◈' },
      { id: 'finance',   label: 'Finance',   icon: '◬' },
      { id: 'calendar',  label: 'Calendar',  icon: '◻' },
    ],
  },
  {
    label: 'BAND',
    items: [
      { id: 'contacts', label: 'Contacts', icon: '⊡' },
      { id: 'tasks',    label: 'Tasks',    icon: '⊞' },
      {
        id: 'media',
        label: 'Press & Media',
        icon: (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block' }}>
            <path d="M4 22h16a2 2 0 002-2V4a2 2 0 00-2-2H8a2 2 0 00-2 2v16a2 2 0 01-2 2zm0 0a2 2 0 01-2-2v-9c0-1.1.9-2 2-2h2"/>
            <path d="M18 14h-8M15 18h-5M10 6h8v4h-8z"/>
          </svg>
        ),
      },
      {
        id: 'inventory',
        label: 'Inventory',
        icon: (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block' }}>
            <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/>
            <polyline points="3.27 6.96 12 12.01 20.73 6.96"/>
            <line x1="12" y1="22.08" x2="12" y2="12"/>
          </svg>
        ),
      },
      {
        id: 'shows',
        label: 'Shows',
        icon: (
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block' }}>
            <rect x="2" y="7" width="20" height="15" rx="2"/>
            <path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2"/>
            <line x1="12" y1="12" x2="12" y2="17"/>
            <line x1="9.5" y1="14.5" x2="14.5" y2="14.5"/>
          </svg>
        ),
      },
    ],
  },
  {
    label: 'CREATIVE',
    items: [
      { id: 'ideas',   label: 'Ideas',   icon: '◍' },
      { id: 'setlist', label: 'Setlist', icon: '♩' },
    ],
  },
  {
    label: 'SYSTEM',
    items: [
      { id: 'files',        label: 'Files',        icon: '◫' },
      { id: 'insights',     label: 'Insights',     icon: '⬡' },
      { id: 'integrations', label: 'Integrations', icon: '⊕' },
    ],
  },
]

function NavItem({ id, label, icon, isActive, isTeam, onClick }) {
  const [hovered, setHovered] = useState(false)

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        width: '100%',
        // 44px min height for Apple HIG compliance in the mobile slide-in
        minHeight: 44,
        padding: '10px 24px',
        background: isActive ? 'rgba(124,106,247,0.15)' : hovered ? 'rgba(255,255,255,0.05)' : 'transparent',
        borderLeft: isActive ? '2px solid #a89fff' : '2px solid transparent',
        borderTop: 'none',
        borderRight: 'none',
        borderBottom: 'none',
        borderRadius: isActive ? '0 6px 6px 0' : hovered ? '0 6px 6px 0' : 0,
        boxShadow: isActive ? 'inset 0 0 12px rgba(124,106,247,0.08)' : 'none',
        color: isActive ? '#c4b5fd' : hovered ? 'rgba(255,255,255,0.80)' : 'rgba(255,255,255,0.45)',
        fontSize: 14,
        fontWeight: isActive ? 600 : isTeam ? 500 : 400,
        cursor: 'pointer',
        textAlign: 'left',
        transition: 'background 0.12s, color 0.12s',
      }}
    >
      <span style={{ fontSize: 16, opacity: isActive ? 1 : 0.7 }}>{icon}</span>
      {label}
    </button>
  )
}

function AskTeamButton({ onChatOpen }) {
  const [hovered, setHovered] = useState(false)
  return (
    <button
      onClick={onChatOpen}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        width: '100%',
        background: hovered ? 'rgba(124,106,247,0.20)' : 'rgba(124,106,247,0.10)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        border: '1px solid rgba(124,106,247,0.30)',
        borderRadius: 8,
        boxShadow: hovered ? '0 4px 16px rgba(124,106,247,0.20), inset 0 1px 0 rgba(255,255,255,0.10)' : 'inset 0 1px 0 rgba(255,255,255,0.06)',
        color: '#c4b5fd',
        padding: '8px 12px',
        fontSize: 12,
        cursor: 'pointer',
        transition: 'background 0.15s, box-shadow 0.15s',
        gap: 6,
      }}
    >
      <span style={{ fontSize: 13, opacity: 0.85 }}>◈</span>
      <span style={{ flex: 1, textAlign: 'left', fontWeight: 500 }}>Ask the team</span>
      <span style={{ color: 'rgba(255,255,255,0.25)', fontSize: 10, letterSpacing: '0.03em', flexShrink: 0 }}>⌘K</span>
    </button>
  )
}

export default function Sidebar({ active, onNav, onLogout, onChatOpen, isMobile, sidebarOpen, setSidebarOpen }) {
  const mobileStyle = isMobile ? {
    position: 'fixed',
    top: 0,
    left: 0,
    zIndex: 1000,
    width: 280,
    transform: sidebarOpen ? 'translateX(0)' : 'translateX(-100%)',
    transition: 'transform 0.28s cubic-bezier(0.32, 0.72, 0, 1)',
    // Safe area: notch / Dynamic Island at top, home indicator at bottom
    paddingTop: 'env(safe-area-inset-top, 0px)',
    paddingBottom: 'env(safe-area-inset-bottom, 16px)',
  } : {}

  return (
    <aside style={{
      width: 220,
      height: '100vh',
      position: 'sticky',
      top: 0,
      overflowY: 'auto',
      background: 'rgba(15, 15, 22, 0.75)',
      backdropFilter: 'blur(24px) saturate(180%)',
      WebkitBackdropFilter: 'blur(24px) saturate(180%)',
      borderRight: '1px solid rgba(255,255,255,0.08)',
      boxShadow: 'inset -1px 0 0 rgba(255,255,255,0.04), 4px 0 24px rgba(0,0,0,0.4)',
      display: 'flex',
      flexDirection: 'column',
      padding: '24px 0',
      flexShrink: 0,
      ...mobileStyle,
    }}>
      {/* Wordmark + close button on mobile */}
      <div style={{ padding: '0 24px 32px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <img
            src="/logo-light.png"
            alt="Valletta"
            draggable="false"
            style={{ height: 32, width: 'auto', objectFit: 'contain', userSelect: 'none', display: 'block' }}
          />
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.22)', letterSpacing: '0.20em', marginTop: 2 }}>
            COMMAND CENTER
          </div>
        </div>
        {isMobile && (
          <button
            onClick={() => setSidebarOpen(false)}
            style={{
              background: 'rgba(255,255,255,0.07)',
              border: '1px solid rgba(255,255,255,0.10)',
              borderRadius: 8,
              color: 'rgba(255,255,255,0.65)',
              fontSize: 16,
              cursor: 'pointer',
              // Apple HIG: 44×44 minimum touch target
              width: 44,
              height: 44,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
            aria-label="Close menu"
          >
            ✕
          </button>
        )}
      </div>

      {/* Nav */}
      <nav style={{ flex: 1 }}>
        {NAV_GROUPS.map((group, groupIdx) => (
          <div key={group.label} style={{ marginTop: groupIdx === 0 ? 0 : 8 }}>
            <div style={{ padding: '16px 24px 6px', fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.28)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
              {group.label}
            </div>
            {group.items.map(({ id, label, icon }) => (
              <NavItem
                key={id}
                id={id}
                label={label}
                icon={icon}
                isActive={active === id}
                isTeam={id === 'team'}
                onClick={() => { onNav(id); if (isMobile && setSidebarOpen) setSidebarOpen(false) }}
              />
            ))}
          </div>
        ))}
      </nav>

      {/* Ask the team */}
      {onChatOpen && (
        <div style={{ padding: '0 12px 8px' }}>
          <AskTeamButton onChatOpen={onChatOpen} />
        </div>
      )}

      {/* Logout */}
      {onLogout && (
        <div style={{ padding: '0 16px 8px' }}>
          <button
            onClick={onLogout}
            style={{
              width: '100%', background: 'transparent',
              border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8,
              color: 'rgba(255,255,255,0.55)', padding: '7px', fontSize: 12,
              cursor: 'pointer', transition: 'all 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.75)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.22)' }}
            onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.55)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)' }}
          >
            Sign out
          </button>
        </div>
      )}

      {/* Footer */}
      <div style={{ padding: '8px 24px 0', fontSize: 11, color: 'rgba(255,255,255,0.18)', letterSpacing: '0.06em' }}>
        Valletta · AI Team
      </div>
    </aside>
  )
}
