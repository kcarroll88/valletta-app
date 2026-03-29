import { useEffect, useState, useCallback, useRef } from 'react'
import { api } from '../api'
import useIsMobile from '../hooks/useIsMobile'

// ─── API Helpers ─────────────────────────────────────────────────────────────

const token = () => localStorage.getItem('vlt_token')
const driveGet  = (path) =>
  fetch('/api' + path, { headers: { Authorization: `Bearer ${token()}` } }).then(r => r.json())
const drivePost = (path, body) =>
  fetch('/api' + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
    body: JSON.stringify(body),
  }).then(r => r.json())
const drivePatch = (path, body) =>
  fetch('/api' + path, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
    body: JSON.stringify(body),
  }).then(r => r.json())

// ─── Folder Meta Map ─────────────────────────────────────────────────────────

const FOLDER_META = {
  'Art & Design':             { color: '#7C3AED' },
  'Music':                    { color: '#2563EB' },
  'Photos':                   { color: '#059669' },
  'Merch':                    { color: '#D97706' },
  'Press & EPK':              { color: '#0891B2' },
  'Videos':                   { color: '#DC2626' },
  'Social Media':             { color: '#7C3AED' },
  'Touring':                  { color: '#64748B' },
  'Business':                 { color: '#374151' },
  'Logos':                    { color: '#8B5CF6' },
  'Flyers & Posters':         { color: '#8B5CF6' },
  'Album & Single Art':       { color: '#8B5CF6' },
  'Banners & Headers':        { color: '#8B5CF6' },
  'Releases':                 { color: '#3B82F6' },
  'Singles':                  { color: '#60A5FA' },
  'EPs & Albums':             { color: '#60A5FA' },
  'Demos & Ideas':            { color: '#3B82F6' },
  'Stems & Sessions':         { color: '#3B82F6' },
  'Live Recordings':          { color: '#3B82F6' },
  'Press Photos':             { color: '#10B981' },
  'Live Shows':               { color: '#10B981' },
  'Behind the Scenes':        { color: '#10B981' },
  'Headshots':                { color: '#10B981' },
  'Designs':                  { color: '#F59E0B' },
  'Product Photos':           { color: '#F59E0B' },
  'Mockups':                  { color: '#F59E0B' },
  'Press Releases':           { color: '#06B6D4' },
  'EPK Materials':            { color: '#06B6D4' },
  'Articles & Features':      { color: '#06B6D4' },
  'Radio & Podcasts':         { color: '#06B6D4' },
  'Music Videos':             { color: '#EF4444' },
  'Live Performances':        { color: '#EF4444' },
  'Short Clips & Reels':      { color: '#EF4444' },
  'Content Calendar Assets':  { color: '#8B5CF6' },
  'Graphics & Templates':     { color: '#8B5CF6' },
  'Captions & Copy':          { color: '#8B5CF6' },
  'Itineraries':              { color: '#94A3B8' },
  'Stage Plots & Riders':     { color: '#94A3B8' },
  'Venue Contacts':           { color: '#94A3B8' },
  'Contracts':                { color: '#6B7280' },
  'Finances':                 { color: '#6B7280' },
  'Band Agreements':          { color: '#6B7280' },
  'Sync & Licensing':         { color: '#6B7280' },
}
const folderMeta = (name) => FOLDER_META[name] || { color: '#6B7280' }

// ─── File Icon Map ────────────────────────────────────────────────────────────

const fileIconMap = (mimeType = '') => {
  if (mimeType.includes('image'))                                     return { color: '#10B981', label: 'IMG' }
  if (mimeType.includes('video'))                                     return { color: '#EF4444', label: 'VID' }
  if (mimeType.includes('audio'))                                     return { color: '#3B82F6', label: 'AUD' }
  if (mimeType.includes('pdf'))                                       return { color: '#F59E0B', label: 'PDF' }
  if (mimeType.includes('spreadsheet') || mimeType.includes('excel')) return { color: '#059669', label: 'XLS' }
  if (mimeType.includes('document') || mimeType.includes('word'))     return { color: '#2563EB', label: 'DOC' }
  if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) return { color: '#DC2626', label: 'PPT' }
  if (mimeType.includes('zip') || mimeType.includes('archive'))       return { color: '#64748B', label: 'ZIP' }
  return { color: '#6B7280', label: 'FILE' }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtSize(bytes) {
  if (!bytes) return '—'
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB'
}

function fmtDate(iso) {
  if (!iso) return '—'
  try {
    const d = new Date(iso.replace('T', ' ').slice(0, 10))
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  } catch {
    return iso.slice(0, 10)
  }
}

function mimeLabel(mimeType) {
  if (!mimeType) return 'File'
  if (mimeType.includes('image'))        return 'Image'
  if (mimeType.includes('video'))        return 'Video'
  if (mimeType.includes('audio'))        return 'Audio'
  if (mimeType.includes('pdf'))          return 'PDF'
  if (mimeType.includes('spreadsheet') || mimeType.includes('excel')) return 'Spreadsheet'
  if (mimeType.includes('document') || mimeType.includes('word'))     return 'Document'
  if (mimeType.includes('presentation')) return 'Presentation'
  if (mimeType.includes('zip') || mimeType.includes('archive'))       return 'Archive'
  return 'File'
}

// Walk tree to find folder by id, returns array of ancestor folders (path)
function findFolderPath(tree, targetId, path = []) {
  for (const folder of tree) {
    const newPath = [...path, folder]
    if (folder.id === targetId) return newPath
    if (folder.children && folder.children.length > 0) {
      const found = findFolderPath(folder.children, targetId, newPath)
      if (found) return found
    }
  }
  return null
}

// Find folder object by id anywhere in tree
function findFolder(tree, id) {
  for (const folder of tree) {
    if (folder.id === id) return folder
    if (folder.children && folder.children.length > 0) {
      const found = findFolder(folder.children, id)
      if (found) return found
    }
  }
  return null
}

// ─── SVG Icon Components ──────────────────────────────────────────────────────

function FolderIcon({ color = '#4A90D9', size = 48 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Folder tab */}
      <path
        d="M4 14C4 12.9 4.9 12 6 12H18L22 16H42C43.1 16 44 16.9 44 18V38C44 39.1 43.1 40 42 40H6C4.9 40 4 39.1 4 38V14Z"
        fill={color}
        opacity="0.9"
      />
      {/* Folder body highlight */}
      <path
        d="M4 18H44V38C44 39.1 43.1 40 42 40H6C4.9 40 4 39.1 4 38V18Z"
        fill={color}
      />
      {/* Shine overlay */}
      <path
        d="M4 18H44V22H4V18Z"
        fill="white"
        opacity="0.15"
      />
    </svg>
  )
}

function FileIcon({ mimeType = '', size = 48 }) {
  const { color, label } = fileIconMap(mimeType)

  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Document body */}
      <path
        d="M10 6C10 4.9 10.9 4 12 4H30L38 12V42C38 43.1 37.1 44 36 44H12C10.9 44 10 43.1 10 42V6Z"
        fill="rgba(255,255,255,0.08)"
        stroke="rgba(255,255,255,0.15)"
        strokeWidth="1"
      />
      {/* Folded corner */}
      <path
        d="M30 4L38 12H32C30.9 12 30 11.1 30 10V4Z"
        fill={color}
        opacity="0.7"
      />
      {/* Type label bar */}
      <rect x="10" y="28" width="28" height="10" rx="2" fill={color} opacity="0.85" />
      {/* Type text */}
      <text
        x="24"
        y="36"
        textAnchor="middle"
        fill="white"
        fontSize="7"
        fontFamily="system-ui, sans-serif"
        fontWeight="600"
      >
        {label}
      </text>
      {/* Content lines */}
      <line x1="14" y1="20" x2="34" y2="20" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="14" y1="24" x2="28" y2="24" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  )
}

// ─── Spinner ──────────────────────────────────────────────────────────────────

function Spinner({ size = 14 }) {
  return (
    <span style={{
      display: 'inline-block',
      width: size,
      height: size,
      border: `2px solid rgba(255,255,255,0.15)`,
      borderTopColor: '#a89fff',
      borderRadius: '50%',
      animation: 'spin 0.7s linear infinite',
      flexShrink: 0,
    }} />
  )
}

// ─── Sidebar Tree ─────────────────────────────────────────────────────────────

function SidebarTree({ tree, activeFolderId, onSelect }) {
  const [expanded, setExpanded] = useState({})

  const toggleExpand = useCallback((id) => {
    setExpanded(prev => ({ ...prev, [id]: !prev[id] }))
  }, [])

  const renderFolder = (folder, depth = 0) => {
    const hasChildren = folder.children && folder.children.length > 0
    const isExp = !!expanded[folder.id]
    const isActive = activeFolderId === folder.id
    const meta = folderMeta(folder.name)
    const indent = depth * 8

    return (
      <div key={folder.id}>
        <div
          onClick={() => onSelect(folder)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: `0 10px 0 ${10 + indent}px`,
            height: 32,
            cursor: 'pointer',
            background: isActive ? 'rgba(124,106,247,0.2)' : 'transparent',
            borderLeft: isActive ? '2px solid #a89fff' : '2px solid transparent',
            transition: 'background 0.1s',
            userSelect: 'none',
            boxSizing: 'border-box',
          }}
          onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'rgba(255,255,255,0.04)' }}
          onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent' }}
        >
          {/* Expand arrow */}
          <span
            onClick={e => { e.stopPropagation(); if (hasChildren) toggleExpand(folder.id) }}
            style={{
              fontSize: 8,
              color: hasChildren ? 'rgba(255,255,255,0.35)' : 'transparent',
              width: 10,
              flexShrink: 0,
              cursor: hasChildren ? 'pointer' : 'default',
              display: 'inline-block',
              transition: 'transform 0.15s',
              transform: hasChildren && isExp ? 'rotate(90deg)' : 'none',
            }}
          >
            ▶
          </span>

          {/* Folder icon */}
          <span style={{ flexShrink: 0, display: 'flex', alignItems: 'center' }}>
            <FolderIcon color={meta.color} size={20} />
          </span>

          {/* Name */}
          <span style={{
            fontSize: 12,
            color: isActive ? '#c4baff' : 'rgba(255,255,255,0.72)',
            fontWeight: isActive ? 500 : 400,
            flex: 1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {folder.name}
          </span>

          {/* File count badge */}
          {folder.file_count != null && folder.file_count > 0 && (
            <span style={{
              fontSize: 10,
              color: 'rgba(255,255,255,0.22)',
              flexShrink: 0,
              background: 'rgba(255,255,255,0.06)',
              borderRadius: 8,
              padding: '1px 5px',
            }}>
              {folder.file_count}
            </span>
          )}
        </div>

        {hasChildren && isExp && folder.children.map(child => renderFolder(child, depth + 1))}
      </div>
    )
  }

  return (
    <div style={{ paddingTop: 6, paddingBottom: 12 }}>
      <div style={{
        fontSize: 10,
        fontWeight: 700,
        color: 'rgba(255,255,255,0.2)',
        letterSpacing: '0.1em',
        padding: '0 12px',
        marginBottom: 4,
        marginTop: 8,
      }}>
        FILES
      </div>
      {tree.map(folder => renderFolder(folder))}
    </div>
  )
}

// ─── Breadcrumb ───────────────────────────────────────────────────────────────

function Breadcrumb({ path, onNavigate }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, minWidth: 0 }}>
      <span
        onClick={() => onNavigate(null)}
        style={{
          color: path && path.length > 0 ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.75)',
          cursor: 'pointer',
          whiteSpace: 'nowrap',
          fontWeight: path && path.length > 0 ? 400 : 500,
        }}
        onMouseEnter={e => { if (path && path.length > 0) e.currentTarget.style.color = 'rgba(255,255,255,0.65)' }}
        onMouseLeave={e => { if (path && path.length > 0) e.currentTarget.style.color = 'rgba(255,255,255,0.4)' }}
      >
        Files
      </span>
      {path && path.map((folder, i) => {
        const isLast = i === path.length - 1
        return (
          <span key={folder.id} style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
            <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: 11 }}>›</span>
            <span
              onClick={() => !isLast && onNavigate(folder.id)}
              style={{
                color: isLast ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.4)',
                cursor: isLast ? 'default' : 'pointer',
                fontWeight: isLast ? 500 : 400,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                maxWidth: 140,
              }}
              onMouseEnter={e => { if (!isLast) e.currentTarget.style.color = 'rgba(255,255,255,0.65)' }}
              onMouseLeave={e => { if (!isLast) e.currentTarget.style.color = 'rgba(255,255,255,0.4)' }}
            >
              {folder.name}
            </span>
          </span>
        )
      })}
    </div>
  )
}

// ─── Icon View ────────────────────────────────────────────────────────────────

function IconView({ folders, files, onFolderClick, isMobile, searchQuery, isRoot }) {
  const filteredFolders = folders.filter(f =>
    !searchQuery || f.name.toLowerCase().includes(searchQuery.toLowerCase())
  )
  const filteredFiles = files.filter(f =>
    !searchQuery || f.name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const minSize = isMobile ? 90 : 120

  if (filteredFolders.length === 0 && filteredFiles.length === 0) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: 280,
        gap: 10,
      }}>
        <div style={{ opacity: 0.18 }}>
          <FolderIcon color="#6B7280" size={48} />
        </div>
        <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 14 }}>
          {searchQuery ? 'No results for "' + searchQuery + '"' : 'This folder is empty'}
        </div>
      </div>
    )
  }

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: `repeat(auto-fill, minmax(${minSize}px, 1fr))`,
      gap: 16,
      padding: 24,
    }}>
      {filteredFolders.map(folder => {
        const meta = folderMeta(folder.name)
        return (
          <div
            key={folder.id}
            onClick={() => onFolderClick(folder)}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 8,
              padding: '14px 8px 12px',
              borderRadius: 10,
              cursor: 'pointer',
              transition: 'transform 0.12s, background 0.12s',
              userSelect: 'none',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.transform = 'scale(1.05)'
              e.currentTarget.style.background = 'rgba(255,255,255,0.05)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.transform = 'scale(1)'
              e.currentTarget.style.background = 'transparent'
            }}
          >
            <div style={{
              width: 80,
              height: 80,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}>
              <FolderIcon color={meta.color} size={64} />
            </div>
            <div style={{
              fontSize: 12,
              color: 'rgba(255,255,255,0.82)',
              textAlign: 'center',
              lineHeight: 1.35,
              wordBreak: 'break-word',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
              width: '100%',
            }}>
              {folder.name}
            </div>
            {folder.file_count != null && (
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)' }}>
                {folder.file_count} {folder.file_count === 1 ? 'file' : 'files'}
              </div>
            )}
          </div>
        )
      })}

      {isRoot && filteredFiles.length > 0 && filteredFolders.length > 0 && (
        <div style={{
          gridColumn: '1 / -1',
          paddingTop: 8,
          paddingBottom: 4,
          fontSize: 10,
          fontWeight: 700,
          color: 'rgba(255,255,255,0.22)',
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          borderTop: '1px solid rgba(255,255,255,0.06)',
        }}>
          Unorganized
        </div>
      )}

      {filteredFiles.map((file, idx) => {
        const hasThumb = !!file.thumbnail_url
        return (
          <div
            key={file.id || idx}
            onClick={() => file.drive_url && window.open(file.drive_url, '_blank')}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 8,
              padding: '14px 8px 12px',
              borderRadius: 10,
              cursor: file.drive_url ? 'pointer' : 'default',
              transition: 'transform 0.12s, background 0.12s',
              userSelect: 'none',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.transform = 'scale(1.05)'
              e.currentTarget.style.background = 'rgba(255,255,255,0.05)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.transform = 'scale(1)'
              e.currentTarget.style.background = 'transparent'
            }}
          >
            <div style={{
              width: 80,
              height: 80,
              borderRadius: 12,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              overflow: 'hidden',
            }}>
              {hasThumb ? (
                <img
                  src={file.thumbnail_url}
                  alt={file.name}
                  style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 12 }}
                  onError={e => {
                    e.currentTarget.style.display = 'none'
                    e.currentTarget.parentElement.innerHTML = ''
                    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
                    svg.setAttribute('width', '64')
                    svg.setAttribute('height', '64')
                    e.currentTarget.parentElement.appendChild(svg)
                  }}
                />
              ) : (
                <FileIcon mimeType={file.mime_type || ''} size={64} />
              )}
            </div>
            <div style={{
              fontSize: 11,
              color: 'rgba(255,255,255,0.65)',
              textAlign: 'center',
              lineHeight: 1.35,
              wordBreak: 'break-word',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
              width: '100%',
            }}>
              {file.name}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── List View ────────────────────────────────────────────────────────────────

function ListView({ folders, files, onFolderClick, searchQuery, isRoot }) {
  const [sortKey, setSortKey]   = useState('name')
  const [sortDir, setSortDir]   = useState('asc')

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const arrow = (key) => {
    if (sortKey !== key) return <span style={{ color: 'rgba(255,255,255,0.15)', marginLeft: 4 }}>↕</span>
    return <span style={{ color: '#a89fff', marginLeft: 4 }}>{sortDir === 'asc' ? '↑' : '↓'}</span>
  }

  const filteredFolders = folders.filter(f =>
    !searchQuery || f.name.toLowerCase().includes(searchQuery.toLowerCase())
  )
  const filteredFiles = files.filter(f =>
    !searchQuery || f.name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const sortedFiles = [...filteredFiles].sort((a, b) => {
    let va, vb
    if (sortKey === 'name')     { va = a.name || ''; vb = b.name || '' }
    if (sortKey === 'type')     { va = a.mime_type || ''; vb = b.mime_type || '' }
    if (sortKey === 'size')     { va = a.size_bytes || 0; vb = b.size_bytes || 0 }
    if (sortKey === 'modified') { va = a.modified_at || ''; vb = b.modified_at || '' }
    if (typeof va === 'string') {
      const c = va.localeCompare(vb)
      return sortDir === 'asc' ? c : -c
    }
    return sortDir === 'asc' ? va - vb : vb - va
  })

  const colStyle = {
    padding: '0 14px',
    fontSize: 11,
    fontWeight: 600,
    color: 'rgba(255,255,255,0.3)',
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    cursor: 'pointer',
    userSelect: 'none',
    whiteSpace: 'nowrap',
  }

  if (filteredFolders.length === 0 && filteredFiles.length === 0) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: 280,
        gap: 10,
      }}>
        <div style={{ opacity: 0.18 }}>
          <FolderIcon color="#6B7280" size={48} />
        </div>
        <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 14 }}>
          {searchQuery ? 'No results for "' + searchQuery + '"' : 'This folder is empty'}
        </div>
      </div>
    )
  }

  return (
    <div style={{ width: '100%' }}>
      {/* Header row */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 110px 90px 110px',
        height: 36,
        alignItems: 'center',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        position: 'sticky',
        top: 0,
        background: 'rgba(18,18,30,0.95)',
        backdropFilter: 'blur(8px)',
        zIndex: 2,
      }}>
        <span style={colStyle} onClick={() => handleSort('name')}>Name {arrow('name')}</span>
        <span style={colStyle} onClick={() => handleSort('type')}>Type {arrow('type')}</span>
        <span style={{ ...colStyle, textAlign: 'right' }} onClick={() => handleSort('size')}>Size {arrow('size')}</span>
        <span style={{ ...colStyle, textAlign: 'right' }} onClick={() => handleSort('modified')}>Modified {arrow('modified')}</span>
      </div>

      {/* Folder rows */}
      {filteredFolders.map(folder => {
        const meta = folderMeta(folder.name)
        return (
          <div
            key={folder.id}
            onClick={() => onFolderClick(folder)}
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 110px 90px 110px',
              height: 36,
              alignItems: 'center',
              cursor: 'pointer',
              borderLeft: `2px solid ${meta.color}`,
              transition: 'background 0.1s',
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 14px', minWidth: 0 }}>
              <span style={{ flexShrink: 0, display: 'flex', alignItems: 'center' }}>
                <FolderIcon color={meta.color} size={24} />
              </span>
              <span style={{
                fontSize: 13,
                color: 'rgba(255,255,255,0.82)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>
                {folder.name}
              </span>
            </div>
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', padding: '0 14px' }}>Folder</span>
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.25)', textAlign: 'right', padding: '0 14px' }}>
              {folder.file_count != null ? folder.file_count + ' items' : '—'}
            </span>
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.25)', textAlign: 'right', padding: '0 14px' }}>—</span>
          </div>
        )
      })}

      {/* Unorganized section header at root */}
      {isRoot && sortedFiles.length > 0 && filteredFolders.length > 0 && (
        <div style={{
          padding: '10px 14px 4px',
          fontSize: 10,
          fontWeight: 700,
          color: 'rgba(255,255,255,0.22)',
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          borderTop: '1px solid rgba(255,255,255,0.06)',
          marginTop: 4,
        }}>
          Unorganized
        </div>
      )}

      {/* File rows */}
      {sortedFiles.map((file, idx) => {
        return (
          <div
            key={file.id || idx}
            onClick={() => file.drive_url && window.open(file.drive_url, '_blank')}
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 110px 90px 110px',
              height: 36,
              alignItems: 'center',
              cursor: file.drive_url ? 'pointer' : 'default',
              borderLeft: '2px solid transparent',
              transition: 'background 0.1s',
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 14px', minWidth: 0 }}>
              <span style={{ flexShrink: 0, display: 'flex', alignItems: 'center' }}>
                <FileIcon mimeType={file.mime_type || ''} size={24} />
              </span>
              <span style={{
                fontSize: 13,
                color: 'rgba(255,255,255,0.75)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>
                {file.name}
              </span>
            </div>
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', padding: '0 14px' }}>
              {mimeLabel(file.mime_type)}
            </span>
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.25)', textAlign: 'right', padding: '0 14px' }}>
              {fmtSize(file.size_bytes)}
            </span>
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.25)', textAlign: 'right', padding: '0 14px' }}>
              {fmtDate(file.modified_at)}
            </span>
          </div>
        )
      })}
    </div>
  )
}

// ─── New Folder Input ─────────────────────────────────────────────────────────

function NewFolderInput({ onSubmit, onCancel }) {
  const [name, setName] = useState('')
  const inputRef = useRef(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const handleKey = (e) => {
    if (e.key === 'Enter' && name.trim()) onSubmit(name.trim())
    if (e.key === 'Escape') onCancel()
  }

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '12px 24px',
      borderBottom: '1px solid rgba(255,255,255,0.06)',
      background: 'rgba(124,106,247,0.06)',
    }}>
      <span style={{ display: 'flex', alignItems: 'center' }}>
        <FolderIcon color="#7C6AF7" size={24} />
      </span>
      <input
        ref={inputRef}
        value={name}
        onChange={e => setName(e.target.value)}
        onKeyDown={handleKey}
        placeholder="Folder name"
        style={{
          background: 'rgba(255,255,255,0.07)',
          border: '1px solid rgba(124,106,247,0.5)',
          borderRadius: 6,
          color: 'rgba(255,255,255,0.9)',
          fontSize: 13,
          padding: '6px 10px',
          outline: 'none',
          width: 200,
        }}
      />
      <button
        onClick={() => name.trim() && onSubmit(name.trim())}
        style={{
          background: 'rgba(124,106,247,0.25)',
          border: '1px solid rgba(124,106,247,0.5)',
          borderRadius: 6,
          color: '#c4baff',
          fontSize: 12,
          fontWeight: 500,
          padding: '6px 12px',
          cursor: 'pointer',
        }}
      >
        Create
      </button>
      <button
        onClick={onCancel}
        style={{
          background: 'transparent',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 6,
          color: 'rgba(255,255,255,0.4)',
          fontSize: 12,
          padding: '6px 10px',
          cursor: 'pointer',
        }}
      >
        Cancel
      </button>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function Files() {
  const isMobile = useIsMobile()

  // Tree / data state
  const [tree,           setTree]           = useState([])
  const [treeLoading,    setTreeLoading]    = useState(true)
  const [driveConnected, setDriveConnected] = useState(true)
  const [currentFolderId, setCurrentFolderId] = useState(null)   // null = root
  const [folderContents, setFolderContents] = useState({ folders: [], files: [] })
  const [contentsLoading, setContentsLoading] = useState(false)

  // Navigation history
  const [history, setHistory] = useState([null])   // stack of folder IDs
  const [historyIdx, setHistoryIdx] = useState(0)

  // UI state
  const [viewMode,        setViewMode]        = useState('icon')  // 'icon' | 'list'
  const [syncing,         setSyncing]         = useState(false)
  const [search,          setSearch]          = useState('')
  const [showNewFolder,   setShowNewFolder]   = useState(false)
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)

  // ── Load tree ──────────────────────────────────────────────────────────────

  const loadTree = useCallback(() => {
    setTreeLoading(true)
    driveGet('/drive/tree')
      .then(data => {
        const folders = Array.isArray(data) ? data : (data?.folders || data?.tree || [])
        setTree(folders)
        setDriveConnected(true)
      })
      .catch(err => {
        const msg = String(err?.message || '')
        if (msg.includes('401') || msg.includes('403')) {
          setDriveConnected(false)
        } else {
          setTree([])
          setDriveConnected(true)
        }
      })
      .finally(() => setTreeLoading(false))
  }, [])

  useEffect(() => { loadTree() }, [loadTree])

  // ── Load folder contents ───────────────────────────────────────────────────

  const loadContents = useCallback((folderId) => {
    setContentsLoading(true)
    const path = folderId ? `/drive/files?folder_id=${folderId}` : '/drive/files'
    driveGet(path)
      .then(data => {
        // API returns array of files, or { folders, files }
        if (Array.isArray(data)) {
          setFolderContents({ folders: [], files: data })
        } else {
          setFolderContents({
            folders: data?.folders || [],
            files:   data?.files   || [],
          })
        }
      })
      .catch(() => setFolderContents({ folders: [], files: [] }))
      .finally(() => setContentsLoading(false))
  }, [])

  // When tree loads and we're at root, show top-level folders in content area
  useEffect(() => {
    if (!treeLoading && currentFolderId === null) {
      // Show tree root folders as "folders" and any unorganized files
      setContentsLoading(true)
      driveGet('/drive/tree')
        .then(data => {
          const topFolders = Array.isArray(data) ? data : (data?.folders || data?.tree || [])
          const unorganized = Array.isArray(data) ? [] : (data?.unorganized || [])
          setFolderContents({ folders: topFolders, files: unorganized })
        })
        .catch(() => {})
        .finally(() => setContentsLoading(false))
    }
  }, [treeLoading, currentFolderId])

  useEffect(() => {
    if (currentFolderId !== null) {
      loadContents(currentFolderId)
    }
  }, [currentFolderId, loadContents])

  // ── Navigation ─────────────────────────────────────────────────────────────

  const navigateTo = useCallback((folderId) => {
    setCurrentFolderId(folderId)
    setSearch('')
    setShowNewFolder(false)
    setHistory(prev => {
      const newHistory = [...prev.slice(0, historyIdx + 1), folderId]
      setHistoryIdx(newHistory.length - 1)
      return newHistory
    })
  }, [historyIdx])

  const goBack = () => {
    if (historyIdx > 0) {
      const newIdx = historyIdx - 1
      setHistoryIdx(newIdx)
      setCurrentFolderId(history[newIdx])
      setSearch('')
      setShowNewFolder(false)
    }
  }

  const goForward = () => {
    if (historyIdx < history.length - 1) {
      const newIdx = historyIdx + 1
      setHistoryIdx(newIdx)
      setCurrentFolderId(history[newIdx])
      setSearch('')
      setShowNewFolder(false)
    }
  }

  const canGoBack    = historyIdx > 0
  const canGoForward = historyIdx < history.length - 1

  // ── Breadcrumb path ────────────────────────────────────────────────────────

  const breadcrumbPath = currentFolderId
    ? findFolderPath(tree, currentFolderId) || []
    : []

  // ── Sync ──────────────────────────────────────────────────────────────────

  const handleSync = () => {
    setSyncing(true)
    drivePost('/drive/sync', {})
      .then(() => {
        // Poll for 3s then stop spinner and reload
        setTimeout(() => {
          setSyncing(false)
          loadTree()
          if (currentFolderId !== null) loadContents(currentFolderId)
        }, 3000)
      })
      .catch(() => setSyncing(false))
  }

  // ── New Folder ─────────────────────────────────────────────────────────────

  const handleCreateFolder = (name) => {
    const body = { name, ...(currentFolderId ? { parent_id: currentFolderId } : {}) }
    drivePost('/drive/folders', body)
      .then(() => {
        setShowNewFolder(false)
        loadTree()
        if (currentFolderId !== null) {
          loadContents(currentFolderId)
        } else {
          // Reload root
          setContentsLoading(true)
          driveGet('/drive/tree').then(data => {
            const topFolders = Array.isArray(data) ? data : (data?.folders || data?.tree || [])
            const unorganized = Array.isArray(data) ? [] : (data?.unorganized || [])
            setFolderContents({ folders: topFolders, files: unorganized })
          }).catch(() => {}).finally(() => setContentsLoading(false))
        }
      })
      .catch(() => setShowNewFolder(false))
  }

  // ── Not connected ──────────────────────────────────────────────────────────

  if (!driveConnected) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        gap: 16,
        padding: 40,
      }}>
        <div style={{ fontSize: 40, opacity: 0.18 }}>☁</div>
        <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 15, fontWeight: 500 }}>
          Connect Google Drive in Integrations to sync files
        </div>
        <button
          onClick={() => window.dispatchEvent(new CustomEvent('navigate', { detail: 'integrations' }))}
          style={{
            background: 'rgba(124,106,247,0.15)',
            border: '1px solid rgba(124,106,247,0.35)',
            color: '#a89fff',
            padding: '9px 20px',
            borderRadius: 8,
            fontSize: 13,
            cursor: 'pointer',
            fontWeight: 500,
          }}
          onMouseEnter={e => e.currentTarget.style.background = 'rgba(124,106,247,0.25)'}
          onMouseLeave={e => e.currentTarget.style.background = 'rgba(124,106,247,0.15)'}
        >
          Go to Integrations
        </button>
      </div>
    )
  }

  // ── Status bar text ────────────────────────────────────────────────────────

  const statusText = (() => {
    const fc = folderContents.folders.length
    const fl = folderContents.files.length
    const parts = []
    if (fc > 0) parts.push(`${fc} ${fc === 1 ? 'folder' : 'folders'}`)
    if (fl > 0) parts.push(`${fl} ${fl === 1 ? 'file' : 'files'}`)
    return parts.length > 0 ? parts.join(', ') : 'Empty'
  })()

  // ── Render ─────────────────────────────────────────────────────────────────

  const navBtnStyle = (enabled) => ({
    background: 'transparent',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 6,
    color: enabled ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.18)',
    width: 28,
    height: 28,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 14,
    cursor: enabled ? 'pointer' : 'default',
    flexShrink: 0,
    transition: 'background 0.1s, color 0.1s',
  })

  const viewToggleStyle = (active) => ({
    background: active ? 'rgba(124,106,247,0.25)' : 'transparent',
    border: '1px solid ' + (active ? 'rgba(124,106,247,0.5)' : 'rgba(255,255,255,0.1)'),
    borderRadius: 6,
    color: active ? '#c4baff' : 'rgba(255,255,255,0.4)',
    width: 28,
    height: 28,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 14,
    cursor: 'pointer',
    transition: 'all 0.1s',
  })

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      overflow: 'hidden',
      boxSizing: 'border-box',
    }}>

      {/* ── Toolbar ───────────────────────────────────────────────────────── */}
      <div style={{
        height: 48,
        flexShrink: 0,
        background: 'rgba(18,18,30,0.9)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '0 14px',
        boxSizing: 'border-box',
      }}>

        {/* Mobile: hamburger */}
        {isMobile && (
          <button
            onClick={() => setMobileSidebarOpen(true)}
            style={{
              background: 'transparent',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 6,
              color: 'rgba(255,255,255,0.55)',
              width: 28,
              height: 28,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 14,
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            ☰
          </button>
        )}

        {/* Back / Forward */}
        <button
          onClick={goBack}
          disabled={!canGoBack}
          style={navBtnStyle(canGoBack)}
          onMouseEnter={e => { if (canGoBack) e.currentTarget.style.background = 'rgba(255,255,255,0.07)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
        >
          ←
        </button>
        <button
          onClick={goForward}
          disabled={!canGoForward}
          style={navBtnStyle(canGoForward)}
          onMouseEnter={e => { if (canGoForward) e.currentTarget.style.background = 'rgba(255,255,255,0.07)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
        >
          →
        </button>

        {/* Breadcrumb */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <Breadcrumb path={breadcrumbPath} onNavigate={navigateTo} />
        </div>

        {/* Search */}
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search…"
            style={{
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 7,
              color: 'rgba(255,255,255,0.8)',
              fontSize: 12,
              padding: '5px 26px 5px 10px',
              outline: 'none',
              width: isMobile ? 100 : 160,
              transition: 'border-color 0.15s',
            }}
            onFocus={e => e.currentTarget.style.borderColor = 'rgba(124,106,247,0.5)'}
            onBlur={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'}
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              style={{
                position: 'absolute',
                right: 6,
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'transparent',
                border: 'none',
                color: 'rgba(255,255,255,0.35)',
                cursor: 'pointer',
                fontSize: 12,
                padding: 0,
                lineHeight: 1,
              }}
            >
              ×
            </button>
          )}
        </div>

        {/* View toggle */}
        {!isMobile && (
          <>
            <button
              onClick={() => setViewMode('icon')}
              style={viewToggleStyle(viewMode === 'icon')}
              title="Icon view"
            >
              ⊞
            </button>
            <button
              onClick={() => setViewMode('list')}
              style={viewToggleStyle(viewMode === 'list')}
              title="List view"
            >
              ≡
            </button>
          </>
        )}

        {/* New Folder */}
        <button
          onClick={() => setShowNewFolder(v => !v)}
          style={{
            background: showNewFolder ? 'rgba(124,106,247,0.2)' : 'rgba(255,255,255,0.05)',
            border: '1px solid ' + (showNewFolder ? 'rgba(124,106,247,0.45)' : 'rgba(255,255,255,0.1)'),
            borderRadius: 6,
            color: showNewFolder ? '#c4baff' : 'rgba(255,255,255,0.5)',
            fontSize: 12,
            fontWeight: 500,
            padding: '0 10px',
            height: 28,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
            transition: 'all 0.1s',
            flexShrink: 0,
          }}
          onMouseEnter={e => { if (!showNewFolder) e.currentTarget.style.background = 'rgba(255,255,255,0.09)' }}
          onMouseLeave={e => { if (!showNewFolder) e.currentTarget.style.background = 'rgba(255,255,255,0.05)' }}
        >
          + Folder
        </button>

        {/* Sync */}
        <button
          onClick={handleSync}
          disabled={syncing}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            background: syncing ? 'rgba(124,106,247,0.08)' : 'rgba(124,106,247,0.14)',
            border: '1px solid rgba(124,106,247,0.3)',
            borderRadius: 6,
            color: syncing ? 'rgba(168,159,255,0.5)' : '#a89fff',
            fontSize: 12,
            fontWeight: 500,
            padding: '0 11px',
            height: 28,
            cursor: syncing ? 'not-allowed' : 'pointer',
            whiteSpace: 'nowrap',
            flexShrink: 0,
            transition: 'background 0.1s',
          }}
          onMouseEnter={e => { if (!syncing) e.currentTarget.style.background = 'rgba(124,106,247,0.22)' }}
          onMouseLeave={e => { if (!syncing) e.currentTarget.style.background = 'rgba(124,106,247,0.14)' }}
        >
          {syncing ? <Spinner size={12} /> : <span style={{ fontSize: 13 }}>↻</span>}
          {isMobile ? '' : (syncing ? ' Syncing…' : ' Sync')}
        </button>
      </div>

      {/* ── Body ──────────────────────────────────────────────────────────── */}
      <div style={{
        flex: 1,
        display: 'flex',
        minHeight: 0,
        overflow: 'hidden',
      }}>

        {/* Sidebar — desktop only */}
        {!isMobile && (
          <div style={{
            width: 240,
            flexShrink: 0,
            background: 'rgba(12,12,22,0.8)',
            borderRight: '1px solid rgba(255,255,255,0.06)',
            overflowY: 'auto',
            boxSizing: 'border-box',
          }}>
            {treeLoading ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 80 }}>
                <Spinner />
              </div>
            ) : tree.length === 0 ? (
              <div style={{ padding: 20, color: 'rgba(255,255,255,0.2)', fontSize: 12, textAlign: 'center', lineHeight: 1.6 }}>
                No folders synced yet
              </div>
            ) : (
              <SidebarTree
                tree={tree}
                activeFolderId={currentFolderId}
                onSelect={folder => navigateTo(folder.id)}
              />
            )}
          </div>
        )}

        {/* Content area */}
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          background: 'rgba(18,18,30,0.6)',
          minWidth: 0,
          overflow: 'hidden',
        }}>

          {/* New folder input */}
          {showNewFolder && (
            <NewFolderInput
              onSubmit={handleCreateFolder}
              onCancel={() => setShowNewFolder(false)}
            />
          )}

          {/* Scrollable content */}
          <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
            {contentsLoading || treeLoading ? (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: 240,
                gap: 10,
              }}>
                <Spinner size={18} />
                <span style={{ color: 'rgba(255,255,255,0.25)', fontSize: 13 }}>Loading…</span>
              </div>
            ) : tree.length === 0 ? (
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                height: 280,
                gap: 12,
              }}>
                <div style={{ fontSize: 40, opacity: 0.12 }}>☁</div>
                <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: 15, fontWeight: 500 }}>
                  No Drive files synced yet
                </div>
                <div style={{ color: 'rgba(255,255,255,0.22)', fontSize: 13 }}>
                  Click Sync to import your Google Drive files
                </div>
                <button
                  onClick={handleSync}
                  disabled={syncing}
                  style={{
                    marginTop: 4,
                    background: 'rgba(124,106,247,0.15)',
                    border: '1px solid rgba(124,106,247,0.35)',
                    borderRadius: 8,
                    color: '#a89fff',
                    fontSize: 13,
                    fontWeight: 500,
                    padding: '9px 20px',
                    cursor: syncing ? 'not-allowed' : 'pointer',
                  }}
                >
                  {syncing ? 'Syncing…' : 'Sync Drive'}
                </button>
              </div>
            ) : viewMode === 'icon' ? (
              <IconView
                folders={folderContents.folders}
                files={folderContents.files}
                onFolderClick={folder => navigateTo(folder.id)}
                isMobile={isMobile}
                searchQuery={search}
                isRoot={currentFolderId === null}
              />
            ) : (
              <ListView
                folders={folderContents.folders}
                files={folderContents.files}
                onFolderClick={folder => navigateTo(folder.id)}
                searchQuery={search}
                isRoot={currentFolderId === null}
              />
            )}
          </div>

          {/* Status bar */}
          <div style={{
            height: 28,
            flexShrink: 0,
            borderTop: '1px solid rgba(255,255,255,0.06)',
            display: 'flex',
            alignItems: 'center',
            padding: '0 16px',
            background: 'rgba(12,12,22,0.6)',
          }}>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.22)' }}>
              {contentsLoading ? 'Loading…' : statusText}
            </span>
          </div>
        </div>
      </div>

      {/* ── Mobile sidebar bottom sheet ────────────────────────────────── */}
      {isMobile && mobileSidebarOpen && (
        <>
          <div
            onClick={() => setMobileSidebarOpen(false)}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.55)',
              backdropFilter: 'blur(4px)',
              WebkitBackdropFilter: 'blur(4px)',
              zIndex: 500,
            }}
          />
          <div style={{
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            zIndex: 501,
            background: 'rgba(12,12,20,0.97)',
            backdropFilter: 'blur(24px)',
            WebkitBackdropFilter: 'blur(24px)',
            borderTop: '1px solid rgba(255,255,255,0.12)',
            borderRadius: '16px 16px 0 0',
            maxHeight: '72vh',
            overflowY: 'auto',
            paddingBottom: 'env(safe-area-inset-bottom, 16px)',
          }}>
            <div style={{
              position: 'sticky',
              top: 0,
              background: 'rgba(12,12,20,0.97)',
              padding: '14px 16px 10px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              borderBottom: '1px solid rgba(255,255,255,0.07)',
            }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: 'rgba(255,255,255,0.85)' }}>
                Folders
              </span>
              <button
                onClick={() => setMobileSidebarOpen(false)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'rgba(255,255,255,0.5)',
                  fontSize: 20,
                  cursor: 'pointer',
                  padding: 0,
                  lineHeight: 1,
                }}
              >
                ✕
              </button>
            </div>
            <SidebarTree
              tree={tree}
              activeFolderId={currentFolderId}
              onSelect={folder => {
                navigateTo(folder.id)
                setMobileSidebarOpen(false)
              }}
            />
          </div>
        </>
      )}

      {/* Global keyframes */}
      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}
