import { useEffect, useState } from 'react'
import { api } from '../api'
import useIsMobile from '../hooks/useIsMobile'

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

const GLASS_CARD = {
  background: 'rgba(255,255,255,0.04)',
  backdropFilter: 'blur(12px)',
  WebkitBackdropFilter: 'blur(12px)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 12,
  padding: '20px 24px',
  boxShadow: '0 4px 24px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.06)',
}

function formatCurrency(amount) {
  return '$' + Math.abs(amount).toLocaleString('en-US', { minimumFractionDigits: 0 })
}

// ─── Shimmer skeleton ────────────────────────────────────────────────────────

function Shimmer({ width = '100%', height = 20, radius = 6, style = {} }) {
  return (
    <div style={{
      width,
      height,
      borderRadius: radius,
      background: 'linear-gradient(90deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0.04) 100%)',
      backgroundSize: '200% 100%',
      animation: 'shimmer 1.5s infinite',
      ...style,
    }} />
  )
}

function SkeletonLoader() {
  return (
    <>
      <style>{`
        @keyframes shimmer {
          0%   { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
      {/* 3 stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24 }}>
        {[0,1,2].map(i => (
          <div key={i} style={{ ...GLASS_CARD }}>
            <Shimmer width={60} height={11} radius={4} style={{ marginBottom: 12 }} />
            <Shimmer width="70%" height={36} radius={6} />
          </div>
        ))}
      </div>
      {/* Bar chart area */}
      <div style={{ ...GLASS_CARD, marginBottom: 24 }}>
        <Shimmer width={100} height={11} radius={4} style={{ marginBottom: 20 }} />
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 120 }}>
          {MONTHS.map(m => (
            <div key={m} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <Shimmer width="100%" height={40 + Math.random() * 60} radius={4} />
              <Shimmer width="80%" height={9} radius={3} />
            </div>
          ))}
        </div>
      </div>
    </>
  )
}

// ─── Stat card ───────────────────────────────────────────────────────────────

function StatCard({ label, amount, color }) {
  return (
    <div style={{ ...GLASS_CARD }}>
      <div style={{
        fontSize: 11, fontWeight: 700, letterSpacing: '0.10em',
        textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)', marginBottom: 10,
      }}>{label}</div>
      <div style={{ fontSize: 32, fontWeight: 700, letterSpacing: '-0.02em', color }}>
        {amount < 0 ? '-' : ''}{formatCurrency(amount)}
      </div>
    </div>
  )
}

// ─── Monthly bar chart ────────────────────────────────────────────────────────

function MonthlyChart({ monthly }) {
  const [tooltip, setTooltip] = useState(null)
  const maxMonthly = Math.max(...monthly.map(m => Math.max(m.income || 0, m.expenses || 0)), 1)
  const MAX_H = 100

  return (
    <div style={{ ...GLASS_CARD, marginBottom: 24 }}>
      <div style={{
        fontSize: 11, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase',
        color: 'rgba(255,255,255,0.35)', marginBottom: 20,
      }}>Monthly Overview</div>

      <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end', position: 'relative' }}>
        {monthly.map((m, i) => {
          const incH = ((m.income || 0) / maxMonthly) * MAX_H
          const expH = ((m.expenses || 0) / maxMonthly) * MAX_H
          return (
            <div
              key={i}
              style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, cursor: 'pointer' }}
              onMouseEnter={() => setTooltip({ idx: i, month: MONTHS[i], income: m.income || 0, expenses: m.expenses || 0 })}
              onMouseLeave={() => setTooltip(null)}
            >
              {/* bars */}
              <div style={{ width: '100%', display: 'flex', gap: 2, alignItems: 'flex-end', height: MAX_H }}>
                {/* income */}
                <div style={{
                  flex: 1,
                  height: Math.max(incH, incH > 0 ? 2 : 0),
                  background: 'rgba(74,222,128,0.50)',
                  borderRadius: '3px 3px 0 0',
                  transition: 'height 300ms ease',
                  border: incH > 0 ? '1px solid rgba(74,222,128,0.70)' : 'none',
                  borderBottom: 'none',
                }} />
                {/* expenses */}
                <div style={{
                  flex: 1,
                  height: Math.max(expH, expH > 0 ? 2 : 0),
                  background: 'rgba(248,113,113,0.50)',
                  borderRadius: '3px 3px 0 0',
                  transition: 'height 300ms ease',
                  border: expH > 0 ? '1px solid rgba(248,113,113,0.70)' : 'none',
                  borderBottom: 'none',
                }} />
              </div>
              {/* month label */}
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.04em' }}>{MONTHS[i]}</div>
            </div>
          )
        })}
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div style={{
          position: 'absolute',
          pointerEvents: 'none',
          background: 'rgba(20,20,30,0.95)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 8,
          padding: '10px 14px',
          fontSize: 12,
          color: 'rgba(255,255,255,0.85)',
          boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
          zIndex: 10,
          bottom: 40,
          left: '50%',
          transform: 'translateX(-50%)',
        }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>{tooltip.month}</div>
          <div style={{ display: 'flex', gap: 12 }}>
            <span style={{ color: '#4ade80' }}>In: {formatCurrency(tooltip.income)}</span>
            <span style={{ color: '#f87171' }}>Out: {formatCurrency(tooltip.expenses)}</span>
          </div>
        </div>
      )}

      {/* Legend */}
      <div style={{ display: 'flex', gap: 16, marginTop: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 10, height: 10, borderRadius: 2, background: 'rgba(74,222,128,0.50)', border: '1px solid rgba(74,222,128,0.70)' }} />
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.40)' }}>Income</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 10, height: 10, borderRadius: 2, background: 'rgba(248,113,113,0.50)', border: '1px solid rgba(248,113,113,0.70)' }} />
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.40)' }}>Expenses</span>
        </div>
      </div>
    </div>
  )
}

// ─── Category breakdown ──────────────────────────────────────────────────────

function CategoryBar({ name, amount, max, isIncome }) {
  const pct = max > 0 ? (amount / max) * 100 : 0
  const barBg = isIncome ? 'rgba(74,222,128,0.25)' : 'rgba(248,113,113,0.25)'
  const barBorder = isIncome ? 'rgba(74,222,128,0.60)' : 'rgba(248,113,113,0.60)'

  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
        <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.75)' }}>{name}</span>
        <span style={{ fontSize: 13, color: isIncome ? '#4ade80' : '#f87171', fontWeight: 500 }}>{formatCurrency(amount)}</span>
      </div>
      <div style={{ height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{
          height: '100%',
          width: `${pct}%`,
          background: barBg,
          borderLeft: `3px solid ${barBorder}`,
          borderRadius: '0 3px 3px 0',
          transition: 'width 400ms ease',
        }} />
      </div>
    </div>
  )
}

function CategoryBreakdowns({ incomeCategories = [], expenseCategories = [], isMobile = false }) {
  const maxIncome = Math.max(...incomeCategories.map(c => c.amount || 0), 1)
  const maxExpense = Math.max(...expenseCategories.map(c => c.amount || 0), 1)

  return (
    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 16, marginBottom: 24 }}>
      {/* Income */}
      <div style={{ ...GLASS_CARD }}>
        <div style={{
          fontSize: 11, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase',
          color: 'rgba(255,255,255,0.35)', marginBottom: 16,
        }}>Income by Category</div>
        {incomeCategories.length === 0
          ? <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.25)' }}>No income categories</div>
          : incomeCategories.map((c, i) => (
            <CategoryBar key={i} name={c.category || c.name} amount={c.amount} max={maxIncome} isIncome={true} />
          ))
        }
      </div>

      {/* Expenses */}
      <div style={{ ...GLASS_CARD }}>
        <div style={{
          fontSize: 11, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase',
          color: 'rgba(255,255,255,0.35)', marginBottom: 16,
        }}>Expenses by Category</div>
        {expenseCategories.length === 0
          ? <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.25)' }}>No expense categories</div>
          : expenseCategories.map((c, i) => (
            <CategoryBar key={i} name={c.category || c.name} amount={c.amount} max={maxExpense} isIncome={false} />
          ))
        }
      </div>
    </div>
  )
}

// ─── Shows table ──────────────────────────────────────────────────────────────

function ShowsTable({ shows }) {
  if (!shows || shows.length === 0) return null

  const thStyle = {
    fontSize: 11, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.35)', padding: '0 0 12px 0', textAlign: 'left',
    borderBottom: '1px solid rgba(255,255,255,0.07)',
  }
  const thRight = { ...thStyle, textAlign: 'right' }

  return (
    <div style={{ ...GLASS_CARD, marginBottom: 24, padding: '20px 24px' }}>
      <div style={{
        fontSize: 11, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase',
        color: 'rgba(255,255,255,0.35)', marginBottom: 16,
      }}>Shows</div>
      {/* Horizontal scroll on mobile with fade gradient indicator */}
      <div className="table-scroll-container">
      <table style={{ width: '100%', minWidth: 480, borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={thStyle}>Show</th>
            <th style={thStyle}>Date</th>
            <th style={thRight}>Income</th>
            <th style={thRight}>Expenses</th>
            <th style={thRight}>Net</th>
          </tr>
        </thead>
        <tbody>
          {shows.map((s, i) => {
            const net = (s.income || 0) - (s.expenses || 0)
            const isEven = i % 2 === 0
            return (
              <tr
                key={i}
                style={{
                  background: isEven ? 'transparent' : 'rgba(255,255,255,0.015)',
                  transition: 'background 150ms ease',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)' }}
                onMouseLeave={e => { e.currentTarget.style.background = isEven ? 'transparent' : 'rgba(255,255,255,0.015)' }}
              >
                <td style={{ padding: '10px 0', fontSize: 13, color: 'rgba(255,255,255,0.80)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  {s.show_name || s.name || s.show || '—'}
                </td>
                <td style={{ padding: '10px 12px 10px 0', fontSize: 12, color: 'rgba(255,255,255,0.40)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  {s.date ? new Date(s.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                </td>
                <td style={{ padding: '10px 0', fontSize: 13, color: '#4ade80', textAlign: 'right', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  {formatCurrency(s.income || 0)}
                </td>
                <td style={{ padding: '10px 0', fontSize: 13, color: '#f87171', textAlign: 'right', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  {formatCurrency(s.expenses || 0)}
                </td>
                <td style={{ padding: '10px 0', fontSize: 13, fontWeight: 600, color: net >= 0 ? '#4ade80' : '#f87171', textAlign: 'right', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  {net < 0 ? '-' : ''}{formatCurrency(net)}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      </div>
    </div>
  )
}

// ─── Budget vs Actuals ────────────────────────────────────────────────────────

function BudgetVsActuals({ items }) {
  if (!items || items.length === 0) return null

  const maxVal = Math.max(...items.map(b => Math.max(b.budget || 0, b.actual || 0)), 1)

  return (
    <div style={{ ...GLASS_CARD, marginBottom: 24 }}>
      <div style={{
        fontSize: 11, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase',
        color: 'rgba(255,255,255,0.35)', marginBottom: 16,
      }}>Budget vs Actuals</div>

      {items.map((item, i) => {
        const over = (item.actual || 0) > (item.budget || 0)
        const budgetPct = ((item.budget || 0) / maxVal) * 100
        const actualPct = ((item.actual || 0) / maxVal) * 100

        return (
          <div
            key={i}
            style={{
              padding: '12px 14px',
              borderRadius: 8,
              background: over ? 'rgba(248,113,113,0.05)' : 'transparent',
              border: over ? '1px solid rgba(248,113,113,0.12)' : '1px solid transparent',
              marginBottom: 8,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.75)' }}>{item.category || item.name}</span>
              <div style={{ display: 'flex', gap: 16 }}>
                <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.40)' }}>
                  Budget: <span style={{ color: 'rgba(99,102,241,0.90)', fontWeight: 500 }}>{formatCurrency(item.budget || 0)}</span>
                </span>
                <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.40)' }}>
                  Actual: <span style={{ color: over ? '#f87171' : '#4ade80', fontWeight: 500 }}>{formatCurrency(item.actual || 0)}</span>
                </span>
              </div>
            </div>

            {/* Budget bar */}
            <div style={{ marginBottom: 4 }}>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', marginBottom: 3 }}>Budget</div>
              <div style={{ height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{
                  height: '100%', width: `${budgetPct}%`,
                  background: 'rgba(99,102,241,0.30)', borderRadius: 3,
                  transition: 'width 400ms ease',
                }} />
              </div>
            </div>

            {/* Actual bar */}
            <div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', marginBottom: 3 }}>Actual</div>
              <div style={{ height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{
                  height: '100%', width: `${actualPct}%`,
                  background: over ? 'rgba(248,113,113,0.55)' : 'rgba(74,222,128,0.45)',
                  borderRadius: 3,
                  transition: 'width 400ms ease',
                }} />
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Raw Data table ───────────────────────────────────────────────────────────

function RawEntriesTable({ entries }) {
  const [collapsed, setCollapsed] = useState(true)
  if (!entries || entries.length === 0) return null

  const thStyle = {
    fontSize: 11, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.35)', padding: '0 12px 12px 0', textAlign: 'left',
    borderBottom: '1px solid rgba(255,255,255,0.07)',
  }
  const thRight = { ...thStyle, textAlign: 'right' }
  const tdStyle = { padding: '9px 12px 9px 0', fontSize: 12, color: 'rgba(255,255,255,0.70)', borderBottom: '1px solid rgba(255,255,255,0.04)' }
  const tdRight = { ...tdStyle, textAlign: 'right' }

  const TYPE_COLORS = { income: '#4ade80', expense: '#f87171', show: '#a89fff', budget: '#60a5fa', other: 'rgba(255,255,255,0.35)' }

  return (
    <div style={{ ...GLASS_CARD, marginBottom: 24 }}>
      <div
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', marginBottom: collapsed ? 0 : 16 }}
        onClick={() => setCollapsed(c => !c)}
      >
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)' }}>
          Raw Entries ({entries.length})
        </div>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.30)', userSelect: 'none' }}>{collapsed ? '▼ expand' : '▲ collapse'}</div>
      </div>

      {!collapsed && (
        <div className="table-scroll-container">
        <table style={{ width: '100%', minWidth: 560, borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={thStyle}>Tab</th>
              <th style={thStyle}>Category</th>
              <th style={thStyle}>Description</th>
              <th style={thStyle}>Date</th>
              <th style={thStyle}>Type</th>
              <th style={thRight}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e, i) => {
              const isEven = i % 2 === 0
              const typeColor = TYPE_COLORS[e.entry_type] || TYPE_COLORS.other
              return (
                <tr
                  key={e.id}
                  style={{ background: isEven ? 'transparent' : 'rgba(255,255,255,0.015)' }}
                  onMouseEnter={ev => { ev.currentTarget.style.background = 'rgba(255,255,255,0.04)' }}
                  onMouseLeave={ev => { ev.currentTarget.style.background = isEven ? 'transparent' : 'rgba(255,255,255,0.015)' }}
                >
                  <td style={tdStyle}>{e.sheet_tab || '—'}</td>
                  <td style={tdStyle}>{e.category || '—'}</td>
                  <td style={{ ...tdStyle, maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.description || '—'}</td>
                  <td style={{ ...tdStyle, color: 'rgba(255,255,255,0.40)' }}>{e.entry_date || '—'}</td>
                  <td style={tdStyle}>
                    <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: typeColor }}>
                      {e.entry_type}
                    </span>
                  </td>
                  <td style={{ ...tdRight, color: (e.amount || 0) >= 0 ? '#4ade80' : '#f87171', fontWeight: 500 }}>
                    {e.amount != null ? formatCurrency(e.amount) : '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        </div>
      )}
    </div>
  )
}

// ─── Main Finance view ────────────────────────────────────────────────────────

export default function Finance({ onNavigate }) {
  const isMobile = useIsMobile()
  const [year,    setYear]    = useState(new Date().getFullYear())
  const [years,   setYears]   = useState([])
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [error,   setError]   = useState(null)

  // Load available years on mount
  useEffect(() => {
    api.financeYears().then(setYears).catch(() => setYears([]))
  }, [])

  // Load finance data when year changes
  useEffect(() => {
    setLoading(true)
    setError(null)
    api.finance(year)
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [year])

  const handleSync = () => {
    setSyncing(true)
    api.financeSync()
      .then(() => api.finance(year).then(setData))
      .catch(e => setError(e.message))
      .finally(() => setSyncing(false))
  }

  const displayYears = years.length > 0 ? years : [2024, 2025]

  return (
    <div style={{
      padding: isMobile ? '16px 16px' : '32px 40px',
      paddingTop: isMobile ? 'calc(16px + env(safe-area-inset-top, 0px))' : '32px',
      maxWidth: 1200, margin: '0 auto',
    }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: isMobile ? 'flex-start' : 'center', flexDirection: isMobile ? 'column' : 'row', gap: isMobile ? 12 : 0, justifyContent: 'space-between', marginBottom: 32 }}>
        <div>
          <h1 style={{
            // 22px on mobile, 28px on desktop
            fontSize: isMobile ? 22 : 28, fontWeight: 700, letterSpacing: '-0.02em', margin: 0,
            background: 'linear-gradient(135deg, #ffffff 0%, rgba(255,255,255,0.75) 100%)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
          }}>
            Finance
          </h1>
          {data?.synced_at && (
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', marginTop: 4 }}>
              Last synced {new Date(data.synced_at).toLocaleDateString()}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          {/* Year tabs */}
          <div style={{
            display: 'flex',
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 8,
            overflow: 'hidden',
          }}>
            {displayYears.map((y, i) => (
              <button
                key={y}
                onClick={() => setYear(y)}
                style={{
                  padding: '6px 16px', fontSize: 13, fontWeight: 500, cursor: 'pointer', border: 'none',
                  borderRight: i < displayYears.length - 1 ? '1px solid rgba(255,255,255,0.08)' : 'none',
                  background: year === y ? 'rgba(124,106,247,0.20)' : 'transparent',
                  color: year === y ? '#a89fff' : 'rgba(255,255,255,0.45)',
                  transition: 'all 150ms ease',
                }}
              >{y}</button>
            ))}
          </div>

          {/* Sync button */}
          <button
            onClick={handleSync}
            disabled={syncing}
            style={{
              padding: '7px 16px', fontSize: 13, fontWeight: 500,
              cursor: syncing ? 'default' : 'pointer',
              background: 'linear-gradient(135deg, rgba(124,106,247,0.70) 0%, rgba(99,102,241,0.60) 100%)',
              border: '1px solid rgba(124,106,247,0.50)',
              borderRadius: 8, color: '#fff',
              opacity: syncing ? 0.7 : 1,
              transition: 'all 150ms ease',
            }}
          >{syncing ? 'Syncing…' : '↻ Sync'}</button>
        </div>
      </div>

      {/* ── Error banner ── */}
      {error && (
        <div style={{
          ...GLASS_CARD,
          padding: '16px 20px',
          marginBottom: 24,
          border: '1px solid rgba(248,113,113,0.30)',
          background: 'rgba(248,113,113,0.07)',
        }}>
          <div style={{ fontSize: 13, color: '#fca5a5', fontWeight: 500, marginBottom: 4 }}>Failed to load finance data</div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>{error}</div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', marginTop: 6 }}>
            Go to{' '}
            <button
              onClick={() => onNavigate && onNavigate('integrations')}
              style={{ background: 'none', border: 'none', padding: 0, color: '#a89fff', cursor: 'pointer', fontSize: 12, textDecoration: 'underline' }}
            >Integrations → Google</button>
            , disconnect and reconnect to grant Sheets access, then click Sync.
          </div>
        </div>
      )}

      {/* ── Loading skeleton ── */}
      {loading && <SkeletonLoader />}

      {/* ── Empty state ── */}
      {!loading && !error && (!data || (!data.raw_entries?.length && !data.summary)) && (
        <div style={{
          ...GLASS_CARD,
          padding: '48px 32px',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: 32, marginBottom: 16, opacity: 0.4 }}>◬</div>
          <div style={{ fontSize: 16, color: 'rgba(255,255,255,0.60)', fontWeight: 500, marginBottom: 8 }}>
            No finance data for {year}
          </div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.35)', lineHeight: 1.6 }}>
            Go to{' '}
            <button
              onClick={() => onNavigate && onNavigate('integrations')}
              style={{ background: 'none', border: 'none', padding: 0, color: '#a89fff', cursor: 'pointer', fontSize: 13, textDecoration: 'underline' }}
            >Integrations → Google</button>
            , disconnect and reconnect to grant Sheets access, then click Sync.
          </div>
        </div>
      )}

      {/* ── Dashboard content ── */}
      {!loading && (data?.summary || data?.raw_entries?.length > 0) && (
        <>
          {/* Row 1: Stat cards — 1 col on mobile, 3 on desktop */}
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: 16, marginBottom: 24 }}>
            <StatCard label="Total Income"   amount={data.summary?.income   || 0} color="#4ade80" />
            <StatCard label="Total Expenses" amount={data.summary?.expenses || 0} color="#f87171" />
            <StatCard
              label="Net"
              amount={data.summary?.net || 0}
              color={(data.summary?.net || 0) >= 0 ? '#a89fff' : '#f87171'}
            />
          </div>

          {/* Row 2: Monthly bar chart — horizontal scroll on mobile */}
          {data.monthly && data.monthly.length > 0 && (
            <div style={{ position: 'relative', ...(isMobile && { overflowX: 'auto' }) }}>
              <div style={isMobile ? { minWidth: 480 } : {}}>
                <MonthlyChart monthly={data.monthly} />
              </div>
            </div>
          )}

          {/* Row 3: Category breakdowns — 1 col on mobile */}
          {(data.income_categories?.length > 0 || data.expense_categories?.length > 0) && (
            <CategoryBreakdowns
              incomeCategories={data.income_categories || []}
              expenseCategories={data.expense_categories || []}
              isMobile={isMobile}
            />
          )}

          {/* Row 4: Shows table — horizontal scroll on mobile */}
          {data.shows?.length > 0 && (
            <div style={isMobile ? { overflowX: 'auto' } : {}}>
              <ShowsTable shows={data.shows} />
            </div>
          )}

          {/* Row 5: Budget vs Actuals */}
          {data.budget_vs_actuals?.length > 0 && <BudgetVsActuals items={data.budget_vs_actuals} />}

          {/* Row 6: Raw entries table (always shown when data exists) */}
          <RawEntriesTable entries={data.raw_entries} />
        </>
      )}
    </div>
  )
}
