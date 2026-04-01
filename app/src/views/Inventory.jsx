import { useEffect, useState, useRef } from 'react'
import useIsMobile from '../hooks/useIsMobile'

const BASE = '/api'
function getToken() { return localStorage.getItem('vlt_token') || '' }
async function req(path, options = {}) {
  const token = getToken()
  const res = await fetch(BASE + path, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...options,
  })
  if (!res.ok) throw new Error(`API ${res.status}: ${path}`)
  if (res.status === 204) return null
  return res.json()
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtPrice(cents) {
  if (cents == null) return '—'
  return '$' + (cents / 100).toFixed(2)
}

function fmtDate(str) {
  if (!str) return '—'
  const d = new Date(str)
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function orderId(id) {
  if (!id) return '—'
  return id.slice(-8).toUpperCase()
}

function qtyColor(qty) {
  if (qty === 0)   return '#f87171'
  if (qty <= 4)    return '#fbbf24'
  return '#4ade80'
}

function stateBadgeStyle(state) {
  const s = (state || '').toUpperCase()
  if (s === 'COMPLETED') return { color: '#4ade80', background: 'rgba(74,222,128,0.12)', border: '1px solid rgba(74,222,128,0.30)' }
  if (s === 'OPEN')      return { color: '#a78bfa', background: 'rgba(167,139,250,0.12)', border: '1px solid rgba(167,139,250,0.30)' }
  return { color: 'rgba(255,255,255,0.40)', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)' }
}

const GLASS_CARD = {
  background: 'rgba(255,255,255,0.03)',
  backdropFilter: 'blur(12px)',
  WebkitBackdropFilter: 'blur(12px)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 12,
  boxShadow: '0 4px 24px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.06)',
}

const SQUARE_BLUE = '#006AFF'

// ─── Stat Card ───────────────────────────────────────────────────────────────

function StatCard({ value, label, accent }) {
  return (
    <div style={{
      ...GLASS_CARD,
      padding: '18px 20px',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 4,
      border: accent ? `1px solid ${accent}44` : '1px solid rgba(255,255,255,0.08)',
      boxShadow: accent
        ? `0 4px 24px rgba(0,0,0,0.2), 0 0 0 1px ${accent}18, inset 0 1px 0 rgba(255,255,255,0.06)`
        : '0 4px 24px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.06)',
    }}>
      <div style={{
        fontSize: 32,
        fontWeight: 800,
        letterSpacing: '-0.03em',
        color: accent || '#fff',
        lineHeight: 1,
      }}>
        {value ?? '—'}
      </div>
      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.40)', textAlign: 'center', marginTop: 2 }}>
        {label}
      </div>
    </div>
  )
}

// ─── Square Not Connected Empty State ────────────────────────────────────────

function SquareNotConnected({ onConnect }) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 16,
      padding: '64px 32px',
      textAlign: 'center',
    }}>
      <div style={{
        width: 56, height: 56, borderRadius: 12,
        background: `${SQUARE_BLUE}18`,
        border: `1px solid ${SQUARE_BLUE}44`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <svg width="28" height="28" viewBox="0 0 24 24" fill={SQUARE_BLUE}>
          <rect x="2" y="2" width="20" height="20" rx="3"/>
          <rect x="7" y="7" width="10" height="10" rx="1" fill="#0d0d14"/>
        </svg>
      </div>
      <div>
        <div style={{ fontSize: 16, fontWeight: 600, color: 'rgba(255,255,255,0.75)', marginBottom: 6 }}>
          Connect Square to sync inventory and orders
        </div>
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.35)' }}>
          Link your Square account to see stock levels, sales, and orders.
        </div>
      </div>
      <button
        onClick={onConnect}
        style={{
          padding: '10px 24px', fontSize: 13, fontWeight: 600,
          background: SQUARE_BLUE,
          border: 'none',
          borderRadius: 8, color: '#fff',
          cursor: 'pointer', transition: 'opacity 150ms',
        }}
        onMouseEnter={e => { e.currentTarget.style.opacity = '0.85' }}
        onMouseLeave={e => { e.currentTarget.style.opacity = '1' }}
      >
        Connect Square
      </button>
    </div>
  )
}

// ─── Stock Tab ────────────────────────────────────────────────────────────────

function StockTab({ items, squareConnected, onConnect }) {
  const [search, setSearch]     = useState('')
  const [expanded, setExpanded] = useState(null)

  if (!squareConnected) {
    return <SquareNotConnected onConnect={onConnect} />
  }

  const filtered = (items || []).filter(item =>
    item.name?.toLowerCase().includes(search.toLowerCase()) ||
    item.sku?.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div>
      {/* Search */}
      <div style={{ marginBottom: 16 }}>
        <input
          type="text"
          placeholder="Search items or SKU…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            width: '100%',
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 8,
            padding: '10px 16px',
            fontSize: 14,
            color: '#fff',
            outline: 'none',
            boxSizing: 'border-box',
            transition: 'border-color 150ms',
          }}
          onFocus={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.28)' }}
          onBlur={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)' }}
        />
      </div>

      {/* Item list */}
      {filtered.length === 0 ? (
        <div style={{ padding: '32px 0', textAlign: 'center', color: 'rgba(255,255,255,0.30)', fontSize: 14 }}>
          {items?.length === 0 ? 'No items synced yet.' : 'No items match your search.'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {filtered.map((item, i) => {
            const qty   = item.total_quantity ?? 0
            const color = qtyColor(qty)
            const isExp = expanded === item.square_id
            // location_breakdown comes back as "Name:qty|Name2:qty2" string from GROUP_CONCAT
            const locs  = item.location_breakdown
              ? item.location_breakdown.split('|').map(seg => {
                  const lastColon = seg.lastIndexOf(':')
                  return lastColon === -1
                    ? { name: seg, quantity: 0 }
                    : { name: seg.slice(0, lastColon), quantity: parseFloat(seg.slice(lastColon + 1)) || 0 }
                })
              : []

            return (
              <div key={item.square_id || i}>
                <button
                  onClick={() => setExpanded(isExp ? null : item.square_id)}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    minHeight: 56,
                    padding: '10px 16px',
                    background: isExp ? 'rgba(255,255,255,0.05)' : i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.018)',
                    border: 'none',
                    borderRadius: isExp ? '8px 8px 0 0' : 8,
                    cursor: 'pointer',
                    gap: 12,
                    textAlign: 'left',
                    transition: 'background 120ms',
                  }}
                  onMouseEnter={e => { if (!isExp) e.currentTarget.style.background = 'rgba(255,255,255,0.04)' }}
                  onMouseLeave={e => { if (!isExp) e.currentTarget.style.background = i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.018)' }}
                >
                  {/* Name + SKU */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 600, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {item.name || 'Unnamed'}
                    </div>
                    {item.sku && (
                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 1 }}>
                        SKU: {item.sku}
                      </div>
                    )}
                  </div>

                  {/* Price */}
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.40)', flexShrink: 0 }}>
                    {fmtPrice(item.price_cents)}
                  </div>

                  {/* Qty badge */}
                  <div style={{
                    minWidth: 44,
                    padding: qty === 0 ? '5px 10px' : '5px 12px',
                    borderRadius: 20,
                    background: qty === 0 ? '#f87171' : `${color}18`,
                    border: `1px solid ${color}55`,
                    color: qty === 0 ? '#fff' : color,
                    fontSize: 14,
                    fontWeight: 700,
                    textAlign: 'center',
                    flexShrink: 0,
                    letterSpacing: qty === 0 ? '0.05em' : 0,
                  }}>
                    {qty === 0 ? 'OUT' : qty}
                  </div>

                  {/* Chevron */}
                  <div style={{
                    fontSize: 14,
                    color: 'rgba(255,255,255,0.30)',
                    transform: isExp ? 'rotate(90deg)' : 'rotate(0deg)',
                    transition: 'transform 200ms',
                    flexShrink: 0,
                  }}>›</div>
                </button>

                {/* Expanded: location breakdown */}
                {isExp && (
                  <div style={{
                    background: 'rgba(255,255,255,0.025)',
                    border: '0 solid transparent',
                    borderRadius: '0 0 8px 8px',
                    padding: '12px 16px 14px',
                    borderTop: '1px solid rgba(255,255,255,0.06)',
                  }}>
                    {locs.length === 0 ? (
                      <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.30)' }}>No location data available.</div>
                    ) : (
                      <div>
                        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.30)', marginBottom: 8 }}>
                          Location Breakdown
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {locs.map((loc, li) => (
                            <div key={li} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                              <span style={{ color: 'rgba(255,255,255,0.60)' }}>{loc.name || loc.location_name || `Location ${li + 1}`}</span>
                              <span style={{ color: qtyColor(loc.quantity ?? 0), fontWeight: 600 }}>{loc.quantity ?? 0}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {item.description && (
                      <div style={{ marginTop: 10, fontSize: 12, color: 'rgba(255,255,255,0.35)', lineHeight: 1.5 }}>
                        {item.description}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Orders Tab ───────────────────────────────────────────────────────────────

function OrdersTab({ orders, squareConnected, onConnect }) {
  const [filter, setFilter] = useState('ALL')
  const FILTERS = ['ALL', 'OPEN', 'COMPLETED', 'CANCELED']

  if (!squareConnected) {
    return <SquareNotConnected onConnect={onConnect} />
  }

  const filtered = (orders || []).filter(o =>
    filter === 'ALL' || (o.state || '').toUpperCase() === filter
  )

  return (
    <div>
      {/* Filter pills */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {FILTERS.map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              padding: '6px 14px',
              fontSize: 12,
              fontWeight: 600,
              borderRadius: 20,
              border: filter === f ? '1px solid rgba(124,106,247,0.60)' : '1px solid rgba(255,255,255,0.12)',
              background: filter === f ? 'rgba(124,106,247,0.18)' : 'transparent',
              color: filter === f ? '#c4b5fd' : 'rgba(255,255,255,0.45)',
              cursor: 'pointer',
              transition: 'all 150ms',
            }}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Orders */}
      {filtered.length === 0 ? (
        <div style={{ padding: '32px 0', textAlign: 'center', color: 'rgba(255,255,255,0.30)', fontSize: 14 }}>
          No orders found.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filtered.map((order, i) => {
            const bs = stateBadgeStyle(order.state)
            const buyerName = order.buyer_name || order.customer_name || order.recipient_name || null
            const items = order.items || order.line_items || []
            return (
              <div key={order.id || order.square_id || i} style={{
                ...GLASS_CARD,
                padding: '16px 18px',
              }}>
                {/* Order header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#fff', letterSpacing: '0.04em' }}>
                      #{orderId(order.id || order.square_id)}
                    </span>
                    <span style={{
                      ...bs,
                      fontSize: 10, fontWeight: 700,
                      padding: '3px 9px', borderRadius: 20,
                      letterSpacing: '0.08em',
                    }}>
                      {(order.state || 'UNKNOWN').toUpperCase()}
                    </span>
                  </div>
                  <span style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>
                    {fmtPrice(order.total_money_cents ?? order.total_cents ?? null)}
                  </span>
                </div>

                {/* Sub-line */}
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', marginBottom: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {items.length > 0 && <span>{items.length} item{items.length !== 1 ? 's' : ''}</span>}
                  {buyerName && <><span style={{ opacity: 0.4 }}>·</span><span>{buyerName}</span></>}
                  {(order.created_at || order.date) && (
                    <><span style={{ opacity: 0.4 }}>·</span><span>{fmtDate(order.created_at || order.date)}</span></>
                  )}
                </div>

                {/* Divider */}
                {items.length > 0 && (
                  <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {items.map((item, ii) => (
                      <div key={ii} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
                        <span style={{ color: 'rgba(255,255,255,0.65)' }}>
                          {item.name || item.item_name || 'Item'}{item.quantity && item.quantity > 1 ? ` × ${item.quantity}` : ''}
                        </span>
                        <span style={{ color: 'rgba(255,255,255,0.45)', fontWeight: 500 }}>
                          {fmtPrice(item.total_money_cents ?? item.price_cents ?? null)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Bandcamp Tab ─────────────────────────────────────────────────────────────

function BandcampTab() {
  const [file, setFile]           = useState(null)
  const [csvText, setCsvText]     = useState('')
  const [importing, setImporting] = useState(false)
  const [result, setResult]       = useState(null)
  const [importErr, setImportErr] = useState(null)
  const [dragging, setDragging]   = useState(false)
  const [orders, setOrders]       = useState(null)
  const [loadingOrders, setLoadingOrders] = useState(true)
  const fileInputRef              = useRef(null)

  useEffect(() => {
    setLoadingOrders(true)
    req('/inventory/bandcamp/orders')
      .then(data => setOrders(Array.isArray(data) ? data : []))
      .catch(() => setOrders([]))
      .finally(() => setLoadingOrders(false))
  }, [result])

  const handleImport = async () => {
    const text = csvText || (file ? await file.text() : '')
    if (!text.trim()) { setImportErr('No CSV content to import.'); return }
    setImporting(true)
    setImportErr(null)
    setResult(null)
    try {
      const res = await req('/inventory/bandcamp/import', {
        method: 'POST',
        body: JSON.stringify({ csv_content: text }),
      })
      setResult(res)
      setCsvText('')
      setFile(null)
    } catch (e) {
      setImportErr(e.message)
    } finally {
      setImporting(false)
    }
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setDragging(false)
    const dropped = e.dataTransfer.files[0]
    if (dropped) setFile(dropped)
  }

  return (
    <div>
      {/* Import section */}
      <div style={{ ...GLASS_CARD, padding: '20px 24px', marginBottom: 24 }}>
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)', marginBottom: 16 }}>
          Import Bandcamp Sales CSV
        </div>

        {/* Drop zone */}
        <div
          onDragOver={e => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          style={{
            border: `2px dashed ${dragging ? 'rgba(124,106,247,0.70)' : file ? 'rgba(74,222,128,0.50)' : 'rgba(255,255,255,0.15)'}`,
            borderRadius: 10,
            padding: '24px 20px',
            textAlign: 'center',
            cursor: 'pointer',
            background: dragging ? 'rgba(124,106,247,0.06)' : file ? 'rgba(74,222,128,0.04)' : 'transparent',
            transition: 'all 200ms',
            marginBottom: 14,
          }}
        >
          <input ref={fileInputRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={e => { setFile(e.target.files[0] || null) }} />
          {file ? (
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#4ade80' }}>{file.name}</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 4 }}>{(file.size / 1024).toFixed(1)} KB — click to change</div>
            </div>
          ) : (
            <div>
              <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.55)' }}>Drop your Bandcamp sales CSV here</div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.30)', marginTop: 4 }}>or click to browse</div>
            </div>
          )}
        </div>

        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.30)', marginBottom: 8, textAlign: 'center' }}>
          or paste CSV text below
        </div>

        <textarea
          placeholder="Paste CSV content here…"
          value={csvText}
          onChange={e => setCsvText(e.target.value)}
          rows={5}
          style={{
            width: '100%',
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.10)',
            borderRadius: 8,
            padding: '10px 14px',
            fontSize: 12,
            color: '#fff',
            outline: 'none',
            resize: 'vertical',
            boxSizing: 'border-box',
            fontFamily: 'monospace',
            lineHeight: 1.5,
            transition: 'border-color 150ms',
            marginBottom: 14,
          }}
          onFocus={e => { e.currentTarget.style.borderColor = 'rgba(124,106,247,0.50)' }}
          onBlur={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.10)' }}
        />

        {importErr && (
          <div style={{
            fontSize: 12, color: '#fca5a5',
            background: 'rgba(248,113,113,0.08)',
            border: '1px solid rgba(248,113,113,0.20)',
            borderRadius: 6, padding: '8px 12px', marginBottom: 12,
          }}>
            {importErr}
          </div>
        )}

        {result && (
          <div style={{
            fontSize: 13, color: '#4ade80',
            background: 'rgba(74,222,128,0.07)',
            border: '1px solid rgba(74,222,128,0.22)',
            borderRadius: 6, padding: '10px 14px', marginBottom: 12,
            fontWeight: 500,
          }}>
            Imported {result.imported ?? 0} orders, {result.skipped ?? 0} skipped
          </div>
        )}

        <button
          onClick={handleImport}
          disabled={importing || (!file && !csvText.trim())}
          style={{
            padding: '10px 22px', fontSize: 13, fontWeight: 600,
            background: importing ? 'rgba(124,106,247,0.35)' : 'linear-gradient(135deg, rgba(124,106,247,0.70) 0%, rgba(99,102,241,0.60) 100%)',
            border: '1px solid rgba(124,106,247,0.50)',
            borderRadius: 8, color: '#fff',
            cursor: (importing || (!file && !csvText.trim())) ? 'default' : 'pointer',
            opacity: (!file && !csvText.trim()) ? 0.5 : 1,
            transition: 'all 150ms',
          }}
        >
          {importing ? 'Importing…' : 'Import CSV'}
        </button>
      </div>

      {/* Bandcamp orders list */}
      <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)', marginBottom: 12 }}>
        Bandcamp Order History
      </div>

      {loadingOrders ? (
        <div style={{ padding: '24px 0', textAlign: 'center', color: 'rgba(255,255,255,0.25)', fontSize: 13 }}>Loading…</div>
      ) : !orders || orders.length === 0 ? (
        <div style={{ padding: '24px 0', textAlign: 'center', color: 'rgba(255,255,255,0.30)', fontSize: 13 }}>
          No Bandcamp orders imported yet.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {orders.map((o, i) => (
            <div key={o.id || i} style={{ ...GLASS_CARD, padding: '14px 18px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 4 }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>
                    {o.item_name || o.name || 'Order'}
                    {o.quantity && o.quantity > 1 ? <span style={{ color: 'rgba(255,255,255,0.45)', fontWeight: 400 }}> × {o.quantity}</span> : ''}
                  </div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 3, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {(o.buyer_name || o.name) && <span>{o.buyer_name || o.name}</span>}
                    {o.ship_country && <><span style={{ opacity: 0.4 }}>·</span><span>{o.ship_country}</span></>}
                    {(o.date || o.sale_date || o.created_at) && (
                      <><span style={{ opacity: 0.4 }}>·</span><span>{fmtDate(o.date || o.sale_date || o.created_at)}</span></>
                    )}
                    {o.shipped !== undefined && (
                      <><span style={{ opacity: 0.4 }}>·</span>
                      <span style={{ color: o.shipped ? '#4ade80' : '#fbbf24' }}>
                        {o.shipped ? 'Shipped' : 'Unshipped'}
                      </span></>
                    )}
                  </div>
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
                  {o.amount_paid_cents != null ? fmtPrice(o.amount_paid_cents) : (o.amount_paid ? `$${Number(o.amount_paid).toFixed(2)}` : '—')}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Main Inventory View ──────────────────────────────────────────────────────

export default function Inventory({ onNavigate }) {
  const isMobile = useIsMobile()

  const [stats,        setStats]        = useState(null)
  const [items,        setItems]        = useState([])
  const [orders,       setOrders]       = useState([])
  const [loading,      setLoading]      = useState(true)
  const [syncing,      setSyncing]      = useState(false)
  const [activeTab,    setActiveTab]    = useState('stock')
  const [error,        setError]        = useState(null)

  const TABS = [
    { id: 'stock',     label: 'Stock' },
    { id: 'orders',    label: 'Orders' },
    { id: 'bandcamp',  label: 'Bandcamp' },
  ]

  const loadData = async () => {
    setLoading(true)
    setError(null)
    try {
      const [s, i, o] = await Promise.all([
        req('/inventory/stats').catch(() => null),
        req('/inventory/items').catch(() => []),
        req('/inventory/orders?limit=50&offset=0').catch(() => []),
      ])
      setStats(s)
      setItems(Array.isArray(i) ? i : [])
      setOrders(Array.isArray(o) ? o : [])
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadData() }, [])

  const handleSquareSync = async () => {
    setSyncing(true)
    try {
      await req('/integrations/sync/square', { method: 'POST' })
      // Show spinner for a moment, then reload
      await new Promise(r => setTimeout(r, 2000))
      await loadData()
    } catch (e) {
      setError(e.message)
    } finally {
      setSyncing(false)
    }
  }

  const handleConnectSquare = async () => {
    try {
      const data = await req('/integrations/auth/start/square')
      if (data?.url) window.location.href = data.url
    } catch (e) {
      setError(e.message)
    }
  }

  const squareConnected = stats?.square_connected ?? false

  // Stat card data
  const lowStock  = stats?.low_stock ?? 0
  const outStock  = stats?.out_of_stock ?? 0

  return (
    <div style={{
      padding: isMobile ? '16px 14px' : '32px 40px',
      maxWidth: 1100,
      margin: '0 auto',
      ...(isMobile && { paddingTop: 'env(safe-area-inset-top, 16px)' }),
    }}>

      {/* ── Header ── */}
      <div style={{
        display: 'flex',
        alignItems: isMobile ? 'flex-start' : 'center',
        flexDirection: isMobile ? 'column' : 'row',
        gap: 12,
        justifyContent: 'space-between',
        marginBottom: 28,
      }}>
        <div>
          <h1 style={{
            fontSize: isMobile ? 22 : 28,
            fontWeight: 700,
            letterSpacing: '-0.02em',
            margin: 0,
            background: 'linear-gradient(135deg, #ffffff 0%, #a89fff 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}>
            Inventory
          </h1>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.35)', marginTop: 4 }}>
            Merch stock, orders &amp; sales
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button
            onClick={handleSquareSync}
            disabled={syncing || !squareConnected}
            style={{
              padding: '8px 16px', fontSize: 13, fontWeight: 500,
              background: syncing ? 'rgba(0,106,255,0.25)' : 'rgba(0,106,255,0.15)',
              border: `1px solid ${SQUARE_BLUE}55`,
              borderRadius: 8, color: squareConnected ? SQUARE_BLUE : 'rgba(255,255,255,0.30)',
              cursor: (syncing || !squareConnected) ? 'default' : 'pointer',
              opacity: !squareConnected ? 0.5 : 1,
              transition: 'all 150ms',
              display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            <span style={{
              display: 'inline-block',
              animation: syncing ? 'spin 1s linear infinite' : 'none',
            }}>↻</span>
            {syncing ? 'Syncing…' : 'Sync Square'}
          </button>

          <button
            onClick={() => setActiveTab('bandcamp')}
            style={{
              padding: '8px 16px', fontSize: 13, fontWeight: 500,
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 8, color: 'rgba(255,255,255,0.65)',
              cursor: 'pointer',
              transition: 'all 150ms',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.10)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)' }}
          >
            Import Bandcamp
          </button>
        </div>
      </div>

      {/* ── Error ── */}
      {error && (
        <div style={{
          ...GLASS_CARD,
          padding: '12px 18px',
          marginBottom: 20,
          border: '1px solid rgba(248,113,113,0.30)',
          background: 'rgba(248,113,113,0.07)',
          fontSize: 13, color: '#fca5a5',
        }}>
          {error}
        </div>
      )}

      {/* ── Stat Cards ── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)',
        gap: 12,
        marginBottom: 24,
      }}>
        <StatCard
          value={loading ? '…' : (stats?.total_items ?? 0)}
          label="Total Items"
        />
        <StatCard
          value={loading ? '…' : lowStock}
          label="Low Stock"
          accent={lowStock > 0 ? '#fbbf24' : undefined}
        />
        <StatCard
          value={loading ? '…' : outStock}
          label="Out of Stock"
          accent={outStock > 0 ? '#f87171' : undefined}
        />
        <StatCard
          value={loading ? '…' : (stats?.recent_orders_30d ?? 0)}
          label="Orders (30d)"
        />
        {squareConnected && stats?.revenue_30d_cents != null && (
          <div style={{
            ...GLASS_CARD,
            padding: '18px 20px',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
            gridColumn: isMobile ? 'span 2' : undefined,
          }}>
            <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.03em', color: '#4ade80', lineHeight: 1 }}>
              {fmtPrice(stats.revenue_30d_cents)}
            </div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.40)', textAlign: 'center', marginTop: 2 }}>
              Revenue (30d)
            </div>
          </div>
        )}
      </div>

      {/* ── Tab Bar ── */}
      <div style={{
        display: 'flex',
        gap: 0,
        marginBottom: 20,
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        overflowX: 'auto',
        scrollbarWidth: 'none',
        WebkitOverflowScrolling: 'touch',
      }}>
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '10px 20px',
              fontSize: 13,
              fontWeight: activeTab === tab.id ? 600 : 400,
              color: activeTab === tab.id ? '#c4b5fd' : 'rgba(255,255,255,0.45)',
              background: 'transparent',
              border: 'none',
              borderBottom: activeTab === tab.id ? '2px solid #a89fff' : '2px solid transparent',
              cursor: 'pointer',
              transition: 'color 150ms',
              whiteSpace: 'nowrap',
              marginBottom: -1,
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Tab Content ── */}
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>

      {loading ? (
        <div style={{ padding: '48px 0', textAlign: 'center', color: 'rgba(255,255,255,0.25)', fontSize: 14 }}>
          Loading inventory…
        </div>
      ) : (
        <>
          {activeTab === 'stock' && (
            <StockTab
              items={items}
              squareConnected={squareConnected}
              onConnect={handleConnectSquare}
            />
          )}
          {activeTab === 'orders' && (
            <OrdersTab
              orders={orders}
              squareConnected={squareConnected}
              onConnect={handleConnectSquare}
            />
          )}
          {activeTab === 'bandcamp' && (
            <BandcampTab />
          )}
        </>
      )}
    </div>
  )
}
