import { useState } from 'react'
import ChatPanel from '../components/ChatPanel'

export const TEAM_MEMBERS = [
  {
    id:       'felix',
    name:     'Felix',
    title:    'Band Manager',
    area:     'strategy, opportunities, and band business',
    tagline:  'Your strategic lead — the big picture, the hard calls.',
    color:    '#7c6af7',
    initials: 'FX',
  },
  {
    id:       'nina',
    name:     'Nina',
    title:    'Publicist',
    area:     'press, media, and PR campaigns',
    tagline:  'Press & media — getting Valletta in the right rooms.',
    color:    '#f472b6',
    initials: 'N',
  },
  {
    id:       'cass',
    name:     'Cass',
    title:    'Social Media Strategist',
    area:     'social platforms, content, and audience growth',
    tagline:  'Social & content — what to post, where, and why.',
    color:    '#4ade80',
    initials: 'C',
  },
  {
    id:       'marco',
    name:     'Marco',
    title:    'Booking Agent',
    area:     'shows, venues, festivals, and touring',
    tagline:  'Shows & touring — building the live footprint.',
    color:    '#fbbf24',
    initials: 'M',
  },
  {
    id:       'priya',
    name:     'Priya',
    title:    'Marketing Specialist',
    area:     'campaigns, Spotify, playlists, and fan growth',
    tagline:  'Marketing & growth — reaching new ears at scale.',
    color:    '#60a5fa',
    initials: 'P',
  },
  {
    id:       'eli',
    name:     'Eli',
    title:    'Sync & Licensing Agent',
    area:     'sync placements, licensing, and royalties',
    tagline:  'Sync & licensing — your music in film, TV, and ads.',
    color:    '#f87171',
    initials: 'E',
  },
  {
    id:       'quinn',
    name:     'Quinn',
    title:    'Music Industry Legal Advisor',
    area:     'contracts, business structure, royalties, and music law',
    tagline:  'Legal clarity — understand what you\'re signing before you sign it.',
    color:    '#a78bfa',
    initials: 'Q',
  },
  {
    id:       'scout',
    name:     'Scout',
    title:    'Creative Intelligence',
    area:     'idea capture, creative sparks, and backlog building',
    tagline:  'Monitors Discord for emerging ideas, captures and structures creative sparks, and builds your idea backlog automatically.',
    color:    '#2dd4bf',
    initials: 'SC',
  },
]

export default function Team() {
  const [activeMember, setActiveMember] = useState(null)

  return (
    <div style={{ padding: '32px 40px' }}>
      {activeMember && (
        <ChatPanel member={activeMember} onClose={() => setActiveMember(null)} />
      )}

      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0, background: 'linear-gradient(135deg, #ffffff 0%, rgba(255,255,255,0.75) 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>Team</h1>
        <p style={{ color: '#9595b8', marginTop: 6, fontSize: 14 }}>
          {TEAM_MEMBERS.length} members · Ask anyone a question
        </p>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
        gap: 16,
      }}>
        {TEAM_MEMBERS.map(member => (
          <MemberCard
            key={member.id}
            member={member}
            onAsk={() => setActiveMember(member)}
          />
        ))}
      </div>
    </div>
  )
}

function MemberCard({ member, onAsk }) {
  const [hovered, setHovered] = useState(false)

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: hovered ? `rgba(255,255,255,0.06)` : 'rgba(255,255,255,0.04)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        border: `1px solid ${hovered ? member.color + '55' : 'rgba(255,255,255,0.08)'}`,
        borderRadius: 14,
        padding: '24px 22px',
        display: 'flex', flexDirection: 'column', gap: 16,
        transition: 'background 0.2s, border-color 0.2s, transform 0.15s',
        transform: hovered ? 'translateY(-2px)' : 'none',
        cursor: 'default',
      }}
    >
      {/* Avatar + name */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{
          width: 52, height: 52, borderRadius: '50%', flexShrink: 0,
          background: `${member.color}18`,
          border: `2px solid ${member.color}44`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 18, fontWeight: 700, color: member.color, letterSpacing: '-0.02em',
        }}>
          {member.initials}
        </div>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#e8e8f8' }}>{member.name}</div>
          <div style={{
            fontSize: 11, fontWeight: 600, letterSpacing: '0.08em',
            color: member.color, marginTop: 2, textTransform: 'uppercase',
          }}>{member.title}</div>
        </div>
      </div>

      {/* Tagline */}
      <p style={{ fontSize: 13, color: '#9595b8', margin: 0, lineHeight: 1.5 }}>
        {member.tagline}
      </p>

      {/* Ask button */}
      <button
        onClick={onAsk}
        style={{
          background: hovered ? `${member.color}22` : 'transparent',
          border: `1px solid ${hovered ? member.color + '88' : 'rgba(255,255,255,0.10)'}`,
          borderRadius: 8, color: hovered ? member.color : 'rgba(255,255,255,0.45)',
          padding: '9px', fontSize: 13, fontWeight: 600,
          cursor: 'pointer', transition: 'all 0.15s',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        }}
      >
        <span>💬</span> Ask {member.name}
      </button>
    </div>
  )
}
