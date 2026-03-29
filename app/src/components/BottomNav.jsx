/**
 * BottomNav — iOS-style persistent bottom tab bar (mobile only)
 *
 * 5 tabs: Dashboard, Calendar, Tasks, Contacts, More (opens sidebar slide-in)
 * Active tab: purple accent. Inactive: 40% opacity.
 * Safe-area aware so it clears the iPhone home indicator.
 */

const TABS = [
  {
    id: 'dashboard',
    label: 'Home',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        <polyline points="9 22 9 12 15 12 15 22" />
      </svg>
    ),
  },
  {
    id: 'calendar',
    label: 'Calendar',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
        <line x1="16" y1="2" x2="16" y2="6" />
        <line x1="8" y1="2" x2="8" y2="6" />
        <line x1="3" y1="10" x2="21" y2="10" />
      </svg>
    ),
  },
  {
    id: 'tasks',
    label: 'Tasks',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="9 11 12 14 22 4" />
        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
      </svg>
    ),
  },
  {
    id: 'contacts',
    label: 'Contacts',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
  },
  {
    id: '__more__',
    label: 'More',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <line x1="3" y1="12" x2="21" y2="12" />
        <line x1="3" y1="6"  x2="21" y2="6" />
        <line x1="3" y1="18" x2="21" y2="18" />
      </svg>
    ),
  },
]

const ACCENT = '#7c6af7'

export default function BottomNav({ activeView, onNav, onMoreOpen }) {
  return (
    <nav
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 990,
        display: 'flex',
        alignItems: 'stretch',
        background: 'rgba(13,13,20,0.92)',
        backdropFilter: 'blur(20px) saturate(180%)',
        WebkitBackdropFilter: 'blur(20px) saturate(180%)',
        borderTop: '1px solid rgba(255,255,255,0.08)',
        boxShadow: '0 -4px 24px rgba(0,0,0,0.4)',
        // 50px bar + safe area for home indicator
        paddingBottom: 'env(safe-area-inset-bottom, 16px)',
        height: 'calc(50px + env(safe-area-inset-bottom, 16px))',
      }}
    >
      {TABS.map(tab => {
        const isMore = tab.id === '__more__'
        const isActive = !isMore && activeView === tab.id

        const handleClick = () => {
          if (isMore) {
            onMoreOpen()
          } else {
            onNav(tab.id)
          }
        }

        return (
          <button
            key={tab.id}
            onClick={handleClick}
            aria-label={tab.label}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 3,
              background: 'transparent',
              border: 'none',
              borderRadius: 0,
              color: isActive ? ACCENT : 'rgba(255,255,255,0.40)',
              cursor: 'pointer',
              padding: '6px 4px 0',
              // Guarantee 44pt touch target on the interactive area
              minHeight: 44,
              minWidth: 44,
              transition: 'color 0.15s, opacity 0.15s',
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            <span style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              // Active indicator: subtle pill background
              background: isActive ? 'rgba(124,106,247,0.15)' : 'transparent',
              borderRadius: 10,
              padding: '3px 10px',
              transition: 'background 0.15s',
            }}>
              {tab.icon}
            </span>
            <span style={{
              fontSize: 10,
              fontWeight: isActive ? 600 : 400,
              letterSpacing: '0.02em',
              lineHeight: 1.2,
            }}>
              {tab.label}
            </span>
          </button>
        )
      })}
    </nav>
  )
}
