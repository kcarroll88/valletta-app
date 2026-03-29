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
    transition: 'transform 0.25s ease',
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
          <div style={{
            fontSize: 18,
            fontWeight: 700,
            letterSpacing: '0.20em',
            background: 'linear-gradient(135deg, #ffffff 0%, #c4b5fd 50%, #a89fff 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}>
            VALLETTA
          </div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.22)', letterSpacing: '0.20em', marginTop: 2 }}>
            COMMAND CENTER
          </div>
        </div>
        {isMobile && (
          <button
            onClick={() => setSidebarOpen(false)}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'rgba(255,255,255,0.55)',
              fontSize: 20,
              cursor: 'pointer',
              padding: '0 4px',
              lineHeight: 1,
              marginTop: 2,
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
